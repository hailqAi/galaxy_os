import 'reflect-metadata';
const initialMcpEnv = vi.hoisted(() => {
  const keys = [
    'FEATURE_GALAXY_MCP',
    'APP_PUBLIC_ORIGIN',
    'GALAXY_MCP_ENCRYPTION_KEY',
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  process.env.FEATURE_GALAXY_MCP = 'true';
  process.env.APP_PUBLIC_ORIGIN = 'https://g00.example.test';
  process.env.GALAXY_MCP_ENCRYPTION_KEY = '07'.repeat(32);
  return previous;
});
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { assertG00Isolation } from '../scripts/g00-isolated-environment.mjs';
import { McpOAuth } from '../src/mcp/mcp.oauth';
import {
  createServer,
  request as httpRequest,
  Server,
  IncomingMessage,
} from 'node:http';
import { Workbook } from 'exceljs';
import { Webhook } from 'standardwebhooks';
import { McpNetwork } from '../src/mcp/mcp.network';
import { McpRemoteResponseError } from '../src/mcp/mcp.network';
import { PrismaService } from '../src/prisma.service';
import { McpJobsService } from '../src/mcp/mcp.jobs.service';
import { ProjectAiService } from '../src/project-chat/project-ai.service';
import { McpResultsService } from '../src/mcp/mcp.results.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { redact } from '../src/security-redaction';
import { McpEventsService } from '../src/mcp/mcp.events.service';
import { docxFixture, textPdfFixture } from './document-fixtures';
import sharp from 'sharp';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { resolve } from 'node:path';

assertG00Isolation();
const db = new PrismaClient();
const run = randomUUID();
const scopes = 'galaxy.jobs.read galaxy.jobs.write galaxy.events';
let app: INestApplication,
  organizationId: string,
  projectId: string,
  conversationId: string;
const people: Record<string, { id: string; cookie: string }> = {};
let clientId: string, accessToken: string, refreshToken: string, jobId: string;
let fixture: Server, fixturePort: number, quotation: Buffer;
const signingSecret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
const delivered: Record<string, unknown>[] = [];
let verifications = 0;
let fileFailures = 0;
let eventCallbackStatus = 200;
let verificationBarrier:
  | {
      reached: Promise<void>;
      markReached(): void;
      blocked: Promise<void>;
      release(): void;
    }
  | undefined;
let errorSaveBarrier:
  | {
      reached: Promise<void>;
      markReached(): void;
      blocked: Promise<void>;
      release(): void;
    }
  | undefined;
const chunkedOutputs = new Set<string>();
const outputFiles = new Map<string, { bytes: Buffer; mime: string }>();
const videoPath = join(process.env.G00_TEST_ROOT!, 'e05-video-' + run + '.mp4');
const api = () => request(app.getHttpServer());
const rpc = (
  method: string,
  params: Record<string, unknown>,
  token = accessToken,
) => {
  let call = api()
    .post('/mcp')
    .set('Authorization', 'Bearer ' + token)
    .set('Accept', 'application/json, text/event-stream')
    .set('MCP-Protocol-Version', '2026-07-28')
    .set('Mcp-Method', method);
  if (typeof params.name === 'string') call = call.set('Mcp-Name', params.name);
  return call.send({
    jsonrpc: '2.0',
    id: randomUUID(),
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': {
          name: 'Galaxy acceptance',
          version: '1',
        },
      },
    },
  });
};
const tool = (name: string, args: unknown, token = accessToken) =>
  rpc(
    'tools/call',
    {
      name,
      arguments: [
        'galaxy_report_job_progress',
        'galaxy_submit_job_result',
      ].includes(name)
        ? { attempt: 1, ...(args as Record<string, unknown>) }
        : args,
    },
    token,
  );
const fixtureRequest = (
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: string,
) =>
  new Promise<IncomingMessage>((resolve, reject) => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port: fixturePort, path, method, headers },
      resolve,
    );
    req.on('error', reject);
    req.end(body);
  });

async function stopFixtureSubscriptions(ids: string[]) {
  await db.mcpSubscription.updateMany({
    where: { organizationId: { in: ids } },
    data: { revokedAt: new Date() },
  });
  await db.mcpDelivery.updateMany({
    where: {
      subscription: { organizationId: { in: ids } },
      state: { in: ['PENDING', 'DELIVERING'] },
    },
    data: { state: 'CANCELLED', leaseToken: null, leaseUntil: null },
  });
}

beforeAll(async () => {
  // A prior interrupted G00 run must not consume this run's global dispatch batch.
  const previous = await db.organization.findMany({
    where: { name: 'E05 synthetic MCP tenant' },
    select: { id: true, slug: true },
  });
  await stopFixtureSubscriptions(
    previous
      .filter((tenant) => /^e05-[0-9a-f-]{36}$/.test(tenant.slug))
      .map((tenant) => tenant.id),
  );
  const workbook = new Workbook(),
    sheet = workbook.addWorksheet('Quotation');
  sheet.addRows([
    ['Code', 'Quantity', 'Unit price', 'Total'],
    ['Q-001', 2, 125000, { formula: 'B2*C2', result: 250000 }],
    ['Q-002', 3, 50000, { formula: 'B3*C3', result: 150000 }],
  ]);
  quotation = Buffer.from(await workbook.xlsx.writeBuffer());
  outputFiles.set('/files/result.docx', {
    bytes: await docxFixture(),
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  outputFiles.set('/files/result.pdf', {
    bytes: await textPdfFixture(1),
    mime: 'application/pdf',
  });
  outputFiles.set('/files/result.png', {
    bytes: await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer(),
    mime: 'image/png',
  });
  execFileSync(
    '/usr/bin/ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=16x16:d=0.2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-y',
      videoPath,
    ],
    { timeout: 30000 },
  );
  const media = JSON.parse(
    execFileSync(
      '/usr/bin/ffprobe',
      ['-v', 'error', '-show_streams', '-of', 'json', videoPath],
      { encoding: 'utf8' },
    ),
  );
  expect(media.streams[0].codec_type).toBe('video');
  outputFiles.set('/files/result.mp4', {
    bytes: await readFile(videoPath),
    mime: 'video/mp4',
  });
  fixture = createServer(async (req, res) => {
    if (req.url?.startsWith('/probe/')) {
      const path = req.url.slice(6);
      const oauth = app.get(McpOAuth);
      res.setHeader('content-type', 'application/json');
      if (path.includes('oauth-protected-resource'))
        return res.end(JSON.stringify(oauth.protectedResource()));
      if (path.includes('oauth-authorization-server'))
        return res.end(JSON.stringify(oauth.metadata()));
      if (path === '/mcp') {
        res.setHeader(
          'www-authenticate',
          'Bearer resource_metadata="https://g00.example.test/.well-known/oauth-protected-resource/mcp"',
        );
        return res.writeHead(401).end('{"error":"invalid_token"}');
      }
      return res.writeHead(400).end(
        JSON.stringify({
          error: path.endsWith('register')
            ? 'invalid_client_metadata'
            : path.endsWith('token')
              ? 'unsupported_grant_type'
              : 'invalid_request',
          iss: oauth.origin(),
        }),
      );
    }
    const output = outputFiles.get(req.url ?? '');
    if (output) {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        ...(!chunkedOutputs.has(req.url ?? '') && {
          'content-length': output.bytes.length,
        }),
      });
      res.end(output.bytes);
      return;
    }
    if (req.url === '/files/result.xlsx') {
      if (fileFailures-- > 0) {
        res.writeHead(503).end('temporarily unavailable');
        return;
      }
      res.writeHead(200, {
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-length': quotation.length,
      });
      res.end(quotation);
      return;
    }
    const parts: Buffer[] = [];
    for await (const part of req) parts.push(part as Buffer);
    try {
      const payload = new Webhook(signingSecret).verify(
        Buffer.concat(parts).toString('utf8'),
        req.headers as Record<string, string>,
      ) as Record<string, unknown>;
      res.setHeader('content-type', 'application/json');
      if (payload.type === 'verification') {
        verifications++;
        res.end(JSON.stringify({ challenge: payload.challenge }));
      } else {
        delivered.push(payload);
        res.writeHead(eventCallbackStatus).end('{}');
      }
    } catch {
      res.writeHead(400).end('{}');
    }
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  fixturePort = (fixture.address() as { port: number }).port;
  organizationId = (
    await db.organization.create({
      data: {
        slug: 'e05-' + run,
        name: 'E05 synthetic MCP tenant',
        timezone: 'Asia/Bangkok',
        defaultCurrency: 'VND',
      },
    })
  ).id;
  const role = await db.role.create({
    data: {
      organizationId,
      code: 'e05-' + run,
      name: 'MCP synthetic user',
      maximumScope: 'SYSTEM',
      permissions: {
        create: [
          'ai.invoke',
          'project.read',
          'task.read',
          'file.upload',
          'file.read',
          'file.download',
        ].map((code) => ({ permission: { connect: { code } } })),
      },
    },
  });
  const passwordHash = await hash('synthetic-e05-only', 4);
  for (const who of ['owner', 'other']) {
    const user = await db.user.create({
      data: {
        email: `${who}-${run}@example.test`,
        normalizedEmail: `${who}-${run}@example.test`,
        displayName: who,
        status: 'active',
        credential: { create: { passwordHash, mustChangePassword: false } },
        organizationMembers: { create: { organizationId, kind: 'INTERNAL' } },
        roles: {
          create: { organizationId, roleId: role.id, scopeType: 'SYSTEM' },
        },
      },
    });
    people[who] = { id: user.id, cookie: '' };
  }
  const customer = await db.customer.create({
    data: {
      organizationId,
      type: 'INDIVIDUAL',
      displayName: 'Synthetic MCP quotation customer',
      createdBy: people.owner!.id,
      updatedBy: people.owner!.id,
    },
  });
  projectId = (
    await db.project.create({
      data: {
        organizationId,
        customerId: customer.id,
        code: 'E05-' + run,
        name: 'Synthetic MCP Project',
        status: 'ACTIVE',
        createdBy: people.owner!.id,
        updatedBy: people.owner!.id,
      },
    })
  ).id;
  for (const person of Object.values(people))
    await db.chatProjectGrant.create({
      data: {
        organizationId,
        projectId,
        userId: person.id,
        grantedBy: people.owner!.id,
        actions: ['INVOKE'],
        roomCeiling: [],
        effectiveAt: new Date(Date.now() - 60000),
      },
    });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(McpNetwork)
    .useValue({
      request: McpNetwork.prototype.request,
      post: async (
        url: string,
        data: { body: string; headers: Record<string, string> },
      ) => {
        if (url !== 'https://callback.example.com/events')
          throw new Error('MCP_REMOTE_UNAVAILABLE');
        if (
          data.body.includes('"type":"verification"') &&
          verificationBarrier
        ) {
          const barrier = verificationBarrier;
          barrier.markReached();
          await barrier.blocked;
        }
        const response = await fixtureRequest(
            '/events',
            'POST',
            data.headers,
            data.body,
          ),
          chunks: Buffer[] = [];
        for await (const chunk of response) chunks.push(chunk as Buffer);
        if (response.statusCode !== 200)
          throw new McpRemoteResponseError(response.statusCode ?? 500);
        return {
          status: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        };
      },
      download: async (url: string) => {
        const remote = new URL(url);
        if (
          remote.origin !== 'https://files.example.com' ||
          (remote.pathname !== '/files/result.xlsx' &&
            !outputFiles.has(remote.pathname))
        )
          throw new Error('MCP_REMOTE_UNAVAILABLE');
        const response = await fixtureRequest(remote.pathname, 'GET');
        if (response.statusCode !== 200) {
          response.destroy();
          throw new Error('MCP_REMOTE_RESPONSE_FAILED');
        }
        return response;
      },
    })
    .compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'mcp', method: RequestMethod.ALL },
      { path: 'mcp/{*path}', method: RequestMethod.ALL },
      { path: '.well-known/{*path}', method: RequestMethod.ALL },
    ],
  });
  await app.listen(0, '127.0.0.1');
  for (const [who, person] of Object.entries(people)) {
    const login = await api()
      .post('/api/v1/auth/login')
      .send({
        email: `${who}-${run}@example.test`,
        password: 'synthetic-e05-only',
      })
      .expect(201);
    person.cookie = String(
      (login.headers['set-cookie'] as unknown as string[])[0],
    ).split(';')[0]!;
  }
  const conversation = await api()
    .post(`/api/v1/project-chat/projects/${projectId}/ai/conversations`)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({ clientKey: randomUUID(), scope: 'ALL' })
    .expect(201);
  conversationId = conversation.body.id;
}, 30000);
afterAll(async () => {
  if (organizationId) await stopFixtureSubscriptions([organizationId]);
  if (app) await app.close();
  if (fixture)
    await new Promise<void>((resolve) => fixture.close(() => resolve()));
  await db.$disconnect();
  await rm(videoPath, { force: true });
  for (const [key, value] of Object.entries(initialMcpEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function connect(
  who = 'owner',
  scope = scopes,
  extensions: Record<string, string> = {},
) {
  const verifier = 'b'.repeat(43);
  const started = await api()
    .get('/mcp/oauth/authorize')
    .query({
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      resource: 'https://g00.example.test/mcp',
      response_type: 'code',
      scope,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: randomUUID(),
      ...extensions,
    })
    .expect(302);
  const id = new URL(
    started.headers.location!,
    'https://g00.example.test',
  ).searchParams.get('request');
  const consent = await api()
    .post(`/api/v1/mcp-auth/requests/${id}/consent`)
    .set('Cookie', people[who]!.cookie)
    .send({})
    .expect(201);
  const tokens = await api()
    .post('/mcp/oauth/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: new URL(consent.body.redirect).searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      resource: 'https://g00.example.test/mcp',
    })
    .expect(200);
  return tokens.body as { access_token: string; refresh_token: string };
}

const newJob = async (
  outputFormat?: 'xlsx',
  question = 'Synthetic recovery job',
  threadId = conversationId,
) => {
  const created = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${threadId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question,
      sourceIds: [],
      ...(outputFormat && { outputFormat }),
    })
    .expect(201);
  return created.body.id as string;
};

it('publishes inbound OAuth discovery and a bearer challenge without login redirects', async () => {
  const resource = await api()
    .get('/.well-known/oauth-protected-resource/mcp')
    .expect(200);
  expect(resource.body).toMatchObject({
    resource: 'https://g00.example.test/mcp',
    authorization_servers: ['https://g00.example.test'],
  });
  const denied = await api()
    .post('/mcp')
    .send({ jsonrpc: '2.0', id: 1, method: 'server/discover' })
    .expect(401);
  expect(denied.headers['www-authenticate']).toContain(
    'oauth-protected-resource/mcp',
  );
  expect(denied.headers.location).toBeUndefined();
});

it('lets an authorized MCP user open Project AI without granting SIWC administration', async () => {
  const policy = process.env.GALAXY_AI_EXECUTION_POLICY;
  const feature = process.env.FEATURE_GALAXY_MCP;
  try {
    process.env.GALAXY_AI_EXECUTION_POLICY = 'CHATGPT_PLAN_ONLY';
    const result = await api()
      .get(`/api/v1/project-chat/projects/${projectId}/ai`)
      .set('Cookie', people.owner!.cookie)
      .expect(200);
    expect(result.body.mcpEnabled).toBe(true);
    expect(result.body.models).toEqual([]);
    await api()
      .get('/api/v1/system/settings/chatgpt-connection')
      .set('Cookie', people.owner!.cookie)
      .expect(403);
    process.env.FEATURE_GALAXY_MCP = 'false';
    await api()
      .get(`/api/v1/project-chat/projects/${projectId}/ai`)
      .set('Cookie', people.owner!.cookie)
      .expect(403);
  } finally {
    if (policy === undefined) delete process.env.GALAXY_AI_EXECUTION_POLICY;
    else process.env.GALAXY_AI_EXECUTION_POLICY = policy;
    if (feature === undefined) delete process.env.FEATURE_GALAXY_MCP;
    else process.env.FEATURE_GALAXY_MCP = feature;
  }
});

it('registers actual client redirects and exchanges one S256 code for resource-bound tokens', async () => {
  const registration = await api()
    .post('/mcp/oauth/register')
    .send({
      redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
      client_name: 'Synthetic Work client',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })
    .expect(201);
  clientId = registration.body.client_id;
  const verifier = 'a'.repeat(43);
  const authorization = await api()
    .get('/mcp/oauth/authorize')
    .query({
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      resource: 'https://g00.example.test/mcp',
      response_type: 'code',
      scope: scopes,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'synthetic-state',
    })
    .expect(302);
  const consentId = new URL(
    authorization.headers.location!,
    'https://g00.example.test',
  ).searchParams.get('request');
  const consent = await api()
    .post(`/api/v1/mcp-auth/requests/${consentId}/consent`)
    .set('Cookie', people.owner!.cookie)
    .send({})
    .expect(201);
  const redirect = new URL(consent.body.redirect);
  expect(redirect.origin).toBe('https://chatgpt.com');
  expect(redirect.searchParams.get('iss')).toBe('https://g00.example.test');
  const body = {
    grant_type: 'authorization_code',
    client_id: clientId,
    code: redirect.searchParams.get('code'),
    code_verifier: verifier,
    redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    resource: 'https://g00.example.test/mcp',
  };
  const oauth = app.get(McpOAuth);
  const authorizationGrant = await db.mcpGrant.findFirstOrThrow({
    where: { clientId, kind: 'AUTHORIZATION' },
  });
  expect((await oauth.principal(authorizationGrant.id)).actor.userId).toBe(
    people.owner!.id,
  );
  const tokens = await api()
    .post('/mcp/oauth/token')
    .type('form')
    .send(body)
    .expect(200);
  accessToken = tokens.body.access_token;
  refreshToken = tokens.body.refresh_token;
  expect(accessToken).toBeTruthy();
  expect(refreshToken).toBeTruthy();
  await api().post('/mcp/oauth/token').type('form').send(body).expect(400);
  await api()
    .post('/mcp/oauth/token')
    .type('form')
    .send({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
      resource: 'https://other.example.com/mcp',
    })
    .expect(400);
});

it('counts and resolves real Projects directly, with aggregate filters and no Work job', async () => {
  const before = await db.chatAiAnswer.count({ where: { organizationId } });
  const base = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  await db.project.createMany({
    data: ['PLANNING', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map(
      (status, i) => ({
        organizationId,
        customerId: base.customerId,
        code: 'F1-' + run + '-' + i,
        name: 'Foundation scoped Project ' + i,
        status: status as typeof base.status,
        createdBy: people.owner!.id,
        updatedBy: people.owner!.id,
      }),
    ),
  });
  await db.project.create({
    data: {
      organizationId,
      customerId: base.customerId,
      code: 'F1-deleted-' + run,
      name: 'Deleted Foundation Project',
      deletedAt: new Date(),
      createdBy: people.owner!.id,
      updatedBy: people.owner!.id,
    },
  });
  const read = await connect('owner', 'galaxy.data.read');
  const counted = await tool(
    'galaxy_count_projects',
    {},
    read.access_token,
  ).expect(200);
  expect(counted.body.result.structuredContent).toMatchObject({
    count: 5,
    entity_type: 'Project',
    filters: { deleted: 'excluded' },
  });
  const active = await tool(
    'galaxy_count_projects',
    { status: 'ACTIVE' },
    read.access_token,
  ).expect(200);
  expect(active.body.result.structuredContent.count).toBe(1);
  const listed = await tool(
    'galaxy_list_projects',
    { page: 1, page_size: 1 },
    read.access_token,
  ).expect(200);
  expect(listed.body.result.structuredContent).toMatchObject({ total: 5 });
  expect(listed.body.result.structuredContent.items).toHaveLength(1);
  const resolved = await tool(
    'galaxy_get_project',
    { project: base.name },
    read.access_token,
  ).expect(200);
  expect(resolved.body.result.structuredContent.project.id).toBe(projectId);
  const denied = await tool('galaxy_count_projects', {}).expect(200);
  expect(denied.body.result.isError).toBe(true);
  expect(denied.body.result._meta['mcp/www_authenticate'][0]).toContain(
    'galaxy.data.read',
  );
  expect(await db.chatAiAnswer.count({ where: { organizationId } })).toBe(
    before,
  );
});

it('answers AUTO Project count in the original Galaxy thread without a provider or outbox', async () => {
  const path = `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/executions`;
  const beforeEvents = await db.mcpOutbox.count({
    where: { answer: { organizationId } },
  });
  const command = {
    requested_executor: 'AUTO',
    clientKey: randomUUID(),
    question: 'OS đang có bao nhiêu dự án?',
    sourceIds: [],
  };
  const first = await api()
    .post(path)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send(command)
    .expect(201);
  expect(first.body).toMatchObject({
    status: 'COMPLETED',
    route: 'GALAXY_DATA',
    requested_executor: 'AUTO',
    effective_executor: 'GALAXY_DATA',
  });
  const saved = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: first.body.id },
  });
  expect(saved).toMatchObject({
    projectId,
    conversationId,
    ownerId: people.owner!.id,
    question: command.question,
    model: null,
    providerStartedAt: null,
  });
  expect(saved.answer).toContain('5');
  const retried = await api()
    .post(path)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send(command)
    .expect(201);
  expect(retried.body.id).toBe(first.body.id);
  await api()
    .post(path)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({ ...command, question: 'Có bao nhiêu dự án đang triển khai?' })
    .expect(409);
  expect(
    await db.mcpOutbox.count({ where: { answer: { organizationId } } }),
  ).toBe(beforeEvents);
  const history = await api()
    .get(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .expect(200);
  expect(
    history.body.answers.find((a: { id: string }) => a.id === saved.id),
  ).toMatchObject({
    status: 'COMPLETED',
    route: 'GALAXY_DATA',
    answer: saved.answer,
    usage: null,
  });
  const source = history.body.answers.find(
    (a: { id: string }) => a.id === saved.id,
  ).memorySource;
  await api()
    .post(path)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({ ...command, clientKey: randomUUID() })
    .expect(201);
  await api()
    .post(`/api/v1/project-chat/projects/${projectId}/ai/memory`)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      content: 'Test-only count receipt',
      category: 'NOTE',
      verification: 'UNVERIFIED',
      visibility: 'PRIVATE',
      sourceRefs: [source],
    })
    .expect(201);
});

