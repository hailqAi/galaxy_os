import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatAiAnswer, Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CurrentActor } from '../access-control/current-actor';
import { FileStorage } from '../files/file-storage';
import { PrismaService } from '../prisma.service';
import { ProjectAiService } from '../project-chat/project-ai.service';
import { contextPage } from '../project-chat/project-ai-workspace.service';
import {
  requestedOutputs,
  referencesPreviousFile,
} from '../project-chat/ai-execution';
import { readTextPage, hasTextBytes } from './mcp.text';
import { ChatAiQuestionDto } from '../project-chat/project-chat.dto';
import { memorySourceSchema } from '../project-chat/project-chat.dto';
import { memoryDigest } from '../project-chat/project-ai-memory.service';
import { McpOAuth, McpPrincipal, mcpDigest } from './mcp.oauth';
import {
  MCP_EVENT,
  McpJob,
  jobMetadata,
  progressInput,
  mcpArtifactOutput,
} from './mcp.schemas';

export const createJobInput = z
  .object({
    clientKey: z.string().uuid(),
    question: z
      .string()
      .min(1)
      .max(120000)
      .refine((text) => Boolean(text.trim())),
    sourceIds: z
      .array(z.string().uuid())
      .default([])
      .refine((ids) => new Set(ids).size === ids.length),
    outputFormat: z
      .enum(['xlsx', 'docx', 'pdf', 'pptx', 'png', 'jpeg', 'mp4', 'txt', 'zip'])
      .optional(),
    roomId: z.string().uuid().optional(),
    productLineId: z.string().uuid().optional(),
    fileAssetId: z.string().uuid().optional(),
    fileVersion: z.number().int().positive().optional(),
  })
  .strict();
const inputPins = z.array(
  z
    .object({
      source_id: z.string(),
      version: z.string(),
      checksum: z.string().nullable(),
    })
    .passthrough(),
);
export type CheckedMcpJob = {
  tx: Prisma.TransactionClient;
  answer: ChatAiAnswer;
  metadata: McpJob;
  grantId: string;
};

