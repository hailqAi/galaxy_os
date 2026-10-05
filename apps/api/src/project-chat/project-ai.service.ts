import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ChatAiSourceIndex, ChatAiAnswer } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { CurrentActor } from '../access-control/current-actor';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { PrismaService } from '../prisma.service';
import { nativeSource } from './ai-native-source';
import { ProviderConfig, answerFromProvider } from './ai-provider';
import {
  AiError,
  activationEvidence,
  ActivationEvidence,
  AiContext,
  aiContextSchema,
  AI_MODELS,
  AiRequestMetadata,
  ConfiguredModel,
  configuredModel,
  readAiConfig,
  modelChoices,
  assertEgress,
  assertInput,
  requestMetadata,
} from './ai-registry';
import {
  chunks,
  extractText,
  retrieve,
  sourceTokens,
  SourceChunk,
} from './ai-source';
import { ProjectChatService } from './project-chat.service';
import { FileStorage } from '../files/file-storage';
import {
  activationFixture,
  activationFixtureVersion,
  recordActivation,
  writeAiMetadata,
} from './ai-activation';
import {
  ChatAiActivationDto,
  ChatAiConversationDto,
  ChatAiQuestionDto,
  ChatAiEgressDto,
} from './project-chat.dto';

const adminRunWhere = {
  usage: { path: ['kind'], equals: 'ADMIN_SMOKE' },
} satisfies Prisma.ChatAiAnswerWhereInput;

