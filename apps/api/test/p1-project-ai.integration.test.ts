import { ProjectAiWorkspaceService } from '../src/project-chat/project-ai-workspace.service';
import { McpExecutionService } from '../src/mcp/mcp.execution';
import { McpJobsService } from '../src/mcp/mcp.jobs.service';
import { ProjectsService } from '../src/projects/projects.service';
import { ProjectChatPolicy } from '../src/access-control/project-chat.policy';
import { ProjectAiService } from '../src/project-chat/project-ai.service';
import { workflowMetadata, runProofDigest } from '../src/project-chat/ai-run';
import { chatGptRequest } from '../src/project-chat/ai-chatgpt-plan';
import { WorkspaceAgentService } from '../src/settings/workspace-agent.service';
import { WorkspaceConnectorAuth } from '../src/project-chat/workspace-connector-auth';
import { digest } from '../src/project-chat/project-ai-workspace.service';
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient, Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { stat, statfs, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module';
import { UploadsController } from '../src/uploads/uploads.controller';
import { UploadsService } from '../src/uploads/uploads.service';
import { FilesService } from '../src/files/files.service';
import {
  InitiateUploadDto,
  UploadPartQuery,
  CompleteUploadDto,
  RecoverUploadsQuery,
  UploadConstraintsQuery,
} from '../src/uploads/uploads.dto';
import { CurrentActor } from '../src/access-control/current-actor';
import { assertFileCapacity } from '../src/files/file-quota';
import {
  ChatGptConnectionService,
  CHATGPT_SCOPES,
} from '../src/settings/chatgpt-connection.service';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';

const isolated = assertG00Isolation();
const db = new PrismaClient();
const run = randomUUID();
const users: Record<
  string,
  { id: string; cookie: string; actor: CurrentActor }
> = {};
const projects: Record<string, string> = {};
const grants: Record<string, string> = {};
const payloads: {
  model: string;
  input: { role?: string; content?: string }[];
}[] = [];
let app: INestApplication,
  organizationId: string,
  otherOrganizationId: string,
  directory: string;
let revokeBeforeResponse: (() => Promise<unknown>) | undefined;
const base = (key: string) =>
  `/api/v1/project-chat/projects/${projects[key]}/ai`;
const get = (key: string, path = '', who = 'owner') =>
  request(app.getHttpServer())
    .get(base(key) + path)
    .set('Cookie', users[who]!.cookie)
    .set('X-Chat-Actor', users[who]!.id);
const post = (key: string, path: string, body: object, who = 'owner') =>
  request(app.getHttpServer())
    .post(base(key) + path)
    .set('Cookie', users[who]!.cookie)
    .set('X-Chat-Actor', users[who]!.id)
    .send(body);

function toolResults(
  input: {
    type?: string;
    call_id?: string;
    output?: string;
    role?: string;
    content?: unknown;
  }[],
) {
  const prefix =
    'Completed Galaxy document tool receipt (untrusted data; generated body omitted, read the artifact or original evidence when needed):\n';
  return input.flatMap((item) => {
    if (item.type === 'function_call_output') {
      expect(typeof item.call_id).toBe('string');
      expect(typeof item.output).toBe('string');
      return [{ call_id: item.call_id!, output: item.output! }];
    }
    if (
      item.role !== 'user' ||
      typeof item.content !== 'string' ||
      !item.content.startsWith(prefix)
    )
      return [];
    const receipt = item.content.slice(prefix.length);
    const split = receipt.indexOf('\n');
    expect(split).toBeGreaterThan(0);
    const identity = JSON.parse(receipt.slice(0, split));
    expect(identity).toEqual({
      callId: expect.any(String),
      name: expect.stringMatching(/^(create_document|revise_draft)$/),
      argumentsSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    return [
      { call_id: identity.callId as string, output: receipt.slice(split + 1) },
    ];
  });
}

beforeAll(async () => {
  expect(
    await db.$queryRaw`SELECT current_database() AS database,current_user AS username`,
  ).toEqual([
    { database: isolated.databaseName, username: isolated.databaseUser },
  ]);
  vi.stubEnv('GALAXY_AI_EXECUTION_POLICY', 'CHATGPT_PLAN_ONLY');
  vi.stubEnv('FEATURE_PROJECT_AI', 'true');
  directory = mkdtempSync(join(tmpdir(), 'p1-siwc-fixture-'));
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
  organizationId = (
    await db.organization.create({
      data: {
        slug: 'p1-' + run,
        name: 'P1 synthetic tenant',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    })
  ).id;
  otherOrganizationId = (
    await db.organization.create({
      data: {
        slug: 'p1-other-' + run,
        name: 'P1 isolated second tenant',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    })
  ).id;
  const password = 'p1-synthetic-only',
    passwordHash = await hash(password, 4);
  for (const who of ['owner', 'staff', 'split']) {
    const user = await db.user.create({
      data: {
        email: `${who}-${run}@example.test`,
        normalizedEmail: `${who}-${run}@example.test`,
        displayName: who,
        status: 'active',
        credential: { create: { passwordHash, mustChangePassword: false } },
        organizationMembers: { create: { organizationId, kind: 'INTERNAL' } },
      },
      include: { organizationMembers: true },
    });
    users[who] = {
      id: user.id,
      cookie: '',
      actor: {
        userId: user.id,
        organizationId,
        organizationMembershipId: user.organizationMembers[0]!.id,
        permissions: [],
        permissionSources: [],
        administrationScope: 'SYSTEM',
        administrationTier: 0,
        managedDepartmentIds: [],
        email: user.email,
        displayName: who,
        mustChangePassword: false,
      },
    };
  }
  const owner = users.owner!.id;
  const role = await db.role.create({
    data: {
      organizationId,
      code: 'p1-admin-' + run,
      name: 'P1 fixture admin',
      maximumScope: 'SYSTEM',
      permissions: {
        create: [
          'ai.invoke',
          'project.read',
          'task.read',
          'file.upload',
          'file.read',
          'file.download',
          'system.settings.update',
        ].map((code) => ({ permission: { connect: { code } } })),
      },
    },
  });
  for (const who of ['owner', 'staff'])
    await db.userRole.create({
      data: {
        organizationId,
        userId: users[who]!.id,
        roleId: role.id,
        scopeType: 'SYSTEM',
      },
    });
  for (const [permission, scopeType] of [
    ['ai.invoke', 'SELF'],
    ['system.settings.update', 'SYSTEM'],
  ] as const) {
    const scopedRole = await db.role.create({
      data: {
        organizationId,
        code: permission + '-' + run,
        name: 'P1 split binding',
        maximumScope: 'SYSTEM',
        permissions: {
          create: { permission: { connect: { code: permission } } },
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId,
        userId: users.split!.id,
        roleId: scopedRole.id,
        scopeType,
      },
    });
  }
  for (const key of ['A', 'B', 'C', 'R', 'T2']) {
    const tenant = key === 'T2' ? otherOrganizationId : organizationId;
    const customer = await db.customer.create({
      data: {
        organizationId: tenant,
        type: 'INDIVIDUAL',
        displayName: 'Synthetic customer',
        createdBy: owner,
        updatedBy: owner,
      },
    });
    projects[key] = (
      await db.project.create({
        data: {
          organizationId: tenant,
          customerId: customer.id,
          code: key + '-' + run,
          name: 'Project ' + key,
          status: key === 'B' ? 'PLANNING' : 'ACTIVE',
          createdBy: owner,
          updatedBy: owner,
        },
      })
    ).id;
    if (key === 'C' || key === 'T2') continue;
    grants[key] = (
      await db.chatProjectGrant.create({
        data: {
          organizationId,
          projectId: projects[key]!,
          userId: owner,
          grantedBy: owner,
          actions: ['INVOKE'],
          roomCeiling: [],
          effectiveAt: new Date(Date.now() - 60000),
        },
      })
    ).id;
  }
  for (const who of ['staff', 'split'])
    await db.chatProjectGrant.create({
      data: {
        organizationId,
        projectId: projects.B!,
        userId: users[who]!.id,
        grantedBy: owner,
        actions: ['INVOKE'],
        roomCeiling: [],
        effectiveAt: new Date(Date.now() - 60000),
      },
    });
  vi.stubEnv('GALAXY_CHATGPT_PILOT_PROJECT_IDS', projects.A!);
  // Vitest's TypeScript transform omits the DTO metadata emitted by the production compiler.
  for (const [method, types] of [
    ['initiate', [Object, InitiateUploadDto]],
    ['part', [Object, String, UploadPartQuery, Object]],
    ['complete', [Object, String, CompleteUploadDto]],
    ['recovery', [Object, RecoverUploadsQuery]],
    ['constraints', [Object, UploadConstraintsQuery]],
  ] as const)
    Reflect.defineMetadata(
      'design:paramtypes',
      types,
      UploadsController.prototype,
      method,
    );
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const application = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  application.useBodyParser('json', { limit: '512kb' });
  application.useBodyParser('urlencoded', { limit: '64kb', extended: false });
  app = application;
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  for (const who of Object.keys(users)) {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `${who}-${run}@example.test`, password })
      .expect(201);
    users[who]!.cookie = (
      login.headers['set-cookie'] as unknown as string[]
    )[0]!.split(';')[0]!;
    const session = await db.session.findFirstOrThrow({
      where: { userId: users[who]!.id },
      orderBy: { createdAt: 'desc' },
    });
    users[who]!.actor.sessionId = session.id;
  }
  const actor = users.owner!.actor;
  await db.$transaction((tx) =>
    app.get(ChatGptConnectionService)['save'](
      organizationId,
      {
        generation: 'p1-fixture-generation',
        owner: {
          userId: actor.userId,
          organizationId,
          organizationMembershipId: actor.organizationMembershipId,
          sessionId: actor.sessionId!,
        },
        identity: {
          issuer: 'https://auth.openai.com',
          subject: 'fixture',
          label: 'fixture',
        },
        clientId: 'oaiapp_fixture',
        scopes: CHATGPT_SCOPES.split(' '),
        credentials: {
          access_token: 'p1-fixture-only',
          expiresAt: Date.now() + 3600000,
        },
        status: 'OWNER_READY',
        models: [{ id: 'account-model', label: 'Account model' }],
        catalogAt: null,
        verifiedAt: null,
        revocation: 'NOT_RUN',
      },
      tx,
    ),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(new Headers(init.headers).get('authorization')).toBe(
        'Bearer p1-fixture-only',
      );
      const body = JSON.parse(String(init.body));
      payloads.push(body);
      expect(body.model).toBe('account-model');
      expect(body.store).toBe(false);
      expect(body.stream).toBe(true);
      const context = body.input.find(
        (i: { role?: string }) => i.role === 'developer',
      );
      const text = context.content.includes(projects.A)
        ? 'sentinel-A'
        : 'sentinel-B';
      if (revokeBeforeResponse) {
        const revoke = revokeBeforeResponse;
        revokeBeforeResponse = undefined;
        await revoke();
      }
      return new Response(
        'event: response.completed\ndata: ' +
          JSON.stringify({
            type: 'response.completed',
            response: {
              status: 'completed',
              model: body.model,
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text }],
                },
              ],
            },
          }) +
          '\n\n',
        {
          headers: {
            'content-type': 'text/event-stream',
            'x-request-id': 'fixture-' + payloads.length,
          },
        },
      );
    }),
  );
});
afterAll(async () => {
  if (organizationId)
    await db.systemSetting.deleteMany({
      where: {
        key: {
          in: [
            'chatgpt.connection.' + organizationId,
            'workspace.agents.' + organizationId,
          ],
        },
      },
    });
  await app?.close();
  await db.$disconnect();
  if (directory) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function ask(key: string, conversationId?: string) {
  const conversation =
    conversationId ??
    (
      await post(key, '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
  const queued = await post(key, `/conversations/${conversation}/answers`, {
    question: 'Explain SQL JOIN',
    model: 'account-model',
    clientKey: randomUUID(),
  }).expect(201);
  return { conversation, id: queued.body.id };
}

it('returns lightweight conversation metadata only to its current authorized Project owner', async () => {
  const turn = await ask('B');
  const path = `/conversations/${turn.conversation}/metadata`;
  const metadata = await get('B', path).expect(200);
  expect(metadata.body).toEqual({
    id: turn.conversation,
    scope: 'ALL',
    context: null,
    mode: 'UNIFIED',
  });
  await get('A', path).expect(404);
  await get('B', '', 'staff').expect(200);
  await get('B', path, 'staff').expect(404);
  const reads = vi.spyOn(app.get(ProjectAiService), 'history');
  await get('B', path).expect(200);
  expect(reads).not.toHaveBeenCalled();
  reads.mockRestore();
  await db.chatProjectGrant.update({
    where: { id: grants.B },
    data: { revokedAt: new Date() },
  });
  try {
    await get('B', path).expect(404);
  } finally {
    await db.chatProjectGrant.update({
      where: { id: grants.B },
      data: { revokedAt: null },
    });
  }
});

it('serves the same owner catalog across ACTIVE and PLANNING Projects without rooms', async () => {
  const a = await get('A').expect(200),
    b = await get('B').expect(200);
  expect(a.body.models.map((m: { id: string }) => m.id)).toEqual(
    b.body.models.map((m: { id: string }) => m.id),
  );
  expect(b.body.models.every((m: { available: boolean }) => m.available)).toBe(
    true,
  );
  expect(await db.chatRoom.count({ where: { projectId: projects.B } })).toBe(0);
  for (const key of ['A', 'B']) {
    const turn = await ask(key);
    const done = await post(key, `/answers/${turn.id}/run`, {}).expect(201);
    expect(done.body.errorCode ?? null).toBeNull();
    expect(done.body).toMatchObject({
      status: 'COMPLETED',
      model: 'account-model',
      answer: 'sentinel-' + key,
    });
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: turn.id } }))
        .usage,
    ).toMatchObject({
      terminal: 'response.completed',
      request: {
        version: 3,
        scope: {
          projectId: projects[key],
          conversationId: turn.conversation,
          actorId: users.owner!.id,
        },
      },
    });
    const history = await get(
      key,
      `/conversations/${turn.conversation}`,
    ).expect(200);
    expect(JSON.stringify(history.body)).not.toContain(
      'sentinel-' + (key === 'A' ? 'B' : 'A'),
    );
    await get(
      key === 'A' ? 'B' : 'A',
      `/conversations/${turn.conversation}`,
    ).expect(404);
  }
  expect(
    (await app.get(ChatGptConnectionService).owner(users.owner!.actor))
      .generation,
  ).toBe('p1-fixture-generation');
});
it('rejects missing Project grants, tenant crossing and split permission bindings before inference', async () => {
  const count = payloads.length;
  for (const key of ['C', 'T2']) {
    await get(key).expect(404);
    await post(key, '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(404);
  }
  await get('B', '', 'split').expect(404);
  const catalog = await get('B', '', 'staff').expect(200);
  expect(catalog.body.models).toEqual([]);
  const conversation = await post(
    'B',
    '/conversations',
    { scope: 'ALL', clientKey: randomUUID() },
    'staff',
  ).expect(201);
  const response = await post(
    'B',
    `/conversations/${conversation.body.id}/answers`,
    { question: 'Hello', model: 'account-model', clientKey: randomUUID() },
    'staff',
  );
  expect(response.status).toBe(409);
  expect(response.body.message).toBe('CHATGPT_OWNER_ONLY');
  expect(payloads).toHaveLength(count);
});
it('rejects a conversation from another Project and forged client scope', async () => {
  const turn = await ask('A'),
    count = payloads.length;
  await post('B', `/conversations/${turn.conversation}/answers`, {
    question: 'Hello',
    model: 'account-model',
    clientKey: randomUUID(),
  }).expect(404);
  await post('B', '/conversations', {
    scope: 'ALL',
    clientKey: randomUUID(),
    projectId: projects.A,
  }).expect(400);
  expect(payloads).toHaveLength(count);
});
it('rechecks revoked Project authority after the real stream codec, before publication', async () => {
  const turn = await ask('R');
  revokeBeforeResponse = () =>
    db.chatProjectGrant.update({
      where: { id: grants.R! },
      data: { revokedAt: new Date() },
    });
  const result = await post('R', `/answers/${turn.id}/run`, {});
  expect(result.status).toBe(404);
  const answer = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: turn.id },
  });
  expect(answer.status).toBe('ACCESS_REVOKED');
  expect(answer.answer).toBeNull();
  await get('R', `/conversations/${turn.conversation}`).expect(404);
});

