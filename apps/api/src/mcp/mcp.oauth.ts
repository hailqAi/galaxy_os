import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { McpGrant, Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CurrentActor } from '../access-control/current-actor';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { PrismaService } from '../prisma.service';
import { MCP_SCOPES, httpsUrl } from './mcp.schemas';
import { validateMcpEncryptionKey } from './mcp.network';

export const mcpDigest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const scopes = z
  .string()
  .min(1)
  .refine((value) =>
    value.split(' ').every((scope) => MCP_SCOPES.includes(scope)),
  );
const authorizationQuery = z
  .object({
    client_id: z.string().min(1).max(2048),
    redirect_uri: httpsUrl,
    resource: httpsUrl,
    response_type: z.literal('code'),
    scope: scopes,
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal('S256'),
    state: z.string().min(1).max(2048),
  })
  // OAuth authorization endpoints must ignore unrecognized extensions.
  .strip();
const oauthUser = z.object({ authorizationId: z.string().uuid() });
export type McpPrincipal = {
  actor: CurrentActor;
  authorizationId: string;
  clientId: string;
  scopes: string[];
};

@Injectable()
export class McpOAuth implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
  ) {}
  onModuleInit() {
    if (process.env.FEATURE_GALAXY_MCP === 'true') {
      this.origin();
      validateMcpEncryptionKey();
    }
  }
  origin() {
    const raw = process.env.APP_PUBLIC_ORIGIN;
    if (
      !raw ||
      new URL(raw).origin !== raw ||
      new URL(raw).protocol !== 'https:'
    )
      throw new ServiceUnavailableException('MCP_HTTPS_REQUIRED');
    return raw;
  }
  resource() {
    return this.origin() + '/mcp';
  }
  metadata() {
    const origin = this.origin();
    return {
      issuer: origin,
      authorization_endpoint: origin + '/mcp/oauth/authorize',
      token_endpoint: origin + '/mcp/oauth/token',
      registration_endpoint: origin + '/mcp/oauth/register',
      revocation_endpoint: origin + '/mcp/oauth/revoke',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: MCP_SCOPES,
      authorization_response_iss_parameter_supported: true,
    };
  }
  protectedResource() {
    return {
      resource: this.resource(),
      authorization_servers: [this.origin()],
      scopes_supported: MCP_SCOPES,
      bearer_methods_supported: ['header'],
    };
  }
  async register(value: unknown) {
    const parsed = z
      .object({
        redirect_uris: z.array(httpsUrl).min(1),
        client_name: z.string().max(200).optional(),
        token_endpoint_auth_method: z.literal('none').default('none'),
        grant_types: z
          .array(z.enum(['authorization_code', 'refresh_token']))
          .default(['authorization_code', 'refresh_token']),
        response_types: z.array(z.literal('code')).default(['code']),
      })
      .passthrough()
      .safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('invalid_client_metadata');
    const input = parsed.data;
    if (
      input.redirect_uris.some((uri) => new URL(uri).hostname !== 'chatgpt.com')
    )
      throw new BadRequestException('invalid_redirect_uri');
    const row = await this.db.mcpClient.create({
      data: {
        id: 'galaxy_' + randomUUID(),
        redirectUris: [...new Set(input.redirect_uris)],
        name: input.client_name,
      },
    });
    return {
      client_id: row.id,
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      redirect_uris: row.redirectUris,
      client_name: row.name,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: MCP_SCOPES.join(' '),
    };
  }
  async authorize(value: unknown) {
    const parsed = authorizationQuery.safeParse(value);
    if (!parsed.success) throw new BadRequestException('invalid_request');
    const input = parsed.data;
    const client = await this.db.mcpClient.findUnique({
      where: { id: input.client_id },
    });
    if (
      !client ||
      !client.redirectUris.includes(input.redirect_uri) ||
      input.resource !== this.resource()
    )
      throw new BadRequestException('invalid_request');
    const row = await this.db.mcpGrant.create({
      data: {
        kind: 'REQUEST',
        tokenHash: mcpDigest(secret()),
        clientId: client.id,
        issuer: this.origin(),
        resource: this.resource(),
        scopes: input.scope.split(' '),
        payload: input,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return this.origin() + '/settings/mcp-consent?request=' + row.id;
  }
  private request(id: string, tx: Prisma.TransactionClient = this.db) {
    return tx.mcpGrant
      .findFirst({
        where: {
          id,
          kind: 'REQUEST',
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          issuer: this.origin(),
          resource: this.resource(),
        },
      })
      .then((row) => {
        if (!row) throw new NotFoundException();
        return row;
      });
  }
  private checkConsentPermission(
    actor: CurrentActor,
    requestedScopes: string[],
  ) {
    if (
      actor.mustChangePassword ||
      (requestedScopes.some(
        (scope) =>
          scope.startsWith('galaxy.jobs.') || scope === 'galaxy.events',
      ) &&
        !actor.permissions.includes('ai.invoke'))
    )
      throw new ForbiddenException();
  }
  async preview(actor: CurrentActor, id: string) {
    const row = await this.request(id);
    await this.db.$transaction(async (tx) => {
      const fresh = await this.access.freshActor(tx, actor);
      this.checkConsentPermission(fresh, row.scopes);
    });
    const client = await this.db.mcpClient.findUniqueOrThrow({
      where: { id: row.clientId },
    });
    return {
      id,
      clientName: client.name ?? 'ChatGPT Work',
      resource: row.resource,
      scopes: row.scopes,
      expiresAt: row.expiresAt,
    };
  }
  async consent(actor: CurrentActor, id: string, approved = true) {
    return this.db.$transaction(async (tx) => {
      const fresh = await this.access.freshActor(tx, actor);
      const row = await this.request(id, tx),
        query = authorizationQuery.parse(row.payload);
      this.checkConsentPermission(fresh, row.scopes);
      const used = await tx.mcpGrant.updateMany({
        where: {
          id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw new BadRequestException('invalid_request');
      if (!approved) {
        const redirect = new URL(query.redirect_uri);
        redirect.searchParams.set('error', 'access_denied');
        redirect.searchParams.set('state', query.state);
        redirect.searchParams.set('iss', this.origin());
        return { redirect: redirect.toString() };
      }
      const authorizationId = randomUUID();
      await tx.mcpGrant.create({
        data: {
          id: authorizationId,
          authorizationId,
          kind: 'AUTHORIZATION',
          tokenHash: mcpDigest(secret()),
          clientId: row.clientId,
          organizationId: fresh.organizationId,
          ownerId: fresh.userId,
          membershipId: fresh.organizationMembershipId,
          issuer: this.origin(),
          resource: this.resource(),
          scopes: row.scopes,
          payload: {
            actor: {
              ...fresh,
              sessionId: undefined,
            } as unknown as Prisma.InputJsonObject,
          },
        },
      });
      const response = new OAuth2Server.Response();
      const code = await this.server(tx).authorize(
        new OAuth2Server.Request({ method: 'GET', headers: {}, query }),
        response,
        { authenticateHandler: { handle: async () => ({ authorizationId }) } },
      );
      const redirect = new URL(query.redirect_uri);
      redirect.searchParams.set('code', code.authorizationCode);
      redirect.searchParams.set('state', query.state);
      redirect.searchParams.set('iss', this.origin());
      return { redirect: redirect.toString() };
    });
  }
  private async grant(
    token: string,
    kind: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return tx.mcpGrant.findFirst({
      where: {
        tokenHash: mcpDigest(token),
        kind,
        revokedAt: null,
        usedAt: null,
        issuer: this.origin(),
        resource: this.resource(),
        expiresAt: { gt: new Date() },
      },
    });
  }
  async principal(authorizationId: string): Promise<McpPrincipal> {
    const row = await this.db.mcpGrant.findFirst({
      where: {
        id: authorizationId,
        kind: 'AUTHORIZATION',
        revokedAt: null,
        issuer: this.origin(),
        resource: this.resource(),
      },
    });
    if (!row || !row.ownerId || !row.organizationId || !row.membershipId)
      throw new UnauthorizedException('invalid_token');
    const saved = z
      .object({
        actor: z
          .object({
            email: z.string(),
            displayName: z.string(),
            mustChangePassword: z.boolean(),
          })
          .passthrough(),
      })
      .parse(row.payload);
    const actor = {
      ...saved.actor,
      userId: row.ownerId,
      organizationId: row.organizationId,
      organizationMembershipId: row.membershipId,
      sessionId: undefined,
      mcpAuthorizationId: row.id,
    } as CurrentActor;
    const fresh = await this.db.$transaction((tx) =>
      this.access.freshActor(tx, actor),
    );
    const sources = fresh.permissionSources ?? [];
    fresh.administrationScope = sources.some((s) => s.scopeType === 'SYSTEM')
      ? 'SYSTEM'
      : sources.some((s) => s.scopeType === 'ORGANIZATION')
        ? 'ORGANIZATION'
        : sources.some((s) => s.scopeType === 'DEPARTMENT')
          ? 'MANAGED_DEPARTMENTS'
          : 'SELF';
    fresh.administrationTier = Math.max(
      0,
      ...sources.map((s) => s.administrationTier ?? 0),
    );
    fresh.managedDepartmentIds = [
      ...new Set(sources.flatMap((s) => s.managedDepartmentIds ?? [])),
    ];
    return {
      actor: fresh,
      authorizationId: row.id,
      clientId: row.clientId,
      scopes: row.scopes,
    };
  }
  async authenticate(
    header: string | undefined,
    required: string[] = [],
  ): Promise<McpPrincipal> {
    if (!header?.startsWith('Bearer '))
      throw new UnauthorizedException('invalid_token');
    const row = await this.grant(header.slice(7), 'ACCESS');
    if (!row?.authorizationId) throw new UnauthorizedException('invalid_token');
    const principal = await this.principal(row.authorizationId);
    if (
      required.some(
        (scope) =>
          !row.scopes.includes(scope) || !principal.scopes.includes(scope),
      )
    )
      throw new ForbiddenException('insufficient_scope');
    return { ...principal, scopes: row.scopes };
  }
  private server(tx: Prisma.TransactionClient = this.db) {
    const userFor = async (row: McpGrant) => {
      if (!row.authorizationId) return false;
      await this.principal(row.authorizationId);
      return { authorizationId: row.authorizationId };
    };
    const getClient = async (id: string, clientSecret: string) => {
      const client = !clientSecret
        ? await tx.mcpClient.findUnique({ where: { id } })
        : null;
      return client
        ? {
            id: client.id,
            redirectUris: client.redirectUris,
            grants: ['authorization_code', 'refresh_token'],
          }
        : false;
    };
    return new OAuth2Server({
      accessTokenLifetime: 3600,
      refreshTokenLifetime: 90 * 86400,
      authorizationCodeLifetime: 60,
      requireClientAuthentication: {
        authorization_code: false,
        refresh_token: false,
      },
      model: {
        getClient,
        generateAccessToken: async () => secret(),
        generateRefreshToken: async () => secret(),
        generateAuthorizationCode: async () => secret(),
        validateScope: async (
          _user: OAuth2Server.User,
          _client: OAuth2Server.Client,
          requested?: string[],
        ) =>
          requested?.length && requested.every((s) => MCP_SCOPES.includes(s))
            ? requested
            : false,
        getAccessToken: async () => false,
        saveAuthorizationCode: async (code, client, user) => {
          const authorizationId = oauthUser.parse(user).authorizationId;
          await tx.mcpGrant.create({
            data: {
              kind: 'CODE',
              tokenHash: mcpDigest(code.authorizationCode),
              clientId: client.id,
              authorizationId,
              issuer: this.origin(),
              resource: this.resource(),
              scopes: code.scope ?? [],
              payload: {
                redirectUri: code.redirectUri!,
                codeChallenge: code.codeChallenge!,
                codeChallengeMethod: code.codeChallengeMethod!,
              },
              expiresAt: code.expiresAt,
            },
          });
          return { ...code, client, user };
        },
        getAuthorizationCode: async (token) => {
          const row = await this.grant(token, 'CODE', tx);
          if (!row || !row.expiresAt) return false;
          const payload = z
            .object({
              redirectUri: z.string(),
              codeChallenge: z.string(),
              codeChallengeMethod: z.literal('S256'),
            })
            .parse(row.payload);
          const client = await getClient(row.clientId, ''),
            user = await userFor(row);
          return client && user
            ? {
                authorizationCode: token,
                expiresAt: row.expiresAt,
                scope: row.scopes,
                ...payload,
                client,
                user,
              }
            : false;
        },
        revokeAuthorizationCode: async (code) =>
          (
            await tx.mcpGrant.updateMany({
              where: {
                tokenHash: mcpDigest(code.authorizationCode),
                kind: 'CODE',
                usedAt: null,
                revokedAt: null,
              },
              data: { usedAt: new Date() },
            })
          ).count === 1,
        getRefreshToken: async (token: string) => {
          const row = await this.grant(token, 'REFRESH', tx);
          if (!row || !row.expiresAt) return false;
          const client = await getClient(row.clientId, ''),
            user = await userFor(row);
          return client && user
            ? {
                refreshToken: token,
                refreshTokenExpiresAt: row.expiresAt,
                scope: row.scopes,
                client,
                user,
              }
            : false;
        },
        revokeToken: async (token: OAuth2Server.RefreshToken) =>
          (
            await tx.mcpGrant.updateMany({
              where: {
                tokenHash: mcpDigest(token.refreshToken),
                kind: 'REFRESH',
                usedAt: null,
                revokedAt: null,
              },
              data: { usedAt: new Date() },
            })
          ).count === 1,
        saveToken: async (token, client, user) => {
          const principal = await this.principal(
            oauthUser.parse(user).authorizationId,
          );
          const data = {
            clientId: client.id,
            authorizationId: principal.authorizationId,
            organizationId: principal.actor.organizationId,
            ownerId: principal.actor.userId,
            membershipId: principal.actor.organizationMembershipId,
            issuer: this.origin(),
            resource: this.resource(),
            scopes: token.scope ?? [],
          };
          await this.db.$transaction(async (t) => {
            if (
              !(await t.mcpGrant.findFirst({
                where: {
                  id: principal.authorizationId,
                  kind: 'AUTHORIZATION',
                  revokedAt: null,
                },
              }))
            )
              throw new UnauthorizedException('invalid_token');
            await t.mcpGrant.create({
              data: {
                ...data,
                kind: 'ACCESS',
                tokenHash: mcpDigest(token.accessToken),
                expiresAt: token.accessTokenExpiresAt,
              },
            });
            if (token.refreshToken)
              await t.mcpGrant.create({
                data: {
                  ...data,
                  kind: 'REFRESH',
                  tokenHash: mcpDigest(token.refreshToken),
                  expiresAt: token.refreshTokenExpiresAt,
                },
              });
          });
          return { ...token, client, user };
        },
      },
    });
  }
  async exchange(
    value: unknown,
    headers: Record<string, string | string[] | undefined>,
  ) {
    if (
      value &&
      typeof value === 'object' &&
      'grant_type' in value &&
      !['authorization_code', 'refresh_token'].includes(
        String(value.grant_type),
      )
    )
      throw new BadRequestException('unsupported_grant_type');
    const input = z
      .object({
        grant_type: z.enum(['authorization_code', 'refresh_token']),
        client_id: z.string().min(1),
        resource: z.string(),
        code: z.string().optional(),
        code_verifier: z.string().optional(),
        redirect_uri: z.string().optional(),
        refresh_token: z.string().optional(),
        scope: z.string().optional(),
      })
      .strict()
      .safeParse(value);
    if (!input.success) throw new BadRequestException('invalid_request');
    if (input.data.resource !== this.resource())
      throw new BadRequestException('invalid_target');
    try {
      const originalHeaders = Object.fromEntries(
        Object.entries(headers).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
      const token = await this.server().token(
        new OAuth2Server.Request({
          method: 'POST',
          headers: originalHeaders,
          query: {},
          body: input.data,
        }),
        new OAuth2Server.Response(),
      );
      return {
        access_token: token.accessToken,
        token_type: 'Bearer',
        expires_in: Math.max(
          0,
          Math.floor(
            (token.accessTokenExpiresAt!.getTime() - Date.now()) / 1000,
          ),
        ),
        refresh_token: token.refreshToken,
        scope: token.scope?.join(' '),
      };
    } catch (error) {
      const code = error instanceof Error ? error.name : '';
      throw new BadRequestException(
        [
          'invalid_client',
          'invalid_request',
          'invalid_scope',
          'invalid_grant',
          'unsupported_grant_type',
        ].includes(code)
          ? code
          : 'invalid_grant',
      );
    }
  }
  async revoke(value: unknown) {
    const parsed = z
      .object({
        token: z.string(),
        client_id: z.string(),
        token_type_hint: z.string().optional(),
      })
      .strict()
      .safeParse(value);
    if (!parsed.success) throw new BadRequestException('invalid_request');
    const input = parsed.data;
    const row = await this.db.mcpGrant.findFirst({
      where: {
        tokenHash: mcpDigest(input.token),
        clientId: input.client_id,
        kind: { in: ['ACCESS', 'REFRESH'] },
        issuer: this.origin(),
        resource: this.resource(),
      },
    });
    const authorizationId = row?.authorizationId;
    if (authorizationId)
      await this.db.$transaction(async (tx) => {
        await tx.mcpGrant.updateMany({
          where: { authorizationId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.mcpSubscription.updateMany({
          where: { authorizationId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });
    return {};
  }
}