it('keeps confirmed Project rules in Work context when the request uses different words', async () => {
  const rule = 'Test-only: giảm 10 phần trăm, VAT 8 phần trăm sau chiết khấu.';
  const memory = await api()
    .post(`/api/v1/project-chat/projects/${projectId}/ai/memory`)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      content: rule,
      category: 'DECISION',
      verification: 'USER_CONFIRMED',
      visibility: 'PRIVATE',
    })
    .expect(201);
  const created = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question: 'Đọc bảng giá và áp dụng quy tắc đã xác nhận để tạo workbook.',
      sourceIds: [],
    })
    .expect(201);
  const authorization = await connect('owner', scopes);
  let content = '',
    offset = 0;
  for (;;) {
    const result = await tool(
      'galaxy_get_job_context',
      { job_id: created.body.id, offset },
      authorization.access_token,
    ).expect(200);
    expect(result.body.result.isError).not.toBe(true);
    const page = result.body.result.structuredContent;
    content += page.data;
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  const context = JSON.parse(content);
  expect(context.memories).toContainEqual(
    expect.objectContaining({
      sourceId: memory.body.id,
      content: rule,
      verification: 'USER_CONFIRMED',
      version: memory.body.version,
    }),
  );
});

it('allows read-only consent without ai.invoke and rechecks live Project permissions', async () => {
  const assignment = await db.userRole.findFirstOrThrow({
    where: { userId: people.other!.id, organizationId },
  });
  const readRole = await db.role.create({
    data: {
      organizationId,
      code: 'f1-read-' + run,
      name: 'Foundation reader',
      maximumScope: 'SELF',
      permissions: {
        create: [{ permission: { connect: { code: 'project.read' } } }],
      },
    },
  });
  try {
    await db.userRole.update({
      where: { id: assignment.id },
      data: { roleId: readRole.id, scopeType: 'SELF' },
    });
    const read = await connect('other', 'galaxy.data.read');
    let count = await tool(
      'galaxy_count_projects',
      {},
      read.access_token,
    ).expect(200);
    expect(count.body.result.structuredContent.count).toBe(0);
    await db.projectMember.create({
      data: {
        organizationId,
        projectId,
        userId: people.other!.id,
        createdBy: people.owner!.id,
      },
    });
    count = await tool('galaxy_count_projects', {}, read.access_token).expect(
      200,
    );
    expect(count.body.result.structuredContent.count).toBe(1);
    const otherProject = await db.project.findFirstOrThrow({
      where: { organizationId, id: { not: projectId }, deletedAt: null },
    });
    const hidden = await tool(
      'galaxy_get_project',
      { project: otherProject.id },
      read.access_token,
    ).expect(200);
    expect(hidden.body.result.isError).toBe(true);
    await db.projectMember.deleteMany({
      where: { projectId, userId: people.other!.id },
    });
    const revoked = await tool(
      'galaxy_get_project',
      { project: projectId },
      read.access_token,
    ).expect(200);
    expect(revoked.body.result.isError).toBe(true);
    await db.userRole.update({
      where: { id: assignment.id },
      data: { status: 'archived' },
    });
    const forbidden = await tool(
      'galaxy_count_projects',
      {},
      read.access_token,
    ).expect(200);
    expect(forbidden.body.result.isError).toBe(true);
  } finally {
    await db.userRole.update({
      where: { id: assignment.id },
      data: {
        roleId: assignment.roleId,
        scopeType: assignment.scopeType,
        status: assignment.status,
      },
    });
    await db.projectMember.deleteMany({
      where: { projectId, userId: people.other!.id },
    });
  }
});

it('lists and reads the connected owners private Chat attachments without a job', async () => {
  const read = await connect('owner', 'galaxy.data.read');
  const outsider = await connect('other', 'galaxy.data.read');
  const bytes = Buffer.from(
    'Private chat input code E05-A001; quantity 3; unit price 100000.',
  );
  const uploaded = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/files`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .field('clientKey', randomUUID())
    .attach('file', bytes, {
      filename: 'private-chat-input.txt',
      contentType: 'text/plain',
    })
    .expect(201);
  const listed = await tool(
    'galaxy_list_files',
    { project: projectId, search: 'private-chat-input' },
    read.access_token,
  ).expect(200);
  expect(listed.body.result.structuredContent.total).toBe(1);
  const file = listed.body.result.structuredContent.private_chat_files.items[0];
  expect(file).toMatchObject({
    id: uploaded.body.id,
    originalFilename: 'private-chat-input.txt',
    version: 1,
  });
  const second = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/files`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .field('clientKey', randomUUID())
    .attach('file', Buffer.from('Second private attachment'), {
      filename: 'private-chat-input-2.txt',
      contentType: 'text/plain',
    })
    .expect(201);
  const page1 = (
    await tool(
      'galaxy_list_files',
      { project: projectId, search: 'private-chat-input', page_size: 1 },
      read.access_token,
    ).expect(200)
  ).body.result.structuredContent;
  const page2 = (
    await tool(
      'galaxy_list_files',
      {
        project: projectId,
        search: 'private-chat-input',
        page_size: 1,
        page: 2,
      },
      read.access_token,
    ).expect(200)
  ).body.result.structuredContent;
  expect(page1.total).toBe(2);
  expect(page1.private_chat_files.totalPages).toBe(2);
  expect(
    new Set(
      [...page1.items, ...page2.items].map((item: { id: string }) => item.id),
    ),
  ).toEqual(new Set([uploaded.body.id, second.body.id]));
  const hidden = (
    await tool(
      'galaxy_list_files',
      { project: projectId, search: 'private-chat-input' },
      outsider.access_token,
    ).expect(200)
  ).body.result;
  expect(JSON.stringify(hidden)).not.toContain('private-chat-input.txt');
  const source = await tool(
    'galaxy_read_file',
    { file_id: file.id, version: file.version },
    read.access_token,
  ).expect(200);
  expect(source.body.result.structuredContent.text.content).toBe(
    bytes.toString(),
  );
  const url = new URL(source.body.result.structuredContent.download_url);
  expect(
    (
      await api()
        .get(url.pathname + url.search)
        .expect(200)
    ).text,
  ).toBe(bytes.toString());
  expect(
    (
      await tool(
        'galaxy_read_file',
        { file_id: file.id, version: 2 },
        read.access_token,
      ).expect(200)
    ).body.result.isError,
  ).toBe(true);
  expect(
    (
      await tool(
        'galaxy_read_file',
        { file_id: file.id, version: 1 },
        outsider.access_token,
      ).expect(200)
    ).body.result.isError,
  ).toBe(true);
  const assignment = await db.userRole.findFirstOrThrow({
    where: { organizationId, userId: people.owner!.id },
  });
  const permission = await db.permission.findUniqueOrThrow({
    where: { code: 'project.stage1.finance.read' },
  });
  const prior = await db.rolePermission.findUnique({
    where: {
      roleId_permissionId: {
        roleId: assignment.roleId,
        permissionId: permission.id,
      },
    },
  });
  if (!prior)
    await db.rolePermission.create({
      data: { roleId: assignment.roleId, permissionId: permission.id },
    });
  const financial = await db.projectStageOneDocument.create({
    data: {
      projectId,
      contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
      stageKey: 'STAGE_1',
      workstreamKey: 'FINANCIAL_PLANNING',
      step: 'FINANCIAL_PLANNING',
      documentType: 'PRELIMINARY_FINANCIAL_PLAN',
      displayName: 'Private attachment financial classification fixture',
      currentFileAssetId: uploaded.body.fileAssetId,
      currentVersion: 1,
      status: 'UPLOADED',
      submittedOfficerId: people.owner!.id,
      actualActorId: people.owner!.id,
      idempotencyKey: randomUUID(),
    },
  });
  try {
    expect(
      (
        await tool(
          'galaxy_read_file',
          { file_id: file.id, version: 1 },
          read.access_token,
        ).expect(200)
      ).body.result.isError,
    ).not.toBe(true);
    await db.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: assignment.roleId,
          permissionId: permission.id,
        },
      },
    });
    const after = (
      await tool(
        'galaxy_list_files',
        { project: projectId, search: 'private-chat-input' },
        read.access_token,
      ).expect(200)
    ).body.result.structuredContent;
    expect(
      after.items.some((item: { id: string }) => item.id === file.id),
    ).toBe(false);
    expect(after.total).toBe(1);
    expect(
      (
        await tool(
          'galaxy_read_file',
          { file_id: file.id, version: 1 },
          read.access_token,
        ).expect(200)
      ).body.result.isError,
    ).toBe(true);
    await api()
      .get(url.pathname + url.search)
      .expect(404);
  } finally {
    await db.projectStageOneDocument.delete({ where: { id: financial.id } });
    await db.rolePermission.deleteMany({
      where: { roleId: assignment.roleId, permissionId: permission.id },
    });
    if (prior)
      await db.rolePermission.create({
        data: { roleId: prior.roleId, permissionId: prior.permissionId },
      });
  }
});