it('E01 SIWC creates and downloads a real private PDF through the tool loop without rewriting the question', async () => {
  const prior = globalThis.fetch;
  const args = {
    format: 'pdf',
    title: 'E01 synthetic PDF',
    blocks: [
      { kind: 'paragraph', text: 'Nghĩa vụ thử 7392, chưa được duyệt.' },
    ],
  };
  let rounds = 0;
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    rounds++;
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('account-model');
    expect(JSON.stringify(body.tools)).toContain('create_document');
    expect(
      body.input.some(
        (i: { role?: string; content?: string }) =>
          i.role === 'user' && i.content === '  Create synthetic PDF 😀\n',
      ),
    ).toBe(true);
    const result = toolResults(body.input).find((i) => i.call_id === 'e01-pdf');
    if (result) {
      expect(
        body.input.some((i: { type?: string }) => i.type === 'function_call'),
      ).toBe(false);
      expect(JSON.stringify(body.input)).toContain(
        createHash('sha256').update(JSON.stringify(args)).digest('hex'),
      );
    }
    const output = result
      ? [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Đã tạo bản nháp riêng.' }],
          },
        ]
      : [
          {
            type: 'function_call',
            namespace: 'galaxy',
            call_id: 'e01-pdf',
            name: 'create_document',
            arguments: JSON.stringify(args),
          },
        ];
    return new Response(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: { status: 'completed', model: body.model, output },
        }) +
        '\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  try {
    const c = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const a = (
      await post('B', `/conversations/${c}/answers`, {
        question: '  Create synthetic PDF 😀\n',
        model: 'account-model',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const done = (await post('B', `/answers/${a.id}/run`, {}).expect(201)).body;
    expect({ status: done.status, errorCode: done.errorCode }).toEqual({
      status: 'COMPLETED',
      errorCode: null,
    });
    expect(rounds).toBe(2);
    expect(done.artifacts).toHaveLength(1);
    const artifact = done.artifacts[0];
    const markdown = await get('B', `/answers/${a.id}/markdown`).expect(200);
    expect(markdown.text).toContain(artifact.filename);
    expect(markdown.text).toContain(artifact.version);
    expect(markdown.text).toContain(artifact.downloadUrl);
    expect(rounds).toBe(2);
    const downloaded = await get('B', `/files/${artifact.sourceId}/download`)
      .buffer(true)
      .parse((response, complete) => {
        const parts: Buffer[] = [];
        response.on('data', (b) => parts.push(b));
        response.on('end', () => complete(null, Buffer.concat(parts)));
        response.on('error', complete);
      })
      .expect(200);
    const file = await db.fileAsset.findUniqueOrThrow({
      where: { id: artifact.fileAssetId },
    });
    const { createHash } = await import('node:crypto');
    expect(createHash('sha256').update(downloaded.body).digest('hex')).toBe(
      file.checksum,
    );
    const { documentText } = await import(
      '../src/project-chat/ai-native-source'
    );
    const extracted = await documentText(
      {
        organizationId,
        projectId: projects.B!,
        roomId: '',
        sourceId: artifact.sourceId,
        version: artifact.version,
        text: '',
      },
      artifact.filename,
      'application/pdf',
      downloaded.body,
      file.checksum!,
    );
    expect(extracted.text).toContain('7392');
    const preview = await get(
      'B',
      `/files/${artifact.sourceId}/preview`,
    ).expect(200);
    expect(preview.headers['content-type']).toContain('application/pdf');
    expect(preview.headers['content-disposition']).toMatch(/^inline;/);
    expect(preview.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    await get('A', `/files/${artifact.sourceId}/preview`).expect(404);
    await get('B', `/files/${artifact.sourceId}/preview`, 'staff').expect(404);
    await get('A', `/files/${artifact.sourceId}/download`).expect(404);
    expect(
      (await get('B', `/conversations/${c}`).expect(200)).body.answers.at(-1)
        .artifacts[0].fileAssetId,
    ).toBe(file.id);
  } finally {
    vi.stubGlobal('fetch', prior);
  }
});

it('E01 SIWC analyzes a real private XLSX region and preserves source authorization and reload', async () => {
  const previous = globalThis.fetch;
  let artifactId = '',
    phase = 'create',
    round = 0;
  const document = {
    format: 'xlsx',
    title: 'Synthetic exact table',
    blocks: [
      {
        kind: 'table',
        rows: [
          ['Item', 'Amount'],
          ['Public synthetic', '9007199254740993.01'],
        ],
      },
    ],
  };
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    expect(JSON.stringify(body.tools)).toContain('analyze_table');
    const first = round++ % 2 === 0;
    if (!first && phase === 'analyze') {
      const output = body.input
        .filter(
          (item: { type?: string }) => item.type === 'function_call_output',
        )
        .at(-1);
      expect(output.output).toContain('9007199254740993.01');
      expect(output.output).toContain('Bản nháp');
    }
    const output = first
      ? [
          {
            type: 'function_call',
            namespace: 'galaxy',
            call_id: 'xlsx-' + phase,
            name: phase === 'create' ? 'create_document' : 'analyze_table',
            arguments: JSON.stringify(
              phase === 'create'
                ? document
                : { sourceId: artifactId, sheet: 'Bản nháp', range: 'A1:B8' },
            ),
          },
        ]
      : [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text:
                  phase === 'create'
                    ? 'Created synthetic workbook'
                    : 'Read exact XLSX value 9007199254740993.01',
              },
            ],
          },
        ];
    return new Response(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: { status: 'completed', model: body.model, output },
        }) +
        '\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  try {
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const created = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'Create synthetic table',
        model: 'account-model',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const done = (await post('B', `/answers/${created.id}/run`, {}).expect(201))
      .body;
    expect({ status: done.status, errorCode: done.errorCode }).toEqual({
      status: 'COMPLETED',
      errorCode: null,
    });
    artifactId = done.artifacts[0].sourceId;
    phase = 'analyze';
    await post('B', '/index', {
      scope: 'ALL',
      fileAssetId: done.artifacts[0].fileAssetId,
      fileVersion: 1,
    }).expect(201);
    expect(
      (
        await db.chatAiSourceIndex.findUniqueOrThrow({
          where: { id: artifactId },
        })
      ).status,
    ).toBe('READY');
    const input = {
      question: '  Analyze the exact spreadsheet region 😀\n',
      model: 'account-model',
      clientKey: randomUUID(),
      sourceIds: [artifactId],
    };
    const queued = (
      await post('B', `/conversations/${conversation}/answers`, input).expect(
        201,
      )
    ).body;
    const analyzed = (
      await post('B', `/answers/${queued.id}/run`, {}).expect(201)
    ).body;
    expect({ status: analyzed.status, errorCode: analyzed.errorCode }).toEqual({
      status: 'COMPLETED',
      errorCode: null,
    });
    expect(analyzed.answer).toContain('9007199254740993.01');
    expect(round).toBe(4);
    const row = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(row.question).toBe(input.question);
    const caveat = 'Chỉ sử dụng phần nguồn đã được phép gửi tới nhà cung cấp.';
    await db.chatAiAnswer.update({
      where: { id: queued.id },
      data: { uncertainty: caveat },
    });
    expect(analyzed.sources.length).toBeGreaterThan(0);
    const cited = analyzed.sources[0];
    const markdown = await get('B', `/answers/${queued.id}/markdown`).expect(
      200,
    );
    expect(markdown.text).toContain(input.question);
    expect(markdown.text).toContain(analyzed.answer);
    expect(markdown.text).toContain(caveat);
    expect(markdown.text).toContain(
      `][${cited.handle}] · bản ${cited.version} · ${cited.provenance}`,
    );
    expect(markdown.text).toContain(`\n\n[${cited.handle}]: http`);
    expect(markdown.text).toContain(`${cited.sheet}!${cited.range}`);
    await get('B', `/answers/${queued.id}/sources/${cited.handle}`).expect(200);
    expect(
      (row.usage as { toolExecutions: { name: string }[] }).toolExecutions.some(
        (t) => t.name === 'analyze_table',
      ),
    ).toBe(true);
    expect(
      await db.chatAiAnswerDependency.count({
        where: { answerId: queued.id, sourceIndexId: artifactId },
      }),
    ).toBe(1);
    const other = (
      await post('A', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    await post('A', `/conversations/${other}/answers`, {
      ...input,
      clientKey: randomUUID(),
    }).expect(404);
    expect(
      (
        await get('B', `/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1).answer,
    ).toBe(analyzed.answer);
  } finally {
    vi.stubGlobal('fetch', previous);
  }
}, 60000);

it('E03 indexes only the sheet manifest when full extraction is too large, retaining bounded range citations and late-source isolation', async () => {
  const previous = globalThis.fetch;
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook(),
    sheet = workbook.addWorksheet('Large');
  for (let i = 1; i <= 901; i++)
    sheet.getCell('A' + i).value = 'Synthetic ' + i + ' ' + 'x'.repeat(400);
  workbook.addWorksheet('Second').getCell('A1').value = '0007392';
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  expect(bytes.length).toBeLessThan(50000);
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const sourceId = (
    await request(app.getHttpServer())
      .post(base('B') + `/conversations/${conversation}/files`)
      .set('Cookie', users.owner!.cookie)
      .set('X-Chat-Actor', users.owner!.id)
      .field('clientKey', randomUUID())
      .attach('file', bytes, {
        filename: 'E02-bounded-range.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201)
  ).body.id;
  await post('B', '/index', { scope: 'ALL' }).expect(201);
  const index = await db.chatAiSourceIndex.findUniqueOrThrow({
    where: { id: sourceId },
  });
  expect({ status: index.status, errorCode: index.errorCode }).toEqual({
    status: 'READY',
    errorCode: null,
  });
  expect(index.processingMetadata).toMatchObject({
    scope: 'XLSX_SHEET_MANIFEST_ONLY',
    cellsRead: 0,
    modelRead: 'UNKNOWN',
    sheets: [
      { name: 'Large', rows: 901, columns: 1, populatedRows: 901 },
      { name: 'Second', rows: 1, columns: 1, populatedRows: 1 },
    ],
  });
  expect(index.text).not.toContain('0007392');
  expect(
    (await get('B', '/index?scope=ALL').expect(200)).body.sources.find(
      (source: { id: string }) => source.id === sourceId,
    ),
  ).toMatchObject({ rangeRead: true });
  let round = 0,
    providerError: unknown;
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    try {
      const body = JSON.parse(String(options.body));
      const first = round++ === 0;
      if (!first) expect(JSON.stringify(body.input)).toContain('0007392');
      const output = first
        ? [
            {
              type: 'function_call',
              namespace: 'galaxy',
              name: 'analyze_table',
              call_id: 'bounded-range',
              arguments: JSON.stringify({
                sourceId,
                sheet: 'Second',
                range: 'A1:A1',
              }),
            },
          ]
        : [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Second!A1 is 0007392; only the selected range was read.',
                },
              ],
            },
          ];
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: { status: 'completed', model: body.model, output },
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    } catch (e) {
      providerError = e;
      throw e;
    }
  });
  try {
    const queued = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'Read Second!A1:A1 from the selected workbook',
        model: 'account-model',
        searchMode: 'PROJECT_ONLY',
        sourceIds: [sourceId],
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const done = (await post('B', `/answers/${queued.id}/run`, {}).expect(201))
      .body;
    if (providerError) throw providerError;
    expect(done.status).toBe('COMPLETED');
    expect(round).toBe(2);
    const citation = (
      await get(
        'B',
        `/answers/${done.id}/sources/${done.sources[0].handle}`,
      ).expect(200)
    ).body;
    expect(citation).toMatchObject({
      sheet: 'Second',
      range: 'A1:A1',
      version: index.version,
    });
    expect(citation.downloadUrl).toContain('/download');
    expect(citation.text).toContain('0007392');
    const response = await request(app.getHttpServer())
      .get(citation.downloadUrl)
      .set('Cookie', users.owner!.cookie)
      .set('X-Chat-Actor', users.owner!.id)
      .buffer(true)
      .parse((response, complete) => {
        const parts: Buffer[] = [];
        response.on('data', (part) => parts.push(part));
        response.on('end', () => complete(null, Buffer.concat(parts)));
        response.on('error', complete);
      })
      .expect(200);
    expect(Buffer.from(response.body)).toEqual(bytes);
    await get(
      'A',
      `/answers/${done.id}/sources/${done.sources[0].handle}`,
    ).expect(404);
    expect(
      (
        await get('B', `/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1).answer,
    ).toBe(done.answer);
    await db.fileAsset.update({
      where: { id: index.fileAssetId! },
      data: { deletedAt: new Date() },
    });
    expect(
      (
        await get('B', `/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1),
    ).toMatchObject({ status: 'ACCESS_REVOKED', answer: null });
  } finally {
    vi.stubGlobal('fetch', previous);
  }
});

it.each([49_999_999, 50_000_000, 50_000_001])(
  'E03 uploads and reads selected cells from a %i-byte workbook without loading the original into the model',
  async (totalBytes) => {
    const { largeWorkbookFixture } = await import('./document-fixtures');
    const path = join(directory, 'large-workbook-' + totalBytes + '.xlsx');
    await largeWorkbookFixture(path, totalBytes);
    const hashStream = async (stream: Readable) => {
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const part of stream) {
        hash.update(part);
        bytes += part.length;
      }
      return { checksum: hash.digest('hex'), bytes };
    };
    try {
      const checksum = (await hashStream(createReadStream(path))).checksum;
      const conversation = (
        await post('B', '/conversations', {
          scope: 'ALL',
          clientKey: randomUUID(),
        }).expect(201)
      ).body.id;
      const uploads = app.get(UploadsService),
        actor = users.owner!.actor;
      const session = await uploads.initiate(actor, {
        projectId: projects.B!,
        aiConversationId: conversation,
        idempotencyKey: randomUUID(),
        originalFilename: 'Large range.xlsx',
        declaredSize: totalBytes,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        checksum,
      });
      for (let number = 1; number <= session.totalParts; number++) {
        const start = (number - 1) * session.partSize,
          end = Math.min(totalBytes, start + session.partSize) - 1;
        const part = await hashStream(createReadStream(path, { start, end }));
        await uploads.part(
          actor,
          session.id,
          number,
          part.checksum,
          createReadStream(path, { start, end }),
        );
      }
      const completed = await uploads.complete(actor, session.id, checksum),
        sourceId = completed.sourceId!;
      expect(
        (await uploads.complete(actor, session.id, checksum)).sourceId,
      ).toBe(sourceId);
      await post('B', '/index', { scope: 'ALL' }).expect(201);
      const index = await db.chatAiSourceIndex.findUniqueOrThrow({
        where: { id: sourceId },
      });
      expect(index).toMatchObject({
        status: 'READY',
        errorCode: null,
        processingMetadata: {
          scope: 'XLSX_SHEET_MANIFEST_ONLY',
          cellsRead: 0,
          modelRead: 'UNKNOWN',
          sheets: [
            { name: 'Rows', rows: 1002, columns: 1, populatedRows: 1002 },
            { name: 'Quote', rows: 10001, columns: 3, populatedRows: 3 },
          ],
        },
      });
      const transport = vi
        .spyOn(app.get(ChatGptConnectionService), 'respond')
        .mockImplementation(async (_actor, _revision, input) => {
          const items = (
            input as {
              input: { type?: string; call_id?: string; output?: string }[];
            }
          ).input;
          expect(JSON.stringify(items)).not.toContain('file_data');
          expect(JSON.stringify(items)).not.toContain('base64');
          const outputs = items.filter(
            (item) => item.type === 'function_call_output',
          );
          const expected = ['FIRST-0007392', 'MIDDLE-0007392', 'LAST-0007392'];
          if (outputs.length) {
            expect(outputs).toHaveLength(3);
            for (const [position, item] of outputs.entries())
              expect(item.output).toContain(expected[position]);
            const last = JSON.parse(outputs[2]!.output!);
            expect(last.cells).toContainEqual(
              expect.objectContaining({
                address: 'B10001',
                value: '25.00',
                formula: '12.50*2',
                recalculated: false,
              }),
            );
            expect(last.missingCount).toBe(1);
            expect(last.numericGroups).toEqual([
              { format: '#,##0.00', sum: '25', count: 1 },
            ]);
          }
          const calls = outputs.length
            ? []
            : ['A1:A1', 'A5001:A5001', 'A10001:C10001'].map((range, n) => ({
                type: 'function_call' as const,
                namespace: 'galaxy' as const,
                name: 'analyze_table' as const,
                call_id: 'range-' + n,
                arguments: JSON.stringify({ sourceId, sheet: 'Quote', range }),
              }));
          return {
            model: 'account-model',
            text: outputs.length
              ? 'Read only the first, middle and last selected ranges; cached total25, missing formula cache remains missing.'
              : '',
            calls,
            continuation: calls,
            usage: null,
            requestId: 'synthetic-large-workbook',
          };
        });
      try {
        const turn = (
          await post('B', `/conversations/${conversation}/answers`, {
            question: 'Read Quote!A1:A1, A5001:A5001 and A10001:C10001 only.',
            model: 'account-model',
            searchMode: 'PROJECT_ONLY',
            sourceIds: [sourceId],
            clientKey: randomUUID(),
          }).expect(201)
        ).body;
        const done = (
          await post('B', `/answers/${turn.id}/run`, {}).expect(201)
        ).body;
        expect({ status: done.status, errorCode: done.errorCode }).toEqual({
          status: 'COMPLETED',
          errorCode: null,
        });
        expect(done.sources).toHaveLength(3);
        const reloaded = (
          await get('B', `/conversations/${conversation}`).expect(200)
        ).body.answers.at(-1);
        expect(reloaded.attachments[0].sourceId).toBe(sourceId);
        expect(reloaded.answer).toBe(done.answer);
        expect(
          await hashStream(
            (
              await app
                .get(ProjectAiService)
                .downloadFile(actor, projects.B!, sourceId)
            ).data,
          ),
        ).toEqual({ checksum, bytes: totalBytes });
        await get(
          'A',
          `/answers/${done.id}/sources/${done.sources[0].handle}`,
        ).expect(404);
        await get(
          'B',
          `/answers/${done.id}/sources/${done.sources[0].handle}`,
          'staff',
        ).expect(404);
        await db.fileAsset.update({
          where: { id: index.fileAssetId! },
          data: { deletedAt: new Date() },
        });
        expect(
          (
            await get('B', `/conversations/${conversation}`).expect(200)
          ).body.answers.at(-1),
        ).toMatchObject({ status: 'ACCESS_REVOKED', answer: null });
      } finally {
        transport.mockRestore();
      }
    } finally {
      await rm(path, { force: true });
    }
  },
  60000,
);

it.each(
  (['workbook', 'pdf'] as const).flatMap((format) =>
    (['version', 'hidden', 'revoke', 'stop'] as const).map(
      (change) => [format, change] as const,
    ),
  ),
)(
  'E03 refuses a %s read after %s changes during local decoding',
  async (format, change) => {
    const native = await import('../src/project-chat/ai-native-source');
    const { xlsxFixture, longLinePdfFixture } = await import(
      './document-fixtures'
    );
    const bytes =
      format === 'workbook' ? await xlsxFixture() : await longLinePdfFixture();
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.owner!.cookie)
        .set('X-Chat-Actor', users.owner!.id)
        .field('clientKey', randomUUID())
        .attach('file', bytes, {
          filename: format === 'workbook' ? 'Guarded.xlsx' : 'Guarded.pdf',
          contentType:
            format === 'workbook' ? native.xlsxMime : 'application/pdf',
        })
        .expect(201)
    ).body.id;
    await post('B', '/index', { scope: 'ALL' }).expect(201);
    const source = await db.chatAiSourceIndex.findUniqueOrThrow({
      where: { id: sourceId },
    });
    const turn = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'Read the selected local file region only.',
        model: 'account-model',
        sourceIds: [sourceId],
        searchMode: 'PROJECT_ONLY',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const grant = await db.chatProjectGrant.findUniqueOrThrow({
      where: { id: grants.B! },
    });
    let changedAfterDecode = false;
    const changedDuringRead = async () => {
      if (change === 'version')
        await db.chatAiSourceIndex.update({
          where: { id: sourceId },
          data: { version: 'changed-during-read' },
        });
      if (change === 'hidden')
        await db.fileAsset.update({
          where: { id: source.fileAssetId! },
          data: { deletedAt: new Date() },
        });
      if (change === 'revoke')
        await db.chatProjectGrant.update({
          where: { id: grant.id },
          data: { revokedAt: new Date() },
        });
      if (change === 'stop')
        await app
          .get(ProjectAiService)
          .cancel(users.owner!.actor, projects.B!, turn.id);
      changedAfterDecode = true;
    };
    const readWorkbook = native.analyzeTableFile,
      readPdf = native.pdfFileText;
    const decoder =
      format === 'workbook'
        ? vi
            .spyOn(native, 'analyzeTableFile')
            .mockImplementation(async (...args) => {
              const result = await readWorkbook(...args);
              await changedDuringRead();
              return result;
            })
        : vi
            .spyOn(native, 'pdfFileText')
            .mockImplementation(async (...args) => {
              const result = await readPdf(...args);
              await changedDuringRead();
              return result;
            });
    let rounds = 0;
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async () => {
        rounds++;
        const calls = [
          {
            type: 'function_call' as const,
            namespace: 'galaxy' as const,
            name:
              format === 'workbook'
                ? ('analyze_table' as const)
                : ('read_project_source' as const),
            call_id: 'guarded-range',
            arguments: JSON.stringify(
              format === 'workbook'
                ? { sourceId, sheet: 'Đối chiếu', range: 'A2:B2' }
                : {
                    sourceId,
                    representation: 'text',
                    page: 1,
                    startLine: 1,
                    cursor: null,
                  },
            ),
          },
        ];
        return {
          model: 'account-model',
          text: '',
          calls,
          continuation: calls,
          usage: null,
          requestId: 'synthetic-guarded-range',
        };
      });
    try {
      const response = await post('B', `/answers/${turn.id}/run`, {});
      expect([201, 404]).toContain(response.status);
      const saved = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: turn.id },
      });
      expect(decoder).toHaveBeenCalledTimes(1);
      expect(changedAfterDecode).toBe(true);
      expect(saved.status).not.toBe('COMPLETED');
      expect(saved.answer).toBeNull();
      expect(rounds).toBe(1);
      expect(
        await db.chatAiAnswerDependency.count({ where: { answerId: turn.id } }),
      ).toBe(0);
      expect((saved.usage as Prisma.JsonObject).toolSources ?? []).toEqual([]);
      if (change === 'stop') expect(saved.status).toBe('CANCELLED');
    } finally {
      decoder.mockRestore();
      transport.mockRestore();
      await db.chatProjectGrant.update({
        where: { id: grant.id },
        data: { revokedAt: grant.revokedAt },
      });
    }
  },
);

it('E03 continues an actual long PDF line and retains complete text intervals after reload', async () => {
  const { longLinePdfFixture } = await import('./document-fixtures');
  const original = await longLinePdfFixture();
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const sourceId = (
    await request(app.getHttpServer())
      .post(base('B') + `/conversations/${conversation}/files`)
      .set('Cookie', users.owner!.cookie)
      .set('X-Chat-Actor', users.owner!.id)
      .field('clientKey', randomUUID())
      .attach('file', original, {
        filename: 'Long line.pdf',
        contentType: 'application/pdf',
      })
      .expect(201)
  ).body.id;
  await post('B', '/index', { scope: 'ALL' }).expect(201);
  const text: string[] = [];
  let offset = 0,
    round = 0;
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockImplementation(async (_actor, _revision, input) => {
      const items = (
        input as {
          input: { type?: string; call_id?: string; output?: string }[];
        }
      ).input;
      const latest = items
        .filter((item) => item.type === 'function_call_output')
        .at(-1);
      let cursor = null;
      if (latest) {
        const result = JSON.parse(latest.output!).results[0];
        const fragment = result.extractionCoverage.fragment;
        expect(fragment.from).toBe(offset);
        expect(fragment.to).toBeGreaterThan(offset);
        expect(result.chunks).toHaveLength(1);
        expect(
          Buffer.byteLength(JSON.stringify(result.chunks[0].text)),
        ).toBeLessThanOrEqual(16000);
        text.push(result.chunks[0].text);
        offset = fragment.to;
        cursor = result.extractionCoverage.nextCursor;
        if (!cursor) {
          expect(offset).toBe(fragment.total);
          expect(text.join('')).toContain('DISTINCTIVE-LAST-FACT');
          expect(text.length).toBeGreaterThan(2);
        }
      }
      const calls =
        latest && !cursor
          ? []
          : [
              {
                type: 'function_call' as const,
                namespace: 'galaxy' as const,
                name: 'read_project_source' as const,
                call_id: 'fragment-' + round++,
                arguments: JSON.stringify({
                  sourceId,
                  representation: 'text',
                  page: 1,
                  startLine: 1,
                  cursor,
                }),
              },
            ];
      return {
        model: 'account-model',
        text: calls.length
          ? ''
          : 'Read the full text layer of page1, including DISTINCTIVE-LAST-FACT; visual/model interpretation is not verified.',
        calls,
        continuation: calls,
        usage: null,
        requestId: 'synthetic-pdf-cursor',
      };
    });
  try {
    const turn = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'Read all text of page1, including its final fact.',
        model: 'account-model',
        sourceIds: [sourceId],
        searchMode: 'PROJECT_ONLY',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const done = (await post('B', `/answers/${turn.id}/run`, {}).expect(201))
      .body;
    expect({ status: done.status, errorCode: done.errorCode }).toEqual({
      status: 'COMPLETED',
      errorCode: null,
    });
    const reloaded = (
      await get('B', `/conversations/${conversation}`).expect(200)
    ).body.answers.at(-1);
    expect(reloaded.pdfCoverage).toEqual([
      expect.objectContaining({
        pagesTotal: 1,
        completeTextPages: [1],
        missingTextRanges: [],
        missingTextFragments: [],
        textCoverage: 'FULL',
        visualCoverage: 'UNKNOWN',
        modelRead: 'UNKNOWN',
      }),
    ]);
    expect(reloaded.attachments[0].sourceId).toBe(sourceId);
    await get(
      'A',
      `/answers/${turn.id}/sources/${done.sources[0].handle}`,
    ).expect(404);
  } finally {
    transport.mockRestore();
  }
}, 30000);

it.each([
  ['version', 'SOURCE_VERSION_CHANGED'],
  ['checksum', 'SOURCE_VERSION_CHANGED'],
  ['pageChecksum', 'SOURCE_VERSION_CHANGED'],
  ['page', 'TOOL_ARGUMENTS_INVALID'],
  ['offset', 'PDF_CURSOR_INVALID'],
] as const)(
  'E03 rejects a PDF continuation with an invalid %s without adding coverage',
  async (change, errorCode) => {
    const { longLinePdfFixture } = await import('./document-fixtures');
    const { toolInputs } = await import('../src/project-chat/ai-tools');
    const original = await longLinePdfFixture();
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.owner!.cookie)
        .set('X-Chat-Actor', users.owner!.id)
        .field('clientKey', randomUUID())
        .attach('file', original, {
          filename: 'Pinned continuation.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body.id;
    await post('B', '/index', { scope: 'ALL' }).expect(201);
    let round = 0;
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async (_actor, _revision, input) => {
        const latest = (
          input as {
            input: { type?: string; output?: string }[];
          }
        ).input
          .filter((item) => item.type === 'function_call_output')
          .at(-1);
        let cursor = null;
        if (round === 1) {
          cursor = toolInputs.read_project_source.shape.cursor.parse(
            JSON.parse(latest!.output!).results[0].extractionCoverage
              .nextCursor,
          );
          expect(cursor).not.toBeNull();
          if (change === 'version') cursor!.sourceVersion = 'stale-version';
          if (change === 'checksum') cursor!.checksum = '0'.repeat(64);
          if (change === 'pageChecksum') cursor!.pageChecksum = '0'.repeat(64);
          if (change === 'offset') cursor!.offset = 262144;
        }
        if (round === 2)
          expect(JSON.parse(latest!.output!)).toMatchObject({
            status: 'ERROR',
            errorCode,
          });
        const calls =
          round < 2
            ? [
                {
                  type: 'function_call' as const,
                  namespace: 'galaxy' as const,
                  name: 'read_project_source' as const,
                  call_id: 'pinned-fragment-' + round,
                  arguments: JSON.stringify({
                    sourceId,
                    representation: 'text',
                    page: round === 1 && change === 'page' ? 2 : 1,
                    startLine: 1,
                    cursor,
                  }),
                },
              ]
            : [];
        round++;
        return {
          model: 'account-model',
          text: calls.length
            ? ''
            : 'The continuation was rejected; text remains partial.',
          calls,
          continuation: calls,
          usage: null,
          requestId: 'synthetic-pinned-continuation-' + round,
        };
      });
    try {
      const turn = (
        await post('B', `/conversations/${conversation}/answers`, {
          question: 'Read the first fragment and validate its continuation.',
          model: 'account-model',
          sourceIds: [sourceId],
          searchMode: 'PROJECT_ONLY',
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      await post('B', `/answers/${turn.id}/run`, {}).expect(201);
      const saved = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: turn.id },
      });
      expect((saved.usage as Prisma.JsonObject).toolExecutions).toEqual([
        expect.objectContaining({ callId: 'pinned-fragment-0', status: 'OK' }),
        expect.objectContaining({
          callId: 'pinned-fragment-1',
          status: 'ERROR',
          errorCode,
        }),
      ]);
      expect((saved.usage as Prisma.JsonObject).toolSources).toHaveLength(1);
      const reloaded = (
        await get('B', `/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1);
      expect(reloaded.attachments[0].sourceId).toBe(sourceId);
      expect(reloaded.pdfCoverage[0]).toMatchObject({
        completeTextPages: [],
        textCoverage: 'PARTIAL',
        visualCoverage: 'UNKNOWN',
        modelRead: 'UNKNOWN',
      });
      expect(reloaded.pdfCoverage[0].missingTextFragments).not.toHaveLength(0);
      if (errorCode === 'SOURCE_VERSION_CHANGED') {
        expect(saved.status).toBe('FAILED');
        expect(round).toBe(2);
      } else {
        expect(saved.status).toBe('COMPLETED');
        expect(saved.errorCode).toBeNull();
        expect(round).toBe(3);
      }
      expect(
        await db.chatAiAnswerDependency.count({ where: { answerId: turn.id } }),
      ).toBe(1);
    } finally {
      transport.mockRestore();
    }
  },
  30000,
);

it.each(['INVALID_PAGE', 'SHEET_NOT_FOUND', 'TABLE_RANGE_LIMIT'] as const)(
  'E02 returns matched %s selection errors and continues with the same model and effort',
  async (errorCode) => {
    const previous = globalThis.fetch;
    const pdf = errorCode === 'INVALID_PAGE';
    const { createHash } = await import('node:crypto');
    const key =
      'siwc.capabilities.' +
      organizationId +
      '.' +
      createHash('sha256').update('account-model').digest('hex');
    const profile = {
      generation: 'p1-fixture-generation',
      model: 'account-model',
      reasoningModes: ['default'],
      effortEvidence: {},
      webSearch: false,
      imageInput: true,
      pdfInput: true,
      receipts: [],
      checkedAt: new Date().toISOString(),
    };
    await db.systemSetting.upsert({
      where: { key },
      create: { key, value: profile },
      update: { value: profile },
    });
    const { renderDocument } = await import('../src/project-chat/ai-document');
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    workbook.addWorksheet('Second').getCell('A1').value = '0007392';
    const bytes = pdf
      ? (
          await renderDocument(
            {
              format: 'pdf',
              title: 'Selection corpus',
              blocks: [{ kind: 'table', rows: [['0007392']] }],
            },
            [],
          )
        ).bytes
      : Buffer.from(await workbook.xlsx.writeBuffer());
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.owner!.cookie)
        .set('X-Chat-Actor', users.owner!.id)
        .field('clientKey', randomUUID())
        .attach('file', bytes, {
          filename: pdf ? 'Selection.pdf' : 'Selection.xlsx',
          contentType: pdf
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        .expect(201)
    ).body.id;
    await post('B', '/index', { scope: 'ALL' }).expect(201);
    let round = 0,
      providerError: unknown;
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      try {
        const body = JSON.parse(String(options.body));
        expect(body.model).toBe('account-model');
        expect(body.reasoning).toBeUndefined();
        const current = round++;
        if (current === 1) {
          const output = body.input.find(
            (item: { type?: string; call_id?: string }) =>
              item.type === 'function_call_output' &&
              item.call_id === 'bad-selection',
          );
          expect(JSON.parse(output.output)).toEqual({
            status: 'ERROR',
            errorCode,
          });
        }
        if (current === 2)
          expect(JSON.stringify(body.input)).toContain(
            pdf ? 'input_image' : '0007392',
          );
        const name = pdf ? 'read_project_source' : 'analyze_table';
        const argumentsFor = pdf
          ? {
              sourceId,
              representation: 'image',
              startLine: 1,
              page: current === 0 ? 9 : 1,
            }
          : {
              sourceId,
              sheet:
                errorCode === 'SHEET_NOT_FOUND' && current === 0
                  ? 'Missing'
                  : 'Second',
              range:
                errorCode === 'TABLE_RANGE_LIMIT' && current === 0
                  ? 'B2:A1'
                  : 'A1:A1',
            };
        const output =
          current < 2
            ? [
                {
                  type: 'function_call',
                  namespace: 'galaxy',
                  name,
                  call_id: current === 0 ? 'bad-selection' : 'valid-selection',
                  arguments: JSON.stringify(argumentsFor),
                },
              ]
            : [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'Corrected selection contains 0007392.',
                    },
                  ],
                },
              ];
        return new Response(
          'data: ' +
            JSON.stringify({
              type: 'response.completed',
              response: { status: 'completed', model: body.model, output },
            }) +
            '\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      } catch (error) {
        providerError = error;
        throw error;
      }
    });
    try {
      const queued = (
        await post('B', `/conversations/${conversation}/answers`, {
          question:
            'Read selected cells or page, correct unavailable selections',
          model: 'account-model',
          searchMode: 'PROJECT_ONLY',
          sourceIds: [sourceId],
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      const done = (
        await post('B', `/answers/${queued.id}/run`, {}).expect(201)
      ).body;
      if (providerError) throw providerError;
      expect(done).toMatchObject({ status: 'COMPLETED', errorCode: null });
      expect(round).toBe(3);
      expect(
        (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }))
          .usage,
      ).toMatchObject({
        toolExecutions: expect.arrayContaining([
          expect.objectContaining({
            callId: 'bad-selection',
            status: 'ERROR',
            errorCode,
          }),
          expect.objectContaining({ callId: 'valid-selection', status: 'OK' }),
        ]),
      });
    } finally {
      vi.stubGlobal('fetch', previous);
      await db.systemSetting.delete({ where: { key } });
    }
  },
  15000, // Real file decoding and three tool turns can exceed Vitest's 5s default.
);

it.each([
  'image',
  'image-multi',
  'image-discovered',
  'pdf-page',
  'pdf-original',
  'image-blocked',
  'image-revoked',
] as const)(
  'E02 sends verified bounded %s content and preserves current source authorization',
  async (kind) => {
    const previous = globalThis.fetch;
    const { createHash } = await import('node:crypto');
    const key =
      'siwc.capabilities.' +
      organizationId +
      '.' +
      createHash('sha256').update('account-model').digest('hex');
    const profile = {
      generation: 'p1-fixture-generation',
      model: 'account-model',
      reasoningModes: ['default'],
      effortEvidence: {},
      webSearch: false,
      imageInput: kind !== 'image-blocked',
      pdfInput: true,
      receipts: [],
      checkedAt: new Date().toISOString(),
    };
    await db.systemSetting.upsert({
      where: { key },
      create: { key, value: profile },
      update: { value: profile },
    });
    const { renderDocument } = await import('../src/project-chat/ai-document');
    const image = kind.startsWith('image');
    const bytes = image
      ? Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
          'base64',
        )
      : (
          await renderDocument(
            {
              format: 'pdf',
              title: 'Synthetic media corpus',
              blocks: [
                {
                  kind: 'paragraph',
                  text: 'Known private synthetic text 7392',
                },
              ],
            },
            [],
          )
        ).bytes;
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.owner!.cookie)
        .set('X-Chat-Actor', users.owner!.id)
        .field('clientKey', randomUUID())
        .attach('file', bytes, {
          filename: image ? 'Synthetic.png' : 'Synthetic.pdf',
          contentType: image ? 'image/png' : 'application/pdf',
        })
        .expect(201)
    ).body.id;
    const sourceIds = kind === 'image-discovered' ? [] : [sourceId];
    if (kind === 'image-multi')
      sourceIds.push(
        (
          await request(app.getHttpServer())
            .post(base('B') + `/conversations/${conversation}/files`)
            .set('Cookie', users.owner!.cookie)
            .set('X-Chat-Actor', users.owner!.id)
            .field('clientKey', randomUUID())
            .attach('file', Buffer.from('Synthetic price 125000.50 VND'), {
              filename: 'Synthetic-price.txt',
              contentType: 'text/plain',
            })
            .expect(201)
        ).body.id,
      );
    await post('B', '/index', { scope: 'ALL' }).expect(201);
    let historicalId: string | undefined;
    if (!image) {
      historicalId = (
        await post('B', `/conversations/${conversation}/answers`, {
          question: 'Historical text derivative',
          model: 'account-model',
          sourceIds: [sourceId],
          clientKey: randomUUID(),
        }).expect(201)
      ).body.id;
      expect(
        (await post('B', `/answers/${historicalId}/run`, {}).expect(201)).body
          .status,
      ).toBe('COMPLETED');
    }
    let round = 0,
      providerError: unknown;
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      try {
        const body = JSON.parse(String(options.body)),
          first = round++ === 0;
        if (!first) {
          if (kind === 'image-blocked') {
            const result = body.input.find(
              (item: { type?: string; call_id?: string }) =>
                item.type === 'function_call_output' &&
                item.call_id === 'native-source',
            );
            expect(JSON.parse(result.output)).toEqual({
              status: 'ERROR',
              errorCode: 'FILE_NOT_LIVE_VERIFIED',
            });
          } else {
            const message = body.input.find((item: { content?: unknown }) =>
              Array.isArray(item.content),
            );
            const part = message?.content.find(
              (item: { type: string }) =>
                item.type ===
                (kind === 'pdf-original' ? 'input_file' : 'input_image'),
            );
            expect(part).toBeDefined();
            const encoded =
              kind === 'pdf-original' ? part.file_data : part.image_url;
            if (kind !== 'pdf-page')
              expect(Buffer.from(encoded.split(',')[1], 'base64')).toEqual(
                bytes,
              );
            else expect(encoded).toMatch(/^data:image\/png;base64,/);
            expect(JSON.stringify(body.tools)).not.toContain('web_search');
            if (kind === 'image-revoked')
              await db.systemSetting.update({
                where: { key },
                data: { value: { ...profile, imageInput: false } },
              });
          }
        }
        const output = first
          ? [
              {
                type: 'function_call',
                namespace: 'galaxy',
                name: 'read_project_source',
                call_id: 'native-source',
                arguments: JSON.stringify({
                  sourceId,
                  representation:
                    kind === 'pdf-original' ? 'original' : 'image',
                  startLine: 1,
                  page: kind === 'pdf-page' ? 1 : null,
                }),
              },
            ]
          : [
              {
                type: 'message',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text:
                      kind === 'image-blocked'
                        ? 'Vision unavailable; no image content was sent.'
                        : 'Synthetic verified media was supplied; known content 7392.',
                  },
                ],
              },
            ];
        return new Response(
          'data: ' +
            JSON.stringify({
              type: 'response.completed',
              response: { status: 'completed', model: body.model, output },
            }) +
            '\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      } catch (error) {
        providerError = error;
        throw error;
      }
    });
    try {
      const queued = (
        await post('B', `/conversations/${conversation}/answers`, {
          question: 'Read the supplied known content',
          model: 'account-model',
          searchMode: 'PROJECT_ONLY',
          sourceIds,
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      const done = (
        await post('B', `/answers/${queued.id}/run`, {}).expect(201)
      ).body;
      if (providerError) throw providerError;
      if (kind === 'image-revoked') {
        expect(done).toMatchObject({
          status: 'FAILED',
          errorCode: 'FILE_NOT_LIVE_VERIFIED',
          answer: null,
        });
        return;
      }
      expect(done.status).toBe('COMPLETED');
      expect(round).toBe(2);
      if (kind === 'image-blocked') {
        expect(
          (
            await db.chatAiAnswer.findUniqueOrThrow({
              where: { id: queued.id },
            })
          ).usage,
        ).toMatchObject({
          toolExecutions: expect.arrayContaining([
            expect.objectContaining({
              callId: 'native-source',
              status: 'ERROR',
              errorCode: 'FILE_NOT_LIVE_VERIFIED',
            }),
          ]),
        });
        return;
      }
      if (historicalId)
        expect(
          (
            await get('B', `/conversations/${conversation}`).expect(200)
          ).body.answers.find(
            (answer: { id: string }) => answer.id === historicalId,
          ).status,
        ).toBe('COMPLETED');
      const citation = (
        await get(
          'B',
          `/answers/${done.id}/sources/${done.sources[0].handle}`,
        ).expect(200)
      ).body;
      expect(citation.downloadUrl).toContain('/download');
      if (kind === 'pdf-page') expect(citation.page).toBe(1);
      const index = await db.chatAiSourceIndex.findUniqueOrThrow({
        where: { id: sourceId },
      });
      await db.fileAsset.update({
        where: { id: index.fileAssetId! },
        data: { deletedAt: new Date() },
      });
      expect(
        (
          await get('B', `/conversations/${conversation}`).expect(200)
        ).body.answers.at(-1),
      ).toMatchObject({ status: 'ACCESS_REVOKED', answer: null });
      await get(
        'A',
        `/answers/${done.id}/sources/${done.sources[0].handle}`,
      ).expect(404);
    } finally {
      vi.stubGlobal('fetch', previous);
      await db.systemSetting.delete({ where: { key } });
    }
  },
  30_000,
);

it('E01 Auto selects capable SIWC and preserves the original request and immutable route on replay', async () => {
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const input = {
    question: '  Auto exact question 😀\n',
    model: 'account-model',
    reasoning: 'default',
    clientKey: randomUUID(),
  };
  const path = `/conversations/${conversation}/auto-answers`;
  const queued = (await post('B', path, input).expect(201)).body;
  expect(queued).toMatchObject({ route: 'SIWC', status: 'QUEUED' });
  expect((await post('B', path, input).expect(201)).body).toMatchObject({
    id: queued.id,
    route: 'SIWC',
  });
  await post('B', path, { ...input, question: 'changed' }).expect(409);
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }))
      .question,
  ).toBe(input.question);
  await post('B', `/answers/${queued.id}/cancel`, {}).expect(201);
});

