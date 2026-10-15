import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../src/prisma.service';
import { ProjectChatPolicy } from '../src/access-control/project-chat.policy';
import { CurrentActor } from '../src/access-control/current-actor';
import { AuditService } from '../src/audit/audit.service';
import {
  ChatGptConnectionService,
  CHATGPT_SCOPES,
} from '../src/settings/chatgpt-connection.service';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';
assertG00Isolation();
const db = new PrismaService();
let service: ChatGptConnectionService,
  actor: CurrentActor,
  directory: string,
  sessionId: string,
  oldMustChange: boolean;
beforeAll(async () => {
  const user = await db.user.findUniqueOrThrow({
    where: { email: 'admin@galaxy.local' },
    include: { credential: true },
  });
  oldMustChange = user.credential!.mustChangePassword;
  await db.passwordCredential.update({
    where: { userId: user.id },
    data: { mustChangePassword: false },
  });
  const member = await db.organizationMembership.findFirstOrThrow({
    where: { userId: user.id, status: 'active' },
  });
  const session = await db.session.create({
    data: {
      userId: user.id,
      organizationMembershipId: member.id,
      tokenHash: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
      lastSeenAt: new Date(),
    },
  });
  sessionId = session.id;
  actor = {
    userId: user.id,
    organizationId: member.organizationId,
    organizationMembershipId: member.id,
    sessionId,
    permissions: [],
    permissionSources: [],
    administrationScope: 'SYSTEM',
    mustChangePassword: false,
    email: '',
    displayName: '',
    administrationTier: 0,
    managedDepartmentIds: [],
  };
  expect(
    await db.systemSetting.findUnique({
      where: { key: 'chatgpt.connection.' + actor.organizationId },
    }),
  ).toBeNull();
  directory = mkdtempSync(join(tmpdir(), 'siwc-postgres-'));
  writeFileSync(
    join(directory, 'host.json'),
    JSON.stringify({
      key: randomBytes(32).toString('base64'),
      hostId: 'urn:uuid:' + randomUUID(),
    }),
    { mode: 0o600 },
  );
  vi.stubEnv('GALAXY_CHATGPT_RUNTIME_PATH', directory);
  vi.stubEnv('GALAXY_CHATGPT_CALLBACK_PORT', '0');
  service = new ChatGptConnectionService(
    db,
    new ProjectChatPolicy(db),
    new AuditService(db),
  );
  await service.onModuleInit();
  await db.$transaction((tx) =>
    service['save'](
      actor.organizationId,
      {
        generation: 'generation',
        owner: {
          userId: actor.userId,
          organizationId: actor.organizationId,
          organizationMembershipId: actor.organizationMembershipId,
          sessionId,
        },
        identity: {
          issuer: 'https://auth.openai.com',
          subject: 'fixture',
          label: 'fixture',
        },
        clientId: 'oaiapp_fixture',
        scopes: CHATGPT_SCOPES.split(' '),
        credentials: {
          access_token: 'synthetic',
          expiresAt: Date.now() + 3600000,
        },
        status: 'OWNER_READY',
        models: [],
        catalogAt: null,
        verifiedAt: null,
        revocation: 'NOT_RUN',
      },
      tx,
    ),
  );
});
afterAll(async () => {
  if (actor) {
    await db.systemSetting.deleteMany({
      where: { key: 'chatgpt.connection.' + actor.organizationId },
    });
    await db.passwordCredential.update({
      where: { userId: actor.userId },
      data: { mustChangePassword: oldMustChange },
    });
  }
  if (sessionId) await db.session.deleteMany({ where: { id: sessionId } });
  await service?.onModuleDestroy();
  await db.$disconnect();
  if (directory) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it('serializes disconnect with the final Project transaction through its commit', async () => {
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => (reached = r)),
    finish = new Promise<void>((r) => (release = r));
  const publication = db.$transaction(
    async (tx) => {
      await service.owner(actor, 'generation', tx);
      reached();
      await finish;
    },
    { timeout: 5000 },
  );
  await ready;
  const disconnect = service.disconnect(actor);
  try {
    const crossed = await Promise.race([
      disconnect.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 200)),
    ]);
    expect(crossed).toBe(false);
  } finally {
    release();
    await publication;
    await disconnect;
  }
  expect((await service.metadata(actor)).status).toBe('DISCONNECTED');
});
