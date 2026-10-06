import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerFromProvider, openRouterAccountMetadata } from './ai-provider';
import { configuredModel, readAiConfig } from './ai-registry';

const directory = mkdtempSync(join(tmpdir(), 'galaxy-router-'));
const path = join(directory, 'providers.json');
const envPath = join(directory, 'keys.env');
writeFileSync(envPath, 'OPENROUTER_API_KEY="synthetic-openrouter"\n', {
  mode: 0o600,
});
writeFileSync(
  path,
  JSON.stringify({
    providers: {
      openrouter: {
        revision: 'r1',
        enabled: true,
        replacementConfirmed: true,
        costMode: 'FREE_ONLY',
        dataPolicy: 'SYNTHETIC_PUBLIC_APPROVED',
      },
    },
    credentialSource: { mode: 'env', path: envPath },
  }),
  { mode: 0o600 },
);
const config = () =>
  configuredModel(
    readAiConfig({ GALAXY_AI_CONFIG_FILE: path }),
    'openrouter/free',
  );
const catalogue = {
  data: [
    {
      id: 'openrouter/free',
      architecture: { input_modalities: ['text'], output_modalities: ['text'] },
      pricing: { prompt: '0', completion: '0', request: '0' },
    },
  ],
};
const output = {
  id: 'gen-public-1',
  provider: 'Free Supplier',
  model: 'supplier/actual:free',
  choices: [
    {
      finish_reason: 'stop',
      message: { content: 'Bản dịch công khai.', reasoning: 'DO_NOT_DISPLAY' },
    },
  ],
  usage: {
    prompt_tokens: 12,
    completion_tokens: 6,
    cost: 0,
    cost_details: { upstream_inference_cost: 0 },
  },
};
const ask = (sources: { handle: string; text: string }[] = [], options = {}) =>
  answerFromProvider(
    config(),
    'Dịch câu công khai.',
    sources,
    new AbortController().signal,
    options,
  );
afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('sends text with FREE_ONLY/privacy locks and preserves actual model, gateway, provider and sourced cost', async () => {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    expect(init.redirect).toBe('error');
    if (url === 'https://openrouter.ai/api/v1/models') {
      expect(init.headers ?? {}).not.toHaveProperty('Authorization');
      return new Response(JSON.stringify(catalogue));
    }
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer synthetic-openrouter',
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: 'openrouter/free',
      stream: false,
      provider: {
        max_price: { prompt: 0, completion: 0, request: 0 },
        data_collection: 'deny',
      },
      reasoning: { exclude: true },
    });
    for (const field of ['plugins', 'tools', 'models', 'route', 'usage'])
      expect(body).not.toHaveProperty(field);
    expect(body.provider).not.toHaveProperty('byok');
    expect(body.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Dịch câu công khai.',
    });
    expect(body.messages).toContainEqual({
      role: 'assistant',
      content: 'Câu trước.',
    });
    return new Response(JSON.stringify(output));
  });
  const result = await ask([], {
    history: [{ question: 'Câu hỏi trước.', answer: 'Câu trước.' }],
  });
  expect(result).toMatchObject({
    answer: 'Bản dịch công khai.',
    citations: [],
    requestedModel: 'openrouter/free',
    returnedModel: 'supplier/actual:free',
    gatewayRequestId: 'gen-public-1',
    upstreamProvider: 'Free Supplier',
    cost: {
      status: 'KNOWN',
      value: 0,
      source: 'usage.cost',
      details: { upstream_inference_cost: 0 },
    },
    usage: { input_tokens: 12, output_tokens: 6 },
  });
  expect(JSON.stringify(result)).not.toContain('DO_NOT_DISPLAY');
});
it('gửi nguồn Project và kiểm citation, giữ FREE_ONLY/privacy', async () => {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(catalogue));
    const body = JSON.parse(String(init.body));
    expect(JSON.stringify(body.messages)).toContain('MATERIAL-A-682');
    expect(body.provider).toEqual({
      max_price: { prompt: 0, completion: 0, request: 0 },
      data_collection: 'deny',
      require_parameters: true,
    });
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'project_answer',
        strict: true,
        schema: {
          required: ['answer', 'citations', 'uncertainty'],
          properties: {
            answer: { minLength: 1, maxLength: 16000 },
            citations: { minItems: 1, maxItems: 12, items: { enum: ['S1'] } },
            uncertainty: { maxLength: 4000 },
          },
        },
      },
    });
    return new Response(
      JSON.stringify({
        ...output,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                answer: 'MATERIAL-A-682',
                citations: ['S1'],
                uncertainty: '',
              }),
            },
          },
        ],
      }),
    );
  });
  expect(await ask([{ handle: 'S1', text: 'MATERIAL-A-682' }])).toMatchObject({
    answer: 'MATERIAL-A-682',
    citations: ['S1'],
  });
});
it('denies non-router model overrides before transport', async () => {
  const transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  for (const model of [
    'openrouter/auto',
    'paid/model',
    'openrouter/free:online',
  ]) {
    await expect(
      answerFromProvider(
        { ...config(), model } as ReturnType<typeof config>,
        'Hi',
        [],
        new AbortController().signal,
      ),
    ).rejects.toThrow('INVALID_CONFIG');
  }
  expect(transport).not.toHaveBeenCalled();
});
it('ánh xạ PNG bytes thành image_url data URI, không bật plugin/PDF/paid', async () => {
  const bytes = Buffer.from('png-fixture');
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (url.endsWith('/models'))
      return new Response(
        JSON.stringify({
          data: [
            {
              ...catalogue.data[0],
              architecture: {
                input_modalities: ['text', 'image'],
                output_modalities: ['text'],
              },
            },
          ],
        }),
      );
    const body = JSON.parse(String(init.body));
    expect(body.messages.at(-1).content).toContainEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` },
    });
    expect(body).not.toHaveProperty('plugins');
    return new Response(
      JSON.stringify({
        ...output,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                answer: 'Ảnh màu xanh.',
                citations: ['S1'],
                uncertainty: '',
              }),
            },
          },
        ],
      }),
    );
  });
  expect(
    (
      await ask([{ handle: 'S1', text: 'Ảnh người dùng' }], {
        media: [{ handle: 'S1', mime: 'image/png', bytes }],
      })
    ).citations,
  ).toEqual(['S1']);
});
it('fails closed on paid or missing text catalogue, then rechecks expired catalogue before a retry', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
  const posts: string[] = [];
  let current: unknown = {
    data: [
      { ...catalogue.data[0], pricing: { prompt: '0.01', completion: '0' } },
    ],
  };
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify(current));
    posts.push(url);
    return new Response(JSON.stringify(output));
  });
  await expect(ask()).rejects.toThrow('FREE_CATALOGUE_UNVERIFIED');
  current = {
    data: [
      {
        ...catalogue.data[0],
        architecture: {
          input_modalities: ['image'],
          output_modalities: ['text'],
        },
      },
    ],
  };
  await expect(ask()).rejects.toThrow('FREE_CATALOGUE_UNVERIFIED');
  current = catalogue;
  await expect(ask()).resolves.toMatchObject({ answer: 'Bản dịch công khai.' });
  vi.advanceTimersByTime(60_001);
  current = { data: [] };
  await expect(ask()).rejects.toThrow('FREE_CATALOGUE_UNVERIFIED');
  expect(posts).toHaveLength(1);
});
it.each([
  {
    ...output,
    choices: [
      { finish_reason: 'stop', message: { content: '', reasoning: 'thought' } },
    ],
  },
  { ...output, error: { message: 'private-vendor-error' } },
  {
    ...output,
    choices: [
      {
        finish_reason: 'stop',
        message: { content: ' ', tool_calls: [{ id: 'tool' }] },
      },
    ],
  },
])('rejects 200 error/empty/tool output as failure', async (body) => {
  vi.stubGlobal(
    'fetch',
    async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/models') ? catalogue : body)),
  );
  await expect(ask()).rejects.toThrow();
});
it('cost missing is UNKNOWN and unexpected nonzero cost retains failure evidence', async () => {
  let body: unknown = {
    ...output,
    usage: { prompt_tokens: 12, completion_tokens: 6 },
  };
  vi.stubGlobal(
    'fetch',
    async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/models') ? catalogue : body)),
  );
  await expect(ask()).resolves.toMatchObject({
    cost: { status: 'UNKNOWN', value: null },
  });
  body = { ...output, usage: { ...output.usage, cost: 0.002 } };
  await expect(ask()).rejects.toMatchObject({
    code: 'FREE_ONLY_COST_VIOLATION',
    providerEvidence: {
      returnedModel: 'supplier/actual:free',
      gatewayRequestId: 'gen-public-1',
      cost: { status: 'KNOWN', value: 0.002 },
    },
  });
});

it('reported upstream cost outside zero fails even when total cost is missing', async () => {
  vi.stubGlobal(
    'fetch',
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/models')
            ? catalogue
            : {
                ...output,
                usage: {
                  prompt_tokens: 12,
                  completion_tokens: 6,
                  cost_details: { upstream_inference_cost: 0.01 },
                },
              },
        ),
      ),
  );
  await expect(ask()).rejects.toMatchObject({
    code: 'FREE_ONLY_COST_VIOLATION',
    providerEvidence: {
      cost: {
        status: 'UNKNOWN',
        value: null,
        details: { upstream_inference_cost: 0.01 },
      },
    },
  });
});

it('inspects charge before rejecting malformed/error envelope', async () => {
  vi.stubGlobal(
    'fetch',
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/models')
            ? catalogue
            : { error: { message: 'private error' }, usage: { cost: 0.1 } },
        ),
      ),
  );
  await expect(ask()).rejects.toMatchObject({
    code: 'FREE_ONLY_COST_VIOLATION',
    providerEvidence: { cost: { status: 'KNOWN', value: 0.1 } },
  });
});
it('returns only documented read-only key limit metadata and strips sensitive labels', async () => {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    expect(url).toBe('https://openrouter.ai/api/v1/key');
    expect(init.redirect).toBe('error');
    return new Response(
      JSON.stringify({
        data: {
          label: 'SECRET_LABEL',
          hash: 'SECRET_HASH',
          limit: null,
          limit_remaining: null,
          limit_reset: null,
          is_free_tier: true,
          free_model_daily_requests: { used: 2, limit: 50, remaining: 48 },
        },
      }),
    );
  });
  expect(
    await openRouterAccountMetadata(config(), new AbortController().signal),
  ).toEqual({
    limit: null,
    limit_remaining: null,
    limit_reset: null,
    is_free_tier: true,
    free_model_daily_requests: { used: 2, limit: 50, remaining: 48 },
  });
});

it('documented null cost details do not become a charge or a response failure', async () => {
  vi.stubGlobal(
    'fetch',
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/models')
            ? catalogue
            : {
                ...output,
                usage: {
                  ...output.usage,
                  cost_details: { upstream_inference_cost: null },
                },
              },
        ),
      ),
  );
  await expect(ask()).resolves.toMatchObject({
    cost: {
      status: 'KNOWN',
      value: 0,
      details: { upstream_inference_cost: null },
    },
  });
});
it.each([
  [
    {
      error: {
        metadata: {
          error_type: 'rate_limit_exceeded',
          limit_source: 'openrouter_key_limit',
        },
      },
    },
    {},
    'OPENROUTER',
  ],
  [
    {
      error: {
        metadata: { provider_code: '429', message: 'PRIVATE_UPSTREAM' },
      },
    },
    {},
    'UPSTREAM',
  ],
  [{ error: { message: 'PRIVATE_UNKNOWN' } }, {}, 'UNKNOWN'],
  [
    {},
    {
      'X-RateLimit-Limit': '50',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': '12345',
    },
    'OPENROUTER',
  ],
] as const)(
  'keeps sanitized documented rate-limit source without inferring quota/reset',
  async (body, headers, source) => {
    vi.stubGlobal(
      'fetch',
      async (url: string) =>
        new Response(
          JSON.stringify(url.endsWith('/models') ? catalogue : body),
          url.endsWith('/models') ? {} : { status: 429, headers },
        ),
    );
    try {
      await ask();
      throw new Error('expected rate limit');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'RATE_LIMITED_UNKNOWN',
        upstream: { limitSource: source },
      });
      expect(JSON.stringify(error)).not.toContain('PRIVATE_');
      if ('X-RateLimit-Limit' in headers)
        expect(error).toMatchObject({
          upstream: { rateLimit: { limit: 50, remaining: 0, reset: 12345 } },
        });
    }
  },
);
