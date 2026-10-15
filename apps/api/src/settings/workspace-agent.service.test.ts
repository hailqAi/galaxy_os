import 'reflect-metadata';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { CurrentActor } from '../access-control/current-actor';
import { WorkspaceAgentService } from './workspace-agent.service';

const actor = {
  userId: randomUUID(),
  organizationId: randomUUID(),
  organizationMembershipId: randomUUID(),
  sessionId: randomUUID(),
  administrationScope: 'SYSTEM',
  permissions: ['system.settings.read', 'system.settings.update', 'ai.invoke'],
  permissionSources: [
    'system.settings.read',
    'system.settings.update',
    'ai.invoke',
  ].map((permission) => ({ permission, scopeType: 'SYSTEM' })),
} as unknown as CurrentActor;
const projectId = randomUUID();
let dir: string;
let rows: Map<string, { key: string; value: unknown }>;
let revoked = false;
let projectVisible = true;
function setup() {
  const events: unknown[] = [];
  const tx = {
    project: {
      findFirst: async () => (projectVisible ? { id: projectId } : null),
    },
    systemSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        rows.get(where.key) ?? null,
      findFirst: async () => (rows.size ? [...rows.values()][0] : null),
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (rows.has(data.key)) throw { code: 'P2002' };
        rows.set(data.key, data);
        return data;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { key: string; value: { path: string[]; equals: string } };
        data: { value: unknown };
      }) => {
        const old = rows.get(where.key)?.value as
          | { revision: string }
          | undefined;
        if (old?.revision !== where.value.equals) return { count: 0 };
        rows.set(where.key, { key: where.key, value: data.value });
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: { data: unknown }) => {
        events.push(data);
        return data;
      },
    },
  };
  const policy = {
    live: async () => {
      if (revoked) throw new Error('AUTH_REVOKED');
    },
    freshActor: async (_tx: unknown, a: CurrentActor) => a,
    authority: async (
      _tx: unknown,
      a: CurrentActor,
      id: string,
      action: string,
    ) => {
      if (action != 'INVOKE') throw new Error('INVALID_GRANT_ACTION');
      if (
        a.userId !== actor.userId ||
        a.organizationId !== actor.organizationId ||
        id !== projectId
      )
        throw new Error('PROJECT_DENIED');
      return { id: 'grant' };
    },
  };
  const db = {
    ...tx,
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  };
  return {
    service: new WorkspaceAgentService(db as never, policy as never),
    events,
  };
}
const configuration = (expectedVersion: string | null = null) => ({
  expectedVersion,
  workspaceId: 'workspace-synthetic',
  accessToken: 'synthetic-workspace-secret',
  bindings: [
    {
      id: randomUUID(),
      projectId,
      requestedModel: 'account-model',
      configuredModel: 'account-model',
      effort: 'high',
      agentId: 'agt_synthetic',
      channelId: 'agtch_synthetic',
    },
  ],
});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'e01-workspace-settings-'));
  chmodSync(dir, 0o700);
  vi.stubEnv('GALAXY_WORKSPACE_RUNTIME_DIR', dir);
  rows = new Map();
  revoked = false;
  projectVisible = true;
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
it('stores Workspace credentials encrypted and returns only masked, unverified metadata', async () => {
  const { service, events } = setup();
  expect(await service.metadata(actor)).toMatchObject({
    status: 'WORKSPACE_DEFERRED_BY_USER',
    revision: null,
  });
  expect(existsSync(join(dir, 'key.bin'))).toBe(false);
  const result = await service.configure(actor, configuration());
  expect(result).toMatchObject({
    status: 'WORKSPACE_DEFERRED_BY_USER',
    hasCredential: true,
    observedModel: null,
  });
  expect(JSON.stringify([...rows.values()])).not.toContain(
    'synthetic-workspace-secret',
  );
  expect(JSON.stringify(result)).not.toContain('synthetic-workspace-secret');
  expect(JSON.stringify(events)).not.toContain('synthetic-workspace-secret');
  expect(readFileSync(join(dir, 'key.bin'))).toHaveLength(32);
  expect(await setup().service.metadata(actor)).toEqual(result);
});
it('checks current SYSTEM permission, session and Project grant rather than trusting input scope', async () => {
  const { service } = setup();
  await expect(
    service.configure(
      { ...actor, administrationScope: 'SELF' },
      configuration(),
    ),
  ).rejects.toThrow();
  await expect(
    service.metadata({ ...actor, permissionSources: [] }),
  ).rejects.toThrow();
  revoked = true;
  await expect(service.configure(actor, configuration())).rejects.toThrow(
    'AUTH_REVOKED',
  );
  revoked = false;
  const foreign = configuration();
  foreign.bindings[0]!.projectId = randomUUID();
  await expect(service.configure(actor, foreign)).rejects.toThrow(
    'PROJECT_DENIED',
  );
  expect(rows.size).toBe(0);
});
it('uses compare-and-swap and a new credential revision, without accepting a forged verification', async () => {
  const { service } = setup();
  const first = await service.configure(actor, configuration());
  await expect(service.configure(actor, configuration())).rejects.toThrow(
    'WORKSPACE_CONFIG_CHANGED',
  );
  await expect(
    service.configure(actor, {
      ...configuration(first.revision),
      verified: true,
    }),
  ).rejects.toThrow();
  const next = await service.configure(actor, configuration(first.revision));
  expect(next.revision).not.toBe(first.revision);
  expect(next.status).toBe('WORKSPACE_DEFERRED_BY_USER');
});
it('does not confuse an entered model name with published proof or observed telemetry', async () => {
  const { service } = setup();
  await service.configure(actor, configuration());
  await expect(
    service.resolveBinding(actor, projectId, 'account-model', 'high'),
  ).rejects.toThrow('MODEL_BINDING_UNVERIFIED');
  await expect(
    service.resolveBinding(actor, projectId, 'different-model', 'high'),
  ).rejects.toThrow('MODEL_BINDING_UNSUPPORTED');
  await expect(
    service.resolveBinding(
      { ...actor, organizationId: randomUUID() },
      projectId,
      'account-model',
      'high',
    ),
  ).rejects.toThrow();
});
it('rejects unsafe key paths, missing keys and ciphertext tampering without exposing credentials', async () => {
  const { service } = setup();
  const first = await service.configure(actor, configuration());
  chmodSync(join(dir, 'key.bin'), 0o644);
  await expect(service.metadata(actor)).rejects.toThrow(
    'WORKSPACE_KEY_UNAVAILABLE',
  );
  chmodSync(join(dir, 'key.bin'), 0o600);
  unlinkSync(join(dir, 'key.bin'));
  await expect(
    service.configure(actor, configuration(first.revision)),
  ).rejects.toThrow('WORKSPACE_KEY_UNAVAILABLE');
  expect(existsSync(join(dir, 'key.bin'))).toBe(false);
  symlinkSync('/etc/passwd', join(dir, 'key.bin'));
  await expect(service.metadata(actor)).rejects.toThrow(
    'WORKSPACE_KEY_UNAVAILABLE',
  );
});
it('requires an absolute private host-key directory', async () => {
  vi.stubEnv('GALAXY_WORKSPACE_RUNTIME_DIR', 'relative-workspace-path');
  await expect(
    setup().service.configure(actor, configuration()),
  ).rejects.toThrow('WORKSPACE_KEY_UNAVAILABLE');
});
it('rejects ciphertext moved to another organization and altered authentication tags', async () => {
  const { service } = setup();
  await service.configure(actor, configuration());
  const saved = [...rows.values()][0]!;
  const foreignActor = { ...actor, organizationId: randomUUID() };
  rows.set('workspace.agents.' + foreignActor.organizationId, {
    key: 'workspace.agents.' + foreignActor.organizationId,
    value: saved.value,
  });
  await expect(service.metadata(foreignActor)).rejects.toThrow(
    'WORKSPACE_CONFIG_UNREADABLE',
  );
  (saved.value as { tag: string }).tag = 'AA==';
  await expect(service.metadata(actor)).rejects.toThrow(
    'WORKSPACE_CONFIG_UNREADABLE',
  );
});