@Injectable()
export class ProjectAiService {
  private readonly logger = new Logger(ProjectAiService.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectChatService) private readonly chat: ProjectChatService,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
  ) {}

  private async authorized<T>(
    actor: CurrentActor,
    projectId: string,
    run: (tx: Prisma.TransactionClient, grantId: string) => Promise<T>,
  ) {
    if (process.env.FEATURE_PROJECT_AI !== 'true')
      throw new NotFoundException();
    return this.access.project(actor, projectId, async (tx) => {
      await this.access.freshActor(tx, actor);
      const grant = await this.access.authority(tx, actor, projectId, 'INVOKE');
      return run(tx, grant.id);
    });
  }
  private readonly running = new Map<string, AbortController>();
  private denied(error: unknown) {
    return (
      error instanceof NotFoundException || error instanceof ForbiddenException
    );
  }

  private context(input: AiContext) {
    const parsed = aiContextSchema.safeParse(
      Object.fromEntries(
        (['roomId', 'productLineId', 'fileAssetId', 'fileVersion'] as const)
          .filter((key) => input[key] !== undefined)
          .map((key) => [key, input[key]]),
      ),
    );
    if (!parsed.success) throw new ConflictException('INVALID_CONTEXT');
    return Object.keys(parsed.data).length ? parsed.data : undefined;
  }

  private async sourceScope(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    scope: string,
    context?: AiContext,
  ) {
    const rooms = await tx.chatRoom.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        ...(scope === 'ALL' ? {} : { group: scope }),
        ...(context?.roomId && { id: context.roomId }),
        ...(context?.productLineId && { productLineId: context.productLineId }),
      },
      select: { id: true },
    });
    const allowed: Prisma.ChatAiSourceIndexWhereInput[] = [];
    for (const room of rooms) {
      try {
        const { grant } = await this.access.assertRoom(
          actor,
          room.id,
          'READ',
          tx,
        );
        const messages: Prisma.ChatMessageWhereInput = {
          organizationId: actor.organizationId,
          projectId,
          roomId: room.id,
          OR: (await this.access.history(tx, grant, 'READ')).map(
            ({ gte, lt }) => ({ createdAt: { gte, lt } }),
          ),
        };
        const kinds: Prisma.ChatAiSourceIndexWhereInput[] = [
          ...(context?.fileAssetId ? [] : [{ message: { is: messages } }]),
        ];
        try {
          await this.access.assertRoom(actor, room.id, 'DOWNLOAD', tx);
          kinds.push({
            chatFile: {
              is: {
                AND: [
                  await this.chat.visibleFileWhere(
                    tx,
                    actor,
                    room.id,
                    grant,
                    'DOWNLOAD',
                  ),
                  ...(context?.fileAssetId
                    ? [
                        {
                          fileAssetId: context.fileAssetId,
                          file: { version: context.fileVersion },
                        },
                      ]
                    : []),
                ],
              },
            },
          });
          kinds.push({
            release: {
              is: {
                AND: [
                  await this.chat.publishedReleaseWhere(tx, actor, room.id),
                  ...(context?.fileAssetId
                    ? [
                        {
                          fileAssetId: context.fileAssetId,
                          file: { version: context.fileVersion },
                        },
                      ]
                    : []),
                ],
              },
            },
          });
        } catch (error) {
          if (!this.denied(error)) throw error;
        }
        allowed.push({ roomId: room.id, OR: kinds });
      } catch (error) {
        if (!this.denied(error)) throw error;
      }
    }
    return {
      organizationId: actor.organizationId,
      projectId,
      OR: allowed,
    } satisfies Prisma.ChatAiSourceIndexWhereInput;
  }

  private async checkSource(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    index: ChatAiSourceIndex,
  ) {
    if (
      index.organizationId !== actor.organizationId ||
      index.projectId !== projectId
    )
      throw new NotFoundException();
    const { grant } = await this.access.assertRoom(
      actor,
      index.roomId,
      index.messageId ? 'READ' : 'DOWNLOAD',
      tx,
    );
    if (index.messageId) {
      const message = await tx.chatMessage.findFirst({
        where: {
          id: index.messageId,
          organizationId: actor.organizationId,
          projectId,
          roomId: index.roomId,
          OR: (await this.access.history(tx, grant, 'READ')).map(
            ({ gte, lt }) => ({ createdAt: { gte, lt } }),
          ),
        },
      });
      if (
        !message ||
        message.payloadHash !== index.version ||
        (index.status === 'READY' &&
          createHash('sha256').update(message.body).digest('hex') !==
            index.checksum)
      )
        throw new NotFoundException();
      return {
        text: message.body,
        storageKey: null,
        mime: 'text/plain',
        name: index.label,
        bytes: Buffer.byteLength(message.body),
        checksum: null,
        downloadUrl: null,
        sequence: message.sequence,
      };
    }
    if (index.chatFileId) {
      const file = await this.chat.visibleFile(
        tx,
        actor,
        index.roomId,
        index.chatFileId,
        grant,
        'DOWNLOAD',
      );
      if (
        !file.file.checksum ||
        index.version !== `${file.version}:${file.file.checksum}`
      )
        throw new NotFoundException();
      return {
        text: null,
        storageKey: file.file.storageKey,
        mime: file.file.mimeType,
        name: file.file.originalFilename,
        bytes: Number(file.file.sizeBytes),
        checksum: file.file.checksum,
        downloadUrl: `/api/v1/project-chat/rooms/${index.roomId}/files/${index.chatFileId}/download`,
        sequence: null,
      };
    }
    if (index.releaseId) {
      const release = await this.chat.visibleRelease(
        tx,
        actor,
        index.releaseId,
      );
      if (
        release.projectId !== projectId ||
        release.roomId !== index.roomId ||
        index.version !== `${release.version}:${release.checksum}`
      )
        throw new NotFoundException();
      return {
        text: null,
        storageKey: release.file.storageKey,
        mime: release.mimeType,
        name: release.filename,
        bytes: Number(release.file.sizeBytes),
        checksum: release.checksum,
        downloadUrl: `/api/v1/project-chat/releases/${index.releaseId}/download`,
        sequence: null,
      };
    }
    throw new NotFoundException();
  }

  async index(
    actor: CurrentActor,
    projectId: string,
    scope: string,
    input: AiContext = {},
  ) {
    const context = this.context(input);
    const jobs = await this.authorized(
      actor,
      projectId,
      async (tx, grantId) => {
        const where = await this.sourceScope(
          tx,
          actor,
          projectId,
          scope,
          context,
        );
        let discovered = 0;
        // ponytail: bounded delta batches; add a background worker when indexing volume warrants it.
        for (const room of where.OR)
          for (const kind of room.OR ?? []) {
            if (discovered >= 25) break;
            const common = {
              organizationId: actor.organizationId,
              projectId,
              roomId: String(room.roomId),
              extractor: 'utf8-v1',
            };
            const missing = { none: { extractor: 'utf8-v1' } };
            if (kind.message?.is) {
              const rows = await tx.chatMessage.findMany({
                where: { ...kind.message.is, aiSources: missing },
                orderBy: { createdAt: 'asc' },
                take: 25 - discovered,
              });
              for (const row of rows) {
                await tx.chatAiSourceIndex.create({
                  data: {
                    ...common,
                    messageId: row.id,
                    version: row.payloadHash,
                    label: `Tin nhắn #${row.sequence}`,
                    provenance: 'UNCONFIRMED',
                  },
                });
                discovered++;
              }
            } else if (kind.chatFile?.is) {
              const rows = await tx.chatFile.findMany({
                where: { ...kind.chatFile.is, aiSources: missing },
                include: { file: true },
                orderBy: { createdAt: 'asc' },
                take: 25 - discovered,
              });
              for (const row of rows) {
                await tx.chatAiSourceIndex.create({
                  data: {
                    ...common,
                    chatFileId: row.id,
                    version: `${row.version}:${row.file.checksum ?? ''}`,
                    label: row.file.originalFilename,
                    provenance: 'UNCONFIRMED',
                  },
                });
                discovered++;
              }
            } else if (kind.release?.is) {
              const rows = await tx.chatDocumentRelease.findMany({
                where: { ...kind.release.is, aiSources: missing },
                orderBy: { publishedAt: 'asc' },
                take: 25 - discovered,
              });
              for (const row of rows) {
                await tx.chatAiSourceIndex.create({
                  data: {
                    ...common,
                    releaseId: row.id,
                    version: `${row.version}:${row.checksum}`,
                    label: row.filename,
                    provenance: 'PUBLISHED',
                  },
                });
                discovered++;
              }
            }
          }
        const now = new Date();
        await tx.chatAiSourceIndex.updateMany({
          where: {
            AND: [
              where,
              {
                status: 'PROCESSING',
                attempts: { gte: 3 },
                leaseUntil: { lt: now },
              },
            ],
          },
          data: {
            status: 'ERROR',
            errorCode: 'INDEX_ATTEMPTS_EXHAUSTED',
            leaseToken: null,
            leaseUntil: null,
          },
        });
        const rows = await tx.chatAiSourceIndex.findMany({
          where: {
            AND: [
              where,
              {
                attempts: { lt: 3 },
                OR: [
                  { status: { in: ['QUEUED', 'ERROR'] } },
                  { status: 'PROCESSING', leaseUntil: { lt: now } },
                ],
              },
            ],
          },
          orderBy: { createdAt: 'asc' },
          take: 25,
        });
        for (const row of rows) {
          row.leaseToken = randomUUID();
          await tx.chatAiSourceIndex.update({
            where: { id: row.id },
            data: {
              status: 'PROCESSING',
              leaseToken: row.leaseToken,
              leaseUntil: new Date(now.getTime() + 60_000),
              attempts: { increment: 1 },
            },
          });
        }
        return { rows, grantId, discovered };
      },
    );
    for (const row of jobs.rows) {
      let result: { status: string; text?: string };
      try {
        const source = await this.authorized(
          actor,
          projectId,
          async (tx, grantId) => {
            if (grantId !== jobs.grantId) throw new NotFoundException();
            return this.checkSource(tx, actor, projectId, row);
          },
        );
        if (source.text !== null)
          result = { status: 'READY', text: source.text };
        else if (source.bytes > 262_144) result = { status: 'TOO_LARGE' };
        else {
          result = extractText(source.name, source.mime, new Uint8Array());
          if (result.status === 'READY') {
            const stream = await this.storage.stream(source.storageKey!);
            const buffers: Buffer[] = [];
            let size = 0;
            try {
              for await (const part of stream) {
                const bytes = Buffer.from(part);
                size += bytes.length;
                if (size > 262_144) throw new Error('Source too large');
                buffers.push(bytes);
              }
            } finally {
              stream.destroy();
            }
            const bytes = Buffer.concat(buffers);
            if (
              createHash('sha256').update(bytes).digest('hex') !==
              source.checksum
            )
              throw new Error('Source checksum mismatch');
            result = extractText(source.name, source.mime, bytes);
          }
        }
        await this.authorized(actor, projectId, async (tx, grantId) => {
          if (grantId !== jobs.grantId) throw new NotFoundException();
          await this.checkSource(tx, actor, projectId, row);
          const indexed =
            result.status === 'READY'
              ? chunks({
                  organizationId: actor.organizationId,
                  projectId,
                  roomId: row.roomId,
                  sourceId: row.messageId ?? row.chatFileId ?? row.releaseId!,
                  version: row.version,
                  text: result.text!,
                })
              : [];
          await tx.chatAiSourceIndex.updateMany({
            where: {
              id: row.id,
              status: 'PROCESSING',
              leaseToken: row.leaseToken,
            },
            data: {
              status: result.status,
              // Search normalization never changes original chunks or their locators/checksum.
              text: result.text?.normalize('NFKC') ?? '',
              chunks: indexed as unknown as Prisma.InputJsonValue,
              checksum:
                result.status === 'READY'
                  ? createHash('sha256').update(result.text!).digest('hex')
                  : null,
              leaseToken: null,
              leaseUntil: null,
              errorCode: null,
            },
          });
        });
      } catch {
        await this.db.chatAiSourceIndex.updateMany({
          where: {
            id: row.id,
            status: 'PROCESSING',
            leaseToken: row.leaseToken,
          },
          data: {
            status: 'ERROR',
            leaseToken: null,
            leaseUntil: null,
            errorCode: 'SOURCE_UNAVAILABLE',
          },
        });
      }
    }
    return this.authorized(actor, projectId, async (tx) => ({
      processed: jobs.rows.length,
      hasMore: jobs.discovered === 25,
      sources: await this.sourceMetadata(tx, actor, projectId, scope, context),
    }));
  }

  private async sourceMetadata(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    scope: string,
    context?: AiContext,
  ) {
    const rows = await tx.chatAiSourceIndex.findMany({
      where: await this.sourceScope(tx, actor, projectId, scope, context),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const visible = [];
    for (const row of rows) {
      try {
        await this.checkSource(tx, actor, projectId, row);
      } catch (error) {
        if (this.denied(error)) continue;
        throw error;
      }
      const { id, label, status, version, provenance, errorCode } = row;
      visible.push({
        id,
        label,
        status,
        version,
        provenance,
        errorCode,
        nativeFile: !row.messageId && /\.(png|jpe?g|pdf)$/i.test(label),
      });
    }
    return visible;
  }

  indexStatus(
    actor: CurrentActor,
    projectId: string,
    scope: string,
    input: AiContext = {},
  ) {
    const context = this.context(input);
    return this.authorized(actor, projectId, async (tx) => ({
      sources: await this.sourceMetadata(tx, actor, projectId, scope, context),
    }));
  }

  private config(
    model?: string,
  ): ((ProviderConfig | ConfiguredModel) & { daily: number | null }) | null {
    // Legacy credentials never authorize new outbound requests. Historical rows remain readable.
    if (!model) return null;
    const selected = configuredModel(readAiConfig(), model);
    return { ...selected, daily: selected.maxRequestsPerDay };
  }
  private conversation(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    id: string,
  ) {
    return tx.chatAiConversation
      .findFirst({
        where: {
          id,
          organizationId: actor.organizationId,
          projectId,
          ownerId: actor.userId,
          answers: { none: adminRunWhere },
        },
      })
      .then((row) => {
        if (!row) throw new NotFoundException();
        return row;
      });
  }
  settings(actor: CurrentActor, projectId: string) {
    return this.authorized(actor, projectId, async (tx) => {
      await this.access.authority(tx, actor, projectId, 'ACCESS_ADMIN');
      return {
        models: await this.operationalModels(tx, actor, projectId),
        connections: readAiConfig().connections ?? {},
        configuration: 'TERMINAL_LOCAL',
        dataPolicy: 'SYNTHETIC_PUBLIC_APPROVED',
      };
    });
  }
  private costViolation(
    tx: Prisma.TransactionClient,
    model: string,
    revision: string,
  ) {
    return model === 'openrouter/free'
      ? tx.chatAiAnswer.findFirst({
          where: {
            model,
            errorCode: 'FREE_ONLY_COST_VIOLATION',
            OR: [
              { usage: { path: ['request', 'revision'], equals: revision } },
              { usage: { path: ['activation', 'revision'], equals: revision } },
            ],
          },
          select: { completedAt: true },
        })
      : Promise.resolve(null);
  }
  private async operationalModels(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
  ) {
    const models = modelChoices(
      readAiConfig(),
      actor.organizationId,
      projectId,
    );
    return Promise.all(
      models.map(async (model) => {
        const where = {
          organizationId: actor.organizationId,
          model: model.id,
          providerStartedAt: { not: null },
          OR: [
            {
              usage: {
                path: ['request', 'revision'],
                equals: model.revision ?? '',
              },
            },
            {
              usage: {
                path: ['activation', 'revision'],
                equals: model.revision ?? '',
              },
            },
          ],
        } satisfies Prisma.ChatAiAnswerWhereInput;
        const costViolation = await this.costViolation(
          tx,
          model.id,
          model.revision ?? '',
        );
        const last = await tx.chatAiAnswer.findFirst({
          where: {
            ...where,
            status: { in: ['COMPLETED', 'FAILED'] },
            OR: [
              { status: 'COMPLETED' },
              {
                errorCode: {
                  in: [
                    'TEMPORARY_ERROR',
                    'RATE_LIMITED',
                    'RATE_LIMITED_UNKNOWN',
                    'RATE_LIMITED_TEMPORARY',
                    'QUOTA_EXHAUSTED',
                    'BILLING_ACTION_REQUIRED',
                    'INVALID_CREDENTIAL',
                    'PROVIDER_FORBIDDEN',
                    'NETWORK_OR_TLS',
                    'PROVIDER_TIMEOUT_UNKNOWN',
                    'ADAPTER_RESPONSE_ERROR',
                  ],
                },
              },
            ],
            AND: [{ OR: where.OR }],
          },
          orderBy: { providerStartedAt: 'desc' },
          select: { status: true, errorCode: true, completedAt: true },
        });
        const success = await tx.chatAiAnswer.findFirst({
          where: { ...where, status: 'COMPLETED' },
          orderBy: { providerStartedAt: 'desc' },
          select: { completedAt: true },
        });
        return {
          ...model,
          ...(costViolation && {
            available: false,
            generalAvailable: false,
            providerReady: false,
            providerReason: 'FREE_ONLY_COST_VIOLATION',
            reason: 'FREE_ONLY_COST_VIOLATION',
          }),
          lastSuccessfulCallAt: success?.completedAt ?? null,
          health: {
            status: costViolation
              ? 'DEGRADED'
              : last?.status === 'COMPLETED'
                ? 'NORMAL'
                : last
                  ? 'DEGRADED'
                  : 'UNKNOWN',
            code: costViolation
              ? 'FREE_ONLY_COST_VIOLATION'
              : (last?.errorCode ?? null),
            checkedAt: last?.completedAt ?? null,
          },
        };
      }),
    );
  }
  approveEgress(
    actor: CurrentActor,
    projectId: string,
    input: ChatAiEgressDto,
  ) {
    return this.authorized(actor, projectId, async (tx) => {
      await this.access.authority(tx, actor, projectId, 'ACCESS_ADMIN');
      const metadata = readAiConfig();
      const identity = AI_MODELS.find((model) => model.id === input.model);
      if (!identity || !metadata[identity.provider] || !metadata.fileDigest)
        throw new ConflictException('INVALID_CONFIG');
      const config =
        input.action === 'APPROVE'
          ? configuredModel(metadata, input.model)
          : {
              provider: identity.provider,
              fileDigest: metadata.fileDigest,
              dataPolicy: metadata[identity.provider]!.dataPolicy,
            };
      let target = projectId;
      if (input.kind === 'INPUT') {
        if (!input.question?.trim() || input.sourceId || input.version)
          throw new ConflictException('INVALID_CONTEXT');
        target = createHash('sha256').update(input.question).digest('hex');
      } else if (input.kind === 'SOURCE') {
        if (!input.sourceId || !input.version || input.question)
          throw new ConflictException('INVALID_CONTEXT');
        const source = await tx.chatAiSourceIndex.findFirst({
          where: {
            id: input.sourceId,
            organizationId: actor.organizationId,
            projectId,
            version: input.version,
          },
        });
        if (!source) throw new NotFoundException();
        await this.checkSource(tx, actor, projectId, source);
        target = source.id;
      } else if (input.question || input.sourceId || input.version)
        throw new ConflictException('INVALID_CONTEXT');
      const event = {
        id: randomUUID(),
        actorId: actor.userId,
        organizationId: actor.organizationId,
        projectId,
        at: new Date().toISOString(),
        kind: input.kind,
        action: input.action,
        target,
        ...(input.version && { version: input.version }),
      };
      // Quyết định và audit được ghi cùng atomic config dưới flock/CAS; không chứa prompt hoặc tên nguồn.
      await writeAiMetadata(config, 'record-policy', event);
      return {
        policyRevision: event.id,
        dataPolicy: config.dataPolicy,
        action: event.action,
        kind: event.kind,
      };
    });
  }
  private async reserveProvider(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    config: NonNullable<ReturnType<ProjectAiService['config']>>,
    id: string,
    heldBy?: string,
  ) {
    // Reserve quota across Projects atomically. Failed/cancelled starts still count.
    await tx.$queryRaw(
      Prisma.sql`WITH quota_lock AS (
              SELECT pg_advisory_xact_lock(hashtextextended(${'provider' in config ? `ai-quota:${config.provider}` : `ai-quota:${actor.organizationId}:${actor.userId}`},0))
            ) SELECT TRUE AS locked FROM quota_lock`,
    );
    const now = new Date();
    if (
      'provider' in config &&
      (await this.costViolation(tx, config.model, config.revision))
    ) {
      await tx.chatAiAnswer.update({
        where: { id },
        data: {
          status: 'FAILED',
          errorCode: 'FREE_ONLY_COST_VIOLATION',
          completedAt: now,
        },
      });
      return false;
    }
    const recent =
      'provider' in config
        ? await tx.chatAiAnswer.findFirst({
            where: {
              model: config.model,
              OR: [
                {
                  usage: {
                    path: ['request', 'revision'],
                    equals: config.revision,
                  },
                },
                {
                  usage: {
                    path: ['activation', 'revision'],
                    equals: config.revision,
                  },
                },
              ],
              errorCode: { in: ['TEMPORARY_ERROR', 'RATE_LIMITED_TEMPORARY'] },
              providerStartedAt: { not: null },
            },
            orderBy: { completedAt: 'desc' },
            select: { usage: true, completedAt: true },
          })
        : null;
    const metadata = recent?.usage as {
      diagnostic?: { retry_after_ms?: unknown };
    } | null;
    const retryAfter = metadata?.diagnostic?.retry_after_ms;
    if (
      recent?.completedAt &&
      typeof retryAfter === 'number' &&
      Number.isFinite(retryAfter) &&
      retryAfter > 0 &&
      recent.completedAt.getTime() + retryAfter > now.getTime()
    ) {
      await tx.chatAiAnswer.update({
        where: { id },
        data: {
          status: 'FAILED',
          errorCode: 'PROVIDER_COOLDOWN',
          completedAt: now,
        },
      });
      return false;
    }
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const count = await tx.chatAiAnswer.count({
      where: {
        ...('provider' in config
          ? { model: config.model }
          : {
              organizationId: actor.organizationId,
              ownerId: actor.userId,
            }),
        providerStartedAt: { gte: day },
      },
    });
    const concurrent =
      'provider' in config
        ? await tx.chatAiAnswer.count({
            where: {
              model: config.model,
              ...(heldBy && { id: { not: heldBy } }),
              providerStartedAt: { not: null },
              status: { not: 'COMPLETED' },
              leaseUntil: { gt: now },
            },
          })
        : 0;
    if (
      (config!.daily !== null && count >= config!.daily) ||
      ('provider' in config && concurrent >= config.maxConcurrent)
    ) {
      await tx.chatAiAnswer.update({
        where: { id },
        data: {
          status: 'FAILED',
          errorCode:
            config!.daily !== null && count >= config!.daily
              ? 'DAILY_QUOTA_EXCEEDED'
              : 'CONCURRENCY_LIMIT',
          completedAt: now,
        },
      });
      return false;
    }
    await tx.chatAiAnswer.update({
      where: { id },
      data: {
        status: 'RUNNING',
        model: config!.model,
        providerStartedAt: now,
        leaseUntil: new Date(now.getTime() + 120000),
      },
    });
    return true;
  }

  async testActivation(
    actor: CurrentActor,
    projectId: string,
    input: ChatAiActivationDto,
  ) {
    const fixture = activationFixture(input.capability);
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify([
          input.model,
          input.capability,
          activationFixtureVersion,
        ]),
      )
      .digest('hex');
    const claimed = await this.authorized(
      actor,
      projectId,
      async (tx, grantId) => {
        const admin = await this.access.authority(
          tx,
          actor,
          projectId,
          'ACCESS_ADMIN',
        );
        let conversation = await tx.chatAiConversation.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId,
            ownerId: actor.userId,
            clientKey: input.clientKey,
          },
        });
        if (conversation) {
          let previous = await tx.chatAiAnswer.findFirstOrThrow({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'asc' },
          });
          if (
            (previous.usage as Prisma.JsonObject | null)?.kind !==
              'ADMIN_SMOKE' ||
            previous.payloadHash !== payloadHash ||
            previous.invokeGrantId !== grantId
          )
            throw new ConflictException('Khóa đã dùng cho lần kiểm thử khác');
          if (
            previous.status === 'RUNNING' &&
            previous.leaseUntil &&
            previous.leaseUntil <= new Date()
          ) {
            previous = await tx.chatAiAnswer.update({
              where: { id: previous.id },
              data: {
                status: 'FAILED_UNKNOWN',
                errorCode: 'INTERRUPTED_NO_AUTO_RETRY',
                completedAt: new Date(),
                leaseUntil: null,
                usage: {
                  kind: 'ADMIN_SMOKE',
                  fixtureVersion: activationFixtureVersion,
                },
              },
            });
          }
          const parsed = activationEvidence.safeParse(
            (previous.usage as Prisma.JsonObject | null)?.activation,
          );
          return {
            started: false as const,
            result: {
              requestId: previous.id,
              status: previous.status,
              errorCode: previous.errorCode,
              evidence: parsed.success ? parsed.data : null,
            },
          };
        }
        let config: ConfiguredModel;
        try {
          config = configuredModel(readAiConfig(), input.model);
          if (config.provider === 'openrouter')
            throw new AiError('GENERAL_ONLY');
        } catch (e) {
          throw new ConflictException(
            e instanceof AiError ? e.code : 'INVALID_CONFIG',
          );
        }
        if (input.capability !== 'text' && !config.nativeMedia)
          throw new ConflictException('UNSUPPORTED_FILE');
        conversation = await tx.chatAiConversation.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            ownerId: actor.userId,
            clientKey: input.clientKey,
            scope: 'ALL',
          },
        });
        const answer = await tx.chatAiAnswer.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            ownerId: actor.userId,
            conversationId: conversation.id,
            invokeGrantId: grantId,
            clientKey: input.clientKey,
            payloadHash,
            question: fixture.questions[0]!,
            model: config.model,
            usage: {
              kind: 'ADMIN_SMOKE',
              fixtureVersion: activationFixtureVersion,
            },
          },
        });
        const reserved = await this.reserveProvider(
          tx,
          actor,
          { ...config, daily: config.maxRequestsPerDay },
          answer.id,
        );
        if (!reserved)
          return {
            started: false as const,
            result: {
              requestId: answer.id,
              status: 'FAILED',
              errorCode: 'CONCURRENCY_OR_QUOTA',
              evidence: null,
            },
          };
        return {
          started: true as const,
          answer,
          config,
          grantId,
          adminId: admin.id,
        };
      },
    );
    if (!claimed.started) return claimed.result;
    const { config, answer } = claimed;
    const controller = new AbortController();
    this.running.set(answer.id, controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(100000),
    ]);
    const evidence: ActivationEvidence = {
      revision: config.revision,
      provider: config.provider,
      requestedModel: config.model,
      returnedModel: null,
      capability: input.capability,
      fixtureVersion: activationFixtureVersion,
      testedAt: new Date().toISOString(),
      requestId: answer.id,
      result: 'PASS',
      httpStatus: null,
      usage: null,
    };
    const history: { question: string; answer: string }[] = [];
    let currentId = answer.id;
    let firstResult: Awaited<ReturnType<typeof answerFromProvider>> | undefined;
    const gate = async (
      tx: Prisma.TransactionClient,
      grantId: string,
      active = true,
    ) => {
      const admin = await this.access.authority(
        tx,
        actor,
        projectId,
        'ACCESS_ADMIN',
      );
      if (grantId !== claimed.grantId || admin.id !== claimed.adminId)
        throw new NotFoundException();
      if (
        active &&
        !(await tx.chatAiAnswer.findFirst({
          where: {
            id: answer.id,
            status: 'RUNNING',
            leaseUntil: { gt: new Date() },
          },
          select: { id: true },
        }))
      )
        throw new AiError('INTERRUPTED_NO_AUTO_RETRY');
      const current = configuredModel(readAiConfig(), config.model);
      if (
        current.revision !== config.revision ||
        current.configDigest !== config.configDigest
      )
        throw new AiError('CONFIG_CHANGED');
    };
    try {
      for (const media of fixture.media)
        await nativeSource(
          {
            organizationId: actor.organizationId,
            projectId,
            roomId: 'ADMIN_SMOKE',
            sourceId: answer.id,
            version: activationFixtureVersion,
            text: '',
          },
          input.capability === 'pdf' ? 'activation.pdf' : 'activation.png',
          media.mime,
          media.bytes,
          createHash('sha256').update(media.bytes).digest('hex'),
        );
      for (let index = 0; index < fixture.questions.length; index++) {
        await this.authorized(actor, projectId, async (tx, grantId) => {
          await gate(tx, grantId);
          if (index) {
            const row = await tx.chatAiAnswer.create({
              data: {
                organizationId: actor.organizationId,
                projectId,
                ownerId: actor.userId,
                conversationId: answer.conversationId,
                invokeGrantId: grantId,
                clientKey: randomUUID(),
                payloadHash,
                question: fixture.questions[index]!,
                model: config.model,
                usage: {
                  kind: 'ADMIN_SMOKE',
                  parent: answer.id,
                  fixtureVersion: activationFixtureVersion,
                },
              },
            });
            currentId = row.id;
            if (
              !(await this.reserveProvider(
                tx,
                actor,
                { ...config, daily: config.maxRequestsPerDay },
                currentId,
                answer.id,
              ))
            )
              throw new AiError('CONCURRENCY_OR_QUOTA');
          }
        });
        signal.throwIfAborted();
        const result = await answerFromProvider(
          {
            ...config,
            maxOutputTokens: Math.min(config.maxOutputTokens, 1024),
          },
          fixture.questions[index]!,
          fixture.sources,
          signal,
          {
            history,
            media: fixture.media,
            beforeAttempt: () => this.authorized(actor, projectId, gate),
            diagnostic: (event) =>
              this.logger.log(
                JSON.stringify({
                  request_id: currentId,
                  stage: 'PROVIDER',
                  provider_id: config.provider,
                  model_id: config.model,
                  endpoint: config.endpoint,
                  config_version: config.revision,
                  policy_reason: 'ADMIN_SYNTHETIC_FIXTURE',
                  ...event,
                }),
              ),
          },
        );
        if (!index) firstResult = result;
        evidence.returnedModel = result.returnedModel;
        evidence.httpStatus = result.httpStatus;
        if (result.returnedModel && result.returnedModel !== config.model)
          throw new AiError('MODEL_RETURNED_DIFFERENT');
        if (!fixture.assertions[index]!.test(result.answer))
          throw new AiError('FIXTURE_ASSERTION_FAILED');
        evidence.usage =
          result.usage && (index === 0 || evidence.usage)
            ? {
                input_tokens:
                  (evidence.usage?.input_tokens ?? 0) +
                  result.usage.input_tokens,
                output_tokens:
                  (evidence.usage?.output_tokens ?? 0) +
                  result.usage.output_tokens,
              }
            : null;
        await this.authorized(actor, projectId, async (tx, grantId) => {
          await gate(tx, grantId);
          if (index)
            await tx.chatAiAnswer.update({
              where: { id: currentId },
              data: {
                answer: result.answer,
                citations: result.citations,
                uncertainty: result.uncertainty,
                status: 'COMPLETED',
                completedAt: new Date(),
                leaseUntil: null,
              },
            });
        });
        history.push({
          question: fixture.questions[index]!,
          answer: result.answer,
        });
      }
      await this.authorized(actor, projectId, async (tx, grantId) => {
        await gate(tx, grantId);
        await recordActivation(config, evidence);
        await tx.chatAiAnswer.update({
          where: { id: answer.id },
          data: {
            status: 'COMPLETED',
            answer: firstResult!.answer,
            citations: firstResult!.citations,
            uncertainty: firstResult!.uncertainty,
            completedAt: new Date(),
            leaseUntil: null,
            usage: {
              kind: 'ADMIN_SMOKE',
              activation: evidence,
              samples: history.length,
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof AiError) evidence.httpStatus = error.httpStatus;
      evidence.result = this.denied(error)
        ? 'ACCESS_REVOKED'
        : error instanceof AiError
          ? error.code
          : signal.aborted
            ? 'PROVIDER_TIMEOUT_UNKNOWN'
            : 'ADAPTER_RESPONSE_ERROR';
      await this.db.chatAiAnswer.updateMany({
        where: {
          id: { in: [answer.id, currentId] },
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        data: {
          status: 'FAILED',
          errorCode: evidence.result,
          completedAt: new Date(),
          usage: {
            kind: 'ADMIN_SMOKE',
            activation: evidence,
            samples: history.length,
          },
        },
      });
      if (!this.denied(error)) {
        try {
          await this.authorized(actor, projectId, async (tx, grantId) => {
            await gate(tx, grantId, false);
            await recordActivation(config, evidence);
          });
        } catch {
          /* Giữ nguyên cấu hình mới/quyền mới; bằng chứng lỗi chỉ còn ở run riêng. */
        }
      }
    } finally {
      this.running.delete(answer.id);
    }
    return this.authorized(actor, projectId, async (tx, grantId) => {
      await this.access.authority(tx, actor, projectId, 'ACCESS_ADMIN');
      if (grantId !== claimed.grantId) throw new NotFoundException();
      return {
        requestId: answer.id,
        status: evidence.result === 'PASS' ? 'COMPLETED' : 'FAILED',
        errorCode: evidence.result === 'PASS' ? null : evidence.result,
        evidence,
      };
    });
  }

  private selectedConfig(answer: ChatAiAnswer, requireRevision = true) {
    const pin = requestMetadata(answer.usage);
    if (!pin) return null;
    const config = configuredModel(readAiConfig(), pin.model, !requireRevision);
    if (
      config.provider !== pin.provider ||
      (requireRevision &&
        (config.revision !== pin.revision ||
          config.configDigest !== pin.configDigest))
    )
      throw new AiError('CONFIG_CHANGED');
    return config;
  }
  list(actor: CurrentActor, projectId: string) {
    return this.authorized(actor, projectId, async (tx) => {
      const models = await this.operationalModels(tx, actor, projectId);
      return {
        provider: models.some((m) => m.providerReady)
          ? 'CONFIGURED'
          : 'NOT_CONFIGURED',
        models,
        conversations: await tx.chatAiConversation
          .findMany({
            where: {
              organizationId: actor.organizationId,
              projectId,
              ownerId: actor.userId,
              answers: { none: adminRunWhere },
            },
            select: {
              id: true,
              scope: true,
              createdAt: true,
              answers: {
                orderBy: { createdAt: 'asc' },
                take: 1,
                select: { usage: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
          .then((rows) =>
            rows.map(({ answers, ...conversation }) => ({
              ...conversation,
              context: requestMetadata(answers[0]?.usage)?.context ?? null,
              mode: requestMetadata(answers[0]?.usage)?.mode ?? 'PROJECT',
            })),
          ),
      };
    });
  }
  createConversation(
    actor: CurrentActor,
    projectId: string,
    input: ChatAiConversationDto,
  ) {
    return this.authorized(actor, projectId, async (tx) => {
      const existing = await tx.chatAiConversation.findFirst({
        where: {
          organizationId: actor.organizationId,
          projectId,
          ownerId: actor.userId,
          clientKey: input.clientKey,
        },
      });
      if (existing) {
        if (
          await tx.chatAiAnswer.count({
            where: { ...adminRunWhere, conversationId: existing.id },
          })
        )
          throw new NotFoundException();
        if (existing.scope !== input.scope)
          throw new ConflictException('Khóa đã dùng cho phạm vi khác');
        return { id: existing.id, scope: existing.scope };
      }
      return tx.chatAiConversation.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          ownerId: actor.userId,
          ...input,
        },
        select: { id: true, scope: true },
      });
    });
  }
  ask(
    actor: CurrentActor,
    projectId: string,
    conversationId: string,
    input: ChatAiQuestionDto,
  ) {
    return this.authorized(actor, projectId, async (tx, grantId) => {
      await this.conversation(tx, actor, projectId, conversationId);
      const context = this.context(input);
      const mode = input.mode ?? 'PROJECT';
      if (mode === 'GENERAL' && (context || input.sourceIds?.length))
        throw new ConflictException('INVALID_CONTEXT');
      if (context && !input.model)
        throw new ConflictException('Cần chọn model');
      if (!input.question.trim()) throw new ConflictException('Câu hỏi trống');
      if (
        !input.model &&
        (input.sourceIds?.length || input.reasoning || input.dataClassification)
      )
        throw new ConflictException('Cần chọn model');
      const payloadHash = createHash('sha256')
        .update(
          input.model
            ? JSON.stringify([
                input.question,
                input.model,
                input.reasoning ?? 'default',
                input.dataClassification,
                input.sourceIds ?? [],
                ...(context ? [context] : []),
                mode,
              ])
            : input.question,
        )
        .digest('hex');
      const existing = await tx.chatAiAnswer.findUnique({
        where: {
          conversationId_clientKey: {
            conversationId,
            clientKey: input.clientKey,
          },
        },
      });
      if (existing) {
        if (existing.invokeGrantId !== grantId) throw new NotFoundException();
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException('Khóa đã dùng cho câu hỏi khác');
        const visible = await this.view(
          tx,
          actor,
          projectId,
          existing,
          grantId,
        );
        if (
          ['ACCESS_REVOKED', 'EGRESS_POLICY_DENIED', 'MODEL_DISABLED'].includes(
            visible.status,
          )
        )
          throw new ConflictException(
            'Nguồn hoặc cấu hình không còn được phép',
          );
        return { id: existing.id, status: existing.status };
      }
      const first = await tx.chatAiAnswer.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      });
      if (
        first &&
        (JSON.stringify(requestMetadata(first.usage)?.context) !==
          JSON.stringify(context) ||
          (requestMetadata(first.usage)?.mode ?? 'PROJECT') !== mode)
      )
        throw new ConflictException('CONVERSATION_CONTEXT_CHANGED');
      let pin: AiRequestMetadata | null = null;
      if (input.model) {
        try {
          const config = configuredModel(readAiConfig(), input.model);
          if (config.provider === 'openrouter' && mode !== 'GENERAL')
            throw new AiError('GENERAL_ONLY');
          if (mode === 'PROJECT')
            assertEgress(
              config,
              actor.organizationId,
              projectId,
              input.dataClassification,
              [],
            );
          assertInput(
            config,
            actor.organizationId,
            projectId,
            actor.userId,
            input.question,
          );
          const reasoning = input.reasoning ?? 'default';
          if (!(config.reasoning as readonly string[]).includes(reasoning))
            throw new AiError('UNSUPPORTED_REASONING');
          pin = {
            version: 1,
            mode,
            provider: config.provider,
            model: config.model,
            revision: config.revision,
            configDigest: config.configDigest,
            reasoning,
            dataClassification: 'SYNTHETIC_PUBLIC_APPROVED',
            sourceIds: input.sourceIds ?? [],
            ...(context && { context }),
          };
        } catch (error) {
          const model = AI_MODELS.find((m) => m.id === input.model);
          this.logger.log(
            JSON.stringify({
              request_id: input.clientKey,
              stage: 'POLICY',
              provider_id: model?.provider,
              model_id: input.model,
              policy_reason:
                error instanceof AiError ? error.code : 'INVALID_CONFIG',
              outbound_attempted: false,
              upstream_status: null,
              config_version: readAiConfig()[model!.provider]?.revision ?? null,
            }),
          );
          throw new ConflictException(
            error instanceof AiError ? error.code : 'INVALID_CONFIG',
          );
        }
      }
      return tx.chatAiAnswer.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          ownerId: actor.userId,
          conversationId,
          invokeGrantId: grantId,
          payloadHash,
          question: input.question,
          clientKey: input.clientKey,
          ...(pin ? { model: pin.model, usage: { request: pin } } : {}),
        },
        select: { id: true, status: true },
      });
    });
  }
  private async ownedAnswer(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    id: string,
    grantId: string,
  ) {
    const row = await tx.chatAiAnswer.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        projectId,
        ownerId: actor.userId,
        invokeGrantId: grantId,
        conversation: { answers: { none: adminRunWhere } },
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async view(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    answer: ChatAiAnswer,
    grantId: string,
  ) {
    const hidden = {
      id: answer.id,
      status: 'ACCESS_REVOKED',
      question: null,
      answer: null,
      uncertainty: null,
      sources: [],
      createdAt: answer.createdAt,
    };
    if (answer.invokeGrantId !== grantId) return hidden;
    const dependencies = await tx.chatAiAnswerDependency.findMany({
      where: {
        answerId: answer.id,
        organizationId: actor.organizationId,
        projectId,
      },
      include: { source: true },
    });
    try {
      for (const dependency of dependencies)
        await this.checkSource(tx, actor, projectId, dependency.source);
    } catch (error) {
      if (this.denied(error)) return hidden;
      throw error;
    }
    const pin = requestMetadata(answer.usage);
    if (pin) {
      if (pin.context) {
        const where = await this.sourceScope(
          tx,
          actor,
          projectId,
          'ALL',
          pin.context,
        );
        if (
          !where.OR.length ||
          (dependencies.length &&
            (await tx.chatAiSourceIndex.count({
              where: {
                AND: [
                  where,
                  { id: { in: dependencies.map((d) => d.source.id) } },
                ],
              },
            })) !== dependencies.length)
        )
          return hidden;
      }
      try {
        const config = this.selectedConfig(
          answer,
          !['COMPLETED', 'FAILED', 'FAILED_UNKNOWN', 'CANCELLED'].includes(
            answer.status,
          ),
        )!;
        assertInput(
          config,
          actor.organizationId,
          projectId,
          actor.userId,
          answer.question,
        );
        const previous = await tx.chatAiAnswer.findMany({
          where: {
            conversationId: answer.conversationId,
            status: 'COMPLETED',
            createdAt: { lt: answer.createdAt },
          },
          orderBy: { createdAt: 'desc' },
          select: { question: true, usage: true },
        });
        for (const turn of previous) {
          if ((requestMetadata(turn.usage)?.mode ?? 'PROJECT') !== pin.mode)
            throw new AiError('HISTORY_UNAVAILABLE');
          assertInput(
            config,
            actor.organizationId,
            projectId,
            actor.userId,
            turn.question,
          );
        }
        if (pin.mode !== 'GENERAL')
          assertEgress(
            config,
            actor.organizationId,
            projectId,
            pin.dataClassification,
            dependencies.map((d) => d.source),
          );
      } catch (error) {
        return {
          ...hidden,
          status:
            error instanceof AiError ? error.code : 'EGRESS_POLICY_DENIED',
          errorCode:
            error instanceof AiError ? error.code : 'EGRESS_POLICY_DENIED',
        };
      }
    }
    const sources = answer.citations.map((handle) => {
      const dependency = dependencies.find((d) => d.handles.includes(handle));
      const chunk = (
        dependency?.source.chunks as unknown as SourceChunk[] | undefined
      )?.find((c) => c.handle === handle);
      if (!dependency || !chunk) throw new NotFoundException();
      return {
        handle,
        label: dependency.source.label,
        version: dependency.source.version,
        provenance: dependency.source.provenance,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        page: chunk.page ?? null,
      };
    });
    return {
      id: answer.id,
      mode: pin?.mode ?? 'PROJECT',
      status:
        ['FAILED', 'NO_SOURCES'].includes(answer.status) &&
        ['EGRESS_POLICY_DENIED', 'HISTORY_UNAVAILABLE'].includes(
          answer.errorCode ?? '',
        )
          ? answer.errorCode!
          : answer.status,
      question: answer.question,
      answer: answer.answer,
      uncertainty: answer.uncertainty,
      errorCode: answer.errorCode,
      model: answer.model,
      provider: pin?.provider ?? (answer.model ? 'legacy' : null),
      modelLabel:
        AI_MODELS.find((m) => m.id === answer.model)?.label ?? answer.model,
      providerLabel:
        AI_MODELS.find((m) => m.provider === pin?.provider)?.providerLabel ??
        null,
      returnedModel:
        answer.usage &&
        typeof answer.usage === 'object' &&
        !Array.isArray(answer.usage)
          ? (answer.usage.returnedModel ?? null)
          : null,
      ...(pin?.provider === 'openrouter' &&
      answer.usage &&
      typeof answer.usage === 'object' &&
      !Array.isArray(answer.usage)
        ? {
            gatewayRequestId: answer.usage.gatewayRequestId ?? null,
            upstreamProvider: answer.usage.upstreamProvider ?? null,
            cost: answer.usage.cost ?? {
              status: 'UNKNOWN',
              value: null,
              source: null,
            },
            catalogueVerifiedAt: answer.usage.catalogueVerifiedAt ?? null,
          }
        : {}),
      usage:
        answer.usage &&
        typeof answer.usage === 'object' &&
        !Array.isArray(answer.usage)
          ? pin
            ? (answer.usage.tokens ?? null)
            : answer.usage
          : null,
      sources,
      createdAt: answer.createdAt,
    };
  }

  history(actor: CurrentActor, projectId: string, id: string) {
    return this.authorized(actor, projectId, async (tx, grantId) => {
      const conversation = await this.conversation(tx, actor, projectId, id);
      await tx.chatAiAnswer.updateMany({
        where: {
          conversationId: id,
          ownerId: actor.userId,
          status: { in: ['INDEXING', 'RUNNING'] },
          leaseUntil: { lt: new Date() },
        },
        data: {
          status: 'FAILED_UNKNOWN',
          completedAt: new Date(),
          errorCode: 'INTERRUPTED_NO_AUTO_RETRY',
        },
      });
      const answers = await tx.chatAiAnswer.findMany({
        where: {
          conversationId: id,
          organizationId: actor.organizationId,
          projectId,
          ownerId: actor.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const visible = [];
      for (const answer of answers.reverse())
        visible.push(await this.view(tx, actor, projectId, answer, grantId));
      return {
        id: conversation.id,
        scope: conversation.scope,
        context: requestMetadata(answers[0]?.usage)?.context ?? null,
        mode: requestMetadata(answers[0]?.usage)?.mode ?? 'PROJECT',
        answers: visible,
      };
    });
  }

  citation(actor: CurrentActor, projectId: string, id: string, handle: string) {
    return this.authorized(actor, projectId, async (tx, grantId) => {
      const answer = await this.ownedAnswer(tx, actor, projectId, id, grantId);
      const visible = await this.view(tx, actor, projectId, answer, grantId);
      if (visible.status !== 'COMPLETED' || !answer.citations.includes(handle))
        throw new NotFoundException();
      const dependency = await tx.chatAiAnswerDependency.findFirst({
        where: {
          answerId: id,
          organizationId: actor.organizationId,
          projectId,
          handles: { has: handle },
        },
        include: { source: true },
      });
      if (!dependency) throw new NotFoundException();
      const index = dependency.source;
      const chunk = (index.chunks as unknown as SourceChunk[]).find(
        (c) => c.handle === handle,
      );
      if (!chunk) throw new NotFoundException();
      const canonical = await this.checkSource(tx, actor, projectId, index);
      return {
        handle,
        projectId,
        roomId: index.roomId,
        sourceId: index.messageId ?? index.chatFileId ?? index.releaseId,
        kind: index.messageId
          ? 'MESSAGE'
          : index.chatFileId
            ? 'FILE'
            : 'RELEASE',
        version: index.version,
        provenance: index.provenance,
        label: index.label,
        text: canonical.text ?? chunk.text,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        startColumn: chunk.startColumn,
        page: chunk.page ?? null,
        sequence: canonical.sequence,
        downloadUrl: canonical.downloadUrl,
      };
    });
  }

  async cancel(actor: CurrentActor, projectId: string, id: string) {
    const result = await this.authorized(
      actor,
      projectId,
      async (tx, grantId) => {
        const answer = await this.ownedAnswer(
          tx,
          actor,
          projectId,
          id,
          grantId,
        );
        if (['QUEUED', 'INDEXING', 'RUNNING'].includes(answer.status))
          await tx.chatAiAnswer.update({
            where: { id },
            data: { status: 'CANCELLED', completedAt: new Date() },
          });
        return {
          id,
          status: ['QUEUED', 'INDEXING', 'RUNNING'].includes(answer.status)
            ? 'CANCELLED'
            : answer.status,
        };
      },
    );
    if (result.status === 'CANCELLED') this.running.get(id)?.abort();
    return result;
  }

  private async mediaContext(
    actor: CurrentActor,
    projectId: string,
    answer: ChatAiAnswer,
    scope: string,
  ) {
    const pin = requestMetadata(answer.usage);
    const result: { index: ChatAiSourceIndex; mime: string; bytes: Buffer }[] =
      [];
    if (!pin?.sourceIds.length) return result;
    const config = this.selectedConfig(answer)!;
    if (!config.nativeMedia) throw new AiError('UNSUPPORTED_FILE');
    for (const id of pin.sourceIds) {
      const checked = await this.authorized(actor, projectId, async (tx) => {
        const index = await tx.chatAiSourceIndex.findFirst({
          where: {
            AND: [
              await this.sourceScope(tx, actor, projectId, scope, pin.context),
              { id },
            ],
          },
        });
        if (!index || index.messageId) throw new NotFoundException();
        assertEgress(
          config,
          actor.organizationId,
          projectId,
          pin.dataClassification,
          [index],
        );
        const source = await this.checkSource(tx, actor, projectId, index);
        if (
          source.mime === 'application/pdf'
            ? !config.pdfLiveVerified
            : !config.imageLiveVerified
        )
          throw new AiError('FILE_NOT_LIVE_VERIFIED');
        if (!source.storageKey || source.bytes > 8_000_000)
          throw new AiError('INPUT_TOO_LARGE');
        return { index, source };
      });
      let bytes: Buffer;
      try {
        const stream = await this.storage.stream(checked.source.storageKey!);
        const parts: Buffer[] = [];
        let size = 0;
        try {
          for await (const part of stream) {
            const value = Buffer.from(part);
            size += value.length;
            if (size > 8_000_000) throw new AiError('INPUT_TOO_LARGE');
            parts.push(value);
          }
        } finally {
          stream.destroy();
        }
        bytes = Buffer.concat(parts);
      } catch (error) {
        if (error instanceof AiError) throw error;
        throw new AiError('MISSING_BINARY');
      }
      const native = await nativeSource(
        {
          organizationId: actor.organizationId,
          projectId,
          roomId: checked.index.roomId,
          sourceId: checked.index.chatFileId ?? checked.index.releaseId!,
          version: checked.index.version,
          text: '',
        },
        checked.source.name,
        checked.source.mime,
        bytes,
        checked.source.checksum!,
      );
      const index = await this.authorized(actor, projectId, async (tx) => {
        this.selectedConfig(answer);
        await this.checkSource(tx, actor, projectId, checked.index);
        return tx.chatAiSourceIndex.update({
          where: { id: checked.index.id },
          data: {
            chunks: native.chunks as unknown as Prisma.InputJsonValue,
            checksum: checked.source.checksum,
          },
        });
      });
      result.push({ index, mime: checked.source.mime, bytes });
    }
    return result;
  }

  async run(actor: CurrentActor, projectId: string, id: string) {
    const claimed = await this.authorized(
      actor,
      projectId,
      async (tx, grantId) => {
        const answer = await this.ownedAnswer(
          tx,
          actor,
          projectId,
          id,
          grantId,
        );
        if (answer.status !== 'QUEUED')
          return {
            started: false as const,
            view: await this.view(tx, actor, projectId, answer, grantId),
          };
        let config: ReturnType<ProjectAiService['config']> = null;
        let configError = 'NOT_CONFIGURED';
        try {
          const pin = requestMetadata(answer.usage);
          config = this.config(pin?.model);
          if (
            pin &&
            (!config ||
              !('provider' in config) ||
              config.revision !== pin.revision ||
              config.configDigest !== pin.configDigest)
          )
            throw new AiError('CONFIG_CHANGED');
        } catch (error) {
          config = null;
          configError =
            error instanceof AiError ? error.code : 'INVALID_CONFIG';
        }
        if (!config) {
          const next = await tx.chatAiAnswer.update({
            where: { id },
            data: {
              status:
                configError === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'FAILED',
              errorCode: configError,
              completedAt: new Date(),
            },
          });
          return {
            started: false as const,
            view: await this.view(tx, actor, projectId, next, grantId),
          };
        }
        const conversation = await this.conversation(
          tx,
          actor,
          projectId,
          answer.conversationId,
        );
        await tx.chatAiAnswer.update({
          where: { id },
          data: {
            status: 'INDEXING',
            leaseUntil: new Date(Date.now() + 120_000),
          },
        });
        return {
          started: true as const,
          answer,
          scope: conversation.scope,
          grantId,
          config,
        };
      },
    );
    if (!claimed.started) return claimed.view;
    const config = claimed.config;
    const pin = requestMetadata(claimed.answer.usage);
    let diagnostic: Prisma.InputJsonObject = {
      request_id: id,
      stage: 'RETRIEVAL',
      provider_id: pin?.provider ?? 'legacy',
      model_id: config.model,
      config_version: pin?.revision ?? null,
      policy_reason: null,
      outbound_attempted: false,
      upstream_status: null,
    };
    let priorTurns: { question: string; answer: string }[] = [];
    let limitedSources = false;
    const controller = new AbortController();
    this.running.set(id, controller);
    try {
      if (pin?.mode !== 'GENERAL')
        await this.index(actor, projectId, claimed.scope, pin?.context);
      controller.signal.throwIfAborted();
      const native =
        pin?.mode === 'GENERAL'
          ? []
          : await this.mediaContext(
              actor,
              projectId,
              claimed.answer,
              claimed.scope,
            );
      const context = await this.authorized(
        actor,
        projectId,
        async (tx, grantId) => {
          if (grantId !== claimed.grantId) throw new NotFoundException();
          const answer = await this.ownedAnswer(
            tx,
            actor,
            projectId,
            id,
            grantId,
          );
          if (answer.status !== 'INDEXING') return null;
          // A top-k source answer never claims the full domain total.
          if (
            pin?.mode !== 'GENERAL' &&
            /(?:^|[^\p{L}\p{N}_])(?:tổng|tất cả)(?:$|[^\p{L}\p{N}_])/iu.test(
              answer.question.normalize('NFKC'),
            )
          ) {
            await tx.chatAiAnswer.update({
              where: { id },
              data: {
                status: 'NEEDS_REPORT',
                completedAt: new Date(),
                errorCode: 'FULL_DOMAIN_REPORT_REQUIRED',
              },
            });
            return null;
          }
          const priorDependencies: {
            source: ChatAiSourceIndex;
            handles: string[];
          }[] = [];
          if (pin && 'provider' in config) {
            const previous = await tx.chatAiAnswer.findMany({
              where: {
                conversationId: answer.conversationId,
                status: 'COMPLETED',
                createdAt: { lt: answer.createdAt },
              },
              orderBy: { createdAt: 'desc' },
              take: 6,
            });
            priorTurns = [];
            for (const previousAnswer of previous.reverse()) {
              const visible = await this.view(
                tx,
                actor,
                projectId,
                previousAnswer,
                grantId,
              );
              if (visible.status !== 'COMPLETED')
                throw new AiError('HISTORY_UNAVAILABLE');
              const previousPin = requestMetadata(previousAnswer.usage);
              if (
                !previousPin ||
                previousPin.mode !== pin.mode ||
                previousPin.dataClassification !== pin.dataClassification
              )
                throw new AiError('EGRESS_POLICY_DENIED');
              const deps = await tx.chatAiAnswerDependency.findMany({
                where: { answerId: previousAnswer.id },
                include: { source: true },
              });
              assertInput(
                config,
                actor.organizationId,
                projectId,
                actor.userId,
                previousAnswer.question,
              );
              if (pin.mode !== 'GENERAL')
                assertEgress(
                  config,
                  actor.organizationId,
                  projectId,
                  pin.dataClassification,
                  deps.map((d) => d.source),
                );
              if (
                !config.nativeMedia &&
                deps.some((d) =>
                  (d.source.chunks as unknown as SourceChunk[]).some(
                    (c) => c.page,
                  ),
                )
              )
                throw new AiError('UNSUPPORTED_FILE');
              priorDependencies.push(...deps);
              priorTurns.push({
                question: previousAnswer.question,
                answer: previousAnswer.answer!,
              });
            }
          }
          if (pin?.mode === 'GENERAL' && 'provider' in config) {
            this.selectedConfig(answer);
            assertInput(
              config,
              actor.organizationId,
              projectId,
              actor.userId,
              answer.question,
            );
            if (!(await this.reserveProvider(tx, actor, config, id)))
              return null;
            return [];
          }
          const terms = [
            ...sourceTokens(
              answer.question + ' ' + (priorTurns.at(-1)?.question ?? ''),
            ),
          ].slice(0, 24);
          const search = terms.map((term) => `'${term}'`).join(' | ');
          // Code-like tokens constrain candidates before truncation; chunk token checks remain exact.
          const codes = terms.filter(
            (term) => /\p{L}/u.test(term) && /\p{N}/u.test(term),
          );
          const codeSearch = codes.map((term) => `'${term}'`).join(' | ');
          const scope = await this.sourceScope(
            tx,
            actor,
            projectId,
            claimed.scope,
            pin?.context,
          );
          await tx.$executeRaw`SET LOCAL default_text_search_config = 'pg_catalog.simple'`;
          // ponytail: Prisma6.19 FTS ranks before LIMIT but has no indexed search support.
          // Add indexed native SQL with the same ACL only when measured database work warrants it.
          const candidates = terms.length
            ? await tx.chatAiSourceIndex.findMany({
                where: {
                  AND: [
                    scope,
                    {
                      status: 'READY',
                      text: { search },
                    },
                    ...(codeSearch ? [{ text: { search: codeSearch } }] : []),
                  ],
                },
                orderBy: [
                  ...(codeSearch
                    ? [
                        {
                          _relevance: {
                            fields: ['text' as const],
                            search: codeSearch,
                            sort: 'desc' as const,
                          },
                        },
                      ]
                    : []),
                  { _relevance: { fields: ['text'], search, sort: 'desc' } },
                  { id: 'asc' },
                ],
                take: 50,
              })
            : [];
          const readable: ChatAiSourceIndex[] = [];
          for (const source of candidates) {
            try {
              await this.checkSource(tx, actor, projectId, source);
              if (
                'provider' in config &&
                !config.approvedSources.some(
                  (approved) =>
                    approved.id === source.id &&
                    approved.version === source.version,
                )
              ) {
                limitedSources = true;
                continue;
              }
              readable.push(source);
            } catch (error) {
              if (!this.denied(error)) throw error;
            }
          }
          const selected = retrieve(
            readable.flatMap((row) => row.chunks as unknown as SourceChunk[]),
            answer.question + ' ' + (priorTurns.at(-1)?.question ?? ''),
            {
              organizationId: actor.organizationId,
              projectId,
              roomIds: readable.map((row) => row.roomId),
            },
          );
          for (const item of native) {
            await this.checkSource(tx, actor, projectId, item.index);
            if (!readable.some((s) => s.id === item.index.id))
              readable.push(item.index);
            selected.push(...(item.index.chunks as unknown as SourceChunk[]));
          }
          for (const dependency of priorDependencies) {
            if (!readable.some((s) => s.id === dependency.source.id))
              readable.push(dependency.source);
            for (const c of dependency.source
              .chunks as unknown as SourceChunk[])
              if (
                dependency.handles.includes(c.handle) &&
                !selected.some((s) => s.handle === c.handle)
              )
                selected.push(c);
          }
          if (selected.length > 12) throw new AiError('INPUT_TOO_LARGE');
          if (!selected.length) {
            await tx.chatAiAnswer.update({
              where: { id },
              data: {
                status: 'NO_SOURCES',
                completedAt: new Date(),
                errorCode: limitedSources
                  ? 'EGRESS_POLICY_DENIED'
                  : 'NO_READABLE_INDEXED_SOURCE',
              },
            });
            return null;
          }
          if (pin && 'provider' in config) {
            this.selectedConfig(answer);
            assertEgress(
              config,
              actor.organizationId,
              projectId,
              pin.dataClassification,
              readable.filter((s) =>
                selected.some((c) =>
                  (s.chunks as unknown as SourceChunk[]).some(
                    (sc) => sc.handle === c.handle,
                  ),
                ),
              ),
            );
          }
          for (const source of readable) {
            const handles = selected
              .filter((chunk) =>
                (source.chunks as unknown as SourceChunk[]).some(
                  (c) => c.handle === chunk.handle,
                ),
              )
              .map((c) => c.handle);
            if (handles.length)
              await tx.chatAiAnswerDependency.create({
                data: {
                  organizationId: actor.organizationId,
                  projectId,
                  answerId: id,
                  sourceIndexId: source.id,
                  handles,
                },
              });
          }
          if (!(await this.reserveProvider(tx, actor, config, id))) return null;
          return selected.map((chunk) => {
            const source = readable.find((row) =>
              (row.chunks as unknown as SourceChunk[]).some(
                (c) => c.handle === chunk.handle,
              ),
            )!;
            return {
              handle: chunk.handle,
              text: `[${source.provenance}; ${source.label}; version ${source.version}; dòng ${chunk.startLine}-${chunk.endLine}]\n${chunk.text}`,
            };
          });
        },
      );
      if (context) {
        // Final gate immediately before sending context. No DB lock spans provider I/O.
        const beforeAttempt = async () => {
          const allowed = await this.authorized(
            actor,
            projectId,
            async (tx, grantId) => {
              const answer = await this.ownedAnswer(
                tx,
                actor,
                projectId,
                id,
                grantId,
              );
              const visible = await this.view(
                tx,
                actor,
                projectId,
                answer,
                grantId,
              );
              if (
                pin &&
                visible.status !== 'RUNNING' &&
                visible.status !== 'ACCESS_REVOKED'
              )
                throw new AiError(visible.status);
              if (
                'provider' in config &&
                (await this.costViolation(tx, config.model, config.revision))
              )
                throw new AiError('FREE_ONLY_COST_VIOLATION');
              return (
                grantId === claimed.grantId && visible.status === 'RUNNING'
              );
            },
          );
          if (!allowed) throw new NotFoundException();
        };
        if (!('provider' in config)) await beforeAttempt();
        controller.signal.throwIfAborted();
        const result = await answerFromProvider(
          config!,
          claimed.answer.question,
          context,
          controller.signal,
          {
            beforeAttempt,
            diagnostic: (event) => {
              diagnostic = {
                ...diagnostic,
                stage: 'PROVIDER',
                policy_reason: 'ALLOWED',
                ...event,
              };
              this.logger.log(JSON.stringify(diagnostic));
            },
            reasoning: pin?.reasoning,
            history: priorTurns,
            media: native.map((item) => ({
              handle: (item.index.chunks as unknown as SourceChunk[])[0]!
                .handle,
              mime: item.mime,
              bytes: item.bytes,
            })),
          },
        );
        await this.authorized(actor, projectId, async (tx, grantId) => {
          const answer = await this.ownedAnswer(
            tx,
            actor,
            projectId,
            id,
            grantId,
          );
          const visible = await this.view(
            tx,
            actor,
            projectId,
            answer,
            grantId,
          );
          if (
            pin &&
            visible.status !== 'RUNNING' &&
            visible.status !== 'ACCESS_REVOKED'
          )
            throw new AiError(visible.status);
          if (grantId !== claimed.grantId || visible.status !== 'RUNNING')
            throw new NotFoundException();
          await tx.chatAiAnswer.updateMany({
            where: { id, status: 'RUNNING', invokeGrantId: claimed.grantId },
            data: {
              status: 'COMPLETED',
              answer: result.answer,
              uncertainty: limitedSources
                ? `Chỉ sử dụng phần nguồn đã được phép gửi tới nhà cung cấp. ${result.uncertainty}`
                : result.uncertainty,
              citations: result.citations,
              usage: pin
                ? {
                    request: pin,
                    tokens: result.usage,
                    returnedModel: result.returnedModel,
                    ...(pin.provider === 'openrouter' && {
                      gatewayRequestId: result.gatewayRequestId,
                      upstreamProvider: result.upstreamProvider,
                      cost: result.cost,
                      catalogueVerifiedAt: result.catalogueVerifiedAt,
                    }),
                    dataPolicyResult: 'ALLOWED',
                    diagnostic,
                  }
                : (result.usage ?? Prisma.DbNull),
              completedAt: new Date(),
              leaseUntil: null,
            },
          });
        });
      }
    } catch (error) {
      diagnostic = {
        ...diagnostic,
        stage: diagnostic.outbound_attempted
          ? 'DELIVERY_OR_PROVIDER'
          : 'POLICY',
        adapter_stage: error instanceof AiError ? error.adapterStage : null,
        policy_reason: this.denied(error)
          ? 'ACCESS_REVOKED'
          : error instanceof AiError
            ? error.code
            : 'PROVIDER_OR_SOURCE_FAILED',
      };
      this.logger.log(JSON.stringify(diagnostic));
      // A known charge survives a concurrent cancel; preserve the terminal lifecycle status.
      if (
        pin?.provider === 'openrouter' &&
        error instanceof AiError &&
        error.code === 'FREE_ONLY_COST_VIOLATION' &&
        error.providerEvidence
      ) {
        await this.db.chatAiAnswer.updateMany({
          where: {
            id,
            organizationId: actor.organizationId,
            projectId,
            ownerId: actor.userId,
          },
          data: {
            errorCode: error.code,
            usage: { request: pin, diagnostic, ...error.providerEvidence },
          },
        });
      }
      await this.db.chatAiAnswer.updateMany({
        where: {
          id,
          organizationId: actor.organizationId,
          projectId,
          ownerId: actor.userId,
          status: { in: ['INDEXING', 'RUNNING'] },
        },
        data: {
          status: this.denied(error) ? 'ACCESS_REVOKED' : 'FAILED',
          errorCode: this.denied(error)
            ? 'SOURCE_OR_AUTHORITY_REVOKED'
            : error instanceof AiError
              ? error.code
              : 'PROVIDER_OR_SOURCE_FAILED',
          completedAt: new Date(),
          ...(pin && {
            usage: {
              request: pin,
              diagnostic,
              ...(error instanceof AiError && error.providerEvidence
                ? error.providerEvidence
                : {}),
            },
          }),
          // Abort/timeout cannot prove the provider stopped; hold the bounded reservation.
        },
      });
    } finally {
      this.running.delete(id);
    }
    return this.authorized(actor, projectId, async (tx, grantId) =>
      this.view(
        tx,
        actor,
        projectId,
        await this.ownedAnswer(tx, actor, projectId, id, grantId),
        grantId,
      ),
    );
  }
}
