import { afterEach, expect, it, vi } from 'vitest';
import { answerFromProvider } from './ai-provider';
import { AI_MODELS, AiError, configuredModel } from './ai-registry';
const sources = [
  { handle: 'S1', text: 'Mẫu công khai GH-42 rộng 900 mm, chưa được duyệt.' },
];
const final = JSON.stringify({
  answer: 'GH-42 rộng 900 mm; chưa được duyệt.',
  citations: ['S1'],
  uncertainty: 'Chỉ nguồn mẫu.',
});
const config = (id: string) => {
  const m = AI_MODELS.find((m) => m.id === id)!;
  return configuredModel(
    {
      [m.provider]: {
        revision: 'r1',
        [m.keyName]: 'synthetic-' + m.provider,
        replacementConfirmed: true,
        enabled: true,
        dataPolicy: 'SYNTHETIC_PUBLIC_APPROVED',
        maxOutputTokens: 8192,
      },
    },
    id,
  );
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('retry503 hữu hạn trong cùng model, kiểm quyền trước mỗi outbound', async () => {
  vi.useFakeTimers();
  let attempts = 0;
  const bodies: string[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    attempts++;
    bodies.push(String(init.body));
    return new Response('{}', { status: 503 });
  });
  let gates = 0;
  const result = answerFromProvider(
    config('gemini-3.8-flash'),
    'GH-42?',
    sources,
    new AbortController().signal,
    {
      beforeAttempt: async () => {
        gates++;
      },
    },
  );
  const check = expect(result).rejects.toMatchObject({
    code: 'TEMPORARY_ERROR',
    httpStatus: 503,
  });
  await Promise.all([vi.runAllTimersAsync(), check]);
  expect(attempts).toBe(3);
  expect(gates).toBe(3);
  expect(new Set(bodies).size).toBe(1);
});
it('thu hồi trong backoff chặn lượt gửi kế tiếp', async () => {
  vi.useFakeTimers();
  let attempts = 0,
    gates = 0;
  vi.stubGlobal('fetch', async () => {
    attempts++;
    return new Response('{}', { status: 503 });
  });
  const result = answerFromProvider(
    config('gemini-3.8-flash'),
    'GH-42?',
    sources,
    new AbortController().signal,
    {
      beforeAttempt: async () => {
        if (++gates > 1) throw new AiError('ACCESS_REVOKED');
      },
    },
  );
  const check = expect(result).rejects.toThrow('ACCESS_REVOKED');
  await Promise.all([vi.runAllTimersAsync(), check]);
  expect(attempts).toBe(1);
});
it.each([
  [503, {}, '120', 'TEMPORARY_ERROR'],
  [429, { code: '1300', type: 'rate_limited' }, null, 'RATE_LIMITED_UNKNOWN'],
  [429, { error: { code: 'insufficient_quota' } }, '1', 'QUOTA_EXHAUSTED'],
  [402, {}, null, 'BILLING_ACTION_REQUIRED'],
])(
  'không retry sớm quá Retry-After hoặc quota không rõ/dài hạn (%i)',
  async (status, body, retryAfter, code) => {
    let attempts = 0;
    vi.stubGlobal('fetch', async () => {
      attempts++;
      return new Response(JSON.stringify(body), {
        status: Number(status),
        headers: retryAfter ? { 'Retry-After': String(retryAfter) } : {},
      });
    });
    await expect(
      answerFromProvider(
        config('mistral-medium-3-5'),
        'GH-42?',
        sources,
        new AbortController().signal,
        { beforeAttempt: async () => {} },
      ),
    ).rejects.toMatchObject({ code, httpStatus: status });
    expect(attempts).toBe(1);
  },
);
it.each(AI_MODELS.filter((model) => model.provider !== 'openrouter'))(
  'maps $provider endpoint, secret and final-only response with real usage',
  async (model) => {
    const fetcher = vi.fn(async (url, init) => {
      expect(url).toBe(model.endpoint);
      expect(init.redirect).toBe('error');
      const body = JSON.parse(init.body);
      expect(body.model).toBe(model.id);
      expect(body.tools).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('synthetic-');
      if (model.provider === 'google_gemini') {
        expect(init.headers['x-goog-api-key']).toBe('synthetic-google_gemini');
        expect(body).toMatchObject({
          store: false,
          stream: false,
          generation_config: { thinking_level: 'high' },
        });
        expect(body.previous_interaction_id).toBeUndefined();
        return new Response(
          JSON.stringify({
            status: 'completed',
            model: model.id,
            steps: [
              {
                type: 'thought',
                summary: [{ type: 'text', text: 'RAW_INTERNAL' }],
              },
              {
                type: 'model_output',
                content: [{ type: 'text', text: final }],
              },
            ],
            usage: {
              total_input_tokens: 45,
              total_output_tokens: 23,
              total_thought_tokens: 7,
            },
          }),
        );
      }
      expect(init.headers.Authorization).toBe(
        'Bearer synthetic-' + model.provider,
      );
      expect(body.stream).toBe(false);
      if (model.provider === 'mistral')
        expect(body.reasoning_effort).toBe('high');
      else {
        expect(body.reasoning_effort).toBeUndefined();
        expect(body.response_format).toBeUndefined();
      }
      return new Response(
        JSON.stringify({
          model: model.id,
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content:
                  model.provider === 'mistral'
                    ? [
                        {
                          type: 'thinking',
                          thinking: [{ type: 'text', text: 'RAW_INTERNAL' }],
                        },
                        { type: 'text', text: final },
                      ]
                    : final,
                reasoning_content: 'RAW_INTERNAL',
              },
            },
          ],
          usage: { prompt_tokens: 45, completion_tokens: 23 },
        }),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await answerFromProvider(
      config(model.id),
      'GH-42?',
      sources,
      new AbortController().signal,
      { reasoning: model.provider === 'kira' ? 'default' : 'high' },
    );
    expect(result).toMatchObject({
      answer: 'GH-42 rộng 900 mm; chưa được duyệt.',
      requestedModel: model.id,
      returnedModel: model.id,
      usage: { input_tokens: 45, output_tokens: 23 },
    });
    expect(JSON.stringify(result)).not.toContain('RAW_INTERNAL');
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([
  [401, 'INVALID_CREDENTIAL'],
  [403, 'PROVIDER_FORBIDDEN'],
  [404, 'MODEL_NOT_AVAILABLE'],
  [429, 'RATE_LIMITED_UNKNOWN'],
  [503, 'TEMPORARY_ERROR'],
])('classifies %i without leaking response or retry', async (status, code) => {
  const fetcher = vi.fn(
    async () =>
      new Response('private key or provider body', { status: Number(status) }),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(
    answerFromProvider(
      config('kira-3.5-pro'),
      'GH-42?',
      sources,
      new AbortController().signal,
    ),
  ).rejects.toThrow(String(code));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects wrong effort, host, tools/incomplete output and raw files for text-only before transport', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(
    answerFromProvider(
      config('mistral-medium-3-5'),
      'GH-42?',
      sources,
      new AbortController().signal,
      { reasoning: 'medium' },
    ),
  ).rejects.toThrow('UNSUPPORTED_REASONING');
  await expect(
    answerFromProvider(
      Object.assign(config('kira-3.5-pro'), {
        endpoint: 'https://evil.example',
      }),
      'GH-42?',
      sources,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  await expect(
    answerFromProvider(
      config('kira-3.5-pro'),
      'GH-42?',
      sources,
      new AbortController().signal,
      {
        media: [
          { handle: 'S1', mime: 'image/png', bytes: Buffer.from('wrong') },
        ],
      },
    ),
  ).rejects.toThrow('UNSUPPORTED_FILE');
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects unknown citations and late cancellation even if transport ignores abort', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: 'kira-3.5-pro',
            choices: [
              {
                finish_reason: 'stop',
                message: { content: final.replace('S1', 'FAKE') },
              },
            ],
          }),
        ),
    ),
  );
  await expect(
    answerFromProvider(
      config('kira-3.5-pro'),
      'GH-42?',
      sources,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    code: 'ADAPTER_RESPONSE_ERROR',
    adapterStage: 'CITATION',
  });
  const controller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      controller.abort();
      return new Response('{}');
    }),
  );
  await expect(
    answerFromProvider(
      config('kira-3.5-pro'),
      'GH-42?',
      sources,
      controller.signal,
    ),
  ).rejects.toThrow();
});