it('reads original file bytes and versioned memory without a job, and saves one idempotent note', async () => {
  const read = await connect('owner', 'galaxy.data.read galaxy.data.write');
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
  });
  const bytes = Buffer.from(
    'F1 original source 7392\nCode Q-001; quantity 2; price 125000\n',
  );
  const uploaded = await api()
    .post('/api/v1/files')
    .set('Cookie', people.owner!.cookie)
    .field('entityType', 'Project')
    .field('entityId', projectId)
    .field('category', 'E05 fixture')
    .attach('file', bytes, {
      filename: 'f1-source.txt',
      contentType: 'text/plain',
    })
    .expect(201);
  const listed = await tool(
    'galaxy_list_files',
    { project: project.name },
    read.access_token,
  ).expect(200);
  expect(listed.body.result.content[0].text).toContain('"items"');
  expect(listed.body.result).toHaveProperty('structuredContent');
  expect(
    listed.body.result.structuredContent.items.some(
      (file: { id: string }) => file.id === uploaded.body.id,
    ),
  ).toBe(true);
  const source = await tool(
    'galaxy_read_file',
    { file_id: uploaded.body.id, version: 1 },
    read.access_token,
  ).expect(200);
  expect(source.body.result.structuredContent).toMatchObject({
    file_id: uploaded.body.id,
    checksum: createHash('sha256').update(bytes).digest('hex'),
    text: { content: bytes.toString('utf8'), next_offset: null },
  });
  const url = new URL(source.body.result.structuredContent.download_url);
  const downloaded = await api()
    .get(url.pathname + url.search)
    .expect(200);
  expect(downloaded.text).toBe(bytes.toString('utf8'));
  const note = {
    project: project.id,
    operation_id: randomUUID(),
    content: 'E05 test-only confirmed discount rule',
    visibility: 'PRIVATE',
    category: 'NOTE',
    verification: 'UNVERIFIED',
  };
  const saved = await tool(
    'galaxy_save_project_note',
    note,
    read.access_token,
  ).expect(200);
  expect(saved.body.result.isError).not.toBe(true);
  const retried = await tool(
    'galaxy_save_project_note',
    note,
    read.access_token,
  ).expect(200);
  expect(retried.body.result.structuredContent).toEqual(
    saved.body.result.structuredContent,
  );
  const changed = await tool(
    'galaxy_save_project_note',
    { ...note, content: 'changed payload' },
    read.access_token,
  ).expect(200);
  expect(changed.body.result.isError).toBe(true);
  const update = {
    project: project.id,
    memory_id: saved.body.result.structuredContent.memory.id,
    expected_version: saved.body.result.structuredContent.memory.version,
    operation_id: randomUUID(),
    content: 'Updated test note',
    category: 'NOTE',
    verification: 'UNVERIFIED',
  };
  const updated = await tool(
    'galaxy_update_project_note',
    update,
    read.access_token,
  ).expect(200);
  expect(updated.body.result.isError).not.toBe(true);
  const again = await tool(
    'galaxy_update_project_note',
    update,
    read.access_token,
  ).expect(200);
  expect(again.body.result.structuredContent).toEqual(
    updated.body.result.structuredContent,
  );
  const stale = await tool(
    'galaxy_update_project_note',
    { ...update, operation_id: randomUUID(), content: 'Stale edit' },
    read.access_token,
  ).expect(200);
  expect(stale.body.result.isError).toBe(true);
  const memory = await tool(
    'galaxy_get_project_memory',
    { project: project.name },
    read.access_token,
  ).expect(200);
  expect(JSON.stringify(memory.body.result.structuredContent)).toContain(
    update.content,
  );
  const authorization = (
    await app.get(McpOAuth).authenticate('Bearer ' + read.access_token)
  ).authorizationId;
  await db.mcpGrant.update({
    where: { id: authorization },
    data: { revokedAt: new Date() },
  });
  expect(
    (await api().get(url.pathname + url.search)).status,
  ).toBeGreaterThanOrEqual(400);
});

it('requires XLSX and PDF from the original request even without an output dropdown', async () => {
  const created = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question: 'Lập báo giá và trả XLSX cùng PDF.',
      sourceIds: [],
    })
    .expect(201);
  const job = await tool('galaxy_get_job', { job_id: created.body.id }).expect(
    200,
  );
  expect(job.body.result.structuredContent.requested_outputs).toEqual([
    'xlsx',
    'pdf',
  ]);
  const textOnly = await tool('galaxy_submit_job_result', {
    job_id: created.body.id,
    submission_id: randomUUID(),
    sequence: 0,
    content: 'Tôi đã tạo file.',
    finalize: true,
  }).expect(200);
  expect(textOnly.body.result.isError).toBe(true);
  expect(
    (
      await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: created.body.id },
      })
    ).status,
  ).not.toBe('COMPLETED');
});

it('reads typed Project records through domain permissions without creating a job', async () => {
  const read = await connect('owner', 'galaxy.data.read');
  const task = await db.task.create({
    data: {
      organizationId,
      projectId,
      title: 'F1 real Task record',
      createdBy: people.owner!.id,
      updatedBy: people.owner!.id,
    },
  });
  const list = await tool(
    'galaxy_list_project_records',
    { project: 'Synthetic MCP Project', record_type: 'task' },
    read.access_token,
  ).expect(200);
  expect(
    list.body.result.structuredContent.items.some(
      (record: { id: string }) => record.id === task.id,
    ),
  ).toBe(true);
  const get = await tool(
    'galaxy_get_record',
    {
      project: 'Synthetic MCP Project',
      record_type: 'task',
      record_id: task.id,
    },
    read.access_token,
  ).expect(200);
  expect(get.body.result.structuredContent.record).toMatchObject({
    id: task.id,
    version: 1,
    title: task.title,
  });
  const denied = await tool(
    'galaxy_list_project_records',
    { project: 'Synthetic MCP Project', record_type: 'contract' },
    read.access_token,
  ).expect(200);
  expect(denied.body.result.isError).toBe(true);
  const otherProject = await db.project.create({
    data: {
      organizationId,
      customerId: (
        await db.project.findUniqueOrThrow({ where: { id: projectId } })
      ).customerId,
      code: 'F1-other-' + run,
      name: 'F1 unrelated Project',
      createdBy: people.owner!.id,
      updatedBy: people.owner!.id,
    },
  });
  const wrong = await tool(
    'galaxy_get_record',
    { project: otherProject.id, record_type: 'task', record_id: task.id },
    read.access_token,
  ).expect(200);
  expect(wrong.body.result.isError).toBe(true);
});

it('searches Project names through the shared search service with current module permissions', async () => {
  const assignment = await db.userRole.findFirstOrThrow({
    where: { organizationId, userId: people.owner!.id },
  });
  await db.rolePermission.create({
    data: {
      role: { connect: { id: assignment.roleId } },
      permission: { connect: { code: 'search.read' } },
    },
  });
  const read = await connect('owner', 'galaxy.data.read');
  const result = await tool(
    'galaxy_search',
    { query: 'Synthetic MCP', entity_types: ['Project'] },
    read.access_token,
  ).expect(200);
  expect(result.body.result.structuredContent.groups).toContainEqual(
    expect.objectContaining({
      entityType: 'Project',
      total: 1,
      items: [expect.objectContaining({ id: projectId })],
    }),
  );
});

it('reads full purchase request lines for an organization reader outside Project membership', async () => {
  const assignment = await db.userRole.findFirstOrThrow({
    where: { organizationId, userId: people.owner!.id },
  });
  await db.rolePermission.create({
    data: {
      role: { connect: { id: assignment.roleId } },
      permission: { connect: { code: 'purchase_request.read' } },
    },
  });
  const project = await db.project.create({
    data: {
      organizationId,
      customerId: (
        await db.project.findUniqueOrThrow({ where: { id: projectId } })
      ).customerId,
      code: 'F1-proc-' + run,
      name: 'F1 procurement nonmember',
      createdBy: people.owner!.id,
      updatedBy: people.owner!.id,
    },
  });
  const record = await db.purchaseRequest.create({
    data: {
      organizationId,
      projectId: project.id,
      requestNumber: 'F1-' + run,
      sourceType: 'MANUAL',
      requestedById: people.owner!.id,
      createdBy: people.owner!.id,
      updatedBy: people.owner!.id,
      lines: {
        create: {
          customDescription: 'Exact detail required',
          quantity: 2,
          unit: 'piece',
          currency: 'VND',
        },
      },
    },
  });
  const read = await connect('owner', 'galaxy.data.read');
  const listed = await tool(
    'galaxy_list_project_records',
    { project: project.id, record_type: 'purchase_request' },
    read.access_token,
  ).expect(200);
  expect(
    listed.body.result.structuredContent.items.map(
      (item: { id: string }) => item.id,
    ),
  ).toContain(record.id);
  const got = await tool(
    'galaxy_get_record',
    {
      project: project.id,
      record_type: 'purchase_request',
      record_id: record.id,
    },
    read.access_token,
  ).expect(200);
  expect(got.body.result.structuredContent.record.lines).toContainEqual(
    expect.objectContaining({ customDescription: 'Exact detail required' }),
  );
  const wrong = await tool(
    'galaxy_get_record',
    {
      project: projectId,
      record_type: 'purchase_request',
      record_id: record.id,
    },
    read.access_token,
  ).expect(200);
  expect(wrong.body.result.isError).toBe(true);
});

it('reads real Marketing workspace records without pretending they belong to a Project', async () => {
  const assignment = await db.userRole.findFirstOrThrow({
    where: { organizationId, userId: people.owner!.id },
  });
  for (const code of ['marketing.campaign.read', 'marketing.content.read'])
    await db.rolePermission.create({
      data: {
        role: { connect: { id: assignment.roleId } },
        permission: { connect: { code } },
      },
    });
  const campaign = await db.campaign.create({
    data: {
      organizationId,
      ownerId: people.owner!.id,
      name: 'F1 actual campaign fixture',
      brandEcosystem: 'Galaxycentre.vn',
    },
  });
  const content = await db.contentItem.create({
    data: {
      organizationId,
      authorId: people.owner!.id,
      campaignId: campaign.id,
      title: 'F1 actual content',
      originalContent: 'Original working text',
      brandEcosystem: 'Galaxycentre.vn',
    },
  });
  const read = await connect('owner', 'galaxy.data.read');
  const listed = await tool(
    'galaxy_list_workspace_records',
    { record_type: 'campaign' },
    read.access_token,
  ).expect(200);
  expect(listed.body.result.structuredContent.items).toContainEqual(
    expect.objectContaining({ id: campaign.id }),
  );
  expect(listed.body.result.structuredContent).toMatchObject({
    scope: 'AUTHORIZED_ORGANIZATION_RECORDS',
  });
  const record = await tool(
    'galaxy_get_workspace_record',
    { record_type: 'marketing_content', record_id: content.id },
    read.access_token,
  ).expect(200);
  expect(record.body.result.structuredContent.record).toMatchObject({
    id: content.id,
    originalContent: 'Original working text',
  });
  const permission = await db.permission.findUniqueOrThrow({
    where: { code: 'marketing.content.read' },
  });
  await db.rolePermission.delete({
    where: {
      roleId_permissionId: {
        roleId: assignment.roleId,
        permissionId: permission.id,
      },
    },
  });
  const denied = await tool(
    'galaxy_list_workspace_records',
    { record_type: 'marketing_content' },
    read.access_token,
  ).expect(200);
  await db.rolePermission.create({
    data: { roleId: assignment.roleId, permissionId: permission.id },
  });
  expect(denied.body.result.isError).toBe(true);
});

it('discovers tools and Events through MCP2 without changing SIWC', async () => {
  const discovery = await rpc('server/discover', {}).expect(200);
  expect(discovery.body.result.capabilities).toMatchObject({
    tools: {},
    events: {},
  });
  const listed = await rpc('tools/list', {}).expect(200);
  const events = await rpc('events/list', {}).expect(200);
  expect(events.body.result.events[0].delivery).toEqual(['webhook']);
  expect(
    listed.body.result.tools.map((entry: { name: string }) => entry.name),
  ).toContain('galaxy_submit_job_result');
  const submit = listed.body.result.tools.find(
    (entry: { name: string }) => entry.name === 'galaxy_submit_job_result',
  );
  expect(submit._meta['openai/fileParams']).toEqual(['files']);
  const projects = listed.body.result.tools.find(
    (entry: { name: string }) => entry.name === 'galaxy_list_projects',
  );
  expect(projects.outputSchema.properties).toHaveProperty('total');
  expect(projects.outputSchema.properties).toHaveProperty('items');
  expect(projects.outputSchema.required ?? []).not.toContain('job_id');
  const file = listed.body.result.tools.find(
    (entry: { name: string }) => entry.name === 'galaxy_read_file',
  );
  expect(file.outputSchema.properties).toHaveProperty('download_url');
});

it('lists only currently authorized own jobs and reports the actual waiting stage without creating work', async () => {
  const created = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question: 'Test job status',
      sourceIds: [],
    })
    .expect(201);
  const listed = await tool('galaxy_list_jobs', { project: projectId }).expect(
    200,
  );
  expect(listed.body.result.structuredContent.items).toContainEqual(
    expect.objectContaining({
      job_id: created.body.id,
      state: 'WAITING_SUBSCRIPTION',
    }),
  );
  const status = await tool('galaxy_get_job', {
    job_id: created.body.id,
  }).expect(200);
  expect(status.body.result.structuredContent).toMatchObject({
    job_id: created.body.id,
    state: 'WAITING_SUBSCRIPTION',
    provider_started_at: null,
  });
});

