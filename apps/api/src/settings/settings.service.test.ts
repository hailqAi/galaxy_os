import 'reflect-metadata';
import { expect, it, vi } from 'vitest';
import { SettingsService } from './settings.service';
import { siwcPreference } from './siwc-capabilities';

it('stores a default only for the authenticated SIWC Owner after checking current model and effort', async () => {
  const actor = {
    administrationScope: 'SYSTEM',
    organizationId: 'org',
    userId: 'owner',
  } as never;
  const settings = new Map<string, unknown>();
  const db = {
    systemSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => {
        const value = settings.get(where.key);
        return value ? { value } : null;
      },
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { key: string };
          create: { value: unknown };
        }) => {
          settings.set(where.key, create.value);
          return { id: 'preference', ...create };
        },
      ),
    },
  };
  const owner = vi.fn(async () => ({
    generation: 'current',
    models: [{ id: 'gpt-6-astra' }],
  }));
  const respond = vi.fn();
  const audit = { write: vi.fn(async () => ({})) };
  const service = new SettingsService(
    {
      ...db,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    } as never,
    audit as never,
    { owner, respond } as never,
  );
  const capabilities = {
    generation: 'current',
    model: 'gpt-6-astra',
    reasoningModes: ['default', 'max'],
    effortEvidence: { max: 'PROVIDER_REPORTED' },
    webSearch: false,
    imageInput: false,
    pdfInput: false,
    receipts: [],
    checkedAt: '2026-10-12T00:00:00Z',
  };
  const { createHash } = await import('node:crypto');
  settings.set(
    'siwc.capabilities.org.' +
      createHash('sha256').update('gpt-6-astra').digest('hex'),
    capabilities,
  );
  await expect(
    service.setChatGptPreference(actor, {
      model: 'gpt-6-astra',
      reasoning: 'max',
    }),
  ).resolves.toEqual({ model: 'gpt-6-astra', reasoning: 'max' });
  expect(owner).toHaveBeenCalledWith(actor, undefined, db);
  expect(audit.write).toHaveBeenCalledWith(
    db,
    actor,
    expect.objectContaining({ action: 'chatgpt.preference.update' }),
  );
  expect(respond).not.toHaveBeenCalled();
  expect(await siwcPreference(db as never, actor)).toEqual({
    model: 'gpt-6-astra',
    reasoning: 'max',
  });
  expect(
    await siwcPreference(
      db as never,
      { organizationId: 'org', userId: 'other' } as never,
    ),
  ).toBeNull();
  expect(
    await siwcPreference(
      db as never,
      { organizationId: 'other', userId: 'owner' } as never,
    ),
  ).toBeNull();
  for (const value of [
    { model: 'missing', reasoning: 'max' },
    { model: 'gpt-6-astra', reasoning: 'ultra' },
    { model: 'gpt-6-astra', reasoning: 'max', serviceTier: 'priority' },
  ]) {
    await expect(async () =>
      service.setChatGptPreference(actor, value),
    ).rejects.toThrow();
  }
  settings.clear();
  await expect(
    service.setChatGptPreference(actor, {
      model: 'gpt-6-astra',
      reasoning: 'max',
    }),
  ).rejects.toThrow('SIWC_REASONING_UNVERIFIED');
  owner.mockRejectedValueOnce(new Error('CHATGPT_OWNER_ONLY'));
  await expect(
    service.setChatGptPreference(actor, {
      model: 'gpt-6-astra',
      reasoning: 'default',
    }),
  ).rejects.toThrow('CHATGPT_OWNER_ONLY');
  expect(db.systemSetting.upsert).toHaveBeenCalledTimes(1);
  expect(audit.write).toHaveBeenCalledTimes(1);
});
