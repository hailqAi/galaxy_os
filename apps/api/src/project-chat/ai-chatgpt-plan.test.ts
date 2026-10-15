import { expect, it } from 'vitest';
import { scanPdfFixture } from '../../test/document-fixtures';
import {
  chatGptCatalog,
  chatGptRequest,
  readChatGptStream,
} from './ai-chatgpt-plan';

it('counts media-looking fields in provider actions as text', () => {
  for (const action of [
    { image_url: 'x'.repeat(300000) },
    { type: 'input_image', image_url: 'x'.repeat(300000) },
    { type: 'input_file', file_data: 'x'.repeat(300000) },
    { type: 'reasoning', encrypted_content: 'x'.repeat(300000) },
  ])
    expect(() =>
      chatGptRequest({
        model: 'granted-model',
        input: [
          { role: 'user', content: 'Read.' },
          { type: 'web_search_call', id: 'web', status: 'completed', action },
        ],
      }),
    ).toThrow('TOOL_CONTEXT_LIMIT');
});

it('preserves encrypted continuation while enforcing independent text and opaque transport bounds', () => {
  const reasoning = (id: string, encrypted: string, summary = '') => ({
    type: 'reasoning',
    id,
    summary: summary ? [{ type: 'summary_text', text: summary }] : [],
    encrypted_content: encrypted,
  });
  const item = reasoning('bounded', 'r'.repeat(128000));
  const wire = chatGptRequest({
    model: 'granted-model',
    input: [{ role: 'user', content: 'x'.repeat(200000) }, item],
  });
  expect(wire.input[1]).toEqual(item);
  for (const input of [
    [{ role: 'user', content: 'x'.repeat(256000) }, item],
    [
      reasoning('a', 'r'.repeat(128000)),
      reasoning('b', 'r'.repeat(128000)),
      reasoning('c', 'r'),
    ],
    Array.from({ length: 9 }, (_, n) =>
      reasoning(String(n), 'r', 'x'.repeat(32000)),
    ),
  ])
    expect(() => chatGptRequest({ model: 'granted-model', input })).toThrow(
      'TOOL_CONTEXT_LIMIT',
    );
  expect(() =>
    chatGptRequest({
      model: 'granted-model',
      input: [reasoning('too-large', 'r'.repeat(128001))],
    }),
  ).toThrow();
});

it('admits a 1.4 MB original PDF separately from the text envelope while retaining binary and text bounds', () => {
  const pdf = scanPdfFixture();
  const padded = (size: number) =>
    Buffer.concat([
      pdf.subarray(0, -6),
      Buffer.alloc(size - pdf.length, 32),
      pdf.subarray(-6),
    ]);
  const original = padded(1_405_052);
  const part = (bytes: Buffer) => ({
    type: 'input_file',
    filename: 'Source.pdf',
    file_data: 'data:application/pdf;base64,' + bytes.toString('base64'),
  });
  const input = [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: '  Read this exact PDF.\n' },
        part(original),
      ],
    },
  ];
  const wire = chatGptRequest({
    model: 'granted-model',
    input,
    reasoningEffort: 'max',
  });
  expect(wire).toMatchObject({ input, reasoning: { effort: 'max' } });
  expect(() =>
    chatGptRequest({
      model: 'granted-model',
      input: [{ role: 'user', content: [part(padded(8_000_001))] }],
    }),
  ).toThrow('MEDIA_INPUT_TOO_LARGE');
  expect(() =>
    chatGptRequest({
      model: 'granted-model',
      input: [
        {
          role: 'user',
          content: [part(padded(4_000_001)), part(padded(4_000_001))],
        },
      ],
    }),
  ).toThrow('MEDIA_INPUT_TOO_LARGE');
  expect(() =>
    chatGptRequest({
      model: 'granted-model',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'x'.repeat(256000) },
            part(original),
          ],
        },
      ],
    }),
  ).toThrow('TOOL_CONTEXT_LIMIT');
});