it('retains dormant E01 Workspace result security and history contracts using synthetic provider fixtures', async () => {
  const previous = globalThis.fetch;
  vi.stubEnv('FEATURE_WORKSPACE_AGENTS', 'true');
  const root = join(directory, 'workspace');
  mkdirSync(root, { mode: 0o700 });
  chmodSync(root, 0o700);
  // Each synthetic runtime has its own key, even after an interrupted fixture run.
  writeFileSync(join(root, 'key.bin'), randomBytes(32), { mode: 0o600 });
  vi.stubEnv('GALAXY_WORKSPACE_RUNTIME_DIR', root);
  vi.stubEnv('GALAXY_WORKSPACE_OAUTH_CLIENT_ID', 'e01-synthetic-client');
  vi.stubEnv(
    'GALAXY_WORKSPACE_OAUTH_REDIRECT_URI',
    'https://chatgpt.com/connector/oauth/e01-synthetic',
  );
  const owner = users.owner!.actor,
    workspace = app.get(WorkspaceAgentService),
    jobs = app.get(ProjectAiWorkspaceService),
    auth = app.get(WorkspaceConnectorAuth);
  // Exercise retained protocol helpers only; E02 public admission is tested without these spies.
  const jobsAdmission = vi
    .spyOn(jobs as unknown as { enabled(): void }, 'enabled')
    .mockImplementation(() => {});
  const authAdmission = vi
    .spyOn(auth as unknown as { enabled(): void }, 'enabled')
    .mockImplementation(() => {});
  try {
    const principalId = randomUUID();
    const configured = await workspace.configure(owner, {
      expectedVersion: null,
      workspaceId: 'synthetic-workspace',
      accessToken: 'synthetic-workspace-access-token',
      bindings: [
        {
          id: principalId,
          projectId: projects.A,
          requestedModel: 'account-model',
          configuredModel: 'account-model',
          effort: 'default',
          maxRunsPerDay: 20,
          agentId: 'agt_synthetic',
          channelId: 'agtch_synthetic',
        },
      ],
    });
    const conversation = (
      await post('A', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const question =
      '  Original 😀 question\nKeep the table and code.\t ' +
      'Long constraint 😀 '.repeat(6000);
    const input = { clientKey: randomUUID(), question, model: 'account-model' };
    await expect(
      jobs.prepare(owner, projects.A!, conversation, input),
    ).rejects.toThrow('MODEL_BINDING_UNVERIFIED');
    expect(
      await db.chatAiAnswer.count({ where: { conversationId: conversation } }),
    ).toBe(0);
    mkdirSync(join(root, 'bindings'), { mode: 0o700 });
    // Synthetic trusted inspection fixture only; this is not provider/live model evidence.
    const publishedConfiguration = {
      agentId: 'agt_synthetic',
      channelId: 'agtch_synthetic',
      configuredModel: 'account-model',
      effort: 'default',
      state: 'PUBLISHED',
      visibility: 'PRIVATE',
      version: 'synthetic-1',
    };
    const packet = JSON.stringify({
      publishedConfiguration,
      officialModelIdentity: {
        modelId: 'account-model',
        url: 'https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference',
        contentSha256: 'c'.repeat(64),
      },
    });
    writeFileSync(
      join(root, 'bindings', principalId + '.evidence.json'),
      packet,
      { mode: 0o600 },
    );
    writeFileSync(
      join(root, 'bindings', principalId + '.json'),
      JSON.stringify({
        formatVersion: 1,
        source: 'OFFICIAL_PUBLISHED_CONFIGURATION_INSPECTION',
        credentialRevision: configured.revision,
        bindingId: principalId,
        agentId: 'agt_synthetic',
        channelId: 'agtch_synthetic',
        configuredModel: 'account-model',
        effort: 'default',
        publishedDigest: digest(JSON.stringify(publishedConfiguration)),
        officialModelEvidence:
          'https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference',
        evidenceDigest: digest(packet),
        entitlementVerified: true,
        privatePilotVerified: true,
        scopedConnectorVerified: true,
        textDestinationVerified: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      { mode: 0o600 },
    );
    await expect(
      jobs.prepare(owner, projects.A!, conversation, input),
    ).rejects.toThrow('WORKSPACE_CONNECTOR_CONSENT_REQUIRED');
    const verifier = 'v'.repeat(43),
      challenge = Buffer.from(
        await import('node:crypto').then((m) =>
          m.createHash('sha256').update(verifier).digest(),
        ),
      ).toString('base64url');
    const resource = auth.resource(organizationId, principalId);
    const url = await auth.authorize({
      client_id: 'e01-synthetic-client',
      redirect_uri: 'https://chatgpt.com/connector/oauth/e01-synthetic',
      resource,
      response_type: 'code',
      scope: 'galaxy.workspace.job',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'synthetic-client-state',
    });
    const requestId = new URL(url).searchParams.get('request')!;
    await expect(auth.preview(users.staff!.actor, requestId)).rejects.toThrow();
    const consent = await auth.consent(owner, requestId),
      code = new URL(consent.redirect).searchParams.get('code')!;
    const exchange = {
      grant_type: 'authorization_code',
      code,
      client_id: 'e01-synthetic-client',
      redirect_uri: 'https://chatgpt.com/connector/oauth/e01-synthetic',
      resource,
      code_verifier: verifier,
    };
    await expect(
      auth.exchange({ ...exchange, code_verifier: 'x'.repeat(43) }),
    ).rejects.toThrow('invalid_grant');
    const token = await auth.exchange(exchange);
    await expect(auth.exchange(exchange)).rejects.toThrow('invalid_grant');
    const principal = await auth.authenticate(
      'Bearer ' + token.access_token,
      organizationId,
      principalId,
    );
    await expect(
      auth.authenticate(
        'Bearer ' + token.access_token,
        organizationId,
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect((await get('A', '/workspace-models').expect(200)).body).toEqual([]);
    await get('A', '/workspace-models', 'staff').expect(404);
    expect(
      (await get('B', '/workspace-models', 'staff').expect(200)).body,
    ).toEqual([]);
    // Reuse existing source/ACL domain, including a real message revision and derivative index.
    await db.chatProjectGrant.update({
      where: { id: grants.A! },
      data: { actions: ['INVOKE', 'ACCESS_ADMIN'], roomCeiling: ['READ'] },
    });
    const room = await db.chatRoom.create({
      data: {
        organizationId,
        projectId: projects.A!,
        title: 'E01 synthetic source',
        group: 'CONSULTING',
        audience: 'INTERNAL',
        createdBy: owner.userId,
      },
    });
    const roomGrant = await db.chatRoomGrant.create({
      data: {
        organizationId,
        projectId: projects.A!,
        roomId: room.id,
        userId: owner.userId,
        issuedUnderId: grants.A!,
        actions: ['READ'],
        grantedBy: owner.userId,
        effectiveAt: new Date(Date.now() - 1000),
      },
    });
    const message = await db.chatMessage.create({
      data: {
        organizationId,
        projectId: projects.A!,
        roomId: room.id,
        authorId: owner.userId,
        clientKey: randomUUID(),
        payloadHash: digest('source-revision'),
        sequence: 1,
        body: 'Authorized source: synthetic value 42.',
      },
    });
    const handle = 'S_' + digest(message.id).slice(0, 24);
    const index = await db.chatAiSourceIndex.create({
      data: {
        organizationId,
        projectId: projects.A!,
        roomId: room.id,
        messageId: message.id,
        version: message.payloadHash,
        status: 'READY',
        text: message.body,
        chunks: [{ handle, text: message.body, startLine: 1, endLine: 1 }],
        checksum: digest(message.body),
        label: 'Synthetic versioned source',
        provenance: 'SOURCED',
      },
    });
    const siwcConversation = (
      await post('A', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const siwc = await post('A', `/conversations/${siwcConversation}/answers`, {
      clientKey: randomUUID(),
      question: 'Read the selected versioned source and cite it.',
      model: 'account-model',
      sourceIds: [index.id],
    }).expect(201);
    let siwcRound = 0;
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      expect(body.model).toBe('account-model');
      const output =
        siwcRound++ === 0
          ? [
              {
                type: 'function_call',
                namespace: 'galaxy',
                name: 'read_project_source',
                call_id: 'source-call',
                arguments: JSON.stringify({
                  sourceId: index.id,
                  representation: 'text',
                  startLine: 1,
                  page: null,
                }),
              },
            ]
          : [
              {
                type: 'message',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'The source value is 42 [' + handle + '].',
                  },
                ],
              },
            ];
      return new Response(
        'event: response.completed\ndata: ' +
          JSON.stringify({
            type: 'response.completed',
            response: { status: 'completed', model: body.model, output },
          }) +
          '\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    });
    const siwcDone = await post('A', `/answers/${siwc.body.id}/run`, {}).expect(
      201,
    );
    expect(siwcDone.body).toMatchObject({
      status: 'COMPLETED',
      answer: 'The source value is 42 [' + handle + '].',
    });
    expect(siwcRound).toBe(2);
    await get('A', '/answers/' + siwc.body.id + '/sources/' + handle).expect(
      200,
    );
    const payload = { ...input, sourceIds: [index.id] };
    const prepared = (
      await post(
        'A',
        '/conversations/' + conversation + '/workspace-answers',
        payload,
      ).expect(201)
    ).body;
    expect(prepared.route).toBe('WORKSPACE');
    expect(
      (
        await post(
          'A',
          '/conversations/' + conversation + '/workspace-answers',
          payload,
        ).expect(201)
      ).body,
    ).toMatchObject({ id: prepared.id, route: 'WORKSPACE' });

    expect(
      await jobs.prepare(owner, projects.A!, conversation, payload),
    ).toMatchObject({ id: prepared.id, jobId: prepared.jobId });
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: prepared.id } }))
        .question,
    ).toBe(question);
    await expect(
      jobs.prepare(owner, projects.A!, conversation, {
        ...payload,
        mode: 'PROJECT',
      }),
    ).rejects.toThrow('WORKSPACE_IDEMPOTENCY_CONFLICT');
    await jobs.part(principal, prepared.jobId, {
      sequence: 0,
      content: 'premature',
    });
    await expect(
      jobs.finalize(principal, prepared.jobId, {
        contractVersion: 1,
        partCount: 1,
        characterCount: 9,
        sourceRefs: [],
        warnings: [],
        artifactRefs: [],
        memoryProposals: [],
      }),
    ).rejects.toThrow('WORKSPACE_JOB_NOT_DISPATCHED');
    await db.chatAiWorkspaceResultChunk.deleteMany({
      where: { jobId: prepared.jobId },
    });

    await expect(
      jobs.prepare(owner, projects.A!, conversation, {
        ...payload,
        clientKey: randomUUID(),
      }),
    ).rejects.toThrow('WORKSPACE_PILOT_BUSY');
    let contextText = '',
      offset = 0;
    do {
      const page = await jobs.context(principal, prepared.jobId, offset);
      contextText += page.data;
      offset = page.nextOffset ?? -1;
    } while (offset >= 0);
    expect(JSON.parse(contextText).questionOriginal).toBe(question);
    const sourceRef = { sourceId: index.id, version: index.version, handle };
    expect((await jobs.source(principal, prepared.jobId, sourceRef)).data).toBe(
      message.body,
    );
    await expect(
      jobs.source(principal, prepared.jobId, {
        ...sourceRef,
        version: 'wrong',
      }),
    ).rejects.toThrow();
    await expect(
      jobs.context({ ...principal, principalId: randomUUID() }, prepared.jobId),
    ).rejects.toThrow();
    await expect(
      jobs.prepare(owner, projects.B!, conversation, {
        ...input,
        clientKey: randomUUID(),
      }),
    ).rejects.toThrow();
    const existingJob = await db.chatAiWorkspaceJob.findUniqueOrThrow({
      where: { id: prepared.jobId },
    });
    await expect(
      db.chatAiWorkspaceJob.create({
        data: {
          ...existingJob,
          id: randomUUID(),
          ownerId: users.staff!.id,
          actorSnapshot: existingJob.actorSnapshot as Prisma.InputJsonObject,
          bindingSnapshot:
            existingJob.bindingSnapshot as Prisma.InputJsonObject,
          contextSnapshot:
            existingJob.contextSnapshot as Prisma.InputJsonObject,
        },
      }),
    ).rejects.toThrow();
    const calls: unknown[] = [];
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      calls.push({ url, body: options.body });
      return url.endsWith('/trigger')
        ? new Response(
            JSON.stringify({
              conversation_url:
                'https://chatgpt.com/workspace/conversation/synthetic',
              agent_trigger_run_id: 'apirun_synthetic',
            }),
            { status: 202 },
          )
        : new Response(JSON.stringify({ status: 'completed' }), {
            status: 200,
          });
    });
    await jobs.tick();
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: prepared.id } }))
        .status,
    ).toBe('RUNNING');
    expect(
      await db.chatAiWorkspaceJob.findUniqueOrThrow({
        where: { id: prepared.jobId },
      }),
    ).toMatchObject({
      state: 'WAITING_RESULT',
      providerRunId: 'apirun_synthetic',
    });
    expect(JSON.stringify(calls)).toContain('Original 😀 question');
    expect(JSON.stringify(calls)).not.toContain('"model":');
    await db.chatAiWorkspaceJob.update({
      where: { id: prepared.jobId },
      data: { nextAttemptAt: new Date(0) },
    });
    await jobs.tick();
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: prepared.id } }))
        .status,
    ).toBe('RUNNING');
    const markdown =
      '| Key | Value |\n|---|---|\n| citation | [' +
      handle +
      '] |\n```ts\nconst value = 42;\n```\n' +
      'Full answer 😀\n'.repeat(3000);
    const parts = Array.from(
      { length: Math.ceil(markdown.length / 12000) },
      (_, i) => markdown.slice(i * 12000, (i + 1) * 12000),
    );
    const mcp =
      '/api/v1/workspace-agent-mcp/' + organizationId + '/' + principalId;
    const invoke = (name: string, args: object) =>
      request(app.getHttpServer())
        .post(mcp)
        .set('Authorization', 'Bearer ' + token.access_token)
        .set('Accept', 'application/json, text/event-stream')
        .set('MCP-Protocol-Version', '2025-11-25')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        });
    await request(app.getHttpServer())
      .post(mcp)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(401);
    for (let sequence = 0; sequence < parts.length; sequence++)
      expect(
        (
          await invoke('submit_job_result', {
            jobId: prepared.jobId,
            action: 'part',
            payload: { sequence, content: parts[sequence] },
          }).expect(200)
        ).body.result.isError,
      ).not.toBe(true);
    await jobs.part(principal, prepared.jobId, {
      sequence: 0,
      content: parts[0],
    });
    await expect(
      jobs.part(principal, prepared.jobId, {
        sequence: 0,
        content: 'different',
      }),
    ).rejects.toThrow('WORKSPACE_PART_REPLAY_CONFLICT');
    const finalize = {
      contractVersion: 1,
      partCount: parts.length,
      characterCount: markdown.length,
      sourceRefs: [sourceRef],
      warnings: ['Full synthetic warning'],
      artifactRefs: [],
      memoryProposals: [],
    };
    await expect(
      jobs.finalize(principal, prepared.jobId, {
        ...finalize,
        partCount: parts.length + 1,
      }),
    ).rejects.toThrow('WORKSPACE_RESULT_INCOMPLETE');
    await expect(
      jobs.finalize(principal, prepared.jobId, {
        ...finalize,
        sourceRefs: [{ ...sourceRef, handle: 'forged' }],
      }),
    ).rejects.toThrow('WORKSPACE_CITATION_DENIED');
    // Force failure inside the existing real PostgreSQL transaction after the result writes.
    const ai = app.get(ProjectAiService),
      transaction = ai.workspaceTransaction.bind(ai);
    const rollback = vi
      .spyOn(ai, 'workspaceTransaction')
      .mockImplementation((actor, projectId, fn) =>
        transaction(actor, projectId, async (tx, grantId) => {
          await fn(tx, grantId);
          throw new Error('synthetic rollback');
        }),
      );
    await expect(
      jobs.finalize(principal, prepared.jobId, finalize),
    ).rejects.toThrow('synthetic rollback');
    rollback.mockRestore();
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: prepared.id } }))
        .answer,
    ).toBeNull();
    const result = await invoke('submit_job_result', {
      jobId: prepared.jobId,
      action: 'finalize',
      payload: finalize,
    }).expect(200);
    expect(result.body.result.isError).not.toBe(true);
    await jobs.finalize(principal, prepared.jobId, finalize);
    await expect(
      jobs.finalize(principal, prepared.jobId, {
        ...finalize,
        warnings: ['different'],
      }),
    ).rejects.toThrow('WORKSPACE_RESULT_REPLAY_CONFLICT');
    const reloaded = await get('A', '/conversations/' + conversation).expect(
      200,
    );
    expect(
      reloaded.body.answers.find((a: { id: string }) => a.id === prepared.id),
    ).toMatchObject({
      status: 'COMPLETED',
      answer: markdown,
      question,
      route: 'WORKSPACE',
    });
    await get('A', '/answers/' + prepared.id + '/sources/' + handle).expect(
      200,
    );
    expect(
      await db.chatAiAnswer.count({
        where: { conversationId: conversation, clientKey: input.clientKey },
      }),
    ).toBe(1);
    await db.chatRoomGrant.update({
      where: { id: roomGrant.id },
      data: { revokedAt: new Date() },
    });
    await expect(jobs.context(principal, prepared.jobId)).rejects.toThrow();
    const revoked = await get('A', '/conversations/' + conversation).expect(
      200,
    );
    expect(
      revoked.body.answers.find((a: { id: string }) => a.id === prepared.id)
        .answer,
    ).toBeNull();
    await db.chatRoomGrant.update({
      where: { id: roomGrant.id },
      data: { revokedAt: null },
    });

    const early = await jobs.prepare(owner, projects.A!, conversation, {
      ...input,
      question: 'Synthetic early callback',
      clientKey: randomUUID(),
    });
    vi.stubGlobal('fetch', async () => {
      await jobs.part(principal, early.jobId, {
        sequence: 0,
        content: 'Complete early callback',
      });
      await jobs.finalize(principal, early.jobId, {
        contractVersion: 1,
        partCount: 1,
        characterCount: 23,
        sourceRefs: [],
        warnings: [],
        artifactRefs: [],
        memoryProposals: [],
      });
      return new Response(
        JSON.stringify({
          conversation_url: 'https://chatgpt.com/c/synthetic',
          agent_trigger_run_id: 'apirun_early',
        }),
        { status: 202 },
      );
    });
    await jobs.tick();
    expect(
      (
        await db.chatAiWorkspaceJob.findUniqueOrThrow({
          where: { id: early.jobId },
        })
      ).state,
    ).toBe('COMPLETED');
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: early.id } }))
        .answer,
    ).toBe('Complete early callback');
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      calls.push({ url, body: options.body });
      return new Response(
        JSON.stringify({
          conversation_url: 'https://chatgpt.com/c/synthetic',
          agent_trigger_run_id: 'apirun_synthetic',
        }),
        { status: 202 },
      );
    });

    const uncertain = await jobs.prepare(owner, projects.A!, conversation, {
      ...input,
      question: 'Synthetic network uncertainty',
      clientKey: randomUUID(),
    });
    let dispatches = 0;
    vi.stubGlobal('fetch', async () => {
      dispatches++;
      throw new Error('synthetic transport timeout');
    });
    for (let i = 0; i < 4; i++) {
      await db.chatAiWorkspaceJob.update({
        where: { id: uncertain.jobId },
        data: { nextAttemptAt: new Date(0) },
      });
      await jobs.tick();
    }
    expect(dispatches).toBe(3);
    expect(
      (
        await db.chatAiWorkspaceJob.findUniqueOrThrow({
          where: { id: uncertain.jobId },
        })
      ).state,
    ).toBe('DELIVERY_UNCERTAIN');
    await jobs.cancel(owner, projects.A!, uncertain.id);
    const cancelled = await jobs.prepare(owner, projects.A!, conversation, {
      ...input,
      question: 'A new synthetic short question',
      clientKey: randomUUID(),
    });
    const previousRemoteKey = (
      await db.chatAiWorkspaceJob.findUniqueOrThrow({
        where: { id: uncertain.jobId },
      })
    ).conversationKey;
    expect(
      (
        await db.chatAiWorkspaceJob.findUniqueOrThrow({
          where: { id: cancelled.jobId },
        })
      ).conversationKey,
    ).not.toBe(previousRemoteKey);
    await jobs.part(principal, cancelled.jobId, {
      sequence: 0,
      content: 'late',
    });
    await jobs.cancel(owner, projects.A!, cancelled.id);
    await expect(
      jobs.finalize(principal, cancelled.jobId, {
        ...finalize,
        partCount: 1,
        characterCount: 4,
        sourceRefs: [],
      }),
    ).rejects.toThrow('WORKSPACE_JOB_CLOSED');
    const expired = await jobs.prepare(owner, projects.A!, conversation, {
      ...input,
      question: 'A new synthetic short question',
      clientKey: randomUUID(),
    });
    await db.chatAiWorkspaceJob.update({
      where: { id: expired.jobId },
      data: { expiresAt: new Date(0) },
    });
    await expect(jobs.context(principal, expired.jobId)).rejects.toThrow(
      'WORKSPACE_JOB_CLOSED',
    );
    await jobs.tick();
    expect(
      (
        await db.chatAiWorkspaceJob.findUniqueOrThrow({
          where: { id: expired.jobId },
        })
      ).state,
    ).toBe('TIMED_OUT');

    const invalidSession = await jobs.prepare(
      owner,
      projects.A!,
      conversation,
      {
        ...input,
        question: 'Synthetic session revocation',
        clientKey: randomUUID(),
      },
    );
    await db.session.update({
      where: { id: owner.sessionId! },
      data: { revokedAt: new Date() },
    });
    await jobs.tick();
    expect(
      (
        await db.chatAiWorkspaceJob.findUniqueOrThrow({
          where: { id: invalidSession.jobId },
        })
      ).state,
    ).toBe('ACCESS_REVOKED');
    expect(
      (
        await db.chatAiAnswer.findUniqueOrThrow({
          where: { id: invalidSession.id },
        })
      ).status,
    ).toBe('FAILED');
    await db.session.update({
      where: { id: owner.sessionId! },
      data: { revokedAt: null },
    });

    const noConsent = await jobs.prepare(owner, projects.A!, conversation, {
      ...input,
      question: 'A new synthetic short question',
      clientKey: randomUUID(),
    });
    await auth.revoke(owner, principalId);
    calls.length = 0;
    await jobs.tick();
    expect(calls).toHaveLength(0);
    expect(
      (
        await db.chatAiWorkspaceJob.findUniqueOrThrow({
          where: { id: noConsent.jobId },
        })
      ).state,
    ).toBe('ACCESS_REVOKED');
    await expect(jobs.context(principal, noConsent.jobId)).rejects.toThrow();
    await db.workspaceConnectorGrant.updateMany({
      where: { principalId, kind: 'ACCESS' },
      data: { revokedAt: null },
    });
    const rotated = await jobs.prepare(owner, projects.A!, conversation, {
      ...input,
      question: 'A new synthetic short question',
      clientKey: randomUUID(),
    });
    await workspace.configure(owner, {
      expectedVersion: configured.revision,
      workspaceId: 'synthetic-workspace',
      bindings: [
        {
          id: principalId,
          projectId: projects.A,
          requestedModel: 'account-model',
          configuredModel: 'account-model',
          effort: 'default',
          maxRunsPerDay: 20,
          agentId: 'agt_synthetic',
          channelId: 'agtch_synthetic',
        },
      ],
    });
    await expect(
      auth.authenticate(
        'Bearer ' + token.access_token,
        organizationId,
        principalId,
      ),
    ).rejects.toThrow();
    await expect(jobs.context(principal, rotated.jobId)).rejects.toThrow();
  } finally {
    jobsAdmission.mockRestore();
    authAdmission.mockRestore();
    vi.stubGlobal('fetch', previous);
    vi.stubEnv('FEATURE_WORKSPACE_AGENTS', 'false');
  }
}, 60000);

it('E02 defers Workspace endpoints with the old flag enabled while SIWC remains available', async () => {
  vi.stubEnv('FEATURE_WORKSPACE_AGENTS', 'true');
  try {
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const blocked = await post(
      'B',
      `/conversations/${conversation}/workspace-answers`,
      {
        question: 'Synthetic',
        model: 'account-model',
        clientKey: randomUUID(),
      },
    ).expect(409);
    expect(blocked.body.message).toBe('WORKSPACE_DEFERRED_BY_USER');
    expect((await get('B', '/workspace-models').expect(200)).body).toEqual([]);
    await expect(app.get(ProjectAiWorkspaceService).tick()).rejects.toThrow(
      'WORKSPACE_DEFERRED_BY_USER',
    );
    expect(() => app.get(WorkspaceConnectorAuth).metadata()).toThrow(
      'WORKSPACE_DEFERRED_BY_USER',
    );
    const queued = (
      await post('B', `/conversations/${conversation}/auto-answers`, {
        question: 'Synthetic SIWC',
        model: 'account-model',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    expect(queued.route).toBe('SIWC');
    expect(
      await db.chatAiWorkspaceJob.count({ where: { answerId: queued.id } }),
    ).toBe(0);
    await post('B', `/answers/${queued.id}/cancel`, {}).expect(201);
  } finally {
    vi.stubEnv('FEATURE_WORKSPACE_AGENTS', 'false');
  }
});

it.each([
  {
    representation: 'text',
    startLine: 2,
    errorCode: 'SOURCE_TEXT_UNAVAILABLE',
    sequential: false,
  },
  {
    representation: 'image',
    startLine: 1,
    errorCode: 'FILE_NOT_LIVE_VERIFIED',
    sequential: false,
  },
  {
    representation: 'text',
    startLine: 0,
    errorCode: 'TOOL_ARGUMENTS_INVALID',
    sequential: false,
  },
  {
    representation: 'text',
    startLine: 2,
    errorCode: 'SOURCE_TEXT_UNAVAILABLE',
    sequential: true,
  },
])(
  'E02 returns a matched $errorCode tool error, then produces XLSX and PDF drafts with exact calculation and durable downloads without Workspace',
  async ({ representation, startLine, errorCode, sequential }) => {
    const previous = globalThis.fetch;
    vi.stubEnv('FEATURE_WORKSPACE_AGENTS', 'true');
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const { activationFixture } = await import(
      '../src/project-chat/ai-activation'
    );
    const image = activationFixture('image').media[0]!.bytes;
    const priceText =
      'SYNTHETIC E02 ONLY\nMã: 0007392\nSố lượng: 2\nĐơn giá VND: 125000.50\nThuế: 10%';
    const upload = async (
      bytes: Buffer,
      filename: string,
      contentType: string,
    ) =>
      (
        await request(app.getHttpServer())
          .post(base('B') + `/conversations/${conversation}/files`)
          .set('Cookie', users.owner!.cookie)
          .set('X-Chat-Actor', users.owner!.id)
          .field('clientKey', randomUUID())
          .attach('file', bytes, { filename, contentType })
          .expect(201)
      ).body.id as string;
    const priceId = await upload(
      Buffer.from(priceText),
      'E02-synthetic-prices.txt',
      'text/plain',
    );
    const imageId = await upload(
      image,
      'E02-authorized-synthetic.png',
      'image/png',
    );
    await post('B', '/index', { scope: 'ALL' }).expect(201);
    const source = await db.chatAiSourceIndex.findFirstOrThrow({
      where: { id: priceId, projectId: projects.B! },
    });

    const imageSource = await db.chatAiSourceIndex.findFirstOrThrow({
      where: { id: imageId, projectId: projects.B! },
    });
    const question =
      '  Từ bảng giá và ảnh tổng hợp được phép, lập báo giá nháp, xuất Excel và PDF, trả cả hai file trong chat. 😀\n';
    const blocks = [
      { kind: 'paragraph', text: 'BẢN NHÁP · Dữ liệu tổng hợp E02' },
      {
        kind: 'table',
        rows: [
          ['Mã', 'Số lượng', 'Đơn giá VND', 'Thuế', 'Tổng VND'],
          ['0007392', '2', '125000.50', '10%', '275001.10'],
        ],
      },
      {
        kind: 'image',
        sourceId: imageSource.id,
        caption: 'Ảnh tổng hợp được phép',
      },
    ];
    let round = 0;
    let providerProbeError: unknown;
    vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
      try {
        expect(String(url)).toBe('https://api.openai.com/v1/responses');
        const body = JSON.parse(String(options.body));
        expect(body.model).toBe('account-model');
        expect(body.input).toContainEqual({ role: 'user', content: question });
        expect(JSON.stringify(body.tools)).toContain('create_document');
        const call = (call_id: string, name: string, args: object) => ({
          type: 'function_call',
          namespace: 'galaxy',
          call_id,
          name,
          arguments: JSON.stringify(args),
        });
        let output;
        if (sequential && round < 8) {
          const prior = (id: string) =>
            JSON.parse(
              toolResults(body.input).find((i) => i.call_id === id)!.output,
            ).value;
          output = [
            [
              call('e02-image-text', 'read_project_source', {
                sourceId: imageSource.id,
                representation,
                startLine,
                page: null,
              }),
            ],
            [
              call('e02-find-image', 'search_project_sources', {
                query: 'E02-authorized-synthetic',
                limit: 1,
              }),
            ],
            [
              call('e02-read-price', 'read_project_source', {
                sourceId: source.id,
                representation: 'text',
                startLine: 1,
                page: null,
              }),
            ],
            [
              call('e02-amount', 'calculate', {
                operation: 'multiply',
                operands: ['2', '125000.50'],
                decimalPlaces: 2,
              }),
            ],
          ][round];
          if (round === 4)
            output = [
              call('e02-tax', 'calculate', {
                operation: 'multiply',
                operands: [prior('e02-amount'), '0.10'],
                decimalPlaces: 2,
              }),
            ];
          if (round === 5)
            output = [
              call('e02-total', 'calculate', {
                operation: 'add',
                operands: [prior('e02-amount'), prior('e02-tax')],
                decimalPlaces: 2,
              }),
            ];
          if (round >= 6) {
            expect(prior('e02-total')).toBe('275001.10');
            const format = round === 6 ? 'xlsx' : 'pdf';
            output = [
              call('e02-' + format, 'create_document', {
                format,
                title: 'Báo giá nháp E02',
                blocks,
              }),
            ];
          }
        } else if (round === 0)
          output = [
            call('e02-image-text', 'read_project_source', {
              sourceId: imageSource.id,
              representation,
              startLine,
              page: null,
            }),
            call('e02-find-image', 'search_project_sources', {
              query: 'E02-authorized-synthetic',
              limit: 1,
            }),
            call('e02-read-price', 'read_project_source', {
              sourceId: source.id,
              representation: 'text',
              startLine: 1,
              page: null,
            }),
            call('e02-calculate', 'calculate', {
              operation: 'multiply',
              operands: ['2', '125000.50', '1.10'],
              decimalPlaces: 2,
            }),
          ];
        else if (round === 1) {
          const results = toolResults(body.input);
          const discovered = JSON.parse(
            results.find(
              (i: { call_id: string }) => i.call_id === 'e02-find-image',
            )!.output,
          ).results;
          expect(discovered).toEqual([
            expect.objectContaining({ sourceId: imageSource.id }),
          ]);
          expect(discovered[0].chunks).toEqual([]);
          expect(discovered[0].coverage).toContain('metadata');
          expect(
            results.find(
              (i: { call_id: string }) => i.call_id === 'e02-read-price',
            )!.output,
          ).toContain('0007392');
          expect(
            results.find(
              (i: { call_id: string }) => i.call_id === 'e02-calculate',
            )!.output,
          ).toContain('275001.10');
          expect(
            JSON.parse(
              results.find(
                (i: { call_id: string }) => i.call_id === 'e02-image-text',
              )!.output,
            ),
          ).toEqual({ status: 'ERROR', errorCode });
          output = ['xlsx', 'pdf'].map((format) =>
            call('e02-' + format, 'create_document', {
              format,
              title: 'Báo giá nháp E02',
              blocks,
            }),
          );
        } else {
          for (const format of ['xlsx', 'pdf']) {
            const result = toolResults(body.input).find(
              (i) => i.call_id === 'e02-' + format,
            );
            expect(result!.output).toContain('/download');
            expect(result!.output).not.toContain('sandbox:');
          }
          output = [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Đã tạo hai bản nháp, tổng 275001.10 VND từ nguồn tổng hợp được phép.',
                },
              ],
            },
          ];
        }
        round++;
        return new Response(
          'data: ' +
            JSON.stringify({
              type: 'response.completed',
              response: { status: 'completed', model: body.model, output },
            }) +
            '\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      } catch (error) {
        providerProbeError = error;
        throw error;
      }
    });
    try {
      const input = {
        question,
        model: 'account-model',
        clientKey: randomUUID(),
        sourceIds: [source.id, imageSource.id],
        searchMode: 'PROJECT_ONLY',
      };
      const queued = (
        await post('B', `/conversations/${conversation}/answers`, input).expect(
          201,
        )
      ).body;
      const done = (
        await post('B', `/answers/${queued.id}/run`, {}).expect(201)
      ).body;
      if (providerProbeError) throw providerProbeError;
      expect(done).toMatchObject({ status: 'COMPLETED', errorCode: null });
      expect(round).toBe(sequential ? 9 : 3);
      expect(done.artifacts).toHaveLength(2);
      const saved = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      expect(
        (saved.usage as { toolExecutions: unknown[] }).toolExecutions,
      ).toContainEqual(
        expect.objectContaining({
          name: 'read_project_source',
          callId: 'e02-image-text',
          status: 'ERROR',
          errorCode,
        }),
      );
      const { createHash } = await import('node:crypto');
      const { Workbook } = await import('exceljs');
      const { documentText } = await import(
        '../src/project-chat/ai-native-source'
      );
      for (const artifact of done.artifacts) {
        const download = () =>
          get('B', `/files/${artifact.sourceId}/download`)
            .buffer(true)
            .parse((response, complete) => {
              const parts: Buffer[] = [];
              response.on('data', (b) => parts.push(b));
              response.on('end', () => complete(null, Buffer.concat(parts)));
              response.on('error', complete);
            })
            .expect(200);
        const bytes = (await download()).body as Buffer;
        const file = await db.fileAsset.findUniqueOrThrow({
          where: { id: artifact.fileAssetId },
        });
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          file.checksum,
        );
        if (artifact.format === 'xlsx') {
          const book = new Workbook();
          await book.xlsx.load(bytes as never);
          const values: string[] = [];
          book.eachSheet((sheet) =>
            sheet.eachRow((row) =>
              row.eachCell((cell) => {
                expect(cell.type).not.toBe(6);
                values.push(String(cell.value));
              }),
            ),
          );
          for (const value of ['0007392', '125000.50', '275001.10'])
            expect(values).toContain(value);
          expect(book.model.media?.[0]?.buffer).toEqual(image);
        } else {
          const extracted = await documentText(
            {
              organizationId,
              projectId: projects.B!,
              roomId: '',
              sourceId: artifact.sourceId,
              version: artifact.version,
              text: '',
            },
            artifact.filename,
            'application/pdf',
            bytes,
            file.checksum!,
          );
          expect(extracted.text).toContain('275001.10');
          expect(extracted.text).toContain('0007392');
          expect(extracted.text).toContain('Ảnh tổng hợp');
        }
        expect((await download()).body).toEqual(bytes);
        await get('A', `/files/${artifact.sourceId}/download`).expect(404);
      }
      const history = (
        await get('B', `/conversations/${conversation}`).expect(200)
      ).body;
      expect(
        history.answers.find((a: { id: string }) => a.id === queued.id)
          .artifacts,
      ).toHaveLength(2);
      expect(
        (
          await post(
            'B',
            `/conversations/${conversation}/answers`,
            input,
          ).expect(201)
        ).body.id,
      ).toBe(queued.id);
      await post('B', `/answers/${queued.id}/run`, {}).expect(201);
      expect(round).toBe(sequential ? 9 : 3);
      expect(
        await db.chatAiWorkspaceJob.count({ where: { answerId: queued.id } }),
      ).toBe(0);
      expect(
        await db.chatAiAnswerDependency.count({
          where: { answerId: queued.id, sourceIndexId: imageSource.id },
        }),
      ).toBe(1);
    } finally {
      vi.stubGlobal('fetch', previous);
      vi.stubEnv('FEATURE_WORKSPACE_AGENTS', 'false');
    }
  },
  60000,
);