it('rechecks IAM Project scope for connector consent even when an INVOKE grant remains', async () => {
  const { service } = setup();
  const config = configuration();
  await service.configure(actor, config);
  projectVisible = false;
  const db = setup();
  await expect(
    db.service.connectorBinding(
      {
        systemSetting: {
          findUnique: async ({ where }: { where: { key: string } }) =>
            rows.get(where.key),
        },
        project: { findFirst: async () => null },
      } as never,
      actor,
      config.bindings[0]!.id,
    ),
  ).rejects.toThrow('WORKSPACE_BINDING_DENIED');
});

it('lists only the current actor and Project Workspace bindings independently from SIWC', async () => {
  const { service } = setup();
  await service.configure(actor, configuration());
  expect(await service.projectBindings(actor, projectId)).toMatchObject([
    {
      requestedModel: 'account-model',
      effort: 'high',
      verification: 'UNVERIFIED',
    },
  ]);
  await expect(
    service.projectBindings({ ...actor, userId: randomUUID() }, projectId),
  ).rejects.toThrow('PROJECT_DENIED');
  projectVisible = false;
  await expect(service.projectBindings(actor, projectId)).rejects.toThrow();
});

it('requires hashed private inspection evidence and exposes configuration evidence without inventing run telemetry', async () => {
  const { service } = setup(),
    config = configuration();
  const saved = await service.configure(actor, config),
    binding = config.bindings[0]!;
  mkdirSync(join(dir, 'bindings'), { mode: 0o700 });
  const publishedConfiguration = {
    agentId: binding.agentId,
    channelId: binding.channelId,
    configuredModel: binding.configuredModel,
    effort: binding.effort,
    state: 'PUBLISHED',
    visibility: 'PRIVATE',
    version: 'synthetic-published-1',
  };
  const packet = JSON.stringify({
    publishedConfiguration,
    officialModelIdentity: {
      modelId: binding.configuredModel,
      url: 'https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference',
      contentSha256: 'c'.repeat(64),
    },
  });
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const proof = {
    formatVersion: 1,
    source: 'OFFICIAL_PUBLISHED_CONFIGURATION_INSPECTION',
    credentialRevision: saved.revision,
    bindingId: binding.id,
    agentId: binding.agentId,
    channelId: binding.channelId,
    configuredModel: binding.configuredModel,
    effort: binding.effort,
    publishedDigest: hash(JSON.stringify(publishedConfiguration)),
    officialModelEvidence:
      'https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference',
    evidenceDigest: hash(packet),
    entitlementVerified: true,
    privatePilotVerified: true,
    scopedConnectorVerified: true,
    textDestinationVerified: true,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  writeFileSync(
    join(dir, 'bindings', binding.id + '.json'),
    JSON.stringify(proof),
    { mode: 0o600 },
  );
  await expect(
    service.resolveBinding(actor, projectId, 'account-model', 'high'),
  ).rejects.toThrow('MODEL_BINDING_UNVERIFIED');
  writeFileSync(join(dir, 'bindings', binding.id + '.evidence.json'), packet, {
    mode: 0o600,
  });
  expect(
    await service.resolveBinding(actor, projectId, 'account-model', 'high'),
  ).toMatchObject({
    modelEvidenceLevel: 'CONFIG_VERIFIED',
    observedModel: null,
  });
  expect(await service.metadata(actor)).toMatchObject({
    status: 'WORKSPACE_DEFERRED_BY_USER',
    observedModel: null,
    bindings: [{ verification: 'CONFIG_VERIFIED' }],
  });
  writeFileSync(
    join(dir, 'bindings', binding.id + '.evidence.json'),
    packet + ' ',
    { mode: 0o600 },
  );
  await expect(
    service.resolveBinding(actor, projectId, 'account-model', 'high'),
  ).rejects.toThrow('MODEL_BINDING_UNVERIFIED');
});

it('rejects reusing one published agent across separate Project principals before isolation is verified', async () => {
  const { workspaceConfigInput } = await import('./workspace-agent.dto');
  const config = configuration();
  config.bindings.push({
    ...config.bindings[0]!,
    id: randomUUID(),
    projectId: randomUUID(),
    channelId: 'agtch_other_project',
  });
  expect(workspaceConfigInput.safeParse(config).success).toBe(false);
});
