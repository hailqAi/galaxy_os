import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  ChatGptConnectionService,
  CHATGPT_SCOPES,
} from './chatgpt-connection.service';
import { SettingsService } from './settings.service';
import { CurrentActor } from '../access-control/current-actor';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';

const actor = {
  userId: 'owner',
  organizationId: 'org',
  organizationMembershipId: 'member',
  sessionId: 'session',
  administrationScope: 'SYSTEM',
  permissions: ['system.settings.read', 'system.settings.update'],
} as CurrentActor;
const endpoints = {
  issuer: 'https://auth.openai.com',
  authorization_endpoint: 'https://auth.openai.com/api/accounts/authorize',
  token_endpoint: 'https://auth.openai.com/api/accounts/oauth/token',
  jwks_uri: 'https://auth.openai.com/.well-known/jwks.json',
  revocation_endpoint: 'https://auth.openai.com/api/accounts/oauth/revoke',
};
let service: ChatGptConnectionService,
  dir: string,
  permitted: boolean,
  sessionValid: boolean;
let rows: Map<string, { key: string; value: unknown }>, db: PrismaService;
let send: ReturnType<typeof vi.fn>;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let localJwks: ReturnType<typeof createLocalJWKSet>;
let time = 0;
const originalFetch = globalThis.fetch;
async function start() {
  const begun = await service.begin(actor);
  const authorize = new URL(
    await service.authorize(begun.startUrl.split('/').at(-1)!),
  );
  Object.assign(service, { jwks: localJwks });
  return authorize;
}
async function complete(
  scope = CHATGPT_SCOPES,
  changes: Record<string, unknown> = {},
) {
  const url = await start();
  const token = await new SignJWT({
    nonce: url.searchParams.get('nonce'),
    email: 'owner@example.test',
    ...changes,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject('subject')
    .setIssuer(endpoints.issuer)
    .setAudience('oaiapp_galaxy')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  send.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        id_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope,
      }),
      { status: 200 },
    ),
  );
  const callback = new URL(url.searchParams.get('redirect_uri')!);
  callback.search = new URLSearchParams({
    state: url.searchParams.get('state')!,
    code: 'code-secret',
    client_id: 'oaiapp_galaxy',
  }).toString();
  await service.callback(callback);
  return { url, callback };
}
beforeEach(async () => {
  time = Date.now();
  permitted = true;
  sessionValid = true;
  rows = new Map();
  let queue = Promise.resolve();
  const table = {
    findUnique: async ({ where }: { where: { key: string } }) =>
      rows.get(where.key) ?? null,
    findFirst: async ({
      where,
    }: {
      where: { key: { startsWith: string }; value?: { equals: string } };
    }) =>
      [...rows.values()].find((r) =>
        where.value
          ? (r.value as { startId?: string })?.startId === where.value.equals
          : r.key.startsWith(where.key.startsWith),
      ) ?? null,
    findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
      [...rows.values()].filter((r) => where.key.in.includes(r.key)),
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { key: string };
      create: { value: unknown };
      update: { value: unknown };
    }) => {
      const next = {
        key: where.key,
        value: structuredClone(
          rows.has(where.key) ? update.value : create.value,
        ),
      };
      rows.set(where.key, next);
      return next;
    },
    deleteMany: async ({ where }: { where: { key: string } }) => {
      rows.delete(where.key);
      return { count: 1 };
    },
  };
  db = {
    passwordCredential: {
      findUnique: async () => ({ mustChangePassword: false }),
    },
    systemSetting: table,
    $queryRaw: async () => [],
    auditLog: { findFirst: async () => null },
    $transaction: async (
      fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
      const before = queue;
      let release!: () => void;
      queue = new Promise<void>((r) => (release = r));
      await before;
      try {
        return await fn(db);
      } finally {
        release();
      }
    },
  } as unknown as PrismaService;
  const access = {
    freshActor: async (_: unknown, a: CurrentActor) => {
      if (!sessionValid) throw new Error('SESSION_REVOKED');
      return {
        ...a,
        permissionSources: permitted
          ? ['system.settings.read', 'system.settings.update'].map(
              (permission) => ({ permission, scopeType: 'SYSTEM' }),
            )
          : [],
      };
    },
  } as unknown as ProjectChatPolicy;
  dir = mkdtempSync(join(tmpdir(), 'galaxy-siwc-'));
  vi.stubEnv('GALAXY_CHATGPT_RUNTIME_PATH', dir);
  vi.stubEnv('GALAXY_CHATGPT_CALLBACK_PORT', '0');
  vi.stubEnv('NODE_ENV', 'test');
  send = vi.fn().mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/models')
            ? {
                models: [
                  {
                    slug: 'account-model',
                    display_name: 'Account model',
                    visibility: 'list',
                  },
                ],
              }
            : endpoints,
        ),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', send);
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  localJwks = createLocalJWKSet({
    keys: [{ ...jwk, kid: 'test', alg: 'RS256' }],
  });
  service = new ChatGptConnectionService(db, access, {
    write: vi.fn().mockResolvedValue({}),
  } as unknown as AuditService);
  await service.onModuleInit();
});
afterEach(async () => {
  await service.onModuleDestroy();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ChatGPT registration and lifecycle', () => {
  it('allows first registration without prior ID, grant, model or staff permission', async () => {
    const settings = new SettingsService(db, {} as AuditService, service);
    const m = await settings.chatGptConnection(actor);
    expect(m.canBeginAuth).toBe(true);
    expect(m.canStaffUseAI).toBe(false);
    expect(m.ownerInferenceVerified).toBe(false);
    const url = await start();
    expect(url.origin).toBe('https://auth.openai.com');
    expect(url.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(url.searchParams.get('agent_name_hint')).toBe('Galaxy OS');
    expect(url.searchParams.get('scope')).toBe(CHATGPT_SCOPES);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const health = await originalFetch(
      new URL('/auth/health', url.searchParams.get('redirect_uri')!),
    );
    expect(health.status).toBe(200);
  });
  it('denies non-SYSTEM and revoked Galaxy sessions', async () => {
    permitted = false;
    await expect(service.begin(actor)).rejects.toThrow('System Administrator');
    permitted = true;
    sessionValid = false;
    await expect(service.begin(actor)).rejects.toThrow('SESSION_REVOKED');
    expect(send).not.toHaveBeenCalled();
  });
  it('uses issued ID and exact callback; verifies identity separately from owner inference', async () => {
    const { url } = await complete();
    const tokenForm = send.mock.calls.find(
      (c) => c[0] === endpoints.token_endpoint,
    )![1].body as URLSearchParams;
    expect(tokenForm.get('client_id')).toBe('oaiapp_galaxy');
    expect(tokenForm.get('redirect_uri')).toBe(
      url.searchParams.get('redirect_uri'),
    );
    expect(
      createHash('sha256')
        .update(tokenForm.get('code_verifier')!)
        .digest('base64url'),
    ).toBe(url.searchParams.get('code_challenge'));
    const m = await service.metadata(actor);
    expect(m.identity?.label).toBe('owner@example.test');
    expect(m.canTestOwnerInference).toBe(true);
    const registry = await new SettingsService(
      db,
      {} as AuditService,
      service,
    ).chatGptConnection(actor);
    expect(
      registry.tools.filter((t) => t.status === 'AVAILABLE').map((t) => t.name),
    ).toEqual([
      'count_projects',
      'task_list',
      'task_get',
      'task_history',
      'search_project_memory',
      'read_project_memory',
      'search_conversation_history',
      'create_document',
      'revise_draft',
      'search_project_sources',
      'read_project_source',
      'read_project_records',
      'calculate',
      'analyze_table',
    ]);
    expect(m.ownerInferenceVerified).toBe(false);
    expect(m.canStaffUseAI).toBe(false);
    expect(JSON.stringify([...rows.values()])).not.toMatch(
      /access-secret|refresh-secret|code-secret/,
    );
    const settings = new SettingsService(db, {} as AuditService, service);
    expect(await settings.system(actor)).toEqual([]);
  });
  it('retains identity without a plan grant but rejects inference', async () => {
    await complete('openid email');
    expect((await service.metadata(actor)).identity).not.toBeNull();
    expect((await service.metadata(actor)).canTestOwnerInference).toBe(false);
    await expect(service.owner(actor)).rejects.toThrow(
      'CHATGPT_RECONNECT_OR_GRANT_REQUIRED',
    );
  });
  it('rejects another SYSTEM actor using the owner connection', async () => {
    await complete();
    await expect(service.owner({ ...actor, userId: 'other' })).rejects.toThrow(
      'CHATGPT_OWNER_ONLY',
    );
  });
  it('rejects wrong state and replay', async () => {
    const { callback } = await complete();
    await expect(service.callback(callback)).rejects.toThrow('INVALID_STATE');
    callback.searchParams.set('state', 'a'.repeat(43));
    await expect(service.callback(callback)).rejects.toThrow('INVALID_STATE');
  });
  it('rejects nonce mismatch', async () => {
    await expect(complete(CHATGPT_SCOPES, { nonce: 'wrong' })).rejects.toThrow(
      'OAUTH_VERIFICATION_FAILED',
    );
    expect((await service.metadata(actor)).identity).toBeNull();
  });
  it('expires attempts and rejects duplicate callback parameters', async () => {
    const url = await start();
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({
      state: url.searchParams.get('state')!,
      code: 'code',
      client_id: 'oaiapp_galaxy',
    }).toString();
    vi.spyOn(Date, 'now').mockReturnValue(time + 700000);
    await expect(service.callback(callback)).rejects.toThrow('INVALID_STATE');
    callback.searchParams.append('state', 'wrong');
    await expect(service.callback(callback)).rejects.toThrow(
      'DUPLICATE_CALLBACK_PARAMETER',
    );
  });
  it('consent denial consumes state without exchanging code', async () => {
    const url = await start();
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({
      state: url.searchParams.get('state')!,
      error: 'access_denied',
    }).toString();
    send.mockClear();
    await service.callback(callback);
    expect(send).not.toHaveBeenCalled();
    expect((await service.metadata(actor)).status).toBe('CONSENT_DECLINED');
    await expect(service.callback(callback)).rejects.toThrow('INVALID_STATE');
  });
  it('cancel rejects a late callback', async () => {
    const url = await start();
    await service.cancel(actor);
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({
      state: url.searchParams.get('state')!,
      code: 'code',
      client_id: 'oaiapp_galaxy',
    }).toString();
    await expect(service.callback(callback)).rejects.toThrow('INVALID_STATE');
  });
  it('rechecks permission after starting authorization', async () => {
    const url = await start();
    permitted = false;
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({
      state: url.searchParams.get('state')!,
      code: 'code',
      client_id: 'oaiapp_galaxy',
    }).toString();
    await expect(service.callback(callback)).rejects.toThrow(
      'System Administrator',
    );
  });
  it('persists registration and host ID across restart', async () => {
    const { url } = await complete();
    await service.onModuleDestroy();
    await service.onModuleInit();
    expect((await service.metadata(actor)).registration?.clientId).toBe(
      'oaiapp_galaxy',
    );
    const again = await start();
    expect(again.searchParams.get('client_id')).toBe('oaiapp_galaxy');
    expect(again.searchParams.get('agent_name_hint')).toBeNull();
    expect(again.searchParams.get('ext_agent_host_id')).toBe(
      url.searchParams.get('ext_agent_host_id'),
    );
  });
  it('disconnect clears credentials and confirms remote revocation independently', async () => {
    await complete();
    send.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await service.disconnect(actor);
    expect(result.revocation).toBe('CONFIRMED');
    expect(result.canTestOwnerInference).toBe(false);
    expect(result.registration?.clientId).toBe('oaiapp_galaxy');
    await expect(service.owner(actor)).rejects.toThrow();
  });
  it('network failure keeps connection credentials', async () => {
    await complete();
    send.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(service.catalog(actor)).rejects.toThrow('network unavailable');
    expect((await service.metadata(actor)).canTestOwnerInference).toBe(true);
  });
});

it('serializes rotating refreshes across service instances and saves the replacement atomically', async () => {
  await complete();
  const other = new ChatGptConnectionService(
    db,
    service['access'],
    service['audit'],
  );
  await other.onModuleInit();
  try {
    vi.spyOn(Date, 'now').mockReturnValue(time + 3600001);
    send.mockClear();
    send.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === endpoints.token_endpoint
              ? {
                  access_token: 'rotated-access',
                  refresh_token: 'rotated-refresh',
                  token_type: 'Bearer',
                  expires_in: 3600,
                  scope: CHATGPT_SCOPES,
                }
              : url.endsWith('/models')
                ? { models: [] }
                : endpoints,
          ),
          { status: 200 },
        ),
    );
    await Promise.all([service.catalog(actor), other.catalog(actor)]);
    const refreshes = send.mock.calls.filter(
      (c) => c[0] === endpoints.token_endpoint,
    );
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]![1].body.get('refresh_token')).toBe('refresh-secret');
    expect(refreshes[0]![1].body.has('scope')).toBe(false);
  } finally {
    await other.onModuleDestroy();
  }
});
it('terminal refresh failure requires reauthorization but retains issued registration', async () => {
  await complete();
  vi.spyOn(Date, 'now').mockReturnValue(time + 3600001);
  send.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
  );
  await expect(service.catalog(actor)).rejects.toThrow();
  const m = await service.metadata(actor);
  expect(m.status).toBe('REAUTH_REQUIRED');
  expect(m.registration?.clientId).toBe('oaiapp_galaxy');
  expect(m.canTestOwnerInference).toBe(false);
});
it('an ambiguous refresh timeout is not retried with the old rotating token', async () => {
  await complete();
  vi.spyOn(Date, 'now').mockReturnValue(time + 3600001);
  send.mockClear();
  send.mockRejectedValue(new Error('network timeout'));
  await expect(service.catalog(actor)).rejects.toThrow();
  await expect(service.catalog(actor)).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(1);
  expect((await service.metadata(actor)).error?.code).toBe(
    'REFRESH_OUTCOME_UNKNOWN',
  );
});
it('cannot recreate a missing encryption key over persisted registrations', async () => {
  await complete();
  await service.onModuleDestroy();
  rmSync(join(dir, 'host.json'));
  await service.onModuleInit();
  await expect(service.begin(actor)).rejects.toThrow(
    'RUNTIME_KEY_OR_LISTENER_ERROR',
  );
});
it('a callback in flight cannot reactivate a disconnected connection', async () => {
  const url = await start();
  let resolve!: (r: Response) => void;
  send.mockImplementationOnce(
    () => new Promise<Response>((r) => (resolve = r)),
  );
  const callback = new URL(url.searchParams.get('redirect_uri')!);
  callback.search = new URLSearchParams({
    state: url.searchParams.get('state')!,
    code: 'secret',
    client_id: 'oaiapp_galaxy',
  }).toString();
  const result = service.callback(callback);
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  await service.disconnect(actor);
  const token = await new SignJWT({ nonce: url.searchParams.get('nonce') })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject('subject')
    .setIssuer(endpoints.issuer)
    .setAudience('oaiapp_galaxy')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  resolve(
    new Response(
      JSON.stringify({
        access_token: 'late-secret',
        refresh_token: 'late-refresh',
        id_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: CHATGPT_SCOPES,
      }),
    ),
  );
  await expect(result).rejects.toThrow();
  expect((await service.metadata(actor)).status).toBe('DISCONNECTED');
  expect((await service.metadata(actor)).canTestOwnerInference).toBe(false);
});
it('blocks another begin while token exchange is running and allows cancelling that exchange', async () => {
  const url = await start();
  let resolve!: (r: Response) => void;
  send.mockImplementationOnce(
    () => new Promise<Response>((r) => (resolve = r)),
  );
  const callback = new URL(url.searchParams.get('redirect_uri')!);
  callback.search = new URLSearchParams({
    state: url.searchParams.get('state')!,
    code: 'secret',
    client_id: 'oaiapp_galaxy',
  }).toString();
  const result = service.callback(callback).catch(() => undefined);
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  try {
    expect((await service.metadata(actor)).canCancel).toBe(true);
    await expect(service.begin(actor)).rejects.toThrow('AUTH_ALREADY_PENDING');
  } finally {
    await service.cancel(actor);
    resolve(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    );
    await result;
  }
});
it('audits lifecycle transitions without recording credentials or OAuth secrets', async () => {
  await complete();
  send.mockResolvedValueOnce(new Response(null, { status: 200 }));
  await service.disconnect(actor);
  const records = service['audit'].write as ReturnType<typeof vi.fn>;
  expect(records.mock.calls.map((c) => c[2].action)).toEqual(
    expect.arrayContaining([
      'chatgpt.connection.begin',
      'chatgpt.connection.activate',
      'chatgpt.connection.disconnect',
    ]),
  );
  expect(JSON.stringify(records.mock.calls.map((c) => c[2]))).not.toMatch(
    /access-secret|refresh-secret|code-secret|code_verifier|id_token|state/,
  );
});