it('E02 rechecks discovered image metadata after deletion before accepting the final response', async () => {
  const previous = globalThis.fetch;
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const { activationFixture } = await import(
    '../src/project-chat/ai-activation'
  );
  const uploaded = await request(app.getHttpServer())
    .post(base('B') + `/conversations/${conversation}/files`)
    .set('Cookie', users.owner!.cookie)
    .set('X-Chat-Actor', users.owner!.id)
    .field('clientKey', randomUUID())
    .attach('file', activationFixture('image').media[0]!.bytes, {
      filename: 'E02-discovery-revoke.png',
      contentType: 'image/png',
    })
    .expect(201);
  const source = await db.chatAiSourceIndex.findUniqueOrThrow({
    where: { id: uploaded.body.id },
  });
  let round = 0;
  vi.stubGlobal('fetch', async () => {
    const call = {
      type: 'function_call',
      namespace: 'galaxy',
      call_id: 'discover-revoked',
      name: 'search_project_sources',
      arguments: JSON.stringify({ query: 'E02-discovery-revoke', limit: 1 }),
    };
    const output =
      round++ === 0
        ? [call]
        : [
            {
              type: 'message',
              role: 'assistant',
              content: [
                { type: 'output_text', text: 'E02-discovery-revoke.png' },
              ],
            },
          ];
    if (round === 2)
      await db.fileAsset.update({
        where: { id: source.fileAssetId! },
        data: { deletedAt: new Date() },
      });
    return new Response(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: { status: 'completed', model: 'account-model', output },
        }) +
        '\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  try {
    const queued = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'Tìm tên ảnh tổng hợp được phép.',
        model: 'account-model',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const done = (await post('B', `/answers/${queued.id}/run`, {}).expect(201))
      .body;
    expect(round).toBe(2);
    expect(
      (
        await db.fileAsset.findUniqueOrThrow({
          where: { id: source.fileAssetId! },
        })
      ).deletedAt,
    ).not.toBeNull();
    expect(done.status).not.toBe('COMPLETED');
    expect(done.answer).toBeNull();
    expect(
      await db.chatAiAnswerDependency.count({
        where: { answerId: queued.id, sourceIndexId: source.id },
      }),
    ).toBe(1);
    const reloaded = (
      await get('B', `/conversations/${conversation}`).expect(200)
    ).body.answers.find((a: { id: string }) => a.id === queued.id);
    expect(reloaded.answer).toBeNull();
  } finally {
    globalThis.fetch = previous;
  }
}, 30000);

it.each(['docx', 'pdf'] as const)(
  'E02-4 describes a v2 %s draft without claiming XLSX formulas',
  async (format) => {
    const previous = globalThis.fetch;
    let notice = '',
      round = 0;
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      const first = round++ === 0;
      if (!first)
        notice = JSON.parse(
          toolResults(body.input).find((i) => i.call_id === 'word-pdf-notice')!
            .output,
        ).notice;
      const output = first
        ? [
            {
              type: 'function_call',
              namespace: 'galaxy',
              name: 'create_document',
              call_id: 'word-pdf-notice',
              arguments: JSON.stringify({
                version: 2,
                format,
                title: 'Bản nháp Việt',
                blocks: [{ kind: 'paragraph', text: 'Mã 0007392' }],
              }),
            },
          ]
        : [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Đã tạo bản nháp.' }],
            },
          ];
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: { status: 'completed', model: body.model, output },
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });
    try {
      const turn = await ask('B');
      const done = (await post('B', `/answers/${turn.id}/run`, {}).expect(201))
        .body;
      expect(done).toMatchObject({ status: 'COMPLETED', errorCode: null });
      expect(done.artifacts[0].format).toBe(format);
      expect(notice).toContain('chưa phê duyệt/phát hành');
      expect(notice).not.toMatch(/XLSX|cached|công thức/);
    } finally {
      vi.stubGlobal('fetch', previous);
    }
  },
  60000,
);

it('E02-4 preserves v2 formula caches, exact revision CAS, immutable originals and scoped durable previews through SIWC tools', async () => {
  const previous = globalThis.fetch;
  const { Workbook } = await import('exceljs');
  const { createHash } = await import('node:crypto');
  const doc = {
    version: 2,
    format: 'xlsx',
    title: 'E02-4 nhiều sheet',
    blocks: [],
    workbook: {
      sheets: [
        {
          name: 'Giá',
          cells: [
            { cell: 'A1', kind: 'text', text: '0007392' },
            {
              cell: 'B1',
              kind: 'number',
              value: '125000.50',
              format: 'decimal2',
            },
          ],
          images: [],
        },
        {
          name: 'Tổng',
          cells: [
            {
              cell: 'A1',
              kind: 'formula',
              operation: 'multiply',
              operands: [{ sheet: 'Giá', cell: 'B1' }, { value: '2.2' }],
              decimalPlaces: 2,
              format: 'decimal2',
            },
          ],
          images: [],
        },
      ],
    },
  };
  let name = 'create_document',
    args: object = doc,
    first: { sourceId: string; version: string; fileAssetId: string } | null =
      null,
    phase = 'create',
    round = 0;
  const errors: string[] = [];
  vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('account-model');
    const prior = toolResults(body.input).filter((i) =>
      i.call_id.startsWith(phase),
    );
    let output: unknown[];
    if (prior.length === 0)
      output = [
        {
          type: 'function_call',
          namespace: 'galaxy',
          name,
          call_id: phase + '-first',
          arguments: JSON.stringify(args),
        },
      ];
    else if (phase === 'revise' && prior.length === 1) {
      const error = JSON.parse(prior[0]!.output);
      errors.push(error.errorCode);
      output = [
        {
          type: 'function_call',
          namespace: 'galaxy',
          name,
          call_id: phase + '-corrected',
          arguments: JSON.stringify({
            ...doc,
            sourceId: first!.sourceId,
            sourceVersion: first!.version,
            title: 'E02-4 bản hai',
          }),
        },
      ];
    } else
      output = [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Đã tạo nháp được kiểm.' }],
        },
      ];
    round++;
    return new Response(
      'data: ' +
        JSON.stringify({
          type: 'response.completed',
          response: { status: 'completed', model: body.model, output },
        }) +
        '\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  const download = (id: string) =>
    get('B', `/files/${id}/download`)
      .buffer(true)
      .parse((res, done) => {
        const parts: Buffer[] = [];
        res.on('data', (b) => parts.push(b));
        res.on('end', () => done(null, Buffer.concat(parts)));
        res.on('error', done);
      })
      .expect(200);
  try {
    const turn = await ask('B'),
      created = (await post('B', `/answers/${turn.id}/run`, {}).expect(201))
        .body;
    expect({ status: created.status, errorCode: created.errorCode }).toEqual({
      status: 'COMPLETED',
      errorCode: null,
    });
    first = created.artifacts[0];
    const original = (await download(first!.sourceId)).body as Buffer;
    const book = new Workbook();
    await book.xlsx.load(original as never);
    expect(book.getWorksheet('Giá')!.getCell('A1').value).toBe('0007392');
    expect(book.getWorksheet('Tổng')!.getCell('A1').result).toBe(275001.1);
    await post('B', '/index', { scope: 'ALL' }).expect(201);
    phase = 'revise';
    name = 'revise_draft';
    args = { ...doc, sourceId: first!.sourceId, sourceVersion: 'obsolete' };
    const revision = await ask('B', turn.conversation),
      done = (await post('B', `/answers/${revision.id}/run`, {}).expect(201))
        .body;
    expect({ status: done.status, errorCode: done.errorCode }).toEqual({
      status: 'COMPLETED',
      errorCode: null,
    });
    expect(errors).toEqual(['DOCUMENT_VERSION_MISMATCH']);
    expect(done.artifacts).toHaveLength(1);
    const second = done.artifacts[0];
    expect(second.fileAssetId).not.toBe(first!.fileAssetId);
    expect(second.version).toMatch(/^2:/);
    expect(second.predecessor).toEqual({
      sourceId: first!.sourceId,
      version: first!.version,
    });
    expect((await download(first!.sourceId)).body).toEqual(original);
    expect(
      createHash('sha256')
        .update((await download(second.sourceId)).body)
        .digest('hex'),
    ).toBe(
      (
        await db.fileAsset.findUniqueOrThrow({
          where: { id: second.fileAssetId },
        })
      ).checksum,
    );
    expect(
      (await post('B', `/answers/${revision.id}/run`, {}).expect(201)).body
        .artifacts,
    ).toEqual(done.artifacts);
    expect(round).toBe(5);
    expect(
      (
        await get('B', `/conversations/${turn.conversation}`).expect(200)
      ).body.answers.at(-1).artifacts[0].sourceId,
    ).toBe(second.sourceId);
    await get('A', `/files/${second.sourceId}/preview`).expect(404);
    await get('B', `/files/${second.sourceId}/preview`, 'staff').expect(404);
  } finally {
    vi.stubGlobal('fetch', previous);
  }
}, 60000);

it.runIf(Boolean(process.env.GALAXY_AI_OFFICECLI))(
  'E02-4 SIWC creates a native editable PPTX and serves its CSP-protected private preview after reload',
  async () => {
    const previous = globalThis.fetch;
    const args = {
      version: 2,
      format: 'pptx',
      title: 'E02 native slides',
      blocks: [],
      presentation: {
        template: 'galaxy-light',
        slides: [
          {
            title: 'Báo giá nháp Việt Nam',
            elements: [
              {
                kind: 'text',
                x: 0.5,
                y: 1.5,
                w: 7,
                h: 1,
                text: 'Mã 0007392 · 275001.10 VND',
                fontSize: 20,
                bold: true,
              },
              {
                kind: 'chart',
                x: 0.5,
                y: 2.6,
                w: 7,
                h: 3.5,
                title: 'Giá trị VND',
                labels: ['Tiền hàng', 'Thuế'],
                series: [{ name: 'VND', values: ['250001.00', '25000.10'] }],
              },
            ],
          },
        ],
      },
    };
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      expect(body.model).toBe('account-model');
      const schema = body.tools
        .find((t: { type: string }) => t.type === 'namespace')
        .tools.find((t: { name: string }) => t.name === 'create_document');
      expect(schema.parameters.properties.format.enum).toContain('pptx');
      const output = toolResults(body.input).some(
        (i) => i.call_id === 'native-pptx',
      )
        ? [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Đã tạo PPTX native.' }],
            },
          ]
        : [
            {
              type: 'function_call',
              namespace: 'galaxy',
              name: 'create_document',
              call_id: 'native-pptx',
              arguments: JSON.stringify(args),
            },
          ];
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: { status: 'completed', model: body.model, output },
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });
    try {
      const turn = await ask('B'),
        done = (await post('B', `/answers/${turn.id}/run`, {}).expect(201))
          .body;
      expect({ status: done.status, errorCode: done.errorCode }).toEqual({
        status: 'COMPLETED',
        errorCode: null,
      });
      const artifact = done.artifacts[0];
      expect(artifact.format).toBe('pptx');
      const preview = await get(
        'B',
        `/files/${artifact.sourceId}/preview`,
      ).expect(200);
      expect(preview.text).toContain('0007392');
      expect(preview.text).toContain('CHƯA PHÊ DUYỆT');
      expect(preview.headers['content-security-policy']).toContain(
        "script-src 'none'",
      );
      expect(preview.headers['content-security-policy']).toContain('sandbox');
      expect(
        (
          await get('B', `/conversations/${turn.conversation}`).expect(200)
        ).body.answers.at(-1).artifacts[0].sourceId,
      ).toBe(artifact.sourceId);
      await get('A', `/files/${artifact.sourceId}/preview`).expect(404);
      await get('B', `/files/${artifact.sourceId}/preview`, 'staff').expect(
        404,
      );
    } finally {
      vi.stubGlobal('fetch', previous);
    }
  },
  60000,
);

it('E02-5 reuses resumable upload for private chat without a business-write permission', async () => {
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const bytes = Buffer.from('Mã,Tổng VND\n0007392,275001.10\n');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const input = {
    projectId: projects.B,
    aiConversationId: conversation,
    idempotencyKey: randomUUID(),
    originalFilename: 'Nguồn chat.csv',
    declaredSize: bytes.length,
    mimeType: 'text/csv',
    checksum,
  };
  const uploadPost = (path: string, body: object, who = 'owner') =>
    request(app.getHttpServer())
      .post('/api/v1/uploads' + path)
      .set('Cookie', users[who]!.cookie)
      .send(body);
  const query = `?projectId=${projects.B}&aiConversationId=${conversation}`;
  const constraints = await request(app.getHttpServer())
    .get('/api/v1/uploads/constraints' + query)
    .set('Cookie', users.owner!.cookie)
    .expect(200);
  expect(constraints.body.maxBytes).toBe(10_000_000_000);
  const started = (await uploadPost('/initiate', input).expect(201)).body;
  expect(
    (
      await uploadPost('/initiate', {
        ...input,
        idempotencyKey: input.idempotencyKey.toUpperCase(),
      }).expect(201)
    ).body.id,
  ).toBe(started.id);
  const recovering = await request(app.getHttpServer())
    .get('/api/v1/uploads/recovery' + query)
    .set('Cookie', users.owner!.cookie)
    .expect(200);
  expect(recovering.body.items.map((item: { id: string }) => item.id)).toEqual([
    started.id,
  ]);
  await uploadPost('/initiate', { ...input, projectId: projects.A }).expect(
    404,
  );
  await uploadPost('/initiate', input, 'staff').expect(404);
  await uploadPost('/initiate', {
    ...input,
    idempotencyKey: randomUUID(),
    declaredSize: 10_000_000_001,
  }).expect(413);
  expect((await uploadPost('/initiate', input).expect(201)).body.id).toBe(
    started.id,
  );
  const part = await request(app.getHttpServer())
    .post(
      `/api/v1/uploads/${started.id}/parts?partNumber=1&checksum=${checksum}`,
    )
    .set('Cookie', users.owner!.cookie)
    .set('Content-Type', 'application/octet-stream')
    .send(bytes);
  expect(part.status, JSON.stringify(part.body)).toBe(201);
  expect(part.body.uploadedBytes).toBe(String(bytes.length));
  const completed = (
    await uploadPost(`/${started.id}/complete`, { checksum }).expect(201)
  ).body;
  const replay = (
    await uploadPost(`/${started.id}/complete`, { checksum }).expect(201)
  ).body;
  expect(completed.sourceId).toEqual(expect.any(String));
  expect(replay.sourceId).toBe(completed.sourceId);
  const index = await db.chatAiSourceIndex.findUniqueOrThrow({
    where: { id: completed.sourceId },
  });
  expect(index).toMatchObject({
    conversationId: conversation,
    ownerId: users.owner!.id,
    projectId: projects.B!,
    provenance: 'UNCONFIRMED',
  });
  expect(index.version).toBe('1:' + checksum);
  expect(
    await db.entityAttachment.count({
      where: {
        fileAssetId: completed.fileAssetId,
        entityType: 'ChatAiConversation',
        entityId: conversation,
      },
    }),
  ).toBe(1);
  const download = await get(
    'B',
    `/files/${completed.sourceId}/download`,
  ).expect(200);
  expect(
    (Buffer.isBuffer(download.body)
      ? download.body
      : Buffer.from(download.text)
    ).equals(bytes),
  ).toBe(true);
  await get('A', `/files/${completed.sourceId}/download`).expect(404);
  await get('B', `/files/${completed.sourceId}/download`, 'staff').expect(404);
  await uploadPost(`/${started.id}/abort`, {}).expect(409);
  await db.fileAsset.update({
    where: { id: completed.fileAssetId },
    data: { deletedAt: new Date() },
  });
  await uploadPost(`/${started.id}/complete`, { checksum }).expect(404);
  await uploadPost('/initiate', input).expect(404);
  await request(app.getHttpServer())
    .get(`/api/v1/uploads/${started.id}`)
    .set('Cookie', users.owner!.cookie)
    .expect(404);
  const afterDeletion = await request(app.getHttpServer())
    .get('/api/v1/uploads/recovery' + query)
    .set('Cookie', users.owner!.cookie)
    .expect(200);
  expect(afterDeletion.body.items).toEqual([]);
}, 60000);

it.each([50001, 600001])(
  'E02-5 reads a late line %i from a streamed private text derivative with durable scoped citations',
  async (selectedLine) => {
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const bytes = Buffer.from(
      'Đầu nguồn\n' +
        (selectedLine > 50001
          ? 'Hàng thường với mã số và đơn vị 0007392 VND, chưa xác nhận.\n'
          : 'Hàng thường\n'
        ).repeat(selectedLine - 2) +
        'REAL-LARGE-50001-7392\n' +
        'Kết nguồn\n'.repeat(100),
    );
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const started = (
      await request(app.getHttpServer())
        .post('/api/v1/uploads/initiate')
        .set('Cookie', users.owner!.cookie)
        .send({
          projectId: projects.B,
          aiConversationId: conversation,
          idempotencyKey: randomUUID(),
          originalFilename: 'Nguồn lớn.md',
          declaredSize: bytes.length,
          mimeType: 'text/markdown',
          checksum,
        })
        .expect(201)
    ).body;
    await request(app.getHttpServer())
      .post(
        `/api/v1/uploads/${started.id}/parts?partNumber=1&checksum=${checksum}`,
      )
      .set('Cookie', users.owner!.cookie)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes)
      .expect(201);
    const sourceId = (
      await request(app.getHttpServer())
        .post(`/api/v1/uploads/${started.id}/complete`)
        .set('Cookie', users.owner!.cookie)
        .send({ checksum })
        .expect(201)
    ).body.sourceId;
    await post('B', '/index', { scope: 'ALL' }).expect(201);
    const index = await db.chatAiSourceIndex.findUniqueOrThrow({
      where: { id: sourceId },
      include: { largeChunks: { orderBy: { ordinal: 'asc' } } },
    });
    expect({ status: index.status, errorCode: index.errorCode }).toEqual({
      status: 'READY',
      errorCode: null,
    });
    const coverage = selectedLine > 50001 ? 'PARTIAL' : 'COMPLETE';
    expect(index.processingMetadata).toMatchObject({
      coverage,
      originalBytes: bytes.length,
    });
    const derived = index.largeChunks.map((row) => row.text).join('');
    expect(bytes.toString().startsWith(derived)).toBe(true);
    expect(Buffer.byteLength(derived)).toBeLessThanOrEqual(33554432);
    expect(index.text).not.toContain('REAL-LARGE-50001-7392');
    const restored = (
      await get('B', '/index?scope=ALL').expect(200)
    ).body.sources.find((row: { id: string }) => row.id === sourceId);
    expect(restored).toMatchObject({
      downloadUrl: `/api/v1/project-chat/projects/${projects.B}/ai/files/${sourceId}/download`,
      coverage: { coverage, originalBytes: bytes.length },
    });
    const previous = globalThis.fetch;
    let handle = '';
    vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      const result = body.input.find(
        (item: { type?: string; call_id?: string }) =>
          item.type === 'function_call_output' && item.call_id === 'late-line',
      );
      if (result) {
        expect(result.output).toContain('REAL-LARGE-50001-7392');
        const parsed = JSON.parse(result.output);
        handle = parsed.results[0].chunks[0].handle;
        expect(handle).toMatch(/^T_[a-f0-9]{24}$/);
      }
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: {
              status: 'completed',
              model: body.model,
              output: result
                ? [
                    {
                      type: 'message',
                      role: 'assistant',
                      content: [
                        {
                          type: 'output_text',
                          text: `Đã đọc REAL-LARGE-50001-7392 [${handle}]`,
                        },
                      ],
                    },
                  ]
                : [
                    {
                      type: 'function_call',
                      namespace: 'galaxy',
                      name: 'read_project_source',
                      call_id: 'late-line',
                      arguments: JSON.stringify({
                        sourceId,
                        representation: 'text',
                        startLine: selectedLine,
                        page: null,
                      }),
                    },
                  ],
            },
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });
    try {
      const turn = (
        await post('B', `/conversations/${conversation}/answers`, {
          clientKey: randomUUID(),
          question: 'Đọc đúng dòng 50001 của tệp đã chọn.',
          model: 'account-model',
          reasoning: 'default',
          mode: 'GENERAL',
          sourceIds: [sourceId],
        }).expect(201)
      ).body;
      const answer = (
        await post('B', `/answers/${turn.id}/run`, {}).expect(201)
      ).body;
      expect(answer.status).toBe('COMPLETED');
      expect(answer.answer).toContain('REAL-LARGE-50001-7392');
      expect(answer.sources).toContainEqual(
        expect.objectContaining({
          handle,
          startLine: selectedLine,
        }),
      );
      const reloaded = (
        await get('B', `/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1);
      expect(reloaded.sources).toContainEqual(
        expect.objectContaining({
          handle,
          startLine: selectedLine,
        }),
      );
      expect(
        (
          await get('B', `/conversations/${conversation}`).expect(200)
        ).body.answers.at(-1).answer,
      ).toContain('REAL-LARGE-50001-7392');
      const detail = await get(
        'B',
        `/answers/${turn.id}/sources/${handle}`,
      ).expect(200);
      expect(detail.body.text).toContain('REAL-LARGE-50001-7392');
      expect(detail.body.startLine).toBe(selectedLine);
      await get('A', `/answers/${turn.id}/sources/${handle}`).expect(404);
      await get('B', `/answers/${turn.id}/sources/${handle}`, 'staff').expect(
        404,
      );
      if (selectedLine > 50001) {
        expect(derived).not.toContain('REAL-LARGE-50001-7392');
        await db.fileAsset.update({
          where: { id: index.fileAssetId! },
          data: { checksum: 'a'.repeat(64) },
        });
      } else {
        const used = await db.chatAiSourceChunk.findFirstOrThrow({
          where: {
            sourceIndexId: sourceId,
            locator: { path: ['endLine'], gte: 50001 },
          },
          orderBy: { ordinal: 'asc' },
        });
        await db.chatAiSourceChunk.update({
          where: { id: used.id },
          data: { checksum: 'a'.repeat(64) },
        });
      }
      const hidden = (
        await get('B', `/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1);
      expect(hidden.answer).toBeNull();
    } finally {
      vi.stubGlobal('fetch', previous);
    }
  },
  60000,
);

it('E02-5 explicitly promotes an immutable private source into one unapproved document draft with current permissions', async () => {
  const owner = users.owner!;
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const bytes = Buffer.from('Mã,Tổng VND\n0007392,275001.10\n');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const upload = app.get(UploadsService);
  const session = await upload.initiate(owner.actor, {
    projectId: projects.B!,
    aiConversationId: conversation,
    idempotencyKey: randomUUID(),
    originalFilename: 'Nguồn promote.csv',
    mimeType: 'text/csv',
    declaredSize: bytes.length,
    checksum,
  });
  await upload.part(owner.actor, session.id, 1, checksum, Readable.from(bytes));
  const sourceId = (await upload.complete(owner.actor, session.id, checksum))
    .sourceId!;
  const source = await db.chatAiSourceIndex.findUniqueOrThrow({
    where: { id: sourceId },
  });
  const definition = await db.projectRequiredDocument.create({
    data: {
      organizationId,
      projectId: projects.B!,
      stageKey: 'STAGE_2',
      workstreamKey: 'PLANNING',
      documentType: 'E02_DRAFT_' + randomUUID(),
      documentName: 'Báo giá nháp E02',
      status: 'MISSING',
    },
  });
  const input = {
    definitionId: definition.id,
    sourceVersion: source.version,
    clientKey: randomUUID(),
  };
  const path = `/files/${sourceId}/promote`;
  await post('B', path, input).expect(404);
  const role = await db.role.create({
    data: {
      organizationId,
      code: 'promote-' + randomUUID(),
      name: 'Synthetic promote manager',
      maximumScope: 'SYSTEM',
      permissions: {
        create: {
          permission: { connect: { code: 'project.document.manage' } },
        },
      },
    },
  });
  const binding = await db.userRole.create({
    data: {
      organizationId,
      userId: owner.id,
      roleId: role.id,
      scopeType: 'SYSTEM',
    },
  });
  try {
    const financial = await db.projectRequiredDocument.create({
      data: {
        organizationId,
        projectId: projects.B!,
        stageKey: 'STAGE_1',
        workstreamKey: 'FINANCIAL_PLANNING',
        documentType: 'PRELIMINARY_FINANCIAL_PLAN',
        documentName: 'Private scoped financial target',
        status: 'MISSING',
      },
    });
    const department = await db.department.create({
      data: {
        organizationId,
        code: 'finance-other-' + randomUUID(),
        name: 'Other finance scope',
      },
    });
    const financeRole = await db.role.create({
      data: {
        organizationId,
        code: 'finance-' + randomUUID(),
        name: 'Scoped finance',
        maximumScope: 'SYSTEM',
        permissions: {
          create: [
            'project.stage1.finance.read',
            'project.stage1.finance.manage',
          ].map((code) => ({ permission: { connect: { code } } })),
        },
      },
    });
    const financeBinding = await db.userRole.create({
      data: {
        organizationId,
        userId: owner.id,
        roleId: financeRole.id,
        scopeType: 'DEPARTMENT',
        departmentId: department.id,
      },
    });
    try {
      expect(
        (await get('B', `/files/${sourceId}/promote-targets`).expect(200)).body
          .items,
      ).not.toContainEqual(expect.objectContaining({ id: financial.id }));
      await db.userRole.update({
        where: { id: financeBinding.id },
        data: { scopeType: 'SYSTEM', departmentId: null },
      });
      expect(
        (await get('B', `/files/${sourceId}/promote-targets`).expect(200)).body
          .items,
      ).toContainEqual(expect.objectContaining({ id: financial.id }));
      await db.rolePermission.deleteMany({
        where: {
          roleId: financeRole.id,
          permission: { code: 'project.stage1.finance.manage' },
        },
      });
      expect(
        (await get('B', `/files/${sourceId}/promote-targets`).expect(200)).body
          .items,
      ).not.toContainEqual(expect.objectContaining({ id: financial.id }));
    } finally {
      await db.userRole.delete({ where: { id: financeBinding.id } });
    }
    await db.projectMember.create({
      data: {
        organizationId,
        projectId: projects.B!,
        userId: owner.id,
        createdBy: owner.id,
      },
    });
    const targets = (
      await get('B', `/files/${sourceId}/promote-targets`).expect(200)
    ).body;
    expect(targets.items).toContainEqual(
      expect.objectContaining({ id: definition.id, label: 'Báo giá nháp E02' }),
    );
    const promoted = (await post('B', path, input).expect(201)).body;
    expect(promoted).toMatchObject({
      status: 'DRAFT',
      fileAssetId: source.fileAssetId,
      sourceVersion: source.version,
      checksum,
      version: 1,
    });
    expect((await post('B', path, input).expect(201)).body).toEqual(promoted);
    await post('B', path, { ...input, sourceVersion: 'changed' }).expect(409);
    await post('A', path, input).expect(404);
    await post('B', path, input, 'staff').expect(404);
    const document = await db.projectStageOneDocument.findUniqueOrThrow({
      where: { id: promoted.documentId },
      include: { versions: true },
    });
    expect(document.status).toBe('UPLOADED');
    expect(document.versions).toHaveLength(1);
    expect(document.versions[0]!.fileAssetId).toBe(source.fileAssetId);
    expect(
      (
        await db.projectRequiredDocument.findUniqueOrThrow({
          where: { id: definition.id },
        })
      ).approvedAt,
    ).toBeNull();
    const original = await app
      .get(ProjectAiService)
      .downloadFile(owner.actor, projects.B!, sourceId);
    let received = Buffer.alloc(0);
    for await (const chunk of original.data)
      received = Buffer.concat([received, chunk]);
    expect(received).toEqual(bytes);
    expect(
      await db.activity.count({
        where: {
          organizationId,
          event: 'AI_FILE_PROMOTED',
          entityId: promoted.documentId,
        },
      }),
    ).toBe(1);
    await db.projectRequiredDocument.update({
      where: { id: definition.id },
      data: { approvedAt: new Date(), status: 'APPROVED' },
    });
    await post('B', path, { ...input, clientKey: randomUUID() }).expect(409);
    expect(
      (await get('B', `/files/${sourceId}/promote-targets`).expect(200)).body
        .items,
    ).not.toContainEqual(expect.objectContaining({ id: definition.id }));
    await db.userRole.delete({ where: { id: binding.id } });
    await post('B', path, input).expect(404);
  } finally {
    await db.userRole.deleteMany({ where: { id: binding.id } });
  }
});

it('E02-5 refuses completion publication when Project authority is revoked during staging cleanup', async () => {
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const bytes = Buffer.from('Mã,Tổng\n0007392,275001.10\n');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const started = (
    await request(app.getHttpServer())
      .post('/api/v1/uploads/initiate')
      .set('Cookie', users.owner!.cookie)
      .send({
        projectId: projects.B,
        aiConversationId: conversation,
        idempotencyKey: randomUUID(),
        originalFilename: 'cleanup.csv',
        declaredSize: bytes.length,
        mimeType: 'text/csv',
        checksum,
      })
      .expect(201)
  ).body;
  await request(app.getHttpServer())
    .post(
      `/api/v1/uploads/${started.id}/parts?partNumber=1&checksum=${checksum}`,
    )
    .set('Cookie', users.owner!.cookie)
    .set('Content-Type', 'application/octet-stream')
    .send(bytes)
    .expect(201);
  const service = app.get(UploadsService);
  const cleanup = service['releaseStaging'].bind(service);
  const spy = vi
    .spyOn(service, 'releaseStaging' as never)
    .mockImplementation((async (id: string) => {
      const result = await cleanup(id);
      if (id === started.id)
        await db.chatProjectGrant.update({
          where: { id: grants.B! },
          data: { revokedAt: new Date() },
        });
      return result;
    }) as never);
  try {
    await request(app.getHttpServer())
      .post(`/api/v1/uploads/${started.id}/complete`)
      .set('Cookie', users.owner!.cookie)
      .send({ checksum })
      .expect(404);
    expect(
      await db.uploadSession.findUniqueOrThrow({ where: { id: started.id } }),
    ).toMatchObject({
      status: 'AVAILABLE',
      stagingReleasedAt: expect.any(Date),
    });
    expect(
      await db.chatAiSourceIndex.count({
        where: { conversationId: conversation },
      }),
    ).toBe(1);
  } finally {
    spy.mockRestore();
    await db.chatProjectGrant.update({
      where: { id: grants.B! },
      data: { revokedAt: null },
    });
  }
  const resumed = await request(app.getHttpServer())
    .post(`/api/v1/uploads/${started.id}/complete`)
    .set('Cookie', users.owner!.cookie)
    .send({ checksum })
    .expect(201);
  expect(resumed.body.sourceId).toEqual(expect.any(String));
  expect(
    await db.chatAiSourceIndex.count({
      where: { conversationId: conversation },
    }),
  ).toBe(1);
});

it('E02-5 bounds unfinished recovery without returning completed history', async () => {
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const data = {
    organizationId,
    actorId: users.owner!.id,
    projectId: projects.B!,
    aiConversationId: conversation,
    originalFilename: 'recovery.csv',
    declaredSize: 1n,
    mimeType: 'text/csv',
    partSize: 1,
    totalParts: 1,
    expiresAt: new Date(Date.now() + 60_000),
  };
  await db.uploadSession.createMany({
    data: Array.from({ length: 101 }, () => ({
      ...data,
      idempotencyKey: randomUUID(),
      storageKey: organizationId + '/recovery/' + randomUUID(),
      status: 'AVAILABLE' as const,
    })),
  });
  const active = await db.uploadSession.create({
    data: {
      ...data,
      idempotencyKey: randomUUID(),
      storageKey: organizationId + '/recovery/' + randomUUID(),
    },
  });
  const recover = () =>
    request(app.getHttpServer())
      .get(
        `/api/v1/uploads/recovery?projectId=${projects.B}&aiConversationId=${conversation}`,
      )
      .set('Cookie', users.owner!.cookie)
      .expect(200);
  const first = (await recover()).body;
  expect(first).toMatchObject({ truncated: false });
  expect(first.items.map((item: { id: string }) => item.id)).toEqual([
    active.id,
  ]);
  await db.uploadSession.createMany({
    data: Array.from({ length: 100 }, () => ({
      ...data,
      idempotencyKey: randomUUID(),
      storageKey: organizationId + '/recovery/' + randomUUID(),
    })),
  });
  const bounded = (await recover()).body;
  expect(bounded.items).toHaveLength(100);
  expect(bounded.truncated).toBe(true);
});