it('records the first visible text event without treating reasoning as an output', async () => {
  const wire = [
    { type: 'response.reasoning_text.delta', delta: 'private' },
    { type: 'response.output_text.delta', delta: 'Hello' },
    {
      type: 'response.completed',
      response: {
        id: 'resp-timing',
        status: 'completed',
        model: 'granted-model',
        output: [
          {
            type: 'message',
            id: 'msg',
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
          },
        ],
      },
    },
  ]
    .map((value) => 'data: ' + JSON.stringify(value) + '\n\n')
    .join('');
  const result = await readChatGptStream(
    stream(wire),
    new AbortController().signal,
  );
  expect(result.firstOutputAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(result.firstOutputEvidence).toBe('TEXT_DELTA');
});

it('retains bounded error codes and request evidence without leaking provider messages', async () => {
  const response = new Response(
    JSON.stringify({
      error: {
        code: 'subscription_sharing_usage_limit_exceeded',
        message: 'private diagnostic',
      },
    }),
    { status: 429, headers: { 'x-request-id': 'request-fixture' } },
  );
  await expect(
    readChatGptStream(response, new AbortController().signal),
  ).rejects.toMatchObject({
    code: 'CHATGPT_USAGE_LIMIT',
    httpStatus: 429,
    upstream: {
      code: 'subscription_sharing_usage_limit_exceeded',
      requestId: 'request-fixture',
    },
  });
  await expect(
    readChatGptStream(
      new Response('{"detail":"private admission diagnostic"}', {
        status: 403,
      }),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    code: 'CHATGPT_RESPONSE_FAILED',
    httpStatus: 403,
    adapterStage: 'ADMISSION',
  });
});
it('normalizes nullable SSE codes and preserves the unsupported parameter', async () => {
  await expect(
    readChatGptStream(
      stream(
        event('error', {
          code: null,
          param: 'input[0].role',
          message: 'untrusted',
        }),
      ),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    code: 'CHATGPT_RESPONSE_FAILED',
    upstream: { param: 'input[0].role' },
  });
});

it('uses only visible account catalog entries and no sample models', () => {
  expect(
    chatGptCatalog({
      models: [
        { slug: 'account-b', display_name: 'B', visibility: 'list' },
        { slug: 'hidden', display_name: 'Hidden', visibility: 'hide' },
        { slug: 'account-a', display_name: 'A', visibility: 'list' },
      ],
    }),
  ).toEqual([
    { id: 'account-b', label: 'B' },
    { id: 'account-a', label: 'A' },
  ]);
  expect(() => chatGptCatalog({ data: [{ id: 'api-key-model' }] })).toThrow();
});
it('serializes SIWC history and namespaced local tools without API-key payload fields', () => {
  const body = chatGptRequest({
    model: 'granted-model',
    instructions: 'Use allowed sources.',
    input: [
      {
        role: 'developer',
        content:
          'Server-verified Project context: {"projectId":"fixture-project"}',
      },
      { role: 'user', content: 'Calculate' },
    ],
    tools: ['calculate'],
  });
  expect(body).toMatchObject({
    store: false,
    stream: true,
    tools: [
      {
        type: 'namespace',
        name: 'galaxy',
        tools: [{ type: 'function', name: 'calculate' }],
      },
    ],
  });
  expect(body.input[0]).toMatchObject({
    role: 'developer',
    content: expect.stringContaining('fixture-project'),
  });
  expect(body.model).toBe('granted-model');
  expect(body).not.toHaveProperty('max_output_tokens');
  expect(() =>
    chatGptRequest({ model: 'm', input: [{ role: 'system', content: 'x' }] }),
  ).toThrow();
  expect(() =>
    chatGptRequest({
      model: 'm',
      input: [{ role: 'user', content: 'x' }],
      max_output_tokens: 1,
    }),
  ).toThrow();
  expect(() =>
    chatGptRequest({
      model: 'm',
      input: [{ role: 'user', content: 'x' }],
      tools: ['search_web'],
    }),
  ).toThrow();
});
it('advertises only selected memory/history read tools in the actual SIWC namespace', () => {
  const wire = chatGptRequest({
    model: 'm',
    input: [{ role: 'user', content: 'Read memory' }],
    tools: [
      'task_list',
      'search_project_memory',
      'read_project_memory',
      'search_conversation_history',
    ],
  });
  expect(wire.tools?.[0]?.tools?.map((t) => t.name)).toEqual([
    'task_list',
    'search_project_memory',
    'read_project_memory',
    'search_conversation_history',
  ]);
  expect(JSON.stringify(wire.tools)).not.toContain('create_document');
  expect(JSON.stringify(wire.tools)).not.toContain('search_web');
});
const event = (type: string, rest: object = {}) =>
  `data: ${JSON.stringify({ type, ...rest })}\r\n\r\n`;
function stream(text: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize)
          controller.enqueue(bytes.slice(i, i + chunkSize));
        controller.close();
      },
    }),
    {
      headers: {
        'content-type': 'text/event-stream',
        'x-request-id': 'fixture-request',
      },
    },
  );
}
it('accepts bounded SSE output when deltas and repeated completion snapshots exceed the retained-output budget', async () => {
  const text = 'x'.repeat(170000);
  const reasoning = {
    type: 'reasoning',
    id: 'opaque-continuation',
    summary: [],
    encrypted_content: 'r'.repeat(64000),
  };
  const message = {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text }],
  };
  const output = [reasoning, message];
  const wire =
    event('response.output_text.delta', { delta: text }) +
    output
      .map((item, output_index) =>
        event('response.output_item.done', { output_index, item }),
      )
      .join('') +
    event('response.completed', {
      response: { status: 'completed', model: 'm', output },
    });
  expect(Buffer.byteLength(wire)).toBeGreaterThan(512000);
  expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThan(512000);
  await expect(
    readChatGptStream(stream(wire, 65536), new AbortController().signal),
  ).resolves.toMatchObject({ text, continuation: output });
});