it('continues a needs-input job with a persisted user clarification and fences the old attempt', async () => {
  const initialRule = {
    content: 'Original confirmed trial rule',
    category: 'DECISION',
    verification: 'USER_CONFIRMED',
    visibility: 'PRIVATE',
  };
  const initialMemory = (
    await api()
      .post(`/api/v1/project-chat/projects/${projectId}/ai/memory`)
      .set('Cookie', people.owner!.cookie)
      .set('X-Chat-Actor', people.owner!.id)
      .send({ ...initialRule, clientKey: randomUUID() })
      .expect(201)
  ).body;
  const created = (
    await api()
      .post(
        `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
      )
      .set('Cookie', people.owner!.cookie)
      .set('X-Chat-Actor', people.owner!.id)
      .send({
        clientKey: randomUUID(),
        question: 'Original request requiring clarification',
        sourceIds: [],
      })
      .expect(201)
  ).body;
  await tool('galaxy_report_job_progress', {
    job_id: created.id,
    attempt: 1,
    operation_id: 'clarification-needed',
    stage: 'NEEDS_INPUT',
    message: 'Which tax rate should be used?',
  }).expect(200);
  const path = `/api/v1/project-chat/projects/${projectId}/ai/answers/${created.id}/mcp/clarify`;
  const edited = (
    await api()
      .patch(
        `/api/v1/project-chat/projects/${projectId}/ai/memory/${initialMemory.id}`,
      )
      .set('Cookie', people.owner!.cookie)
      .set('X-Chat-Actor', people.owner!.id)
      .send({
        category: initialRule.category,
        verification: initialRule.verification,
        content: 'Edited confirmed trial rule',
        clientKey: randomUUID(),
        expectedVersion: initialMemory.version,
      })
      .expect(200)
  ).body;
  const command = {
    operation_id: randomUUID(),
    attempt: 1,
    content: 'Use 8 percent tax for this test only.',
  };
  const rule = 'Confirmed after the job paused: trial pricing rule.';
  const memory = await api()
    .post(`/api/v1/project-chat/projects/${projectId}/ai/memory`)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      content: rule,
      category: 'DECISION',
      verification: 'USER_CONFIRMED',
      visibility: 'PRIVATE',
    })
    .expect(201);
  const send = (value: object) =>
    api()
      .post(path)
      .set('Cookie', people.owner!.cookie)
      .set('X-Chat-Actor', people.owner!.id)
      .send(value);
  const resumed = (await send(command).expect(201)).body;
  expect(resumed).toMatchObject({ id: created.id, attempt: 2 });
  expect((await send(command).expect(201)).body).toEqual(resumed);
  await send({ ...command, content: 'Changed retry' }).expect(409);
  const job = (await tool('galaxy_get_job', { job_id: created.id }).expect(200))
    .body.result.structuredContent;
  expect(job).toMatchObject({
    question: 'Original request requiring clarification',
    attempt: 2,
    thread_id: conversationId,
  });
  expect(job.clarifications).toContainEqual(
    expect.objectContaining({
      content: command.content,
      requested_by: people.owner!.id,
      source_message_id: expect.any(String),
    }),
  );
  let contextText = '',
    contextOffset = 0;
  for (;;) {
    const page = (
      await tool('galaxy_get_job_context', {
        job_id: created.id,
        offset: contextOffset,
      }).expect(200)
    ).body.result.structuredContent;
    contextText += page.data;
    if (page.nextOffset === null) break;
    contextOffset = page.nextOffset;
  }
  expect(JSON.parse(contextText).memories).toContainEqual(
    expect.objectContaining({ sourceId: memory.body.id, content: rule }),
  );
  expect(JSON.parse(contextText).memories).toContainEqual(
    expect.objectContaining({
      sourceId: initialMemory.id,
      content: 'Edited confirmed trial rule',
      version: 2,
    }),
  );
  const persisted = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: created.id },
  });
  expect(
    (persisted.usage as Prisma.JsonObject).workspaceSources,
  ).toContainEqual(
    expect.objectContaining({
      kind: 'MEMORY_REVISION',
      id: memory.body.revisionId,
    }),
  );
  expect(
    (persisted.usage as Prisma.JsonObject).workspaceSources,
  ).toContainEqual(
    expect.objectContaining({ id: edited.revisionId, version: '2' }),
  );
  const late = await tool('galaxy_submit_job_result', {
    job_id: created.id,
    attempt: 1,
    submission_id: 'stale-clarification-attempt',
    sequence: 0,
    content: 'Wrong old answer',
    finalize: true,
  }).expect(200);
  expect(late.body.result.isError).toBe(true);
  expect(
    await db.mcpOutbox.count({
      where: { answerId: created.id, generation: 1 },
    }),
  ).toBe(1);
});

it('creates and updates one Project task with idempotency and a version fence through MCP', async () => {
  const assignment = await db.userRole.findFirstOrThrow({
    where: { organizationId, userId: people.owner!.id },
  });
  for (const code of ['task.create', 'task.update'])
    await db.rolePermission.create({
      data: {
        role: { connect: { id: assignment.roleId } },
        permission: { connect: { code } },
      },
    });
  const write = await connect('owner', 'galaxy.data.read galaxy.data.write');
  const command = {
    project: projectId,
    operation_id: randomUUID(),
    title: 'F1 task mutation fixture',
    description: 'Original text',
    priority: 'NORMAL',
  };
  const created = await tool(
    'galaxy_create_task',
    command,
    write.access_token,
  ).expect(200);
  expect(created.body.result.isError).not.toBe(true);
  const task = created.body.result.structuredContent.task;
  expect(task).toMatchObject({ projectId, title: command.title, version: 1 });
  const retry = await tool(
    'galaxy_create_task',
    {
      ...command,
      project: command.project.toUpperCase(),
      operation_id: command.operation_id.toUpperCase(),
    },
    write.access_token,
  ).expect(200);
  expect(retry.body.result.structuredContent.task.id).toBe(task.id);
  expect(
    await db.task.count({ where: { organizationId, title: command.title } }),
  ).toBe(1);
  const edit = {
    project: projectId,
    task_id: task.id,
    operation_id: randomUUID(),
    expected_version: 1,
    changes: { title: 'F1 edited task' },
  };
  const changed = await tool(
    'galaxy_update_task',
    edit,
    write.access_token,
  ).expect(200);
  expect(changed.body.result.structuredContent.task.version).toBe(2);
  const again = await tool(
    'galaxy_update_task',
    edit,
    write.access_token,
  ).expect(200);
  expect(again.body.result.structuredContent.task.version).toBe(2);
  const stale = await tool(
    'galaxy_update_task',
    { ...edit, operation_id: randomUUID() },
    write.access_token,
  ).expect(200);
  expect(stale.body.result.isError).toBe(true);
  const altered = await tool(
    'galaxy_create_task',
    { ...command, title: 'Wrong retry' },
    write.access_token,
  ).expect(200);
  expect(altered.body.result.isError).toBe(true);
  const scopedRole = await db.role.create({
    data: {
      organizationId,
      code: 'F1-financial-self-' + run,
      name: 'F1 financial SELF',
      maximumScope: 'SELF',
      permissions: {
        create: { permission: { connect: { code: 'estimate.read' } } },
      },
    },
  });
  await db.userRole.create({
    data: {
      organizationId,
      userId: people.owner!.id,
      roleId: scopedRole.id,
      scopeType: 'SELF',
    },
  });
  await db.task.update({
    where: { id: task.id },
    data: { allocatedBudget: 123456 },
  });
  const limited = await tool(
    'galaxy_update_task',
    {
      ...edit,
      operation_id: randomUUID(),
      expected_version: 2,
      changes: { priority: 'HIGH' },
    },
    write.access_token,
  ).expect(200);
  expect(limited.body.result.structuredContent.task).not.toHaveProperty(
    'allocatedBudget',
  );
});

it('creates one durable original answer and outbox, rejects changed retries, and blocks fileless XLSX completion', async () => {
  const path = `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`;
  const data = {
    clientKey: randomUUID(),
    question: 'Giữ nguyên yêu cầu này: đối chiếu báo giá mẫu và trả XLSX.',
    sourceIds: [],
    outputFormat: 'xlsx',
  };
  const created = await api()
    .post(path)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send(data)
    .expect(201);
  jobId = created.body.id;
  const replay = await api()
    .post(path)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send(data)
    .expect(201);
  expect(replay.body.id).toBe(jobId);
  await api()
    .post(path)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({ ...data, question: 'changed' })
    .expect(409);
  expect(await db.mcpOutbox.count({ where: { answerId: jobId } })).toBe(1);
  const original = await tool('galaxy_get_job', { job_id: jobId }).expect(200);
  expect(original.body.result.structuredContent.question).toBe(data.question);
  const result = await tool('galaxy_submit_job_result', {
    job_id: jobId,
    submission_id: 'sample-result',
    sequence: 0,
    content: 'Đã đối chiếu bảng mẫu.',
    finalize: true,
  }).expect(200);
  expect(result.body.result.isError).toBe(true);
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: jobId } })).status,
  ).not.toBe('COMPLETED');
  const checkpoint = await tool('galaxy_get_job', { job_id: jobId }).expect(
    200,
  );
  expect(checkpoint.body.result.structuredContent.result_checkpoint).toEqual({
    submission_id: 'sample-result',
    saved_text_sequences: [0],
  });
});

it('verifies and refreshes a subscription, delivers signed pending jobs, and does not equate 2xx with completion', async () => {
  const parameters = {
    name: 'galaxy.ai_job.created',
    arguments: { project_id: projectId },
    delivery: {
      mode: 'webhook',
      url: 'https://callback.example.com/events',
      secret: signingSecret,
    },
  };
  const first = await rpc('events/subscribe', parameters).expect(200);
  expect(first.body.result.id).toMatch(/^sub_/);
  const again = await rpc('events/subscribe', parameters).expect(200);
  expect(again.body.result.id).toBe(first.body.result.id);
  expect(verifications).toBe(1);
  const notificationOnlyJob = await newJob();
  const proofExpiry = new Date(Date.now() + 60000);
  await db.mcpSubscription.update({
    where: { id: first.body.result.id },
    data: { verifiedUntil: proofExpiry },
  });
  await rpc('events/subscribe', parameters);
  expect(
    (
      await db.mcpSubscription.findUniqueOrThrow({
        where: { id: first.body.result.id },
      })
    ).verifiedUntil,
  ).toEqual(proofExpiry);
  await app.get(McpEventsService).tick();
  expect(
    delivered.some(
      (event) => (event.data as { job_id?: string }).job_id === jobId,
    ),
  ).toBe(true);
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: jobId } })).status,
  ).toBe('RUNNING');
  const original = await tool('galaxy_get_job', { job_id: jobId }).expect(200);
  expect(original.body.result.structuredContent.state).toBe('PROCESSING');
  const notifiedOnly = (
    await tool('galaxy_get_job', { job_id: notificationOnlyJob })
  ).body.result.structuredContent;
  expect(notifiedOnly.state).toBe('NOTIFIED');
  expect(notifiedOnly.provider_started_at).toBeNull();
  const rejectedJob = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({ clientKey: randomUUID(), question: 'Callback rejection fixture.' })
    .expect(201);
  eventCallbackStatus = 410;
  let errorMarkReached!: () => void, errorRelease!: () => void;
  const errorReached = new Promise<void>(
    (resolve) => (errorMarkReached = resolve),
  );
  const errorBlocked = new Promise<void>((resolve) => (errorRelease = resolve));
  errorSaveBarrier = {
    reached: errorReached,
    markReached: errorMarkReached,
    blocked: errorBlocked,
    release: errorRelease,
  };
  const jobs = app.get(McpJobsService),
    originalSave = jobs.save.bind(jobs),
    save = vi.spyOn(jobs, 'save').mockImplementation((...args) => {
      if (args[2].state === 'ERROR' && errorSaveBarrier) {
        const barrier = errorSaveBarrier;
        barrier.markReached();
        return barrier.blocked.then(() => originalSave(...args)) as ReturnType<
          typeof jobs.save
        >;
      }
      return originalSave(...args);
    }),
    tick = app.get(McpEventsService).tick();
  await errorReached;
  let cancelFinished = false;
  const cancel = api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/answers/${rejectedJob.body.id}/mcp/cancel`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({})
    .then((response) => {
      cancelFinished = true;
      return response;
    });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const blockedByJobLock = !cancelFinished;
  errorRelease();
  await tick;
  expect((await cancel).status).toBe(201);
  errorSaveBarrier = undefined;
  save.mockRestore();
  eventCallbackStatus = 200;
  expect(blockedByJobLock).toBe(true);
  const rejectedEvent = await db.mcpOutbox.findFirstOrThrow({
    where: { answerId: rejectedJob.body.id },
  });
  const rejectedDelivery = await db.mcpDelivery.findFirstOrThrow({
    where: { eventId: rejectedEvent.id },
  });
  expect(rejectedDelivery.state).toBe('FAILED');
  expect(rejectedDelivery.errorCode).toBe('MCP_CALLBACK_REJECTED');
  expect(rejectedDelivery.attempts).toBe(1);
  expect(
    (
      await db.chatAiAnswer.findUniqueOrThrow({
        where: { id: rejectedJob.body.id },
      })
    ).status,
  ).toBe('CANCELLED');
  expect(
    (await tool('galaxy_get_job', { job_id: rejectedJob.body.id }).expect(200))
      .body.result.structuredContent.state,
  ).toBe('CANCELLED');
  await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/answers/${rejectedJob.body.id}/mcp/retry`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({})
    .expect(201);
  expect(
    (await tool('galaxy_get_job', { job_id: rejectedJob.body.id }).expect(200))
      .body.result.structuredContent.state,
  ).toBe('WAITING_NOTIFICATION');
  const identity = {
    ...parameters,
    delivery: { mode: 'webhook', url: parameters.delivery.url },
  };
  let markReached!: () => void, release!: () => void;
  const reached = new Promise<void>((resolve) => (markReached = resolve));
  const blocked = new Promise<void>((resolve) => (release = resolve));
  verificationBarrier = { reached, markReached, blocked, release };
  await db.mcpSubscription.update({
    where: { id: first.body.result.id },
    data: { verifiedUntil: new Date(0) },
  });
  const resubscribe = rpc('events/subscribe', parameters).then(
    (response) => response,
  );
  await reached;
  await rpc('events/unsubscribe', identity).expect(200);
  release();
  const resubscribeResult = await resubscribe;
  verificationBarrier = undefined;
  expect(resubscribeResult.body.error).toBeTruthy();
  expect(
    (
      await db.mcpSubscription.findUniqueOrThrow({
        where: { id: first.body.result.id },
      })
    ).revokedAt,
  ).not.toBeNull();
  await rpc('events/unsubscribe', identity).expect(200);
  await rpc('events/unsubscribe', identity).expect(200);
  expect(
    (
      await db.mcpSubscription.findUniqueOrThrow({
        where: { id: first.body.result.id },
      })
    ).revokedAt,
  ).not.toBeNull();
}, 15000);

it('reads actual original bytes and persists a native XLSX result exactly once in the original thread', async () => {
  const original = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/files`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .field('clientKey', randomUUID())
    .attach('file', quotation, 'quote.xlsx')
    .expect(201);
  const sourceId = original.body.id;
  const created = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question:
        'Đối chiếu Q-001 và Q-002, trả XLSX giữ hai tổng 250000 và 150000.',
      sourceIds: [sourceId],
      outputFormat: 'xlsx',
    })
    .expect(201);
  const id = created.body.id;
  const source = await db.chatAiSourceIndex.findUniqueOrThrow({
    where: { id: sourceId },
  });
  const asset = await db.fileAsset.findUniqueOrThrow({
    where: { id: source.fileAssetId! },
  });
  await db.fileAsset.update({
    where: { id: asset.id },
    data: { version: asset.version + 1 },
  });
  await db.chatAiSourceIndex.update({
    where: { id: source.id },
    data: { version: `${asset.version + 1}:${asset.checksum}` },
  });
  const stale = await tool('galaxy_get_job', { job_id: id }).expect(200);
  const cancel = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp/cancel`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({});
  await db.fileAsset.update({
    where: { id: asset.id },
    data: { version: asset.version },
  });
  await db.chatAiSourceIndex.update({
    where: { id: source.id },
    data: { version: source.version },
  });
  expect(stale.body.result.isError).toBe(true);
  expect(cancel.status).toBe(201);
  await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp/retry`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({})
    .expect(201);
  const manifest = await tool('galaxy_get_job', { job_id: id }).expect(200);
  expect(manifest.body.result.structuredContent.input_files[0].source_id).toBe(
    sourceId,
  );
  const file = await tool('galaxy_get_input_file', {
    job_id: id,
    source_id: sourceId,
    version: original.body.version,
  }).expect(200);
  expect(file.body.result.isError).not.toBe(true);
  const downloadUrl = new URL(file.body.result.structuredContent.download_url);
  const downloaded = await api()
    .get(downloadUrl.pathname + downloadUrl.search)
    .buffer(true)
    .parse((res, callback) => {
      const bytes: Buffer[] = [];
      res.on('data', (chunk: Buffer) => bytes.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(bytes)));
    })
    .expect(200);
  expect(
    createHash('sha256')
      .update(downloaded.body as Buffer)
      .digest('hex'),
  ).toBe(createHash('sha256').update(quotation).digest('hex'));
  const result = {
    job_id: id,
    attempt: 2,
    submission_id: 'real-file-result',
    sequence: 0,
    content: 'Hai dòng đã đối chiếu; tổng lần lượt 250000 và 150000 VND.',
    files: [
      {
        file_id: 'file-generated-xlsx',
        download_url: 'https://files.example.com/files/result.xlsx',
        file_name: 'result.xlsx',
        mime_type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
    finalize: true,
  };
  const resultsService = app.get(McpResultsService);
  const originalSubmit = resultsService.submit.bind(resultsService);
  let resultFailure: unknown;
  const observe = vi
    .spyOn(resultsService, 'submit')
    .mockImplementation(async (...args) => {
      try {
        return await originalSubmit(...args);
      } catch (error) {
        resultFailure = redact(error);
        throw error;
      }
    });
  const received = await tool('galaxy_submit_job_result', result).expect(200);
  observe.mockRestore();
  expect(
    received.body.result.isError,
    JSON.stringify(resultFailure ?? received.body.result.content),
  ).not.toBe(true);
  expect(received.body.result.structuredContent.state).toBe('COMPLETED');
  const replay = await tool('galaxy_submit_job_result', result).expect(200);
  expect(replay.body.result.structuredContent.artifacts).toEqual(
    received.body.result.structuredContent.artifacts,
  );
  expect(
    await db.mcpArtifact.count({ where: { answerId: id, state: 'AVAILABLE' } }),
  ).toBe(1);
  const stored = await db.chatAiAnswer.findUniqueOrThrow({ where: { id } });
  expect(stored.conversationId).toBe(conversationId);
  expect(stored.projectId).toBe(projectId);
  expect(stored.answer).toBe(result.content);
  const artifact = received.body.result.structuredContent.artifacts[0];
  const saved = await api()
    .get(artifact.downloadUrl)
    .set('Cookie', people.owner!.cookie)
    .buffer(true)
    .parse((res, callback) => {
      const bytes: Buffer[] = [];
      res.on('data', (chunk: Buffer) => bytes.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(bytes)));
    })
    .expect(200);
  const workbook = new Workbook();
  await workbook.xlsx.load(saved.body as never);
  const sheet = workbook.getWorksheet('Quotation')!;
  expect(sheet.getCell('A2').value).toBe('Q-001');
  expect(sheet.getCell('D2').value).toEqual({
    formula: 'B2*C2',
    result: 250000,
  });
  expect(sheet.getCell('D3').value).toEqual({
    formula: 'B3*C3',
    result: 150000,
  });
}, 30000);