it.runIf(process.env.GALAXY_E02_LARGE_FILE_ACCEPTANCE === 'true')(
  'E02-5 transfers a non-sparse full decimal 10 GB original, resumes after restart, validates readback and cancels staging',
  async () => {
    const startedAt = new Date().toISOString();
    const total = 10_000_000_000;
    const service = app.get(UploadsService);
    const actor = users.owner!.actor;
    const original = join(isolated.testRoot, 'e02-10gb-' + run + '.csv');
    const receipt = join(isolated.testRoot, 'e02-10gb-' + run + '.json');
    const diskBefore = await statfs(isolated.testRoot, { bigint: true });
    let peakRss = process.memoryUsage().rss;
    const monitor = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 100);
    const evidence: Record<string, unknown> = {
      startedAt,
      originalBytes: total,
      status: 'RUNNING',
      diskAvailableBefore: String(diskBefore.bavail * diskBefore.bsize),
    };
    const record = (phase: string, values: Record<string, unknown> = {}) => {
      Object.assign(
        evidence,
        { phase, recordedAt: new Date().toISOString(), peakRssBytes: peakRss },
        values,
      );
      writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n', {
        mode: 0o600,
      });
    };
    const hashStream = async (stream: Readable) => {
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const part of stream) {
        hash.update(part);
        bytes += Buffer.byteLength(part);
      }
      return { checksum: hash.digest('hex'), bytes };
    };
    try {
      mkdirSync(isolated.testRoot, { recursive: true });
      const block = Buffer.from('0007392,275001.10,VND\n'.repeat(49_000));
      const originalHash = createHash('sha256');
      await pipeline(
        Readable.from(
          (function* () {
            for (let remaining = total; remaining > 0; ) {
              const bytes = block.subarray(
                0,
                Math.min(block.length, remaining),
              );
              originalHash.update(bytes);
              remaining -= bytes.length;
              yield bytes;
            }
          })(),
        ),
        createWriteStream(original, { flags: 'wx', mode: 0o600 }),
      );
      const checksum = originalHash.digest('hex');
      const actual = await stat(original);
      expect(actual.size).toBe(total);
      expect(actual.blocks * 512).toBeGreaterThanOrEqual(total);
      record('NON_SPARSE_ORIGINAL_WRITTEN', {
        checksum,
        allocatedBytes: actual.blocks * 512,
      });
      const conversation = (
        await post('B', '/conversations', {
          scope: 'ALL',
          clientKey: randomUUID(),
        }).expect(201)
      ).body.id;
      const input = {
        projectId: projects.B!,
        aiConversationId: conversation,
        idempotencyKey: randomUUID(),
        originalFilename: 'E02 full decimal 10GB.csv',
        declaredSize: total,
        mimeType: 'text/csv',
        checksum,
      };
      const session = await service.initiate(actor, input);
      const sendPart = async (uploader: UploadsService, partNumber: number) => {
        const start = (partNumber - 1) * session.partSize;
        const end = Math.min(total, start + session.partSize) - 1;
        const part = await hashStream(
          createReadStream(original, { start, end }),
        );
        return uploader.part(
          actor,
          session.id,
          partNumber,
          part.checksum,
          createReadStream(original, { start, end }),
        );
      };
      await sendPart(service, 1);
      await sendPart(service, 2);
      const broken = Readable.from(
        (async function* () {
          yield block;
          throw new Error('synthetic disconnect');
        })(),
      );
      await expect(
        service.part(actor, session.id, 3, 'a'.repeat(64), broken),
      ).rejects.toThrow();
      const retained = await service.get(actor, session.id);
      expect(retained.uploadedParts).toHaveLength(2);
      expect(retained.uploadedBytes).toBe(String(session.partSize * 2));
      await app.close();
      app = (
        await Test.createTestingModule({ imports: [AppModule] }).compile()
      ).createNestApplication();
      await app.init();
      const resumedService = app.get(UploadsService);
      const resumed = await resumedService.get(actor, session.id);
      expect(resumed.uploadedParts).toEqual(retained.uploadedParts);
      await expect(
        resumedService.get(users.staff!.actor, session.id),
      ).rejects.toThrow();
      await expect(
        resumedService.initiate(actor, { ...input, projectId: projects.A! }),
      ).rejects.toThrow();
      expect(
        (
          await resumedService.recover(actor, {
            projectId: projects.B!,
            aiConversationId: conversation,
          })
        ).items.map((item) => item.id),
      ).toEqual([session.id]);
      record('RESTART_RESUME_AND_SCOPE_PASS', {
        sessionId: session.id,
        retainedParts: 2,
        totalParts: session.totalParts,
      });
      for (let part = 3; part <= session.totalParts; part++) {
        await sendPart(resumedService, part);
        if (part % 10 === 0) record('TRANSFERRING', { committedParts: part });
      }
      const completed = await resumedService.complete(
        actor,
        session.id,
        checksum,
      );
      expect(completed.sourceId).toEqual(expect.any(String));
      expect(
        (await resumedService.complete(actor, session.id, checksum)).sourceId,
      ).toBe(completed.sourceId);
      record('COMPLETED_AND_IDEMPOTENT', {
        sourceId: completed.sourceId,
        fileAssetId: completed.fileAssetId,
        memoryUsage: process.memoryUsage(),
      });
      const ai = app.get(ProjectAiService);
      const indexed = await ai.index(actor, projects.B!, 'ALL');
      const source = indexed.sources.find(
        (item) => item.id === completed.sourceId,
      )!;
      expect(source.status).toBe('READY');
      expect(source.coverage).toMatchObject({
        coverage: 'PARTIAL',
        originalBytes: total,
        readBytes: 33554432,
      });
      record('INDEXED_PARTIAL_DERIVATIVE', {
        memoryUsage: process.memoryUsage(),
        sourceCoverage: source.coverage,
      });
      const download = await ai.downloadFile(
        actor,
        projects.B!,
        completed.sourceId!,
      );
      expect(await hashStream(download.data)).toEqual({
        checksum,
        bytes: total,
      });
      record('FULL_ORIGINAL_READBACK_HASH_PASS', {
        memoryUsage: process.memoryUsage(),
      });
      await expect(
        ai.downloadFile(actor, projects.A!, completed.sourceId!),
      ).rejects.toThrow();
      const cancel = await resumedService.initiate(actor, {
        ...input,
        idempotencyKey: randomUUID(),
      });
      const partOne = await hashStream(
        createReadStream(original, { start: 0, end: cancel.partSize - 1 }),
      );
      await resumedService.part(
        actor,
        cancel.id,
        1,
        partOne.checksum,
        createReadStream(original, { start: 0, end: cancel.partSize - 1 }),
      );
      await resumedService.abort(actor, cancel.id);
      const cancelled = await db.uploadSession.findUniqueOrThrow({
        where: { id: cancel.id },
      });
      expect(cancelled).toMatchObject({
        status: 'ABORTED',
        stagingReleasedAt: expect.any(Date),
        fileAssetId: null,
      });
      expect(
        await db.chatAiSourceIndex.count({
          where: { conversationId: conversation },
        }),
      ).toBe(1);
      expect(peakRss).toBeLessThan(1024 ** 3);
      const diskAfter = await statfs(isolated.testRoot, { bigint: true });
      record('FULL_10GB_STREAM_RESTART_HASH_READBACK_CANCEL_SCOPE_PASS', {
        status: 'PASS',
        completedAt: new Date().toISOString(),
        diskAvailableAfter: String(diskAfter.bavail * diskAfter.bsize),
        sourceCoverage: source.coverage,
        cancelledSessionId: cancel.id,
      });
    } catch (error) {
      record('FAILED', { status: 'FAIL', error: (error as Error).message });
      throw error;
    } finally {
      clearInterval(monitor);
      await rm(original, { force: true });
    }
  },
  1_200_000,
);

it('E02-5 constrains chat upload scope and bounded derivative chunks in PostgreSQL', async () => {
  expect(
    await db.$queryRaw<{ present: boolean }[]>`SELECT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
    AND table_name='UploadSession' AND column_name='aiConversationId'
  ) AS present`,
  ).toEqual([{ present: true }]);
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const upload = {
    organizationId,
    actorId: users.owner!.id,
    projectId: projects.B!,
    aiConversationId: conversation,
    idempotencyKey: randomUUID(),
    originalFilename: 'schema.csv',
    declaredSize: 1n,
    mimeType: 'text/csv',
    storageKey: organizationId + '/schema/' + randomUUID(),
    partSize: 1,
    totalParts: 1,
    expiresAt: new Date(Date.now() + 60_000),
  };
  const session = await db.uploadSession.create({ data: upload });
  for (const delta of [
    { projectId: projects.A! },
    { actorId: users.staff!.id },
    { organizationId: otherOrganizationId },
    { projectId: null },
    { stageOneDocumentId: randomUUID() },
    { idempotencyKey: null },
    { declaredSize: 10_000_000_001n },
  ])
    await expect(
      db.uploadSession.create({
        data: { ...upload, idempotencyKey: randomUUID(), ...delta },
      }),
    ).rejects.toThrow();
  await expect(db.uploadSession.create({ data: upload })).rejects.toThrow();
  const file = await db.fileAsset.create({
    data: {
      organizationId,
      uploadedById: users.owner!.id,
      originalFilename: 'schema.csv',
      storedFilename: randomUUID(),
      mimeType: 'text/csv',
      sizeBytes: 1n,
      storageKey: upload.storageKey,
      checksum: 'a'.repeat(64),
      category: 'AI_ATTACHMENT',
    },
  });
  const source = await db.chatAiSourceIndex.create({
    data: {
      organizationId,
      projectId: projects.B!,
      ownerId: users.owner!.id,
      conversationId: conversation,
      clientKey: randomUUID(),
      payloadHash: 'b'.repeat(64),
      fileAssetId: file.id,
      label: 'schema.csv',
      version: '1:' + file.checksum,
      provenance: 'UNCONFIRMED',
    },
  });
  const chunk = {
    sourceIndexId: source.id,
    organizationId,
    projectId: projects.B!,
    sourceVersion: source.version,
    parserVersion: 'utf8-stream-v1',
    ordinal: 0,
    text: 'ạ'.repeat(10_922),
    checksum: 'c'.repeat(64),
    locator: { bytes: [0, 32_766] },
  };
  await db.chatAiSourceChunk.create({ data: chunk });
  for (const delta of [
    { projectId: projects.A! },
    { organizationId: otherOrganizationId },
    { text: 'ạ'.repeat(10_923) },
    { text: '' },
    { ordinal: 1024 },
    { checksum: 'not-a-hash' },
  ])
    await expect(
      db.chatAiSourceChunk.create({ data: { ...chunk, ordinal: 1, ...delta } }),
    ).rejects.toThrow();
  await expect(db.chatAiSourceChunk.create({ data: chunk })).rejects.toThrow();
  expect(
    (await db.uploadSession.findUniqueOrThrow({ where: { id: session.id } }))
      .status,
  ).toBe('INITIATED');
  await db.uploadSession.update({
    where: { id: session.id },
    data: { fileAssetId: file.id, status: 'EXPIRED' },
  });
  expect(
    await app.get(UploadsService)['retireUnsubmittedAsset'](session.id),
  ).toBe(false);
  expect(
    (await db.fileAsset.findUniqueOrThrow({ where: { id: file.id } }))
      .deletedAt,
  ).toBeNull();
  const retainedBytes = () =>
    db.$transaction(async (tx) => {
      let permanentBytes: string | undefined;
      const capacity = {
        ...tx,
        $queryRaw: async (query: Prisma.Sql) => {
          const rows = await tx.$queryRaw<{ permanentBytes?: string }[]>(query);
          if (rows[0]?.permanentBytes) permanentBytes = rows[0].permanentBytes;
          return rows;
        },
      } as typeof tx;
      await assertFileCapacity(capacity, {
        organizationId,
        actorId: users.owner!.id,
        incomingBytes: 0n,
        staging: false,
        organizationLimitBytes: 10n ** 18n,
        globalLimitBytes: 10n ** 18n,
        unmeasuredFileBytes: 1n,
        actorStagingLimit: 100,
      });
      expect(permanentBytes).toEqual(expect.any(String));
      return permanentBytes;
    });
  const before = await retainedBytes();
  await db.uploadSession.update({
    where: { id: session.id },
    data: { stagingReleasedAt: new Date() },
  });
  await db.fileAsset.update({
    where: { id: file.id },
    data: { deletedAt: new Date() },
  });
  expect(await retainedBytes()).toBe(before);
});

it.each([
  { pagesTotal: 16, requestedPages: [11] },
  {
    pagesTotal: 20,
    requestedPages: Array.from({ length: 20 }, (_, i) => i + 1),
  },
])(
  'E03 reads $requestedPages of a $pagesTotal-page stored PDF and keeps evidence after reload and revocation',
  async ({ pagesTotal, requestedPages }) => {
    // Use the existing independent actor so the full upload corpus cannot exhaust this reader's quota.
    const connection = app.get(ChatGptConnectionService);
    const binding = await connection['read'](organizationId);
    if (!binding.owner) throw new Error('Synthetic SIWC binding missing');
    const staff = users.staff!.actor;
    await db.$transaction((tx) =>
      connection['save'](
        organizationId,
        {
          ...binding,
          owner: {
            userId: staff.userId,
            organizationId,
            organizationMembershipId: staff.organizationMembershipId,
            sessionId: staff.sessionId!,
          },
        },
        tx,
      ),
    );
    let temporaryGrant: string | undefined;
    try {
      temporaryGrant = (
        await db.chatProjectGrant.create({
          data: {
            organizationId,
            projectId: projects.A!,
            userId: staff.userId,
            grantedBy: users.owner!.id,
            actions: ['INVOKE'],
            roomCeiling: [],
            effectiveAt: new Date(Date.now() - 60000),
          },
        })
      ).id;
      await get('A', '', 'staff').expect(200);
      const { textPdfFixture } = await import('./document-fixtures');
      const bytes = await textPdfFixture(pagesTotal);
      const conversation = (
        await post(
          'B',
          '/conversations',
          {
            scope: 'ALL',
            clientKey: randomUUID(),
          },
          'staff',
        ).expect(201)
      ).body.id;
      const upload = await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .field('clientKey', randomUUID())
        .attach('file', bytes, {
          filename: 'Many-pages.pdf',
          contentType: 'application/pdf',
        });
      expect(upload.status, JSON.stringify(upload.body)).toBe(201);
      const sourceId = upload.body.id;
      await post('B', '/index', { scope: 'ALL' }, 'staff').expect(201);
      const index = await db.chatAiSourceIndex.findUniqueOrThrow({
        where: { id: sourceId },
      });
      expect(index.status).toBe('READY');
      expect(index.processingMetadata).toMatchObject({
        parserVersion: 'pdf-page-v1',
        scope: 'PDF_TEXT_ONLY',
        page: 1,
        coverage: 'PARTIAL',
        originalSent: false,
      });
      const turn = (
        await post(
          'B',
          `/conversations/${conversation}/answers`,
          {
            clientKey: randomUUID(),
            question: `Read pages ${requestedPages.join(', ')}; report missing pages.`,
            model: 'account-model',
            reasoning: 'default',
            mode: 'GENERAL',
            sourceIds: [sourceId],
          },
          'staff',
        ).expect(201)
      ).body;
      const handles: string[] = [];
      const transport = vi
        .spyOn(app.get(ChatGptConnectionService), 'respond')
        .mockImplementation(async (_actor, _revision, input) => {
          const items = (
            input as {
              input: { type?: string; call_id?: string; output?: string }[];
            }
          ).input;
          const results = requestedPages.map((page) =>
            items.find(
              (item) =>
                item.type === 'function_call_output' &&
                item.call_id === 'page-' + page,
            ),
          );
          for (const [offset, result] of results.entries()) {
            if (!result) continue;
            const page = requestedPages[offset]!;
            const parsed = JSON.parse(result.output!);
            expect(
              parsed.results[0].chunks.every(
                (chunk: { page: number }) => chunk.page === page,
              ),
            ).toBe(true);
            expect(parsed.results[0].extractionCoverage).toMatchObject({
              page,
              scope: 'PDF_TEXT_ONLY',
              originalSent: false,
            });
            expect(parsed.results[0].extractionCoverage.pageTextComplete).toBe(
              true,
            );
            expect(parsed.results[0].chunks[0].text).toContain('PAGE-' + page);
            handles.push(parsed.results[0].chunks[0].handle);
          }
          const calls = requestedPages.map((page) => ({
            type: 'function_call' as const,
            namespace: 'galaxy' as const,
            name: 'read_project_source' as const,
            call_id: 'page-' + page,
            arguments: JSON.stringify({
              sourceId,
              representation: 'text',
              startLine: 1,
              page,
            }),
          }));
          const read = results.every(Boolean);
          return {
            model: 'account-model',
            text: read
              ? `Read text pages ${requestedPages.join(', ')} only ${handles.map((handle) => `[${handle}]`).join(' ')}`
              : '',
            calls: read ? [] : calls,
            continuation: read ? [] : calls,
            usage: null,
            requestId: 'synthetic-page',
          };
        });
      try {
        const completed = (
          await post('B', `/answers/${turn.id}/run`, {}, 'staff').expect(201)
        ).body;
        const usage = (
          await db.chatAiAnswer.findUniqueOrThrow({ where: { id: turn.id } })
        ).usage as Prisma.JsonObject;
        expect({
          status: completed.status,
          errorCode: completed.errorCode,
          failureDiagnostic: usage.failureDiagnostic ?? null,
        }).toEqual({
          status: 'COMPLETED',
          errorCode: null,
          failureDiagnostic: null,
        });
      } finally {
        transport.mockRestore();
      }
      const saved = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: turn.id },
      });
      const tools = (
        saved.usage as unknown as {
          toolSources: {
            handle: string;
            file: { page: number; representation: string };
          }[];
        }
      ).toolSources;
      expect(tools).toHaveLength(requestedPages.length);
      expect(
        tools.every(
          (tool) =>
            requestedPages.includes(tool.file.page) &&
            tool.file.representation === 'PDF_TEXT_PAGE',
        ),
      ).toBe(true);
      const reloaded = (
        await get('B', `/conversations/${conversation}`, 'staff').expect(200)
      ).body.answers.at(-1);
      expect(reloaded.status).toBe('COMPLETED');
      expect(reloaded.pdfCoverage).toEqual([
        expect.objectContaining({
          sourceId,
          pagesTotal,
          completeTextPages: requestedPages,
          textCoverage:
            requestedPages.length === pagesTotal ? 'FULL' : 'PARTIAL',
          visualCoverage: 'UNKNOWN',
          modelRead: 'UNKNOWN',
        }),
      ]);
      expect(reloaded.sources).toContainEqual(
        expect.objectContaining({
          handle: tools[0]!.handle,
          page: requestedPages[0],
        }),
      );
      const dependency = await db.chatAiAnswerDependency.findUniqueOrThrow({
        where: {
          answerId_sourceIndexId: {
            answerId: turn.id,
            sourceIndexId: sourceId,
          },
        },
      });
      expect(new Set(dependency.handles)).toEqual(
        new Set(tools.map((tool) => tool.handle)),
      );
      await expect(
        db.chatAiAnswerDependency.update({
          where: {
            answerId_sourceIndexId: {
              answerId: turn.id,
              sourceIndexId: sourceId,
            },
          },
          data: {
            handles: Array.from(
              { length: 65 },
              (_, i) => 'T_' + i.toString(16).padStart(24, '0'),
            ),
          },
        }),
      ).rejects.toThrow(/23514[\s\S]*ChatAiAnswerDependency_handles_check/);
      await get(
        'A',
        `/answers/${turn.id}/sources/${tools[0]!.handle}`,
        'staff',
      ).expect(404);
      await db.fileAsset.update({
        where: { id: index.fileAssetId! },
        data: { checksum: 'a'.repeat(64) },
      });
      expect(
        (
          await get('B', `/conversations/${conversation}`, 'staff').expect(200)
        ).body.answers.at(-1).status,
      ).toBe('ACCESS_REVOKED');
    } finally {
      try {
        if (temporaryGrant)
          await db.chatProjectGrant.update({
            where: { id: temporaryGrant },
            data: { revokedAt: new Date() },
          });
      } finally {
        await db.$transaction((tx) =>
          connection['save'](organizationId, binding, tx),
        );
      }
    }
  },
  30000,
);

it('defers busy PDF indexing without exhausting attempts, but still caps actual parser failures', async () => {
  const { renderDocument } = await import('../src/project-chat/ai-document');
  const decoder = await import('../src/project-chat/ai-decoder-sandbox');
  const { AiError } = await import('../src/project-chat/ai-registry');
  const bytes = (
    await renderDocument(
      {
        format: 'pdf',
        title: 'Synthetic contention',
        blocks: [{ kind: 'paragraph', text: 'SOURCE AFTER CAPACITY FREES' }],
      },
      [],
    )
  ).bytes;
  const conversation = (
    await post(
      'B',
      '/conversations',
      {
        scope: 'ALL',
        clientKey: randomUUID(),
      },
      'staff',
    ).expect(201)
  ).body.id;
  const upload = async (filename: string) => {
    const uploaded = await request(app.getHttpServer())
      .post(base('B') + `/conversations/${conversation}/files`)
      .set('Cookie', users.staff!.cookie)
      .set('X-Chat-Actor', users.staff!.id)
      .field('clientKey', randomUUID())
      .attach('file', bytes, { filename, contentType: 'application/pdf' });
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    return uploaded.body.id as string;
  };
  const sourceId = await upload('Busy.pdf');
  const busy = vi
    .spyOn(decoder, 'pdfProcess')
    .mockRejectedValue(new AiError('DOCUMENT_DECODER_BUSY'));
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await post('B', '/index', { scope: 'ALL' }, 'staff').expect(201);
      expect(
        await db.chatAiSourceIndex.findUniqueOrThrow({
          where: { id: sourceId },
        }),
      ).toMatchObject({
        status: 'QUEUED',
        attempts: 0,
        leaseToken: null,
        leaseUntil: null,
        errorCode: null,
      });
    }
  } finally {
    busy.mockRestore();
  }
  await post('B', '/index', { scope: 'ALL' }, 'staff').expect(201);
  expect(
    await db.chatAiSourceIndex.findUniqueOrThrow({ where: { id: sourceId } }),
  ).toMatchObject({ status: 'READY', attempts: 1 });
  const badId = await upload('Actual-parser-failure.pdf');
  const failure = vi
    .spyOn(decoder, 'pdfProcess')
    .mockRejectedValue(new AiError('PDF_VALIDATION_UNAVAILABLE'));
  try {
    for (let attempt = 0; attempt < 4; attempt++)
      await post('B', '/index', { scope: 'ALL' }, 'staff').expect(201);
    expect(
      await db.chatAiSourceIndex.findUniqueOrThrow({ where: { id: badId } }),
    ).toMatchObject({
      status: 'ERROR',
      attempts: 3,
      errorCode: 'PDF_VALIDATION_UNAVAILABLE',
    });
  } finally {
    failure.mockRestore();
  }
}, 30000);

it.each(['deadline', 'cancel'] as const)(
  'settles SIWC %s even when connection work ignores abort, and rejects its late answer',
  async (kind) => {
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const queued = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'Synthetic bounded provider wait',
        model: 'account-model',
        clientKey: randomUUID(),
        searchMode: 'PROJECT_ONLY',
      }).expect(201)
    ).body;
    const connection = app.get(ChatGptConnectionService);
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deadline = new AbortController();
    const transport = vi
      .spyOn(connection, 'respond')
      .mockImplementation(async () => {
        entered();
        if (kind === 'deadline') setTimeout(() => deadline.abort(), 30);
        await held;
        return {
          text: 'LATE ANSWER MUST NOT PUBLISH',
          model: 'account-model',
          requestId: 'synthetic-late',
          calls: [],
          usage: null,
          continuation: [],
        };
      });
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const scaled = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) =>
        kind === 'deadline' && ms >= 110000 && ms <= 300000
          ? deadline.signal
          : timeout(ms),
      );
    const pending = post('B', `/answers/${queued.id}/run`, {}).then((r) => r);
    try {
      if (kind === 'cancel') {
        await Promise.race([
          started,
          pending.then((result) => {
            throw new Error('Provider did not enter: ' + result.body.status);
          }),
        ]);
        await post('B', `/answers/${queued.id}/cancel`, {}).expect(201);
      }
      const result = await Promise.race([
        pending,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(
        result,
        'run must settle independently of an abort-ignoring connection promise',
      ).not.toBeNull();
      expect(result!.body).toMatchObject({
        status: kind === 'cancel' ? 'CANCELLED' : 'FAILED',
        answer: null,
        ...(kind === 'deadline' ? { errorCode: 'PROVIDER_TIMEOUT' } : {}),
      });
      release();
      await pending;
      expect(
        await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }),
      ).toMatchObject({
        status: kind === 'cancel' ? 'CANCELLED' : 'FAILED',
        answer: null,
      });
      await post('B', `/answers/${queued.id}/run`, {}).expect(201);
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await pending;
      scaled.mockRestore();
      transport.mockRestore();
    }
  },
  10000,
);

it.each([false, true])(
  'bounds the total SIWC budget across dependent rounds (exceeded=%s)',
  async (exceeded) => {
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const queued = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'Synthetic dependent calculations',
        model: 'account-model',
        clientKey: randomUUID(),
        searchMode: 'PROJECT_ONLY',
      }).expect(201)
    ).body;
    const previous = globalThis.fetch;
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const totalDeadline = new AbortController();
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    const scaled = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) =>
        ms === 300000
          ? totalDeadline.signal
          : timeout(ms === 110000 ? 2200 : ms),
      );
    let round = 0;
    let providerError: unknown;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      try {
        const body = JSON.parse(String(init.body));
        expect(body.model).toBe('account-model');
        expect(body.reasoning).toBeUndefined();
        const current = round++;
        if (!current)
          totalTimer = setTimeout(() => totalDeadline.abort(), 6000);
        if (current) {
          const result = body.input.find(
            (item: { type: string; call_id?: string }) =>
              item.type === 'function_call_output' &&
              item.call_id === 'budget-' + (current - 1),
          );
          expect(JSON.parse(result.output)).toMatchObject({ value: '3.00' });
        }
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const output =
          current < (exceeded ? 8 : 2)
            ? [
                {
                  type: 'function_call',
                  namespace: 'galaxy',
                  name: 'calculate',
                  call_id: 'budget-' + current,
                  arguments: JSON.stringify({
                    operation: 'add',
                    operands: [String(current + 1), String(2 - current)],
                    decimalPlaces: 2,
                  }),
                },
              ]
            : [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    { type: 'output_text', text: 'SYNTHETIC DEPENDENT FINAL' },
                  ],
                },
              ];
        return new Response(
          'data: ' +
            JSON.stringify({
              type: 'response.completed',
              response: { status: 'completed', model: body.model, output },
            }) +
            '\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      } catch (error) {
        providerError = error;
        throw error;
      }
    });
    try {
      const completed = (
        await post('B', `/answers/${queued.id}/run`, {}).expect(201)
      ).body;
      if (providerError) throw providerError;
      if (exceeded) {
        expect(completed).toMatchObject({
          status: 'FAILED',
          answer: null,
          errorCode: 'PROVIDER_TIMEOUT',
        });
        expect(round).toBeLessThan(9);
        return;
      }
      expect(completed.errorCode).toBeNull();
      expect(completed).toMatchObject({
        status: 'COMPLETED',
        answer: expect.stringContaining('SYNTHETIC DEPENDENT FINAL'),
      });
      expect(round).toBe(3);
      const saved = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      expect(
        (saved.usage as { siwcRequests: unknown[] }).siwcRequests,
      ).toHaveLength(3);
    } finally {
      clearTimeout(totalTimer);
      scaled.mockRestore();
      vi.stubGlobal('fetch', previous);
    }
  },
  20000,
);

it('records the overall deadline after an accepted provider result as timeout and never replays inference', async () => {
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const queued = (
    await post('B', `/conversations/${conversation}/answers`, {
      question: 'Synthetic post-provider expiry',
      model: 'account-model',
      clientKey: randomUUID(),
      searchMode: 'PROJECT_ONLY',
    }).expect(201)
  ).body;
  const globalDeadline = new AbortController();
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const scaled = vi
    .spyOn(AbortSignal, 'timeout')
    .mockImplementation((ms) =>
      ms === 300000 ? globalDeadline.signal : timeout(ms),
    );
  const connection = app.get(ChatGptConnectionService);
  const transport = vi.spyOn(connection, 'respond').mockResolvedValue({
    text: 'FINAL MUST NOT PUBLISH',
    model: 'account-model',
    requestId: 'synthetic-post-expiry',
    calls: [],
    usage: null,
    continuation: [],
  });
  const owner = connection.owner.bind(connection);
  const authority = vi
    .spyOn(connection, 'owner')
    .mockImplementation(async (...args) => {
      const result = await owner(...args);
      if (transport.mock.calls.length)
        globalDeadline.abort(
          new DOMException('Synthetic overall deadline', 'TimeoutError'),
        );
      return result;
    });
  try {
    const result = (
      await post('B', `/answers/${queued.id}/run`, {}).expect(201)
    ).body;
    expect(result).toMatchObject({
      status: 'FAILED',
      errorCode: 'PROVIDER_TIMEOUT',
      answer: null,
    });
    await post('B', `/answers/${queued.id}/run`, {}).expect(201);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }))
        .answer,
    ).toBeNull();
  } finally {
    authority.mockRestore();
    transport.mockRestore();
    scaled.mockRestore();
  }
}, 10000);

it('exports completed Markdown durably with current actor and Project authority, without another provider call', async () => {
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const question = '  Xuất Markdown tiếng Việt 😀\nGiữ câu hỏi nguyên bản.\t ';
  const queued = (
    await post('B', `/conversations/${conversation}/answers`, {
      question,
      model: 'account-model',
      clientKey: randomUUID(),
    }).expect(201)
  ).body;
  const path = `/answers/${queued.id}/markdown`;
  await get('B', path).expect(404);
  const done = (await post('B', `/answers/${queued.id}/run`, {}).expect(201))
    .body;
  expect({ status: done.status, errorCode: done.errorCode }).toEqual({
    status: 'COMPLETED',
    errorCode: null,
  });
  const before = payloads.length;
  const exported = await get('B', path).expect(200);
  expect(exported.headers['content-type']).toContain('text/markdown');
  expect(exported.headers['content-disposition']).toBe(
    `attachment; filename="Galaxy-AI-${queued.id}.md"`,
  );
  expect(exported.headers['cache-control']).toBe('private, no-store');
  expect(exported.text).toContain('BẢN NHÁP');
  expect(exported.text).toContain(question);
  expect(exported.text).toContain(done.answer);
  const history = (await get('B', `/conversations/${conversation}`).expect(200))
    .body;
  expect(history.answers.at(-1).markdownUrl).toBe(base('B') + path);
  expect((await get('B', path).expect(200)).text).toBe(exported.text);
  await get('A', path).expect(404);
  await get('B', path, 'staff').expect(404);
  const grant = await db.chatProjectGrant.findUniqueOrThrow({
    where: { id: grants.B! },
  });
  try {
    await db.chatProjectGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
    await get('B', path).expect(404);
  } finally {
    await db.chatProjectGrant.update({
      where: { id: grant.id },
      data: { revokedAt: grant.revokedAt },
    });
  }
  await db.chatAiAnswer.update({
    where: { id: queued.id },
    data: { status: 'FAILED', answer: null },
  });
  await get('B', path).expect(404);
  expect(payloads.length).toBe(before);
}, 30000);