it.each(['issuer', 'audience', 'expired', 'signature'])(
  'rejects invalid ID token %s',
  async (kind) => {
    const url = await start();
    const key =
      kind === 'signature'
        ? (await generateKeyPair('RS256')).privateKey
        : privateKey;
    const token = await new SignJWT({ nonce: url.searchParams.get('nonce') })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setSubject('subject')
      .setIssuer(
        kind === 'issuer' ? 'https://invalid.example' : endpoints.issuer,
      )
      .setAudience(kind === 'audience' ? 'wrong-client' : 'oaiapp_galaxy')
      .setIssuedAt()
      .setExpirationTime(
        kind === 'expired' ? Math.floor(Date.now() / 1000) - 60 : '1h',
      )
      .sign(key);
    send.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'access',
          id_token: token,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: CHATGPT_SCOPES,
        }),
      ),
    );
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({
      state: url.searchParams.get('state')!,
      code: 'secret',
      client_id: 'oaiapp_galaxy',
    }).toString();
    await expect(service.callback(callback)).rejects.toThrow(
      'OAUTH_VERIFICATION_FAILED',
    );
    expect((await service.metadata(actor)).identity).toBeNull();
  },
);

it('clears the previous revocation message after successful reconnection', async () => {
  await complete();
  send.mockResolvedValueOnce(new Response(null, { status: 200 }));
  await service.disconnect(actor);
  await complete();
  const metadata = await service.metadata(actor);
  expect(metadata.revocation).toBe('NOT_RUN');
  expect(metadata.canTestOwnerInference).toBe(true);
});