it('stores and downloads the unchanged Work-generated package-rooted XLSX exactly once', async () => {
  const bytes = await readFile(
    join(__dirname, 'fixtures/e05-work-generated.xlsx'),
  );
  const checksum = createHash('sha256').update(bytes).digest('hex');
  expect(checksum).toBe(
    '6398cb36a77ca818fcddcce12439a529034b02bdc13c431d9de59af524e104db',
  );
  const path = '/files/work-generated.xlsx';
  outputFiles.set(path, {
    bytes,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  try {
    const id = await newJob('xlsx');
    const result = {
      job_id: id,
      submission_id: 'actual-work-opc',
      sequence: 0,
      content: 'E05: thanh toán 583200 VND theo quy tắc Project.',
      files: [
        {
          file_id: 'work-generated-opc',
          download_url: 'https://files.example.com' + path,
          file_name: 'e05-work-generated.xlsx',
          mime_type:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
      finalize: true,
    };
    const first = await tool('galaxy_submit_job_result', result).expect(200);
    expect(first.body.result.isError).not.toBe(true);
    expect(first.body.result.structuredContent.state).toBe('COMPLETED');
    const replay = await tool('galaxy_submit_job_result', result);
    expect(replay.body.result.structuredContent).toEqual(
      first.body.result.structuredContent,
    );
    expect(await db.mcpArtifact.count({ where: { answerId: id } })).toBe(1);
    const artifact = first.body.result.structuredContent.artifacts[0];
    const stored = await db.chatAiAnswer.findUniqueOrThrow({ where: { id } });
    expect(stored.projectId).toBe(projectId);
    expect(stored.conversationId).toBe(conversationId);
    const saved = await api()
      .get(artifact.downloadUrl)
      .set('Cookie', people.owner!.cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(saved.body).toEqual(bytes);
    expect(createHash('sha256').update(saved.body).digest('hex')).toBe(
      checksum,
    );
  } finally {
    outputFiles.delete(path);
  }
});

it('pins the preceding saved workbook for a follow-up edit without another upload', async () => {
  const previous = await newJob('xlsx');
  const newerRequest = await newJob('xlsx');
  expect(
    (
      await tool('galaxy_submit_job_result', {
        job_id: newerRequest,
        submission_id: 'completed-earlier',
        sequence: 0,
        content: 'This newer request finished earlier.',
        files: [
          {
            file_id: 'older-output',
            file_name: 'older.xlsx',
            download_url: 'https://files.example.com/files/result.xlsx',
          },
        ],
        finalize: true,
      })
    ).body.result.isError,
  ).not.toBe(true);
  const result = await tool('galaxy_submit_job_result', {
    job_id: previous,
    submission_id: 'followup-base',
    sequence: 0,
    content: 'Saved editable quotation.',
    files: [
      {
        file_id: 'followup-workbook',
        file_name: 'quotation.xlsx',
        download_url: 'https://files.example.com/files/result.xlsx',
      },
    ],
    finalize: true,
  });
  expect(result.body.result.isError).not.toBe(true);
  const receipt = await db.mcpArtifact.findFirstOrThrow({
    where: { answerId: previous, state: 'AVAILABLE' },
  });
  const conversion = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question: 'Chuyển file vừa tạo sang file PDF',
      sourceIds: [],
    })
    .expect(201);
  const conversionJob = (
    await tool('galaxy_get_job', { job_id: conversion.body.id })
  ).body.result.structuredContent;
  expect(conversionJob.input_files[0].source_id).toBe(receipt.sourceId);
  expect(conversionJob.requested_outputs).toEqual(['pdf']);
  const newerPdf = await newJob();
  expect(
    (
      await tool('galaxy_submit_job_result', {
        job_id: newerPdf,
        submission_id: 'latest-pdf',
        sequence: 0,
        content: 'Most recent completed PDF.',
        files: [
          {
            file_id: 'newer-pdf',
            file_name: 'latest.pdf',
            download_url: 'https://files.example.com/files/result.pdf',
          },
        ],
        finalize: true,
      })
    ).body.result.isError,
  ).not.toBe(true);
  const question = 'Sửa dòng 3 trong file Excel vừa tạo';
  const follow = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({ clientKey: randomUUID(), question, sourceIds: [] })
    .expect(201);
  const job = (await tool('galaxy_get_job', { job_id: follow.body.id })).body
    .result.structuredContent;
  expect(job.question).toBe(question);
  expect(job.input_files).toHaveLength(1);
  expect(job.input_files[0].source_id).toBe(receipt.sourceId);
  expect(job.input_files[0].checksum).toBe(receipt.checksum);
  expect(job.requested_outputs).toContain('xlsx');
  const file = await tool('galaxy_get_input_file', {
    job_id: follow.body.id,
    source_id: receipt.sourceId,
    version: job.input_files[0].version,
  });
  expect(file.body.result.isError).not.toBe(true);
  await db.mcpArtifact.create({
    data: {
      answerId: newerPdf,
      submissionId: 'superseded-attempt',
      externalFileId: 'late-aborted-file',
      filename: 'latest.pdf',
      state: 'ERROR',
      errorCode: 'MCP_RESULT_ATTEMPT_CONFLICT',
    },
  });
  const latest = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question: 'Sửa file vừa tạo',
      sourceIds: [],
    })
    .expect(201);
  const latestJob = (await tool('galaxy_get_job', { job_id: latest.body.id }))
    .body.result.structuredContent;
  const latestPdfReceipt = await db.mcpArtifact.findFirstOrThrow({
    where: { answerId: newerPdf, state: 'AVAILABLE' },
  });
  expect(latestJob.input_files[0].source_id).toBe(latestPdfReceipt.sourceId);
  const failingPdf = await newJob();
  fileFailures = 1;
  expect(
    (
      await tool('galaxy_submit_job_result', {
        job_id: failingPdf,
        submission_id: 'failed-latest-pdf',
        sequence: 0,
        content: 'Latest file was not saved.',
        files: [
          {
            file_id: 'failed-newest-pdf',
            file_name: 'failed.pdf',
            download_url: 'https://files.example.com/files/result.xlsx',
          },
        ],
        finalize: false,
      })
    ).body.result.isError,
  ).toBe(true);
  const blocked = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question: 'Sửa file vừa tạo',
      sourceIds: [],
    })
    .expect(409);
  expect(blocked.body.message).toBe('MCP_PREVIOUS_ARTIFACT_UNAVAILABLE');
}, 30000);

it('requires a real XLSX for the original legacy Excel conversion even with an empty output snapshot', async () => {
  const created = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question: 'chuyển sang excel. test luồng',
      sourceIds: [],
    })
    .expect(201);
  const id = created.body.id as string;
  const row = await db.chatAiAnswer.findUniqueOrThrow({ where: { id } });
  const usage = row.usage as Prisma.JsonObject;
  await db.chatAiAnswer.update({
    where: { id },
    data: {
      usage: {
        ...usage,
        mcp: { ...(usage.mcp as Prisma.JsonObject), requestedOutputs: [] },
      } as Prisma.InputJsonObject,
    },
  });
  expect(
    (await tool('galaxy_get_job', { job_id: id })).body.result.structuredContent
      .requested_outputs,
  ).toEqual(['xlsx']);
  const finalized = await tool('galaxy_submit_job_result', {
    job_id: id,
    submission_id: 'legacy',
    sequence: 0,
    content: 'Text without a workbook.',
    finalize: true,
  });
  expect(finalized.body.result.isError).toBe(true);
  expect(JSON.stringify(finalized.body.result.content)).toContain(
    'MCP_REQUIRED_ARTIFACT_MISSING',
  );
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).status,
  ).not.toBe('COMPLETED');
});

it('accepts ChatGPT locale extensions through consent and token exchange', async () => {
  const tokens = await connect('owner', scopes, { ui_locales: 'en-US' });
  const principal = await app
    .get(McpOAuth)
    .authenticate('Bearer ' + tokens.access_token, scopes.split(' '));
  expect(principal.actor.userId).toBe(people.owner!.id);
  expect(principal.clientId).toBe(clientId);
  expect(principal.scopes).toEqual(scopes.split(' '));
  const request = await db.mcpGrant.findFirstOrThrow({
    where: { clientId, kind: 'REQUEST' },
    orderBy: { createdAt: 'desc' },
  });
  expect(request.payload).not.toHaveProperty('ui_locales');
});

it('rejects malformed OAuth input, redirect mismatches and non-S256 requests', async () => {
  await api()
    .post('/mcp/oauth/register')
    .send({ redirect_uris: ['http://localhost/callback'] })
    .expect(400);
  await api().post('/mcp/oauth/revoke').type('form').send({}).expect(400);
  const params = {
    client_id: clientId,
    redirect_uri: 'https://chatgpt.com/unregistered',
    resource: 'https://g00.example.test/mcp',
    response_type: 'code',
    scope: scopes,
    code_challenge: 'c'.repeat(43),
    code_challenge_method: 'S256',
    state: 'test-state',
    ui_locales: 'en-US',
  };
  await api().get('/mcp/oauth/authorize').query(params).expect(400);
  await api()
    .get('/mcp/oauth/authorize')
    .query({
      ...params,
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      code_challenge_method: 'plain',
    })
    .expect(400);
  await api()
    .get('/mcp/oauth/authorize')
    .query({
      ...params,
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      resource: 'https://other.example.com/mcp',
    })
    .expect(400);
});

