import { expect, it } from 'vitest';
import {
  chatGptCatalog,
  chatGptRequest,
  readChatGptStream,
} from './ai-chatgpt-plan';

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
    input: [{ role: 'user', content: 'Calculate' }],
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
const event = (type: string, rest: object = {}) =>
  `data: ${JSON.stringify({ type, ...rest })}\r\n\r\n`;
function stream(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 7)
          controller.enqueue(bytes.slice(i, i + 7));
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
it('returns local tool calls only for supported namespace/schema and rejects malformed completion', async () => {
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
  await expect(
    readChatGptStream(
      response([{ ...call, arguments: '{"projectId":"other"}' }]),
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});