it('cancel fences existing credentials as well as a late callback', async () => {
  await complete();
  await service.begin(actor);
  await service.cancel(actor);
  expect((await service.metadata(actor)).canTestOwnerInference).toBe(false);
  await expect(service.owner(actor)).rejects.toThrow(
    'CHATGPT_RECONNECT_OR_GRANT_REQUIRED',
  );
});
it('expired non-refreshable credentials require a new connection', async () => {
  await complete();
  await service['locked'](actor.organizationId, async (tx, record) => {
    record.credentials!.refresh_token = undefined;
    record.credentials!.expiresAt = 0;
    await service['save'](actor.organizationId, record, tx);
  });
  await expect(service.catalog(actor)).rejects.toThrow(
    'CHATGPT_REAUTH_REQUIRED',
  );
  expect((await service.metadata(actor)).status).toBe('REAUTH_REQUIRED');
});

it('revoking SYSTEM after connection stops owner inference', async () => {
  await complete();
  permitted = false;
  send.mockClear();
  await expect(service.catalog(actor)).rejects.toThrow('System Administrator');
  expect(send).not.toHaveBeenCalled();
});
it('persists an unknown refresh outcome before network and never replays it after restart', async () => {
  await complete();
  vi.spyOn(Date, 'now').mockReturnValue(time + 3600001);
  let crashRows: typeof rows | undefined;
  send.mockImplementationOnce(async () => {
    crashRows = structuredClone(rows);
    return new Response(
      JSON.stringify({
        access_token: 'rotated',
        refresh_token: 'replacement',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: CHATGPT_SCOPES,
      }),
    );
  });
  await service.catalog(actor);
  expect(crashRows).toBeDefined();
  rows = crashRows!;
  vi.spyOn(Date, 'now').mockReturnValue(time + 3620001);
  await service.onModuleDestroy();
  await service.onModuleInit();
  send.mockClear();
  await expect(service.catalog(actor)).rejects.toThrow(
    'REFRESH_OUTCOME_UNKNOWN',
  );
  expect(send).not.toHaveBeenCalled();
});

