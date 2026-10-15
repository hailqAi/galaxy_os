import { Prisma, PrismaClient } from '@prisma/client';
import 'reflect-metadata';
import { INestApplication, ValidationPipe, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuditService } from '../src/audit/audit.service';
import { ChatGptConnectionService } from '../src/settings/chatgpt-connection.service';
import { ProjectAiMemoryService } from '../src/project-chat/project-ai-memory.service';
import { memoryDigest } from '../src/project-chat/project-ai-memory.service';
import { savedMemoryCitations } from '../src/project-chat/ai-tools';
import { FileStorage } from '../src/files/file-storage';
import { chunks } from '../src/project-chat/ai-source';
import { ProjectStageTwoService } from '../src/projects/project-stage-two.service';
import { ProjectChatPolicy } from '../src/access-control/project-chat.policy';
import { CurrentActor } from '../src/access-control/current-actor';
import {
  executionMetadata,
  requestMetadata,
} from '../src/project-chat/ai-registry';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

const isolated = assertG00Isolation();
const db = new PrismaClient();
const digest = 'a'.repeat(64);
const run = randomUUID(),
  password = 'p1-memory-synthetic-only';
const accounts: Record<string, { id: string; email: string; cookie: string }> =
  {};
let app: INestApplication, directory: string;
let organizationId: string,
  otherOrganizationId: string,
  ownerId: string,
  otherOwnerId: string;
const projects: Record<string, string> = {};
const sources: Record<
  string,
  { conversation: string; answer: string; message: string; index: string }
> = {};

beforeAll(async () => {
  expect(
    await db.$queryRaw`SELECT current_database() AS database,current_user AS username`,
  ).toEqual([
    { database: isolated.databaseName, username: isolated.databaseUser },
  ]);
  directory = mkdtempSync(join(tmpdir(), 'p1-memory-fixture-'));
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
  vi.stubEnv('GALAXY_AI_EXECUTION_POLICY', 'CHATGPT_PLAN_ONLY');
  vi.stubEnv('FEATURE_PROJECT_AI', 'true');
  const passwordHash = await hash(password, 4);
  organizationId = (
    await db.organization.create({
      data: {
        slug: randomUUID(),
        name: 'P1 memory fixture',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    })
  ).id;
  otherOrganizationId = (
    await db.organization.create({
      data: {
        slug: randomUUID(),
        name: 'P1 other memory fixture',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    })
  ).id;
  for (const key of ['owner', 'other']) {
    const email = randomUUID() + '@example.test';
    const user = await db.user.create({
      data: {
        email,
        normalizedEmail: email,
        displayName: key,
        status: 'active',
        credential: { create: { passwordHash, mustChangePassword: false } },
        organizationMembers: { create: { organizationId } },
      },
    });
    if (key === 'owner') ownerId = user.id;
    else otherOwnerId = user.id;
    accounts[key] = { id: user.id, email, cookie: '' };
  }
  for (const key of ['A', 'B', 'T2']) {
    const tenant = key === 'T2' ? otherOrganizationId : organizationId;
    if (key === 'T2')
      await db.organizationMembership.create({
        data: { organizationId: tenant, userId: ownerId, status: 'disabled' },
      });
    const customer = await db.customer.create({
      data: {
        organizationId: tenant,
        type: 'INDIVIDUAL',
        displayName: 'Synthetic customer',
        createdBy: ownerId,
        updatedBy: ownerId,
      },
    });
    const project = await db.project.create({
      data: {
        organizationId: tenant,
        customerId: customer.id,
        code: randomUUID(),
        name: key,
        createdBy: ownerId,
        updatedBy: ownerId,
      },
    });
    projects[key] = project.id;
    const grant = await db.chatProjectGrant.create({
      data: {
        organizationId: tenant,
        projectId: project.id,
        userId: ownerId,
        grantedBy: ownerId,
        actions: ['INVOKE'],
        roomCeiling: [],
      },
    });
    const conversation = await db.chatAiConversation.create({
      data: {
        organizationId: tenant,
        projectId: project.id,
        ownerId,
        clientKey: randomUUID(),
        scope: 'ALL',
      },
    });
    const answer = await db.chatAiAnswer.create({
      data: {
        organizationId: tenant,
        projectId: project.id,
        ownerId,
        conversationId: conversation.id,
        invokeGrantId: grant.id,
        clientKey: randomUUID(),
        payloadHash: digest,
        question: 'Synthetic question',
        status: 'COMPLETED',
        answer: 'Synthetic answer',
        providerStartedAt: new Date(),
        usage: { request: { mode: 'GENERAL' } },
      },
    });
    const room = await db.chatRoom.create({
      data: {
        organizationId: tenant,
        projectId: project.id,
        title: 'Fixture',
        group: 'INTERNAL',
        audience: 'INTERNAL',
        createdBy: ownerId,
      },
    });
    const message = await db.chatMessage.create({
      data: {
        organizationId: tenant,
        projectId: project.id,
        roomId: room.id,
        authorId: ownerId,
        clientKey: randomUUID(),
        payloadHash: digest,
        sequence: 1,
        body: 'Fixture message',
      },
    });
    const index = await db.chatAiSourceIndex.create({
      data: {
        organizationId: tenant,
        projectId: project.id,
        roomId: room.id,
        messageId: message.id,
        version: '1',
        label: 'Fixture',
        provenance: 'CHAT_MESSAGE',
      },
    });
    sources[key] = {
      conversation: conversation.id,
      answer: answer.id,
      message: message.id,
      index: index.id,
    };
  }
  const role = await db.role.create({
    data: {
      organizationId,
      code: 'p1-memory-' + run,
      name: 'Memory fixture',
      maximumScope: 'SYSTEM',
      permissions: {
        create: [
          'ai.invoke',
          'project.read',
          'task.read',
          'chat.publish',
          'file.read',
          'file.download',
        ].map((code) => ({ permission: { connect: { code } } })),
      },
    },
  });
  for (const userId of [ownerId, otherOwnerId])
    await db.userRole.create({
      data: { organizationId, userId, roleId: role.id, scopeType: 'SYSTEM' },
    });
  await db.chatProjectGrant.updateMany({
    where: { organizationId, userId: ownerId },
    data: { actions: ['INVOKE', 'PUBLISH'] },
  });
  for (const projectId of [projects.A!, projects.B!])
    await db.chatProjectGrant.create({
      data: {
        organizationId,
        projectId,
        userId: otherOwnerId,
        grantedBy: ownerId,
        actions: ['INVOKE'],
        roomCeiling: [],
      },
    });
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(0, '127.0.0.1');
  for (const account of Object.values(accounts)) {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password })
      .expect(201);
    account.cookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0]!.split(';')[0]!;
  }
});

const api = (project = 'A') =>
  `/api/v1/project-chat/projects/${projects[project]}/ai/memory`;
const call = (
  method: 'get' | 'post' | 'patch' | 'delete',
  path = '',
  body?: object,
  who = 'owner',
  project = 'A',
) => {
  const account = accounts[who]!;
  const server = request(app.getHttpServer());
  const r = server[method](api(project) + path)
    .set('Cookie', account.cookie)
    .set('X-Chat-Actor', account.id);
  return body ? r.send(body) : r;
};
const note = (content = 'API-X-' + run, visibility = 'PRIVATE') => ({
  clientKey: randomUUID(),
  visibility,
  content,
  category: 'NOTE',
  verification: 'USER_CONFIRMED',
  sourceRefs: [],
});