it('rejects an oversized SSE frame and cumulative retained done output', async () => {
  const item = (text: string) => ({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text }],
  });
  for (const wire of [
    event('response.output_text.delta', { delta: 'x'.repeat(512001) }),
    [0, 1]
      .map((output_index) =>
        event('response.output_item.done', {
          output_index,
          item: item('x'.repeat(260000)),
        }),
      )
      .join('') +
      event('response.completed', {
        response: { status: 'completed', model: 'm', output: [] },
      }),
  ])
    await expect(
      readChatGptStream(stream(wire, 65536), new AbortController().signal),
    ).rejects.toThrow('CHATGPT_RESPONSE_TOO_LARGE');
});

it('validates completed SSE when the upstream omits Content-Type', async () => {
  const response = stream(
    event('response.completed', {
      response: {
        status: 'completed',
        model: 'm',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'OK' }] },
        ],
      },
    }),
  );
  response.headers.delete('content-type');
  await expect(
    readChatGptStream(response, new AbortController().signal),
  ).resolves.toMatchObject({ text: 'OK', model: 'm' });
});
it.each(['completed', 'httpError'])(
  'does not wait for transport cleanup after %s',
  async (kind) => {
    let release!: () => void, cancelled!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve)),
      started = new Promise<void>((resolve) => (cancelled = resolve));
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              kind === 'completed'
                ? event('response.completed', {
                    response: {
                      status: 'completed',
                      model: 'm',
                      output: [
                        {
                          type: 'message',
                          content: [{ type: 'output_text', text: 'OK' }],
                        },
                      ],
                    },
                  })
                : 'x'.repeat(17000),
            ),
          );
        },
        cancel() {
          cancelled();
          return held;
        },
      }),
      { status: kind === 'completed' ? 200 : 429 },
    );
    const result = readChatGptStream(
      response,
      new AbortController().signal,
    ).then(
      (value) => value.text,
      (error: Error) => error.message,
    );
    await started;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        result,
        new Promise<string>((resolve) => {
          timer = setTimeout(() => resolve('CLEANUP_STALLED'), 100);
        }),
      ]);
      expect(outcome).not.toBe('CLEANUP_STALLED');
      if (kind === 'completed') expect(outcome).toBe('OK');
      else expect(outcome).toBe('CHATGPT_RESPONSE_FAILED');
    } finally {
      if (timer) clearTimeout(timer);
      release();
      await result;
    }
  },
);
it('retains validated done items when completed carries an empty output snapshot', async () => {
  const item = {
    type: 'message',
    content: [{ type: 'output_text', text: 'Hello, world!' }],
  };
  const done = event('response.output_item.done', { output_index: 0, item });
  await expect(
    readChatGptStream(stream(done), new AbortController().signal),
  ).rejects.toThrow('STREAM_INTERRUPTED');
  await expect(
    readChatGptStream(
      stream(
        done +
          event('response.completed', {
            response: { status: 'completed', model: 'm', output: [] },
          }),
      ),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({ text: 'Hello, world!', continuation: [item] });
});
it('orders done tool items by index and rejects gaps, duplicates and invalid tools', async () => {
  const tool = {
    type: 'function_call',
    namespace: 'galaxy',
    name: 'task_list',
    call_id: 'task-call',
    arguments: '{"page":1,"pageSize":20,"status":null,"mine":false}',
  };
  const text = {
    type: 'message',
    content: [{ type: 'output_text', text: 'Checking.' }],
  };
  const end = event('response.completed', {
    response: { status: 'completed', model: 'm', output: [] },
  });
  const frame = (output_index: number, item: unknown) =>
    event('response.output_item.done', { output_index, item });
  await expect(
    readChatGptStream(
      stream(frame(1, tool) + frame(0, text) + end),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({ calls: [tool], continuation: [text, tool] });
  for (const body of [
    frame(1, tool),
    frame(0, tool) + frame(0, tool),
    frame(0, { ...tool, namespace: 'shell' }),
  ]) {
    await expect(
      readChatGptStream(stream(body + end), new AbortController().signal),
    ).rejects.toThrow();
  }
});
it('still rejects missing-header partial streams and explicit non-SSE media', async () => {
  const partial = stream(
    event('response.output_text.delta', { delta: 'Not done' }),
  );
  partial.headers.delete('content-type');
  await expect(
    readChatGptStream(partial, new AbortController().signal),
  ).rejects.toThrow('STREAM_INTERRUPTED');
  await expect(
    readChatGptStream(
      new Response('{"status":"completed"}', {
        headers: { 'content-type': 'application/json' },
      }),
      new AbortController().signal,
    ),
  ).rejects.toThrow('CHATGPT_STREAM_REQUIRED');
});
it('accepts matching terminal items and rejects contradictions with done items', async () => {
  const item = {
    type: 'message',
    content: [{ type: 'output_text', text: 'Confirmed' }],
  };
  const done = event('response.output_item.done', { output_index: 0, item });
  const terminal = (output: unknown[]) =>
    event('response.completed', {
      response: { status: 'completed', model: 'm', output },
    });
  await expect(
    readChatGptStream(
      stream(done + terminal([item])),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({ text: 'Confirmed' });
  await expect(
    readChatGptStream(
      stream(
        done +
          terminal([
            { ...item, content: [{ type: 'output_text', text: 'Changed' }] },
          ]),
      ),
      new AbortController().signal,
    ),
  ).rejects.toThrow('INVALID_OUTPUT');
});
it('requires a terminal completed event even after output deltas and preserves Vietnamese', async () => {
  const signal = new AbortController().signal;
  const partial = event('response.output_text.delta', { delta: 'Chưa xong' });
  await expect(readChatGptStream(stream(partial), signal)).rejects.toThrow(
    'STREAM_INTERRUPTED',
  );
  await expect(
    readChatGptStream(
      stream(
        event('error', {
          code: 'subscription_sharing_usage_limit_exceeded',
          message: 'quota',
        }),
      ),
      signal,
    ),
  ).rejects.toThrow('CHATGPT_USAGE_LIMIT');
  await expect(
    readChatGptStream(
      stream(
        partial +
          event('response.failed', {
            response: {
              error: { code: 'subscription_sharing_usage_limit_exceeded' },
            },
          }),
      ),
      signal,
    ),
  ).rejects.toThrow('CHATGPT_USAGE_LIMIT');
  await expect(
    readChatGptStream(
      stream(
        event('response.completed', {
          response: {
            status: 'completed',
            model: 'actual-model',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'Đã xong.' }],
              },
            ],
            usage: { input_tokens: 3, output_tokens: 4 },
          },
        }),
      ),
      signal,
    ),
  ).resolves.toMatchObject({
    model: 'actual-model',
    text: 'Đã xong.',
    requestId: 'fixture-request',
    usage: { input_tokens: 3, output_tokens: 4 },
  });
});
it('roundtrips encrypted reasoning and tool output without exposing reasoning as answer text', async () => {
  const reasoning = {
    type: 'reasoning',
    id: 'r1',
    summary: [],
    encrypted_content: 'opaque-fixture',
  };
  const result = await readChatGptStream(
    stream(
      event('response.completed', {
        response: { status: 'completed', model: 'm', output: [reasoning] },
      }),
    ),
    new AbortController().signal,
  );
  expect(result.text).toBe('');
  expect(
    chatGptRequest({ model: 'm', input: result.continuation }).input,
  ).toEqual([reasoning]);
});
it('validates local tool envelopes and retains invalid arguments for a matched executor error', async () => {
  const response = (output: unknown[]) =>
    stream(
      event('response.completed', {
        response: { status: 'completed', model: 'm', output },
      }),
    );
  const call = {
    type: 'function_call',
    namespace: 'galaxy',
    call_id: 'c1',
    name: 'calculate',
    arguments: '{"operation":"add","operands":["1","2"],"decimalPlaces":null}',
  };
  await expect(
    readChatGptStream(response([call]), new AbortController().signal),
  ).resolves.toMatchObject({ calls: [{ call_id: 'c1', name: 'calculate' }] });
  await expect(
    readChatGptStream(
      response([{ ...call, namespace: 'shell' }]),
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  for (const argumentsValue of ['{"projectId":"other"}', '{invalid']) {
    const invalid = { ...call, arguments: argumentsValue };
    await expect(
      readChatGptStream(response([invalid]), new AbortController().signal),
    ).resolves.toMatchObject({ calls: [invalid] });
  }
});

it('retains redacted admission detail for an owner diagnostic', async () => {
  await expect(
    readChatGptStream(
      new Response(
        JSON.stringify({
          detail: 'Admission unavailable; access_token=secret-value',
        }),
        { status: 403 },
      ),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    upstream: { detail: 'Admission unavailable; access_token=[REDACTED]' },
  });
});

it('keeps long original input intact while enforcing the complete UTF-8 wire limit', () => {
  const question = '原文 😀\n'.repeat(7000);
  const wire = chatGptRequest({
    model: 'actual-model',
    input: [{ role: 'user', content: question }],
  });
  expect(wire.input).toEqual([{ role: 'user', content: question }]);
  expect(() =>
    chatGptRequest({
      model: 'actual-model',
      input: [{ role: 'user', content: '😀'.repeat(70000) }],
    }),
  ).toThrow();
});

it.each(['high', 'max'])(
  'sends exact %s reasoning effort and native web definitions without keyed search',
  (effort) => {
    const body = chatGptRequest({
      model: 'granted-model',
      input: [{ role: 'user', content: 'Original question' }],
      reasoningEffort: effort,
      nativeWebSearch: true,
      tools: ['calculate'],
    });
    expect(body).toMatchObject({
      reasoning: { effort },
      tools: [{ type: 'web_search' }, { type: 'namespace', name: 'galaxy' }],
    });
    expect(() =>
      chatGptRequest({
        model: 'granted-model',
        input: [{ role: 'user', content: 'Q' }],
        reasoningEffort: 'invented',
      }),
    ).toThrow();
  },
);
it('retains provider reasoning evidence and verified native URL citations in the terminal response', async () => {
  const output = [
    {
      type: 'web_search_call',
      id: 'web-synthetic',
      status: 'completed',
      action: { type: 'search', query: 'official OpenAI docs' },
    },
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: 'Official reference.',
          annotations: [
            {
              type: 'url_citation',
              start_index: 0,
              end_index: 18,
              url: 'https://developers.openai.com/workspace-agents/trigger-runs',
              title: 'Trigger workspace agent runs',
            },
          ],
        },
      ],
    },
  ];
  const result = await readChatGptStream(
    stream(
      event('response.completed', {
        response: {
          status: 'completed',
          model: 'granted-model',
          reasoning: { effort: 'high' },
          output,
        },
      }),
    ),
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    reasoningEffort: 'high',
    webSearches: 1,
    webActions: [
      {
        id: 'web-synthetic',
        status: 'completed',
        action: { type: 'search', query: 'official OpenAI docs' },
      },
    ],
    webCitations: [
      {
        url: 'https://developers.openai.com/workspace-agents/trigger-runs',
        title: 'Trigger workspace agent runs',
      },
    ],
  });
  expect(result.continuation).toHaveLength(2);
});