it('persists rotated credentials even when the replacement grant loses plan scope', async () => {
  await complete();
  vi.spyOn(Date, 'now').mockReturnValue(time + 3600001);
  send.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email',
      }),
    ),
  );
  await expect(service.catalog(actor)).rejects.toThrow(
    'CHATGPT_GRANT_REQUIRED',
  );
  const record = await service['read'](actor.organizationId);
  expect(record.credentials?.refresh_token).toBe('new-refresh');
  expect((await service.metadata(actor)).status).toBe('IDENTITY_VERIFIED');
  expect((await service.metadata(actor)).canTestOwnerInference).toBe(false);
});

it('a late completed response cannot erase an unresolved refresh', async () => {
  await complete();
  const generation = (await service.owner(actor)).generation;
  let deliver!: (value: Response) => void;
  send.mockImplementationOnce(
    () => new Promise<Response>((resolve) => (deliver = resolve)),
  );
  const responding = service.respond(
    actor,
    generation,
    { model: 'account-model', input: [{ role: 'user', content: 'Hello' }] },
    new AbortController().signal,
  );
  await vi.waitFor(() => expect(deliver).toBeTypeOf('function'));
  vi.spyOn(Date, 'now').mockReturnValue(time + 3600001);
  send.mockRejectedValueOnce(new Error('network timeout'));
  await expect(service.catalog(actor)).rejects.toThrow();
  deliver(
    new Response(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: {
            status: 'completed',
            model: 'account-model',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'Hello' }],
              },
            ],
          },
        }) +
        '\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    ),
  );
  await responding;
  send.mockClear();
  await expect(service.catalog(actor)).rejects.toThrow(
    'REFRESH_OUTCOME_UNKNOWN',
  );
  expect(send).not.toHaveBeenCalled();
  expect((await service.metadata(actor)).canTestOwnerInference).toBe(false);
});
it('disconnect during rotation cannot falsely confirm revocation of the replacement', async () => {
  await complete();
  vi.spyOn(Date, 'now').mockReturnValue(time + 3600001);
  let deliver!: (value: Response) => void;
  send.mockImplementationOnce(
    () => new Promise<Response>((resolve) => (deliver = resolve)),
  );
  const refreshing = service.catalog(actor);
  const rejection = expect(refreshing).rejects.toThrow();
  await vi.waitFor(() => expect(deliver).toBeTypeOf('function'));
  send.mockResolvedValueOnce(new Response(null, { status: 200 }));
  const disconnected = await service.disconnect(actor);
  deliver(
    new Response(
      JSON.stringify({
        access_token: 'rotated',
        refresh_token: 'replacement',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: CHATGPT_SCOPES,
      }),
    ),
  );
  await rejection;
  expect(disconnected.revocation).toBe('UNCONFIRMED');
  expect(disconnected.canTestOwnerInference).toBe(false);
});