describe('P1 history/summary actual PostgreSQL execution', () => {
  const post = (path: string, body: object, project = 'A') =>
    request(app.getHttpServer())
      .post(`/api/v1/project-chat/projects/${projects[project]}/ai${path}`)
      .set('Cookie', accounts.owner!.cookie)
      .set('X-Chat-Actor', ownerId)
      .send(body);
  it('waits for a contended Project lock before reading authorized chat', async () => {
    const owner = vi
      .spyOn(app.get(ChatGptConnectionService), 'owner')
      .mockResolvedValue({
        generation: 'fixture-lock-binding',
        models: [{ id: 'fixture-model', label: 'Fixture model' }],
        verifiedAt: null,
      });
    let release!: () => void;
    const locked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holding = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projects.A}::uuid FOR UPDATE`;
        release();
        await new Promise((resolve) => setTimeout(resolve, 5500));
      },
      { timeout: 10000 },
    );
    await locked;
    try {
      await request(app.getHttpServer())
        .get(`/api/v1/project-chat/projects/${projects.A}/ai`)
        .set('Cookie', accounts.owner!.cookie)
        .set('X-Chat-Actor', ownerId)
        .expect(200);
    } finally {
      owner.mockRestore();
      await holding;
    }
  }, 15000);

  it('keeps consecutive native history available without timing out source validation', async () => {
    expect(app.getHttpServer().listening).toBe(true);
    const connection = app.get(ChatGptConnectionService),
      owner = vi.spyOn(connection, 'owner').mockResolvedValue({
        generation: 'fixture-binding',
        models: [{ id: 'fixture-model', label: 'Fixture model' }],
        verifiedAt: null,
      }),
      respond = vi.spyOn(connection, 'respond').mockResolvedValue({
        model: 'fixture-model',
        text: 'Synthetic consecutive history answer',
        calls: [],
        continuation: [],
        requestId: 'fixture-only',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const failures: string[] = [];
    const policy = app.get(ProjectChatPolicy);
    const project = policy.project.bind(policy);
    const observe = vi
      .spyOn(policy, 'project')
      .mockImplementation((actor, projectId, run) =>
        project(actor, projectId, run).catch((error) => {
          failures.push(
            error instanceof Prisma.PrismaClientKnownRequestError
              ? error.code
              : String(error instanceof Error ? error.name : 'unknown'),
          );
          if (failures.length === 1 && error instanceof Error)
            console.error(error.name + ': ' + error.message.slice(0, 500));
          throw error;
        }),
      );
    const permissions = await db.permission.findMany({ select: { id: true } });
    const wideRole = await db.role.create({
      data: {
        organizationId,
        code: 'history-wide-' + randomUUID(),
        name: 'Synthetic history admin',
        maximumScope: 'SYSTEM',
        permissions: {
          create: permissions.map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    const wideAssignment = await db.userRole.create({
      data: {
        organizationId,
        userId: ownerId,
        roleId: wideRole.id,
        scopeType: 'SYSTEM',
      },
    });
    const notes: { id: string; version: number }[] = [];
    let timer: ReturnType<typeof setInterval> | undefined;
    const reads = new Set<Promise<void>>();
    const readStatuses: number[] = [];
    try {
      for (const visibility of ['PRIVATE', 'SHARED']) {
        const created = await call(
          'post',
          '',
          note(
            'Synthetic consecutive turn ' +
              Array.from({ length: 24 }, (_, i) => i).join(' ') +
              ' ' +
              run,
            visibility,
          ),
        ).expect(201);
        notes.push(created.body);
      }
      const conversation = (
        await post('/conversations', {
          scope: 'ALL',
          clientKey: randomUUID(),
        }).expect(201)
      ).body.id as string;
      timer = setInterval(() => {
        if (reads.size) return;
        for (let tab = 0; tab < 3; tab++) {
          const read: Promise<void> = request(app.getHttpServer())
            .get(
              `/api/v1/project-chat/projects/${projects.A}/ai/conversations/${conversation}`,
            )
            .set('Cookie', accounts.owner!.cookie)
            .set('X-Chat-Actor', ownerId)
            .then(
              (response) => {
                readStatuses.push(response.status);
              },
              (error: unknown) => {
                readStatuses.push(0);
                failures.push(
                  'HTTP_' + (error instanceof Error ? error.name : 'unknown'),
                );
              },
            )
            .finally(() => reads.delete(read));
          reads.add(read);
        }
      }, 3000);
      for (let i = 0; i < 24; i++) {
        const queued = await post(`/conversations/${conversation}/answers`, {
          question: `Synthetic consecutive turn ${i}`,
          model: 'fixture-model',
          clientKey: randomUUID(),
        }).expect(201);
        const done = await post(`/answers/${queued.body.id}/run`, {}).expect(
          201,
        );
        expect({
          status: done.body.status,
          failures,
          failedReads: readStatuses.filter((status) => status !== 200),
        }).toEqual({ status: 'COMPLETED', failures: [], failedReads: [] });
        const row = await db.chatAiAnswer.findUniqueOrThrow({
          where: { id: queued.body.id },
        });
        expect(executionMetadata(row.usage)?.usedHistoryAnswerIds).toHaveLength(
          i,
        );
        expect(executionMetadata(row.usage)?.memoryRevisionIds).toHaveLength(2);
      }
      clearInterval(timer);
      timer = undefined;
      await Promise.all(reads);
      expect(failures).toEqual([]);
      expect(readStatuses.length).toBeGreaterThan(0);
      expect(readStatuses.every((status) => status === 200)).toBe(true);
      const removed = notes[0]!;
      await call('delete', '/' + removed.id, {
        clientKey: randomUUID(),
        expectedVersion: removed.version,
      }).expect(200);
      notes.shift();
      const hidden = await request(app.getHttpServer())
        .get(
          `/api/v1/project-chat/projects/${projects.A}/ai/conversations/${conversation}`,
        )
        .set('Cookie', accounts.owner!.cookie)
        .set('X-Chat-Actor', ownerId)
        .expect(200);
      expect(hidden.body.answers).toHaveLength(24);
      expect(
        hidden.body.answers.every(
          (row: { status: string; answer: unknown; question: unknown }) =>
            row.status === 'EGRESS_POLICY_DENIED' &&
            row.answer === null &&
            row.question === null,
        ),
      ).toBe(true);
    } finally {
      if (timer) clearInterval(timer);
      await db.userRole.update({
        where: { id: wideAssignment.id },
        data: { status: 'archived' },
      });
      await Promise.all(reads);
      for (const n of notes)
        await call('delete', '/' + n.id, {
          clientKey: randomUUID(),
          expectedVersion: n.version,
        }).expect(200);
      observe.mockRestore();
      owner.mockRestore();
      respond.mockRestore();
    }
  }, 240_000);
  async function seededHistory(long = false, project = 'A') {
    const conversation = (
      await post(
        '/conversations',
        { scope: 'ALL', clientKey: randomUUID() },
        project,
      ).expect(201)
    ).body.id as string;
    const grant = await db.chatProjectGrant.findFirstOrThrow({
      where: { projectId: projects[project], userId: ownerId, revokedAt: null },
    });
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const row = await db.chatAiAnswer.create({
        data: {
          organizationId,
          projectId: projects[project]!,
          ownerId,
          conversationId: conversation,
          invokeGrantId: grant.id,
          clientKey: randomUUID(),
          payloadHash: digest,
          status: 'COMPLETED',
          question: `Original turn ${i}`,
          answer: long
            ? 'Technical values 2400 mm. '.repeat(2400)
            : `HISTORY-${project}-${i}-${run}`,
          uncertainty: '',
          citations: [],
          model: 'fixture-model',
          providerStartedAt: new Date(),
          completedAt: new Date(),
          usage: {
            request: {
              version: 2,
              mode: 'UNIFIED',
              provider: 'chatgpt',
              model: 'fixture-model',
              revision: 'fixture-binding',
              configDigest: 'fixture-binding',
              reasoning: 'default',
              dataClassification: 'PROJECT_AUTHORIZED',
              sourceIds: [],
              historyAnswerIds: [],
              scope: {
                organizationId,
                projectId: projects[project],
                actorId: ownerId,
                conversationId: conversation,
              },
              policyVersion: 'project-ai-p1-v1',
            },
          },
        },
      });
      ids.push(row.id);
    }
    return { conversation, ids };
  }
  it('executes more than eight frozen turns, rechecks consumed proof and isolates another Project/actor', async () => {
    const connection = app.get(ChatGptConnectionService),
      owner = vi.spyOn(connection, 'owner').mockResolvedValue({
        generation: 'fixture-binding',
        models: [{ id: 'fixture-model', label: 'Fixture model' }],
        verifiedAt: null,
      }),
      respond = vi.spyOn(connection, 'respond').mockResolvedValue({
        model: 'fixture-model',
        text: 'Fixture history answer',
        calls: [],
        continuation: [],
        requestId: 'fixture-only',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    try {
      const seed = await seededHistory();
      const queued = await post(`/conversations/${seed.conversation}/answers`, {
        question: 'Continue this conversation',
        model: 'fixture-model',
        clientKey: randomUUID(),
      }).expect(201);
      const done = await post(`/answers/${queued.body.id}/run`, {}).expect(201);
      expect(done.body).toMatchObject({
        status: 'COMPLETED',
        answer: 'Fixture history answer',
        historyCompleteness: 'COMPLETE',
      });
      const row = await db.chatAiAnswer.findUniqueOrThrow({
          where: { id: queued.body.id },
        }),
        execution = executionMetadata(row.usage);
      expect(requestMetadata(row.usage)?.version).toBe(3);
      expect(execution?.usedHistoryAnswerIds).toHaveLength(12);
      expect(execution?.historyVersions).toHaveLength(12);
      expect(JSON.stringify(respond.mock.calls)).toContain('HISTORY-A-0-');
      await request(app.getHttpServer())
        .get(
          `/api/v1/project-chat/projects/${projects.B}/ai/conversations/${seed.conversation}`,
        )
        .set('Cookie', accounts.owner!.cookie)
        .set('X-Chat-Actor', ownerId)
        .expect(404);
      await request(app.getHttpServer())
        .get(
          `/api/v1/project-chat/projects/${projects.A}/ai/conversations/${seed.conversation}`,
        )
        .set('Cookie', accounts.other!.cookie)
        .set('X-Chat-Actor', otherOwnerId)
        .expect(404);
      const original = row.usage as Prisma.InputJsonObject;
      await db.chatAiAnswer.update({
        where: { id: row.id },
        data: {
          usage: {
            ...original,
            execution: {
              ...(execution as unknown as Prisma.InputJsonObject),
              scope: { ...execution!.scope, projectId: projects.B },
            },
          },
        },
      });
      const hidden = await request(app.getHttpServer())
        .get(
          `/api/v1/project-chat/projects/${projects.A}/ai/conversations/${seed.conversation}`,
        )
        .set('Cookie', accounts.owner!.cookie)
        .set('X-Chat-Actor', ownerId)
        .expect(200);
      expect(
        JSON.stringify(
          hidden.body.answers?.find((r: { id: string }) => r.id === row.id),
        ),
      ).not.toContain('Fixture history answer');
      await db.chatAiAnswer.update({
        where: { id: row.id },
        data: { usage: original },
      });
      await db.chatAiAnswer.update({
        where: { id: seed.ids[0] },
        data: { answer: 'original content changed' },
      });
      const stale = await request(app.getHttpServer())
        .get(
          `/api/v1/project-chat/projects/${projects.A}/ai/conversations/${seed.conversation}`,
        )
        .set('Cookie', accounts.owner!.cookie)
        .set('X-Chat-Actor', ownerId)
        .expect(200);
      expect(
        JSON.stringify(
          stale.body.answers?.find((r: { id: string }) => r.id === row.id),
        ),
      ).not.toContain('Fixture history answer');
    } finally {
      owner.mockRestore();
      respond.mockRestore();
    }
  });
  it('persists only completed private summary revisions with original dependencies and no lock during inference', async () => {
    const connection = app.get(ChatGptConnectionService),
      owner = vi.spyOn(connection, 'owner').mockResolvedValue({
        generation: 'fixture-binding',
        models: [{ id: 'fixture-model', label: 'Fixture model' }],
        verifiedAt: null,
      });
    const respond = vi
      .spyOn(connection, 'respond')
      .mockImplementation(async (_actor, _generation, input) => {
        const value = input as { instructions: string };
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout='1s'`;
          await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projects.A}::uuid FOR UPDATE`;
        });
        return {
          model: 'fixture-model',
          text: value.instructions.startsWith('Summarize')
            ? 'Private unverified summary: door 2400 mm.'
            : 'Fixture summary answer',
          calls: [],
          continuation: [],
          requestId: 'fixture-only',
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      });
    try {
      const seed = await seededHistory(true);
      const queued = await post(`/conversations/${seed.conversation}/answers`, {
        question: 'Continue the technical discussion',
        model: 'fixture-model',
        clientKey: randomUUID(),
      }).expect(201);
      const done = await post(`/answers/${queued.body.id}/run`, {}).expect(201);
      expect(done.body).toMatchObject({
        status: 'COMPLETED',
        answer: 'Fixture summary answer',
        historyCompleteness: 'PARTIAL',
      });
      const heads = await db.chatAiMemory.findMany({
        where: { projectId: projects.A, conversationId: seed.conversation },
        include: { revisions: { include: { dependencies: true } } },
      });
      expect(heads).toHaveLength(1);
      expect(heads[0]).toMatchObject({
        ownerId,
        visibility: 'PRIVATE',
        kind: 'CONVERSATION_SUMMARY',
      });
      expect(heads[0]!.revisions[0]).toMatchObject({
        verification: 'UNVERIFIED',
        summaryStatus: 'READY',
        budget: { status: 'UNVERIFIED' },
      });
      expect(
        heads[0]!.revisions[0]!.coveredAnswerIds.every((id) =>
          seed.ids.includes(id),
        ),
      ).toBe(true);
      expect(
        heads[0]!.revisions[0]!.dependencies.every(
          (d) => d.projectId === projects.A && d.sourceOwnerId === ownerId,
        ),
      ).toBe(true);
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.body.id },
      });
      expect(executionMetadata(row.usage)?.summaryRevisionIds).toEqual([
        heads[0]!.revisions[0]!.id,
      ]);
      await call('get', '/' + heads[0]!.id).expect(404);
      const saved = await call('post', '', {
        ...note('SUMMARY-NOTE-' + run),
        sourceRefs: [done.body.memorySource],
      }).expect(201);
      await call('get', '/' + saved.body.id, undefined, 'other').expect(404);
      await call('get', '/' + saved.body.id, undefined, 'owner', 'B').expect(
        404,
      );
      await call('post', '', {
        ...note(),
        sourceRefs: [
          {
            kind: 'MEMORY_REVISION',
            id: heads[0]!.revisions[0]!.id,
            version: '1',
            locator: {},
          },
        ],
      }).expect(404);
      const another = (
        await post('/conversations', {
          scope: 'ALL',
          clientKey: randomUUID(),
        }).expect(201)
      ).body.id;
      const follow = (
        await post(`/conversations/${another}/answers`, {
          question: 'SUMMARY-NOTE-' + run,
          model: 'fixture-model',
          clientKey: randomUUID(),
        }).expect(201)
      ).body.id;
      await post(`/answers/${follow}/run`, {})
        .expect(201)
        .expect(({ body }) => expect(body.status).toBe('COMPLETED'));
      expect(JSON.stringify(respond.mock.calls.at(-1))).toContain(
        'SUMMARY-NOTE-' + run,
      );
      await db.chatAiMemory.update({
        where: { id: heads[0]!.id },
        data: { inactiveAt: new Date() },
      });
      const hidden = await request(app.getHttpServer())
        .get(
          `/api/v1/project-chat/projects/${projects.A}/ai/conversations/${seed.conversation}`,
        )
        .set('Cookie', accounts.owner!.cookie)
        .set('X-Chat-Actor', ownerId)
        .expect(200);
      expect(
        JSON.stringify(
          hidden.body.answers?.find((r: { id: string }) => r.id === row.id),
        ),
      ).not.toContain('Fixture summary answer');
    } finally {
      owner.mockRestore();
      respond.mockRestore();
    }
  });
  it('a replaced summary lease cannot publish memory or overwrite the replacement worker', async () => {
    const connection = app.get(ChatGptConnectionService),
      owner = vi.spyOn(connection, 'owner').mockResolvedValue({
        generation: 'fixture-binding',
        models: [{ id: 'fixture-model', label: 'Fixture model' }],
        verifiedAt: null,
      });
    let answerId = '';
    const replacement = randomUUID();
    const respond = vi
      .spyOn(connection, 'respond')
      .mockImplementation(async () => {
        const row = await db.chatAiAnswer.findUniqueOrThrow({
          where: { id: answerId },
        });
        await db.chatAiAnswer.update({
          where: { id: answerId },
          data: {
            usage: {
              ...(row.usage as Prisma.InputJsonObject),
              summaryJob: { token: replacement },
            },
          },
        });
        return {
          model: 'fixture-model',
          text: 'obsolete worker summary',
          calls: [],
          continuation: [],
          requestId: 'fixture-only',
          usage: null,
        };
      });
    try {
      const seed = await seededHistory(true);
      answerId = (
        await post(`/conversations/${seed.conversation}/answers`, {
          question: 'Summarize long history',
          model: 'fixture-model',
          clientKey: randomUUID(),
        }).expect(201)
      ).body.id;
      await post(`/answers/${answerId}/run`, {}).expect(201);
      expect(
        await db.chatAiMemory.count({
          where: { conversationId: seed.conversation },
        }),
      ).toBe(0);
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: answerId },
      });
      expect(row).toMatchObject({
        status: 'RUNNING',
        usage: { summaryJob: { token: replacement } },
      });
      await db.chatAiAnswer.update({
        where: { id: answerId },
        data: {
          status: 'CANCELLED',
          leaseUntil: null,
          completedAt: new Date(),
        },
      });
    } finally {
      owner.mockRestore();
      respond.mockRestore();
    }
  });
  it.each([
    'search_project_memory',
    'read_project_memory',
    'search_conversation_history',
  ] as const)(
    'dispatches %s against actual scoped data, reinjects the call ID and resolves a real citation',
    async (name) => {
      const created = await call(
        'post',
        '',
        note('TOOL-X-' + run + ' 2400 mm'),
      ).expect(201);
      await call('post', '', note('TOOL-B-SECRET-' + run), 'owner', 'B').expect(
        201,
      );
      const seed = await seededHistory();
      const args =
        name === 'read_project_memory'
          ? { memoryId: created.body.id, version: 1 }
          : name === 'search_project_memory'
            ? { query: 'TOOL-X-' + run, visibility: 'PRIVATE', limit: 5 }
            : { query: 'HISTORY-A-0-' + run, limit: 5 };
      const providerCall = {
        type: 'function_call' as const,
        namespace: 'galaxy' as const,
        name,
        call_id: 'memory-call',
        arguments: JSON.stringify(args),
      };
      const connection = app.get(ChatGptConnectionService),
        owner = vi.spyOn(connection, 'owner').mockResolvedValue({
          generation: 'fixture-binding',
          models: [{ id: 'fixture-model', label: 'Fixture model' }],
          verifiedAt: null,
        });
      const respond = vi
        .spyOn(connection, 'respond')
        .mockResolvedValueOnce({
          model: 'fixture-model',
          text: '',
          calls: [providerCall],
          continuation: [providerCall],
          requestId: 'fixture-call',
          usage: null,
        })
        .mockResolvedValueOnce({
          model: 'fixture-model',
          text: 'Fixture tool answer',
          calls: [],
          continuation: [],
          requestId: 'fixture-final',
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      try {
        const queued = await post(
          `/conversations/${seed.conversation}/answers`,
          {
            question: 'Use the read tool for this answer',
            model: 'fixture-model',
            clientKey: randomUUID(),
          },
        ).expect(201);
        const done = await post(`/answers/${queued.body.id}/run`, {}).expect(
          201,
        );
        expect(done.body).toMatchObject({
          status: 'COMPLETED',
          answer: 'Fixture tool answer',
        });
        expect(respond).toHaveBeenCalledTimes(2);
        const second = respond.mock.calls[1]![2] as {
          input: object[];
          tools: string[];
        };
        expect(second.input).toContainEqual(
          expect.objectContaining({
            type: 'function_call_output',
            call_id: 'memory-call',
          }),
        );
        const output = second.input.find(
          (i) => 'type' in i && i.type === 'function_call_output',
        );
        expect(JSON.stringify(output)).toContain(
          name === 'search_conversation_history'
            ? 'HISTORY-A-0-' + run
            : 'TOOL-X-' + run,
        );
        expect(JSON.stringify(second)).not.toContain('TOOL-B-SECRET-' + run);
        const stored = await db.chatAiAnswer.findUniqueOrThrow({
          where: { id: queued.body.id },
        });
        const memoryHandle = savedMemoryCitations(stored.usage)?.find(
          (citation) =>
            citation.kind === 'MEMORY' &&
            citation.memoryRevisionId === created.body.revisionId,
        )?.handle;
        const source = done.body.sources.find((s: { kind?: string }) =>
          name === 'search_conversation_history'
            ? s.kind === 'HISTORY'
            : 'handle' in s && s.handle === memoryHandle,
        );
        expect(source).toBeDefined();
        const citation = await request(app.getHttpServer())
          .get(
            `/api/v1/project-chat/projects/${projects.A}/ai/answers/${queued.body.id}/sources/${source.handle}`,
          )
          .set('Cookie', accounts.owner!.cookie)
          .set('X-Chat-Actor', ownerId)
          .expect(200);
        expect(citation.body.text).toContain(
          name === 'search_conversation_history'
            ? 'HISTORY-A-0-' + run
            : 'TOOL-X-' + run,
        );
        await request(app.getHttpServer())
          .get(
            `/api/v1/project-chat/projects/${projects.B}/ai/answers/${queued.body.id}/sources/${source.handle}`,
          )
          .set('Cookie', accounts.owner!.cookie)
          .set('X-Chat-Actor', ownerId)
          .expect(404);
        if (name !== 'search_conversation_history') {
          await call('patch', '/' + created.body.id, {
            clientKey: randomUUID(),
            expectedVersion: 1,
            content: 'Updated fact 2500 mm',
            category: 'TECHNICAL',
            verification: 'USER_CONFIRMED',
            sourceRefs: [],
          }).expect(200);
          await request(app.getHttpServer())
            .get(
              `/api/v1/project-chat/projects/${projects.A}/ai/answers/${queued.body.id}/sources/${source.handle}`,
            )
            .set('Cookie', accounts.owner!.cookie)
            .set('X-Chat-Actor', ownerId)
            .expect(404);
        }
      } finally {
        owner.mockRestore();
        respond.mockRestore();
      }
    },
  );
  it('never reinjects a memory made inactive between read and egress', async () => {
    const created = await call('post', '', {
        ...note('REVOKE-TOOL-' + run),
        verification: 'UNVERIFIED',
      }).expect(201),
      seed = await seededHistory();
    const connection = app.get(ChatGptConnectionService),
      owner = vi.spyOn(connection, 'owner').mockResolvedValue({
        generation: 'fixture-binding',
        models: [{ id: 'fixture-model', label: 'Fixture model' }],
        verifiedAt: null,
      });
    const providerCall = {
      type: 'function_call' as const,
      namespace: 'galaxy' as const,
      name: 'read_project_memory' as const,
      call_id: 'memory-call',
      arguments: JSON.stringify({ memoryId: created.body.id, version: 1 }),
    };
    const respond = vi.spyOn(connection, 'respond').mockResolvedValue({
      model: 'fixture-model',
      text: '',
      calls: [providerCall],
      continuation: [providerCall],
      requestId: 'fixture-only',
      usage: null,
    });
    const memory = app.get(ProjectAiMemoryService),
      read = memory.read.bind(memory);
    const changed = vi
      .spyOn(memory, 'read')
      .mockImplementation(async (...args) => {
        const value = await read(...args);
        if (value.id === created.body.id)
          await db.chatAiMemory.update({
            where: { id: value.id },
            data: { inactiveAt: new Date() },
          });
        return value;
      });
    try {
      const queued = await post(`/conversations/${seed.conversation}/answers`, {
        question: 'Use a read tool',
        model: 'fixture-model',
        clientKey: randomUUID(),
      }).expect(201);
      const done = await post(`/answers/${queued.body.id}/run`, {}).expect(201);
      expect(changed).toHaveBeenCalled();
      expect(respond).toHaveBeenCalledTimes(1);
      expect(done.body.status).not.toBe('COMPLETED');
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.body.id },
      });
      expect(row.answer).toBeNull();
      expect(JSON.stringify(respond.mock.calls)).not.toContain(
        created.body.content,
      );
    } finally {
      owner.mockRestore();
      respond.mockRestore();
      changed.mockRestore();
    }
  });
  it('does not persist uncommitted tool context when source validation rolls the transaction back', async () => {
    const created = await call('post', '', {
        ...note('ROLLBACK-CONTEXT-' + run),
        verification: 'UNVERIFIED',
      }).expect(201),
      seed = await seededHistory();
    const connection = app.get(ChatGptConnectionService),
      owner = vi.spyOn(connection, 'owner').mockResolvedValue({
        generation: 'fixture-binding',
        models: [{ id: 'fixture-model', label: 'Fixture model' }],
        verifiedAt: null,
      });
    const providerCall = {
      type: 'function_call' as const,
      namespace: 'galaxy' as const,
      name: 'read_project_memory' as const,
      call_id: 'memory-call',
      arguments: JSON.stringify({ memoryId: created.body.id, version: 1 }),
    };
    const respond = vi.spyOn(connection, 'respond').mockResolvedValue({
      model: 'fixture-model',
      text: '',
      calls: [providerCall],
      continuation: [providerCall],
      requestId: 'fixture-only',
      usage: null,
    });
    const memory = app.get(ProjectAiMemoryService),
      proofs = memory.proofs.bind(memory);
    const changed = vi
      .spyOn(memory, 'proofs')
      .mockImplementation(async (...args) => {
        if (
          args[2].some(
            (ref) =>
              ref.kind === 'MEMORY_REVISION' &&
              ref.id === created.body.revisionId,
          ) &&
          args[2].some((ref) => ref.kind === 'AI_ANSWER')
        )
          await db.chatAiMemory.update({
            where: { id: created.body.id },
            data: { inactiveAt: new Date() },
          });
        return proofs(...args);
      });
    try {
      const queued = await post(`/conversations/${seed.conversation}/answers`, {
        question: 'Use a read tool',
        model: 'fixture-model',
        clientKey: randomUUID(),
      }).expect(201);
      await post(`/answers/${queued.body.id}/run`, {}).expect(201);
      expect(respond).toHaveBeenCalledTimes(1);
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.body.id },
      });
      expect(executionMetadata(row.usage)?.memoryRevisionIds).not.toContain(
        created.body.revisionId,
      );
      expect(
        await db.chatAiAnswerMemoryDependency.count({
          where: {
            answerId: row.id,
            memoryRevisionId: created.body.revisionId,
          },
        }),
      ).toBe(0);
      expect(row.usage).toMatchObject({
        memoryCitations: expect.not.arrayContaining([
          expect.objectContaining({
            memoryRevisionId: created.body.revisionId,
          }),
        ]),
        toolExecutions: [
          {
            name: 'read_project_memory',
            callId: 'memory-call',
            status: 'ERROR',
            errorCode: 'ACCESS_REVOKED',
          },
        ],
      });
    } finally {
      owner.mockRestore();
      respond.mockRestore();
      changed.mockRestore();
    }
  });
});
describe('P1 memory HTTP/session/IAM (real isolated database)', () => {
  it('creates private memory across conversations without provider entitlement and isolates actor/Project/tenant', async () => {
    const connection = app.get(ChatGptConnectionService),
      owner = vi.spyOn(connection, 'owner'),
      respond = vi.spyOn(connection, 'respond');
    try {
      const created = await call('post', '', note()).expect(201);
      const id = created.body.id;
      expect(created.body).toMatchObject({
        visibility: 'PRIVATE',
        kind: 'NOTE',
        version: 1,
        content: 'API-X-' + run,
      });
      await call('get', '/' + id).expect(200);
      expect(
        (await call('get', '?query=API-X-' + run, undefined, 'other')).body
          .items,
      ).toEqual([]);
      expect(
        (await call('get', '?query=API-X-' + run, undefined, 'owner', 'B')).body
          .items,
      ).toEqual([]);
      await call('get', '/' + id, undefined, 'other').expect(404);
      await call('get', '/' + id, undefined, 'owner', 'B').expect(404);
      await call('get', '', undefined, 'owner', 'T2').expect(404);
      expect(owner).not.toHaveBeenCalled();
      expect(respond).not.toHaveBeenCalled();
    } finally {
      owner.mockRestore();
      respond.mockRestore();
    }
  });
  it('is idempotent and compares versions atomically without editing old revisions', async () => {
    const input = note('API-CAS-' + run),
      created = await call('post', '', input).expect(201),
      id = created.body.id;
    expect((await call('post', '', input).expect(201)).body.id).toBe(id);
    await call('post', '', { ...input, content: 'different' }).expect(409);
    const changes = ['one', 'two'].map((content) => ({
      clientKey: randomUUID(),
      expectedVersion: 1,
      content: 'API-' + content + '-' + run,
      category: 'NOTE',
      verification: 'USER_CONFIRMED',
      sourceRefs: [],
    }));
    const results = await Promise.all(
      changes.map((value) => call('patch', '/' + id, value)),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.findIndex((r) => r.status === 200);
    expect(
      (await call('patch', '/' + id, changes[winner]).expect(200)).body.version,
    ).toBe(2);
    expect(
      (await call('get', '/' + id + '?version=1').expect(200)).body.content,
    ).toBe(input.content);
    const revisions = await call('get', '/' + id + '/revisions').expect(200);
    expect(
      revisions.body.items.map((r: { version: number }) => r.version),
    ).toEqual([2, 1]);
    const key = randomUUID();
    await call('delete', '/' + id, {
      clientKey: key,
      expectedVersion: 1,
    }).expect(409);
    await call('delete', '/' + id, {
      clientKey: key,
      expectedVersion: 2,
    }).expect(200);
    await call('delete', '/' + id, {
      clientKey: key,
      expectedVersion: 2,
    }).expect(200);
    await call('get', '/' + id).expect(404);
    expect(
      (await call('get', '?query=API-CAS-' + run).expect(200)).body.items,
    ).toEqual([]);
  });
  it('requires PUBLISH and keeps private origin out of shared responses and generic audit feeds', async () => {
    await call('post', '', note('forbidden', 'SHARED'), 'other').expect(403);
    const original = await call(
      'post',
      '',
      note('API-PUBLISHED-' + run),
    ).expect(201);
    const shared = await call('post', '', {
      ...note(original.body.content, 'SHARED'),
      publishFrom: { memoryId: original.body.id, version: 1 },
    }).expect(201);
    expect(shared.body.id).not.toBe(original.body.id);
    expect(JSON.stringify(shared.body)).not.toContain(original.body.id);
    const read = await call(
      'get',
      '/' + shared.body.id,
      undefined,
      'other',
    ).expect(200);
    expect(read.body.content).toBe(original.body.content);
    expect(JSON.stringify(read.body)).not.toContain(original.body.id);
    await call(
      'patch',
      '/' + shared.body.id,
      {
        clientKey: randomUUID(),
        expectedVersion: 1,
        content: 'forged',
        category: 'NOTE',
        verification: 'UNVERIFIED',
        sourceRefs: [],
      },
      'other',
    ).expect(403);
    const logs = await db.auditLog.findMany({
      where: { organizationId, entityType: 'ChatAiMemory' },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(original.body.content);
    const audit = app.get(AuditService);
    const actor = { organizationId } as Parameters<AuditService['list']>[0];
    expect(
      (
        await audit.list(actor, {
          page: 1,
          pageSize: 100,
          entityType: 'ChatAiMemory',
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await audit.listSystem({
          page: 1,
          pageSize: 100,
          entityType: 'ChatAiMemory',
        })
      ).total,
    ).toBe(0);
  });
  it('rolls back memory when audit fails and rejects forged input/sources/cursors', async () => {
    for (const extra of [
      { projectId: projects.B },
      { ownerId: otherOwnerId },
      { verification: 'SOURCE_CONFIRMED' },
      { kind: 'CONVERSATION_SUMMARY' },
      {
        sourceRefs: [
          {
            kind: 'TASK',
            id: randomUUID(),
            version: '1',
            locator: { url: 'http://localhost' },
          },
        ],
      },
    ])
      await call('post', '', { ...note(), ...extra }).expect(400);
    await call('post', '', {
      ...note(),
      sourceRefs: [
        { kind: 'AI_ANSWER', id: sources.B!.answer, version: '1', locator: {} },
      ],
    }).expect(404);
    const value = note();
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const audit = app.get(AuditService),
      spy = vi
        .spyOn(audit, 'write')
        .mockRejectedValueOnce(
          new Error('Sensitive content: ' + value.content),
        );
    try {
      await call('post', '', value).expect(500);
      expect(
        logged.mock.calls
          .flat()
          .map((entry: unknown) =>
            entry instanceof Error ? entry.message : String(entry),
          )
          .join(' '),
      ).not.toContain(value.content);
    } finally {
      spy.mockRestore();
      logged.mockRestore();
    }
    expect(
      await db.chatAiMemory.count({
        where: {
          organizationId,
          projectId: projects.A,
          clientKey: value.clientKey,
        },
      }),
    ).toBe(0);
    await call('get', '?cursor=not-a-valid-cursor').expect(400);
    expect(
      (await call('get', '?query=%25_%25').expect(200)).body.items,
    ).toEqual([]);
  });
  it('pins Task versions, retains publication lineage, refreshes explicitly and permits inactive after source revoke', async () => {
    const task = await db.task.create({
      data: {
        organizationId,
        projectId: projects.A,
        title: 'Memory source task',
        createdBy: ownerId,
        updatedBy: ownerId,
      },
    });
    const ref = { kind: 'TASK', id: task.id, version: '1', locator: {} };
    const input = { ...note('API-TASK-' + run), sourceRefs: [ref] };
    await call('post', '', {
      ...input,
      sourceRefs: [{ ...ref, version: '99' }],
    }).expect(409);
    await call('post', '', input, 'owner', 'B').expect(404);
    const original = await call('post', '', input).expect(201);
    const shared = await call('post', '', {
      ...note(input.content, 'SHARED'),
      publishFrom: { memoryId: original.body.id, version: 1 },
    }).expect(201);
    expect(shared.body.sources).toEqual([ref]);
    await call('get', '/' + shared.body.id, undefined, 'other').expect(200);
    const change = {
      clientKey: randomUUID(),
      expectedVersion: 1,
      content: input.content,
      category: 'TECHNICAL',
      verification: 'USER_CONFIRMED',
      sourceRefs: [],
    };
    expect(
      (await call('patch', '/' + shared.body.id, change).expect(200)).body
        .sources,
    ).toEqual([ref]);
    await db.task.update({ where: { id: task.id }, data: { version: 2 } });
    await call('get', '/' + original.body.id).expect(409);
    await call('get', '/' + shared.body.id, undefined, 'other').expect(409);
    const unavailable = (
      await call('get', '?visibility=PRIVATE').expect(200)
    ).body.items.find((n: { id: string }) => n.id === original.body.id);
    expect(unavailable).toMatchObject({
      id: original.body.id,
      version: 1,
      content: null,
      sources: [],
      canEdit: true,
      sourceStatus: 'SOURCE_UNAVAILABLE',
    });
    expect(JSON.stringify(unavailable)).not.toContain(input.content);
    expect(JSON.stringify(unavailable)).not.toContain(task.id);
    expect(
      (
        await call('get', '?query=API-TASK-' + run, undefined, 'other').expect(
          200,
        )
      ).body.items,
    ).toEqual([]);
    const updated = await call('patch', '/' + original.body.id, {
      ...change,
      clientKey: randomUUID(),
      sourceRefs: [{ ...ref, version: '2' }],
    }).expect(200);
    expect(updated.body.sources).toEqual([{ ...ref, version: '2' }]);
    await db.task.update({
      where: { id: task.id },
      data: { deletedAt: new Date() },
    });
    await call('get', '/' + original.body.id).expect(404);
    await call('delete', '/' + original.body.id, {
      clientKey: randomUUID(),
      expectedVersion: 2,
    }).expect(200);
  });
  it('expands original AI answer dependencies and never treats AI text as an approved decision', async () => {
    const task = await db.task.create({
      data: {
        organizationId,
        projectId: projects.A,
        title: 'AI fixture source',
        createdBy: ownerId,
        updatedBy: ownerId,
      },
    });
    const answer = await db.chatAiAnswer.update({
      where: { id: sources.A!.answer },
      data: {
        model: 'memory-fixture-model',
        completedAt: new Date(),
        usage: {
          request: {
            version: 2,
            mode: 'UNIFIED',
            provider: 'chatgpt',
            model: 'memory-fixture-model',
            revision: 'fixture-generation',
            configDigest: digest,
            reasoning: 'default',
            dataClassification: 'PROJECT_AUTHORIZED',
            sourceIds: [],
            historyAnswerIds: [],
            policyVersion: 'project-ai-p1-v1',
            scope: {
              organizationId,
              projectId: projects.A,
              actorId: ownerId,
              conversationId: sources.A!.conversation,
            },
          },
          toolPermissions: ['project.read', 'task.read'],
          toolSources: [
            {
              handle: 'T_' + digest.slice(0, 24),
              label: 'Todo/tracker · ảnh chụp Task domain',
              version: digest,
              provenance: 'AI_DRAFT',
              permissions: ['project.read', 'task.read'],
              taskIds: [task.id],
              text: JSON.stringify({ items: [{ id: task.id, version: 1 }] }),
              createdAt: new Date().toISOString(),
            },
          ],
        },
      },
    });
    const ref = {
      kind: 'AI_ANSWER',
      id: answer.id,
      version: memoryDigest([
        answer.id,
        answer.question,
        answer.answer,
        answer.model,
        answer.completedAt,
      ]),
      locator: {},
    };
    const created = await call('post', '', {
      ...note('API-AI-LINEAGE-' + run),
      category: 'DECISION',
      sourceRefs: [ref],
    }).expect(201);
    expect(created.body.verification).toBe('USER_CONFIRMED');
    expect(created.body.sources).toContainEqual({
      kind: 'TASK',
      id: task.id,
      version: '1',
      locator: {},
    });
    const shared = await call('post', '', {
      ...note('API-AI-LINEAGE-' + run, 'SHARED'),
      publishFrom: { memoryId: created.body.id, version: 1 },
    }).expect(201);
    await call('get', '/' + shared.body.id, undefined, 'other').expect(404);
    await db.task.update({ where: { id: task.id }, data: { version: 2 } });
    await call('get', '/' + created.body.id).expect(409);
  });
  it('validates existing private File index/version/locator and keeps it private when publishing a note', async () => {
    const text = 'Thông số fixture: cao 2400 mm.\nChưa xác minh nghiệp vụ.',
      bytes = Buffer.from(text);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const file = await db.fileAsset.create({
      data: {
        organizationId,
        uploadedById: ownerId,
        originalFilename: 'p1-memory.txt',
        storedFilename: 'p1-memory.txt',
        mimeType: 'text/plain',
        sizeBytes: BigInt(bytes.length),
        storageKey: await app.get(FileStorage).put(organizationId, bytes),
        checksum,
        category: 'AI_ATTACHMENT',
      },
    });
    await db.entityAttachment.create({
      data: {
        fileAssetId: file.id,
        entityType: 'ChatAiConversation',
        entityId: sources.B!.conversation,
        projectId: projects.B,
        createdBy: ownerId,
      },
    });
    const indexId = randomUUID(),
      version = `${file.version}:${file.checksum}`;
    const index = await db.chatAiSourceIndex.create({
      data: {
        id: indexId,
        organizationId,
        projectId: projects.B!,
        ownerId,
        conversationId: sources.B!.conversation,
        fileAssetId: file.id,
        clientKey: randomUUID(),
        payloadHash: checksum,
        version,
        status: 'READY',
        text,
        checksum,
        chunks: chunks({
          organizationId,
          projectId: projects.B!,
          roomId: null,
          sourceId: indexId,
          version,
          text,
        }),
        label: 'Synthetic indexed TXT fixture',
        provenance: 'CHAT_ATTACHMENT',
      },
    });
    const ref = {
      kind: 'FILE_INDEX',
      id: index.id,
      version,
      locator: { startLine: 1, endLine: 1 },
    };
    await call(
      'post',
      '',
      { ...note(), sourceRefs: [{ ...ref, locator: { page: 8 } }] },
      'owner',
      'B',
    ).expect(400);
    await call(
      'post',
      '',
      { ...note(), sourceRefs: [ref] },
      'owner',
      'A',
    ).expect(404);
    const created = await call(
      'post',
      '',
      { ...note('API-FILE-' + run), sourceRefs: [ref] },
      'owner',
      'B',
    ).expect(201);
    const shared = await call(
      'post',
      '',
      {
        ...note('API-FILE-' + run, 'SHARED'),
        publishFrom: { memoryId: created.body.id, version: 1 },
      },
      'owner',
      'B',
    ).expect(201);
    expect(shared.body.sources).toEqual([ref]);
    await call('get', '/' + shared.body.id, undefined, 'other', 'B').expect(
      404,
    );
    await db.fileAsset.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });
    await call('get', '/' + created.body.id, undefined, 'owner', 'B').expect(
      404,
    );
    await call(
      'delete',
      '/' + created.body.id,
      { clientKey: randomUUID(), expectedVersion: 1 },
      'owner',
      'B',
    ).expect(200);
  });
  it('binds Project records to the existing stage-two view and rejects financial access without permission', async () => {
    const session = await db.session.findFirstOrThrow({
      where: { userId: ownerId, revokedAt: null },
    });
    const member = await db.organizationMembership.findFirstOrThrow({
      where: { organizationId, userId: ownerId },
    });
    const access = app.get(ProjectChatPolicy);
    const actor = await access.freshActor(db, {
      userId: ownerId,
      organizationId,
      organizationMembershipId: member.id,
      sessionId: session.id,
    } as CurrentActor);
    const data = await app.get(ProjectStageTwoService).get(actor, projects.B!);
    const ref = {
      kind: 'PROJECT_RECORD',
      id: projects.B,
      version: memoryDigest({ view: 'stage_two_plan', rows: data.plan }),
      locator: { view: 'stage_two_plan', includeFinancial: false },
    };
    const created = await call(
      'post',
      '',
      { ...note('API-RECORD-' + run), sourceRefs: [ref] },
      'owner',
      'B',
    ).expect(201);
    expect(created.body.sources).toEqual([ref]);
    await call(
      'post',
      '',
      {
        ...note(),
        sourceRefs: [
          { ...ref, locator: { ...ref.locator, includeFinancial: true } },
        ],
      },
      'owner',
      'B',
    ).expect(404);
    await call(
      'post',
      '',
      { ...note(), sourceRefs: [{ ...ref, version: 'changed' }] },
      'owner',
      'B',
    ).expect(409);
    await call(
      'post',
      '',
      { ...note(), sourceRefs: [ref] },
      'owner',
      'A',
    ).expect(404);
  });
  it('rolls back publication when PUBLISH is revoked before the response is released', async () => {
    const assignment = await db.userRole.findFirstOrThrow({
      where: { organizationId, userId: ownerId, status: 'active' },
    });
    const publish = await db.rolePermission.findFirstOrThrow({
      where: {
        roleId: assignment.roleId,
        permission: { code: 'chat.publish' },
      },
    });
    const audit = app.get(AuditService),
      originalWrite = audit.write.bind(audit),
      input = note('API-REVOKED-' + run, 'SHARED');
    const spy = vi.spyOn(audit, 'write').mockImplementationOnce(
      (...args) =>
        // The caller awaits this result; Prisma's relation methods are unused in this race fixture.
        (async () => {
          const result = await originalWrite(...args);
          await db.rolePermission.delete({
            where: {
              roleId_permissionId: {
                roleId: publish.roleId,
                permissionId: publish.permissionId,
              },
            },
          });
          return result;
        })() as ReturnType<AuditService['write']>,
    );
    try {
      await call('post', '', input).expect(403);
      expect(
        await db.chatAiMemory.count({
          where: {
            organizationId,
            projectId: projects.A,
            clientKey: input.clientKey,
          },
        }),
      ).toBe(0);
    } finally {
      spy.mockRestore();
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: publish.roleId,
            permissionId: publish.permissionId,
          },
        },
        create: publish,
        update: {},
      });
    }
  });
  it('hides shared content when project.read is revoked during source validation', async () => {
    const created = await call(
      'post',
      '',
      note('API-READ-REVOKED-' + run, 'SHARED'),
    ).expect(201);
    const assignment = await db.userRole.findFirstOrThrow({
      where: { organizationId, userId: ownerId, status: 'active' },
    });
    const permission = await db.rolePermission.findFirstOrThrow({
      where: {
        roleId: assignment.roleId,
        permission: { code: 'project.read' },
      },
    });
    const where = {
      roleId_permissionId: {
        roleId: permission.roleId,
        permissionId: permission.permissionId,
      },
    };
    const memory = app.get(ProjectAiMemoryService),
      original = memory.proofs.bind(memory);
    const spy = vi
      .spyOn(memory, 'proofs')
      .mockImplementationOnce(async (...args) => {
        const result = await original(...args);
        await db.rolePermission.delete({ where });
        return result;
      });
    try {
      const response = await call('get', '/' + created.body.id).expect(404);
      expect(JSON.stringify(response.body)).not.toContain(created.body.content);
    } finally {
      spy.mockRestore();
      await db.rolePermission.upsert({ where, create: permission, update: {} });
    }
  });
  it('checks every nested source, rejects cycles, and filters denied sources before pagination/cursors', async () => {
    const message = await db.chatMessage.findUniqueOrThrow({
      where: { id: sources.A!.message },
    });
    const parent = await db.chatProjectGrant.findFirstOrThrow({
      where: { organizationId, projectId: projects.A, userId: ownerId },
    });
    await db.chatProjectGrant.update({
      where: { id: parent.id },
      data: {
        actions: ['INVOKE', 'PUBLISH', 'ACCESS_ADMIN'],
        roomCeiling: ['READ'],
      },
    });
    const grant = await db.chatRoomGrant.create({
      data: {
        organizationId,
        projectId: projects.A!,
        roomId: message.roomId,
        userId: ownerId,
        issuedUnderId: parent.id,
        actions: ['READ'],
        grantedBy: ownerId,
        effectiveAt: new Date(message.createdAt.getTime() - 1000),
      },
    });
    const ref = {
      kind: 'CHAT_MESSAGE',
      id: message.id,
      version: message.payloadHash,
      locator: { startLine: 1, endLine: 1 },
    };
    const privateNote = await call('post', '', {
      ...note('API-PAGE-' + run),
      sourceRefs: [ref],
    }).expect(201);
    const before = await call(
      'post',
      '',
      note('API-PAGE-' + run, 'SHARED'),
    ).expect(201);
    const hidden = await call('post', '', {
      ...note('API-PAGE-' + run, 'SHARED'),
      publishFrom: { memoryId: privateNote.body.id, version: 1 },
    }).expect(201);
    const after = await call(
      'post',
      '',
      note('API-PAGE-' + run, 'SHARED'),
    ).expect(201);
    await call('get', '/' + hidden.body.id, undefined, 'other').expect(404);
    const first = await call(
      'get',
      '?query=API-PAGE-' + run + '&limit=1&visibility=SHARED',
      undefined,
      'other',
    ).expect(200);
    expect(first.body.items.map((v: { id: string }) => v.id)).toEqual([
      after.body.id,
    ]);
    const second = await call(
      'get',
      '?query=API-PAGE-' +
        run +
        '&limit=1&visibility=SHARED&cursor=' +
        first.body.nextCursor,
      undefined,
      'other',
    ).expect(200);
    expect(second.body.items.map((v: { id: string }) => v.id)).toEqual([
      before.body.id,
    ]);
    expect(second.body.nextCursor).toBeNull();
    expect(JSON.stringify([first.body, second.body])).not.toContain(
      hidden.body.id,
    );
    await call(
      'get',
      '?query=API-PAGE-' +
        run +
        '&limit=1&visibility=SHARED&cursor=' +
        first.body.nextCursor,
      undefined,
      'other',
      'B',
    ).expect(404);
    const forged = JSON.parse(
      Buffer.from(first.body.nextCursor, 'base64url').toString('utf8'),
    );
    const malformed = Buffer.from(
      JSON.stringify({ ...forged, id: '-'.repeat(36) }),
    ).toString('base64url');
    await call(
      'get',
      '?query=API-PAGE-' +
        run +
        '&limit=1&visibility=SHARED&cursor=' +
        malformed,
      undefined,
      'other',
    ).expect(400);
    const hiddenHead = await db.chatAiMemory.findUniqueOrThrow({
      where: { id: hidden.body.id },
    });
    const cursor = Buffer.from(
      JSON.stringify({
        ...forged,
        id: hidden.body.id,
        version: 1,
        updatedAt: hiddenHead.updatedAt.toISOString(),
      }),
    ).toString('base64url');
    await call(
      'get',
      '?query=API-PAGE-' + run + '&limit=1&visibility=SHARED&cursor=' + cursor,
      undefined,
      'other',
    ).expect(404);
    const nested = await call('post', '', {
      ...note('API-NESTED-' + run),
      sourceRefs: [
        {
          kind: 'MEMORY_REVISION',
          id: privateNote.body.revisionId,
          version: '1',
          locator: {},
        },
      ],
    }).expect(201);
    await db.chatRoomGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
    await call('get', '/' + nested.body.id).expect(404);
    await call('delete', '/' + nested.body.id, {
      clientKey: randomUUID(),
      expectedVersion: 1,
    }).expect(200);
    const a = await call('post', '', note('API-CYCLE-' + run)).expect(201);
    const b = await call('post', '', {
      ...note('API-CYCLE-' + run),
      sourceRefs: [
        {
          kind: 'MEMORY_REVISION',
          id: a.body.revisionId,
          version: '1',
          locator: {},
        },
      ],
    }).expect(201);
    await db.chatAiMemoryDependency.create({
      data: {
        revisionId: a.body.revisionId,
        organizationId,
        projectId: projects.A!,
        sourceKind: 'MEMORY_REVISION',
        sourceId: b.body.revisionId,
        memorySourceRevisionId: b.body.revisionId,
        sourceVersion: '1',
        locator: {},
        locatorHash: digest,
      },
    });
    await call('get', '/' + a.body.id).expect(404);
  });
});
afterAll(async () => {
  vi.restoreAllMocks();
  if (app) await app.close();
  await db.$disconnect();
  vi.unstubAllEnvs();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function memory(
  input: {
    projectId?: string;
    organizationId?: string;
    ownerId?: string;
    visibility?: string;
    kind?: string;
    conversationId?: string | null;
    version?: number;
    payloadHash?: string;
  } = {},
) {
  const id = randomUUID();
  await db.$executeRaw`INSERT INTO "ChatAiMemory"
    ("id","organizationId","projectId","ownerId","visibility","kind","conversationId",
     "clientKey","payloadHash","currentVersion","updatedAt") VALUES
    (${id}::uuid,${input.organizationId ?? organizationId}::uuid,${input.projectId ?? projects.A}::uuid,
     ${input.ownerId ?? ownerId}::uuid,${input.visibility ?? 'PRIVATE'},${input.kind ?? 'NOTE'},
     ${input.conversationId ?? null}::uuid,${randomUUID()}::uuid,${input.payloadHash ?? digest},
     ${input.version ?? 1},CURRENT_TIMESTAMP)`;
  return id;
}
async function revision(
  memoryId: string,
  input: {
    organizationId?: string;
    projectId?: string;
    version?: number;
    previousVersion?: number | null;
    content?: string;
    category?: string;
    verification?: string;
    editorId?: string;
    summary?: boolean;
    inputDigest?: string;
    summaryStatus?: string;
    policyVersion?: string | null;
    coveredAnswerIds?: string[] | null;
  } = {},
) {
  const id = randomUUID(),
    summary = input.summary ?? false;
  await db.$executeRaw`INSERT INTO "ChatAiMemoryRevision"
    ("id","memoryId","organizationId","projectId","version","previousVersion","content",
     "category","verification","editorId","clientKey","payloadHash","coveredAnswerIds",
     "inputDigest","model","policyVersion","tokenizerVersion","budget","summaryStatus") VALUES
    (${id}::uuid,${memoryId}::uuid,${input.organizationId ?? organizationId}::uuid,
     ${input.projectId ?? projects.A}::uuid,${input.version ?? 1},${input.previousVersion ?? null},
     ${input.content ?? 'X-private-A'},${input.category ?? (summary ? 'SUMMARY' : 'NOTE')},
     ${input.verification ?? 'UNVERIFIED'},${input.editorId ?? ownerId}::uuid,${randomUUID()}::uuid,
     ${digest},${input.coveredAnswerIds === undefined ? (summary ? [sources.A!.answer] : []) : input.coveredAnswerIds}::uuid[],${summary ? (input.inputDigest ?? digest) : null},
     ${summary ? 'fixture-model' : null},${summary ? (input.policyVersion === undefined ? 'project-ai-p1-v1' : input.policyVersion) : null},${summary ? 'fixture-tokenizer' : null},
     ${summary ? JSON.stringify({ status: 'VERIFIED', inputTokens: 100 }) : null}::jsonb,
     ${summary ? (input.summaryStatus ?? 'READY') : null})`;
  return id;
}
async function dependency(
  revisionId: string,
  kind: string,
  sourceId: string,
  typed: {
    answer?: string;
    message?: string;
    index?: string;
    memory?: string;
  } = {},
  sourceVersion = '1',
) {
  return db.$executeRaw`INSERT INTO "ChatAiMemoryDependency"
    ("revisionId","organizationId","projectId","sourceKind","sourceId","sourceVersion",
     "locator","locatorHash","permissions","answerSourceId","messageSourceId","indexSourceId","memorySourceRevisionId") VALUES
    (${revisionId}::uuid,${organizationId}::uuid,${projects.A}::uuid,${kind},${sourceId}::uuid,
     ${sourceVersion},'{}'::jsonb,${digest},ARRAY[]::text[],${typed.answer ?? null}::uuid,
     ${typed.message ?? null}::uuid,${typed.index ?? null}::uuid,${typed.memory ?? null}::uuid)`;
}
async function rejected(
  promise: Promise<unknown>,
  code: '23503' | '23514' | '23505',
) {
  try {
    await promise;
    throw new Error('Expected PostgreSQL constraint rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).meta?.code).toBe(
      code,
    );
  }
}

describe('P1 memory PostgreSQL constraints (real isolated database)', () => {
  it('rejects null predecessor and required summary metadata without relying on CHECK null semantics', async () => {
    const id = await memory();
    await revision(id);
    await rejected(revision(id, { version: 2 }), '23514');
    const summary = await memory({
      kind: 'CONVERSATION_SUMMARY',
      conversationId: sources.A!.conversation,
    });
    await rejected(
      revision(summary, {
        summary: true,
        inputDigest: 'c'.repeat(64),
        policyVersion: null,
      }),
      '23514',
    );
    const note = await memory();
    await rejected(revision(note, { coveredAnswerIds: null }), '23514');
  });
  it('keeps persisted content, visibility and inactive state immutable', async () => {
    const id = await memory(),
      rev = await revision(id);
    await rejected(
      db.$executeRaw`UPDATE "ChatAiMemoryRevision" SET "content"='forged' WHERE "id"=${rev}::uuid`,
      '23514',
    );
    await rejected(
      db.$executeRaw`UPDATE "ChatAiMemory" SET "visibility"='SHARED' WHERE "id"=${id}::uuid`,
      '23514',
    );
    await db.$executeRaw`UPDATE "ChatAiMemory" SET "inactiveAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid`;
    await rejected(
      db.$executeRaw`UPDATE "ChatAiMemory" SET "inactiveAt"=NULL WHERE "id"=${id}::uuid`,
      '23514',
    );
  });
  it('stores a valid private note and immutable revision sequence', async () => {
    const id = await memory();
    await revision(id);
    await revision(id, {
      version: 2,
      previousVersion: 1,
      content: 'X-private-A v2',
    });
    expect(
      await db.$queryRaw`SELECT "content" FROM "ChatAiMemoryRevision"
      WHERE "memoryId"=${id}::uuid ORDER BY "version"`,
    ).toEqual([{ content: 'X-private-A' }, { content: 'X-private-A v2' }]);
  });
  it('enforces tenant/project/editor scope even for direct database writes', async () => {
    const id = await memory();
    await revision(id);
    await rejected(memory({ projectId: projects.T2 }), '23503');
    await rejected(memory({ ownerId: randomUUID() }), '23503');
    await rejected(
      revision(id, { projectId: projects.B, version: 2, previousVersion: 1 }),
      '23503',
    );
    await rejected(
      revision(id, {
        organizationId: otherOrganizationId,
        projectId: projects.T2,
        version: 2,
        previousVersion: 1,
      }),
      '23503',
    );
    await rejected(
      revision(id, { editorId: randomUUID(), version: 2, previousVersion: 1 }),
      '23503',
    );
  });
  it('keeps summaries private and tied to the same conversation/project/owner', async () => {
    const id = await memory({
      kind: 'CONVERSATION_SUMMARY',
      conversationId: sources.A!.conversation,
    });
    await revision(id, { summary: true });
    await rejected(memory({ kind: 'CONVERSATION_SUMMARY' }), '23514');
    await rejected(
      memory({
        kind: 'CONVERSATION_SUMMARY',
        visibility: 'SHARED',
        conversationId: sources.A!.conversation,
      }),
      '23514',
    );
    await rejected(
      memory({
        kind: 'CONVERSATION_SUMMARY',
        conversationId: sources.B!.conversation,
      }),
      '23503',
    );
    await rejected(
      memory({
        kind: 'CONVERSATION_SUMMARY',
        conversationId: sources.A!.conversation,
        ownerId: otherOwnerId,
      }),
      '23503',
    );
    await rejected(
      memory({ conversationId: sources.A!.conversation }),
      '23514',
    );
    await rejected(
      revision(id, {
        version: 2,
        previousVersion: 1,
        summary: true,
        inputDigest: digest,
      }),
      '23505',
    );
  });
  it('rejects invalid enums, versions, hashes, content and summary metadata', async () => {
    const id = await memory();
    await revision(id);
    for (const input of [
      { visibility: 'GLOBAL' },
      { kind: 'FACT' },
      { version: 0 },
      { payloadHash: 'bad' },
    ])
      await rejected(memory(input), '23514');
    for (const input of [
      { content: '' },
      { content: 'x'.repeat(8001) },
      { category: 'APPROVED' },
      { verification: 'BUSINESS_APPROVED' },
      { version: 0 },
      { version: 2, previousVersion: 0 },
      { version: 2, previousVersion: 1, summary: true },
    ]) {
      const head = await memory();
      await rejected(revision(head, input), '23514');
    }
  });
  it('pins each typed source to this revision tenant and Project', async () => {
    for (const [kind, key, field] of [
      ['AI_ANSWER', 'answer', 'answer'],
      ['CHAT_MESSAGE', 'message', 'message'],
      ['FILE_INDEX', 'index', 'index'],
    ] as const) {
      const id = await memory(),
        rev = await revision(id);
      await dependency(rev, kind, sources.A![key], {
        [field]: sources.A![key],
      });
      await rejected(
        dependency(rev, kind, sources.B![key], { [field]: sources.B![key] }),
        '23503',
      );
      await rejected(
        dependency(rev, kind, sources.T2![key], { [field]: sources.T2![key] }),
        '23503',
      );
    }
    const id = await memory(),
      rev = await revision(id),
      other = await memory({ projectId: projects.B });
    const otherRev = await revision(other, { projectId: projects.B });
    await rejected(
      dependency(rev, 'MEMORY_REVISION', otherRev, { memory: otherRev }),
      '23503',
    );
    await rejected(
      dependency(rev, 'MEMORY_REVISION', rev, { memory: rev }),
      '23514',
    );
  });
  it('rejects missing, extra, mismatched typed IDs and oversized source versions', async () => {
    const id = await memory(),
      rev = await revision(id);
    await dependency(rev, 'TASK', randomUUID());
    await rejected(dependency(rev, 'AI_ANSWER', sources.A!.answer), '23514');
    await rejected(
      dependency(rev, 'AI_ANSWER', sources.A!.message, {
        answer: sources.A!.answer,
      }),
      '23514',
    );
    await rejected(
      dependency(rev, 'AI_ANSWER', sources.A!.answer, {
        answer: sources.A!.answer,
        message: sources.A!.message,
      }),
      '23514',
    );
    await rejected(
      dependency(rev, 'TASK', sources.A!.answer, { answer: sources.A!.answer }),
      '23514',
    );
    await rejected(
      dependency(rev, 'PROJECT_RECORD', randomUUID(), {}, 'x'.repeat(201)),
      '23514',
    );
    await rejected(dependency(rev, 'GLOBAL', randomUUID()), '23514');
  });
  it('prevents cross-Project answer memory lineage', async () => {
    const id = await memory(),
      rev = await revision(id);
    const insert = (
      answerId: string,
    ) => db.$executeRaw`INSERT INTO "ChatAiAnswerMemoryDependency"
      ("answerId","memoryRevisionId","organizationId","projectId") VALUES
      (${answerId}::uuid,${rev}::uuid,${organizationId}::uuid,${projects.A}::uuid)`;
    await insert(sources.A!.answer);
    await rejected(insert(sources.B!.answer), '23503');
    await rejected(insert(sources.T2!.answer), '23503');
  });
});
