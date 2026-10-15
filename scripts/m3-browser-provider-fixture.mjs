// Test process preload only. Production never imports this file or sends these synthetic credentials.
import assert from 'node:assert/strict';
import { assertG00Isolation } from '../apps/api/scripts/g00-isolated-environment.mjs';
assertG00Isolation();
assert.equal(
  process.env.GALAXY_AI_CONFIG_FILE,
  process.env.G00_TEST_ROOT + '/browser-ai.json',
);
assert.equal(process.env.FEATURE_PROJECT_AI, 'true');
const endpoints = new Set([
  'https://generativelanguage.googleapis.com/v1beta/interactions',
  'https://api.mistral.ai/v1/chat/completions',
  'https://kiraai.vn/api/v1/chat/completions',
  'https://openrouter.ai/api/v1/chat/completions',
]);
const localFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  );
  if (url.href === 'https://auth.openai.com/.well-known/openid-configuration')
    return Response.json({
      issuer: 'https://auth.openai.com',
      authorization_endpoint: 'https://auth.openai.com/api/accounts/authorize',
      token_endpoint: 'https://auth.openai.com/api/accounts/oauth/token',
      jwks_uri: 'https://auth.openai.com/.well-known/jwks.json',
      revocation_endpoint: 'https://auth.openai.com/api/accounts/oauth/revoke',
    });
  if (url.href === 'https://api.openai.com/v1/responses') {
    assert.equal(process.env.GALAXY_AI_EXECUTION_POLICY, 'CHATGPT_PLAN_ONLY');
    assert.equal(
      new Headers(options?.headers).get('authorization'),
      'Bearer p1-browser-synthetic-only',
    );
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, 'p1-account-model');
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    const receiptPrefix =
      'Completed Galaxy document tool receipt (untrusted data; generated body omitted, read the artifact or original evidence when needed):\n';
    const current = body.input.findLast(
      (item) =>
        item.role === 'user' &&
        !(
          typeof item.content === 'string' &&
          item.content.startsWith(receiptPrefix)
        ),
    ).content;
    if (current === 'E02 browser create pptx') {
      const done = body.input.some(
        (item) =>
          (item.type === 'function_call_output' &&
            item.call_id === 'browser-pptx') ||
          (item.role === 'user' &&
            typeof item.content === 'string' &&
            item.content.startsWith(receiptPrefix) &&
            JSON.parse(item.content.slice(receiptPrefix.length).split('\n')[0])
              .callId === 'browser-pptx'),
      );
      const definition = body.tools
        .find((t) => t.type === 'namespace')
        .tools.find((t) => t.name === 'create_document');
      assert.ok(definition.parameters.properties.format.enum.includes('pptx'));
      const output = done
        ? [
            {
              type: 'message',
              role: 'assistant',
              content: [
                { type: 'output_text', text: 'E02 native PPTX preview ready.' },
              ],
            },
          ]
        : [
            {
              type: 'function_call',
              namespace: 'galaxy',
              name: 'create_document',
              call_id: 'browser-pptx',
              arguments: JSON.stringify({
                version: 2,
                format: 'pptx',
                title: 'E02 native preview',
                blocks: [],
                presentation: {
                  template: 'galaxy-light',
                  slides: [
                    {
                      title: 'Báo giá nháp Việt Nam',
                      elements: [
                        {
                          kind: 'table',
                          x: 0.5,
                          y: 1.5,
                          w: 7,
                          h: 1.5,
                          fontSize: 16,
                          rows: [
                            ['Mã', 'Tổng VND'],
                            ['0007392', '275001.10'],
                          ],
                        },
                      ],
                    },
                  ],
                },
              }),
            },
          ];
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: { status: 'completed', model: body.model, output },
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }
    const rangeQuestion =
      typeof current === 'string' &&
      current.match(/^E02 browser range ([0-9a-f-]{36})$/);
    if (rangeQuestion) {
      const result = body.input.find(
        (item) =>
          item.type === 'function_call_output' &&
          item.call_id === 'browser-range',
      );
      if (result) assert.match(result.output, /0007392/);
      const output = result
        ? [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Second!A1 is 0007392; only the selected range was read.',
                },
              ],
            },
          ]
        : [
            {
              type: 'function_call',
              namespace: 'galaxy',
              name: 'analyze_table',
              call_id: 'browser-range',
              arguments: JSON.stringify({
                sourceId: rangeQuestion[1],
                sheet: 'Second',
                range: 'A1:A1',
              }),
            },
          ];
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: { status: 'completed', model: body.model, output },
          }) +
          '\n\n',
        {
          headers: {
            'content-type': 'text/event-stream',
            'x-request-id': 'e02-browser-range-fixture',
          },
        },
      );
    }
    if (current === 'E03 browser stop') {
      await new Promise((resolve) => setTimeout(resolve, 7000));
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: {
              status: 'completed',
              model: body.model,
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    { type: 'output_text', text: 'E03 forbidden late output' },
                  ],
                },
              ],
            },
          }) +
          '\n\n',
        {
          headers: {
            'content-type': 'text/event-stream',
            'x-request-id': 'e03-browser-stop-synthetic',
          },
        },
      );
    }
    assert.ok(
      /^P1 browser (?:A|B|slow-A)$/.test(current) ||
        current === ' \nP1 browser A\t ',
    );
    if (current === 'P1 browser slow-A')
      await new Promise((resolve) => setTimeout(resolve, 1500));
    const text = current === 'P1 browser B' ? 'sentinel-B' : 'sentinel-A';
    return new Response(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: {
            status: 'completed',
            model: body.model,
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text }],
              },
            ],
          },
        }) +
        '\n\n',
      {
        headers: {
          'content-type': 'text/event-stream',
          'x-request-id': 'p1-browser-fixture',
        },
      },
    );
  }
  if (url.href === 'https://openrouter.ai/api/v1/models')
    return Response.json({
      data: [
        {
          id: 'openrouter/free',
          architecture: {
            input_modalities: ['text', 'image'],
            output_modalities: ['text'],
          },
          supported_parameters: ['tools'],
          pricing: { prompt: '0', completion: '0', request: '0' },
        },
      ],
    });
  if (!endpoints.has(url.href)) {
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(url.hostname),
      'Fixture blocks external network',
    );
    return localFetch(input, options);
  }
  const headers = new Headers(options?.headers);
  assert.ok(
    [headers.get('authorization'), headers.get('x-goog-api-key')].some((v) =>
      v?.endsWith('m3-browser-synthetic-only'),
    ),
  );
  const body = JSON.parse(String(options?.body));
  const original = body.messages
    ?.filter((message) => message.role === 'user')
    .flatMap((message) => {
      try {
        const content = message.content;
        return [JSON.parse(Array.isArray(content) ? content[0].text : content)];
      } catch {
        return [];
      }
    })
    .findLast((value) => typeof value.question === 'string');
  const exportMatch = original?.question.match(
    /^Xuất kiểm chứng (docx|pdf|xlsx)$/,
  );
  if (
    exportMatch &&
    body.tools?.some((tool) => tool.function.name === 'create_document')
  ) {
    const toolResult = body.messages.find((message) => message.role === 'tool');
    return Response.json({
      id: 'fixture-document-' + (toolResult ? '2' : '1'),
      model: 'fixture/free:free',
      usage: { prompt_tokens: 20, completion_tokens: 20, cost: 0 },
      choices: [
        {
          finish_reason: toolResult ? 'stop' : 'tool_calls',
          message: toolResult
            ? {
                content: JSON.stringify({
                  answer: 'Đã tạo bản nháp kiểm chứng từ công cụ thật.',
                  citations: (original.sources ?? [])
                    .slice(0, 1)
                    .map((source) => source.handle),
                  uncertainty: 'Mô phỏng model; file được tạo thật tại Galaxy.',
                }),
              }
            : {
                content: null,
                tool_calls: [
                  {
                    id: 'document-1',
                    type: 'function',
                    function: {
                      name: 'create_document',
                      arguments: JSON.stringify({
                        format: exportMatch[1],
                        title: 'Bản nháp kiểm chứng ' + exportMatch[1],
                        blocks: [
                          { kind: 'heading', text: 'Đối chiếu tiếng Việt' },
                          {
                            kind: 'table',
                            rows: [
                              ['Mã', 'Giá tham khảo'],
                              ['KCA-7392', '123456789012345678.90'],
                            ],
                          },
                          { kind: 'page_break' },
                          {
                            kind: 'paragraph',
                            text: 'Chưa phê duyệt, chưa phát hành cho khách.',
                          },
                        ],
                      }),
                    },
                  },
                ],
              },
        },
      ],
    });
  }
  const content = body.input
    ? body.input[0].text
    : body.messages.at(-1).content;
  const data = JSON.parse(Array.isArray(content) ? content[0].text : content);
  if (Array.isArray(content)) {
    const images = content.filter((part) => part.type === 'image_url');
    assert.ok(images.length > 0 && images.length <= 9);
    for (const image of images)
      assert.match(image.image_url.url, /^data:image\/(png|jpeg);base64,/);
  }
  if (!data.sources?.length)
    return Response.json({
      model: 'fixture/free:free',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: body.tools
              ? JSON.stringify({
                  answer: 'Lời chúc từ provider fixture.',
                  citations: [],
                  uncertainty: '',
                })
              : 'Lời chúc từ provider fixture.',
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 },
    });
  const text = JSON.stringify({
    answer: `Mô phỏng kiểm thử M3. Nguồn được cấp: ${data.sources[0].text}`,
    uncertainty:
      'Dữ liệu giả; không phải kết quả provider thật hoặc quyết định chính thức.',
    citations: [data.sources[0].handle],
  });
  return new Response(
    JSON.stringify(
      body.input
        ? {
            status: 'completed',
            model: body.model,
            steps: [
              { type: 'model_output', content: [{ type: 'text', text }] },
            ],
          }
        : {
            model: body.model,
            usage: { prompt_tokens: 20, completion_tokens: 20, cost: 0 },
            choices: [{ finish_reason: 'stop', message: { content: text } }],
          },
    ),
  );
};