it('enforces private ownership, scopes, resource identity, token expiry and live Project grants', async () => {
  const other = await connect('other');
  expect(
    (await tool('galaxy_get_job', { job_id: jobId }, other.access_token)).body
      .result.isError,
  ).toBe(true);
  const reader = await connect('owner', 'galaxy.jobs.read');
  expect(
    (
      await tool(
        'galaxy_report_job_progress',
        { job_id: jobId, operation_id: 'unauthorized', stage: 'PROCESSING' },
        reader.access_token,
      )
    ).body.result.isError,
  ).toBe(true);
  await api()
    .post(
      `/api/v1/project-chat/projects/${randomUUID()}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({ clientKey: randomUUID(), question: 'wrong Project', sourceIds: [] })
    .expect(404);
  const grant = await db.chatProjectGrant.findFirstOrThrow({
    where: { projectId, userId: people.owner!.id },
  });
  await db.chatProjectGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });
  const denied = await tool('galaxy_get_job', { job_id: jobId });
  await db.chatProjectGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null },
  });
  expect(denied.body.result.isError).toBe(true);
  await db.mcpGrant.updateMany({
    where: {
      tokenHash: createHash('sha256').update(reader.access_token).digest('hex'),
    },
    data: { expiresAt: new Date(0) },
  });
  await rpc('tools/list', {}, reader.access_token).expect(401);
});

it('keeps failed file transfers incomplete and resumes the same receipt without duplicate files', async () => {
  const id = await newJob('xlsx');
  const payload = {
    job_id: id,
    submission_id: 'retry-file',
    sequence: 0,
    content: 'Recovered actual file',
    files: [
      {
        file_id: 'generated-retry',
        download_url: 'https://files.example.com/files/result.xlsx',
        file_name: 'retry.xlsx',
        mime_type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
    finalize: true,
  };
  fileFailures = 1;
  expect(
    (await tool('galaxy_submit_job_result', payload)).body.result.isError,
  ).toBe(true);
  expect(
    (await tool('galaxy_get_job', { job_id: id })).body.result.structuredContent
      .state,
  ).toBe('ERROR');
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).status,
  ).not.toBe('COMPLETED');
  const pendingHistory = await api()
    .get(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .expect(200);
  expect(
    pendingHistory.body.answers.find(
      (answer: { id: string }) => answer.id === id,
    ),
  ).toMatchObject({ status: 'RUNNING', answer: payload.content });
  const resumed = await tool('galaxy_submit_job_result', payload);
  expect(resumed.body.result.structuredContent.state).toBe('COMPLETED');
  expect(
    await db.mcpArtifact.count({ where: { answerId: id, state: 'AVAILABLE' } }),
  ).toBe(1);
  const changed = await tool('galaxy_submit_job_result', {
    ...payload,
    content: 'Changed text',
  });
  expect(changed.body.result.isError).toBe(true);
  expect(await db.mcpOutbox.count({ where: { answerId: id } })).toBe(1);
}, 30000);

it('replaces explicitly identified failed references only after saving the replacement bytes', async () => {
  const id = await newJob('xlsx');
  const file = {
    file_id: 'legacy-first',
    download_url: 'https://files.example.com/files/result.xlsx',
    file_name: 'legacy.xlsx',
  };
  const base = {
    job_id: id,
    submission_id: 'legacy-references',
    finalize: false,
  };
  for (const file_id of ['legacy-first', 'legacy-second']) {
    fileFailures = 1;
    expect(
      (
        await tool('galaxy_submit_job_result', {
          ...base,
          sequence: 0,
          content: 'Original complete answer',
          files: [{ ...file, file_id }],
        })
      ).body.result.isError,
    ).toBe(true);
  }
  const receipts = await db.mcpArtifact.findMany({
    where: { answerId: id },
    orderBy: { createdAt: 'asc' },
  });
  expect(receipts).toHaveLength(2);
  const replacement = {
    ...base,
    artifact_id: receipts[0]!.id,
    supersede_failed_artifact_ids: [receipts[1]!.id],
    files: [{ ...file, file_id: 'fresh-reference' }],
    finalize: true,
  };
  const unrelated = await newJob('xlsx');
  expect(
    (
      await tool('galaxy_submit_job_result', {
        ...replacement,
        job_id: unrelated,
      })
    ).body.result.isError,
  ).toBe(true);
  expect(await db.mcpArtifact.count({ where: { answerId: unrelated } })).toBe(
    0,
  );
  fileFailures = 1;
  expect(
    (await tool('galaxy_submit_job_result', replacement)).body.result.isError,
  ).toBe(true);
  expect(
    (await db.mcpArtifact.findUniqueOrThrow({ where: { id: receipts[1]!.id } }))
      .state,
  ).toBe('ERROR');
  const saved = await tool('galaxy_submit_job_result', replacement);
  expect(saved.body.result.isError).not.toBe(true);
  expect(saved.body.result.structuredContent).toMatchObject({
    state: 'COMPLETED',
  });
  expect(saved.body.result.structuredContent.artifacts).toHaveLength(1);
  expect(
    (await tool('galaxy_submit_job_result', replacement)).body.result.isError,
  ).not.toBe(true);
  const final = await db.mcpArtifact.findMany({ where: { answerId: id } });
  expect(final).toHaveLength(2);
  expect(final.filter((receipt) => receipt.state === 'AVAILABLE')).toHaveLength(
    1,
  );
  expect(
    final.filter((receipt) => receipt.state === 'SUPERSEDED'),
  ).toHaveLength(1);
  expect(await db.mcpResultPart.count({ where: { answerId: id } })).toBe(1);
  expect(
    (
      await tool('galaxy_submit_job_result', {
        ...replacement,
        artifact_id: receipts[1]!.id,
        supersede_failed_artifact_ids: [receipts[0]!.id],
      })
    ).body.result.isError,
  ).toBe(true);
  const visible = (await tool('galaxy_get_job', { job_id: id })).body.result
    .structuredContent;
  expect(
    visible.result.files.find(
      (receipt: { id: string }) => receipt.id === receipts[1]!.id,
    ),
  ).toMatchObject({ current: false, replaced_by: receipts[0]!.id });
}, 30000);

it('never discards another required file or a saved receipt when replacing failed references', async () => {
  const id = await newJob('xlsx');
  const file = {
    file_id: 'same-output-old',
    file_name: 'same.xlsx',
    download_url: 'https://files.example.com/files/result.xlsx',
  };
  const base = {
    job_id: id,
    submission_id: 'keep-other-output',
    finalize: false,
  };
  for (const reference of [
    file,
    { ...file, file_id: 'same-output-repeat' },
    { ...file, file_id: 'other-output', file_name: 'other.xlsx' },
  ]) {
    fileFailures = 1;
    expect(
      (
        await tool('galaxy_submit_job_result', {
          ...base,
          sequence: 0,
          content: 'Two distinct files required.',
          files: [reference],
        })
      ).body.result.isError,
    ).toBe(true);
  }
  const receipts = await db.mcpArtifact.findMany({
    where: { answerId: id },
    orderBy: { createdAt: 'asc' },
  });
  const replacement = {
    ...base,
    artifact_id: receipts[0]!.id,
    supersede_failed_artifact_ids: [receipts[1]!.id],
    files: [{ ...file, file_id: 'same-output-new' }],
    finalize: true,
  };
  const incomplete = await tool('galaxy_submit_job_result', replacement);
  expect(incomplete.body.result.isError).toBe(true);
  expect(JSON.stringify(incomplete.body.result)).toContain(
    'MCP_ARTIFACTS_NOT_READY',
  );
  expect(
    (await db.mcpArtifact.findUniqueOrThrow({ where: { id: receipts[2]!.id } }))
      .state,
  ).toBe('ERROR');
  const invalid = {
    ...base,
    artifact_id: receipts[2]!.id,
    supersede_failed_artifact_ids: [receipts[0]!.id],
    files: [{ ...file, file_id: 'other-new', file_name: 'other.xlsx' }],
  };
  expect(
    (await tool('galaxy_submit_job_result', invalid)).body.result.isError,
  ).toBe(true);
  expect(
    (await db.mcpArtifact.findUniqueOrThrow({ where: { id: receipts[0]!.id } }))
      .state,
  ).toBe('AVAILABLE');
  expect(
    (
      await tool('galaxy_submit_job_result', {
        ...replacement,
        supersede_failed_artifact_ids: [randomUUID()],
        finalize: false,
      })
    ).body.result.isError,
  ).toBe(true);
  const saved = await tool('galaxy_submit_job_result', {
    ...base,
    artifact_id: receipts[2]!.id,
    files: [{ ...file, file_id: 'other-new', file_name: 'other.xlsx' }],
    finalize: true,
  });
  expect(saved.body.result.structuredContent.state).toBe('COMPLETED');
  expect(saved.body.result.structuredContent.artifacts).toHaveLength(2);
}, 30000);

it('does not replace failed references if cancellation arrives after the replacement bytes are saved', async () => {
  const id = await newJob('xlsx');
  const file = {
    file_id: 'cancel-old',
    file_name: 'cancel.xlsx',
    download_url: 'https://files.example.com/files/result.xlsx',
  };
  const base = {
    job_id: id,
    submission_id: 'cancel-replacement',
    finalize: false,
  };
  for (const file_id of ['cancel-old', 'cancel-repeat']) {
    fileFailures = 1;
    expect(
      (
        await tool('galaxy_submit_job_result', {
          ...base,
          sequence: 0,
          content: 'Retain this answer.',
          files: [{ ...file, file_id }],
        })
      ).body.result.isError,
    ).toBe(true);
  }
  const receipts = await db.mcpArtifact.findMany({
    where: { answerId: id },
    orderBy: { createdAt: 'asc' },
  });
  const importer = app.get(McpResultsService) as unknown as {
    importFile: (...args: unknown[]) => Promise<unknown>;
  };
  const original = importer.importFile.bind(importer);
  const spy = vi
    .spyOn(importer, 'importFile')
    .mockImplementationOnce(async (...args) => {
      const saved = await original(...args);
      await api()
        .post(
          `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp/cancel`,
        )
        .set('Cookie', people.owner!.cookie)
        .set('X-Chat-Actor', people.owner!.id)
        .send({})
        .expect(201);
      return saved;
    });
  try {
    const response = await tool('galaxy_submit_job_result', {
      ...base,
      artifact_id: receipts[0]!.id,
      supersede_failed_artifact_ids: [receipts[1]!.id],
      files: [{ ...file, file_id: 'cancel-fresh' }],
      finalize: true,
    });
    expect(response.body.result.isError).toBe(true);
    expect(
      (
        await db.mcpArtifact.findUniqueOrThrow({
          where: { id: receipts[1]!.id },
        })
      ).state,
    ).toBe('ERROR');
    expect(
      (await tool('galaxy_get_job', { job_id: id })).body.result
        .structuredContent.state,
    ).toBe('CANCELLED');
  } finally {
    spy.mockRestore();
  }
}, 30000);

it('refreshes a failed artifact reference in the same submission without repeating text or creating a file receipt', async () => {
  const id = await newJob('xlsx');
  const payload = {
    job_id: id,
    submission_id: 'refresh-artifact',
    sequence: 0,
    content: 'Text survives the expired download.',
    files: [
      {
        file_id: 'expired-native-reference',
        download_url: 'https://files.example.com/files/result.xlsx',
        file_name: 'refresh.xlsx',
      },
    ],
    finalize: false,
  };
  fileFailures = 1;
  expect(
    (await tool('galaxy_submit_job_result', payload)).body.result.isError,
  ).toBe(true);
  const receipt = await db.mcpArtifact.findFirstOrThrow({
    where: { answerId: id },
  });
  const refreshed = {
    job_id: id,
    submission_id: payload.submission_id,
    artifact_id: receipt.id,
    files: [{ ...payload.files[0], file_id: 'refreshed-native-reference' }],
    finalize: true,
  };
  const saved = await tool('galaxy_submit_job_result', refreshed);
  expect(saved.body.result.isError).not.toBe(true);
  expect(saved.body.result.structuredContent.state).toBe('COMPLETED');
  expect(
    (await tool('galaxy_submit_job_result', refreshed)).body.result.isError,
  ).not.toBe(true);
  expect(await db.mcpArtifact.count({ where: { answerId: id } })).toBe(1);
  expect(await db.mcpResultPart.count({ where: { answerId: id } })).toBe(1);
  expect(
    (await db.mcpArtifact.findUniqueOrThrow({ where: { id: receipt.id } }))
      .state,
  ).toBe('AVAILABLE');
  const other = await newJob('xlsx');
  const otherBefore = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: other },
  });
  expect(
    (
      await tool('galaxy_submit_job_result', {
        ...refreshed,
        job_id: other,
        submission_id: 'other',
        finalize: false,
      })
    ).body.result.isError,
  ).toBe(true);
  expect(await db.mcpArtifact.count({ where: { answerId: other } })).toBe(0);
  const otherAfter = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: other },
  });
  expect(otherAfter.usage).toEqual(otherBefore.usage);
  expect(otherAfter.providerStartedAt).toEqual(otherBefore.providerStartedAt);
  expect(otherAfter.answer).toEqual(otherBefore.answer);
  expect(await db.mcpResultPart.count({ where: { answerId: other } })).toBe(0);
}, 30000);

it('cancels a denied Project delivery without revoking the account-wide subscription and recovers expired leases', async () => {
  const params = {
    name: 'galaxy.ai_job.created',
    arguments: {},
    delivery: {
      mode: 'webhook',
      url: 'https://callback.example.com/events',
      secret: signingSecret,
    },
  };
  const subscription = (await rpc('events/subscribe', params)).body.result
    .id as string;
  const grant = await db.chatProjectGrant.findFirstOrThrow({
    where: { projectId, userId: people.owner!.id },
  });
  const pending = await newJob();
  await db.chatProjectGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });
  await app.get(McpEventsService).tick();
  const saved = await db.mcpSubscription.findUniqueOrThrow({
    where: { id: subscription },
  });
  await db.chatProjectGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null },
  });
  expect(saved.revokedAt).toBeNull();
  const next = await newJob();
  await app.get(McpEventsService).tick();
  const event = await db.mcpOutbox.findFirstOrThrow({
    where: { answerId: next },
  });
  const delivery = await db.mcpDelivery.findFirstOrThrow({
    where: { eventId: event.id, subscriptionId: subscription },
  });
  expect(delivery.state).toBe('DELIVERED');
  await db.mcpDelivery.update({
    where: { id: delivery.id },
    data: {
      state: 'DELIVERING',
      leaseToken: randomUUID(),
      leaseUntil: new Date(0),
      nextAttemptAt: new Date(0),
    },
  });
  const restarted = new McpEventsService(
    app.get(PrismaService),
    app.get(McpOAuth),
    app.get(McpJobsService),
    app.get(ProjectAiService),
    app.get(McpNetwork),
  );
  const beforeReplay = delivered.filter(
    (payload) => payload.eventId === event.id,
  ).length;
  await restarted.tick();
  expect(
    delivered.filter((payload) => payload.eventId === event.id),
  ).toHaveLength(beforeReplay + 1);
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: next } })).status,
  ).toBe('RUNNING');
  expect(
    (
      await db.mcpDelivery.findFirstOrThrow({
        where: { event: { answerId: pending }, subscriptionId: subscription },
      })
    ).state,
  ).toBe('CANCELLED');
  await rpc('events/unsubscribe', {
    ...params,
    delivery: { mode: 'webhook', url: params.delivery.url },
  });
}, 15000);

it('records idempotent progress and text checkpoints, cancels writes and retries the original job', async () => {
  const id = await newJob();
  const progress = {
    job_id: id,
    operation_id: 'received',
    stage: 'PROCESSING',
    message: 'Đã nhận việc',
  };
  await tool('galaxy_report_job_progress', progress);
  await tool('galaxy_report_job_progress', progress);
  expect(
    await db.auditLog.count({
      where: { entityId: id, action: 'MCP_JOB_PROGRESS' },
    }),
  ).toBe(1);
  expect(
    (
      await tool('galaxy_report_job_progress', {
        ...progress,
        message: 'changed',
      })
    ).body.result.isError,
  ).toBe(true);
  const path = `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp`;
  await api()
    .post(path + '/cancel')
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({})
    .expect(201);
  expect(
    (
      await tool('galaxy_submit_job_result', {
        job_id: id,
        submission_id: 'parts',
        sequence: 0,
        content: 'first',
        finalize: false,
      })
    ).body.result.isError,
  ).toBe(true);
  await api()
    .post(path + '/retry')
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({})
    .expect(201);
  await tool('galaxy_submit_job_result', {
    job_id: id,
    attempt: 2,
    submission_id: 'parts',
    sequence: 1,
    content: ' second',
    finalize: false,
  });
  expect(
    (
      await tool('galaxy_submit_job_result', {
        job_id: id,
        attempt: 2,
        submission_id: 'parts',
        finalize: true,
      })
    ).body.result.isError,
  ).toBe(true);
  const complete = await tool('galaxy_submit_job_result', {
    job_id: id,
    attempt: 2,
    submission_id: 'parts',
    sequence: 0,
    content: 'first',
    finalize: true,
  });
  expect(complete.body.result.structuredContent.state).toBe('COMPLETED');
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).answer,
  ).toBe('first second');
  expect(await db.mcpOutbox.count({ where: { answerId: id } })).toBe(2);
}, 15000);

it('persists four real DOCX, PDF, PNG and MP4 files with optional native metadata and authorized downloads', async () => {
  const id = await newJob();
  const files = [...outputFiles].map(([path]) => ({
    file_id: path,
    download_url: 'https://files.example.com' + path,
  }));
  const submitted = await tool('galaxy_submit_job_result', {
    job_id: id,
    submission_id: 'four-formats',
    sequence: 0,
    content: 'Đã lưu bốn tệp thật.',
    files,
    finalize: true,
  });
  expect(
    submitted.body.result.isError,
    JSON.stringify(submitted.body.result.content),
  ).not.toBe(true);
  const artifacts = submitted.body.result.structuredContent.artifacts as {
    format: string;
    downloadUrl: string;
  }[];
  expect(artifacts.map((file) => file.format).sort()).toEqual([
    'docx',
    'mp4',
    'pdf',
    'png',
  ]);
  for (const artifact of artifacts) {
    const stored = await api()
      .get(artifact.downloadUrl)
      .set('Cookie', people.owner!.cookie)
      .buffer(true)
      .parse((res, callback) => {
        const parts: Buffer[] = [];
        res.on('data', (part: Buffer) => parts.push(part));
        res.on('end', () => callback(null, Buffer.concat(parts)));
      })
      .expect(200);
    expect(
      createHash('sha256')
        .update(stored.body as Buffer)
        .digest('hex'),
    ).toBe(
      createHash('sha256')
        .update(outputFiles.get('/files/result.' + artifact.format)!.bytes)
        .digest('hex'),
    );
  }
}, 30000);

it('rejects completion when cancellation arrives during actual file transfer', async () => {
  const id = await newJob('xlsx'),
    network = app.get(McpNetwork),
    download = network.download.bind(network);
  const observer = vi
    .spyOn(network, 'download')
    .mockImplementationOnce(async (url) => {
      await api()
        .post(
          `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp/cancel`,
        )
        .set('Cookie', people.owner!.cookie)
        .set('X-Chat-Actor', people.owner!.id)
        .send({})
        .expect(201);
      return download(url);
    });
  const response = await tool('galaxy_submit_job_result', {
    job_id: id,
    submission_id: 'cancel-transfer',
    sequence: 0,
    content: 'Cancelled before persistence',
    files: [
      {
        file_id: 'cancelled-file',
        download_url: 'https://files.example.com/files/result.xlsx',
        file_name: 'cancelled.xlsx',
      },
    ],
    finalize: true,
  });
  observer.mockRestore();
  expect(response.body.result.isError).toBe(true);
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).status,
  ).toBe('CANCELLED');
  expect(
    await db.mcpArtifact.count({ where: { answerId: id, state: 'AVAILABLE' } }),
  ).toBe(0);
}, 30000);

it('fences cancellation at upload publication and retains model output provenance after a publication interruption', async () => {
  const id = await newJob('xlsx'),
    uploads = app.get(UploadsService),
    complete = uploads.complete.bind(uploads);
  const observer = vi
    .spyOn(uploads, 'complete')
    .mockImplementationOnce(async (...args) => {
      await api()
        .post(
          `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp/cancel`,
        )
        .set('Cookie', people.owner!.cookie)
        .set('X-Chat-Actor', people.owner!.id)
        .send({})
        .expect(201);
      return complete(...args);
    });
  const received = await tool('galaxy_submit_job_result', {
    job_id: id,
    submission_id: 'cancel-publish',
    sequence: 0,
    content: 'Cancelled during publication',
    files: [
      {
        file_id: 'publication-file',
        download_url: 'https://files.example.com/files/result.xlsx',
        file_name: 'publication.xlsx',
      },
    ],
    finalize: true,
  });
  observer.mockRestore();
  expect(received.body.result.isError).toBe(true);
  expect(
    await db.chatAiSourceIndex.count({
      where: { conversationId, label: 'publication.xlsx' },
    }),
  ).toBe(0);
  expect(
    await db.fileAsset.count({
      where: {
        organizationId,
        originalFilename: 'publication.xlsx',
        category: 'AI_ATTACHMENT',
      },
    }),
  ).toBe(0);
}, 30000);

it('applies existing upload byte limits before accumulating a remote file', async () => {
  const id = await newJob('xlsx');
  vi.stubEnv('UPLOAD_MAX_FILE_BYTES', '64');
  try {
    const received = await tool('galaxy_submit_job_result', {
      job_id: id,
      submission_id: 'byte-limit',
      sequence: 0,
      content: 'Too large',
      files: [
        {
          file_id: 'oversize',
          download_url: 'https://files.example.com/files/result.xlsx',
          file_name: 'oversize.xlsx',
        },
      ],
      finalize: true,
    });
    expect(received.body.result.isError).toBe(true);
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).status,
    ).not.toBe('COMPLETED');
  } finally {
    vi.unstubAllEnvs();
  }
});

it('sends only the current retry generation for the same original job', async () => {
  const id = await newJob(),
    path = `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp`;
  await api()
    .post(path + '/cancel')
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({})
    .expect(201);
  await api()
    .post(path + '/retry')
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({})
    .expect(201);
  const params = {
    name: 'galaxy.ai_job.created',
    arguments: { project_id: projectId },
    delivery: {
      mode: 'webhook',
      url: 'https://callback.example.com/events',
      secret: signingSecret,
    },
  };
  const subscription = (await rpc('events/subscribe', params)).body.result
    .id as string;
  const generations = await db.mcpOutbox.findMany({
    where: { answerId: id },
    orderBy: { generation: 'asc' },
  });
  // Dispatch is batched; earlier fixture jobs must not imply delivery in one tick.
  const pending = await db.mcpDelivery.count({
    where: { subscriptionId: subscription, state: 'PENDING' },
  });
  for (let round = 0; round < pending; round++) {
    await app.get(McpEventsService).tick();
    if (delivered.some((payload) => payload.eventId === generations[1]!.id))
      break;
  }
  expect(
    delivered.some((payload) => payload.eventId === generations[0]!.id),
  ).toBe(false);
  expect(
    delivered.filter((payload) => payload.eventId === generations[1]!.id),
  ).toHaveLength(1);
  await rpc('events/unsubscribe', {
    ...params,
    delivery: { mode: 'webhook', url: params.delivery.url },
  });
  expect(
    (
      await db.mcpSubscription.findUniqueOrThrow({
        where: { id: subscription },
      })
    ).revokedAt,
  ).not.toBeNull();
}, 15000);

it('fences old processing attempts and exposes the persisted result in the original job', async () => {
  const id = await newJob();
  const original = (await tool('galaxy_get_job', { job_id: id })).body.result
    .structuredContent;
  expect(original.attempt).toBe(1);
  const path = `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp`;
  await api()
    .post(path + '/retry')
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({})
    .expect(201);
  const current = (await tool('galaxy_get_job', { job_id: id })).body.result
    .structuredContent;
  expect(current.attempt).toBe(2);
  expect(current.execution_trace.attempt).toBe(2);
  expect(current.provider_started_at).toBeNull();
  const currentEvent = await db.mcpOutbox.findUniqueOrThrow({
    where: { answerId_generation: { answerId: id, generation: 1 } },
  });
  expect(current.execution_trace.event_id).toBe(currentEvent.id);
  for (const [name, arguments_] of [
    [
      'galaxy_report_job_progress',
      { job_id: id, attempt: 1, operation_id: 'late', stage: 'PROCESSING' },
    ],
    [
      'galaxy_submit_job_result',
      {
        job_id: id,
        attempt: 1,
        submission_id: 'late',
        sequence: 0,
        content: 'stale answer',
        finalize: true,
      },
    ],
  ] as const) {
    const late = await tool(name, arguments_);
    expect(late.body.result.isError).toBe(true);
    expect(late.body.result.content[0].text).toContain(
      'MCP_JOB_ATTEMPT_SUPERSEDED',
    );
  }
  const result = await tool('galaxy_submit_job_result', {
    job_id: id,
    attempt: 2,
    submission_id: 'current',
    sequence: 0,
    content: 'Only the current attempt is saved.',
    finalize: true,
  });
  expect(result.body.result.structuredContent.state).toBe('COMPLETED');
  const saved = (await tool('galaxy_get_job', { job_id: id })).body.result
    .structuredContent;
  expect(saved.thread_id).toBe(conversationId);
  expect(saved.result.answer).toBe('Only the current attempt is saved.');
  expect(saved.result.artifacts).toEqual([]);
}, 15000);

it('returns standard JSON OAuth boundary errors without a Web redirect', async () => {
  const registered = await api()
    .post('/mcp/oauth/register')
    .send({})
    .expect(400);
  expect(registered.body.error).toBe('invalid_client_metadata');
  expect(registered.headers.location).toBeUndefined();
  const token = await api()
    .post('/mcp/oauth/token')
    .type('form')
    .send({
      grant_type: 'client_credentials',
      client_id: clientId,
      resource: 'https://g00.example.test/mcp',
    })
    .expect(400);
  expect(token.body.error).toBe('unsupported_grant_type');
});

it('returns a declined consent to the registered callback once without issuing a code', async () => {
  const state = randomUUID();
  const started = await api()
    .get('/mcp/oauth/authorize')
    .query({
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      resource: 'https://g00.example.test/mcp',
      response_type: 'code',
      scope: scopes,
      code_challenge: createHash('sha256')
        .update('a'.repeat(43))
        .digest('base64url'),
      code_challenge_method: 'S256',
      state,
    })
    .expect(302);
  const id = new URL(started.headers.location!).searchParams.get('request');
  const declined = await api()
    .post(`/api/v1/mcp-auth/requests/${id}/decline`)
    .set('Cookie', people.owner!.cookie)
    .send({})
    .expect(201);
  const redirect = new URL(declined.body.redirect);
  expect(redirect.origin).toBe('https://chatgpt.com');
  expect(redirect.searchParams.get('error')).toBe('access_denied');
  expect(redirect.searchParams.get('state')).toBe(state);
  expect(redirect.searchParams.get('code')).toBeNull();
  await api()
    .post(`/api/v1/mcp-auth/requests/${id}/consent`)
    .set('Cookie', people.owner!.cookie)
    .send({})
    .expect(404);
});

it('fences a retry during file publication and allows the current attempt to resume the saved checkpoint', async () => {
  const id = await newJob('xlsx'),
    uploads = app.get(UploadsService),
    complete = uploads.complete.bind(uploads);
  const observer = vi
    .spyOn(uploads, 'complete')
    .mockImplementationOnce(async (...args) => {
      await api()
        .post(
          `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp/retry`,
        )
        .set('Cookie', people.owner!.cookie)
        .set('X-Chat-Actor', people.owner!.id)
        .send({})
        .expect(201);
      return complete(...args);
    });
  const input = {
    job_id: id,
    attempt: 1,
    submission_id: 'retry-publication',
    sequence: 0,
    content: 'A persisted checkpoint.',
    files: [
      {
        file_id: 'retry-publication-file',
        download_url: 'https://files.example.com/files/result.xlsx',
        file_name: 'retry-publication.xlsx',
      },
    ],
    finalize: true,
  };
  const stale = await tool('galaxy_submit_job_result', input);
  observer.mockRestore();
  expect(stale.body.result.isError).toBe(true);
  const current = (await tool('galaxy_get_job', { job_id: id })).body.result
    .structuredContent;
  expect(current.attempt).toBe(2);
  expect(['WAITING_NOTIFICATION', 'WAITING_SUBSCRIPTION']).toContain(
    current.state,
  );
  expect(current.error_code).toBeNull();
  expect(
    await db.fileAsset.count({
      where: { organizationId, originalFilename: 'retry-publication.xlsx' },
    }),
  ).toBe(0);
  const resumed = await tool('galaxy_submit_job_result', {
    ...input,
    attempt: 2,
  });
  expect(
    resumed.body.result.isError,
    JSON.stringify(resumed.body.result),
  ).not.toBe(true);
  expect(resumed.body.result.structuredContent.state).toBe('COMPLETED');
  expect(
    await db.mcpArtifact.count({ where: { answerId: id, state: 'AVAILABLE' } }),
  ).toBe(1);
}, 15000);

it('exposes personal MCP connection facts and records a public probe without treating it as account verification', async () => {
  const subscription = await rpc('events/subscribe', {
    name: 'galaxy.ai_job.created',
    arguments: { project_id: projectId },
    delivery: {
      mode: 'webhook',
      url: 'https://callback.example.com/events',
      secret: signingSecret,
    },
  }).expect(200);
  const subscriptionId = subscription.body.result.id as string;
  await db.mcpSubscription.update({
    where: { id: subscriptionId },
    data: {
      verifiedUntil: new Date(0),
      refreshBefore: new Date(Date.now() + 60000),
    },
  });
  const status = await api()
    .get('/api/v1/mcp-connection')
    .set('Cookie', people.owner!.cookie)
    .expect(200);
  expect(status.body.configuration.serverUrl).toBe(
    'https://g00.example.test/mcp',
  );
  expect(status.body.configuration.registrationMethod).toBe('DCR');
  expect(status.body.account.oauthAuthorized).toBe(true);
  expect(status.body.account.eventsSubscribed).toBe(true);
  const waitingId = await newJob();
  const probeWork = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [resolve(__dirname, '../../../scripts/mcp-drain-probe.cjs')],
        { cwd: resolve(__dirname, '..'), env: process.env, encoding: 'utf8' },
      ),
    ).components.find((row: { component: string }) => row.component === 'ai')
      .active as number;
  const before = probeWork();
  const saved = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: waitingId },
  });
  await db.chatAiAnswer.update({
    where: { id: waitingId },
    data: { usage: {} },
  });
  expect(probeWork()).toBe(before + 1);
  await db.chatAiAnswer.update({
    where: { id: waitingId },
    data: { usage: saved.usage! },
  });
  expect(
    (await tool('galaxy_get_job', { job_id: waitingId })).body.result
      .structuredContent.state,
  ).toBe('WAITING_NOTIFICATION');
  await db.mcpSubscription.update({
    where: { id: subscriptionId },
    data: {
      verifiedUntil: new Date(Date.now() + 60000),
      refreshBefore: new Date(0),
    },
  });
  expect(
    (
      await api()
        .get('/api/v1/mcp-connection')
        .set('Cookie', people.owner!.cookie)
    ).body.account.eventsSubscribed,
  ).toBe(false);
  await db.mcpSubscription.update({
    where: { id: subscriptionId },
    data: { refreshBefore: new Date(Date.now() + 60000) },
  });

  expect(status.body.publicCheck).toBeNull();
  expect(JSON.stringify(status.body)).not.toMatch(
    /tokenHash|secretCipher|callbackUrl|access_token/,
  );
  const probe = vi
    .spyOn(app.get(McpNetwork), 'request')
    .mockImplementation((url, method, headers, body) =>
      fixtureRequest('/probe' + new URL(url).pathname, method, headers, body),
    );
  const checked = await api()
    .post('/api/v1/mcp-connection/check')
    .set('Cookie', people.owner!.cookie)
    .expect(200);
  expect(checked.body.passed).toBe(true);
  expect(checked.body.checks).toHaveLength(6);
  probe.mockImplementation(async () => {
    throw new McpRemoteResponseError(307);
  });
  const bad = await api()
    .post('/api/v1/mcp-connection/check')
    .set('Cookie', people.owner!.cookie)
    .expect(200);
  expect(bad.body.passed).toBe(false);
  probe.mockRestore();
  const other = await api()
    .post('/api/v1/mcp-connection/revoke')
    .set('Cookie', people.other!.cookie)
    .expect(200);
  expect(other.body.account.oauthAuthorized).toBe(false);
  expect(
    (
      await api()
        .get('/api/v1/mcp-connection')
        .set('Cookie', people.owner!.cookie)
    ).body.account.oauthAuthorized,
  ).toBe(true);
});

it('keeps every unfinished MCP job visible to an incompatible receiver rollback even without a lease', async () => {
  const probe = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [resolve('../../scripts/mcp-drain-probe.cjs')],
        { encoding: 'utf8', env: process.env },
      ),
    ) as { openMcpJobs: number };
  const principal = await app
    .get(McpOAuth)
    .authenticate('Bearer ' + accessToken, scopes.split(' '));
  const baseline = probe().openMcpJobs;
  const id = await newJob();
  const saved = await db.chatAiAnswer.findUniqueOrThrow({ where: { id } });
  const usage = saved.usage as Record<string, unknown>;
  const metadata = usage.mcp as Record<string, unknown>;
  for (const state of [
    'WAITING_SUBSCRIPTION',
    'WAITING_NOTIFICATION',
    'NOTIFIED',
    'PROCESSING',
    'RECEIVING',
    'NEEDS_INPUT',
    'ERROR',
    'COMPLETED',
    'CANCELLED',
  ]) {
    await app
      .get(ProjectAiService)
      .workspaceTransaction(principal.actor, projectId, (tx) =>
        tx.chatAiAnswer.update({
          where: { id },
          data: { usage: { ...usage, mcp: { ...metadata, state } } },
        }),
      );
    expect(probe().openMcpJobs).toBe(
      baseline + (['COMPLETED', 'CANCELLED'].includes(state) ? 0 : 1),
    );
  }
}, 15000);

it('rotates refresh tokens without replay and revokes the resource grant', async () => {
  const refreshed = await api()
    .post('/mcp/oauth/token')
    .type('form')
    .send({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
      resource: 'https://g00.example.test/mcp',
    })
    .expect(200);
  await api()
    .post('/mcp/oauth/token')
    .type('form')
    .send({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
      resource: 'https://g00.example.test/mcp',
    })
    .expect(400);
  refreshToken = refreshed.body.refresh_token;
  await api()
    .post('/mcp/oauth/revoke')
    .type('form')
    .send({ token: accessToken, client_id: clientId })
    .expect(200);
  await rpc('tools/list', {}).expect(401);
  await api()
    .post('/mcp/oauth/token')
    .type('form')
    .send({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
      resource: 'https://g00.example.test/mcp',
    })
    .expect(400);
});

it('does not finalize a clarified attempt with the previous attempt XLSX', async () => {
  accessToken = (await connect()).access_token;
  const id = await newJob('xlsx');
  const saved = await tool('galaxy_submit_job_result', {
    job_id: id,
    submission_id: 'before-clarification',
    sequence: 0,
    content: 'First draft',
    files: [
      {
        file_id: 'first-draft-xlsx',
        download_url: 'https://files.example.com/files/result.xlsx',
        file_name: 'draft.xlsx',
      },
    ],
    finalize: false,
  }).expect(200);
  expect(saved.body.result.isError).not.toBe(true);
  expect(saved.body.result.structuredContent.saved_files).toBe(1);
  const progress = await tool('galaxy_report_job_progress', {
    job_id: id,
    operation_id: 'ask-for-discount',
    stage: 'NEEDS_INPUT',
    message: 'Confirm the discount?',
  }).expect(200);
  expect(progress.body.result.isError).not.toBe(true);
  await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/answers/${id}/mcp/clarify`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      operation_id: randomUUID(),
      attempt: 1,
      content: 'Use 20 percent discount and update the XLSX.',
    })
    .expect(201);
  const result = await tool('galaxy_submit_job_result', {
    job_id: id,
    attempt: 2,
    submission_id: `galaxy-${id}-2`,
    sequence: 0,
    content: 'Updated text only',
    finalize: true,
  }).expect(200);
  expect(result.body.result.isError).toBe(true);
  expect(JSON.stringify(result.body.result.content)).toContain(
    'MCP_REQUIRED_ARTIFACT_MISSING',
  );
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).status,
  ).not.toBe('COMPLETED');
  const revised = await tool('galaxy_submit_job_result', {
    job_id: id,
    attempt: 2,
    submission_id: `galaxy-${id}-2`,
    files: [
      {
        file_id: 'revised-draft-xlsx',
        download_url: 'https://files.example.com/files/result.xlsx',
        file_name: 'revised.xlsx',
      },
    ],
    finalize: true,
  });
  expect(revised.body.result.isError).not.toBe(true);
  const currentReceipt = await db.mcpArtifact.findFirstOrThrow({
    where: { answerId: id, submissionId: `galaxy-${id}-2`, state: 'AVAILABLE' },
  });
  const follow = await api()
    .post(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${conversationId}/mcp-jobs`,
    )
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({
      clientKey: randomUUID(),
      question: 'Sửa file Excel vừa tạo',
      sourceIds: [],
    })
    .expect(201);
  const followJob = (await tool('galaxy_get_job', { job_id: follow.body.id }))
    .body.result.structuredContent;
  expect(followJob.input_files).toHaveLength(1);
  expect(followJob.input_files[0].source_id).toBe(currentReceipt.sourceId);
  expect(
    await db.mcpArtifact.count({ where: { answerId: id, state: 'AVAILABLE' } }),
  ).toBe(2);
}, 30000);

it('rejects task creation when permission is revoked during the actual advisory-lock wait', async () => {
  const assignment = await db.userRole.findFirstOrThrow({
    where: { organizationId, userId: people.owner!.id },
  });
  const permission = await db.permission.findUniqueOrThrow({
    where: { code: 'task.create' },
  });
  await db.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: assignment.roleId,
        permissionId: permission.id,
      },
    },
    create: { roleId: assignment.roleId, permissionId: permission.id },
    update: {},
  });
  const assignments = await db.userRole.findMany({
    where: { organizationId, userId: people.owner!.id, status: 'active' },
    select: { roleId: true },
  });
  const grants = await db.rolePermission.findMany({
    where: {
      roleId: { in: assignments.map((row) => row.roleId) },
      permissionId: permission.id,
    },
    select: { roleId: true, permissionId: true },
  });
  const tokens = await connect('owner', 'galaxy.data.read galaxy.data.write');
  const operation_id = randomUUID(),
    title = 'F1 revoked-lock ' + operation_id;
  let release!: () => void, acquired!: () => void;
  const locked = new Promise<void>((resolve) => (acquired = resolve)),
    hold = new Promise<void>((resolve) => (release = resolve));
  const ownerLock = db.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${organizationId + ':' + people.owner!.id + ':' + operation_id},0))`,
      );
      acquired();
      await hold;
    },
    { timeout: 15000 },
  );
  await locked;
  const pending = tool(
    'galaxy_create_task',
    { project: projectId, operation_id, title },
    tokens.access_token,
  ).then((response) => response);
  try {
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        { waiting: boolean }[]
      >`WITH key AS (SELECT hashtextextended(${organizationId + ':' + people.owner!.id + ':' + operation_id},0) AS hash)
        SELECT EXISTS(SELECT 1 FROM pg_locks, key WHERE locktype='advisory' AND NOT granted
          AND classid=((hash >> 32) & 4294967295)::oid AND objid=(hash & 4294967295)::oid AND objsubid=1) AS waiting`;
      if (rows[0]?.waiting) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waiting).toBe(true);
    await db.rolePermission.deleteMany({
      where: {
        roleId: { in: grants.map((row) => row.roleId) },
        permissionId: permission.id,
      },
    });
    release();
    await ownerLock;
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.body.result.isError, JSON.stringify(response.body)).toBe(
      true,
    );
    expect(await db.task.count({ where: { organizationId, title } })).toBe(0);
  } finally {
    release();
    await ownerLock;
    await pending;
    await db.rolePermission.createMany({ data: grants, skipDuplicates: true });
  }
});