// The existing independent actor keeps queue acceptance separate from the owner corpus's daily quota.
const e03Post = (path: string, body: object) => post('B', path, body, 'staff');
const e03Get = (path: string) => get('B', path, 'staff');
let restoreDurableBinding: (() => Promise<unknown>) | undefined;
beforeEach(async ({ task }) => {
  if (
    !task.name.startsWith('E03 durable') &&
    !task.name.startsWith('E04 durable')
  )
    return;
  const connection = app.get(ChatGptConnectionService);
  const binding = await connection['read'](organizationId);
  const staff = users.staff!.actor;
  restoreDurableBinding = () =>
    db.$transaction((tx) => connection['save'](organizationId, binding, tx));
  await db.$transaction((tx) =>
    connection['save'](
      organizationId,
      {
        ...binding,
        owner: {
          userId: staff.userId,
          organizationId,
          organizationMembershipId: staff.organizationMembershipId,
          sessionId: staff.sessionId!,
        },
      },
      tx,
    ),
  );
});
afterEach(async () => {
  if (!restoreDurableBinding) return;
  try {
    await restoreDurableBinding();
  } finally {
    restoreDurableBinding = undefined;
  }
});

it.each(['NORMAL', 'DEEP'] as const)(
  'E03 durable %s saves the question and queue, acknowledges retries, and claims once',
  async (runMode) => {
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const question =
      '  Keep all conditions in this synthetic durable question.\nNo web.  ';
    const connection = app.get(ChatGptConnectionService);
    const transport = vi.spyOn(connection, 'respond').mockResolvedValue({
      model: 'account-model',
      text: 'Synthetic durable result',
      requestId: 'synthetic-durable',
      calls: [],
      continuation: [],
      usage: null,
    });
    try {
      const queued = (
        await e03Post(`/conversations/${conversation}/answers`, {
          question,
          model: 'account-model',
          searchMode: 'PROJECT_ONLY',
          runMode,
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      const workflow = workflowMetadata(row.usage)!;
      expect(queued.run).toEqual({
        runId: queued.id,
        mode: runMode,
        phase: 'QUEUED',
        deadlineAt: workflow.deadlineAt,
        heartbeatAt: null,
      });
      expect(workflow.mode).toBe(runMode);
      expect(workflow.deadlineAt).toBeNull();
      expect(row).toMatchObject({
        question,
        status: 'QUEUED',
        providerStartedAt: null,
      });
      const ack = (await e03Post(`/answers/${queued.id}/run`, {}).expect(201))
        .body;
      expect(ack).toEqual({
        id: queued.id,
        runId: queued.id,
        status: 'QUEUED',
        deadlineAt: workflow.deadlineAt,
      });
      expect(
        (await e03Post(`/answers/${queued.id}/run`, {}).expect(201)).body,
      ).toEqual(ack);
      expect(transport).not.toHaveBeenCalled();
      expect(
        (
          await e03Get(`/conversations/${conversation}`).expect(200)
        ).body.answers.at(-1),
      ).toMatchObject({ question, status: 'QUEUED' });
      await Promise.all([
        app.get(ProjectAiService).tickRuns(),
        app.get(ProjectAiService).tickRuns(),
      ]);
      expect(transport).toHaveBeenCalledTimes(1);
      const completed = (
        await e03Get(`/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1);
      expect(completed).toMatchObject({
        question,
        status: 'COMPLETED',
        answer: 'Synthetic durable result',
      });
      await e03Post(`/answers/${queued.id}/run`, {}).expect(201);
      await app.get(ProjectAiService).tickRuns();
      expect(transport).toHaveBeenCalledTimes(1);
      await get('A', `/conversations/${conversation}`).expect(404);
    } finally {
      transport.mockRestore();
    }
  },
  15000,
);

it('E03 durable independent workers enforce two owner claims across Projects using the existing SIWC fence', async () => {
  const actor = users.staff!.actor;
  const grant = await db.chatProjectGrant.create({
    data: {
      organizationId,
      projectId: projects.C!,
      userId: actor.userId,
      grantedBy: users.owner!.id,
      actions: ['INVOKE'],
      roomCeiling: [],
      effectiveAt: new Date(Date.now() - 60000),
    },
  });
  const ai = app.get(ProjectAiService);
  const other = new ProjectAiService(
    ai['db'],
    ai['chat'],
    ai['storage'],
    ai['access'],
    ai['files'],
    ai['stageTwo'],
    ai['tasks'],
    ai['chatgpt'],
    ai['memory'],
    ai['historyService'],
    ai['stageOne'],
    ai['projects'],
  );
  let releaseClaims!: () => void;
  const claimGate = new Promise<void>((resolve) => (releaseClaims = resolve));
  let releaseProvider!: () => void;
  const providerGate = new Promise<void>(
    (resolve) => (releaseProvider = resolve),
  );
  const connection = app.get(ChatGptConnectionService);
  const originalOwner = connection.owner.bind(connection);
  let arrivals = 0;
  let owner: MockInstance<ChatGptConnectionService['owner']> | undefined;
  let transport: MockInstance<ChatGptConnectionService['respond']> | undefined;
  let workers: Promise<unknown>[] = [];
  const queued: string[] = [];
  try {
    for (const key of ['B', 'C', 'B']) {
      const conversation = (
        await post(
          key,
          '/conversations',
          { scope: 'ALL', clientKey: randomUUID() },
          'staff',
        ).expect(201)
      ).body.id;
      queued.push(
        (
          await post(
            key,
            `/conversations/${conversation}/answers`,
            {
              question: 'Synthetic independent worker claim in Project ' + key,
              model: 'account-model',
              searchMode: 'PROJECT_ONLY',
              runMode: 'DEEP',
              clientKey: randomUUID(),
            },
            'staff',
          ).expect(201)
        ).body.id as string,
      );
    }
    owner = vi
      .spyOn(connection, 'owner')
      .mockImplementation(async (...args) => {
        if (arrivals++ < 2) {
          if (arrivals === 2) releaseClaims();
          await claimGate;
        }
        return originalOwner(...args);
      });
    transport = vi.spyOn(connection, 'respond').mockImplementation(async () => {
      await providerGate;
      return {
        model: 'account-model',
        text: 'Synthetic independent worker result',
        requestId: 'synthetic-independent-worker',
        calls: [],
        continuation: [],
        usage: null,
      };
    });
    workers = [
      ai['runChatGpt'](actor, projects.B!, queued[0]!),
      other['runChatGpt'](actor, projects.C!, queued[1]!),
      ai['runChatGpt'](actor, projects.B!, queued[2]!),
    ];
    await Promise.race([
      vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2), {
        timeout: 6000,
      }),
      Promise.all(workers).then(() => {
        throw new Error('Independent workers completed without provider entry');
      }),
    ]);
    const deferred = await Promise.race(workers);
    expect(deferred).toMatchObject({ status: 'QUEUED' });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      (
        await db.chatAiAnswer.findMany({
          where: { id: { in: queued } },
          select: { status: true },
        })
      )
        .map((row) => row.status)
        .sort(),
    ).toEqual(['QUEUED', 'RUNNING', 'RUNNING']);
    releaseProvider();
    await Promise.all(workers);
    for (const [index, worker] of [ai, other, ai].entries())
      await worker['runChatGpt'](
        actor,
        projects[index === 1 ? 'C' : 'B']!,
        queued[index]!,
      );
    expect(transport).toHaveBeenCalledTimes(3);
    expect(
      await db.chatAiAnswer.count({
        where: { id: { in: queued }, status: 'COMPLETED' },
      }),
    ).toBe(3);
  } finally {
    releaseClaims();
    releaseProvider();
    await Promise.allSettled(workers);
    await db.chatAiAnswer.updateMany({
      where: {
        organizationId,
        ownerId: actor.userId,
        id: { in: queued },
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: {
        status: 'CANCELLED',
        errorCode: 'CANCELLED',
        completedAt: new Date(),
        leaseUntil: null,
      },
    });
    owner?.mockRestore();
    transport?.mockRestore();
    await db.chatProjectGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
  }
}, 15000);

it('E03 durable Stop fences a queued run before any provider dispatch', async () => {
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const queued = (
    await e03Post(`/conversations/${conversation}/answers`, {
      question: 'Synthetic queued Stop',
      model: 'account-model',
      searchMode: 'PROJECT_ONLY',
      runMode: 'DEEP',
      clientKey: randomUUID(),
    }).expect(201)
  ).body;
  const transport = vi.spyOn(app.get(ChatGptConnectionService), 'respond');
  try {
    await e03Post(`/answers/${queued.id}/cancel`, {}).expect(201);
    await app.get(ProjectAiService).tickRuns();
    expect(transport).not.toHaveBeenCalled();
    expect(
      await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }),
    ).toMatchObject({
      status: 'CANCELLED',
      providerStartedAt: null,
      answer: null,
    });
    expect(
      (
        await e03Get(`/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1),
    ).toMatchObject({ question: 'Synthetic queued Stop', status: 'CANCELLED' });
  } finally {
    transport.mockRestore();
  }
}, 15000);

it('E03 durable whole workbook plan reads every sheet before the first private provider request', async () => {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const quote = workbook.addWorksheet('Quote');
  quote.getCell('A1').value = 'Amount';
  quote.getCell('A2').value = 12.5;
  quote.getCell('A3').value = { formula: 'A2*2', result: 25 };
  workbook.addWorksheet('Last').getCell('A1').value = 'LAST-SHEET-0007392';
  workbook.addWorksheet('Empty');
  const long = workbook.addWorksheet('Long');
  for (let column = 1; column <= 8; column++)
    long.getCell(1, column).value = 'x'.repeat(4000);
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const sourceId = (
    await request(app.getHttpServer())
      .post(base('B') + `/conversations/${conversation}/files`)
      .set('Cookie', users.staff!.cookie)
      .set('X-Chat-Actor', users.staff!.id)
      .field('clientKey', randomUUID())
      .attach('file', Buffer.from(await workbook.xlsx.writeBuffer()), {
        filename: 'Full workbook.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201)
  ).body.id;
  const question =
    'Read the entire attached workbook, including its last fact and cached total.';
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockImplementation(async (_actor, _revision, input) => {
      const text = JSON.stringify((input as { input: unknown[] }).input);
      expect(text).toContain('LAST-SHEET-0007392');
      expect(text).toContain('recalculated');
      expect(text).toContain('A2*2');
      expect(text).toContain('25');
      expect(text).toContain(question);
      return {
        model: 'account-model',
        text: 'All sheets extracted; cached total 25, formula not executed.',
        calls: [],
        continuation: [],
        usage: null,
        requestId: 'synthetic-whole-workbook-plan',
      };
    });
  try {
    const queued = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question,
        model: 'account-model',
        sourceIds: [sourceId],
        searchMode: 'PROJECT_ONLY',
        runMode: 'DEEP',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await app.get(ProjectAiService).tickRuns();
    const done = (
      await e03Get(`/conversations/${conversation}`).expect(200)
    ).body.answers.at(-1);
    expect(done.id).toBe(queued.id);
    expect(done.status).toBe('COMPLETED');
    expect(done.xlsxCoverage[0]).toMatchObject({
      sourceId,
      textCoverage: 'FULL',
      modelRead: 'UNKNOWN',
      formulaEvaluation: 'NOT_RUN',
      sheets: [
        {
          name: 'Quote',
          cellsRead: 3,
          cellsTotal: 3,
          completeRows: 3,
          textCoverage: 'FULL',
        },
        {
          name: 'Last',
          cellsRead: 1,
          cellsTotal: 1,
          completeRows: 1,
          textCoverage: 'FULL',
        },
        {
          name: 'Empty',
          cellsRead: 0,
          cellsTotal: 0,
          completeRows: 0,
          textCoverage: 'FULL',
        },
        {
          name: 'Long',
          cellsRead: 8,
          cellsTotal: 8,
          completeRows: 1,
          textCoverage: 'FULL',
        },
      ],
    });
    expect(done.question).toBe(question);
    expect(done.attachments[0].sourceId).toBe(sourceId);
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    transport.mockRestore();
  }
}, 30000);

it('E03 durable whole PDF plan reads all required pages before the first private provider request', async () => {
  const { textPdfFixture } = await import('./document-fixtures');
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const sourceId = (
    await request(app.getHttpServer())
      .post(base('B') + `/conversations/${conversation}/files`)
      .set('Cookie', users.staff!.cookie)
      .set('X-Chat-Actor', users.staff!.id)
      .field('clientKey', randomUUID())
      .attach('file', await textPdfFixture(3), {
        filename: 'Planned coverage.pdf',
        contentType: 'application/pdf',
      })
      .expect(201)
  ).body.id;
  const question =
    'Đọc toàn bộ đúng PDF đính kèm, bao gồm dữ kiện ở trang cuối.';
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockImplementation(async (_actor, _revision, input) => {
      const text = JSON.stringify((input as { input: unknown[] }).input);
      expect(text).toContain('PAGE-3');
      expect(text).toContain('PAGE-1');
      expect(text).toContain(question);
      return {
        model: 'account-model',
        text: 'Checked all three extracted text pages.',
        calls: [],
        continuation: [],
        usage: null,
        requestId: 'synthetic-whole-pdf-plan',
      };
    });
  try {
    const queued = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question,
        model: 'account-model',
        sourceIds: [sourceId],
        searchMode: 'PROJECT_ONLY',
        runMode: 'DEEP',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await app.get(ProjectAiService).tickRuns();
    const done = (
      await e03Get(`/conversations/${conversation}`).expect(200)
    ).body.answers.at(-1);
    expect(done.id).toBe(queued.id);
    expect(done.status).toBe('COMPLETED');
    expect(done.pdfCoverage[0]).toMatchObject({
      sourceId,
      pagesTotal: 3,
      completeTextPages: [1, 2, 3],
      textCoverage: 'FULL',
      modelRead: 'UNKNOWN',
      visualCoverage: 'UNKNOWN',
    });
    expect(done.question).toBe(question);
    expect(done.attachments[0].sourceId).toBe(sourceId);
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    transport.mockRestore();
  }
}, 30000);

it.each(['recovered', 'still partial'] as const)(
  'E03 durable document issue projection reflects current coverage (%s)',
  async (condition) => {
    const { textPdfFixture } = await import('./document-fixtures');
    const { AiError } = await import('../src/project-chat/ai-registry');
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .field('clientKey', randomUUID())
        .attach('file', await textPdfFixture(2), {
          filename: 'Recovered coverage.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body.id;
    const ai = app.get(ProjectAiService);
    const original = ai['sourceTool'].bind(ai);
    let failed = false;
    const reader = vi
      .spyOn(ai as unknown as { sourceTool: typeof original }, 'sourceTool')
      .mockImplementation(async (...args) => {
        if (
          !failed &&
          args[4] === 'read_project_source' &&
          (args[5] as { page?: number }).page === 2
        ) {
          failed = true;
          throw new AiError('SOURCE_TEXT_UNAVAILABLE');
        }
        return original(...args);
      });
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async (_actor, _revision, input) => {
        const retried = JSON.stringify(input).includes('recover-page-two');
        const calls =
          condition === 'recovered' && !retried
            ? [
                {
                  type: 'function_call' as const,
                  namespace: 'galaxy' as const,
                  name: 'read_project_source' as const,
                  call_id: 'recover-page-two',
                  arguments: JSON.stringify({
                    sourceId,
                    representation: 'text',
                    page: 2,
                    startLine: 1,
                    cursor: null,
                  }),
                },
              ]
            : [];
        return {
          model: 'account-model',
          text: calls.length
            ? ''
            : 'Useful extracted text; no visual reading claimed.',
          calls,
          continuation: calls,
          usage: null,
          requestId: 'synthetic-coverage-recovery',
        };
      });
    try {
      const queued = (
        await e03Post(`/conversations/${conversation}/answers`, {
          question: 'Read every page of this PDF.',
          model: 'account-model',
          sourceIds: [sourceId],
          searchMode: 'PROJECT_ONLY',
          runMode: 'DEEP',
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      await ai.tickRuns();
      const done = (
        await e03Get(`/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1);
      expect(failed).toBe(true);
      expect(done.pdfCoverage[0].textCoverage).toBe(
        condition === 'recovered' ? 'FULL' : 'PARTIAL',
      );
      expect(done.status).toBe(
        condition === 'recovered' ? 'COMPLETED' : 'PARTIAL',
      );
      expect(done.documentReadIssues).toHaveLength(
        condition === 'recovered' ? 0 : 1,
      );
      const saved = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      expect((saved.usage as Prisma.JsonObject).documentReadIssues).toEqual([
        expect.objectContaining({
          sourceId,
          page: 2,
          code: 'SOURCE_TEXT_UNAVAILABLE',
        }),
      ]);
    } finally {
      reader.mockRestore();
      transport.mockRestore();
    }
  },
  30000,
);

it.each(['whole', 'selected page'] as const)(
  'E03 durable verifies %s PDF coverage before publishing a premature provider final',
  async (scope) => {
    const { textPdfFixture } = await import('./document-fixtures');
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .field('clientKey', randomUUID())
        .attach('file', await textPdfFixture(3), {
          filename: 'Required coverage.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body.id;
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async (_actor, _revision, input) => {
        const outputs = (
          input as {
            input: { type?: string; output?: string }[];
          }
        ).input.filter((item) => item.type === 'function_call_output');
        const calls = outputs.length
          ? []
          : [
              {
                type: 'function_call' as const,
                namespace: 'galaxy' as const,
                name: 'read_project_source' as const,
                call_id: 'premature-page-one',
                arguments: JSON.stringify({
                  sourceId,
                  representation: 'text',
                  page: 1,
                  startLine: 1,
                  cursor: null,
                }),
              },
            ];
        return {
          model: 'account-model',
          text: outputs.length
            ? 'PAGE-1 quantity 2 price 12.50 total 25.00; provider prematurely claims completion.'
            : '',
          calls,
          continuation: calls,
          usage: null,
          requestId: 'synthetic-premature-final',
        };
      });
    try {
      const question =
        scope === 'whole'
          ? 'Read every page of the attached PDF, including the last-page fact; report the whole document.'
          : 'Read only page 1 of this PDF; do not read pages 2 or 3.';
      const queued = (
        await e03Post(`/conversations/${conversation}/answers`, {
          question,
          model: 'account-model',
          sourceIds: [sourceId],
          searchMode: 'PROJECT_ONLY',
          runMode: 'DEEP',
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      await app.get(ProjectAiService).tickRuns();
      const done = (
        await e03Get(`/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1);
      expect(done.id).toBe(queued.id);
      expect(done.question).toBe(question);
      expect(done.attachments[0].sourceId).toBe(sourceId);
      expect(done.answer).toContain('PAGE-1');
      const saved = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      const pin = (saved.usage as Prisma.JsonObject)
        .request as Prisma.JsonObject;
      expect(pin.requiredDocuments).toEqual(
        scope === 'whole'
          ? [
              {
                ...(pin.originalSourceVersions as Prisma.JsonObject[])[0],
                format: 'PDF',
              },
            ]
          : [],
      );
      expect(done.pdfCoverage[0]).toMatchObject({
        pagesTotal: 3,
        visualCoverage: 'UNKNOWN',
        modelRead: 'UNKNOWN',
      });
      if (scope === 'selected page') {
        expect(done.status).toBe('COMPLETED');
        expect(done.pdfCoverage[0].completeTextPages).toEqual([1]);
      } else if (done.pdfCoverage[0].textCoverage === 'FULL') {
        expect(done.status).toBe('COMPLETED');
        expect(done.pdfCoverage[0].completeTextPages).toEqual([1, 2, 3]);
      } else {
        expect(done.status).toBe('PARTIAL');
        expect(done.errorCode).toBe('DOCUMENT_COVERAGE_INCOMPLETE');
        expect(done.uncertainty).not.toBe('');
        expect(done.pdfCoverage[0].missingTextRanges).toEqual([
          { from: 2, to: 3 },
        ]);
      }
      expect(done.run.deadlineAt).toBe(queued.run.deadlineAt);
      const dispatches = transport.mock.calls.length;
      await app.get(ProjectAiService).tickRuns();
      expect(transport).toHaveBeenCalledTimes(dispatches);
    } finally {
      transport.mockRestore();
    }
  },
  30000,
);

it.each(['unchanged', 'version changed', 'grant revoked'] as const)(
  'E03 durable whole-document follow-up inherits the last original after an empty attachment turn (%s)',
  async (condition) => {
    const { textPdfFixture } = await import('./document-fixtures');
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .field('clientKey', randomUUID())
        .attach('file', await textPdfFixture(3), {
          filename: 'Follow-up original.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body.id;
    const source = await db.chatAiSourceIndex.findUniqueOrThrow({
      where: { id: sourceId },
    });
    const grant = await db.chatProjectGrant.findFirstOrThrow({
      where: {
        organizationId,
        projectId: projects.B!,
        userId: users.staff!.id,
        actions: { has: 'INVOKE' },
        revokedAt: null,
      },
    });
    const original = await db.fileAsset.findUniqueOrThrow({
      where: { id: source.fileAssetId! },
    });
    const transport = vi.spyOn(app.get(ChatGptConnectionService), 'respond');
    try {
      for (const withAttachment of [true, false]) {
        const saved = (
          await e03Post(`/conversations/${conversation}/answers`, {
            question: withAttachment
              ? 'Read only page 1 of the attached PDF.'
              : 'Hello, retain this conversation.',
            model: 'account-model',
            sourceIds: withAttachment ? [sourceId] : [],
            searchMode: 'PROJECT_ONLY',
            runMode: 'DEEP',
            clientKey: randomUUID(),
          }).expect(201)
        ).body;
        const row = await db.chatAiAnswer.findUniqueOrThrow({
          where: { id: saved.id },
        });
        expect(row.invokeGrantId).toBe(grant.id);
        expect(grant.userId).toBe(users.staff!.id);
      }
      if (condition === 'version changed')
        await db.$transaction([
          db.fileAsset.update({
            where: { id: original.id },
            data: { version: original.version + 1 },
          }),
          db.chatAiSourceIndex.update({
            where: { id: sourceId },
            data: {
              version: `${original.version + 1}:${original.checksum}`,
            },
          }),
        ]);
      if (condition === 'grant revoked')
        await db.chatProjectGrant.update({
          where: { id: grant.id },
          data: { revokedAt: new Date() },
        });
      const input = {
        question:
          'Read every page of the attached PDF and report the whole document.',
        model: 'account-model',
        sourceIds: [],
        searchMode: 'PROJECT_ONLY',
        runMode: 'DEEP',
        clientKey: randomUUID(),
      };
      const count = await db.chatAiAnswer.count({
        where: { conversationId: conversation },
      });
      const response = await e03Post(
        `/conversations/${conversation}/answers`,
        input,
      );
      if (condition === 'unchanged') {
        expect(response.status).toBe(201);
        const saved = await db.chatAiAnswer.findUniqueOrThrow({
          where: { id: response.body.id },
        });
        const pin = (saved.usage as Prisma.JsonObject)
          .request as Prisma.JsonObject;
        expect(pin.sourceIds).toEqual([sourceId]);
        expect(pin.requiredDocuments).toEqual([
          {
            ...(pin.originalSourceVersions as Prisma.JsonObject[])[0],
            format: 'PDF',
          },
        ]);
        expect(pin.documentReadScope).toBe('ALL');
        const retry = await e03Post(
          `/conversations/${conversation}/answers`,
          input,
        ).expect(201);
        expect(retry.body.id).toBe(saved.id);
        expect(
          await db.chatAiAnswer.count({
            where: { conversationId: conversation },
          }),
        ).toBe(count + 1);
        const history = (
          await e03Get(`/conversations/${conversation}`).expect(200)
        ).body;
        expect(history.answers.at(-1).attachments).toMatchObject([
          { sourceId },
        ]);
      } else {
        expect(response.status).toBe(
          condition === 'version changed' ? 409 : 404,
        );
        if (condition === 'version changed')
          expect(response.body.message).toBe('SOURCE_VERSION_CHANGED');
        expect(
          await db.chatAiAnswer.count({
            where: { conversationId: conversation },
          }),
        ).toBe(count);
      }
      expect(transport).not.toHaveBeenCalled();
    } finally {
      try {
        try {
          await db.$transaction([
            db.fileAsset.update({
              where: { id: original.id },
              data: { version: original.version },
            }),
            db.chatAiSourceIndex.update({
              where: { id: sourceId },
              data: { version: source.version },
            }),
          ]);
        } finally {
          await db.chatProjectGrant.update({
            where: { id: grant.id },
            data: { revokedAt: grant.revokedAt },
          });
        }
      } finally {
        try {
          const pending = {
            conversationId: conversation,
            organizationId,
            ownerId: users.staff!.id,
            status: { in: ['QUEUED', 'RUNNING'] },
          };
          for (const row of await db.chatAiAnswer.findMany({
            where: pending,
            select: { id: true },
          }))
            await e03Post(`/answers/${row.id}/cancel`, {}).expect(201);
          expect(await db.chatAiAnswer.count({ where: pending })).toBe(0);
          expect(transport).not.toHaveBeenCalled();
        } finally {
          transport.mockRestore();
        }
      }
    }
  },
  30000,
);

it('E03 durable packs completed calculations across the item limit while retaining native PDF checkpoint proofs', async () => {
  const { scanPdfFixture } = await import('./document-fixtures');
  const original = scanPdfFixture();
  const checksum = createHash('sha256').update(original).digest('hex');
  const connection = app.get(ChatGptConnectionService);
  const key =
    'siwc.capabilities.' +
    organizationId +
    '.' +
    createHash('sha256').update('account-model').digest('hex');
  const prior = await db.systemSetting.findUnique({ where: { key } });
  const profile = {
    generation: 'p1-fixture-generation',
    model: 'account-model',
    reasoningModes: ['default', 'max'],
    effortEvidence: { max: 'REQUEST_ACCEPTED' },
    webSearch: false,
    imageInput: false,
    pdfInput: true,
    receipts: [],
    checkedAt: new Date().toISOString(),
  };
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value: profile },
    update: { value: profile },
  });
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const sourceId = (
    await request(app.getHttpServer())
      .post(base('B') + `/conversations/${conversation}/files`)
      .set('Cookie', users.staff!.cookie)
      .set('X-Chat-Actor', users.staff!.id)
      .field('clientKey', randomUUID())
      .attach('file', original, {
        filename: 'Native.pdf',
        contentType: 'application/pdf',
      })
      .expect(201)
  ).body.id;
  let round = 0;
  const transport = vi
    .spyOn(connection, 'respond')
    .mockImplementation(async (_actor, _revision, value) => {
      const request = value as {
        model: string;
        reasoningEffort: string;
        input: {
          type?: string;
          role?: string;
          content?: unknown;
          call_id?: string;
        }[];
      };
      expect(request.model).toBe('account-model');
      expect(request.reasoningEffort).toBe('max');
      expect(request.input.length).toBeLessThanOrEqual(64);
      const media = request.input
        .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
        .filter((part: { type?: string }) => part.type === 'input_file');
      expect(media).toHaveLength(round ? 1 : 0);
      if (media.length)
        expect(
          createHash('sha256')
            .update(Buffer.from(media[0].file_data.split(',')[1], 'base64'))
            .digest('hex'),
        ).toBe(checksum);
      const calls =
        round === 0
          ? [
              {
                type: 'function_call' as const,
                namespace: 'galaxy' as const,
                name: 'read_project_source' as const,
                call_id: 'original',
                arguments: JSON.stringify({
                  sourceId,
                  representation: 'original',
                  page: null,
                  startLine: 1,
                }),
              },
            ]
          : round < 3
            ? Array.from({ length: 16 }, (_, i) => ({
                type: 'function_call' as const,
                namespace: 'galaxy' as const,
                name: 'calculate' as const,
                call_id: 'math-' + ((round - 1) * 16 + i),
                arguments: JSON.stringify({
                  operation: 'add',
                  operands: [
                    String((round - 1) * 16 + i + 1),
                    String(1 - ((round - 1) * 16 + i)),
                  ],
                  decimalPlaces: null,
                }),
              }))
            : [];
      if (!calls.length) {
        const prefix =
          'Completed Galaxy tool records (untrusted JSON data parts):\n';
        const packed = request.input.filter(
          (item) =>
            typeof item.content === 'string' && item.content.startsWith(prefix),
        );
        expect(packed.length).toBeGreaterThan(0);
        const records = [
          ...JSON.parse(
            packed
              .map((item) => (item.content as string).slice(prefix.length))
              .join(''),
          ),
          ...request.input,
        ];
        for (let i = 0; i < 32; i++) {
          expect(
            records.filter(
              (item) =>
                item.type === 'function_call_output' &&
                item.call_id === 'math-' + i,
            ),
          ).toHaveLength(1);
          const output = records.find(
            (item) =>
              item.type === 'function_call_output' &&
              item.call_id === 'math-' + i,
          );
          expect(JSON.parse(output.output)).toMatchObject({
            value: '2',
            operation: 'add',
            operands: [String(i + 1), String(1 - i)],
            decimalPlaces: null,
          });
        }
        expect(
          request.input.some(
            (item) =>
              item.type === 'function_call' && item.call_id === 'original',
          ),
        ).toBe(true);
        expect(
          request.input.some(
            (item) =>
              item.type === 'function_call_output' &&
              item.call_id === 'original',
          ),
        ).toBe(true);
      }
      round++;
      return {
        model: 'account-model',
        reasoningEffort: 'max',
        text: calls.length
          ? ''
          : '32 exact calculations completed; original delivered, full PDF interpretation remains unknown.',
        calls,
        continuation: calls,
        usage: null,
        requestId: 'synthetic-packed-native-' + round,
      };
    });
  try {
    const question =
      'Keep every condition: deliver original PDF and calculate 32 exact items; no web.';
    const queued = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question,
        model: 'account-model',
        reasoning: 'max',
        sourceIds: [sourceId],
        searchMode: 'PROJECT_ONLY',
        runMode: 'DEEP',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await app.get(ProjectAiService).tickRuns();
    const row = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect({ status: row.status, errorCode: row.errorCode }).toEqual({
      status: 'COMPLETED',
      errorCode: null,
    });
    expect(round).toBe(4);
    const workflow = workflowMetadata(row.usage)!;
    expect(workflow.checkpoint!.stage).toBe('FINAL');
    const { runProofDigest } = await import('../src/project-chat/ai-run');
    expect(runProofDigest(workflow.checkpoint!.input, row.usage)).toBe(
      workflow.checkpoint!.proofDigest,
    );
    const usage = row.usage as unknown as {
      toolExecutions: { status: string }[];
      siwcMedia: { sentHash: string; status: string }[];
    };
    expect(usage.toolExecutions).toHaveLength(33);
    expect(usage.toolExecutions.every((tool) => tool.status === 'OK')).toBe(
      true,
    );
    expect(usage.siwcMedia).toEqual([
      expect.objectContaining({ sentHash: checksum, status: 'ACCEPTED' }),
    ]);
    const reloaded = (
      await e03Get(`/conversations/${conversation}`).expect(200)
    ).body.answers.at(-1);
    expect(reloaded.question).toBe(question);
    expect(reloaded.attachments[0].sourceId).toBe(sourceId);
    expect(reloaded.pdfCoverage[0].modelRead).toBe('UNKNOWN');
    await app.get(ProjectAiService).tickRuns();
    expect(transport).toHaveBeenCalledTimes(4);
  } finally {
    transport.mockRestore();
    if (prior)
      await db.systemSetting.update({
        where: { key },
        data: { value: prior.value as Prisma.InputJsonValue },
      });
    else await db.systemSetting.delete({ where: { key } });
  }
}, 30000);

it.each(['READY', 'FINAL'] as const)(
  'E03 durable continues deadline PARTIAL %s under the current owner session and PostgreSQL state guards',
  async (stage) => {
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const question =
      'Keep this exact request: calculate 0.1 + 0.2 without web.';
    const connection = app.get(ChatGptConnectionService);
    let round = 0;
    const call = {
      type: 'function_call' as const,
      namespace: 'galaxy' as const,
      name: 'calculate' as const,
      call_id: 'resume-math',
      arguments: JSON.stringify({
        operation: 'add',
        operands: ['0.1', '0.2'],
        decimalPlaces: null,
      }),
    };
    const transport = vi
      .spyOn(connection, 'respond')
      .mockImplementation(async (_actor, _revision, value) => {
        const sent = chatGptRequest(value);
        expect(sent.model).toBe('account-model');
        if (round++)
          expect(toolResults(sent.input)).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                call_id: call.call_id,
                output: expect.stringContaining('0.3'),
              }),
            ]),
          );
        return {
          model: 'account-model',
          text: round === 1 ? '' : 'Verified calculation: 0.3.',
          calls: round === 1 ? [call] : [],
          continuation: round === 1 ? [call] : [],
          usage: null,
          requestId: 'synthetic-deadline-resume-' + round,
        };
      });
    const priorUser = { ...users.staff!, actor: { ...users.staff!.actor } };
    try {
      const queued = (
        await e03Post(`/conversations/${conversation}/answers`, {
          question,
          model: 'account-model',
          searchMode: 'PROJECT_ONLY',
          runMode: 'NORMAL',
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      await app.get(ProjectAiService).tickRuns();
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      expect(row.status).toBe('COMPLETED');
      const workflow = workflowMetadata(row.usage)!;
      expect(workflow.checkpoint!.stage).toBe('FINAL');
      const deadline = Date.now() - 1000;
      const checkpoint = {
        ...workflow.checkpoint!,
        stage,
        final: stage === 'READY' ? null : workflow.checkpoint!.final,
      };
      const { runProofDigest } = await import('../src/project-chat/ai-run');
      checkpoint.proofDigest = runProofDigest(checkpoint.input, row.usage);
      await db.chatAiAnswer.update({
        where: { id: row.id },
        data: {
          status: 'PARTIAL',
          errorCode: 'RUN_DEADLINE',
          answer: 'Retained partial result.',
          usage: {
            ...(row.usage as Prisma.JsonObject),
            workflow: {
              ...workflow,
              queuedAt: new Date(deadline - 300000).toISOString(),
              deadlineAt: new Date(deadline).toISOString(),
              phase: 'FINISHED',
              dispatchState: 'DISPATCHING',
              providerRounds: stage === 'FINAL' ? 10 : workflow.providerRounds,
              checkpoint,
            },
          },
        },
      });
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `staff-${run}@example.test`,
          password: 'p1-synthetic-only',
        })
        .expect(201);
      users.staff!.cookie = (
        login.headers['set-cookie'] as unknown as string[]
      )[0]!.split(';')[0]!;
      const session = await db.session.findFirstOrThrow({
        where: {
          userId: users.staff!.id,
          id: { not: priorUser.actor.sessionId! },
        },
        orderBy: { createdAt: 'desc' },
      });
      users.staff!.actor.sessionId = session.id;
      await db.session.update({
        where: { id: priorUser.actor.sessionId! },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const continuationResponse = await e03Post(`/answers/${row.id}/run`, {});
      expect(
        continuationResponse.status,
        JSON.stringify(continuationResponse.body),
      ).toBe(201);
      const ack = continuationResponse.body;
      expect(ack).toMatchObject({
        runId: row.id,
        status: 'QUEUED',
        deadlineAt: null,
      });
      expect(
        (await e03Post(`/answers/${row.id}/run`, {}).expect(201)).body,
      ).toEqual(ack);
      const resumed = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(resumed.answer).toBeNull();
      expect(resumed.question).toBe(question);
      expect(workflowMetadata(resumed.usage)!.actor.sessionId).toBe(session.id);
      await app.get(ProjectAiService).tickRuns();
      const completed = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(completed.status).toBe('COMPLETED');
      expect(completed.answer).toBe('Verified calculation: 0.3.');
      expect(
        (completed.usage as Prisma.JsonObject).toolExecutions,
      ).toHaveLength(1);
      expect(transport).toHaveBeenCalledTimes(stage === 'FINAL' ? 2 : 3);
      expect(
        await db.chatAiAnswer.count({
          where: { conversationId: conversation },
        }),
      ).toBe(1);
    } finally {
      transport.mockRestore();
      await db.session.update({
        where: { id: priorUser.actor.sessionId! },
        data: { expiresAt: new Date(Date.now() + 3600000) },
      });
      users.staff = priorUser;
    }
  },
  30000,
);

it.each([false, true])(
  'E03 durable converts only the explicit PDF with repeated reads=%s using cached extraction and delivers XLSX despite final inference failure',
  async (repeatReads) => {
    const { textPdfFixture } = await import('./document-fixtures');
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .field('clientKey', randomUUID())
        .attach('file', await textPdfFixture(2), {
          filename: 'Selected.pdf',
          contentType: 'application/pdf',
        })
        .expect(201)
    ).body.id;
    await app
      .get(ProjectAiService)
      .index(users.staff!.actor, projects.B!, 'ALL');
    const other = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const question = repeatReads
      ? 'Chỉ dùng PDF đã chọn để chuyển thành bảng; giữ nguyên dữ liệu, không tìm giá ngoài.'
      : 'Chuyển PDF đã chọn thành bảng; giữ nguyên dữ liệu, không tìm giá ngoài.';
    const doc = {
      version: 1,
      format: 'xlsx',
      title: 'Converted source',
      blocks: [
        {
          kind: 'table',
          rows: [
            ['Page', 'Value'],
            ['1', 'PAGE-1'],
            ['2', 'PAGE-2'],
          ],
        },
      ],
    };
    const call = {
      type: 'function_call' as const,
      namespace: 'galaxy' as const,
      name: 'create_document' as const,
      call_id: 'conversion',
      arguments: JSON.stringify(doc),
    };
    let round = 0;
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async (_actor, _revision, value) => {
        const sent = chatGptRequest(value);
        expect(sent.model).toBe('account-model');
        const tools =
          sent.tools?.flatMap((tool) =>
            'tools' in tool
              ? (tool.tools ?? []).map((definition) => definition.name)
              : [],
          ) ?? [];
        expect(tools).toContain('create_document');
        expect(tools).not.toContain('search_project_sources');
        expect(tools).not.toContain('research_public_sources');
        const input = JSON.stringify(sent.input);
        expect(input).toContain('PAGE-1');
        expect(input).toContain('PAGE-2');
        expect(input).toContain(question);
        if (repeatReads && round++ < 2) {
          const read = {
            ...call,
            name: 'read_project_source' as const,
            call_id: 'repeat-read-' + round,
            arguments: JSON.stringify({
              sourceId,
              representation: 'text',
              page: 1,
              startLine: 1,
            }),
          };
          return {
            model: 'account-model',
            text: '',
            calls: [read],
            continuation: [read],
            usage: null,
            requestId: 'synthetic-redundant-read-' + round,
          };
        }
        if (round++ > (repeatReads ? 3 : 0))
          throw new Error(
            'Synthetic final inference failure after persistence',
          );
        return {
          model: 'account-model',
          text: '',
          calls: [call],
          continuation: [call],
          usage: null,
          requestId: 'synthetic-conversion',
        };
      });
    try {
      const response = await e03Post(`/conversations/${other}/answers`, {
        question,
        model: 'account-model',
        outputFormat: 'xlsx',
        sourceIds: [sourceId],
        searchMode: 'AUTO',
        runMode: 'NORMAL',
        clientKey: randomUUID(),
      });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect((row.usage as Prisma.JsonObject).request).toMatchObject({
        task: {
          originalUserMessageId: row.id,
          revision: 1,
          taskType: 'CONVERT_DOCUMENT',
          requestedOutputs: ['xlsx'],
          primarySourceIds: [sourceId],
        },
        documentReadScope: 'ALL',
      });
      await app.get(ProjectAiService).tickRuns();
      const done = (
        await e03Get(`/conversations/${other}`).expect(200)
      ).body.answers.at(-1);
      expect(done.status).toBe('FAILED');
      expect(
        done.attachments.map((file: { sourceId: string }) => file.sourceId),
      ).toEqual([sourceId]);
      expect(done.artifacts).toHaveLength(1);
      expect(done.artifacts[0].format).toBe('xlsx');
      const downloaded = await request(app.getHttpServer())
        .get(done.artifacts[0].downloadUrl)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .buffer(true)
        .parse((res, callback) => {
          const bytes: Buffer[] = [];
          res.on('data', (data) => bytes.push(Buffer.from(data)));
          res.on('end', () => callback(null, Buffer.concat(bytes)));
        })
        .expect(200);
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook();
      await workbook.xlsx.load(downloaded.body);
      expect(workbook.worksheets[0]!.getCell('B4').text).toBe('PAGE-1');
      expect(workbook.worksheets[0]!.getCell('B5').text).toBe('PAGE-2');
      const completed = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(
        (completed.usage as Prisma.JsonObject).toolExecutions,
      ).toHaveLength(repeatReads ? 3 : 1);
      if (repeatReads)
        expect((completed.usage as Prisma.JsonObject).toolExecutions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ callId: 'repeat-read-1', reused: true }),
            expect.objectContaining({ callId: 'repeat-read-2', reused: true }),
          ]),
        );
      expect(done.pdfCoverage[0].textCoverage).toBe('FULL');
      const usedHandles = (completed.usage as Prisma.JsonObject)
        .toolSources as {
        handle: string;
        file?: { sourceIndexId: string; page?: number };
      }[];
      await db.chatAiAnswer.update({
        where: { id: row.id },
        data: {
          citations: usedHandles
            .filter((source) => source.file?.sourceIndexId === sourceId)
            .map((source) => source.handle),
        },
      });
      const projected = (
        await e03Get(`/conversations/${other}`).expect(200)
      ).body.answers.at(-1);
      const usedFile = projected.sources.filter(
        (source: { sourceId?: string }) => source.sourceId === sourceId,
      );
      expect(usedFile).toHaveLength(2);
      expect(
        new Set(usedFile.map((source: { version: string }) => source.version))
          .size,
      ).toBe(1);
      expect(
        usedFile.map((source: { page: number }) => source.page).sort(),
      ).toEqual([1, 2]);
      expect(transport).toHaveBeenCalledTimes(repeatReads ? 4 : 2);
      await get('A', `/conversations/${other}`).expect(404);
      if (!repeatReads) {
        const grant = await db.chatProjectGrant.findUniqueOrThrow({
          where: { id: completed.invokeGrantId! },
        });
        try {
          await db.chatProjectGrant.update({
            where: { id: grant.id },
            data: { revokedAt: new Date() },
          });
          await request(app.getHttpServer())
            .get(done.artifacts[0].downloadUrl)
            .set('Cookie', users.staff!.cookie)
            .set('X-Chat-Actor', users.staff!.id)
            .expect(404);
        } finally {
          await db.chatProjectGrant.update({
            where: { id: grant.id },
            data: { revokedAt: grant.revokedAt },
          });
        }
      }
    } finally {
      transport.mockRestore();
    }
  },
  30000,
);

it('E03 durable completes Create from a selected text source without an unsupported PDF coverage gate', async () => {
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const sourceId = (
    await request(app.getHttpServer())
      .post(base('B') + `/conversations/${conversation}/files`)
      .set('Cookie', users.staff!.cookie)
      .set('X-Chat-Actor', users.staff!.id)
      .field('clientKey', randomUUID())
      .attach('file', Buffer.from('Selected text: A=2, B=3.'), {
        filename: 'Selected.txt',
        contentType: 'text/plain',
      })
      .expect(201)
  ).body.id;
  await app.get(ProjectAiService).index(users.staff!.actor, projects.B!, 'ALL');
  const call = {
    type: 'function_call' as const,
    namespace: 'galaxy' as const,
    name: 'create_document' as const,
    call_id: 'text-create',
    arguments: JSON.stringify({
      format: 'docx',
      title: 'Selected text result',
      blocks: [{ kind: 'paragraph', text: 'A=2, B=3.' }],
    }),
  };
  let round = 0;
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockImplementation(async () => ({
      model: 'account-model',
      text: round ? 'Created verified draft.' : '',
      calls: round ? [] : [call],
      continuation: round++ ? [] : [call],
      usage: null,
      requestId: 'synthetic-text-create',
    }));
  try {
    const queued = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question: 'Tạo bản DOCX nháp từ tệp được chọn.',
        model: 'account-model',
        searchMode: 'PROJECT_ONLY',
        sourceIds: [sourceId],
        outputFormat: 'docx',
        runMode: 'NORMAL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await app.get(ProjectAiService).tickRuns();
    const done = (
      await e03Get(`/conversations/${conversation}`).expect(200)
    ).body.answers.at(-1);
    expect(done.status).toBe('COMPLETED');
    expect(done.artifacts).toHaveLength(1);
    expect(done.artifacts[0].format).toBe('docx');
    const stored = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(stored.usage).toHaveProperty('request.version', 4);
    expect(stored.usage).not.toHaveProperty('request.documentReadScope');
  } finally {
    transport.mockRestore();
  }
}, 30000);

it.each(['FATAL', 'CANCEL'] as const)(
  'E04 durable %s retains failed execution evidence only under the current terminal fence',
  async (mode) => {
    const { AiError } = await import('../src/project-chat/ai-registry');
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const queued = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question: 'Synthetic fatal tool receipt; keep the original error.',
        model: 'account-model',
        searchMode: 'PROJECT_ONLY',
        runMode: 'NORMAL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    const reader = app.get(ProjectAiService) as unknown as {
      projectReadTool(...args: unknown[]): Promise<unknown>;
    };
    const executor = vi
      .spyOn(reader, 'projectReadTool')
      .mockImplementation(async () => {
        if (mode === 'CANCEL')
          await e03Post(`/answers/${queued.id}/cancel`, {}).expect(201);
        throw new AiError('TOOL_CONTEXT_LIMIT');
      });
    const call = {
      type: 'function_call' as const,
      namespace: 'galaxy' as const,
      name: 'calculate' as const,
      call_id: 'fatal-calculation',
      arguments: JSON.stringify({
        operation: 'add',
        operands: ['1', '2'],
        decimalPlaces: null,
      }),
    };
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockResolvedValue({
        model: 'account-model',
        text: '',
        calls: [call],
        continuation: [call],
        usage: null,
        requestId: 'synthetic-fatal-receipt',
      });
    try {
      await app.get(ProjectAiService).tickRuns();
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      expect(row.status).toBe(mode === 'FATAL' ? 'FAILED' : 'CANCELLED');
      expect(row.errorCode).toBe(
        mode === 'FATAL' ? 'TOOL_CONTEXT_LIMIT' : null,
      );
      expect(row.answer).toBeNull();
      const journal = await db.auditLog.findMany({
        where: {
          organizationId,
          entityType: 'ChatRoom',
          entityId: conversation,
          action: 'AI_RUN_TOOL',
          metadata: { path: ['answerId'], equals: queued.id },
        },
      });
      expect(journal).toHaveLength(mode === 'FATAL' ? 1 : 0);
      if (mode === 'FATAL') {
        expect(journal[0]!.metadata).toMatchObject({
          receipt: {
            name: 'calculate',
            callId: 'fatal-calculation',
            status: 'ERROR',
            errorCode: 'TOOL_CONTEXT_LIMIT',
          },
        });
        expect(row.usage).toMatchObject({ workflow: { toolCalls: 1 } });
      }
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      executor.mockRestore();
      transport.mockRestore();
    }
  },
  20000,
);