@Injectable()
export class McpJobsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectAiService) private readonly ai: ProjectAiService,
    @Inject(McpOAuth) private readonly oauth: McpOAuth,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}
  private async waitingState(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
  ) {
    const grants = await tx.mcpGrant.findMany({
      where: {
        kind: 'AUTHORIZATION',
        ownerId: actor.userId,
        organizationId: actor.organizationId,
        membershipId: actor.organizationMembershipId,
        revokedAt: null,
        scopes: { has: 'galaxy.events' },
      },
      select: { id: true },
    });
    const count = await tx.mcpSubscription.count({
      where: {
        ownerId: actor.userId,
        organizationId: actor.organizationId,
        membershipId: actor.organizationMembershipId,
        authorizationId: { in: grants.map((grant) => grant.id) },
        revokedAt: null,
        AND: [
          {
            OR: [
              { refreshBefore: null },
              { refreshBefore: { gt: new Date() } },
            ],
          },
        ],
        OR: [
          { arguments: { equals: {} } },
          { arguments: { path: ['project_id'], equals: projectId } },
        ],
      },
    });
    return count
      ? ('WAITING_NOTIFICATION' as const)
      : ('WAITING_SUBSCRIPTION' as const);
  }
  async create(
    actor: CurrentActor,
    projectId: string,
    conversationId: string,
    value: unknown,
    transaction?: Prisma.TransactionClient,
    requestId?: string,
  ) {
    const parsed = createJobInput.safeParse(value);
    if (!parsed.success) throw new BadRequestException('MCP_JOB_INPUT_INVALID');
    const input = parsed.data,
      payloadHash = mcpDigest(
        JSON.stringify([projectId, conversationId, input, 'MCP_EVENTS']),
      );
    return this.ai.workspaceTransaction(
      actor,
      projectId,
      async (tx, grantId) => {
        const existing = await tx.chatAiAnswer.findUnique({
          where: {
            conversationId_clientKey: {
              conversationId,
              clientKey: input.clientKey,
            },
          },
        });
        if (existing) {
          if (
            existing.organizationId !== actor.organizationId ||
            existing.projectId !== projectId ||
            existing.ownerId !== actor.userId ||
            existing.invokeGrantId !== grantId ||
            existing.payloadHash !== payloadHash ||
            !jobMetadata(existing.usage)
          )
            throw new ConflictException('MCP_JOB_IDEMPOTENCY_CONFLICT');
          await this.ai.workspaceCheck(tx, actor, projectId, existing, grantId);
          return {
            id: existing.id,
            status: existing.status,
            route: 'MCP_EVENTS',
            state: jobMetadata(existing.usage)!.state,
          };
        }
        const contextStartedAt = new Date().toISOString(),
          contextTick = performance.now();
        const followup =
          !input.sourceIds.length && referencesPreviousFile(input.question);
        const fileMention =
          /\b(?:file|tep|workbook|bang tinh)\s+(excel|xlsx|pdf|word|docx|pptx|png|jpg|jpeg|mp4)\b[^.!?\n]*\b(?:vua|gan nhat|truoc|just|last|previous)\b/i.exec(
            input.question
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .toLowerCase(),
          );
        const sourceFormat = fileMention
          ? (({ excel: 'xlsx', word: 'docx' } as Record<string, string>)[
              fileMention[1]!
            ] ?? fileMention[1]!.toLowerCase())
          : undefined;
        const wantedFormats = sourceFormat
          ? ['jpg', 'jpeg'].includes(sourceFormat)
            ? ['jpg', 'jpeg']
            : [sourceFormat]
          : [];
        const previous = followup
          ? ((
              await tx.$queryRaw<ChatAiAnswer[]>(Prisma.sql`
              SELECT answer.* FROM "ChatAiAnswer" answer
              WHERE answer."organizationId" = ${actor.organizationId}::uuid
                AND answer."projectId" = ${projectId}::uuid
                AND answer."ownerId" = ${actor.userId}::uuid
                AND answer."conversationId" = ${conversationId}::uuid
                AND answer.status = 'COMPLETED'
                AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(answer.usage->'artifacts') file
                  WHERE ${wantedFormats.length ? Prisma.sql`file->>'format' IN (${Prisma.join(wantedFormats)})` : Prisma.sql`TRUE`}
                    AND (NOT (answer.usage ? 'mcp') OR EXISTS (
                      SELECT 1 FROM "McpArtifact" receipt
                      WHERE receipt."answerId" = answer.id
                        AND receipt."submissionId" = answer.usage #>> '{mcp,submissionId}'
                        AND receipt.state = 'AVAILABLE'
                        AND receipt."sourceId"::text = file->>'sourceId'
                    ))
                )
              ORDER BY answer."completedAt" DESC NULLS LAST, answer."createdAt" DESC, answer.id DESC
              LIMIT 1
            `)
            )[0] ?? null)
          : null;
        if (followup) {
          const [failed] = await tx.$queryRaw<{ updatedAt: Date }[]>(Prisma.sql`
            SELECT artifact."updatedAt"
            FROM "McpArtifact" artifact
            JOIN "ChatAiAnswer" answer ON answer.id = artifact."answerId"
            WHERE answer."organizationId" = ${actor.organizationId}::uuid
              AND answer."projectId" = ${projectId}::uuid
              AND answer."ownerId" = ${actor.userId}::uuid
              AND answer."conversationId" = ${conversationId}::uuid
              AND artifact.state <> 'AVAILABLE'
              AND artifact."submissionId" = answer.usage #>> '{mcp,submissionId}'
              ${
                wantedFormats.length
                  ? Prisma.sql`AND (${Prisma.join(
                      wantedFormats.map(
                        (format) =>
                          Prisma.sql`LOWER(artifact.filename) LIKE ${'%.' + format}`,
                      ),
                      ' OR ',
                    )})`
                  : Prisma.empty
              }
            ORDER BY artifact."updatedAt" DESC, artifact.id DESC
            LIMIT 1
          `);
          if (
            !previous ||
            (failed &&
              failed.updatedAt > (previous.completedAt ?? previous.createdAt))
          )
            throw new ConflictException('MCP_PREVIOUS_ARTIFACT_UNAVAILABLE');
        }
        const currentReceipts =
          previous && jobMetadata(previous.usage)
            ? await tx.mcpArtifact.findMany({
                where: {
                  answerId: previous.id,
                  submissionId: jobMetadata(previous.usage)!.submissionId ?? '',
                  state: 'AVAILABLE',
                },
                select: { sourceId: true },
              })
            : null;
        const baseArtifacts = z
          .array(
            z
              .object({
                sourceId: z.string().uuid(),
                version: z.string(),
                format: z.string(),
              })
              .passthrough(),
          )
          .parse((previous?.usage as Prisma.JsonObject | null)?.artifacts ?? [])
          .filter(
            (file) =>
              (!wantedFormats.length || wantedFormats.includes(file.format)) &&
              (!currentReceipts ||
                currentReceipts.some(
                  (receipt) => receipt.sourceId === file.sourceId,
                )),
          );
        if (followup && baseArtifacts.length !== 1)
          throw new ConflictException('MCP_PREVIOUS_ARTIFACT_AMBIGUOUS');
        const sourceIds = input.sourceIds.length
          ? input.sourceIds
          : baseArtifacts.map((file) => file.sourceId);
        const prepared = await this.ai.workspacePrepare(
          tx,
          actor,
          projectId,
          conversationId,
          { ...input, sourceIds } as ChatAiQuestionDto,
          grantId,
          true,
        );
        const contextDurationMs = performance.now() - contextTick;
        for (const base of baseArtifacts)
          if (
            !prepared.selected.some(
              (file) =>
                file.index.id === base.sourceId &&
                file.index.version === base.version,
            )
          )
            throw new ConflictException('MCP_ARTIFACT_BASE_VERSION_CHANGED');
        const answer = await tx.chatAiAnswer.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            ownerId: actor.userId,
            conversationId,
            invokeGrantId: grantId,
            clientKey: input.clientKey,
            payloadHash,
            question: input.question,
            status: 'RUNNING',
          },
        });
        for (const selected of prepared.selected)
          await tx.chatAiAnswerDependency.create({
            data: {
              organizationId: actor.organizationId,
              projectId,
              answerId: answer.id,
              sourceIndexId: selected.index.id,
              handles: [selected.chunks[0]!.handle],
            },
          });
        const metadata: McpJob = {
          version: 1,
          state: await this.waitingState(tx, actor, projectId),
          originalMessageId: answer.id,
          actor: {
            userId: actor.userId,
            organizationId: actor.organizationId,
            organizationMembershipId: actor.organizationMembershipId,
          },
          context: prepared.contextSnapshot,
          sourceIds,
          requestedOutputs: [
            ...new Set([
              ...(input.outputFormat ? [input.outputFormat] : []),
              ...requestedOutputs(input.question),
              ...(/\b(?:sửa|sua|chỉnh|chinh|cập nhật|cap nhat|edit|update)\b/i.test(
                input.question,
              )
                ? baseArtifacts.map((file) => file.format)
                : []),
            ]),
          ],
          createdAt: answer.createdAt.toISOString(),
          notificationGeneration: 0,
        };
        metadata.context = {
          ...prepared.contextSnapshot,
          baseArtifacts,
          selectedText: prepared.selected
            .filter(({ original }) => original.text !== null)
            .map(({ index, original }) => ({
              source_id: index.id,
              version: index.version,
              source_type: index.messageId ? 'CHAT_MESSAGE' : 'FILE_INDEX',
              captured_at: answer.createdAt.toISOString(),
              content: original.text,
            })),
          inputFiles: prepared.selected.map(({ index, original }) => ({
            source_id: index.id,
            version: index.version,
            filename: original.name,
            mime_type: original.mime,
            size_bytes: original.bytes,
            checksum: original.checksum,
          })),
        };
        await tx.chatAiAnswer.update({
          where: { id: answer.id },
          data: {
            usage: {
              mcp: metadata as unknown as Prisma.InputJsonValue,
              workspaceSources:
                prepared.sourceRefs as unknown as Prisma.InputJsonValue,
              toolPermissions: prepared.sourcePermissions,
            },
          },
        });
        const event = await tx.mcpOutbox.create({
          data: { answerId: answer.id, name: MCP_EVENT },
        });
        const saved = await tx.chatAiAnswer.findUniqueOrThrow({
          where: { id: answer.id },
        });
        await tx.chatAiAnswer.update({
          where: { id: answer.id },
          data: {
            usage: {
              ...(saved.usage as Prisma.InputJsonObject),
              executionTrace: {
                request_id: requestId ?? null,
                message_id: answer.id,
                job_id: answer.id,
                attempt: 1,
                context_started_at: contextStartedAt,
                context_duration_ms: contextDurationMs,
                created_at: answer.createdAt.toISOString(),
                event_id: event.id,
                event_created_at: event.createdAt.toISOString(),
              },
            },
          },
        });
        return {
          id: answer.id,
          status: answer.status,
          route: 'MCP_EVENTS',
          state: metadata.state,
        };
      },
      transaction,
    );
  }
  async checked<T>(
    principal: McpPrincipal,
    id: string,
    work: (checked: CheckedMcpJob) => Promise<T>,
    transaction?: Prisma.TransactionClient,
    expectedAttempt?: number,
  ): Promise<T> {
    if (!transaction) await this.oauth.principal(principal.authorizationId);
    const row = await (transaction ?? this.db).chatAiAnswer.findFirst({
      where: {
        id,
        organizationId: principal.actor.organizationId,
        ownerId: principal.actor.userId,
      },
    });
    if (!row) throw new NotFoundException('MCP_JOB_NOT_FOUND');
    return this.ai.workspaceTransaction(
      principal.actor,
      row.projectId,
      async (tx, grantId) => {
        const answer = await tx.chatAiAnswer.findFirst({
          where: {
            id,
            organizationId: principal.actor.organizationId,
            projectId: row.projectId,
            ownerId: principal.actor.userId,
          },
        });
        const metadata = jobMetadata(answer?.usage);
        if (
          !answer ||
          !metadata ||
          metadata.originalMessageId !== answer.id ||
          metadata.actor.userId !== answer.ownerId ||
          metadata.actor.organizationId !== answer.organizationId ||
          metadata.actor.organizationMembershipId !==
            principal.actor.organizationMembershipId
        )
          throw new NotFoundException('MCP_JOB_NOT_FOUND');
        await this.ai.workspaceCheck(
          tx,
          principal.actor,
          answer.projectId,
          answer,
          grantId,
        );
        if (
          expectedAttempt !== undefined &&
          expectedAttempt !== metadata.notificationGeneration + 1
        )
          throw new ConflictException('MCP_JOB_ATTEMPT_SUPERSEDED');
        return work({ tx, answer, metadata, grantId });
      },
      transaction,
    );
  }
  save(
    tx: Prisma.TransactionClient,
    answer: ChatAiAnswer,
    metadata: McpJob,
    data: Prisma.ChatAiAnswerUpdateInput = {},
  ) {
    return tx.chatAiAnswer.update({
      where: { id: answer.id },
      data: {
        ...data,
        usage: {
          ...(answer.usage as Prisma.InputJsonObject),
          executionTrace: {
            ...(((answer.usage as Prisma.InputJsonObject)
              ?.executionTrace as Prisma.InputJsonObject) ?? {}),
            attempt: metadata.notificationGeneration + 1,
            ...(jobMetadata(answer.usage)?.state !== metadata.state
              ? {
                  phase_started_at: new Date().toISOString(),
                  phase: metadata.state,
                }
              : {}),
          },
          mcp: {
            ...metadata,
            requestedOutputs: [
              ...new Set([
                ...metadata.requestedOutputs,
                ...requestedOutputs(answer.question),
              ]),
            ],
            updatedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      },
    });
  }
  private async retryEvent(
    tx: Prisma.TransactionClient,
    id: string,
    generation: number,
  ) {
    const event = await tx.mcpOutbox.create({
      data: { answerId: id, generation, name: MCP_EVENT },
    });
    const answer = await tx.chatAiAnswer.findUniqueOrThrow({ where: { id } });
    const usage = answer.usage as Prisma.InputJsonObject;
    await tx.chatAiAnswer.update({
      where: { id },
      data: {
        usage: {
          ...usage,
          executionTrace: {
            ...(usage.executionTrace as Prisma.InputJsonObject),
            attempt: generation + 1,
            event_id: event.id,
            event_created_at: event.createdAt.toISOString(),
            first_answer_received_at: null,
          },
        },
      },
    });
  }
  async list(
    principal: McpPrincipal,
    input: { projectId?: string; cursor?: string; limit: number },
  ) {
    const rows = await this.db.chatAiAnswer.findMany({
      where: {
        organizationId: principal.actor.organizationId,
        ownerId: principal.actor.userId,
        projectId: input.projectId,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        usage: { path: ['mcp', 'version'], equals: 1 },
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      select: { id: true },
    });
    const items = [];
    for (const row of rows.slice(0, input.limit)) {
      try {
        items.push(
          await this.checked(
            principal,
            row.id,
            async ({ answer, metadata }) => ({
              job_id: answer.id,
              project_id: answer.projectId,
              thread_id: answer.conversationId,
              question: answer.question,
              attempt: metadata.notificationGeneration + 1,
              state: metadata.state,
              progress: metadata.progress ?? null,
              error_code: metadata.errorCode ?? null,
              created_at: answer.createdAt.toISOString(),
              updated_at: metadata.updatedAt ?? metadata.createdAt,
            }),
          ),
        );
      } catch (error) {
        if (
          !(error instanceof ForbiddenException) &&
          !(error instanceof NotFoundException)
        )
          throw error;
      }
    }
    return {
      items,
      next_cursor: rows.length > input.limit ? rows[input.limit - 1]!.id : null,
      queried_at: new Date().toISOString(),
      scope: 'AUTHORIZED_OWN_JOBS',
    };
  }
  get(principal: McpPrincipal, id: string) {
    return this.checked(principal, id, async ({ tx, answer, metadata }) => ({
      job_id: answer.id,
      attempt: metadata.notificationGeneration + 1,
      organization_id: answer.organizationId,
      project_id: answer.projectId,
      thread_id: answer.conversationId,
      source_message_id: answer.id,
      requested_by: answer.ownerId,
      question: answer.question,
      clarifications: metadata.context.clarifications ?? [],
      execution_trace:
        (answer.usage as Prisma.JsonObject).executionTrace ?? null,
      input_files: metadata.context.inputFiles ?? [],
      requested_outputs: [
        ...new Set([
          ...metadata.requestedOutputs,
          ...requestedOutputs(answer.question),
        ]),
      ],
      completion_criteria: [
        'Answer the exact original request.',
        ...[
          ...new Set([
            ...metadata.requestedOutputs,
            ...requestedOutputs(answer.question),
          ]),
        ].map(
          (format) =>
            'Persist a valid downloadable ' +
            format.toUpperCase() +
            ' file in Galaxy.',
        ),
      ],
      state: metadata.state,
      progress: metadata.progress ?? null,
      error_code: metadata.errorCode ?? null,
      created_at: metadata.createdAt,
      provider_started_at: answer.providerStartedAt?.toISOString() ?? null,
      updated_at: metadata.updatedAt ?? metadata.createdAt,
      result: {
        answer: answer.answer,
        artifacts: mcpArtifactOutput
          .array()
          .parse((answer.usage as Prisma.JsonObject).artifacts ?? []),
        files: await tx.mcpArtifact
          .findMany({
            where: { answerId: answer.id },
            select: {
              id: true,
              submissionId: true,
              externalFileId: true,
              state: true,
              filename: true,
              mimeType: true,
              checksum: true,
              fileAssetId: true,
              errorCode: true,
            },
          })
          .then((files) =>
            files.map(({ submissionId, ...file }) => ({
              ...file,
              submission_id: submissionId,
              current:
                submissionId === metadata.submissionId &&
                file.state !== 'SUPERSEDED',
              replaced_by:
                file.state === 'SUPERSEDED'
                  ? (z
                      .record(z.string().uuid(), z.string().uuid())
                      .parse(metadata.context.artifactReplacements ?? {})[
                      file.id
                    ] ?? null)
                  : null,
            })),
          ),
      },
      result_checkpoint: {
        submission_id:
          metadata.submissionId ??
          `galaxy-${answer.id}${Array.isArray(metadata.context.clarifications) && metadata.context.clarifications.length ? '-' + (metadata.notificationGeneration + 1) : ''}`,
        saved_text_sequences: metadata.submissionId
          ? (
              await tx.mcpResultPart.findMany({
                where: {
                  answerId: answer.id,
                  submissionId: metadata.submissionId,
                },
                select: { sequence: true },
                orderBy: { sequence: 'asc' },
              })
            ).map(({ sequence }) => sequence)
          : [],
      },
    }));
  }
  context(principal: McpPrincipal, id: string, offset = 0) {
    return this.checked(principal, id, async ({ metadata }) => ({
      job_id: id,
      ...contextPage(JSON.stringify(metadata.context), offset),
      snapshot_at: metadata.createdAt,
      authority: 'WORKING_DATA_ONLY',
    }));
  }
  private async source(
    { tx, answer, metadata, grantId }: CheckedMcpJob,
    principal: McpPrincipal,
    sourceId: string,
    version: string,
  ) {
    const pin = inputPins
      .parse(metadata.context.inputFiles)
      .find((file) => file.source_id === sourceId);
    if (
      !metadata.sourceIds.includes(sourceId) ||
      !pin ||
      pin.version !== version
    )
      throw new NotFoundException();
    const { index, original } = await this.ai.mcpSource(
      tx,
      principal.actor,
      answer.projectId,
      answer,
      grantId,
      sourceId,
    );
    if (
      index.version !== version ||
      original.checksum !== pin.checksum ||
      !original.storageKey
    )
      throw new NotFoundException();
    return original;
  }
  inputFile(
    principal: McpPrincipal,
    id: string,
    sourceId: string,
    version: string,
    textPage = { offset: 0, limit: 8192 },
  ) {
    return this.checked(principal, id, async (checked) => {
      const original = await this.source(checked, principal, sourceId, version),
        ticket = randomBytes(32).toString('base64url'),
        expiresAt = new Date(Date.now() + 600000);
      let text: Awaited<ReturnType<typeof readTextPage>> | undefined,
        textError: string | undefined;
      if (hasTextBytes(original.mime) && original.storageKey) {
        try {
          text = await readTextPage(
            await this.storage.stream(original.storageKey, textPage.offset),
            textPage.offset,
            textPage.limit,
          );
        } catch {
          textError = 'MCP_TEXT_ENCODING_UNSUPPORTED';
        }
      }
      await checked.tx.mcpGrant.create({
        data: {
          kind: 'DOWNLOAD',
          clientId: principal.clientId,
          authorizationId: principal.authorizationId,
          tokenHash: mcpDigest(ticket),
          issuer: this.oauth.origin(),
          resource: this.oauth.resource(),
          scopes: ['galaxy.jobs.read'],
          payload: { job_id: id, source_id: sourceId, version },
          expiresAt,
        },
      });
      return {
        job_id: id,
        source_id: sourceId,
        version,
        file_id: sourceId,
        file_name: original.name,
        mime_type: original.mime,
        size_bytes: original.bytes,
        checksum: original.checksum,
        download_url: this.oauth.origin() + '/mcp/input-file?ticket=' + ticket,
        expires_at: expiresAt.toISOString(),
        ...(text ? { text } : {}),
        ...(textError ? { text_error: textError } : {}),
      };
    });
  }
  async download(ticket: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new NotFoundException();
    const row = await this.db.mcpGrant.findFirst({
      where: {
        tokenHash: mcpDigest(ticket),
        kind: 'DOWNLOAD',
        revokedAt: null,
        issuer: this.oauth.origin(),
        resource: this.oauth.resource(),
        expiresAt: { gt: new Date() },
      },
    });
    if (!row?.authorizationId) throw new NotFoundException();
    const principal = await this.oauth.principal(row.authorizationId);
    if (!principal.scopes.includes('galaxy.jobs.read'))
      throw new NotFoundException();
    const pin = z
      .object({
        job_id: z.string().uuid(),
        source_id: z.string().uuid(),
        version: z.string(),
      })
      .parse(row.payload);
    const original = await this.checked(principal, pin.job_id, (checked) =>
      this.source(checked, principal, pin.source_id, pin.version),
    );
    return {
      ...original,
      stream: await this.storage.stream(original.storageKey!),
    };
  }
  progress(principal: McpPrincipal, value: unknown) {
    const input = progressInput.parse(value);
    return this.checked(
      principal,
      input.job_id,
      async ({ tx, answer, metadata }) => {
        const checksum = mcpDigest(JSON.stringify(input));
        if (['COMPLETED', 'CANCELLED'].includes(metadata.state))
          throw new ConflictException('MCP_JOB_CLOSED');
        const prior = await tx.auditLog.findFirst({
          where: {
            organizationId: answer.organizationId,
            entityType: 'ChatAiAnswer',
            entityId: answer.id,
            action: 'MCP_JOB_PROGRESS',
            AND: [
              {
                metadata: { path: ['operationId'], equals: input.operation_id },
              },
              { metadata: { path: ['attempt'], equals: input.attempt } },
            ],
          },
        });
        if (prior) {
          if ((prior.metadata as Prisma.JsonObject).checksum !== checksum)
            throw new ConflictException('MCP_PROGRESS_CONFLICT');
          return {
            job_id: answer.id,
            state: (prior.metadata as Prisma.JsonObject).state,
            recorded: true,
          };
        }
        await this.save(
          tx,
          answer,
          {
            ...metadata,
            state: input.stage,
            progress: input.message,
            errorCode:
              input.stage === 'ERROR'
                ? (metadata.errorCode ?? 'MCP_PROCESSOR_REPORTED_ERROR')
                : undefined,
          },
          input.stage === 'PROCESSING' && !answer.providerStartedAt
            ? { providerStartedAt: new Date() }
            : {},
        );
        await tx.auditLog.create({
          data: {
            organizationId: answer.organizationId,
            actorUserId: principal.actor.userId,
            action: 'MCP_JOB_PROGRESS',
            entityType: 'ChatAiAnswer',
            entityId: answer.id,
            metadata: {
              operationId: input.operation_id,
              attempt: input.attempt,
              checksum,
              state: input.stage,
            },
          },
        });
        return { job_id: answer.id, state: input.stage, recorded: true };
      },
      undefined,
      input.attempt,
    );
  }
  change(
    actor: CurrentActor,
    projectId: string,
    id: string,
    action: 'cancel' | 'retry',
  ) {
    return this.ai.workspaceTransaction(
      actor,
      projectId,
      async (tx, grantId) => {
        const answer = await tx.chatAiAnswer.findFirst({
            where: {
              id,
              organizationId: actor.organizationId,
              projectId,
              ownerId: actor.userId,
            },
          }),
          metadata = jobMetadata(answer?.usage);
        if (!answer || !metadata) throw new NotFoundException();
        await this.ai.workspaceCheck(
          tx,
          actor,
          projectId,
          answer,
          grantId,
          undefined,
          { allowChangedMcpSourceVersions: action === 'cancel' },
        );
        if (metadata.state === 'COMPLETED')
          return { id, state: metadata.state };
        const next = {
          ...metadata,
          state:
            action === 'cancel'
              ? ('CANCELLED' as const)
              : await this.waitingState(tx, actor, projectId),
          errorCode: undefined,
          progress: undefined,
          context:
            action === 'retry'
              ? {
                  ...metadata.context,
                  artifactRecovery: {
                    submissionId: metadata.submissionId ?? null,
                    instructions:
                      'Read current receipts. Preserve the generated files and complete text. Retry only failed file imports; obtain fresh native references if expired. Use artifact_id with the existing receipt id when file_id changes. If several failed receipts explicitly refer to the same generated file, supply their ids as supersede_failed_artifact_ids with that artifact_id; replacement takes effect only after bytes are saved. Redo the conversion only if its generated file is no longer available.',
                  },
                }
              : metadata.context,
          notificationGeneration:
            metadata.notificationGeneration + (action === 'retry' ? 1 : 0),
        };
        await this.save(tx, answer, next, {
          status: action === 'cancel' ? 'CANCELLED' : 'RUNNING',
          errorCode: null,
          completedAt: action === 'cancel' ? new Date() : null,
          ...(action === 'retry' ? { providerStartedAt: null } : {}),
        });
        if (action === 'retry') {
          await tx.mcpDelivery.updateMany({
            where: {
              event: {
                answerId: id,
                generation: { lt: next.notificationGeneration },
              },
              state: { in: ['PENDING', 'DELIVERING'] },
            },
            data: {
              state: 'CANCELLED',
              leaseToken: null,
              leaseUntil: null,
              errorCode: 'MCP_EVENT_SUPERSEDED',
            },
          });
          await this.retryEvent(tx, id, next.notificationGeneration);
        }
        return {
          id,
          state: next.state,
          attempt: next.notificationGeneration + 1,
        };
      },
    );
  }
  async clarify(
    actor: CurrentActor,
    projectId: string,
    id: string,
    value: unknown,
  ) {
    const parsed = z
      .object({
        operation_id: z.string().uuid(),
        attempt: z.number().int().positive(),
        content: z
          .string()
          .min(1)
          .max(120000)
          .refine((v) => Boolean(v.trim()) && !v.includes('\0')),
      })
      .strict()
      .safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('MCP_CLARIFICATION_INVALID');
    const input = parsed.data,
      checksum = mcpDigest(JSON.stringify([id, input]));
    return this.ai.workspaceTransaction(
      actor,
      projectId,
      async (tx, grantId) => {
        const answer = await tx.chatAiAnswer.findFirst({
            where: {
              id,
              organizationId: actor.organizationId,
              projectId,
              ownerId: actor.userId,
            },
          }),
          metadata = jobMetadata(answer?.usage);
        if (!answer || !metadata)
          throw new NotFoundException('MCP_JOB_NOT_FOUND');
        await this.ai.workspaceCheck(
          tx,
          actor,
          projectId,
          answer,
          grantId,
          undefined,
          { refreshMcpMemory: true },
        );
        const prior = await tx.activity.findFirst({
          where: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            entityType: 'ChatAiAnswer',
            entityId: id,
            event: 'MCP_JOB_CLARIFICATION',
            metadata: { path: ['operation_id'], equals: input.operation_id },
          },
        });
        if (prior) {
          const receipt = prior.metadata as Prisma.JsonObject;
          if (receipt.checksum !== checksum)
            throw new ConflictException('MCP_CLARIFICATION_CONFLICT');
          return { id, attempt: receipt.attempt, state: receipt.state };
        }
        if (
          metadata.state !== 'NEEDS_INPUT' ||
          input.attempt !== metadata.notificationGeneration + 1
        )
          throw new ConflictException('MCP_JOB_ATTEMPT_SUPERSEDED');
        const generation = metadata.notificationGeneration + 1,
          state = await this.waitingState(tx, actor, projectId),
          messageId = randomUUID();
        const refreshed = await this.ai.workspaceMemory(
          tx,
          actor,
          projectId,
          answer.conversationId,
          answer.question,
          grantId,
        );
        const priorRefs = memorySourceSchema
          .array()
          .parse((answer.usage as Prisma.JsonObject).workspaceSources);
        const sourcedNotes = new Set(
          (
            await tx.chatAiMemoryDependency.findMany({
              where: {
                organizationId: actor.organizationId,
                projectId,
                revisionId: {
                  in: priorRefs
                    .filter((ref) => ref.kind === 'MEMORY_REVISION')
                    .map((ref) => ref.id),
                },
              },
              select: { revisionId: true },
            })
          ).map((row) => row.revisionId),
        );
        // Older artifacts keep their original source-backed memory lineage.
        const sourceRefs = [
          ...priorRefs.filter(
            (ref) => ref.kind !== 'MEMORY_REVISION' || sourcedNotes.has(ref.id),
          ),
          ...refreshed.sourceRefs,
        ];
        const updated = await tx.chatAiAnswer.update({
          where: { id },
          data: {
            usage: {
              ...(answer.usage as Prisma.InputJsonObject),
              workspaceSources: [
                ...new Map(
                  sourceRefs.map((ref) => [memoryDigest(ref), ref]),
                ).values(),
              ] as unknown as Prisma.InputJsonValue,
            },
          },
        });
        const clarification = {
          source_message_id: messageId,
          requested_by: actor.userId,
          content: input.content,
          created_at: new Date().toISOString(),
          operation_id: input.operation_id,
          base_attempt: input.attempt,
        };
        const previous = z
          .array(z.record(z.string(), z.unknown()))
          .parse(metadata.context.clarifications ?? []);
        await tx.activity.create({
          data: {
            id: messageId,
            organizationId: actor.organizationId,
            actorId: actor.userId,
            entityType: 'ChatAiAnswer',
            entityId: id,
            event: 'MCP_JOB_CLARIFICATION',
            metadata: {
              ...clarification,
              checksum,
              attempt: generation + 1,
              state,
            },
          },
        });
        await this.save(
          tx,
          updated,
          {
            ...metadata,
            state,
            notificationGeneration: generation,
            context: {
              ...metadata.context,
              memories: refreshed.memories,
              memory_snapshot_at: new Date().toISOString(),
              clarifications: [...previous, clarification],
            },
            submissionId: `galaxy-${id}-${generation + 1}`,
            resultChecksum: undefined,
            progress: undefined,
            errorCode: undefined,
          },
          {
            status: 'RUNNING',
            answer: null,
            errorCode: null,
            completedAt: null,
            providerStartedAt: null,
          },
        );
        await tx.mcpDelivery.updateMany({
          where: {
            event: { answerId: id, generation: { lt: generation } },
            state: { in: ['PENDING', 'DELIVERING'] },
          },
          data: {
            state: 'CANCELLED',
            leaseToken: null,
            leaseUntil: null,
            errorCode: 'MCP_EVENT_SUPERSEDED',
          },
        });
        await this.retryEvent(tx, id, generation);
        return { id, attempt: generation + 1, state };
      },
    );
  }
}
