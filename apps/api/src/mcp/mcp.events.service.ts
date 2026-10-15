import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { deploymentDraining } from '../deployment-admission';
import { ProtocolError } from '@modelcontextprotocol/server';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { ProjectAiService } from '../project-chat/project-ai.service';
import { McpJobsService } from './mcp.jobs.service';
import {
  McpNetwork,
  McpRemoteResponseError,
  decryptMcpSecret,
  encryptMcpSecret,
  signedWebhook,
} from './mcp.network';
import { McpOAuth, McpPrincipal, mcpDigest } from './mcp.oauth';
import {
  MCP_EVENT,
  eventArguments,
  jobMetadata,
  subscriptionIdentity,
  subscriptionInput,
} from './mcp.schemas';

class McpSupersededEventError extends Error {}

@Injectable()
export class McpEventsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private stopped = false;
  private readonly logger = new Logger(McpEventsService.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(McpOAuth) private readonly oauth: McpOAuth,
    @Inject(McpJobsService) private readonly jobs: McpJobsService,
    @Inject(ProjectAiService) private readonly ai: ProjectAiService,
    @Inject(McpNetwork) private readonly network: McpNetwork,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => this.logger.warn('MCP_EVENT_WORKER_FAILED'));
    }, 2000);
    this.timer.unref();
  }
  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }
  private async lockSubscription(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mcp-subscription:${id}`}, 0))::text`;
  }
  list() {
    return {
      events: [
        {
          name: MCP_EVENT,
          delivery: ['webhook'],
          title: 'Galaxy AI job created',
          description:
            'A job requested by you in an authorized Galaxy Project is ready. Read its original request and files through the job tools; return the answer and real artifacts to that job.',
          inputSchema: z.toJSONSchema(eventArguments),
          payloadSchema: {
            type: 'object',
            properties: {
              job_id: { type: 'string', format: 'uuid' },
              attempt: { type: 'integer', minimum: 1 },
              project_id: { type: 'string', format: 'uuid' },
              thread_id: { type: 'string', format: 'uuid' },
              source_message_id: { type: 'string', format: 'uuid' },
            },
            required: [
              'job_id',
              'attempt',
              'project_id',
              'thread_id',
              'source_message_id',
            ],
            additionalProperties: false,
          },
        },
      ],
    };
  }
  private identity(
    principal: McpPrincipal,
    input: z.infer<typeof subscriptionIdentity>,
  ) {
    return (
      'sub_' +
      mcpDigest(
        JSON.stringify([
          principal.actor.organizationId,
          principal.actor.userId,
          principal.actor.organizationMembershipId,
          input.name,
          input.arguments.project_id ?? null,
          input.delivery.url,
        ]),
      )
    );
  }
  async subscribe(principal: McpPrincipal, value: unknown) {
    const requestedAt = new Date();
    const parsed = subscriptionInput.safeParse(value);
    if (!parsed.success)
      throw new ProtocolError(-32602, 'Invalid event subscription parameters');
    const input = parsed.data;
    await this.oauth.principal(principal.authorizationId);
    if (input.arguments.project_id)
      await this.ai.workspaceTransaction(
        principal.actor,
        input.arguments.project_id,
        async () => true,
      );
    const id = this.identity(principal, input),
      existing = await this.db.mcpSubscription.findUnique({ where: { id } });
    const secretUnchanged =
      existing &&
      decryptMcpSecret(existing.secretCipher) === input.delivery.secret;
    const needsVerification = Boolean(
      !existing ||
        existing.revokedAt ||
        existing.verifiedUntil <= new Date() ||
        !secretUnchanged,
    );
    if (needsVerification) {
      const challenge = randomBytes(32).toString('base64url');
      try {
        const response = await this.network.post(
          input.delivery.url,
          signedWebhook(
            id,
            input.delivery.secret,
            'verification_' + randomUUID(),
            { type: 'verification', challenge },
          ),
        );
        const echo = z
          .object({ challenge: z.string() })
          .parse(JSON.parse(response.body)).challenge;
        if (
          echo.length !== challenge.length ||
          !timingSafeEqual(Buffer.from(echo), Buffer.from(challenge))
        )
          throw new Error('challenge_failed');
      } catch (error) {
        throw new ProtocolError(-32015, 'Callback verification failed', {
          reason:
            error instanceof Error && error.message === 'MCP_NETWORK_TIMEOUT'
              ? 'timeout'
              : 'challenge_failed',
        });
      }
    }
    await this.oauth.principal(principal.authorizationId);
    const ttl =
      input.ttlMs === null
        ? null
        : Math.min(input.ttlMs ?? 86400000, 30 * 86400000);
    const refreshBefore = ttl === null ? null : new Date(Date.now() + ttl);
    await this.db.$transaction(async (tx) => {
      await this.lockSubscription(tx, id);
      const latest = await tx.mcpSubscription.findUnique({ where: { id } });
      if (latest?.revokedAt && latest.revokedAt > requestedAt)
        throw new ProtocolError(-32016, 'Subscription was revoked');
      const rotated =
        latest &&
        decryptMcpSecret(latest.secretCipher) !== input.delivery.secret;
      const data = {
        organizationId: principal.actor.organizationId,
        ownerId: principal.actor.userId,
        membershipId: principal.actor.organizationMembershipId,
        authorizationId: principal.authorizationId,
        name: input.name,
        arguments: input.arguments as Prisma.InputJsonValue,
        callbackUrl: input.delivery.url,
        secretCipher: encryptMcpSecret(input.delivery.secret),
        previousSecretCipher: rotated
          ? latest.secretCipher
          : (latest?.previousSecretCipher ?? null),
        rotationUntil: rotated
          ? new Date(Date.now() + 300000)
          : (latest?.rotationUntil ?? null),
        refreshBefore,
        verifiedUntil: needsVerification
          ? new Date(Date.now() + 300000)
          : existing!.verifiedUntil,
        revokedAt: null,
      };
      await tx.mcpSubscription.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    });
    await this.reconcile(id);
    return {
      id,
      refreshBefore: refreshBefore?.toISOString() ?? null,
      cursor: null,
      truncated: false,
    };
  }
  async unsubscribe(principal: McpPrincipal, value: unknown) {
    const input = subscriptionIdentity.parse(value),
      id = this.identity(principal, input),
      revokedAt = new Date();
    await this.db.$transaction(async (tx) => {
      await this.lockSubscription(tx, id);
      await tx.mcpSubscription.upsert({
        where: { id },
        create: {
          id,
          organizationId: principal.actor.organizationId,
          ownerId: principal.actor.userId,
          membershipId: principal.actor.organizationMembershipId,
          authorizationId: principal.authorizationId,
          name: input.name,
          arguments: input.arguments as Prisma.InputJsonValue,
          callbackUrl: input.delivery.url,
          secretCipher: encryptMcpSecret(
            'whsec_' + randomBytes(32).toString('base64'),
          ),
          verifiedUntil: new Date(0),
          revokedAt,
        },
        update: { revokedAt },
      });
    });
    return {};
  }
  private async reconcile(subscriptionId: string) {
    const subscription = await this.db.mcpSubscription.findFirst({
      where: {
        id: subscriptionId,
        revokedAt: null,
        OR: [{ refreshBefore: null }, { refreshBefore: { gt: new Date() } }],
      },
    });
    if (!subscription) return;
    const principal = await this.oauth.principal(subscription.authorizationId);
    if (
      principal.actor.organizationId !== subscription.organizationId ||
      principal.actor.userId !== subscription.ownerId ||
      principal.actor.organizationMembershipId !== subscription.membershipId ||
      !principal.scopes.includes('galaxy.events')
    )
      throw new UnauthorizedException();
    const filters = eventArguments.parse(subscription.arguments);
    const events = await this.db.mcpOutbox.findMany({
      where: {
        answer: {
          organizationId: subscription.organizationId,
          ownerId: subscription.ownerId,
          status: 'RUNNING',
          ...(filters.project_id && { projectId: filters.project_id }),
          usage: { path: ['mcp', 'version'], equals: 1 },
        },
        deliveries: { none: { subscriptionId } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const event of events) {
      try {
        await this.jobs.checked(
          principal,
          event.answerId,
          async ({ tx, metadata }) => {
            const stale = event.generation !== metadata.notificationGeneration;
            return tx.mcpDelivery.upsert({
              where: {
                eventId_subscriptionId: { eventId: event.id, subscriptionId },
              },
              create: {
                eventId: event.id,
                subscriptionId,
                ...(stale && {
                  state: 'CANCELLED',
                  errorCode: 'MCP_EVENT_SUPERSEDED',
                }),
              },
              update: stale
                ? {
                    state: 'CANCELLED',
                    leaseToken: null,
                    leaseUntil: null,
                    errorCode: 'MCP_EVENT_SUPERSEDED',
                  }
                : {},
            });
          },
        );
      } catch (error) {
        if (
          !(
            error instanceof UnauthorizedException ||
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
          )
        )
          throw error;
        await this.db.mcpDelivery.upsert({
          where: {
            eventId_subscriptionId: { eventId: event.id, subscriptionId },
          },
          create: {
            eventId: event.id,
            subscriptionId,
            state: 'CANCELLED',
            errorCode: 'MCP_EVENT_ACCESS_REVOKED',
          },
          update: {},
        });
      }
    }
  }
  async tick() {
    if (this.busy || this.stopped || deploymentDraining()) return;
    this.busy = true;
    try {
      const subscriptions = await this.db.mcpSubscription.findMany({
        where: {
          revokedAt: null,
          OR: [{ refreshBefore: null }, { refreshBefore: { gt: new Date() } }],
        },
        select: { id: true },
      });
      for (const subscription of subscriptions) {
        try {
          await this.reconcile(subscription.id);
        } catch (error) {
          if (
            error instanceof UnauthorizedException ||
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
          )
            await this.db.mcpSubscription.updateMany({
              where: { id: subscription.id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          else this.logger.warn('MCP_SUBSCRIPTION_RECHECK_FAILED');
        }
      }
      const now = new Date();
      const candidates = await this.db.mcpDelivery.findMany({
        where: {
          state: { in: ['PENDING', 'DELIVERING'] },
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 10,
        include: { event: true, subscription: true },
      });
      for (const candidate of candidates) {
        if (deploymentDraining()) break;
        const leaseToken = randomUUID();
        const claimed = await this.db.mcpDelivery.updateMany({
          where: {
            id: candidate.id,
            state: { in: ['PENDING', 'DELIVERING'] },
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
          },
          data: {
            state: 'DELIVERING',
            leaseToken,
            leaseUntil: new Date(Date.now() + 120000),
            attempts: { increment: 1 },
          },
        });
        if (!claimed.count) continue;
        let principal: McpPrincipal | undefined,
          answerProjectId: string | undefined;
        try {
          const sub = await this.db.mcpSubscription.findFirst({
            where: {
              id: candidate.subscriptionId,
              revokedAt: null,
              OR: [
                { refreshBefore: null },
                { refreshBefore: { gt: new Date() } },
              ],
            },
          });
          if (!sub) throw new UnauthorizedException();
          principal = await this.oauth.principal(sub.authorizationId);
          if (!principal.scopes.includes('galaxy.events'))
            throw new UnauthorizedException();
          const payload = await this.jobs.checked(
            principal,
            candidate.event.answerId,
            async ({ answer, metadata }) => {
              answerProjectId = answer.projectId;
              if (
                candidate.event.generation !== metadata.notificationGeneration
              )
                throw new McpSupersededEventError();
              if (
                ['COMPLETED', 'CANCELLED'].includes(metadata.state) ||
                (eventArguments.parse(sub.arguments).project_id &&
                  eventArguments.parse(sub.arguments).project_id !==
                    answer.projectId)
              )
                throw new NotFoundException();
              return {
                eventId: candidate.event.id,
                name: MCP_EVENT,
                timestamp: candidate.event.createdAt.toISOString(),
                data: {
                  job_id: answer.id,
                  attempt: candidate.event.generation + 1,
                  project_id: answer.projectId,
                  thread_id: answer.conversationId,
                  source_message_id: answer.id,
                },
                cursor: null,
              };
            },
          );
          const previous =
            sub.previousSecretCipher &&
            sub.rotationUntil &&
            sub.rotationUntil > new Date()
              ? decryptMcpSecret(sub.previousSecretCipher)
              : undefined;
          await this.network.post(
            sub.callbackUrl,
            signedWebhook(
              sub.id,
              decryptMcpSecret(sub.secretCipher),
              payload.eventId,
              payload,
              previous,
            ),
          );
          await this.jobs.checked(
            principal,
            candidate.event.answerId,
            async ({ tx, answer, metadata }) => {
              const updated = await tx.mcpDelivery.updateMany({
                where: { id: candidate.id, leaseToken, state: 'DELIVERING' },
                data: {
                  state: 'DELIVERED',
                  leaseToken: null,
                  leaseUntil: null,
                  deliveredAt: new Date(),
                  errorCode: null,
                },
              });
              if (
                updated.count &&
                ['WAITING_NOTIFICATION', 'WAITING_SUBSCRIPTION'].includes(
                  metadata.state,
                )
              )
                await this.jobs.save(tx, answer, {
                  ...metadata,
                  state: 'NOTIFIED',
                  progress:
                    'Đã gửi thông báo công việc; đang chờ mốc xử lý từ ChatGPT.',
                });
            },
            undefined,
            candidate.event.generation + 1,
          );
        } catch (error) {
          const denied =
            error instanceof UnauthorizedException ||
            error instanceof ForbiddenException ||
            error instanceof NotFoundException;
          const terminalResponse =
            error instanceof McpRemoteResponseError &&
            error.status >= 400 &&
            error.status < 500 &&
            ![408, 429].includes(error.status);
          const superseded = error instanceof McpSupersededEventError;
          const savedDelivery = await this.db.mcpDelivery.updateMany({
            where: { id: candidate.id, leaseToken, state: 'DELIVERING' },
            data: {
              state:
                denied || superseded
                  ? 'CANCELLED'
                  : terminalResponse
                    ? 'FAILED'
                    : 'PENDING',
              leaseToken: null,
              leaseUntil: null,
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(
                    3600000,
                    1000 * 2 ** Math.min(candidate.attempts, 12),
                  ),
              ),
              errorCode: superseded
                ? 'MCP_EVENT_SUPERSEDED'
                : denied
                  ? 'ACCESS_REVOKED'
                  : terminalResponse
                    ? 'MCP_CALLBACK_REJECTED'
                    : 'MCP_DELIVERY_RETRY',
            },
          });
          if (terminalResponse && savedDelivery.count) {
            const pending = await this.db.mcpDelivery.count({
              where: {
                eventId: candidate.event.id,
                state: { in: ['PENDING', 'DELIVERING', 'DELIVERED'] },
              },
            });
            if (!pending && principal && answerProjectId) {
              const actor = principal.actor,
                projectId = answerProjectId;
              await this.ai.workspaceTransaction(
                actor,
                projectId,
                async (tx) => {
                  const answer = await tx.chatAiAnswer.findFirst({
                    where: {
                      id: candidate.event.answerId,
                      organizationId: actor.organizationId,
                      ownerId: actor.userId,
                    },
                  });
                  const metadata = answer && jobMetadata(answer.usage);
                  if (
                    answer &&
                    metadata &&
                    candidate.event.generation ===
                      metadata.notificationGeneration &&
                    ['WAITING_NOTIFICATION', 'WAITING_SUBSCRIPTION'].includes(
                      metadata.state,
                    )
                  ) {
                    await this.jobs.save(
                      tx,
                      answer,
                      {
                        ...metadata,
                        state: 'ERROR',
                        errorCode: 'MCP_CALLBACK_REJECTED',
                        progress:
                          'Callback của ChatGPT từ chối thông báo; có thể kết nối lại rồi thử lại công việc.',
                      },
                      {
                        status: 'FAILED',
                        errorCode: 'MCP_CALLBACK_REJECTED',
                        completedAt: new Date(),
                      },
                    );
                  }
                },
              );
            }
          }
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