it.each([
  [400, { error: { code: 'parameter_unknown' } }, 'UNSUPPORTED_PARAMETER'],
  [429, { error: { code: 'quota_exceeded' } }, 'QUOTA_EXHAUSTED'],
  [429, { error: { code: 'rate_limit_exceeded' } }, 'RATE_LIMITED_UNKNOWN'],
  [402, {}, 'BILLING_ACTION_REQUIRED'],
  [
    401,
    { error: { code: 'invalid_api_key', message: 'NEVER_EXPOSE' } },
    'INVALID_CREDENTIAL',
  ],
  [429, { error: { code: 'insufficient_quota' } }, 'QUOTA_EXHAUSTED'],
  [400, { error: { code: 'unsupported_parameter' } }, 'UNSUPPORTED_PARAMETER'],
  [404, { error: { code: 'model_not_found' } }, 'MODEL_NOT_AVAILABLE'],
])(
  'phân loại lỗi vendor %i bằng mã, không lộ body',
  async (status, body, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), { status: Number(status) }),
      ),
    );
    await expect(
      answerFromProvider(
        config('kira-3.5-pro'),
        'GH-42?',
        sources,
        new AbortController().signal,
      ),
    ).rejects.toThrow(String(code));
  },
);
it('phân biệt lỗi DNS/TLS với timeout chưa rõ kết quả', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('TLS private diagnostic');
    }),
  );
  await expect(
    answerFromProvider(
      config('kira-3.5-pro'),
      'GH-42?',
      sources,
      new AbortController().signal,
    ),
  ).rejects.toThrow('NETWORK_OR_TLS');
});

it('đọc một JSON code fence hoàn chỉnh của Kira nhưng vẫn chặn văn xuôi và citation giả', async () => {
  for (const [text, valid] of [
    [`\`\`\`json\n${final}\n\`\`\``, true],
    [`Giải thích\n\`\`\`json\n${final}\n\`\`\``, false],
    [`\`\`\`json\n${final.replace('S1', 'FAKE')}\n\`\`\``, false],
  ] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: 'kira-3.5-pro',
              choices: [{ finish_reason: 'stop', message: { content: text } }],
            }),
          ),
      ),
    );
    const result = answerFromProvider(
      config('kira-3.5-pro'),
      'Câu hỏi tiếp theo?',
      sources,
      new AbortController().signal,
      { history: [{ question: 'GH-42?', answer: '900mm' }] },
    );
    if (valid)
      await expect(result).resolves.toMatchObject({ citations: ['S1'] });
    else await expect(result).rejects.toThrow('ADAPTER_RESPONSE_ERROR');
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});