const newReviewJob = async (outputFormat?: 'xlsx', question?: string) => {
  const conversation = await api()
    .post(`/api/v1/project-chat/projects/${projectId}/ai/conversations`)
    .set('Cookie', people.owner!.cookie)
    .set('X-Chat-Actor', people.owner!.id)
    .send({ clientKey: randomUUID(), scope: 'ALL' })
    .expect(201);
  return newJob(outputFormat, question, conversation.body.id);
};

it.each([
  'Xuất ra Excel',
  'Chuyển file PDF này thành Excel',
  'Tạo bảng tính Excel',
  'Xuất file XLSX',
])(
  'R40 requires actual XLSX through job creation and finalize: %s',
  async (question) => {
    accessToken = (await connect()).access_token;
    const id = await newReviewJob(undefined, question);
    const snapshot = (await tool('galaxy_get_job', { job_id: id })).body.result
      .structuredContent;
    expect(snapshot.requested_outputs).toEqual(['xlsx']);
    const result = await tool('galaxy_submit_job_result', {
      job_id: id,
      submission_id: 'r40-text-only',
      sequence: 0,
      content: 'Đã tạo Excel (text only)',
      finalize: true,
    });
    expect(result.body.result.isError).toBe(true);
    expect(JSON.stringify(result.body.result.content)).toContain('xlsx');
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).status,
    ).not.toBe('COMPLETED');
  },
);

