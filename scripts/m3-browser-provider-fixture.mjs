// Test process preload only. The live application never imports this file.
import assert from 'node:assert/strict';
import { assertG00Isolation } from '../apps/api/scripts/g00-isolated-environment.mjs';
assertG00Isolation();
assert.equal(process.env.GALAXY_AI_API_KEY, 'm3-browser-synthetic-only');
assert.equal(process.env.GALAXY_AI_MODEL, 'm3-browser-fixture');
assert.equal(process.env.FEATURE_PROJECT_AI, 'true');
const localFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  );
  if (url.href !== 'https://api.openai.com/v1/responses') {
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(url.hostname),
      'Fixture blocks external network',
    );
    return localFetch(input, options);
  }
  const body = JSON.parse(String(options?.body));
  assert.equal(body.model, 'm3-browser-fixture');
  assert.equal(body.store, false);
  const data = JSON.parse(body.input[0].content);
  assert.ok(data.sources.length > 0);
  return new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                answer: `Mô phỏng kiểm thử M3. Nguồn được cấp: ${data.sources[0].text}`,
                uncertainty:
                  'Dữ liệu giả; không phải kết quả provider thật hoặc quyết định chính thức.',
                citations: [data.sources[0].handle],
              }),
            },
          ],
        },
      ],
    }),
  );
};