it.each(['PROGRESS', 'LOOP', 'DUPLICATE'] as const)(
  'E04 durable %s keeps execution receipts beyond old total ceilings and stops identical results',
  async (mode) => {
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const question =
      'Synthetic precise calculations; preserve this exact question.';
    let round = 0;
    let probeError: unknown;
    const reader = app.get(ProjectAiService) as unknown as {
      projectReadTool(...args: unknown[]): Promise<unknown>;
    };
    const executor = vi.spyOn(reader, 'projectReadTool');
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async (_actor, _revision, input) => {
        try {
          const sent = chatGptRequest(input),
            step = round++;
          expect(sent.model).toBe('account-model');
          expect(sent.input).toContainEqual({
            role: 'user',
            content: question,
          });
          if (mode === 'LOOP' && step >= 3)
            throw new Error(
              'Repeated work must stop before another model request',
            );
          const call = {
            type: 'function_call' as const,
            namespace: 'galaxy' as const,
            name: 'calculate' as const,
            call_id:
              'calculation-' + (mode === 'DUPLICATE' && step === 41 ? 0 : step),
            arguments: JSON.stringify({
              operation: 'add',
              operands: [mode === 'LOOP' ? '1' : String(step), '0.1'],
              decimalPlaces: null,
            }),
          };
          return {
            model: 'account-model',
            text:
              step === (mode === 'DUPLICATE' ? 42 : 41)
                ? 'Calculations completed.'
                : '',
            calls: step === (mode === 'DUPLICATE' ? 42 : 41) ? [] : [call],
            continuation:
              step === (mode === 'DUPLICATE' ? 42 : 41) ? [] : [call],
            usage: null,
            requestId: 'synthetic-progress-' + step,
          };
        } catch (error) {
          probeError = error;
          throw error;
        }
      });
    try {
      const queued = (
        await e03Post(`/conversations/${conversation}/answers`, {
          question,
          model: 'account-model',
          searchMode: 'PROJECT_ONLY',
          runMode: 'NORMAL',
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      await app.get(ProjectAiService).tickRuns();
      if (probeError) throw probeError;
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      const usage = row.usage as Prisma.JsonObject;
      expect(row.status).toBe(mode === 'PROGRESS' ? 'COMPLETED' : 'FAILED');
      expect(row.errorCode).toBe(
        mode === 'LOOP'
          ? 'RUN_NO_PROGRESS'
          : mode === 'DUPLICATE'
            ? 'HISTORY_TOOL_LINK_MISSING'
            : null,
      );
      expect(
        executor.mock.calls.filter((call) => call[4] === 'calculate'),
      ).toHaveLength(mode === 'LOOP' ? 1 : 41);
      expect(usage).toMatchObject({
        workflow: { deadlineAt: null, toolCalls: mode === 'LOOP' ? 3 : 41 },
      });
      expect((usage.toolExecutions as unknown[]).length).toBeLessThanOrEqual(
        43,
      );
      expect((usage.siwcRequests as unknown[]).length).toBeLessThanOrEqual(10);
      const journal = await db.auditLog.findMany({
        where: {
          organizationId,
          entityType: 'ChatRoom',
          entityId: conversation,
          metadata: { path: ['answerId'], equals: queued.id },
        },
      });
      expect(
        journal.filter((entry) => entry.action === 'AI_RUN_TOOL'),
      ).toHaveLength(mode === 'LOOP' ? 3 : 41);
      expect(
        journal.filter((entry) => entry.action === 'AI_RUN_PROVIDER'),
      ).toHaveLength(mode === 'LOOP' ? 3 : 42);
      expect(new Set(journal.map((entry) => entry.id)).size).toBe(
        journal.length,
      );
      for (const entry of journal.filter(
        (entry) => entry.action === 'AI_RUN_TOOL',
      ))
        expect(entry.metadata).toMatchObject({
          arguments: expect.any(String),
          output: expect.any(String),
        });
      const done = (
        await e03Get(`/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1);
      expect(done.question).toBe(question);
      expect(JSON.stringify(done)).not.toContain('synthetic-progress-');
    } finally {
      executor.mockRestore();
      transport.mockRestore();
    }
  },
  60000,
);

it.each(['analyze_table', 'revise_draft', 'read_project_source'] as const)(
  'E03 durable verifies its own persisted workbook with %s without losing origin authority',
  async (name) => {
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const sourceId = (
      await request(app.getHttpServer())
        .post(base('B') + `/conversations/${conversation}/files`)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .field('clientKey', randomUUID())
        .attach('file', Buffer.from('Selected value A=2.'), {
          filename: 'Own-input.txt',
          contentType: 'text/plain',
        })
        .expect(201)
    ).body.id;
    await app
      .get(ProjectAiService)
      .index(users.staff!.actor, projects.B!, 'ALL');
    const doc = {
      format: 'xlsx',
      title: 'Own verified output',
      blocks: [{ kind: 'table', rows: [['Value'], ['2']] }],
    };
    const call = {
      type: 'function_call' as const,
      namespace: 'galaxy' as const,
      name: 'create_document' as const,
      call_id: 'own-create',
      arguments: JSON.stringify(doc),
    };
    let round = 0;
    let providerProbeError: unknown;
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async (_actor, _revision, input) => {
        try {
          const sent = chatGptRequest(input);
          const step = round++;
          let next: {
            type: 'function_call';
            namespace: 'galaxy';
            name:
              | 'create_document'
              | 'analyze_table'
              | 'revise_draft'
              | 'read_project_source';
            call_id: string;
            arguments: string;
          } | null = step === 0 ? call : null;
          if (step === 1) {
            const receipt = toolResults(sent.input).find(
              (item) => item.call_id === 'own-create',
            );
            expect(receipt).toBeDefined();
            const artifact = JSON.parse(receipt!.output).artifact;
            next = {
              ...call,
              name,
              call_id: 'own-verify',
              arguments: JSON.stringify(
                name === 'analyze_table'
                  ? {
                      sourceId: artifact.sourceId,
                      sheet: 'Bản nháp',
                      range: 'A4:A4',
                    }
                  : name === 'read_project_source'
                    ? {
                        sourceId: artifact.sourceId,
                        representation: 'text',
                        page: null,
                        startLine: 1,
                      }
                    : {
                        ...doc,
                        sourceId: artifact.sourceId,
                        sourceVersion: artifact.version,
                        title: 'Own revised output',
                      },
              ),
            };
          }
          if (step === 2) {
            expect(JSON.stringify(sent.input)).not.toContain(
              'SOURCE_NOT_SELECTED',
            );
            if (name === 'read_project_source') {
              const receipt = toolResults(sent.input).find(
                (item) => item.call_id === 'own-verify',
              );
              expect(JSON.parse(receipt!.output)).toMatchObject({
                sheets: expect.arrayContaining([
                  expect.objectContaining({ name: 'Bản nháp' }),
                ]),
              });
            }
          }
          return {
            model: 'account-model',
            text: next ? '' : 'Workbook generated and verified.',
            calls: next ? [next] : [],
            continuation: next ? [next] : [],
            usage: null,
            requestId: 'synthetic-own-workbook-' + step,
          };
        } catch (error) {
          providerProbeError = error;
          throw error;
        }
      });
    try {
      const queued = (
        await e03Post(`/conversations/${conversation}/answers`, {
          question: 'Tạo XLSX nháp từ tệp đã chọn và kiểm lại file.',
          model: 'account-model',
          searchMode: 'PROJECT_ONLY',
          sourceIds: [sourceId],
          outputFormat: 'xlsx',
          runMode: 'NORMAL',
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      await app.get(ProjectAiService).tickRuns();
      if (providerProbeError) throw providerProbeError;
      const done = (
        await e03Get(`/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1);
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      expect(
        done.status,
        JSON.stringify({
          status: row.status,
          errorCode: row.errorCode,
          tools: (row.usage as Prisma.JsonObject).toolExecutions,
        }),
      ).toBe('COMPLETED');
      expect((row.usage as Prisma.JsonObject).toolExecutions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ callId: 'own-verify', status: 'OK' }),
        ]),
      );
      expect(done.artifacts).toHaveLength(name === 'revise_draft' ? 2 : 1);
      await request(app.getHttpServer())
        .get(done.artifacts.at(-1).downloadUrl)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .expect(200);
      const usage = row.usage as Prisma.JsonObject;
      const receipts = usage.artifacts as Prisma.JsonObject[];
      await db.chatAiAnswer.update({
        where: { id: row.id },
        data: { usage: { ...usage, artifacts: receipts.slice(1) } },
      });
      await request(app.getHttpServer())
        .get(done.artifacts[0].downloadUrl)
        .set('Cookie', users.staff!.cookie)
        .set('X-Chat-Actor', users.staff!.id)
        .expect(404);
      await db.chatAiAnswer.update({ where: { id: row.id }, data: { usage } });
      const grant = await db.chatProjectGrant.findUniqueOrThrow({
        where: { id: row.invokeGrantId! },
      });
      try {
        await db.chatProjectGrant.update({
          where: { id: grant.id },
          data: { revokedAt: new Date() },
        });
        await request(app.getHttpServer())
          .get(done.artifacts.at(-1).downloadUrl)
          .set('Cookie', users.staff!.cookie)
          .set('X-Chat-Actor', users.staff!.id)
          .expect(404);
      } finally {
        await db.chatProjectGrant.update({
          where: { id: grant.id },
          data: { revokedAt: grant.revokedAt },
        });
      }
    } finally {
      transport.mockRestore();
    }
  },
  30000,
);

it('E03 durable corrects the explicit source/output of a deadline XLSX run without duplicating its original message or completed reads', async () => {
  const { textPdfFixture } = await import('./document-fixtures');
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const ids: string[] = [];
  const bytes = await textPdfFixture(1);
  for (let i = 0; i < 2; i++)
    ids.push(
      (
        await request(app.getHttpServer())
          .post(base('B') + `/conversations/${conversation}/files`)
          .set('Cookie', users.staff!.cookie)
          .set('X-Chat-Actor', users.staff!.id)
          .field('clientKey', randomUUID())
          .attach('file', bytes, {
            filename: 'Original.pdf',
            contentType: 'application/pdf',
          })
          .expect(201)
      ).body.id,
    );
  await app.get(ProjectAiService).index(users.staff!.actor, projects.B!, 'ALL');
  const question =
    'Tạo file Excel (XLSX) nháp từ nội dung và nguồn được phép, trả file tải trong chat.';
  const read = {
    type: 'function_call' as const,
    namespace: 'galaxy' as const,
    name: 'read_project_source' as const,
    call_id: 'prior-read',
    arguments: JSON.stringify({
      sourceId: ids[1],
      representation: 'text',
      page: 1,
      startLine: 1,
    }),
  };
  const create = {
    ...read,
    name: 'create_document' as const,
    call_id: 'corrected-create',
    arguments: JSON.stringify({
      format: 'xlsx',
      title: 'Corrected original',
      blocks: [
        {
          kind: 'table',
          rows: [
            ['Page', 'Value'],
            ['1', 'PAGE-1'],
          ],
        },
      ],
    }),
  };
  let round = 0;
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockImplementation(async (_actor, _revision, value) => {
      const sent = chatGptRequest(value);
      expect(sent.model).toBe('account-model');
      expect(sent.reasoning).toBeUndefined();
      const call = round === 0 ? read : round === 2 ? create : null;
      if (round >= 2) {
        expect(JSON.stringify(sent.input)).toContain(ids[0]);
        expect(JSON.stringify(sent.input)).not.toContain(ids[1]);
      }
      round++;
      return {
        model: 'account-model',
        text: call ? '' : 'Result retained.',
        calls: call ? [call] : [],
        continuation: call ? [call] : [],
        usage: null,
        requestId: 'synthetic-task-correction-' + round,
      };
    });
  try {
    const queued = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question,
        model: 'account-model',
        searchMode: 'PROJECT_ONLY',
        runMode: 'NORMAL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await app.get(ProjectAiService).tickRuns();
    const row = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(row.status).toBe('COMPLETED');
    const workflow = workflowMetadata(row.usage)!,
      deadline = Date.now() - 1000;
    const note = (
      await e03Post('/memory', {
        clientKey: randomUUID(),
        visibility: 'PRIVATE',
        content: 'Unrelated old tool memory ' + randomUUID(),
        category: 'NOTE',
        verification: 'USER_CONFIRMED',
        sourceRefs: [],
      }).expect(201)
    ).body;
    await db.chatAiAnswerMemoryDependency.create({
      data: {
        answerId: row.id,
        memoryRevisionId: note.revisionId,
        organizationId,
        projectId: projects.B!,
      },
    });
    const oldUsage = row.usage as Prisma.JsonObject;
    const oldExecution = oldUsage.execution as Prisma.JsonObject;
    const revisedUsage = {
      ...oldUsage,
      execution: {
        ...oldExecution,
        memoryRevisionIds: [
          ...(oldExecution.memoryRevisionIds as string[]),
          note.revisionId,
        ],
      },
    };
    await db.chatAiAnswer.update({
      where: { id: row.id },
      data: {
        status: 'PARTIAL',
        errorCode: 'RUN_DEADLINE',
        usage: {
          ...revisedUsage,
          workflow: {
            ...workflow,
            queuedAt: new Date(deadline - 300000).toISOString(),
            deadlineAt: new Date(deadline).toISOString(),
            checkpoint: {
              ...workflow.checkpoint!,
              proofDigest: runProofDigest(
                workflow.checkpoint!.input,
                revisedUsage,
              ),
              stage: 'READY',
              final: null,
            },
          },
        },
      },
    });
    const input = { outputFormat: 'xlsx', sourceIds: [ids[0]] };
    const legacy = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: row.id },
    });
    await e03Post(`/answers/${row.id}/run`, { outputFormat: 'xlsx' }).expect(
      409,
    );
    await e03Post(`/answers/${row.id}/run`, {
      outputFormat: 'xlsx',
      sourceIds: [randomUUID()],
    }).expect(404);
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: row.id } }))
        .usage,
    ).toEqual(legacy.usage);
    await db.chatAiAnswer.update({
      where: { id: row.id },
      data: {
        usage: {
          ...(legacy.usage as Prisma.JsonObject),
          workflow: {
            ...workflowMetadata(legacy.usage)!,
            checkpoint: workflow.checkpoint!,
          },
        },
      },
    });
    await e03Post(`/answers/${row.id}/run`, input).expect(409);
    await db.chatAiAnswer.update({
      where: { id: row.id },
      data: { usage: legacy.usage! },
    });
    const response = await e03Post(`/answers/${row.id}/run`, input);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body).toMatchObject({
      runId: row.id,
      status: 'QUEUED',
      deadlineAt: null,
    });
    expect(
      await db.chatAiAnswerMemoryDependency.count({
        where: { answerId: row.id },
      }),
    ).toBe(0);
    expect(
      (await e03Post(`/answers/${row.id}/run`, input).expect(201)).body,
    ).toEqual(response.body);
    await app.get(ProjectAiService).tickRuns();
    const completed = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(completed).toMatchObject({ question, status: 'COMPLETED' });
    expect(completed.usage).toMatchObject({
      request: {
        task: {
          originalUserMessageId: row.id,
          revision: 2,
          requestedOutputs: ['xlsx'],
          primarySourceIds: [ids[0]],
        },
      },
      priorTask: {
        toolExecutions: [expect.objectContaining({ callId: 'prior-read' })],
      },
    });
    const visible = (
      await e03Get(`/conversations/${conversation}`).expect(200)
    ).body.answers.at(-1);
    expect(
      visible.attachments.map((file: { sourceId: string }) => file.sourceId),
    ).toEqual([ids[0]]);
    expect(visible.artifacts).toHaveLength(1);
    expect(visible.artifacts[0].format).toBe('xlsx');
    expect(transport).toHaveBeenCalledTimes(4);
    expect(
      await db.chatAiAnswer.count({ where: { conversationId: conversation } }),
    ).toBe(1);
    expect((completed.usage as Prisma.JsonObject).toolExecutions).toHaveLength(
      2,
    );
    expect((completed.usage as Prisma.JsonObject).siwcRequests).toHaveLength(4);
    expect(workflowMetadata(completed.usage)!.providerRounds).toBe(4);
  } finally {
    transport.mockRestore();
  }
}, 30000);