it('refresh preserves a concurrent callback verification until activation', async () => {
  await complete();
  vi.spyOn(Date, 'now').mockReturnValue(time + 3600001);
  let refreshReply!: (value: Response) => void;
  send.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        refreshReply = resolve;
      }),
  );
  const refreshing = service.catalog(actor);
  await vi.waitFor(() => expect(refreshReply).toBeTypeOf('function'));
  const url = await start();
  const idToken = await new SignJWT({ nonce: url.searchParams.get('nonce') })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject('subject')
    .setIssuer(endpoints.issuer)
    .setAudience('oaiapp_galaxy')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  let callbackReply!: (value: Response) => void;
  send.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        callbackReply = resolve;
      }),
  );
  const callback = new URL(url.searchParams.get('redirect_uri')!);
  callback.search = new URLSearchParams({
    state: url.searchParams.get('state')!,
    code: 'new-code',
    client_id: 'oaiapp_galaxy',
  }).toString();
  const completing = service.callback(callback);
  const completion = expect(completing).resolves.toBeUndefined();
  await vi.waitFor(() => expect(callbackReply).toBeTypeOf('function'));
  refreshReply(
    new Response(
      JSON.stringify({
        access_token: 'rotated',
        refresh_token: 'replacement',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: CHATGPT_SCOPES,
      }),
    ),
  );
  await refreshing;
  const statusDuringVerification = (await service.metadata(actor)).status;
  callbackReply(
    new Response(
      JSON.stringify({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: CHATGPT_SCOPES,
      }),
    ),
  );
  await completion;
  expect(statusDuringVerification).toBe('VERIFYING_IDENTITY');
  expect((await service.metadata(actor)).canTestOwnerInference).toBe(true);
});
