import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  existsSync,
  fsyncSync,
} from 'node:fs';
import { createServer, Server } from 'node:http';
import { join, isAbsolute } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../access-control/current-actor';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { PrismaService } from '../prisma.service';
import { AiError } from '../project-chat/ai-registry';
import { officePreviewReady } from '../project-chat/ai-office-preview';
import {
  chatGptCatalog,
  chatGptDiagnostic,
  chatGptRequest,
  readChatGptStream,
} from '../project-chat/ai-chatgpt-plan';

export const CHATGPT_SCOPES =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const prefix = 'chatgpt.connection.';
const attemptPrefix = 'chatgpt.attempt.';
const scopesGranted = (scopes: string[]) =>
  ['resource.invoke', 'chatgpt.tokens.use.direct'].every((s) =>
    scopes.includes(s),
  );
const safeCode = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]{1,200}$/.test(value)
    ? value
    : undefined;
const ownerSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  organizationMembershipId: z.string(),
  sessionId: z.string(),
});
type Owner = z.infer<typeof ownerSchema>;
const credentials = z.object({
  access_token: z.string().min(1).max(32000),
  refresh_token: z.string().min(1).max(32000).optional(),
  id_token: z.string().max(32000).optional(),
  expiresAt: z.number(),
  earliestRefreshAt: z.number().optional(),
});
const identity = z.object({
  issuer: z.literal(issuer),
  subject: z.string().min(1),
  label: z.string().max(300),
});
const recordSchema = z.object({
  generation: z.string(),
  owner: ownerSchema.optional(),
  clientId: z.string().optional(),
  identity: identity.optional(),
  scopes: z.array(z.string()).default([]),
  credentials: credentials.optional(),
  status: z.string().default('AUTH_NOT_STARTED'),
  models: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  catalogAt: z.string().nullable().default(null),
  verifiedAt: z.string().nullable().default(null),
  error: z
    .object({
      stage: z.string(),
      httpStatus: z.number().nullable(),
      code: z.string().optional(),
      requestId: z.string().optional(),
      at: z.string(),
      detail: z.string().optional(),
    })
    .optional(),
  refreshAttempt: z
    .object({ id: z.string(), expiresAt: z.number() })
    .optional(),
  revocation: z
    .enum(['NOT_RUN', 'CONFIRMED', 'UNCONFIRMED'])
    .default('NOT_RUN'),
  pending: z
    .object({
      state: z.string(),
      nonce: z.string(),
      verifier: z.string(),
      startId: z.string(),
      expiresAt: z.number(),
      redirectUri: z.string(),
      actor: ownerSchema,
      clientId: z.string().optional(),
      started: z.boolean().default(false),
    })
    .optional(),
});
type RecordState = z.infer<typeof recordSchema>;
const tokenSchema = z.object({
  access_token: z.string().min(1).max(32000),
  refresh_token: z.string().min(1).max(32000).optional(),
  id_token: z.string().min(1).max(32000).optional(),
  token_type: z.string().regex(/^Bearer$/i),
  expires_in: z.number().positive().max(86400),
  scope: z.string().max(4000).optional(),
  earliest_refresh_at: z.number().optional(),
});
const keyOf = (org: string) => prefix + org;
const bound = (a: CurrentActor): Owner => ownerSchema.parse(a);
const asActor = (o: Owner): CurrentActor => ({
  ...o,
  email: '',
  displayName: '',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'SELF',
  administrationTier: 0,
  managedDepartmentIds: [],
});
const sameOwner = (a: Owner, b: Owner) =>
  a.userId === b.userId &&
  a.organizationId === b.organizationId &&
  a.organizationMembershipId === b.organizationMembershipId;

