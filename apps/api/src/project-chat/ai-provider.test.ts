import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerConfig, answerFromProvider } from './ai-provider';

const config = {
  key: 'synthetic-only',
  model: 'test-model',
  baseUrl: 'https://api.openai.com/v1',
  maxOutputTokens: 1200,
};
const sources = [{ handle: 'S1', text: 'GH-42 chưa được duyệt' }];
const response = (answer: unknown) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(answer) }],
        },
      ],
    }),
  );
afterEach(() => vi.unstubAllGlobals());
describe('M3 provider backend, không retry hoặc model giả live', () => {
  it('requires an explicit allowed model and backend key', () => {
    expect(providerConfig({})).toBeNull();
    expect(
      providerConfig({
        GALAXY_AI_API_KEY: 'key',
        GALAXY_AI_MODEL: 'not-allowed',
        GALAXY_AI_ALLOWED_MODELS: 'other',
      }),
    ).toBeNull();
    expect(
      providerConfig({
        GALAXY_AI_API_KEY: 'key',
        GALAXY_AI_MODEL: 'allowed',
        GALAXY_AI_ALLOWED_MODELS: 'allowed',
        GALAXY_AI_BASE_URL: 'http://169.254.169.254',
      }),
    ).toBeNull();
  });
  it('sends source data with store false, no tools, validates returned citations', async () => {
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return response({
          answer: 'Chưa được duyệt.',
          citations: ['S1'],
          uncertainty: 'Thiếu quyết định.',
        });
      }),
    );
    const result = await answerFromProvider(
      config,
      'GH-42 đã duyệt chưa?',
      sources,
      new AbortController().signal,
    );
    expect(result.citations).toEqual(['S1']);
    expect(requestBody).toMatchObject({
      model: 'test-model',
      store: false,
      max_output_tokens: 1200,
    });
    expect(requestBody.tools).toBeUndefined();
    expect(JSON.stringify(requestBody)).not.toContain('synthetic-only');
  });
  it('rejects unknown handles, incomplete responses and provider failures without retry', async () => {
    const transport = vi.fn(async () =>
      response({ answer: 'Leaked', citations: ['FAKE'], uncertainty: '' }),
    );
    vi.stubGlobal('fetch', transport);
    await expect(
      answerFromProvider(
        config,
        'question',
        sources,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    transport.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'incomplete', output: [] })),
    );
    await expect(
      answerFromProvider(
        config,
        'question',
        sources,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    transport.mockResolvedValueOnce(
      new Response('do not log provider body', { status: 429 }),
    );
    await expect(
      answerFromProvider(
        config,
        'question',
        sources,
        new AbortController().signal,
      ),
    ).rejects.toThrow('Provider');
    expect(transport).toHaveBeenCalledTimes(3);
  });
  it('does not deliver a late response after cancellation', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort();
        return response({ answer: 'late', citations: ['S1'], uncertainty: '' });
      }),
    );
    await expect(
      answerFromProvider(config, 'question', sources, controller.signal),
    ).rejects.toThrow();
  });
});