it('E03 durable source discovery excludes verified fixture metadata and does not publish discovered-only citations', async () => {
  const { textPdfFixture } = await import('./document-fixtures');
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const filename = 'bounded-' + randomUUID() + '.pdf';
  const ids: string[] = [];
  for (let i = 0; i < 2; i++)
    ids.push(
      (
        await request(app.getHttpServer())
          .post(base('B') + `/conversations/${conversation}/files`)
          .set('Cookie', users.staff!.cookie)
          .set('X-Chat-Actor', users.staff!.id)
          .field('clientKey', randomUUID())
          .attach('file', await textPdfFixture(1), {
            filename,
            contentType: 'application/pdf',
          })
          .expect(201)
      ).body.id,
    );
  await app.get(ProjectAiService).index(users.staff!.actor, projects.B!, 'ALL');
  const fixture = await db.chatAiSourceIndex.findUniqueOrThrow({
    where: { id: ids[1]! },
  });
  await db.chatAiSourceIndex.update({
    where: { id: fixture.id },
    data: {
      processingMetadata: {
        ...((fixture.processingMetadata as Prisma.JsonObject) ?? {}),
        classification: 'ACCEPTANCE_FIXTURE',
        classificationEvidence: 'G00 test-owned upload; exact ID/hash verified',
      },
    },
  });
  let round = 0;
  const call = {
    type: 'function_call' as const,
    namespace: 'galaxy' as const,
    name: 'search_project_sources' as const,
    call_id: 'discovery',
    arguments: JSON.stringify({ query: filename, limit: 10 }),
  };
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockImplementation(async (_actor, _revision, value) => {
      const sent = chatGptRequest(value);
      if (round++) {
        const output = JSON.parse(
          toolResults(sent.input).find(
            (result) => result.call_id === call.call_id,
          )!.output,
        );
        expect(
          output.results.map((source: { sourceId: string }) => source.sourceId),
        ).toEqual([ids[0]]);
        expect(output.results[0].chunks).toEqual([]);
      }
      return {
        model: 'account-model',
        text: round === 1 ? '' : 'Select the relevant document to continue.',
        calls: round === 1 ? [call] : [],
        continuation: round === 1 ? [call] : [],
        usage: null,
        requestId: 'synthetic-discovery-' + round,
      };
    });
  try {
    const queued = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question: 'Find the document metadata.',
        model: 'account-model',
        searchMode: 'PROJECT_ONLY',
        runMode: 'NORMAL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await app.get(ProjectAiService).tickRuns();
    const answer = (
      await e03Get(`/conversations/${conversation}`).expect(200)
    ).body.answers.at(-1);
    expect(answer.status).toBe('COMPLETED');
    expect(
      answer.sources.filter(
        (source: { kind?: string }) => source.kind !== 'MEMORY',
      ),
    ).toEqual([]);
    expect(
      await db.chatAiAnswerDependency.findMany({
        where: { answerId: queued.id },
        select: { sourceIndexId: true, handles: true },
      }),
    ).toEqual([
      {
        sourceIndexId: ids[0],
        handles: [expect.stringMatching(/^S_/)],
      },
    ]);
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }))
        .citations,
    ).toEqual([]);
    const selected = await e03Post(`/conversations/${conversation}/answers`, {
      question: 'Chỉ đọc trang 1 của tệp kiểm thử đã chọn.',
      model: 'account-model',
      sourceIds: [fixture.id],
      searchMode: 'PROJECT_ONLY',
      runMode: 'NORMAL',
      clientKey: randomUUID(),
    }).expect(201);
    await e03Post(`/answers/${selected.body.id}/cancel`, {}).expect(201);
  } finally {
    transport.mockRestore();
  }
}, 30000);

it('E03 durable document coverage PARTIAL preserves PostgreSQL state guards', async () => {
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const queued = (
    await e03Post(`/conversations/${conversation}/answers`, {
      question: 'Read every page of the whole attached PDF.',
      model: 'account-model',
      searchMode: 'PROJECT_ONLY',
      runMode: 'DEEP',
      clientKey: randomUUID(),
    }).expect(201)
  ).body;
  const initial = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: queued.id },
  });
  const usage = initial.usage as Prisma.JsonObject;
  const pin = usage.request as Prisma.JsonObject;
  expect(pin.documentReadScope).toBe('ALL');
  const valid = {
    status: 'PARTIAL',
    errorCode: 'DOCUMENT_COVERAGE_INCOMPLETE',
    answer: 'Useful text retained; the original document is not resolved.',
    uncertainty: 'The required document still has no verified coverage.',
  };
  await db.chatAiAnswer.update({ where: { id: queued.id }, data: valid });
  for (const data of [
    { usage: { ...usage, request: { ...pin, documentReadScope: null } } },
    { usage: { ...usage, request: { ...pin, version: null } } },
    { uncertainty: null },
    { answer: null },
    { errorCode: 'UNKNOWN' },
    { status: 'RUNNING' },
  ]) {
    await expect(
      db.chatAiAnswer.update({ where: { id: queued.id }, data }),
    ).rejects.toThrow('ChatAiAnswer_state_check');
    expect(
      await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }),
    ).toMatchObject({ ...valid, usage: initial.usage });
  }
  await expect(
    db.chatAiAnswer.update({
      where: { id: queued.id },
      data: { answer: 'A'.repeat(512001) },
    }),
  ).rejects.toThrow('ChatAiAnswer_state_check');
  expect(
    await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }),
  ).toMatchObject(valid);
});

it.each(['NORMAL', 'DEEP'] as const)(
  'E03 durable %s no-file chat completes while the same owner has a held deep run without mixing conversations',
  async (runMode) => {
    const service = app.get(ProjectAiService);
    const deepConversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const deep = (
      await e03Post(`/conversations/${deepConversation}/answers`, {
        question: 'Synthetic held deep run',
        model: 'account-model',
        searchMode: 'PROJECT_ONLY',
        runMode: 'DEEP',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async (_actor, _revision, input) => {
        const text = JSON.stringify((input as { input: unknown[] }).input);
        expect(input).toMatchObject({ model: 'account-model' });
        if (text.includes('Synthetic held deep run')) {
          await gate;
          return {
            model: 'account-model',
            text: 'Deep result.',
            calls: [],
            continuation: [],
            usage: null,
            requestId: 'synthetic-deep-held',
          };
        }
        expect(text).toContain('Synthetic independent no-file question');
        expect(text).not.toContain('Synthetic held deep run');
        return {
          model: 'account-model',
          text: 'Independent result.',
          calls: [],
          continuation: [],
          usage: null,
          requestId: 'synthetic-independent-during-deep',
        };
      });
    const working = service.tickRuns();
    let normalId: string | undefined;
    try {
      await Promise.race([
        vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1), {
          timeout: 6000,
        }),
        working.then(() => {
          throw new Error('Held run ended before provider entry');
        }),
      ]);
      const normalConversation = (
        await e03Post('/conversations', {
          scope: 'ALL',
          clientKey: randomUUID(),
        }).expect(201)
      ).body.id;
      const normal = (
        await e03Post(`/conversations/${normalConversation}/answers`, {
          question: 'Synthetic independent no-file question',
          model: 'account-model',
          searchMode: 'PROJECT_ONLY',
          runMode,
          clientKey: randomUUID(),
        }).expect(201)
      ).body;
      normalId = normal.id;
      const before = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: normal.id },
      });
      await service.tickRuns();
      const done = (
        await e03Get(`/conversations/${normalConversation}`).expect(200)
      ).body.answers.at(-1);
      expect(done.status).toBe('COMPLETED');
      expect(done.answer).toBe('Independent result.');
      expect(done.attachments).toEqual([]);
      const after = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: normal.id },
      });
      expect(workflowMetadata(after.usage)?.deadlineAt).toBe(
        workflowMetadata(before.usage)?.deadlineAt,
      );
      expect(
        (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: deep.id } }))
          .status,
      ).toBe('RUNNING');
      expect(transport).toHaveBeenCalledTimes(2);
      expect(
        (
          await e03Get(`/conversations/${normalConversation}`).expect(200)
        ).body.answers.at(-1),
      ).toMatchObject({
        id: normal.id,
        question: before.question,
        status: 'COMPLETED',
      });
    } finally {
      release();
      await working;
      transport.mockRestore();
      await db.chatAiAnswer.updateMany({
        where: {
          organizationId,
          projectId: projects.B!,
          ownerId: users.staff!.id,
          id: { in: [deep.id, ...(normalId ? [normalId] : [])] },
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        data: {
          status: 'CANCELLED',
          errorCode: 'CANCELLED',
          completedAt: new Date(),
          leaseUntil: null,
        },
      });
    }
  },
  30000,
);

it('E03 durable same-conversation claims wait for an older queued answer before dispatch', async () => {
  const service = app.get(ProjectAiService);
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const ids: string[] = [];
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockResolvedValue({
      model: 'account-model',
      text: 'Ordered result.',
      calls: [],
      continuation: [],
      usage: null,
      requestId: 'synthetic-ordered',
    });
  try {
    for (const question of [
      'First queued question',
      'Second queued question',
    ]) {
      ids.push(
        (
          await e03Post(`/conversations/${conversation}/answers`, {
            question,
            model: 'account-model',
            searchMode: 'PROJECT_ONLY',
            runMode: 'NORMAL',
            clientKey: randomUUID(),
          }).expect(201)
        ).body.id,
      );
    }
    await service['runChatGpt'](users.staff!.actor, projects.B!, ids[1]!);
    expect(transport).not.toHaveBeenCalled();
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: ids[1]! } }))
        .status,
    ).toBe('QUEUED');
    await service['runChatGpt'](users.staff!.actor, projects.B!, ids[0]!);
    expect(transport).toHaveBeenCalledTimes(1);
    await service['runChatGpt'](users.staff!.actor, projects.B!, ids[1]!);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      await db.chatAiAnswer.count({
        where: { id: { in: ids }, status: 'COMPLETED' },
      }),
    ).toBe(2);
  } finally {
    transport.mockRestore();
    await db.chatAiAnswer.updateMany({
      where: {
        organizationId,
        projectId: projects.B!,
        ownerId: users.staff!.id,
        id: { in: ids },
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: {
        status: 'CANCELLED',
        errorCode: 'CANCELLED',
        completedAt: new Date(),
        leaseUntil: null,
      },
    });
  }
}, 15000);

it('E03 durable expired no-file queue settles past ten older queued runs while both provider slots are held', async () => {
  const service = app.get(ProjectAiService);
  const ids: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockImplementation(async () => {
      await gate;
      return {
        model: 'account-model',
        text: 'Held result.',
        calls: [],
        continuation: [],
        usage: null,
        requestId: 'synthetic-backlog',
      };
    });
  const queue = async (runMode: 'NORMAL' | 'DEEP', question: string) => {
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const row = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question,
        model: 'account-model',
        searchMode: 'PROJECT_ONLY',
        runMode,
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    ids.push(row.id);
    return row.id as string;
  };
  let working: Promise<void> | undefined;
  try {
    await queue('DEEP', 'Synthetic held slot one');
    await queue('DEEP', 'Synthetic held slot two');
    working = service.tickRuns();
    await Promise.race([
      vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2), {
        timeout: 6000,
      }),
      working.then(() => {
        throw new Error('Both held providers must remain running');
      }),
    ]);
    for (let index = 0; index < 11; index++)
      await queue('DEEP', 'Synthetic queued backlog ' + index);
    const expiredId = await queue('NORMAL', 'Synthetic expired no-file chat');
    const row = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: expiredId },
    });
    const workflow = workflowMetadata(row.usage)!;
    const deadline = Date.now() - 1000;
    await db.chatAiAnswer.update({
      where: { id: expiredId },
      data: {
        usage: {
          ...(row.usage as Prisma.JsonObject),
          workflow: {
            ...workflow,
            queuedAt: new Date(deadline - 300000).toISOString(),
            deadlineAt: new Date(deadline).toISOString(),
          },
        },
      },
    });
    await service.tickRuns();
    expect(
      await db.chatAiAnswer.findUniqueOrThrow({ where: { id: expiredId } }),
    ).toMatchObject({
      status: 'PARTIAL',
      errorCode: 'RUN_DEADLINE',
      providerStartedAt: null,
      answer: expect.stringContaining('hàng đợi'),
    });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      await db.chatAiAnswer.count({
        where: { id: { in: ids.slice(2, -1) }, status: 'QUEUED' },
      }),
    ).toBe(11);
  } finally {
    release();
    await working;
    transport.mockRestore();
    await db.chatAiAnswer.updateMany({
      where: {
        organizationId,
        projectId: projects.B!,
        ownerId: users.staff!.id,
        id: { in: ids },
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: {
        status: 'CANCELLED',
        errorCode: 'CANCELLED',
        completedAt: new Date(),
        leaseUntil: null,
      },
    });
  }
}, 30000);

it('E03 durable expired queue publishes honest PARTIAL under the reviewed SQL constraint', async () => {
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const queued = (
    await e03Post(`/conversations/${conversation}/answers`, {
      question: 'Synthetic expired queue',
      model: 'account-model',
      searchMode: 'PROJECT_ONLY',
      runMode: 'DEEP',
      clientKey: randomUUID(),
    }).expect(201)
  ).body;
  const row = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: queued.id },
  });
  const workflow = workflowMetadata(row.usage)!;
  const deadline = Date.now() - 1000;
  await db.chatAiAnswer.update({
    where: { id: row.id },
    data: {
      usage: {
        ...(row.usage as Prisma.JsonObject),
        workflow: {
          ...workflow,
          queuedAt: new Date(deadline - 1800000).toISOString(),
          deadlineAt: new Date(deadline).toISOString(),
        },
      },
    },
  });
  const transport = vi.spyOn(app.get(ChatGptConnectionService), 'respond');
  try {
    await app.get(ProjectAiService).tickRuns();
    expect(transport).not.toHaveBeenCalled();
    const partial = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(partial).toMatchObject({
      status: 'PARTIAL',
      errorCode: 'RUN_DEADLINE',
      providerStartedAt: null,
    });
    expect(partial.answer).toContain('chưa hoàn tất yêu cầu');
    expect(partial.answer).toContain('hàng đợi');
    expect(partial.answer).not.toContain('tài liệu');
    expect(partial.uncertainty).not.toContain('tài liệu');
    expect(
      (
        await e03Get(`/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1),
    ).toMatchObject({
      question: row.question,
      status: 'PARTIAL',
      answer: partial.answer,
    });
    await e03Get(`/answers/${row.id}/markdown`).expect(200);
    const legacyText =
      'Đã hết ngân sách thời gian của lượt này. Kết quả hiện có là một phần; chưa hoàn tất yêu cầu.\n\nĐã hoàn thành 0 lần gọi công cụ. Các nguồn và file đã tạo được giữ kèm theo. Phần tài liệu chưa có bằng chứng đọc vẫn chưa được kiểm tra.';
    await db.chatAiAnswer.update({
      where: { id: row.id },
      data: {
        answer: legacyText,
        uncertainty:
          'PARTIAL — deadline reached; document coverage may be incomplete.',
      },
    });
    expect(
      (
        await e03Get(`/conversations/${conversation}`).expect(200)
      ).body.answers.at(-1),
    ).toMatchObject({
      answer: partial.answer,
      uncertainty: partial.uncertainty,
    });
    expect(
      (await e03Get(`/answers/${row.id}/markdown`).expect(200)).text,
    ).not.toContain('document coverage may be incomplete');
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: row.id } }))
        .answer,
    ).toBe(legacyText);
    await expect(
      db.chatAiAnswer.update({
        where: { id: row.id },
        data: { errorCode: null },
      }),
    ).rejects.toThrow('ChatAiAnswer_state_check');
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: row.id } }))
        .errorCode,
    ).toBe('RUN_DEADLINE');
  } finally {
    transport.mockRestore();
  }
}, 15000);

it('E03 durable recovery refuses replay after uncertain dispatch and preserves the saved question', async () => {
  const conversation = (
    await e03Post('/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const queued = (
    await e03Post(`/conversations/${conversation}/answers`, {
      question: 'Synthetic uncertain dispatch',
      model: 'account-model',
      searchMode: 'PROJECT_ONLY',
      runMode: 'DEEP',
      clientKey: randomUUID(),
    }).expect(201)
  ).body;
  const row = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: queued.id },
  });
  const workflow = workflowMetadata(row.usage)!;
  await db.chatAiAnswer.update({
    where: { id: row.id },
    data: {
      status: 'RUNNING',
      providerStartedAt: new Date(),
      leaseUntil: new Date(Date.now() - 1000),
      usage: {
        ...(row.usage as Prisma.JsonObject),
        workflow: {
          ...workflow,
          phase: 'REQUESTING',
          attempts: 1,
          providerRounds: 1,
          dispatchState: 'DISPATCHING',
        },
      },
    },
  });
  const transport = vi.spyOn(app.get(ChatGptConnectionService), 'respond');
  try {
    await app.get(ProjectAiService).tickRuns();
    expect(transport).not.toHaveBeenCalled();
    expect(
      await db.chatAiAnswer.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      question: row.question,
      status: 'FAILED_UNKNOWN',
      errorCode: 'INTERRUPTED_UNCERTAIN_DISPATCH',
      leaseUntil: null,
    });
    await app.get(ProjectAiService).tickRuns();
    expect(transport).not.toHaveBeenCalled();
  } finally {
    transport.mockRestore();
  }
}, 15000);

it.each(['cancel', 'deadline'] as const)(
  'E03 durable running %s fences a late provider result and never retries it',
  async (kind) => {
    const conversation = (
      await e03Post('/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const question = 'Synthetic durable running ' + kind;
    const queued = (
      await e03Post(`/conversations/${conversation}/answers`, {
        question,
        model: 'account-model',
        searchMode: 'PROJECT_ONLY',
        runMode: 'DEEP',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    let deadline: number | null = null;
    let wallClock: ReturnType<typeof vi.spyOn> | undefined;
    if (kind === 'deadline') {
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      deadline = Date.now() + 4000;
      await db.chatAiAnswer.update({
        where: { id: row.id },
        data: {
          usage: {
            ...(row.usage as Prisma.JsonObject),
            workflow: {
              ...workflowMetadata(row.usage)!,
              queuedAt: new Date(deadline - 1800000).toISOString(),
              deadlineAt: new Date(deadline).toISOString(),
            },
          },
        },
      });
    }
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let responseRound = 0;
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async () => {
        const first = responseRound++ === 0;
        if (first) {
          entered();
          await held;
        }
        return {
          model: 'account-model',
          text: first
            ? 'LATE DURABLE RESULT MUST NOT PUBLISH'
            : 'EXPLICIT RESUME RESULT',
          requestId: first
            ? 'synthetic-durable-late'
            : 'synthetic-explicit-resume',
          calls: [],
          continuation: [],
          usage: null,
        };
      });
    const worker = app.get(ProjectAiService).tickRuns();
    try {
      await Promise.race([
        started,
        worker.then(() => {
          throw new Error('Durable provider was never entered');
        }),
      ]);
      expect(
        (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }))
          .status,
      ).toBe('RUNNING');
      if (kind === 'cancel')
        await e03Post(`/answers/${queued.id}/cancel`, {}).expect(201);
      else wallClock = vi.spyOn(Date, 'now').mockReturnValue(deadline! - 1);
      const settled = await Promise.race([
        worker.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 8000)),
      ]);
      expect(settled).toBe(true);
      wallClock?.mockRestore();
      const status = kind === 'cancel' ? 'CANCELLED' : 'PARTIAL';
      expect(
        await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }),
      ).toMatchObject({
        question,
        status,
        ...(kind === 'deadline' ? { errorCode: 'RUN_DEADLINE' } : {}),
      });
      release();
      await worker;
      expect(transport).toHaveBeenCalledTimes(1);
      expect(
        (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: queued.id } }))
          .answer ?? '',
      ).not.toContain('LATE DURABLE RESULT');
      const resumed = (
        await e03Post(`/answers/${queued.id}/run`, {}).expect(201)
      ).body;
      if (kind === 'deadline') expect(resumed.deadlineAt).toBeNull();
      await app.get(ProjectAiService).tickRuns();
      expect(transport).toHaveBeenCalledTimes(kind === 'deadline' ? 2 : 1);
      const stored = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      const finalStatus = kind === 'deadline' ? 'COMPLETED' : status;
      expect(stored.status).toBe(finalStatus);
      if (kind === 'deadline')
        expect(stored.answer).toBe('EXPLICIT RESUME RESULT');
      expect(stored.answer ?? '').not.toContain('LATE DURABLE RESULT');
      expect(
        (
          await e03Get(`/conversations/${conversation}`).expect(200)
        ).body.answers.at(-1),
      ).toMatchObject({ question, status: finalStatus });
    } finally {
      wallClock?.mockRestore();
      release();
      await worker;
      transport.mockRestore();
    }
  },
  15000,
);

it.each(['resumable initiation', 'direct PDF'] as const)(
  'E03 %s upload survives a bounded concurrent Project reader',
  async (kind) => {
    const conversation = (
      await post(
        'B',
        '/conversations',
        { scope: 'ALL', clientKey: randomUUID() },
        'staff',
      ).expect(201)
    ).body.id;
    const direct = kind === 'direct PDF';
    const service = direct ? app.get(FilesService) : app.get(UploadsService);
    const method = direct ? 'lockProjects' : 'assertTargetInTransaction';
    const originalTarget = Reflect.get(service, method) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    const target = originalTarget.bind(service);
    const bytes = direct
      ? await (await import('./document-fixtures')).textPdfFixture(1)
      : undefined;
    let entered!: () => void, proceed!: () => void, locked!: () => void;
    const transactionEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const continueTarget = new Promise<void>((resolve) => {
      proceed = resolve;
    });
    const projectLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    Object.assign(service, {
      [method]: async (...args: Parameters<typeof target>) => {
        entered();
        await continueTarget;
        return target(...args);
      },
    });
    const upload = request(app.getHttpServer())
      .post(
        direct
          ? base('B') + `/conversations/${conversation}/files`
          : '/api/v1/uploads/initiate',
      )
      .set('Cookie', users.staff!.cookie)
      .set('X-Chat-Actor', users.staff!.id);
    const pending = (
      direct
        ? upload.field('clientKey', randomUUID()).attach('file', bytes!, {
            filename: 'Synthetic-concurrent.pdf',
            contentType: 'application/pdf',
          })
        : upload.send({
            projectId: projects.B!,
            aiConversationId: conversation,
            originalFilename: 'Synthetic-concurrent-50MB.pdf',
            declaredSize: 50000000,
            mimeType: 'application/pdf',
            idempotencyKey: randomUUID(),
          })
    ).then((response) => response);
    let holder: Promise<unknown> | undefined;
    let created: string | undefined;
    try {
      await Promise.race([
        transactionEntered,
        pending.then((response) => {
          throw new Error('Upload transaction not entered: ' + response.status);
        }),
      ]);
      holder = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projects.B!}::uuid AND "organizationId"=${organizationId}::uuid FOR UPDATE`;
          locked();
          await new Promise<void>((resolve) => setTimeout(resolve, 6000));
        },
        { timeout: 15000 },
      );
      await Promise.race([
        projectLocked,
        holder.then(() => {
          throw new Error('Project holder ended before acquiring its lock');
        }),
      ]);
      proceed();
      const response = await pending;
      if (!direct && response.status === 201) created = response.body.id;
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body).toMatchObject(
        direct
          ? { sizeBytes: bytes!.length, status: 'QUEUED' }
          : { declaredSize: '50000000', status: 'INITIATED' },
      );
      if (direct)
        expect(
          await db.fileAsset.findUniqueOrThrow({
            where: { id: response.body.fileAssetId },
          }),
        ).toMatchObject({
          sizeBytes: BigInt(bytes!.length),
          checksum: createHash('sha256').update(bytes!).digest('hex'),
          deletedAt: null,
        });
    } finally {
      Object.assign(service, { [method]: originalTarget });
      proceed();
      await pending;
      await holder;
      if (created)
        await app.get(UploadsService).abort(users.staff!.actor, created);
    }
  },
  15000,
);

it.each(['AUTO', 'SIWC'] as const)(
  'F1 %s greeting uses one SIWC request without loading Project data or a planner',
  async (requested) => {
    const conversation = (
      await post('B', '/conversations', {
        scope: 'ALL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body.id;
    const transport = vi
      .spyOn(app.get(ChatGptConnectionService), 'respond')
      .mockImplementation(async (_actor, _generation, raw) => {
        const body = raw as { input: unknown[]; tools: string[] };
        expect(body.tools).toEqual([]);
        expect(JSON.stringify(body.input)).not.toContain('project.read');
        return {
          model: 'account-model',
          text: 'Chào anh.',
          calls: [],
          continuation: [],
          usage: null,
          requestId: 'f1-greeting',
        };
      });
    try {
      const path = requested === 'AUTO' ? 'executions' : 'answers';
      const input = {
        question: 'Chào',
        model: 'account-model',
        reasoning: 'default',
        runMode: 'NORMAL',
        sourceIds: [],
        clientKey: randomUUID(),
        ...(requested === 'AUTO' ? { requested_executor: requested } : {}),
      };
      // This legacy SIWC app deliberately excludes MCP routes; HTTP AUTO is covered in mcp-work.
      const work = {
        create: vi.fn(() => {
          throw new Error('GREETING_CREATED_WORK_JOB');
        }),
      };
      const router = new McpExecutionService(
        app.get(ProjectAiService),
        work as unknown as McpJobsService,
        app.get(ProjectsService),
        app.get(ProjectChatPolicy),
      );
      const submit = async () =>
        requested === 'AUTO'
          ? router.create(users.owner!.actor, projects.B!, conversation, input)
          : (
              await post(
                'B',
                `/conversations/${conversation}/${path}`,
                input,
              ).expect(201)
            ).body;
      const queued = await submit();
      if (requested === 'AUTO') {
        const replay = await submit();
        expect(replay.id).toBe(queued.id);
      }
      await app
        .get(ProjectAiService)
        .run(users.owner!.actor, projects.B!, queued.id);
      const row = await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: queued.id },
      });
      expect(row.status).toBe('COMPLETED');
      expect(row.question).toBe(input.question);
      expect((row.usage as Prisma.JsonObject).routeSelection).toMatchObject({
        requested_executor: requested,
        effective_executor: 'SIWC',
        context: 'GENERAL',
      });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(work.create).not.toHaveBeenCalled();
    } finally {
      transport.mockRestore();
    }
  },
);

it('F1 SIWC answers while an earlier Work notification waits in the same thread', async () => {
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const jobs = new McpJobsService(
    db as never,
    app.get(ProjectAiService),
    undefined as never,
    undefined as never,
  );
  const work = await jobs.create(
    users.owner!.actor,
    projects.B!,
    conversation,
    {
      clientKey: randomUUID(),
      question: 'External Work pending fixture.',
      sourceIds: [],
    },
  );
  const workRow = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: work.id },
  });
  const usage = workRow.usage as Prisma.JsonObject;
  await db.chatAiAnswer.update({
    where: { id: work.id },
    data: {
      usage: {
        ...usage,
        mcp: { ...(usage.mcp as Prisma.JsonObject), state: 'NOTIFIED' },
      },
    },
  });
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockResolvedValue({
      model: 'account-model',
      text: 'Chào anh.',
      calls: [],
      continuation: [],
      usage: null,
      requestId: 'f1-work-independent',
    });
  try {
    const native = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'Chào',
        model: 'account-model',
        runMode: 'NORMAL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await app
      .get(ProjectAiService)
      .run(users.owner!.actor, projects.B!, native.id);
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: native.id } }))
        .status,
    ).toBe('COMPLETED');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: work.id } }))
        .status,
    ).toBe('RUNNING');
  } finally {
    transport.mockRestore();
    await db.chatAiAnswer.updateMany({
      where: {
        conversationId: conversation,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: { status: 'CANCELLED', completedAt: new Date(), leaseUntil: null },
    });
  }
});

it('F1 drain separates a never-claimed durable queue from actual or uncertain execution', async () => {
  const probe = (nativeObserved = true) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          join(process.cwd(), '../../scripts/mcp-drain-probe.cjs'),
          ...(nativeObserved ? ['--native-observed'] : []),
        ],
        { encoding: 'utf8' },
      ),
    ) as {
      active: number;
      components: { component: string; active: number }[];
    };
  const baseline = probe();
  const legacyBaseline = probe(false);
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const queued = (
    await post('B', `/conversations/${conversation}/answers`, {
      question: 'Queued drain fixture',
      model: 'account-model',
      runMode: 'NORMAL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body;
  const row = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: queued.id },
  });
  try {
    expect(row.providerStartedAt).toBeNull();
    expect(probe(false).active).toBe(legacyBaseline.active + 1);
    expect(probe().active).toBe(baseline.active);
    expect(
      probe().components.find((item) => item.component === 'waiting_ai')!
        .active,
    ).toBe(
      (baseline.components.find((item) => item.component === 'waiting_ai')
        ?.active ?? 0) + 1,
    );
    const jobs = new McpJobsService(
      db as never,
      app.get(ProjectAiService),
      undefined as never,
      undefined as never,
    );
    const work = await jobs.create(
      users.owner!.actor,
      projects.B!,
      conversation,
      {
        clientKey: randomUUID(),
        question: 'Legacy drain ordering fixture.',
        sourceIds: [],
      },
    );
    const workRow = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: work.id },
    });
    const workUsage = workRow.usage as Prisma.JsonObject;
    const mcp = workUsage.mcp as Prisma.JsonObject;
    const patch = async (state: string, actor = mcp.actor) =>
      db.chatAiAnswer.update({
        where: { id: work.id },
        data: { usage: { ...workUsage, mcp: { ...mcp, state, actor } } },
      });
    await patch('NOTIFIED');
    // A later Work job cannot explain why this queue has not started.
    expect(probe(false).active).toBe(legacyBaseline.active + 1);
    await db.chatAiAnswer.update({
      where: { id: work.id },
      data: { createdAt: new Date(row.createdAt.getTime() - 1) },
    });
    expect(probe(false).active).toBe(legacyBaseline.active);
    await patch('WAITING_NOTIFICATION');
    expect(probe(false).active).toBe(legacyBaseline.active + 1);
    await patch('NOTIFIED', {
      ...(mcp.actor as Prisma.JsonObject),
      userId: randomUUID(),
    });
    expect(probe(false).active).toBe(legacyBaseline.active + 1);
    await patch('NOTIFIED');
    expect(probe(false).active).toBe(legacyBaseline.active);
    for (const data of [
      { leaseUntil: new Date(Date.now() + 60000) },
      { leaseUntil: null, providerStartedAt: new Date() },
      { providerStartedAt: null, usage: {} },
      { usage: row.usage as Prisma.InputJsonValue, status: 'RUNNING' },
    ]) {
      await db.chatAiAnswer.update({ where: { id: row.id }, data });
      expect(probe().active).toBe(baseline.active + 1);
    }
  } finally {
    await db.chatAiAnswer.updateMany({
      where: {
        conversationId: conversation,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: { status: 'CANCELLED', completedAt: new Date(), leaseUntil: null },
    });
  }
}, 15000);

it('F1 explicit SIWC counts authorized Projects through the same aggregate service', async () => {
  const conversation = (
    await post('B', '/conversations', {
      scope: 'ALL',
      clientKey: randomUUID(),
    }).expect(201)
  ).body.id;
  const expected = await db.project.count({
    where: { organizationId, deletedAt: null },
  });
  const transport = vi
    .spyOn(app.get(ChatGptConnectionService), 'respond')
    .mockImplementation(async (_actor, _generation, raw) => {
      const input = raw as {
        input: { type?: string; output?: string }[];
        tools: string[];
      };
      expect(input.tools).toContain('count_projects');
      const result = input.input.find(
        (item) => item.type === 'function_call_output',
      );
      if (result) {
        expect(JSON.parse(result.output!)).toMatchObject({
          count: expected,
          entity_type: 'Project',
        });
        return {
          model: 'account-model',
          text: `Có ${expected} dự án được phép xem.`,
          calls: [],
          continuation: [],
          usage: null,
          requestId: 'f1-count-terminal',
        };
      }
      const call = {
        type: 'function_call' as const,
        namespace: 'galaxy' as const,
        name: 'count_projects' as const,
        call_id: 'f1-count',
        arguments: JSON.stringify({ status: null, search: null, mine: false }),
      };
      return {
        model: 'account-model',
        text: '',
        calls: [call],
        continuation: [call],
        usage: null,
        requestId: 'f1-count-tool',
      };
    });
  try {
    const answer = (
      await post('B', `/conversations/${conversation}/answers`, {
        question: 'OS đang có bao nhiêu dự án?',
        model: 'account-model',
        sourceIds: [],
        runMode: 'NORMAL',
        clientKey: randomUUID(),
      }).expect(201)
    ).body;
    await app
      .get(ProjectAiService)
      .run(users.owner!.actor, projects.B!, answer.id);
    const row = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: answer.id },
    });
    expect(row.status).toBe('COMPLETED');
    expect(row.answer).toContain(String(expected));
    expect(transport).toHaveBeenCalledTimes(2);
  } finally {
    transport.mockRestore();
  }
});
