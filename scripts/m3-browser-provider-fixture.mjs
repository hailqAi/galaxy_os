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
]);
const localFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  );
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
  const data = JSON.parse(
    body.input ? body.input[0].text : body.messages[1].content,
  );
  assert.ok(data.sources.length > 0);
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
            choices: [{ finish_reason: 'stop', message: { content: text } }],
          },
    ),
  );
};
