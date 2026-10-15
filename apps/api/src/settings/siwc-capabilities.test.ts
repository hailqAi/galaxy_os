import 'reflect-metadata';
import { expect, it, vi } from 'vitest';
import { SiwcCapabilityService, siwcCapabilities } from './siwc-capabilities';
const actor = { organizationId: 'org' } as never;
it.each(['high', 'max'])(
  'records accepted %s capability separately from sent/applied effort',
  async (effort) => {
    let stored: unknown;
    const db = {
      systemSetting: {
        findUnique: async () => (stored ? { value: stored } : null),
        upsert: async ({ create }: { create: { value: unknown } }) => {
          stored = create.value;
        },
      },
    };
    const owner = vi.fn(async () => ({
      generation: 'generation',
      models: [{ id: 'strong-model' }],
    }));
    const respond = vi.fn(
      async (
        _actor: unknown,
        _generation: string,
        input: { reasoningEffort?: string; nativeWebSearch?: boolean },
      ) => ({
        model: 'strong-model',
        text: 'Synthetic response',
        calls: [],
        requestId: 'synthetic',
        ...(input.reasoningEffort
          ? { reasoningEffort: input.reasoningEffort }
          : {
              webSearches: 1,
              webCitations: [
                {
                  url: 'https://developers.openai.com/workspace-agents/trigger-runs',
                  title: 'Official',
                },
              ],
            }),
      }),
    );
    const service = new SiwcCapabilityService(
      {
        ...db,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
      } as never,
      { owner, respond } as never,
    );
    await service.check(actor, {
      model: 'strong-model',
      reasoningEfforts: [effort],
      webSearch: true,
    });
    expect(
      await siwcCapabilities(db as never, 'org', 'generation', 'strong-model'),
    ).toMatchObject({
      reasoningModes: ['default', effort],
      webSearch: true,
      effortEvidence: { [effort]: 'PROVIDER_REPORTED' },
      receipts: [
        expect.objectContaining({
          requestedModel: 'strong-model',
          sentModel: 'strong-model',
          sentEffort: effort,
          evidenceLevel: 'PROVIDER_REPORTED',
          status: 'ACCEPTED',
        }),
        expect.any(Object),
      ],
    });
    expect(respond.mock.calls[0]?.[2]).toMatchObject({
      model: 'strong-model',
      reasoningEffort: effort,
    });
    expect(
      await siwcCapabilities(db as never, 'org', 'rotated', 'strong-model'),
    ).toMatchObject({ reasoningModes: ['default'], webSearch: false });
    await expect(
      service.check(actor, {
        model: 'cheap-model',
        reasoningEfforts: ['high'],
      }),
    ).rejects.toThrow('MODEL_NOT_AVAILABLE');
  },
);
it('never marks a silently changed model/effort or a response without actual web execution verified', async () => {
  let stored: unknown;
  const db = {
    systemSetting: {
      findUnique: async () => ({ value: stored }),
      upsert: async ({ create }: { create: { value: unknown } }) => {
        stored = create.value;
      },
    },
  };
  const service = new SiwcCapabilityService(
    {
      ...db,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    } as never,
    {
      owner: async () => ({ generation: 'g', models: [{ id: 'strong' }] }),
      respond: async () => ({
        model: 'other-model',
        reasoningEffort: 'low',
        text: 'Self report strong',
        calls: [],
        requestId: null,
      }),
    } as never,
  );
  await service.check(actor, {
    model: 'strong',
    reasoningEfforts: ['high'],
    webSearch: true,
  });
  expect(
    await siwcCapabilities(db as never, 'org', 'g', 'strong'),
  ).toMatchObject({ reasoningModes: ['default'], webSearch: false });
});

it('preserves previously verified capabilities when checking another capability, and removes a failed retest', async () => {
  let stored: unknown;
  const db = {
    systemSetting: {
      findUnique: async () => ({ value: stored }),
      upsert: async ({ create }: { create: { value: unknown } }) => {
        stored = create.value;
      },
    },
  };
  let fail = false;
  const service = new SiwcCapabilityService(
    {
      ...db,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    } as never,
    {
      owner: async () => ({ generation: 'g', models: [{ id: 'strong' }] }),
      respond: async (
        _a: unknown,
        _g: string,
        q: { reasoningEffort?: string },
      ) => {
        if (fail) throw new Error('synthetic refusal');
        return {
          model: 'strong',
          reasoningEffort: q.reasoningEffort,
          webSearches: 1,
          webCitations: [{ url: 'https://developers.openai.com/' }],
        };
      },
    } as never,
  );
  await service.check(actor, { model: 'strong', reasoningEfforts: ['high'] });
  await service.check(actor, { model: 'strong', webSearch: true });
  expect(
    await siwcCapabilities(db as never, 'org', 'g', 'strong'),
  ).toMatchObject({ reasoningModes: ['default', 'high'], webSearch: true });
  fail = true;
  await service.check(actor, { model: 'strong', reasoningEfforts: ['high'] });
  expect(
    await siwcCapabilities(db as never, 'org', 'g', 'strong'),
  ).toMatchObject({
    reasoningModes: ['default'],
    webSearch: true,
    effortEvidence: {},
  });
});

it('requires known-content native media evidence for the current model and generation and retains independent capabilities', async () => {
  let stored: unknown,
    correct = true;
  const db = {
    systemSetting: {
      findUnique: async () => ({ value: stored }),
      upsert: async ({ create }: { create: { value: unknown } }) => {
        stored = create.value;
      },
    },
  };
  const respond = vi.fn(async (_actor, _generation, request) => {
    expect(request.tools).toEqual([]);
    expect(request.input[0].content[0].text).not.toContain('7392');
    expect(request.input[0].content[1].type).toMatch(/^input_(image|file)$/);
    return {
      model: 'strong',
      text: correct ? 'E02-SIWC-7392' : 'Could not read supplied content',
      calls: [],
      requestId: 'synthetic-media',
    };
  });
  const service = new SiwcCapabilityService(
    {
      ...db,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    } as never,
    {
      owner: async () => ({ generation: 'g', models: [{ id: 'strong' }] }),
      respond,
    } as never,
  );
  await service.check(actor, {
    model: 'strong',
    imageInput: true,
    pdfInput: true,
  });
  expect(
    await siwcCapabilities(db as never, 'org', 'g', 'strong'),
  ).toMatchObject({
    imageInput: true,
    pdfInput: true,
    receipts: [
      expect.objectContaining({
        kind: 'native_image',
        status: 'LIVE_CONTENT_VERIFIED',
      }),
      expect.objectContaining({
        kind: 'native_pdf',
        status: 'LIVE_CONTENT_VERIFIED',
      }),
    ],
  });
  expect(
    await siwcCapabilities(db as never, 'org', 'rotated', 'strong'),
  ).toMatchObject({ imageInput: false, pdfInput: false });
  correct = false;
  await service.check(actor, { model: 'strong', imageInput: true });
  expect(
    await siwcCapabilities(db as never, 'org', 'g', 'strong'),
  ).toMatchObject({ imageInput: false, pdfInput: true });
});