@Injectable()
export class ChatGptConnectionService implements OnModuleInit, OnModuleDestroy {
  private key?: Buffer;
  private hostId?: string;
  private listener?: Server;
  private callbackOrigin?: string;
  private listenerError = 'RUNTIME_NOT_CONFIGURED';
  private endpoints?: {
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    revocation_endpoint: string;
  };
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const directory = process.env.GALAXY_CHATGPT_RUNTIME_PATH;
    if (!directory) return;
    try {
      if (!isAbsolute(directory)) throw new Error('INVALID_RUNTIME_PATH');
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const dir = lstatSync(directory);
      if (
        !dir.isDirectory() ||
        dir.isSymbolicLink() ||
        dir.mode & 0o077 ||
        dir.uid !== process.getuid?.()
      )
        throw new Error('UNSAFE_RUNTIME_DIRECTORY');
      const path = join(directory, 'host.json');
      if (
        !existsSync(path) &&
        (await this.db.systemSetting.findFirst({
          where: { key: { startsWith: prefix } },
        }))
      )
        throw new Error('MISSING_RUNTIME_KEY');
      try {
        const fd = openSync(
          path,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        try {
          writeFileSync(
            fd,
            JSON.stringify({
              key: randomBytes(32).toString('base64'),
              hostId: 'urn:uuid:' + randomUUID(),
            }),
          );
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = fstatSync(fd);
        if (
          !stat.isFile() ||
          stat.mode & 0o077 ||
          stat.uid !== process.getuid?.()
        )
          throw new Error('UNSAFE_RUNTIME_KEY');
        const saved = z
          .object({
            key: z.string(),
            hostId: z.string().regex(/^urn:uuid:[a-f0-9-]{36}$/),
          })
          .parse(JSON.parse(readFileSync(fd, 'utf8')));
        this.key = Buffer.from(saved.key, 'base64');
        this.hostId = saved.hostId;
        if (this.key.length !== 32) throw new Error('INVALID_RUNTIME_KEY');
      } finally {
        closeSync(fd);
      }
      const port = Number(process.env.GALAXY_CHATGPT_CALLBACK_PORT ?? 14555);
      if (
        !Number.isInteger(port) ||
        port < 0 ||
        port > 65535 ||
        (port === 0 && process.env.NODE_ENV !== 'test')
      )
        throw new Error('INVALID_CALLBACK_PORT');
      this.listener = createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; frame-ancestors 'none'",
        );
        res.setHeader('X-Content-Type-Options', 'nosniff');
        void (async () => {
          if (
            req.headers.origin &&
            ![
              'http://localhost:3000',
              'http://192.168.1.80:3000',
              issuer,
            ].includes(req.headers.origin)
          )
            throw new BadRequestException();
          if (
            req.method !== 'GET' ||
            !this.callbackOrigin ||
            req.headers.host !== new URL(this.callbackOrigin).host ||
            req.url!.length > 12000
          )
            throw new BadRequestException();
          const url = new URL(req.url!, this.callbackOrigin);
          if (url.pathname === '/auth/health') {
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                service: 'Galaxy OS ChatGPT callback',
                ready: true,
              }),
            );
            return;
          }
          if (url.pathname.startsWith('/auth/start/')) {
            const location = await this.authorize(
              url.pathname.slice('/auth/start/'.length),
            );
            res.writeHead(302, { Location: location });
            res.end();
            return;
          }
          if (url.pathname !== '/auth/callback')
            throw new BadRequestException();
          await this.callback(url);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(
            '<!doctype html><title>Galaxy OS</title><p>Đã xử lý đăng nhập. Quay lại Galaxy để xem danh tính, quyền và model thực nhận.</p><a href="http://localhost:3000/settings/chatgpt-connection">Kết nối ChatGPT</a>',
          );
        })().catch(() => {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(
            'Không thể hoàn tất lần đăng nhập này. Quay lại Galaxy để xem trạng thái hoặc bắt đầu lại.',
          );
        });
      });
      this.listener.requestTimeout = 15000;
      this.listener.headersTimeout = 10000;
      await new Promise<void>((resolve, reject) => {
        this.listener!.once('error', reject);
        this.listener!.listen(port, '127.0.0.1', () => {
          this.listener!.removeListener('error', reject);
          resolve();
        });
      });
      const address = this.listener.address();
      if (!address || typeof address === 'string')
        throw new Error('LISTENER_NOT_READY');
      this.callbackOrigin = 'http://127.0.0.1:' + address.port;
      this.listenerError = '';
    } catch (e) {
      this.listenerError =
        (e as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? 'CALLBACK_PORT_IN_USE'
          : 'RUNTIME_KEY_OR_LISTENER_ERROR';
    }
  }
  async onModuleDestroy() {
    if (this.listener?.listening)
      await new Promise<void>((resolve) =>
        this.listener!.close(() => resolve()),
      );
    this.key = undefined;
    this.callbackOrigin = undefined;
  }
  private seal(org: string, value: RecordState) {
    if (!this.key) throw new ConflictException('RUNTIME_NOT_CONFIGURED');
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(keyOf(org)));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  }
  private async read(
    org: string,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<RecordState> {
    const row = await tx.systemSetting.findUnique({
      where: { key: keyOf(org) },
    });
    if (!row) return recordSchema.parse({ generation: randomUUID() });
    if (!this.key) throw new ConflictException('RUNTIME_NOT_CONFIGURED');
    const box = z
      .object({ iv: z.string(), tag: z.string(), data: z.string() })
      .parse(row.value);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(box.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(keyOf(org)));
    decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
    return recordSchema.parse(
      JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(box.data, 'base64')),
          decipher.final(),
        ]).toString('utf8'),
      ),
    );
  }
  private async save(
    org: string,
    record: RecordState,
    tx: Prisma.TransactionClient,
  ) {
    const value = this.seal(org, record);
    await tx.systemSetting.upsert({
      where: { key: keyOf(org) },
      create: { key: keyOf(org), value },
      update: { value },
    });
  }
  private locked<T>(
    org: string,
    run: (tx: Prisma.TransactionClient, r: RecordState) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${keyOf(org)},0))::text`,
        );
        return run(tx, await this.read(org, tx));
      },
      { timeout: 25000, maxWait: 10000 },
    );
  }
  private async fresh(
    actor: CurrentActor,
    permission?: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const fresh = await this.access.freshActor(tx, actor);
    const credential = await tx.passwordCredential.findUnique({
      where: { userId: actor.userId },
      select: { mustChangePassword: true },
    });
    if (
      credential?.mustChangePassword ||
      fresh.mustChangePassword ||
      (permission &&
        !fresh.permissionSources?.some(
          (s) => s.permission === permission && s.scopeType === 'SYSTEM',
        ))
    )
      throw new ForbiddenException('System Administrator required');
    return fresh;
  }
  private async discovery() {
    if (this.endpoints) return this.endpoints;
    const response = await fetch(issuer + '/.well-known/openid-configuration', {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new AiError('DISCOVERY_FAILED', response.status);
    const found = z
      .object({
        issuer: z.literal(issuer),
        authorization_endpoint: z.literal(issuer + '/api/accounts/authorize'),
        token_endpoint: z.literal(issuer + '/api/accounts/oauth/token'),
        jwks_uri: z.literal(issuer + '/.well-known/jwks.json'),
        revocation_endpoint: z.literal(issuer + '/api/accounts/oauth/revoke'),
      })
      .parse(await response.json());
    this.endpoints = found;
    this.jwks = createRemoteJWKSet(new URL(found.jwks_uri), {
      timeoutDuration: 10000,
    });
    return found;
  }
  async metadata(actor: CurrentActor) {
    const fresh = await this.fresh(actor, 'system.settings.read');
    const r = await this.read(actor.organizationId);
    const update =
      fresh.permissionSources?.some(
        (s) =>
          s.permission === 'system.settings.update' && s.scopeType === 'SYSTEM',
      ) ?? false;
    const owner = r.owner && sameOwner(bound(actor), r.owner);
    const pending = !!r.pending && r.pending.expiresAt > Date.now();
    const verifying = r.status === 'VERIFYING_IDENTITY';
    return {
      status: pending ? 'AUTH_PENDING' : r.status,
      canBeginAuth: update && !!this.callbackOrigin && !pending && !verifying,
      canConnect: update && !!this.callbackOrigin && !pending && !verifying,
      canTestOwnerInference:
        update &&
        !!owner &&
        !!r.identity &&
        !!r.credentials &&
        scopesGranted(r.scopes) &&
        r.models.length > 0 &&
        !['DISCONNECTED', 'REAUTH_REQUIRED', 'AUTH_CANCELLED'].includes(
          r.status,
        ) &&
        !r.refreshAttempt,
      ownerInferenceVerified: !!r.verifiedAt,
      canStaffUseAI: false,
      canDisconnect: update && (!!r.credentials || pending),
      canCancel: update && (pending || verifying),
      canCheck: update,
      identity: r.identity ? { label: r.identity.label } : null,
      registration: r.clientId
        ? { clientId: r.clientId, verified: !!r.identity }
        : null,
      models: r.models,
      scopes: r.scopes,
      inferenceGrant: scopesGranted(r.scopes) ? 'GRANTED' : 'NOT_GRANTED',
      appEligibility: r.identity ? 'IDENTITY_VERIFIED' : 'NOT_VERIFIED',
      providerScope: 'OWNER_ONLY_STAFF_UNCONFIRMED',
      callbackHost: this.callbackOrigin ? 'READY' : this.listenerError,
      callbackLan: 'HOST_BROWSER_REQUIRED',
      catalogAt: r.catalogAt,
      providerVerifiedAt: r.verifiedAt,
      checkedAt: r.catalogAt,
      error: r.error ?? null,
      revocation: r.revocation,
      checkKind: 'PROVIDER_CATALOG',
      usage: 'UNKNOWN',
    };
  }
  async begin(actor: CurrentActor) {
    await this.fresh(actor, 'system.settings.update');
    if (!this.callbackOrigin) throw new ConflictException(this.listenerError);
    await this.discovery();
    return this.locked(actor.organizationId, async (tx, r) => {
      await this.fresh(actor, 'system.settings.update', tx);
      if (r.owner && !sameOwner(bound(actor), r.owner))
        throw new ForbiddenException('OWNER_ONLY');
      if (
        r.status === 'VERIFYING_IDENTITY' ||
        (r.pending && r.pending.expiresAt > Date.now())
      )
        throw new ConflictException('AUTH_ALREADY_PENDING');
      if (r.pending)
        await tx.systemSetting.deleteMany({
          where: {
            key:
              attemptPrefix +
              createHash('sha256').update(r.pending.state).digest('hex'),
          },
        });
      const p = {
        state: randomBytes(32).toString('base64url'),
        nonce: randomBytes(32).toString('base64url'),
        verifier: randomBytes(32).toString('base64url'),
        startId: randomUUID(),
        expiresAt: Date.now() + 600000,
        redirectUri: this.callbackOrigin + '/auth/callback',
        actor: bound(actor),
        clientId: r.clientId,
        started: false,
      };
      r.pending = p;
      await this.audit.write(tx, actor, {
        action: 'chatgpt.connection.begin',
        entityType: 'ChatGptConnection',
        entityId: actor.organizationId,
        metadata: { generation: r.generation, outcome: 'AUTH_PENDING' },
      });
      await this.save(actor.organizationId, r, tx);
      const key =
        attemptPrefix + createHash('sha256').update(p.state).digest('hex');
      await tx.systemSetting.upsert({
        where: { key },
        create: {
          key,
          value: { organizationId: actor.organizationId, startId: p.startId },
        },
        update: {
          value: { organizationId: actor.organizationId, startId: p.startId },
        },
      });
      return {
        startUrl: this.callbackOrigin + '/auth/start/' + p.startId,
        expiresAt: new Date(p.expiresAt).toISOString(),
      };
    });
  }
  async authorize(startId: string) {
    if (!z.string().uuid().safeParse(startId).success)
      throw new BadRequestException();
    const lookup = await this.db.systemSetting.findFirst({
      where: {
        key: { startsWith: attemptPrefix },
        value: { path: ['startId'], equals: startId },
      },
    });
    const org = z
      .object({ organizationId: z.string() })
      .parse(lookup?.value).organizationId;
    const endpoints = await this.discovery();
    return this.locked(org, async (tx, r) => {
      const p = r.pending;
      if (!p || p.startId !== startId || p.expiresAt <= Date.now() || p.started)
        throw new BadRequestException('INVALID_ATTEMPT');
      await this.fresh(asActor(p.actor), 'system.settings.update', tx);
      p.started = true;
      await this.save(org, r, tx);
      const url = new URL(endpoints.authorization_endpoint);
      const params: Record<string, string> = {
        client_id: p.clientId ?? 'dynamic_agent_client',
        ext_agent_host_id: this.hostId!,
        response_type: 'code',
        redirect_uri: p.redirectUri,
        scope: CHATGPT_SCOPES,
        resource,
        state: p.state,
        nonce: p.nonce,
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256')
          .update(p.verifier)
          .digest('base64url'),
      };
      if (!p.clientId) params.agent_name_hint = 'Galaxy OS';
      else {
        if (r.credentials?.id_token)
          params.id_token_hint = r.credentials.id_token;
        if (r.identity && !scopesGranted(r.scopes)) params.prompt = 'consent';
      }
      for (const [key, value] of Object.entries(params))
        url.searchParams.set(key, value);
      return url.toString();
    });
  }
  private failure(
    e: unknown,
    stage: string,
  ): NonNullable<RecordState['error']> {
    return {
      stage: e instanceof AiError && e.adapterStage ? e.adapterStage : stage,
      ...(e instanceof AiError && e.upstream.detail
        ? { detail: e.upstream.detail }
        : {}),
      httpStatus: e instanceof AiError ? e.httpStatus : null,
      code:
        e instanceof AiError
          ? (e.upstream.code ?? e.code)
          : 'CONNECTION_FAILED',
      ...(e instanceof AiError && e.upstream.requestId
        ? { requestId: e.upstream.requestId }
        : {}),
      at: new Date().toISOString(),
    };
  }
  private async token(form: Record<string, string>) {
    const endpoint = (await this.discovery()).token_endpoint;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new AiError('TOKEN_EXCHANGE_FAILED', response.status, {
        code: safeCode(body?.error),
        detail: chatGptDiagnostic(body?.error_description ?? body?.detail),
        requestId: safeCode(response.headers.get('x-request-id')),
      });
    }
    return tokenSchema.parse(await response.json());
  }
  private tokenSet(
    t: z.infer<typeof tokenSchema>,
    previous?: z.infer<typeof credentials>,
  ) {
    return {
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? previous?.refresh_token,
      id_token: t.id_token ?? previous?.id_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      ...(t.earliest_refresh_at
        ? { earliestRefreshAt: t.earliest_refresh_at * 1000 }
        : {}),
    };
  }
  async callback(url: URL) {
    if (url.origin !== this.callbackOrigin || url.pathname !== '/auth/callback')
      throw new BadRequestException('INVALID_CALLBACK');
    for (const key of url.searchParams.keys())
      if (url.searchParams.getAll(key).length !== 1)
        throw new BadRequestException('DUPLICATE_CALLBACK_PARAMETER');
    const state = z
      .string()
      .min(32)
      .max(128)
      .parse(url.searchParams.get('state'));
    const lookupKey =
      attemptPrefix + createHash('sha256').update(state).digest('hex');
    const lookup = await this.db.systemSetting.findUnique({
      where: { key: lookupKey },
    });
    if (!lookup) throw new BadRequestException('INVALID_STATE');
    const org = z
      .object({ organizationId: z.string() })
      .parse(lookup.value).organizationId;
    const claimed = await this.locked(org, async (tx, r) => {
      const p = r.pending;
      if (
        !p ||
        !p.started ||
        p.expiresAt <= Date.now() ||
        p.state.length !== state.length ||
        !timingSafeEqual(Buffer.from(p.state), Buffer.from(state))
      )
        throw new BadRequestException('INVALID_STATE');
      await this.fresh(asActor(p.actor), 'system.settings.update', tx);
      await tx.systemSetting.deleteMany({ where: { key: lookupKey } });
      r.pending = undefined;
      if (url.searchParams.has('error')) {
        r.status = 'CONSENT_DECLINED';
        r.error = {
          stage: 'AUTHORIZE',
          code: safeCode(url.searchParams.get('error')) ?? 'OAUTH_ERROR',
          httpStatus: null,
          at: new Date().toISOString(),
        };
        await this.save(org, r, tx);
        return null;
      }
      const supplied = url.searchParams.get('client_id');
      const clientId = p.clientId ?? supplied;
      if (
        !clientId ||
        !/^oaiapp_[A-Za-z0-9_-]{1,200}$/.test(clientId) ||
        (p.clientId && supplied && supplied !== p.clientId)
      ) {
        r.status = 'REGISTRATION_INCOMPLETE';
        await this.save(org, r, tx);
        return null;
      }
      const code = z
        .string()
        .min(1)
        .max(6000)
        .parse(url.searchParams.get('code'));
      r.clientId = clientId;
      r.owner = p.actor;
      r.status = 'VERIFYING_IDENTITY';
      await this.save(org, r, tx);
      return {
        p,
        code,
        clientId,
        generation: r.generation,
        identity: r.identity,
      };
    });
    if (!claimed) return;
    try {
      const t = await this.token({
        grant_type: 'authorization_code',
        client_id: claimed.clientId,
        code: claimed.code,
        code_verifier: claimed.p.verifier,
        redirect_uri: claimed.p.redirectUri,
        resource,
      });
      if (!t.id_token) throw new AiError('ID_TOKEN_REQUIRED');
      await this.discovery();
      const { payload } = await jwtVerify(t.id_token, this.jwks!, {
        issuer,
        audience: claimed.clientId,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
        clockTolerance: 5,
      });
      if (
        payload.nonce !== claimed.p.nonce ||
        !payload.sub ||
        (claimed.identity && claimed.identity.subject !== payload.sub)
      )
        throw new AiError('IDENTITY_MISMATCH');
      if (
        payload.aud instanceof Array &&
        payload.aud.length > 1 &&
        payload.azp !== claimed.clientId
      )
        throw new AiError('IDENTITY_MISMATCH');
      await this.locked(org, async (tx, r) => {
        if (
          r.generation !== claimed.generation ||
          r.status !== 'VERIFYING_IDENTITY'
        )
          throw new AiError('CONNECTION_CHANGED');
        await this.fresh(
          asActor(claimed.p.actor),
          'system.settings.update',
          tx,
        );
        r.identity = {
          issuer,
          subject: payload.sub!,
          label:
            typeof payload.email === 'string'
              ? payload.email.slice(0, 300)
              : typeof payload.name === 'string'
                ? payload.name.slice(0, 300)
                : 'Tài khoản ChatGPT',
        };
        r.scopes = (t.scope ?? '').split(/\s+/).filter(Boolean);
        r.credentials = this.tokenSet(t);
        r.generation = randomUUID();
        r.verifiedAt = null;
        r.revocation = 'NOT_RUN';
        r.refreshAttempt = undefined;
        r.models = [];
        r.catalogAt = null;
        r.error = undefined;
        r.status = scopesGranted(r.scopes)
          ? 'OWNER_READY'
          : 'IDENTITY_VERIFIED';
        await this.save(org, r, tx);
        await this.audit.write(tx, asActor(claimed.p.actor), {
          action: 'chatgpt.connection.activate',
          entityType: 'ChatGptConnection',
          entityId: org,
          metadata: { generation: r.generation, outcome: r.status },
        });
      });
    } catch (e) {
      await this.locked(org, async (tx, r) => {
        if (r.generation !== claimed.generation) return;
        r.error = this.failure(e, 'TOKEN_OR_IDENTITY');
        r.status = 'REAUTH_REQUIRED';
        await this.save(org, r, tx);
      });
      throw new BadRequestException('OAUTH_VERIFICATION_FAILED');
    }
    try {
      await this.catalog(asActor(claimed.p.actor));
    } catch {
      /* Catalog/grant errors retain the verified identity. */
    }
  }
  async cancel(actor: CurrentActor) {
    await this.fresh(actor, 'system.settings.update');
    await this.locked(actor.organizationId, async (tx, r) => {
      await this.fresh(actor, 'system.settings.update', tx);
      if (r.pending)
        await tx.systemSetting.deleteMany({
          where: {
            key:
              attemptPrefix +
              createHash('sha256').update(r.pending.state).digest('hex'),
          },
        });
      r.pending = undefined;
      r.generation = randomUUID();
      r.status = 'AUTH_CANCELLED';
      r.verifiedAt = null;
      await this.save(actor.organizationId, r, tx);
      await this.audit.write(tx, actor, {
        action: 'chatgpt.connection.cancel',
        entityType: 'ChatGptConnection',
        entityId: actor.organizationId,
        metadata: { generation: r.generation, outcome: r.status },
      });
    });
    return this.metadata(actor);
  }
  async disconnect(actor: CurrentActor) {
    await this.fresh(actor, 'system.settings.update');
    const selected = await this.locked(actor.organizationId, async (tx, r) => {
      await this.fresh(actor, 'system.settings.update', tx);
      if (r.pending)
        await tx.systemSetting.deleteMany({
          where: {
            key:
              attemptPrefix +
              createHash('sha256').update(r.pending.state).digest('hex'),
          },
        });
      const tokens = r.credentials;
      const refreshUnresolved = !!r.refreshAttempt;
      r.pending = undefined;
      r.credentials = undefined;
      r.generation = randomUUID();
      r.status = 'DISCONNECTED';
      r.models = [];
      r.verifiedAt = null;
      r.revocation = 'UNCONFIRMED';
      r.refreshAttempt = undefined;
      await this.save(actor.organizationId, r, tx);
      await this.audit.write(tx, actor, {
        action: 'chatgpt.connection.disconnect',
        entityType: 'ChatGptConnection',
        entityId: actor.organizationId,
        metadata: { generation: r.generation, outcome: r.status },
      });
      return {
        tokens,
        refreshUnresolved,
        clientId: r.clientId,
        generation: r.generation,
      };
    });
    let confirmed = false;
    if (
      !selected.refreshUnresolved &&
      selected.tokens?.refresh_token &&
      selected.clientId
    )
      try {
        const endpoint = (await this.discovery()).revocation_endpoint;
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              token: selected.tokens.refresh_token,
              token_type_hint: 'refresh_token',
              client_id: selected.clientId,
            }),
            signal: AbortSignal.timeout(5000),
            redirect: 'error',
          });
          if (response.status === 200) {
            confirmed = true;
            break;
          }
          if (response.status < 500) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch {
        /* Local disconnect is already durable; remote confirmation is independent. */
      }
    await this.locked(actor.organizationId, async (tx, r) => {
      if (r.generation === selected.generation) {
        r.revocation = confirmed ? 'CONFIRMED' : 'UNCONFIRMED';
        await this.save(actor.organizationId, r, tx);
      }
    });
    return this.metadata(actor);
  }
  async owner(
    actor: CurrentActor,
    generation?: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    // Hold the connection fence through a caller's Project transaction and final publish.
    if (tx !== this.db)
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${keyOf(actor.organizationId)},0))::text`,
      );
    await this.fresh(actor, 'system.settings.update', tx);
    const r = await this.read(actor.organizationId, tx);
    if (!r.owner || !sameOwner(bound(actor), r.owner))
      throw new AiError('CHATGPT_OWNER_ONLY');
    if (generation && r.generation !== generation)
      throw new AiError('CONNECTION_CHANGED');
    if (
      !r.identity ||
      !r.credentials ||
      !scopesGranted(r.scopes) ||
      r.status === 'DISCONNECTED' ||
      r.status === 'REAUTH_REQUIRED' ||
      r.status === 'AUTH_CANCELLED'
    )
      throw new AiError('CHATGPT_RECONNECT_OR_GRANT_REQUIRED');
    return {
      generation: r.generation,
      models: r.models,
      verifiedAt: r.verifiedAt,
    };
  }
  private async credential(actor: CurrentActor, generation: string) {
    for (let wait = 0; wait < 300; wait++) {
      const outcome = await this.locked(actor.organizationId, async (tx, r) => {
        await this.owner(actor, generation, tx);
        if (r.credentials!.expiresAt > Date.now() + 60000)
          return { token: r.credentials!.access_token };
        if (r.refreshAttempt)
          return r.refreshAttempt.expiresAt > Date.now()
            ? { pending: true }
            : { error: new AiError('REFRESH_OUTCOME_UNKNOWN') };
        if (!r.credentials!.refresh_token) {
          r.credentials = undefined;
          r.status = 'REAUTH_REQUIRED';
          r.generation = randomUUID();
          r.error = this.failure(
            new AiError('CHATGPT_REAUTH_REQUIRED'),
            'REFRESH',
          );
          await this.save(actor.organizationId, r, tx);
          return { error: new AiError('CHATGPT_REAUTH_REQUIRED') };
        }
        if (
          r.credentials!.earliestRefreshAt &&
          r.credentials!.earliestRefreshAt > Date.now()
        )
          return { error: new AiError('REFRESH_TOO_EARLY') };
        r.refreshAttempt = { id: randomUUID(), expiresAt: Date.now() + 15000 };
        // Commit before HTTP: a crash after rotation must never replay the old token.
        r.error = this.failure(
          new AiError('REFRESH_OUTCOME_UNKNOWN'),
          'REFRESH',
        );
        await this.save(actor.organizationId, r, tx);
        return {
          id: r.refreshAttempt.id,
          clientId: r.clientId!,
          refreshToken: r.credentials!.refresh_token,
        };
      });
      if ('error' in outcome) throw outcome.error;
      if ('token' in outcome) return outcome.token;
      if ('pending' in outcome) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      try {
        const token = await this.token({
          grant_type: 'refresh_token',
          client_id: outcome.clientId,
          refresh_token: outcome.refreshToken,
          resource,
        });
        if (!token.refresh_token)
          throw new AiError('ROTATED_REFRESH_TOKEN_REQUIRED');
        const completed = await this.locked(
          actor.organizationId,
          async (tx, r) => {
            await this.owner(actor, generation, tx);
            if (r.refreshAttempt?.id !== outcome.id)
              throw new AiError('CONNECTION_CHANGED');
            r.credentials = this.tokenSet(token, r.credentials);
            if (token.scope !== undefined)
              r.scopes = token.scope.split(/\s+/).filter(Boolean);
            r.error = undefined;
            if (r.status !== 'VERIFYING_IDENTITY')
              r.status = scopesGranted(r.scopes)
                ? 'OWNER_READY'
                : 'IDENTITY_VERIFIED';
            r.refreshAttempt = undefined;
            await this.save(actor.organizationId, r, tx);
            await this.audit.write(tx, actor, {
              action: 'chatgpt.connection.refresh',
              entityType: 'ChatGptConnection',
              entityId: actor.organizationId,
              metadata: { generation: r.generation, outcome: 'REFRESHED' },
            });
            return {
              token: r.credentials.access_token,
              granted: scopesGranted(r.scopes),
            };
          },
        );
        if (!completed.granted) throw new AiError('CHATGPT_GRANT_REQUIRED');
        return completed.token;
      } catch (error) {
        await this.locked(actor.organizationId, async (tx, r) => {
          if (
            r.generation !== generation ||
            r.refreshAttempt?.id !== outcome.id
          )
            return;
          r.error = this.failure(error, 'REFRESH');
          if (
            !(error instanceof AiError) ||
            error.code === 'ROTATED_REFRESH_TOKEN_REQUIRED'
          ) {
            r.error.code = 'REFRESH_OUTCOME_UNKNOWN';
            r.refreshAttempt.expiresAt = 0;
          } else r.refreshAttempt = undefined;
          if (
            error instanceof AiError &&
            [
              'invalid_grant',
              'invalid_refresh_token',
              'token_expired',
              'refresh_token_expired',
              'refresh_token_invalidated',
              'refresh_token_reused',
            ].includes(error.upstream.code ?? '')
          ) {
            r.credentials = undefined;
            r.status = 'REAUTH_REQUIRED';
            r.generation = randomUUID();
          }
          await this.save(actor.organizationId, r, tx);
        });
        throw error;
      }
    }
    throw new AiError('REFRESH_OUTCOME_UNKNOWN');
  }
  async catalog(actor: CurrentActor) {
    const owner = await this.owner(actor),
      token = await this.credential(actor, owner.generation);
    try {
      const response = await fetch(resource + '/models', {
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new AiError('CHATGPT_CATALOG_FAILED', response.status, {
          code: safeCode(body?.error?.code),
          detail: chatGptDiagnostic(body?.detail),
          requestId: safeCode(response.headers.get('x-request-id')),
        });
      }
      const models = chatGptCatalog(await response.json());
      await this.locked(actor.organizationId, async (tx, r) => {
        await this.owner(actor, owner.generation, tx);
        r.models = models;
        r.catalogAt = new Date().toISOString();
        r.error = undefined;
        await this.save(actor.organizationId, r, tx);
      });
      return models;
    } catch (e) {
      await this.locked(actor.organizationId, async (tx, r) => {
        if (r.generation === owner.generation && r.error?.stage !== 'REFRESH') {
          r.error = this.failure(e, 'MODELS');
          await this.save(actor.organizationId, r, tx);
        }
      });
      throw e;
    }
  }
  async respond(
    actor: CurrentActor,
    generation: string,
    request: unknown,
    signal: AbortSignal,
  ) {
    const body = chatGptRequest(request, await officePreviewReady()),
      owner = await this.owner(actor, generation);
    if (!owner.models.some((m) => m.id === body.model))
      throw new AiError('MODEL_NOT_AVAILABLE');
    const token = await this.credential(actor, generation);
    await this.owner(actor, generation);
    signal.throwIfAborted();
    try {
      const response = await fetch(resource + '/responses', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
        redirect: 'error',
      });
      const result = await readChatGptStream(response, signal);
      await this.locked(actor.organizationId, async (tx, r) => {
        await this.owner(actor, generation, tx);
        r.verifiedAt = new Date().toISOString();
        r.error = undefined;
        await this.save(actor.organizationId, r, tx);
      });
      return result;
    } catch (e) {
      await this.locked(actor.organizationId, async (tx, r) => {
        if (r.generation === generation) {
          r.error = this.failure(e, 'RESPONSES');
          await this.save(actor.organizationId, r, tx);
        }
      });
      throw e;
    }
  }
}