it.each([false, true])(
  'R40 imports both generic native references independent of requested/file order: %s',
  async (reverse) => {
    accessToken = (await connect()).access_token;
    outputFiles.set('/files/r40.xlsx', {
      bytes: quotation,
      mime: 'application/octet-stream',
    });
    const id = await newReviewJob(
      undefined,
      reverse ? 'Tạo cả PDF và Excel' : 'Tạo cả Excel và PDF',
    );
    const files = [
      {
        file_id: 'r40-pdf',
        download_url: 'https://files.example.com/files/result.pdf',
      },
      {
        file_id: 'r40-xlsx',
        download_url: 'https://files.example.com/files/r40.xlsx',
      },
    ];
    if (reverse) files.reverse();
    const first = await tool('galaxy_submit_job_result', {
      job_id: id,
      submission_id: 'r40-two-files',
      sequence: 0,
      content: 'Full answer',
      files: [files[0]],
      finalize: true,
    });
    expect(first.body.result.isError).toBe(true);
    expect(JSON.stringify(first.body.result.content)).toContain(
      'MCP_REQUIRED_ARTIFACT_MISSING',
    );
    const done = await tool('galaxy_submit_job_result', {
      job_id: id,
      submission_id: 'r40-two-files',
      files: [files[1]],
      finalize: true,
    });
    expect(done.body.result.isError).not.toBe(true);
    expect(done.body.result.structuredContent.state).toBe('COMPLETED');
    const receipts = await db.mcpArtifact.findMany({
      where: { answerId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(receipts.map((r) => r.mimeType).sort()).toEqual(
      [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ].sort(),
    );
    for (const receipt of receipts) {
      expect(receipt.state).toBe('AVAILABLE');
      const asset = await db.fileAsset.findUniqueOrThrow({
        where: { id: receipt.fileAssetId! },
      });
      const bytes = await readFile(
        join(process.env.FILE_STORAGE_PATH!, asset.storageKey),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        receipt.checksum,
      );
    }
    const replay = await tool('galaxy_submit_job_result', {
      job_id: id,
      submission_id: 'r40-two-files',
      files,
      finalize: true,
    });
    expect(replay.body.result.isError).not.toBe(true);
    expect(await db.mcpArtifact.count({ where: { answerId: id } })).toBe(2);
    expect(
      await db.entityAttachment.count({
        where: { entityType: 'ChatAiAnswer', entityId: id },
      }),
    ).toBe(2);
  },
  30000,
);

it('R40 publishes new text as PROCESSING and leaves a replay unchanged', async () => {
  accessToken = (await connect()).access_token;
  const id = await newReviewJob();
  const before = await db.chatAiAnswer.findUniqueOrThrow({ where: { id } });
  await db.chatAiAnswer.update({
    where: { id },
    data: {
      usage: {
        ...(before.usage as Prisma.JsonObject),
        mcp: {
          ...((before.usage as Prisma.JsonObject).mcp as Prisma.JsonObject),
          state: 'NOTIFIED',
        },
      } as Prisma.InputJsonObject,
    },
  });
  const input = {
    job_id: id,
    submission_id: 'r40-partial',
    sequence: 0,
    content: 'Actual Work text',
    finalize: false,
  };
  expect(
    (await tool('galaxy_submit_job_result', input)).body.result
      .structuredContent.state,
  ).toBe('PROCESSING');
  const stored = await db.chatAiAnswer.findUniqueOrThrow({ where: { id } });
  expect((stored.usage as Prisma.JsonObject).executionTrace).toHaveProperty(
    'first_answer_received_at',
  );
  const replay = await tool('galaxy_submit_job_result', input);
  expect(replay.body.result.isError).not.toBe(true);
  const repeated = await db.chatAiAnswer.findUniqueOrThrow({ where: { id } });
  expect(repeated.usage).toEqual(stored.usage);
  expect(await db.mcpResultPart.count({ where: { answerId: id } })).toBe(1);
  const history = await api()
    .get(
      `/api/v1/project-chat/projects/${projectId}/ai/conversations/${stored.conversationId}`,
    )
    .set('Cookie', people.owner!.cookie)
    .expect(200);
  expect(
    history.body.answers.find((a: { id: string }) => a.id === id),
  ).toMatchObject({
    answer: 'Actual Work text',
    mcpJob: { state: 'PROCESSING' },
  });
});

it.each(['RECEIVING_FILES', 'ERROR', 'NEEDS_INPUT'])(
  'R40 new text preserves %s state',
  async (state) => {
    accessToken = (await connect()).access_token;
    const id = await newReviewJob();
    const before = await db.chatAiAnswer.findUniqueOrThrow({ where: { id } });
    await db.chatAiAnswer.update({
      where: { id },
      data: {
        usage: {
          ...(before.usage as Prisma.JsonObject),
          mcp: {
            ...((before.usage as Prisma.JsonObject).mcp as Prisma.JsonObject),
            state,
          },
        } as Prisma.InputJsonObject,
      },
    });
    const result = await tool('galaxy_submit_job_result', {
      job_id: id,
      submission_id: 'r40-preserve',
      sequence: 0,
      content: 'Actual text',
      finalize: false,
    });
    expect(result.body.result.structuredContent.state).toBe(state);
  },
);

it.each([false, true])(
  'R40 retains size-limit error with chunked transfer: %s',
  async (chunked) => {
    accessToken = (await connect()).access_token;
    const id = await newReviewJob('xlsx');
    const previous = process.env.UPLOAD_MAX_FILE_BYTES;
    const path = '/files/r40-limit.xlsx';
    outputFiles.set(path, {
      bytes: quotation,
      mime: 'application/octet-stream',
    });
    if (chunked) chunkedOutputs.add(path);
    else chunkedOutputs.delete(path);
    process.env.UPLOAD_MAX_FILE_BYTES = '64';
    try {
      const result = await tool('galaxy_submit_job_result', {
        job_id: id,
        submission_id: 'r40-size',
        sequence: 0,
        content: 'Text remains available',
        files: [
          {
            file_id: 'r40-size',
            download_url: 'https://files.example.com' + path,
            file_name: 'result.xlsx',
          },
        ],
        finalize: true,
      });
      expect(result.body.result.isError).toBe(true);
      expect(JSON.stringify(result.body.result.content)).toContain(
        'MCP_ARTIFACT_STORAGE_LIMIT',
      );
      const receipt = await db.mcpArtifact.findFirstOrThrow({
        where: { answerId: id },
      });
      expect(receipt).toMatchObject({
        state: 'ERROR',
        errorCode: 'MCP_ARTIFACT_STORAGE_LIMIT',
        fileAssetId: null,
        checksum: null,
      });
      const failedJob = (await tool('galaxy_get_job', { job_id: id })).body
        .result.structuredContent;
      expect(failedJob.progress).not.toContain('gửi lại file reference');
      expect(
        (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).status,
      ).not.toBe('COMPLETED');
      expect(
        await db.fileStorageReservation.count({ where: { organizationId } }),
      ).toBe(0);
    } finally {
      chunkedOutputs.delete(path);
      if (previous === undefined) delete process.env.UPLOAD_MAX_FILE_BYTES;
      else process.env.UPLOAD_MAX_FILE_BYTES = previous;
    }
  },
);

it.each(['zip', 'docx', 'broken'])(
  'R40 never imports %s bytes as a workbook',
  async (kind) => {
    accessToken = (await connect()).access_token;
    const zip = new JSZip();
    zip.file('note.txt', 'ordinary archive');
    const bytes =
      kind === 'zip'
        ? await zip.generateAsync({ type: 'nodebuffer' })
        : kind === 'docx'
          ? await docxFixture()
          : Buffer.from([80, 75, 0, 0, 0, 0]);
    const path = '/files/r40-not-workbook-' + kind;
    outputFiles.set(path, { bytes, mime: 'application/octet-stream' });
    const id = await newReviewJob('xlsx');
    const result = await tool('galaxy_submit_job_result', {
      job_id: id,
      submission_id: 'r40-not-workbook',
      sequence: 0,
      content: 'Text',
      files: [
        {
          file_id: 'r40-not-workbook',
          download_url: 'https://files.example.com' + path,
        },
      ],
      finalize: true,
    });
    expect(result.body.result.isError).toBe(true);
    const receipt = await db.mcpArtifact.findFirstOrThrow({
      where: { answerId: id },
    });
    if (kind === 'broken')
      expect(receipt).toMatchObject({
        state: 'ERROR',
        errorCode: 'MCP_ARTIFACT_FORMAT_UNSUPPORTED',
        fileAssetId: null,
      });
    else {
      expect(receipt.state).toBe('AVAILABLE');
      expect(receipt.filename).toBe('result.' + kind);
      expect(JSON.stringify(result.body.result.content)).toContain('xlsx');
    }
    expect(
      (await db.chatAiAnswer.findUniqueOrThrow({ where: { id } })).status,
    ).not.toBe('COMPLETED');
  },
);

it('R40 keeps explicit metadata incompatible with bytes rejected', async () => {
  accessToken = (await connect()).access_token;
  const id = await newReviewJob('xlsx');
  const result = await tool('galaxy_submit_job_result', {
    job_id: id,
    submission_id: 'r40-mismatch',
    files: [
      {
        file_id: 'r40-pdf-as-xlsx',
        download_url: 'https://files.example.com/files/result.pdf',
        file_name: 'wrong.xlsx',
      },
    ],
    finalize: false,
  });
  expect(result.body.result.isError).toBe(true);
  const receipt = await db.mcpArtifact.findFirstOrThrow({
    where: { answerId: id },
  });
  expect(receipt).toMatchObject({
    state: 'ERROR',
    errorCode: 'MCP_ARTIFACT_CONTENT_INVALID',
    fileAssetId: null,
  });
});
