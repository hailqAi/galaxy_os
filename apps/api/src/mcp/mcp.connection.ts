import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { PrismaService } from '../prisma.service';
import { McpNetwork } from './mcp.network';
import { McpOAuth } from './mcp.oauth';

const probeKey = 'mcp.public-check.v1';
@Injectable()
export class McpConnectionService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
    @Inject(McpOAuth) private readonly oauth: McpOAuth,
    @Inject(McpNetwork) private readonly network: McpNetwork,
  ) {}
  async status(actor: CurrentActor) {
    return this.db.$transaction(async (tx) => {
      const fresh = await this.access.freshActor(tx, actor);
      const identity = {
        organizationId: fresh.organizationId,
        ownerId: fresh.userId,
        membershipId: fresh.organizationMembershipId,
      };
      const grants = await tx.mcpGrant.findMany({
        where: {
          ...identity,
          kind: 'AUTHORIZATION',
          revokedAt: null,
          issuer: this.oauth.origin(),
          resource: this.oauth.resource(),
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });
      const subscriptions = await tx.mcpSubscription.findMany({
        where: {
          ...identity,
          authorizationId: { in: grants.map((g) => g.id) },
          revokedAt: null,
        },
        select: {
          id: true,
          name: true,
          arguments: true,
          verifiedUntil: true,
          refreshBefore: true,
          deliveries: {
            orderBy: { nextAttemptAt: 'desc' },
            take: 1,
            select: {
              state: true,
              deliveredAt: true,
              attempts: true,
              errorCode: true,
            },
          },
        },
      });
      const probe = await tx.organizationSetting.findUnique({
        where: {
          organizationId_key: {
            organizationId: fresh.organizationId,
            key: probeKey,
          },
        },
      });
      const metadata = this.oauth.metadata();
      return {
        configuration: {
          serverUrl: this.oauth.resource(),
          authentication: 'OAuth',
          registrationMethod: 'DCR',
          clientId: null,
          clientSecret: null,
          tokenEndpointAuthMethod:
            metadata.token_endpoint_auth_methods_supported[0],
          defaultScopes: null,
          baseScopes: metadata.scopes_supported.join(' '),
          authUrl: metadata.authorization_endpoint,
          tokenUrl: metadata.token_endpoint,
          registrationUrl: metadata.registration_endpoint,
          authorizationServerBase: metadata.issuer,
          resource: this.oauth.resource(),
          oidcEnabled: false,
          oidcConfigurationUrl: null,
          userinfoEndpoint: null,
          oidcScopes: null,
        },
        account: {
          oauthAuthorized: grants.length > 0,
          eventsSubscribed: subscriptions.some(
            (s) => !s.refreshBefore || s.refreshBefore > new Date(),
          ),
          canConnect:
            fresh.permissions.includes('ai.invoke') &&
            !fresh.mustChangePassword,
        },
        subscriptions,
        publicCheck: probe?.value ?? null,
      };
    });
  }
  async check(actor: CurrentActor) {
    const fresh = await this.db.$transaction((tx) =>
      this.access.freshActor(tx, actor),
    );
    const origin = this.oauth.origin();
    const checks: { path: string; status: number | null; passed: boolean }[] =
      [];
    const expected: {
      path: string;
      method: 'GET' | 'POST';
      status: number;
      body?: string;
      valid(
        value: Record<string, unknown>,
        headers: Record<string, unknown>,
      ): boolean;
    }[] = [
      {
        path: '/.well-known/oauth-protected-resource/mcp',
        method: 'GET',
        status: 200,
        valid: (v) =>
          v.resource === this.oauth.resource() &&
          Array.isArray(v.authorization_servers) &&
          v.authorization_servers.includes(origin),
      },
      {
        path: '/.well-known/oauth-authorization-server',
        method: 'GET',
        status: 200,
        valid: (v) =>
          v.issuer === origin &&
          v.token_endpoint === origin + '/mcp/oauth/token' &&
          v.registration_endpoint === origin + '/mcp/oauth/register',
      },
      {
        path: '/mcp',
        method: 'POST',
        body: '{}',
        status: 401,
        valid: (_v, h) =>
          typeof h['www-authenticate'] === 'string' &&
          h['www-authenticate'].includes('oauth-protected-resource/mcp'),
      },
      {
        path: '/mcp/oauth/register',
        method: 'POST',
        body: '{}',
        status: 400,
        valid: (v) => v.error === 'invalid_client_metadata',
      },
      {
        path: '/mcp/oauth/authorize',
        method: 'GET',
        status: 400,
        valid: (v) => v.error === 'invalid_request' && v.iss === origin,
      },
      {
        path: '/mcp/oauth/token',
        method: 'POST',
        body: '{"grant_type":"unsupported"}',
        status: 400,
        valid: (v) => v.error === 'unsupported_grant_type',
      },
    ];
    for (const item of expected) {
      let status: number | null = null;
      const abort = new AbortController(),
        deadline = setTimeout(() => abort.abort(), 10000);
      let response: Awaited<ReturnType<McpNetwork['request']>> | undefined;
      try {
        response = await this.network.request(
          origin + item.path,
          item.method,
          { 'content-type': 'application/json', accept: 'application/json' },
          item.body,
          abort.signal,
          [item.status],
        );
        status = response.statusCode ?? null;
        abort.signal.addEventListener(
          'abort',
          () => response?.destroy(new Error('MCP_PROBE_TIMEOUT')),
          { once: true },
        );
        let bytes = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of response) {
          bytes += (chunk as Buffer).length;
          if (bytes > 65536) throw new Error('MCP_PROBE_TOO_LARGE');
          chunks.push(chunk as Buffer);
        }
        const value = JSON.parse(Buffer.concat(chunks).toString()) as Record<
          string,
          unknown
        >;
        checks.push({
          path: item.path,
          status,
          passed:
            status === item.status &&
            String(response.headers['content-type']).includes(
              'application/json',
            ) &&
            item.valid(value, response.headers),
        });
      } catch {
        checks.push({ path: item.path, status, passed: false });
      } finally {
        clearTimeout(deadline);
        response?.destroy();
      }
    }
    const value = {
      origin,
      at: new Date().toISOString(),
      passed: checks.every((c) => c.passed),
      checks,
    };
    await this.db.$transaction(async (tx) => {
      await this.access.freshActor(tx, fresh);
      await tx.organizationSetting.upsert({
        where: {
          organizationId_key: {
            organizationId: fresh.organizationId,
            key: probeKey,
          },
        },
        create: {
          organizationId: fresh.organizationId,
          key: probeKey,
          value: value as Prisma.InputJsonValue,
        },
        update: { value: value as Prisma.InputJsonValue },
      });
    });
    return value;
  }
  async revoke(actor: CurrentActor) {
    await this.db.$transaction(async (tx) => {
      const fresh = await this.access.freshActor(tx, actor);
      const identity = {
        organizationId: fresh.organizationId,
        ownerId: fresh.userId,
        membershipId: fresh.organizationMembershipId,
      };
      const grants = await tx.mcpGrant.findMany({
        where: { ...identity, kind: 'AUTHORIZATION', revokedAt: null },
        select: { id: true },
      });
      const ids = grants.map((g) => g.id),
        now = new Date();
      await tx.mcpGrant.updateMany({
        where: {
          ...identity,
          OR: [{ id: { in: ids } }, { authorizationId: { in: ids } }],
        },
        data: { revokedAt: now },
      });
      await tx.mcpSubscription.updateMany({
        where: { ...identity, authorizationId: { in: ids } },
        data: { revokedAt: now },
      });
    });
    return this.status(actor);
  }
}