it.each([
  [9, 2],
  [0, 200],
  [4, 4],
])(
  'rejects invalid native citation offsets %s..%s',
  async (start_index, end_index) => {
    await expect(
      readChatGptStream(
        stream(
          event('response.completed', {
            response: {
              status: 'completed',
              model: 'granted-model',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Reference.',
                      annotations: [
                        {
                          type: 'url_citation',
                          start_index,
                          end_index,
                          url: 'https://developers.openai.com/siwc/',
                          title: 'Official',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        ),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  },
);

it('accepts bounded validated inline image and PDF input without remote URLs or hosted file IDs', async () => {
  const { renderDocument } = await import('./ai-document');
  const pdf = await renderDocument(
    {
      format: 'pdf',
      title: 'Synthetic',
      blocks: [{ kind: 'paragraph', text: 'E02 synthetic known text 7392' }],
    },
    [],
  );
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  const input = [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: 'Read the supplied originals.' },
        { type: 'input_image', image_url: image, detail: 'auto' },
        {
          type: 'input_file',
          filename: 'Synthetic.pdf',
          file_data:
            'data:application/pdf;base64,' + pdf.bytes.toString('base64'),
        },
      ],
    },
  ];
  expect(
    chatGptRequest({ model: 'granted-model', input, reasoningEffort: 'max' }),
  ).toMatchObject({ input, reasoning: { effort: 'max' } });
  const invalid = [
    {
      type: 'input_image',
      image_url: 'https://localhost/private.png',
      detail: 'auto',
    },
    {
      type: 'input_image',
      image_url: 'data:image/png;base64,iVBORw0KGgo=',
      detail: 'auto',
    },
    {
      type: 'input_file',
      filename: '../secret.pdf',
      file_data: 'data:application/pdf;base64,' + pdf.bytes.toString('base64'),
    },
    { type: 'input_file', filename: 'Synthetic.pdf', file_id: 'file-secret' },
    {
      type: 'input_file',
      filename: 'Synthetic.pdf',
      file_data: 'data:application/pdf;base64,YWJj',
    },
  ];
  for (const part of invalid)
    expect(() =>
      chatGptRequest({
        model: 'granted-model',
        input: [{ role: 'user', content: [part] }],
      }),
    ).toThrow();
  expect(() =>
    chatGptRequest({
      model: 'granted-model',
      input: [{ role: 'developer', content: input[0]!.content }],
    }),
  ).toThrow();
  expect(() =>
    chatGptRequest({
      model: 'granted-model',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,' + 'A'.repeat(256000),
              detail: 'auto',
            },
          ],
        },
      ],
    }),
  ).toThrow();
});
