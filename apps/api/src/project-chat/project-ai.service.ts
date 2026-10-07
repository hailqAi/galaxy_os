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
import { addAbortSignal } from 'node:stream';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { PrismaService } from '../prisma.service';
import {
  nativeSource,
  documentText,
  analyzeTable,
  scanPages,
  xlsxMime,
} from './ai-native-source';
import { docxMime } from '../files/office-document';
import {
  documentInput,
  renderDocument,
  documentPlainText,
  documentDiff,
} from './ai-document';
import {
  calculate,
  decimalTotal,
  savedToolPermissions,
  toolInputs,
  toolDefinitions,
  savedToolSources,
  type ToolName,
  type ToolOutput,
  type ToolSource,
} from './ai-tools';
import { fetchPublicPage, publicTarget, webSearch } from './ai-web';
import { ProjectStageTwoService } from '../projects/project-stage-two.service';
import {
  ProviderConfig,
  answerFromProvider,
  type ProviderCall,
} from './ai-provider';
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
  projectPolicy,
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
import { FilesService } from '../files/files.service';
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
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(ProjectStageTwoService)
    private readonly stageTwo: ProjectStageTwoService,
  ) {}

  private async authorized<T>(
    actor: CurrentActor,
    projectId: string,
    run: (tx: Prisma.TransactionClient, grantId: string) => Promise<T>,
  ) {
    if (process.env.FEATURE_PROJECT_AI !== 'true')
      throw new NotFoundException();
    return this.access.project(actor, projectId, async (tx) => {
      const fresh = await this.access.freshActor(tx, actor);
      if (
        !(await tx.project.findFirst({
          where: {
            AND: [
              { id: projectId },
              projectWhereForPermissions(fresh, 'ai.invoke'),
            ],
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException();
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
    if (
      context?.productLineId &&
      !(await tx.projectProductLine.findFirst({
        where: {
          id: context.productLineId,
          organizationId: actor.organizationId,
          projectId,
          deletedAt: null,
        },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    if (context?.roomId) {
      const { room } = await this.access.assertRoom(
        actor,
        context.roomId,
        'READ',
        tx,
      );
      if (room.projectId !== projectId) throw new NotFoundException();
    }
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
    if (!context?.roomId && !context?.productLineId)
      allowed.push({
        ownerId: actor.userId,
        fileAssetId: context?.fileAssetId ?? { not: null },
        ...(context?.fileVersion && { file: { version: context.fileVersion } }),
      });
    if (!context?.roomId)
      allowed.push({
        projectFileAssetId: context?.fileAssetId ?? { not: null },
        OR: [{ errorCode: null }, { errorCode: { not: 'VERSION_CHANGED' } }],
        projectFile: {
          is: {
            ...(await this.files.projectAiWhere(
              await this.access.freshActor(tx, actor),
              projectId,
              tx,
            )),
            ...(context?.fileVersion && { version: context.fileVersion }),
          },
        },
      });
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
    lineage = new Set<string>(),
    verifiedOrigins = new Set<string>(),
  ) {
    if (
      index.organizationId !== actor.organizationId ||
      index.projectId !== projectId
    )
      throw new NotFoundException();
    if (index.projectFileAssetId) {
      const fresh = await this.access.freshActor(tx, actor);
      const file = await this.files.projectAiFile(
        fresh,
        projectId,
        index.projectFileAssetId,
        tx,
      );
      if (index.version !== `${file.version}:${file.checksum}`)
        throw new NotFoundException();
      return {
        text: null,
        storageKey: file.storageKey,
        mime: file.mimeType,
        name: file.originalFilename,
        bytes: Number(file.sizeBytes),
        checksum: file.checksum,
        downloadUrl: `/api/v1/files/${file.id}/download?version=${file.version}`,
        sequence: null,
      };
    }
    if (index.fileAssetId) {
      if (index.ownerId !== actor.userId || !index.conversationId)
        throw new NotFoundException();
      await this.conversation(tx, actor, projectId, index.conversationId);
      const fresh = await this.access.freshActor(tx, actor);
      if (
        !(await tx.project.findFirst({
          where: {
            AND: [
              { id: projectId },
              projectWhereForPermissions(fresh, ['file.read', 'file.download']),
            ],
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException();
      const file = await tx.fileAsset.findFirst({
        where: {
          id: index.fileAssetId ?? index.projectFileAssetId,
          organizationId: actor.organizationId,
          uploadedById: actor.userId,
          deletedAt: null,
          attachments: {
            some: {
              entityType: 'ChatAiConversation',
              entityId: index.conversationId,
              projectId,
              createdBy: actor.userId,
            },
          },
        },
      });
      if (!file || index.version !== `${file.version}:${file.checksum}`)
        throw new NotFoundException();
      const origins = await tx.entityAttachment.findMany({
        where: { fileAssetId: file.id, entityType: 'ChatAiAnswer' },
      });
      if (origins.length || index.provenance === 'AI_DRAFT') {
        if (
          origins.length !== 1 ||
          lineage.size >= 16 ||
          lineage.has(origins[0]!.entityId)
        )
          throw new NotFoundException();
        const originId = origins[0]!.entityId;
        if (!verifiedOrigins.has(originId)) {
          lineage.add(originId);
          try {
            const grant = await this.access.authority(
              tx,
              actor,
              projectId,
              'INVOKE',
            );
            const origin = await this.ownedAnswer(
              tx,
              actor,
              projectId,
              originId,
              grant.id,
            );
            if (
              origin.conversationId !== index.conversationId ||
              origin.status !== 'COMPLETED' ||
              (
                await this.view(
                  tx,
                  actor,
                  projectId,
                  origin,
                  grant.id,
                  lineage,
                  verifiedOrigins,
                )
              ).status !== 'COMPLETED'
            )
              throw new NotFoundException();
            verifiedOrigins.add(originId);
          } finally {
            lineage.delete(originId);
          }
        }
      }
      return {
        text: null,
        storageKey: file.storageKey,
        mime: file.mimeType,
        name: file.originalFilename,
        bytes: Number(file.sizeBytes),
        checksum: file.checksum,
        downloadUrl: `/api/v1/project-chat/projects/${projectId}/ai/files/${index.id}/download`,
        sequence: null,
      };
    }
    if (!index.roomId) throw new NotFoundException();
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
        const fileScope = where.OR.find((kind) => kind.projectFile)?.projectFile
          ?.is;
        if (fileScope) {
          // ponytail: scan only version metadata; add a DB delta cursor if Project file counts make this costly.
          const candidates = (
            await tx.fileAsset.findMany({
              where: {
                AND: [
                  fileScope,
                  ...(context?.fileAssetId
                    ? [{ id: context.fileAssetId }]
                    : []),
                ],
              },
              select: {
                id: true,
                version: true,
                checksum: true,
                aiProjectSources: {
                  where: { projectId, extractor: 'utf8-v1' },
                  select: { version: true },
                },
              },
              orderBy: { createdAt: 'desc' },
            })
          ).filter(
            (file) =>
              !file.aiProjectSources.some(
                (source) =>
                  source.version === `${file.version}:${file.checksum}`,
              ),
          );
          const fresh = await this.access.freshActor(tx, actor);
          for (const candidate of candidates) {
            if (discovered >= 25) break;
            try {
              const file = await this.files.projectAiFile(
                fresh,
                projectId,
                candidate.id,
                tx,
              );
              await tx.chatAiSourceIndex.updateMany({
                where: {
                  projectId,
                  projectFileAssetId: file.id,
                  version: { not: `${file.version}:${file.checksum}` },
                },
                data: {
                  status: 'INVALID',
                  errorCode: 'VERSION_CHANGED',
                  leaseToken: null,
                  leaseUntil: null,
                },
              });
              await tx.chatAiSourceIndex.create({
                data: {
                  organizationId: actor.organizationId,
                  projectId,
                  projectFileAssetId: file.id,
                  version: `${file.version}:${file.checksum}`,
                  label: file.originalFilename,
                  provenance: 'UNCONFIRMED',
                },
              });
              discovered++;
            } catch (error) {
              if (!this.denied(error)) throw error;
            }
          }
        }
        // ponytail: bounded delta batches; add a background worker when indexing volume warrants it.
        for (const room of where.OR.filter((kind) => kind.roomId))
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
        // Upgrade only formats newly supported by this reader, under the same source ACL/version.
        const legacy = await tx.chatAiSourceIndex.findMany({
          where: {
            AND: [
              where,
              {
                status: 'UNSUPPORTED',
                OR: [
                  {
                    label: { endsWith: '.docx', mode: 'insensitive' },
                    errorCode: null,
                  },
                  { errorCode: 'PDF_SCAN_UNSUPPORTED' },
                ],
              },
            ],
          },
          take: 25,
        });
        for (const row of legacy) {
          try {
            const source = await this.checkSource(tx, actor, projectId, row);
            if (
              source.mime !== docxMime &&
              !(
                source.mime === 'application/pdf' &&
                row.errorCode === 'PDF_SCAN_UNSUPPORTED'
              )
            )
              continue;
            await tx.chatAiSourceIndex.updateMany({
              where: {
                id: row.id,
                status: 'UNSUPPORTED',
                errorCode: row.errorCode,
              },
              data: { status: 'QUEUED', attempts: 0, errorCode: null },
            });
          } catch (error) {
            if (!this.denied(error)) throw error;
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
        const claimed: typeof rows = [];
        for (const row of rows) {
          if (row.provenance === 'AI_DRAFT') {
            const origin = row.fileAssetId
              ? await tx.entityAttachment.findFirst({
                  where: {
                    fileAssetId: row.fileAssetId,
                    entityType: 'ChatAiAnswer',
                  },
                })
              : null;
            const answer = origin
              ? await tx.chatAiAnswer.findFirst({
                  where: {
                    id: origin.entityId,
                    organizationId: actor.organizationId,
                    projectId,
                    ownerId: actor.userId,
                  },
                })
              : null;
            if (answer?.status !== 'COMPLETED') {
              if (
                !answer ||
                !['QUEUED', 'INDEXING', 'RUNNING'].includes(answer.status)
              )
                await tx.chatAiSourceIndex.update({
                  where: { id: row.id },
                  data: {
                    status: 'FORBIDDEN',
                    errorCode: 'ORIGIN_NOT_COMPLETED',
                  },
                });
              continue;
            }
          }
          claimed.push(row);
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
        return { rows: claimed, grantId, discovered };
      },
    );
    for (const row of jobs.rows) {
      let result: {
        status: string;
        text?: string;
        chunks?: SourceChunk[];
        errorCode?: string;
      };
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
        else if (
          source.bytes >
          (['application/pdf', xlsxMime, docxMime].includes(source.mime)
            ? 8_000_000
            : 262_144)
        )
          result = { status: 'TOO_LARGE' };
        else {
          result = extractText(source.name, source.mime, new Uint8Array());
          if (
            result.status === 'READY' ||
            (result.status !== 'FORBIDDEN' &&
              ['application/pdf', xlsxMime, docxMime].includes(source.mime))
          ) {
            const stream = await this.storage.stream(source.storageKey!);
            const buffers: Buffer[] = [];
            let size = 0;
            try {
              for await (const part of stream) {
                const bytes = Buffer.from(part);
                size += bytes.length;
                if (
                  size >
                  (['application/pdf', xlsxMime, docxMime].includes(source.mime)
                    ? 8_000_000
                    : 262_144)
                )
                  throw new Error('Source too large');
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
            result = await documentText(
              {
                organizationId: actor.organizationId,
                projectId,
                roomId: row.roomId,
                sourceId:
                  row.messageId ??
                  row.chatFileId ??
                  row.releaseId ??
                  row.fileAssetId ??
                  row.projectFileAssetId!,
                version: row.version,
                text: '',
              },
              source.name,
              source.mime,
              bytes,
              source.checksum!,
            );
          }
        }
        await this.authorized(actor, projectId, async (tx, grantId) => {
          if (grantId !== jobs.grantId) throw new NotFoundException();
          await this.checkSource(tx, actor, projectId, row);
          const indexed =
            result.status === 'READY'
              ? (result.chunks ??
                chunks({
                  organizationId: actor.organizationId,
                  projectId,
                  roomId: row.roomId,
                  sourceId:
                    row.messageId ??
                    row.chatFileId ??
                    row.releaseId ??
                    row.fileAssetId ??
                    row.projectFileAssetId!,
                  version: row.version,
                  text: result.text!,
                }))
              : result.errorCode === 'PDF_SCAN_REQUIRES_VISION'
                ? (row.chunks as unknown as SourceChunk[])
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
              errorCode: result.errorCode ?? null,
            },
          });
        });
      } catch (error) {
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
            errorCode:
              error instanceof AiError ? error.code : 'SOURCE_UNAVAILABLE',
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

  async downloadFile(actor: CurrentActor, projectId: string, id: string) {
    const source = await this.authorized(actor, projectId, async (tx) => {
      const index = await tx.chatAiSourceIndex.findFirst({
        where: {
          id,
          organizationId: actor.organizationId,
          projectId,
          ownerId: actor.userId,
          fileAssetId: { not: null },
        },
      });
      if (!index) throw new NotFoundException();
      return this.checkSource(tx, actor, projectId, index);
    });
    if (!source.storageKey) throw new NotFoundException();
    return {
      file: { mimeType: source.mime, originalFilename: source.name },
      data: await this.storage.stream(source.storageKey),
    };
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
      const metadata = readAiConfig();
      return {
        models: await this.operationalModels(tx, actor, projectId),
        connections: metadata.connections ?? {},
        configuration: 'TERMINAL_LOCAL',
        dataPolicy:
          metadata.openrouter?.dataPolicy === 'PROJECT_AUTHORIZED' &&
          metadata.openrouter.projectPolicy?.organizationId ===
            actor.organizationId
            ? 'PROJECT_AUTHORIZED'
            : 'SYNTHETIC_PUBLIC_APPROVED',
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
          if (config.provider === 'openrouter' && input.capability === 'pdf')
            throw new AiError('UNSUPPORTED_FILE');
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
        if (
          config.provider !== 'openrouter' &&
          result.returnedModel &&
          result.returnedModel !== config.model
        )
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
        executionPolicy:
          process.env.GALAXY_AI_EXECUTION_POLICY ?? 'LEGACY_API_KEY',
        ...(process.env.GALAXY_AI_EXECUTION_POLICY === 'CHATGPT_PLAN_ONLY' && {
          chatGptConnection: {
            status: 'ELIGIBILITY_UNCONFIRMED',
            canConnect: false,
          },
        }),
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
    const metadata = readAiConfig();
    const router = metadata.openrouter;
    const unified =
      router?.dataPolicy === 'PROJECT_AUTHORIZED' &&
      router.projectPolicy?.organizationId === actor.organizationId;
    if (unified)
      input = {
        ...input,
        model: input.model ?? 'openrouter/free',
        mode: undefined,
        dataClassification: undefined,
      };
    return this.authorized(actor, projectId, async (tx, grantId) => {
      await this.conversation(tx, actor, projectId, conversationId);
      const context = this.context(input);
      const mode = unified ? 'UNIFIED' : (input.mode ?? 'PROJECT');
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
          (!unified &&
            (requestMetadata(first.usage)?.mode ?? 'PROJECT') !== mode))
      )
        throw new ConflictException('CONVERSATION_CONTEXT_CHANGED');
      let pin: AiRequestMetadata | null = null;
      if (input.model) {
        try {
          const config = configuredModel(readAiConfig(), input.model);
          if (
            config.provider === 'openrouter' &&
            mode !== 'GENERAL' &&
            !projectPolicy(config, actor.organizationId)
          )
            throw new AiError('GENERAL_ONLY');
          if (mode !== 'GENERAL')
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
          const previous =
            unified && !input.sourceIds?.length
              ? await tx.chatAiAnswer.findFirst({
                  where: { conversationId, status: 'COMPLETED' },
                  orderBy: { createdAt: 'desc' },
                })
              : null;
          pin = {
            version: 1,
            ...(unified && config.provider === 'openrouter'
              ? {
                  toolRevision: 'project-tools-v1' as const,
                  toolConfigDigest: config.fileDigest,
                }
              : {}),
            mode,
            provider: config.provider,
            model: config.model,
            revision: config.revision,
            configDigest: config.configDigest,
            reasoning,
            dataClassification: unified
              ? 'PROJECT_AUTHORIZED'
              : 'SYNTHETIC_PUBLIC_APPROVED',
            sourceIds: input.sourceIds?.length
              ? input.sourceIds
              : ((previous
                  ? requestMetadata(previous.usage)?.sourceIds
                  : undefined) ?? []),
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
    lineage = new Set<string>(),
    verifiedOrigins = new Set<string>(),
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
        await this.checkSource(
          tx,
          actor,
          projectId,
          dependency.source,
          lineage,
          verifiedOrigins,
        );
    } catch (error) {
      if (this.denied(error)) return hidden;
      throw error;
    }
    const toolSources = savedToolSources(answer.usage);
    const toolPermissions = savedToolPermissions(answer.usage);
    if (toolPermissions.length) {
      const fresh = await this.access.freshActor(tx, actor);
      if (
        !(await tx.project.findFirst({
          where: {
            AND: [
              { id: projectId },
              projectWhereForPermissions(fresh, toolPermissions),
            ],
          },
          select: { id: true },
        }))
      )
        return hidden;
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
          if (
            pin.mode !== 'UNIFIED' &&
            (requestMetadata(turn.usage)?.mode ?? 'PROJECT') !== pin.mode
          )
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
      const tool = toolSources.find((source) => source.handle === handle);
      if (tool)
        return {
          handle,
          label: tool.label,
          version: tool.version,
          provenance: tool.provenance,
          startLine: 1,
          endLine: tool.text.split('\n').length,
          page: null,
        };
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
      toolActivity:
        answer.status === 'RUNNING' &&
        answer.usage &&
        typeof answer.usage === 'object' &&
        !Array.isArray(answer.usage) &&
        typeof answer.usage.toolActivity === 'string'
          ? answer.usage.toolActivity
          : null,
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
      artifacts:
        answer.status === 'COMPLETED' &&
        answer.usage &&
        typeof answer.usage === 'object' &&
        !Array.isArray(answer.usage)
          ? (answer.usage.artifacts ?? [])
          : [],
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
      const tool = savedToolSources(answer.usage).find(
        (source) => source.handle === handle,
      );
      if (tool)
        return {
          handle,
          projectId,
          roomId: null,
          sourceId: answer.id,
          kind: 'TOOL',
          version: tool.version,
          provenance: tool.provenance,
          label: tool.label,
          text: tool.text,
          startLine: 1,
          endLine: tool.text.split('\n').length,
          startColumn: 1,
          page: null,
          sequence: null,
          downloadUrl: null,
          ...(tool.web ? { web: tool.web } : {}),
        };
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
        sourceId:
          index.messageId ??
          index.chatFileId ??
          index.releaseId ??
          index.fileAssetId ??
          index.projectFileAssetId,
        kind: index.messageId
          ? 'MESSAGE'
          : index.chatFileId || index.fileAssetId || index.projectFileAssetId
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

  private async readBinary(
    storageKey: string,
    checksum: string,
    signal?: AbortSignal,
  ) {
    try {
      const rawStream = await this.storage.stream(storageKey);
      const stream = signal ? addAbortSignal(signal, rawStream) : rawStream,
        parts: Buffer[] = [];
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
      const bytes = Buffer.concat(parts);
      if (createHash('sha256').update(bytes).digest('hex') !== checksum)
        throw new AiError('SOURCE_UNAVAILABLE');
      return bytes;
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError('MISSING_BINARY');
    }
  }

  private async mediaContext(
    actor: CurrentActor,
    projectId: string,
    answer: ChatAiAnswer,
    scope: string,
    signal: AbortSignal,
    renderPage?: number,
  ) {
    const pin = requestMetadata(answer.usage);
    const result: {
      index: ChatAiSourceIndex;
      mime: string;
      bytes: Buffer;
      handle?: string;
      selectedChunks?: SourceChunk[];
    }[] = [];
    if (!pin) return result;
    const sourceIds = [...pin.sourceIds];
    if (!sourceIds.length) {
      const previous = await this.authorized(actor, projectId, async (tx) => {
        const prior = await tx.chatAiAnswer.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId,
            ownerId: actor.userId,
            conversationId: answer.conversationId,
            status: 'COMPLETED',
            createdAt: { lt: answer.createdAt },
          },
          orderBy: { createdAt: 'desc' },
          include: { dependencies: { include: { source: true } } },
        });
        return (
          prior?.dependencies
            .filter((d) => /\.(png|jpe?g|pdf)$/i.test(d.source.label))
            .map((d) => d.source.id) ?? []
        );
      });
      sourceIds.push(...previous.slice(0, 3));
    }
    const config = this.selectedConfig(answer)!;
    for (const id of sourceIds) {
      signal.throwIfAborted();
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
          renderPage === undefined &&
          index.status === 'READY' &&
          !source.mime.startsWith('image/')
        )
          return { index, source, textOnly: true };
        if (!config.nativeMedia) throw new AiError('UNSUPPORTED_FILE');
        if (
          source.mime === 'application/pdf' &&
          index.errorCode !== 'PDF_SCAN_REQUIRES_VISION' &&
          renderPage === undefined
            ? !config.pdfLiveVerified
            : !config.imageLiveVerified
        )
          throw new AiError('FILE_NOT_LIVE_VERIFIED');
        if (!source.storageKey || source.bytes > 8_000_000)
          throw new AiError('INPUT_TOO_LARGE');
        return { index, source };
      });
      if ('textOnly' in checked) {
        result.push({
          index: checked.index,
          mime: checked.source.mime,
          bytes: Buffer.alloc(0),
        });
        continue;
      }
      const bytes = await this.readBinary(
        checked.source.storageKey!,
        checked.source.checksum!,
        signal,
      );
      const textSource = {
        organizationId: actor.organizationId,
        projectId,
        roomId: checked.index.roomId,
        sourceId:
          checked.index.chatFileId ??
          checked.index.releaseId ??
          checked.index.fileAssetId ??
          checked.index.projectFileAssetId!,
        version: checked.index.version,
        text: '',
      };
      const rendered =
        checked.source.mime === 'application/pdf' &&
        (checked.index.errorCode === 'PDF_SCAN_REQUIRES_VISION' ||
          renderPage !== undefined)
          ? await scanPages(
              textSource,
              checked.source.name,
              bytes,
              checked.source.checksum!,
              signal,
              renderPage,
            )
          : undefined;
      const native =
        rendered ??
        (await nativeSource(
          textSource,
          checked.source.name,
          checked.source.mime,
          bytes,
          checked.source.checksum!,
        ));
      const index = await this.authorized(actor, projectId, async (tx) => {
        this.selectedConfig(answer);
        const freshIndex = await tx.chatAiSourceIndex.findUniqueOrThrow({
          where: { id: checked.index.id },
        });
        if (freshIndex.version !== checked.index.version)
          throw new AiError('SOURCE_UNAVAILABLE');
        await this.checkSource(tx, actor, projectId, freshIndex);
        return tx.chatAiSourceIndex.update({
          where: { id: checked.index.id },
          data: {
            chunks: [
              ...native.chunks,
              ...((freshIndex.chunks ?? []) as unknown as SourceChunk[]).filter(
                (c) => !native.chunks.some((n) => n.handle === c.handle),
              ),
            ] as unknown as Prisma.InputJsonValue,
            checksum: checked.source.checksum,
          },
        });
      });
      if (rendered)
        result.push(
          ...rendered.media.map((page) => ({
            index,
            selectedChunks: rendered.chunks,
            ...page,
          })),
        );
      else result.push({ index, mime: checked.source.mime, bytes });
      if (result.reduce((sum, item) => sum + item.bytes.length, 0) > 8_000_000)
        throw new AiError('INPUT_TOO_LARGE');
    }
    return result;
  }

  private async sourceTool(
    actor: CurrentActor,
    projectId: string,
    answer: ChatAiAnswer,
    grantId: string,
    name: 'search_project_sources' | 'read_project_source',
    input: unknown,
    config: ConfiguredModel,
    signal: AbortSignal,
  ): Promise<ToolOutput> {
    const pin = requestMetadata(answer.usage)!;
    const search =
      name === 'search_project_sources'
        ? toolInputs.search_project_sources.parse(input)
        : null;
    const read =
      name === 'read_project_source'
        ? toolInputs.read_project_source.parse(input)
        : null;
    const media =
      read?.representation === 'image'
        ? await this.mediaContext(
            actor,
            projectId,
            {
              ...answer,
              usage: { request: { ...pin, sourceIds: [read.sourceId] } },
            },
            'ALL',
            signal,
            read.page ?? 1,
          )
        : [];
    if (
      read?.representation === 'image' &&
      !media.some((item) => item.bytes.length)
    )
      throw new AiError('UNSUPPORTED_FILE');
    return this.authorized(actor, projectId, async (tx, currentGrant) => {
      if (currentGrant !== grantId) throw new NotFoundException();
      signal.throwIfAborted();
      const current = await this.ownedAnswer(
        tx,
        actor,
        projectId,
        answer.id,
        grantId,
      );
      if (current.status !== 'RUNNING') throw new NotFoundException();
      const scope = await this.sourceScope(
        tx,
        actor,
        projectId,
        'ALL',
        pin.context,
      );
      const rows = await tx.chatAiSourceIndex.findMany({
        where: {
          AND: [
            scope,
            ...(read
              ? [{ id: read.sourceId }]
              : search?.query
                ? [
                    {
                      OR: [
                        {
                          label: {
                            contains: search.query,
                            mode: 'insensitive' as const,
                          },
                        },
                        {
                          text: {
                            contains: search.query,
                            mode: 'insensitive' as const,
                          },
                        },
                      ],
                    },
                  ]
                : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: read ? 1 : 50,
      });
      const results = [];
      const sources: { handle: string; text: string }[] = [];
      for (const index of rows) {
        try {
          await this.checkSource(tx, actor, projectId, index);
          assertEgress(
            config,
            actor.organizationId,
            projectId,
            pin.dataClassification,
            [index],
          );
        } catch (error) {
          if (
            read ||
            (!this.denied(error) &&
              !(
                error instanceof AiError &&
                error.code === 'EGRESS_POLICY_DENIED'
              ))
          )
            throw error;
          continue;
        }
        const selected = (
          media.length
            ? (media[0]!.selectedChunks ??
              (media[0]!.index.chunks as unknown as SourceChunk[]))
            : (index.chunks as unknown as SourceChunk[])
        )
          .filter(
            (chunk) =>
              !read ||
              (chunk.endLine >= (read.startLine ?? 1) &&
                (read.page === null || chunk.page === read.page)),
          )
          .slice(0, read ? 6 : 1);
        results.push({
          sourceId: index.id,
          label: index.label,
          version: index.version,
          status: index.status,
          provenance: index.provenance,
          coverage: 'Đoạn được chọn, không phải toàn bộ hồ sơ',
          chunks: selected.map((chunk) => ({
            handle: chunk.handle,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            page: chunk.page ?? null,
            text: chunk.text,
          })),
        });
        sources.push(
          ...selected.map((chunk) => ({
            handle: chunk.handle,
            text: `[${index.provenance}; ${index.label}; version ${index.version}; dòng ${chunk.startLine}-${chunk.endLine}]\n${chunk.text}`,
          })),
        );
        const existing = await tx.chatAiAnswerDependency.findFirst({
          where: { answerId: answer.id, sourceIndexId: index.id },
        });
        const handles = [
          ...new Set([
            ...(existing?.handles ?? []),
            ...selected.map((chunk) => chunk.handle),
          ]),
        ];
        if (existing)
          await tx.chatAiAnswerDependency.update({
            where: {
              answerId_sourceIndexId: {
                answerId: answer.id,
                sourceIndexId: index.id,
              },
            },
            data: { handles },
          });
        else
          await tx.chatAiAnswerDependency.create({
            data: {
              organizationId: actor.organizationId,
              projectId,
              answerId: answer.id,
              sourceIndexId: index.id,
              handles,
            },
          });
        if (results.length >= (search?.limit ?? 1)) break;
      }
      if (read && !results.length) throw new NotFoundException();
      const content = JSON.stringify({
        results,
        coverage:
          'Nguồn phù hợp trong dự án hiện hành theo quyền; có giới hạn số nguồn/đoạn.',
      });
      if (Buffer.byteLength(content) > 32000)
        throw new AiError('TOOL_OUTPUT_TOO_LARGE');
      return {
        content,
        sources,
        media: media
          .filter((item) => item.bytes.length)
          .map((item) => ({
            handle:
              item.handle ??
              (item.index.chunks as unknown as SourceChunk[])[0]!.handle,
            mime: item.mime,
            bytes: item.bytes,
          })),
      };
    });
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
          projectName: (
            await tx.project.findUniqueOrThrow({
              where: { id: projectId },
              select: { name: true },
            })
          ).name,
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
    const toolSources: ToolSource[] = [];
    const providerCalls: ProviderCall[] = [];
    const toolPermissions: ToolSource['permissions'] = [];
    let limitedSources = false;
    let retrievalError = false;
    const controller = new AbortController();
    this.running.set(id, controller);
    try {
      if (pin?.mode !== 'GENERAL') {
        try {
          const indexed = await this.index(
            actor,
            projectId,
            pin?.mode === 'UNIFIED' ? 'ALL' : claimed.scope,
            pin?.context,
          );
          retrievalError = indexed.sources.some(
            (source) => source.status === 'ERROR',
          );
        } catch (error) {
          if (
            this.denied(error) ||
            pin?.mode !== 'UNIFIED' ||
            pin.sourceIds.length
          )
            throw error;
          retrievalError = true;
        }
      }
      controller.signal.throwIfAborted();
      const native =
        pin?.mode === 'GENERAL'
          ? []
          : await this.mediaContext(
              actor,
              projectId,
              claimed.answer,
              pin?.mode === 'UNIFIED' ? 'ALL' : claimed.scope,
              controller.signal,
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
            pin?.mode === 'PROJECT' &&
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
                (pin.mode !== 'UNIFIED' && previousPin.mode !== pin.mode) ||
                (pin.mode !== 'UNIFIED' &&
                  previousPin.dataClassification !== pin.dataClassification)
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
                    (c) => c.page && /Nội dung gửi native/.test(c.text),
                  ),
                )
              )
                throw new AiError('UNSUPPORTED_FILE');
              for (const permission of savedToolPermissions(
                previousAnswer.usage,
              ))
                if (!toolPermissions.includes(permission))
                  toolPermissions.push(permission);
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
            pin?.mode === 'UNIFIED' ? 'ALL' : claimed.scope,
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
                !(() => {
                  try {
                    assertEgress(
                      config,
                      actor.organizationId,
                      projectId,
                      pin?.dataClassification,
                      [source],
                    );
                    return true;
                  } catch {
                    return false;
                  }
                })()
              ) {
                limitedSources = true;
                continue;
              }
              readable.push(source);
            } catch (error) {
              if (!this.denied(error)) throw error;
            }
          }
          let selected = retrieve(
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
            const explicit =
              item.selectedChunks ??
              (item.index.chunks as unknown as SourceChunk[]);
            selected = [
              ...explicit,
              ...selected.filter(
                (chunk) =>
                  !explicit.some((current) => current.handle === chunk.handle),
              ),
            ];
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
          selected = selected.slice(0, 12);
          if (!selected.length && pin?.mode !== 'UNIFIED') {
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
            for (const dependency of priorDependencies.filter(
              (dependency) => dependency.source.id === source.id,
            ))
              for (const handle of dependency.handles)
                if (!handles.includes(handle)) handles.push(handle);
            if (handles.length > 48) throw new AiError('INPUT_TOO_LARGE');
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
          if (
            pin?.toolConfigDigest &&
            readAiConfig().fileDigest !== pin.toolConfigDigest
          )
            throw new AiError('CONFIG_CHANGED');
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
                answer.usage &&
                typeof answer.usage === 'object' &&
                !Array.isArray(answer.usage) &&
                answer.usage.toolActivity
              )
                await tx.chatAiAnswer.update({
                  where: { id },
                  data: {
                    usage: {
                      ...answer.usage,
                      toolActivity: null,
                    } as Prisma.InputJsonObject,
                  },
                });
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
        const webConfig = readAiConfig();
        const web =
          webConfig.web?.enabled &&
          webConfig.web.organizationId === actor.organizationId &&
          webConfig.web.credentialConfigured &&
          webConfig.web.creditsPerDay > 0
            ? { ...webConfig.web, key: webConfig.webKey! }
            : null;
        const publicUrls = new Map<string, string>();
        for (const match of claimed.answer.question.matchAll(
          /https?:\/\/[^\s<>"']+/g,
        )) {
          const url = match[0].replace(/[),.;]+$/, '');
          if (publicUrls.size < 5)
            publicUrls.set(
              'W_' +
                createHash('sha256')
                  .update(id + url)
                  .digest('hex')
                  .slice(0, 24),
              url,
            );
        }
        let webCalls = 0;
        let toolActivity: string | null = null;
        const persistToolSources = async () =>
          this.authorized(actor, projectId, async (tx, grantId) => {
            const answer = await this.ownedAnswer(
              tx,
              actor,
              projectId,
              id,
              grantId,
            );
            if (answer.status !== 'RUNNING' || grantId !== claimed.grantId)
              throw new NotFoundException();
            if (toolSources.length > 12)
              throw new AiError('TOOL_CONTEXT_LIMIT');
            await tx.chatAiAnswer.update({
              where: { id },
              data: {
                usage: {
                  ...(answer.usage &&
                  typeof answer.usage === 'object' &&
                  !Array.isArray(answer.usage)
                    ? answer.usage
                    : {}),
                  request: pin!,
                  toolSources,
                  toolPermissions,
                  toolActivity,
                },
              },
            });
          });
        if (toolPermissions.length) await persistToolSources();
        const execute = async (
          name: ToolName,
          input: unknown,
          key: string,
          signal: AbortSignal,
        ): Promise<ToolOutput> => {
          await beforeAttempt();
          signal.throwIfAborted();
          if (
            pin?.toolConfigDigest &&
            readAiConfig().fileDigest !== pin.toolConfigDigest
          )
            throw new AiError('CONFIG_CHANGED');
          toolActivity =
            name === 'search_web' || name === 'fetch_public_page'
              ? 'Đang tra cứu nguồn công khai'
              : name === 'create_document' || name === 'revise_draft'
                ? 'Đang tạo bản nháp tài liệu'
                : name === 'calculate' || name === 'analyze_table'
                  ? 'Đang tính và đối chiếu dữ liệu'
                  : 'Đang tìm và đọc nguồn dự án';
          await persistToolSources();
          if (name === 'create_document' || name === 'revise_draft') {
            const args = toolInputs[name].parse(input);
            const document = documentInput.parse({
              format: args.format,
              title: args.title,
              blocks: args.blocks,
            });
            const output = (artifact: Prisma.JsonValue): ToolOutput => ({
              content: JSON.stringify({
                artifact,
                provenance: 'AI_DRAFT',
                notice:
                  'Bản nháp riêng tư, chưa phê duyệt/phát hành. Số XLSX là chuỗi chính xác, không công thức.',
              }),
              sources: [],
            });
            const existing = await this.db.chatAiAnswer.findUniqueOrThrow({
              where: { id },
            });
            const metadata = existing.usage as Prisma.JsonObject;
            const priorArtifacts = Array.isArray(metadata.artifacts)
              ? metadata.artifacts
              : [];
            const replay = priorArtifacts.find(
              (item) =>
                item &&
                typeof item === 'object' &&
                !Array.isArray(item) &&
                item.toolKey === key,
            );
            if (replay) return output(replay);
            if (priorArtifacts.length >= 3) throw new AiError('DOCUMENT_LIMIT');
            const read = async (sourceId: string) => {
              await this.sourceTool(
                actor,
                projectId,
                claimed.answer,
                claimed.grantId,
                'read_project_source',
                { sourceId, representation: 'text', startLine: 1, page: null },
                config as ConfiguredModel,
                signal,
              );
              return this.authorized(actor, projectId, async (tx) => {
                const index = await tx.chatAiSourceIndex.findFirst({
                  where: {
                    id: sourceId,
                    organizationId: actor.organizationId,
                    projectId,
                  },
                });
                if (!index) throw new NotFoundException();
                return {
                  index,
                  source: await this.checkSource(tx, actor, projectId, index),
                };
              });
            };
            const predecessor =
              name === 'revise_draft'
                ? await read(toolInputs.revise_draft.parse(input).sourceId)
                : null;
            if (
              predecessor &&
              !predecessor.index.fileAssetId &&
              !predecessor.index.projectFileAssetId &&
              !predecessor.index.chatFileId &&
              !predecessor.index.releaseId
            )
              throw new AiError('DOCUMENT_SOURCE_REQUIRED');
            const imageIds = [
              ...new Set(
                document.blocks.flatMap((block) =>
                  block.kind === 'image' ? [block.sourceId] : [],
                ),
              ),
            ];
            if (imageIds.length > 3) throw new AiError('DOCUMENT_LIMIT');
            const images = [];
            for (const sourceId of imageIds) {
              const checked = await read(sourceId),
                source = checked.source;
              if (
                !source.storageKey ||
                !source.checksum ||
                (source.mime !== 'image/png' && source.mime !== 'image/jpeg')
              )
                throw new AiError('DOCUMENT_IMAGE_UNAVAILABLE');
              images.push({
                sourceId,
                mime: source.mime as 'image/png' | 'image/jpeg',
                bytes: await this.readBinary(
                  source.storageKey,
                  source.checksum,
                  signal,
                ),
              });
            }
            await beforeAttempt();
            signal.throwIfAborted();
            const rendered = await renderDocument(document, images);
            signal.throwIfAborted();
            const diff = predecessor
              ? documentDiff(
                  predecessor.index.text,
                  documentPlainText(document),
                )
              : null;
            const hash = createHash('sha256')
              .update(id + key)
              .digest('hex')
              .slice(0, 32);
            const clientKey = [
              hash.slice(0, 8),
              hash.slice(8, 12),
              hash.slice(12, 16),
              hash.slice(16, 20),
              hash.slice(20),
            ].join('-');
            const filename =
              document.title.replace(/[\\/:*?"<>|]/g, '_') +
              '.' +
              document.format;
            let artifact: Prisma.JsonObject | null = null;
            const saved = await this.files.upload(
              actor,
              {
                entityType: 'ChatAiConversation',
                entityId: claimed.answer.conversationId,
                category: 'AI_DRAFT',
                confidentiality: 'INTERNAL',
              },
              {
                buffer: rendered.bytes,
                size: rendered.bytes.length,
                mimetype: rendered.mime,
                originalname: filename,
              } as Express.Multer.File,
              clientKey,
              {
                answerId: id,
                version: predecessor
                  ? Number(predecessor.index.version.split(':')[0]) + 1
                  : 1,
                verify: async (tx) => {
                  signal.throwIfAborted();
                  const current = await this.ownedAnswer(
                    tx,
                    actor,
                    projectId,
                    id,
                    claimed.grantId,
                  );
                  const grant = await this.access.authority(
                    tx,
                    actor,
                    projectId,
                    'INVOKE',
                  );
                  if (
                    grant.id !== claimed.grantId ||
                    (
                      await this.view(
                        tx,
                        actor,
                        projectId,
                        current,
                        grant.id,
                        new Set([id]),
                      )
                    ).status !== 'RUNNING'
                  )
                    throw new NotFoundException();
                },
                record: async (tx, file) => {
                  signal.throwIfAborted();
                  const current = await tx.chatAiAnswer.findUniqueOrThrow({
                      where: { id },
                    }),
                    usage = current.usage as Prisma.JsonObject;
                  artifact = {
                    toolKey: key,
                    sourceId: file.id,
                    fileAssetId: file.fileAssetId,
                    version: file.version,
                    filename: file.label,
                    sizeBytes: file.sizeBytes,
                    format: document.format,
                    provenance: 'AI_DRAFT',
                    downloadUrl: `/api/v1/project-chat/projects/${projectId}/ai/files/${file.id}/download`,
                    predecessor: predecessor
                      ? {
                          sourceId: predecessor.index.id,
                          version: predecessor.index.version,
                        }
                      : null,
                    diff,
                  };
                  await tx.chatAiAnswer.update({
                    where: { id },
                    data: {
                      usage: {
                        ...usage,
                        artifacts: [
                          ...(Array.isArray(usage.artifacts)
                            ? usage.artifacts
                            : []),
                          artifact,
                        ],
                      } as Prisma.InputJsonObject,
                    },
                  });
                  await tx.auditLog.create({
                    data: {
                      organizationId: actor.organizationId,
                      actorUserId: actor.userId,
                      action: 'AI_DRAFT_CREATED',
                      entityType: 'ChatAiAnswer',
                      entityId: id,
                      metadata: {
                        projectId,
                        fileAssetId: file.fileAssetId,
                        sourceId: file.id,
                        version: file.version,
                        toolKey: key,
                      },
                    },
                  });
                },
              },
            );
            if (!artifact) {
              const current = await this.db.chatAiAnswer.findUniqueOrThrow({
                  where: { id },
                }),
                usage = current.usage as Prisma.JsonObject;
              artifact =
                ((Array.isArray(usage.artifacts) ? usage.artifacts : []).find(
                  (item) =>
                    item &&
                    typeof item === 'object' &&
                    !Array.isArray(item) &&
                    item.sourceId === saved.id,
                ) as Prisma.JsonObject) ?? null;
            }
            if (!artifact) throw new AiError('DOCUMENT_UNAVAILABLE');
            await beforeAttempt();
            signal.throwIfAborted();
            return output(artifact);
          }
          if (name === 'search_web' || name === 'fetch_public_page') {
            let values: { text: string; web: NonNullable<ToolSource['web']> }[];
            if (name === 'search_web') {
              const args = toolInputs.search_web.parse(input);
              if (!web || ++webCalls > web.maxCallsPerRequest)
                throw new AiError('NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET');
              if (
                !web.subjects.some((subject) => subject.id === args.subjectId)
              )
                throw new AiError('PUBLIC_SUBJECT_REQUIRED');
              await this.authorized(actor, projectId, async (tx) => {
                await tx.$queryRaw`WITH quota_lock AS (SELECT pg_advisory_xact_lock(hashtextextended(${`ai-web-quota:${actor.organizationId}`},0))) SELECT TRUE AS locked FROM quota_lock`;
                const since = new Date();
                since.setUTCHours(0, 0, 0, 0);
                if (
                  await tx.auditLog.findFirst({
                    where: {
                      organizationId: actor.organizationId,
                      action: {
                        in: ['AI_WEB_COST_VIOLATION', 'AI_WEB_COST_UNVERIFIED'],
                      },
                      metadata: { path: ['revision'], equals: web.revision },
                    },
                  })
                )
                  throw new AiError('WEB_COST_VIOLATION');
                const spent = await tx.auditLog.count({
                  where: {
                    organizationId: actor.organizationId,
                    action: 'AI_WEB_CREDIT_RESERVED',
                    createdAt: { gte: since },
                  },
                });
                if (spent >= web.creditsPerDay)
                  throw new AiError('WEB_BUDGET_LIMIT');
                await tx.auditLog.create({
                  data: {
                    organizationId: actor.organizationId,
                    actorUserId: actor.userId,
                    action: 'AI_WEB_CREDIT_RESERVED',
                    entityType: 'ChatAiAnswer',
                    entityId: id,
                    metadata: {
                      projectId,
                      toolKey: key,
                      revision: web.revision,
                      subjectId: args.subjectId,
                      topic: args.topic,
                      reservedCredits: 1,
                    },
                  },
                });
              });
              const result = await webSearch(
                web,
                args.subjectId,
                args.topic,
                signal,
                beforeAttempt,
                async (receipt) => {
                  await this.db.auditLog.create({
                    data: {
                      organizationId: actor.organizationId,
                      actorUserId: actor.userId,
                      action:
                        receipt.credits === null
                          ? 'AI_WEB_COST_UNVERIFIED'
                          : receipt.credits > 1
                            ? 'AI_WEB_COST_VIOLATION'
                            : 'AI_WEB_SEARCH_RESULT',
                      entityType: 'ChatAiAnswer',
                      entityId: id,
                      metadata: {
                        projectId,
                        revision: web.revision,
                        subjectId: args.subjectId,
                        query:
                          web.subjects.find(
                            (subject) => subject.id === args.subjectId,
                          )!.query +
                          ' ' +
                          args.topic,
                        requestId: receipt.requestId,
                        credits: receipt.credits,
                      },
                    },
                  });
                },
              );
              values = [];
              for (const item of result.results) {
                try {
                  await publicTarget(item.url, signal);
                } catch {
                  continue;
                }
                const urlId =
                  'W_' +
                  createHash('sha256')
                    .update(id + item.url)
                    .digest('hex')
                    .slice(0, 24);
                publicUrls.set(urlId, item.url);
                values.push({
                  text: `[Snippet tìm kiếm; chưa fetch trang; urlId ${urlId}]\n${item.content.slice(0, 2000)}`,
                  web: {
                    url: item.url,
                    title: item.title,
                    retrievedAt: result.retrievedAt,
                    provider: 'TAVILY',
                    kind: 'SNIPPET',
                    query: result.query,
                    requestId: result.requestId,
                  },
                });
              }
            } else {
              const args = toolInputs.fetch_public_page.parse(input),
                url = publicUrls.get(args.urlId);
              if (!url) throw new AiError('PUBLIC_URL_REQUIRED');
              const result = await fetchPublicPage(url, signal, beforeAttempt);
              values = [
                {
                  text: result.coverage + '\n' + result.text,
                  web: {
                    url: result.url,
                    title: result.title || new URL(result.url).hostname,
                    retrievedAt: result.retrievedAt,
                    provider: 'LOCAL_PUBLIC_FETCH',
                    kind: 'PAGE',
                  },
                },
              ];
            }
            const sources: { handle: string; text: string }[] = [];
            for (const value of values) {
              const handle =
                'T_' +
                createHash('sha256')
                  .update(id + key + value.web.url)
                  .digest('hex')
                  .slice(0, 24);
              const source: ToolSource = {
                handle,
                label: value.web.title.slice(0, 200),
                text: value.text,
                version: createHash('sha256').update(value.text).digest('hex'),
                provenance: 'PUBLIC_WEB',
                permissions: [],
                createdAt: value.web.retrievedAt,
                web: value.web,
              };
              toolSources.push(source);
              sources.push({ handle, text: JSON.stringify(source) });
            }
            await persistToolSources();
            return {
              content: JSON.stringify({
                sources: values.map((value) => value.web),
                publicUrls: [...publicUrls].map(([id, url]) => ({ id, url })),
                coverage:
                  name === 'search_web'
                    ? 'Snippet tìm kiếm; chưa đọc toàn trang.'
                    : 'Trang được chọn; không đọc toàn website.',
              }),
              sources,
            };
          }
          if (
            name === 'calculate' ||
            name === 'read_project_records' ||
            name === 'analyze_table'
          ) {
            let value: unknown;
            let permissions: ToolSource['permissions'] = [];
            if (name === 'calculate')
              value = calculate(toolInputs.calculate.parse(input));
            else if (name === 'analyze_table') {
              const args = toolInputs.analyze_table.parse(input);
              await this.sourceTool(
                actor,
                projectId,
                claimed.answer,
                claimed.grantId,
                'read_project_source',
                {
                  sourceId: args.sourceId,
                  representation: 'text',
                  startLine: 1,
                  page: null,
                },
                config as ConfiguredModel,
                signal,
              );
              const checked = await this.authorized(
                actor,
                projectId,
                async (tx) => {
                  const index = await tx.chatAiSourceIndex.findFirst({
                    where: {
                      AND: [
                        await this.sourceScope(
                          tx,
                          actor,
                          projectId,
                          'ALL',
                          pin?.context,
                        ),
                        { id: args.sourceId },
                      ],
                    },
                  });
                  if (!index) throw new NotFoundException();
                  return this.checkSource(tx, actor, projectId, index);
                },
              );
              if (
                checked.mime !== xlsxMime ||
                !checked.storageKey ||
                !checked.checksum
              )
                throw new AiError('UNSUPPORTED_FILE');
              value = await analyzeTable(
                await this.readBinary(
                  checked.storageKey,
                  checked.checksum,
                  signal,
                ),
                args.sheet,
                args.range,
              );
            } else {
              const args = toolInputs.read_project_records.parse(input);
              const fresh = await this.authorized(actor, projectId, (tx) =>
                this.access.freshActor(tx, actor),
              );
              const data = await this.stageTwo.get(fresh, projectId);
              if (
                !data.permittedCommands.viewPlan ||
                (args.includeFinancial &&
                  !data.permittedCommands.viewAllocatedBudget)
              )
                throw new NotFoundException();
              permissions = [
                'project.read',
                'task.read',
                ...(args.includeFinancial ? ['estimate.read' as const] : []),
              ];
              const rows = data.plan.map(({ allocatedBudget, ...row }) => ({
                ...row,
                ...(args.includeFinancial
                  ? { allocatedBudget: allocatedBudget ?? null }
                  : {}),
              }));
              const amounts = rows.flatMap((row) =>
                'allocatedBudget' in row &&
                typeof row.allocatedBudget === 'string'
                  ? [row.allocatedBudget]
                  : [],
              );
              const total = decimalTotal(amounts);
              value = {
                view: args.view,
                coverage:
                  'Toàn bộ kế hoạch giai đoạn 2 của dự án hiện hành tại thời điểm đọc; không bao gồm nhóm nghiệp vụ khác.',
                count: rows.length,
                rows,
                ...(args.includeFinancial
                  ? {
                      knownAllocatedBudget: total,
                      missingBudgetCount: rows.length - amounts.length,
                      totalAllocatedBudget:
                        amounts.length === rows.length ? total : null,
                    }
                  : {}),
              };
            }
            const text = JSON.stringify(value);
            if (Buffer.byteLength(text) > 32000)
              throw new AiError('TOOL_OUTPUT_TOO_LARGE');
            const handle =
              'T_' +
              createHash('sha256')
                .update(id + key)
                .digest('hex')
                .slice(0, 24);
            const source: ToolSource = {
              handle,
              text,
              label:
                name === 'calculate'
                  ? 'Kết quả tính Decimal'
                  : name === 'analyze_table'
                    ? `Phân tích XLSX · ${toolInputs.analyze_table.parse(input).sheet}!${toolInputs.analyze_table.parse(input).range}`
                    : 'Kế hoạch giai đoạn 2 · ảnh chụp dữ liệu',
              version: key,
              provenance: 'AI_DRAFT',
              permissions,
              createdAt: new Date().toISOString(),
            };
            if (!toolSources.some((existing) => existing.handle === handle))
              toolSources.push(source);
            for (const permission of permissions)
              if (!toolPermissions.includes(permission))
                toolPermissions.push(permission);
            await persistToolSources();
            return { content: text, sources: [{ handle, text }] };
          }
          if (
            name === 'search_project_sources' ||
            name === 'read_project_source'
          )
            return this.sourceTool(
              actor,
              projectId,
              claimed.answer,
              claimed.grantId,
              name,
              input,
              config as ConfiguredModel,
              signal,
            );
          throw new AiError('TOOL_NOT_AVAILABLE');
        };
        const result = await answerFromProvider(
          config!,
          claimed.answer.question,
          context,
          controller.signal,
          {
            beforeAttempt,
            receipt: (call) => providerCalls.push(call),
            ...(pin?.toolRevision &&
            pin.mode === 'UNIFIED' &&
            pin.provider === 'openrouter'
              ? {
                  tools: {
                    definitions: toolDefinitions([
                      'search_project_sources',
                      'read_project_source',
                      'read_project_records',
                      'calculate',
                      'analyze_table',
                      'create_document',
                      'revise_draft',
                      ...(web ? ['search_web' as const] : []),
                      ...(web || publicUrls.size
                        ? ['fetch_public_page' as const]
                        : []),
                    ]),
                    execute,
                  },
                }
              : {}),
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
            ...(pin?.mode === 'UNIFIED' && {
              projectContext: {
                id: projectId,
                name: claimed.projectName,
                conversationId: claimed.answer.conversationId,
                group: claimed.scope,
                at: new Date().toISOString(),
                publicSubjects:
                  web?.subjects.map(({ id, label }) => ({ id, label })) ?? [],
                publicUrls: [...publicUrls].map(([id, url]) => ({ id, url })),
                webSearchStatus: web
                  ? 'AVAILABLE'
                  : 'NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET',
                sourceState: retrievalError
                  ? ('ERROR' as const)
                  : context.length
                    ? ('AVAILABLE' as const)
                    : ('EMPTY' as const),
              },
            }),
            media: native
              .filter((item) => item.bytes.length)
              .map((item) => ({
                handle:
                  item.handle ??
                  (item.index.chunks as unknown as SourceChunk[])[0]!.handle,
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
                    ...(answer.usage &&
                    typeof answer.usage === 'object' &&
                    !Array.isArray(answer.usage)
                      ? { artifacts: answer.usage.artifacts ?? [] }
                      : {}),
                    request: pin,
                    toolSources,
                    toolPermissions,
                    ...('providerCalls' in result
                      ? { providerCalls: result.providerCalls }
                      : {}),
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
      try {
        if (providerCalls.length)
          await this.db.$transaction(async (tx) => {
            const current = await tx.chatAiAnswer.findFirst({
              where: {
                id,
                organizationId: actor.organizationId,
                projectId,
                ownerId: actor.userId,
              },
              select: { usage: true },
            });
            if (!current) return;
            const usage =
              current.usage &&
              typeof current.usage === 'object' &&
              !Array.isArray(current.usage)
                ? current.usage
                : {};
            await tx.chatAiAnswer.update({
              where: { id },
              data: {
                usage: JSON.parse(
                  JSON.stringify({ ...usage, providerCalls }),
                ) as Prisma.InputJsonObject,
              },
            });
          });
      } finally {
        this.running.delete(id);
      }
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
