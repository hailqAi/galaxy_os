import { afterEach, expect, it, vi } from 'vitest';
import { answerFromProvider, providerConfig } from './ai-provider';
import { configuredModel, modelChoices } from './ai-registry';
import { webSearch } from './ai-web';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('CHATGPT_PLAN_ONLY blocks legacy model, keyed web and direct adapter before network', async () => {
  vi.stubEnv('GALAXY_AI_EXECUTION_POLICY', 'CHATGPT_PLAN_ONLY');
  const network = vi.fn(() => {
    throw new Error('unexpected vendor dispatch');
  });
  vi.stubGlobal('fetch', network);
  expect(
    providerConfig({
      GALAXY_AI_EXECUTION_POLICY: 'CHATGPT_PLAN_ONLY',
      GALAXY_AI_API_KEY: 'synthetic',
      GALAXY_AI_MODEL: 'test',
      GALAXY_AI_ALLOWED_MODELS: 'test',
    }),
  ).toBeNull();
  expect(() => configuredModel({}, 'openrouter/free')).toThrow(
    'PAUSED_BY_USER',
  );
  expect(modelChoices({}, 'organization', 'project')).toEqual([]);
  await expect(
    answerFromProvider(
      {
        key: 'synthetic',
        model: 'test',
        baseUrl: 'https://api.openai.com/v1',
        maxOutputTokens: 1000,
      },
      'hello',
      [{ handle: 'S1', text: 'public fixture' }],
      new AbortController().signal,
    ),
  ).rejects.toThrow('PAUSED_BY_USER');
  await expect(
    webSearch(
      {
        enabled: true,
        revision: 'fixture-revision',
        organizationId: 'fixture-organization',
        decisionReference: 'fixture-decision',
        key: 'synthetic',
        accountPaidUsageDisabled: true,
        creditsPerDay: 5,
        maxCallsPerRequest: 1,
        subjects: [],
      } as Parameters<typeof webSearch>[0],
      'subject',
      'manual',
      new AbortController().signal,
      async () => {},
      async () => {},
    ),
  ).rejects.toThrow('PAUSED_BY_USER');
  expect(network).not.toHaveBeenCalled();
});
