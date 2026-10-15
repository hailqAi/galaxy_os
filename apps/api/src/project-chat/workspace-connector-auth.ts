import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { CurrentActor } from '../access-control/current-actor';
import { WorkspaceAgentService } from '../settings/workspace-agent.service';
import {
  ConnectorPrincipal,
  digest,
  restoreActor,
} from './project-ai-workspace.service';
const scope = 'galaxy.workspace.job';
export const oauthRequest = z
  .object({
    client_id: z.string().min(1).max(2048),
    redirect_uri: z.string().url().max(2048),
    resource: z.string().url().max(2048),
    response_type: z.literal('code'),
    scope: z.literal(scope),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal('S256'),
    state: z.string().min(1).max(2048),
  })
  .strict();
export const pkceMatches = (verifier: string, challenge: string) => {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const hash = createHash('sha256').update(verifier).digest('base64url');
  return (
    hash.length === challenge.length &&
    timingSafeEqual(Buffer.from(hash), Buffer.from(challenge))
  );
};
@Injectable()
export class WorkspaceConnectorAuth {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(WorkspaceAgentService)
    private readonly workspace: WorkspaceAgentService,
  ) {}
  origin() {
    const origin = process.env.APP_PUBLIC_ORIGIN;
    if (
      !origin ||
      new URL(origin).origin !== origin ||
      (new URL(origin).protocol !== 'https:' &&
        process.env.GALAXY_TEST_ISOLATION !== 'confirmed')
    )
      throw new ServiceUnavailableException('WORKSPACE_HTTPS_REQUIRED');
    return origin;
  }
  private enabled() {
    throw new ServiceUnavailableException('WORKSPACE_DEFERRED_BY_USER');
  }
  resource(org: string, principal: string) {
    return (
      this.origin() + '/api/v1/workspace-agent-mcp/' + org + '/' + principal
    );
  }
  metadata() {
    this.enabled();
    const origin = this.origin();
    return {
      issuer: origin,
      authorization_endpoint: origin + '/api/v1/workspace-agent-auth/authorize',
      token_endpoint: origin + '/api/v1/workspace-agent-auth/token',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [scope],
      authorization_response_iss_parameter_supported: true,
    };
  }
  protectedResource(org: string, principal: string) {
    this.enabled();
    return {
      resource: this.resource(org, principal),
      authorization_servers: [this.origin()],
      scopes_supported: [scope],
    };
  }
  private client(clientId: string, redirect: string) {
    const configured = process.env.GALAXY_WORKSPACE_OAUTH_CLIENT_ID,
      uri = process.env.GALAXY_WORKSPACE_OAUTH_REDIRECT_URI;
    if (!configured || !uri)
      throw new ServiceUnavailableException(
        'WORKSPACE_OAUTH_CLIENT_NOT_CONFIGURED',
      );
    const url = new URL(uri);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'chatgpt.com' ||
      url.username ||
      url.password ||
      url.hash ||
      clientId !== configured ||
      redirect !== uri
    )
      throw new BadRequestException('WORKSPACE_OAUTH_CLIENT_INVALID');
  }
  async authorize(value: unknown) {
    this.enabled();
    const parsed = oauthRequest.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('WORKSPACE_OAUTH_REQUEST_INVALID');
    const q = parsed.data;
    this.client(q.client_id, q.redirect_uri);
    const prefix = this.origin() + '/api/v1/workspace-agent-mcp/';
    if (!q.resource.startsWith(prefix))
      throw new BadRequestException('WORKSPACE_OAUTH_RESOURCE_INVALID');
    const ids = z
      .tuple([z.string().uuid(), z.string().uuid()])
      .safeParse(q.resource.slice(prefix.length).split('/'));
    if (!ids.success)
      throw new BadRequestException('WORKSPACE_OAUTH_RESOURCE_INVALID');
    const [organizationId, principalId] = ids.data;
    return this.db.$transaction(async (tx) => {
      if (
        !(await this.workspace.configuredPrincipal(
          tx,
          organizationId,
          principalId,
        ))
      )
        throw new BadRequestException('WORKSPACE_OAUTH_RESOURCE_INVALID');
      if (
        (await tx.workspaceConnectorGrant.count({
          where: {
            kind: 'REQUEST',
            principalId,
            expiresAt: { gt: new Date() },
          },
        })) >= 20
      )
        throw new ConflictException('WORKSPACE_CONSENT_REQUEST_LIMIT');
      const id = randomUUID(),
        empty = '00000000-0000-0000-0000-000000000000';
      await tx.workspaceConnectorGrant.create({
        data: {
          id,
          kind: 'REQUEST',
          tokenHash: digest(randomBytes(32).toString('base64url')),
          organizationId,
          principalId,
          bindingRevision: empty,
          projectId: empty,
          ownerId: empty,
          clientId: q.client_id,
          redirectUri: q.redirect_uri,
          resource: q.resource,
          challenge: q.code_challenge,
          clientState: q.state,
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      return this.origin() + '/settings/workspace-consent?request=' + id;
    });
  }
  private async request(actor: CurrentActor, id: string) {
    const request = await this.db.workspaceConnectorGrant.findFirst({
      where: {
        id,
        kind: 'REQUEST',
        organizationId: actor.organizationId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!request)
      throw new ForbiddenException('WORKSPACE_CONSENT_REQUEST_INVALID');
    this.client(request.clientId, request.redirectUri);
    return request;
  }
  async preview(actor: CurrentActor, id: string) {
    this.enabled();
    const row = await this.request(actor, id);
    return this.db.$transaction(async (tx) => {
      const { binding, record } = await this.workspace.connectorBinding(
        tx,
        actor,
        row.principalId,
      );
      return {
        requestId: id,
        projectId: binding.projectId,
        principalId: binding.id,
        requestedModel: binding.requestedModel,
        effort: binding.effort,
        bindingRevision: record.revision,
        scope,
        visibility: 'PRIVATE',
        expiresAt: row.expiresAt,
      };
    });
  }
  async consent(actor: CurrentActor, id: string) {
    this.enabled();
    const row = await this.request(actor, id);
    return this.db.$transaction(async (tx) => {
      const { binding, record } = await this.workspace.connectorBinding(
        tx,
        actor,
        row.principalId,
      );
      const used = await tx.workspaceConnectorGrant.updateMany({
        where: {
          id,
          kind: 'REQUEST',
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1)
        throw new ConflictException('WORKSPACE_CONSENT_REQUEST_USED');
      const code = randomBytes(32).toString('base64url');
      await tx.workspaceConnectorGrant.create({
        data: {
          kind: 'CODE',
          tokenHash: digest(code),
          principalId: binding.id,
          bindingRevision: record.revision,
          organizationId: actor.organizationId,
          projectId: binding.projectId,
          ownerId: actor.userId,
          sessionId: actor.sessionId,
          membershipId: actor.organizationMembershipId,
          clientId: row.clientId,
          redirectUri: row.redirectUri,
          resource: row.resource,
          challenge: row.challenge,
          clientState: row.clientState,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await this.workspace.connectorBinding(tx, actor, row.principalId);
      const redirect = new URL(row.redirectUri);
      redirect.searchParams.set('code', code);
      redirect.searchParams.set('state', row.clientState);
      redirect.searchParams.set('iss', this.origin());
      return { redirect: redirect.toString() };
    });
  }
  async exchange(value: unknown) {
    this.enabled();
    const parsed = z
      .object({
        grant_type: z.literal('authorization_code'),
        code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        client_id: z.string().min(1).max(2048),
        redirect_uri: z.string().url(),
        resource: z.string().url(),
        code_verifier: z.string().max(128),
      })
      .strict()
      .safeParse(value);
    if (!parsed.success) throw new BadRequestException('invalid_grant');
    const q = parsed.data;
    this.client(q.client_id, q.redirect_uri);
    return this.db.$transaction(async (tx) => {
      const row = await tx.workspaceConnectorGrant.findUnique({
        where: { tokenHash: digest(q.code) },
      });
      if (
        !row ||
        row.kind !== 'CODE' ||
        row.usedAt ||
        row.revokedAt ||
        row.expiresAt <= new Date() ||
        row.clientId !== q.client_id ||
        row.redirectUri !== q.redirect_uri ||
        row.resource !== q.resource ||
        !pkceMatches(q.code_verifier, row.challenge)
      )
        throw new BadRequestException('invalid_grant');
      const actor = restoreActor({
        userId: row.ownerId,
        organizationId: row.organizationId,
        organizationMembershipId: row.membershipId,
        sessionId: row.sessionId,
      });
      const { record, binding } = await this.workspace.connectorBinding(
        tx,
        actor,
        row.principalId,
      );
      if (
        record.revision !== row.bindingRevision ||
        binding.projectId !== row.projectId
      )
        throw new BadRequestException('invalid_grant');
      const used = await tx.workspaceConnectorGrant.updateMany({
        where: {
          id: row.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw new BadRequestException('invalid_grant');
      const token = randomBytes(32).toString('base64url');
      await tx.workspaceConnectorGrant.create({
        data: {
          kind: 'ACCESS',
          tokenHash: digest(token),
          principalId: row.principalId,
          bindingRevision: row.bindingRevision,
          organizationId: row.organizationId,
          projectId: row.projectId,
          ownerId: row.ownerId,
          sessionId: row.sessionId,
          membershipId: row.membershipId,
          clientId: row.clientId,
          redirectUri: row.redirectUri,
          resource: row.resource,
          challenge: row.challenge,
          clientState: '',
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope,
      };
    });
  }
  async authenticate(
    authorization: string | undefined,
    org: string,
    principalId: string,
  ): Promise<ConnectorPrincipal> {
    this.enabled();
    if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))
      throw new UnauthorizedException('WORKSPACE_CONNECTOR_AUTH_REQUIRED');
    const row = await this.db.workspaceConnectorGrant.findUnique({
      where: { tokenHash: digest(authorization.slice(7)) },
    });
    if (
      !row ||
      row.kind !== 'ACCESS' ||
      row.revokedAt ||
      row.expiresAt <= new Date() ||
      row.organizationId !== org ||
      row.principalId !== principalId ||
      row.resource !== this.resource(org, principalId)
    )
      throw new UnauthorizedException('WORKSPACE_CONNECTOR_AUTH_REQUIRED');
    const actor = restoreActor({
      userId: row.ownerId,
      organizationId: org,
      organizationMembershipId: row.membershipId,
      sessionId: row.sessionId,
    });
    await this.db.$transaction(async (tx) => {
      const { record, binding } = await this.workspace.connectorBinding(
        tx,
        actor,
        principalId,
      );
      if (
        record.revision !== row.bindingRevision ||
        binding.projectId !== row.projectId
      )
        throw new UnauthorizedException('WORKSPACE_CONNECTOR_REVOKED');
    });
    return {
      actor,
      principalId,
      bindingRevision: row.bindingRevision,
      connectorGrantId: row.id,
    };
  }
  async revoke(actor: CurrentActor, principalId: string) {
    return this.db.$transaction(async (tx) => {
      await this.workspace.connectorBinding(tx, actor, principalId);
      await tx.workspaceConnectorGrant.updateMany({
        where: {
          principalId,
          organizationId: actor.organizationId,
          ownerId: actor.userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return { revoked: true };
    });
  }
}
