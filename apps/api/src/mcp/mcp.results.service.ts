import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { readEnvironment } from '../config/env';
import {
  createPrivateWriteStream,
  ensurePrivateDirectory,
  FileStorage,
} from '../files/file-storage';
import {
  assertUploadDiskSpace,
  assertFileCapacity,
  lockOrganizationFileCapacity,
  fileStorageReservationExpiry,
} from '../files/file-quota';
import { safeFilename } from '../files/filename';
import {
  UploadsService,
  validUploadContent,
  uploadTypes,
} from '../uploads/uploads.service';
import { xlsxProcess } from '../project-chat/ai-decoder-sandbox';
import { requestedOutputs } from '../project-chat/ai-execution';
import { CheckedMcpJob, McpJobsService } from './mcp.jobs.service';
import { McpNetwork, decryptMcpSecret, encryptMcpSecret } from './mcp.network';
import { McpPrincipal, mcpDigest } from './mcp.oauth';
import { fileReference, mcpArtifactOutput, resultInput } from './mcp.schemas';
import { artifactFailure, ArtifactStage } from './mcp.artifact-errors';

const formats = Object.fromEntries(
  Object.entries(uploadTypes).map(([extension, type]) => [
    extension.slice(1),
    type.canonical,
  ]),
);
@Injectable()
export class McpResultsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(McpJobsService) private readonly jobs: McpJobsService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(McpNetwork) private readonly network: McpNetwork,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}
  private forAttempt<T>(
    principal: McpPrincipal,
    id: string,
    attempt: number,
    work: (job: CheckedMcpJob) => Promise<T>,
    tx?: Prisma.TransactionClient,
  ) {
    return this.jobs.checked(principal, id, work, tx, attempt);
  }
  private async replaceFailedReferences(
    job: CheckedMcpJob,
    input: z.infer<typeof resultInput>,
    apply: boolean,
  ) {
    const ids = input.supersede_failed_artifact_ids;
    if (!ids) return;
    const { tx, answer, metadata } = job;
    if (metadata.state === 'CANCELLED')
      throw new ConflictException('MCP_JOB_CLOSED');
    const replacements = z
      .record(z.string().uuid(), z.string().uuid())
      .parse(metadata.context.artifactReplacements ?? {});
    const primary = await tx.mcpArtifact.findFirst({
      where: {
        id: input.artifact_id,
        answerId: answer.id,
        submissionId: input.submission_id,
      },
    });
    if (!primary || primary.state === 'SUPERSEDED')
      throw new ConflictException('MCP_ARTIFACT_REPLACEMENT_INVALID');
    if (
      apply &&
      (primary.state !== 'AVAILABLE' ||
        !primary.fileAssetId ||
        !primary.sourceId ||
        !primary.checksum)
    )
      throw new ConflictException('MCP_ARTIFACTS_NOT_READY');
    const failed = await tx.mcpArtifact.findMany({
      where: {
        id: { in: ids },
        answerId: answer.id,
        submissionId: input.submission_id,
      },
    });
    if (
      failed.length !== ids.length ||
      failed.some(
        (receipt) =>
          receipt.fileAssetId ||
          receipt.sourceId ||
          receipt.checksum ||
          (receipt.leaseUntil && receipt.leaseUntil > new Date()) ||
          (receipt.filename &&
            primary.filename &&
            receipt.filename !== primary.filename) ||
          (receipt.mimeType &&
            primary.mimeType &&
            receipt.mimeType !== primary.mimeType) ||
          !(
            receipt.state === 'ERROR' ||
            (receipt.state === 'SUPERSEDED' &&
              replacements[receipt.id] === primary.id)
          ),
      )
    )
      throw new ConflictException('MCP_ARTIFACT_REPLACEMENT_INVALID');
    const pending = failed.filter((receipt) => receipt.state === 'ERROR');
    if (metadata.state === 'COMPLETED' && pending.length)
      throw new ConflictException('MCP_JOB_CLOSED');
    if (!apply || !pending.length) return;
    for (const receipt of pending) replacements[receipt.id] = primary.id;
    await tx.mcpArtifact.updateMany({
      where: {
        id: { in: pending.map((receipt) => receipt.id) },
        state: 'ERROR',
      },
      data: { state: 'SUPERSEDED' },
    });
    await this.jobs.save(tx, answer, {
      ...metadata,
      context: { ...metadata.context, artifactReplacements: replacements },
    });
    await tx.auditLog.create({
      data: {
        organizationId: answer.organizationId,
        actorUserId: answer.ownerId,
        action: 'MCP_FAILED_ARTIFACT_REFERENCES_REPLACED',
        entityType: 'ChatAiAnswer',
        entityId: answer.id,
        metadata: {
          artifactId: primary.id,
          supersededIds: pending.map((receipt) => receipt.id),
          submissionId: input.submission_id,
        },
      },
    });
  }
  async submit(principal: McpPrincipal, value: unknown) {
    const input = resultInput.parse(value);
    await this.forAttempt(
      principal,
      input.job_id,
      input.attempt,
      async (job) => {
        const { tx, answer, metadata } = job;
        if (
          metadata.submissionId &&
          metadata.submissionId !== input.submission_id
        )
          throw new ConflictException('MCP_RESULT_SUBMISSION_CONFLICT');
        if (metadata.state === 'CANCELLED')
          throw new ConflictException('MCP_JOB_CLOSED');
        await this.replaceFailedReferences(job, input, false);
        if (input.artifact_id) {
          const target = await tx.mcpArtifact.findFirst({
            where: {
              id: input.artifact_id,
              answerId: answer.id,
              submissionId: input.submission_id,
            },
          });
          if (!target) throw new NotFoundException('MCP_ARTIFACT_NOT_FOUND');
          if (target.state === 'SUPERSEDED')
            throw new ConflictException('MCP_ARTIFACT_SUPERSEDED');
          const file = input.files![0]!;
          if (
            (file.file_name &&
              target.filename &&
              file.file_name !== target.filename) ||
            (file.mime_type &&
              target.mimeType &&
              file.mime_type !== target.mimeType)
          )
            throw new ConflictException('MCP_ARTIFACT_METADATA_CONFLICT');
        }
        let newText = false;
        if (input.content !== undefined && input.sequence !== undefined) {
          const checksum = mcpDigest(input.content),
            where = {
              answerId_submissionId_sequence: {
                answerId: answer.id,
                submissionId: input.submission_id,
                sequence: input.sequence,
              },
            };
          const existing = await tx.mcpResultPart.findUnique({ where });
          if (existing && existing.checksum !== checksum)
            throw new ConflictException('MCP_RESULT_PART_CONFLICT');
          if (!existing) {
            if (metadata.state === 'COMPLETED')
              throw new ConflictException('MCP_JOB_CLOSED');
            await tx.mcpResultPart.create({
              data: {
                answerId: answer.id,
                submissionId: input.submission_id,
                sequence: input.sequence,
                content: input.content,
                checksum,
              },
            });
            newText = true;
          }
        }
        if (
          metadata.state !== 'COMPLETED' &&
          (newText || input.files?.length)
        ) {
          const trace = (answer.usage as Prisma.JsonObject).executionTrace as
            | Prisma.JsonObject
            | undefined;
          await this.jobs.save(
            tx,
            newText
              ? {
                  ...answer,
                  usage: {
                    ...(answer.usage as Prisma.JsonObject),
                    executionTrace: {
                      ...trace,
                      first_answer_received_at:
                        trace?.first_answer_received_at ??
                        new Date().toISOString(),
                    },
                  },
                }
              : answer,
            {
              ...metadata,
              submissionId: input.submission_id,
              state: input.files?.length
                ? 'RECEIVING_FILES'
                : newText &&
                    [
                      'WAITING_SUBSCRIPTION',
                      'WAITING_NOTIFICATION',
                      'NOTIFIED',
                    ].includes(metadata.state)
                  ? 'PROCESSING'
                  : metadata.state,
            },
            { providerStartedAt: answer.providerStartedAt ?? new Date() },
          );
        }
      },
    );
    for (const file of input.files ?? [])
      await this.importFile(
        principal,
        input.job_id,
        input.attempt,
        input.submission_id,
        file,
        input.artifact_id,
      );
    if (input.supersede_failed_artifact_ids)
      await this.forAttempt(principal, input.job_id, input.attempt, (job) =>
        this.replaceFailedReferences(job, input, true),
      );
    if (!input.finalize)
      return this.forAttempt(
        principal,
        input.job_id,
        input.attempt,
        async ({ tx, answer, metadata }) => ({
          job_id: answer.id,
          submission_id: input.submission_id,
          state: metadata.state,
          saved_files: await tx.mcpArtifact.count({
            where: {
              answerId: answer.id,
              submissionId: input.submission_id,
              state: 'AVAILABLE',
            },
          }),
          files: await tx.mcpArtifact.findMany({
            where: { answerId: answer.id, submissionId: input.submission_id },
            select: {
              id: true,
              state: true,
              filename: true,
              errorCode: true,
              fileAssetId: true,
              checksum: true,
            },
          }),
        }),
      );
    return this.forAttempt(
      principal,
      input.job_id,
      input.attempt,
      async ({ tx, answer, metadata }) => {
        const parts = await tx.mcpResultPart.findMany({
          where: { answerId: answer.id, submissionId: input.submission_id },
          orderBy: { sequence: 'asc' },
        });
        if (
          !parts.length ||
          parts.some((part, index) => part.sequence !== index)
        )
          throw new ConflictException('MCP_RESULT_TEXT_PARTS_MISSING');
        const text = parts.map((part) => part.content).join('');
        if (!text.trim())
          throw new ConflictException('MCP_RESULT_TEXT_REQUIRED');
        const allReceipts = await tx.mcpArtifact.findMany({
          where: { answerId: answer.id, submissionId: input.submission_id },
        });
        const replacements = z
          .record(z.string().uuid(), z.string().uuid())
          .parse(metadata.context.artifactReplacements ?? {});
        for (const receipt of allReceipts.filter(
          (file) => file.state === 'SUPERSEDED',
        ))
          if (
            receipt.fileAssetId ||
            receipt.sourceId ||
            receipt.checksum ||
            !allReceipts.some(
              (primary) =>
                primary.id === replacements[receipt.id] &&
                primary.state === 'AVAILABLE',
            )
          )
            throw new ConflictException('MCP_ARTIFACT_REPLACEMENT_INVALID');
        const receipts = allReceipts.filter(
          (file) => file.state !== 'SUPERSEDED',
        );
        if (
          receipts.some(
            (file) =>
              file.state !== 'AVAILABLE' ||
              !file.fileAssetId ||
              !file.sourceId ||
              !file.checksum,
          )
        )
          throw new ConflictException('MCP_ARTIFACTS_NOT_READY');
        const artifacts = mcpArtifactOutput
          .array()
          .parse((answer.usage as Prisma.JsonObject).artifacts ?? [])
          .filter((artifact) =>
            receipts.some(
              (receipt) =>
                receipt.fileAssetId === artifact.fileAssetId &&
                receipt.sourceId === artifact.sourceId,
            ),
          );
        const missingFormats = [
          ...new Set([
            ...metadata.requestedOutputs,
            ...requestedOutputs(answer.question),
          ]),
        ].filter(
          (format) =>
            !artifacts.some(
              (artifact) =>
                artifact.format === format ||
                (format === 'jpeg' && artifact.format === 'jpg'),
            ),
        );
        if (missingFormats.length)
          throw new ConflictException({
            message: 'MCP_REQUIRED_ARTIFACT_MISSING',
            missing_formats: missingFormats,
          });
        for (const receipt of receipts) {
          const file = await tx.fileAsset.findFirst({
            where: {
              id: receipt.fileAssetId!,
              organizationId: answer.organizationId,
              uploadedById: answer.ownerId,
              checksum: receipt.checksum!,
              deletedAt: null,
            },
          });
          const source = await tx.chatAiSourceIndex.findFirst({
            where: {
              id: receipt.sourceId!,
              organizationId: answer.organizationId,
              projectId: answer.projectId,
              conversationId: answer.conversationId,
              ownerId: answer.ownerId,
              fileAssetId: receipt.fileAssetId,
            },
          });
          if (
            !file ||
            !source ||
            source.version !== `${file.version}:${file.checksum}` ||
            !artifacts.some(
              (artifact) =>
                artifact.fileAssetId === file.id &&
                artifact.sourceId === source.id &&
                artifact.version === source.version,
            )
          )
            throw new NotFoundException('MCP_ARTIFACT_UNAVAILABLE');
          const path = join(
            readEnvironment().FILE_STORAGE_PATH,
            file.storageKey,
          );
          if ((await stat(path)).size !== Number(file.sizeBytes))
            throw new NotFoundException('MCP_ARTIFACT_UNAVAILABLE');
        }
        const checksum = mcpDigest(
          JSON.stringify([
            text,
            artifacts.map((file) => [file.fileAssetId, file.version]),
          ]),
        );
        if (metadata.state === 'COMPLETED') {
          if (metadata.resultChecksum !== checksum)
            throw new ConflictException('MCP_RESULT_CONFLICT');
          return {
            job_id: answer.id,
            state: 'COMPLETED',
            submission_id: input.submission_id,
            artifacts,
          };
        }
        if (metadata.state === 'CANCELLED')
          throw new ConflictException('MCP_JOB_CLOSED');
        await this.jobs.save(
          tx,
          answer,
          {
            ...metadata,
            state: 'COMPLETED',
            resultChecksum: checksum,
            errorCode: undefined,
            progress: 'Đã lưu câu trả lời và các tệp đầu ra trong Galaxy.',
          },
          {
            status: 'COMPLETED',
            answer: text,
            completedAt: new Date(),
            errorCode: null,
          },
        );
        await tx.auditLog.create({
          data: {
            organizationId: answer.organizationId,
            actorUserId: principal.actor.userId,
            action: 'MCP_JOB_COMPLETED',
            entityType: 'ChatAiAnswer',
            entityId: answer.id,
            metadata: {
              submissionId: input.submission_id,
              checksum,
              fileAssetIds: artifacts.map((file) => file.fileAssetId),
            },
          },
        });
        return {
          job_id: answer.id,
          state: 'COMPLETED',
          submission_id: input.submission_id,
          artifacts,
        };
      },
    );
  }
  private async importFile(
    principal: McpPrincipal,
    id: string,
    attempt: number,
    submissionId: string,
    file: z.infer<typeof fileReference>,
    artifactId?: string,
  ) {
    const leaseToken = randomUUID();
    const claim = await this.forAttempt(
      principal,
      id,
      attempt,
      async ({ tx, answer, metadata }) => {
        const previous = artifactId
          ? await tx.mcpArtifact.findFirst({
              where: {
                id: artifactId,
                answerId: id,
                submissionId,
              },
            })
          : await tx.mcpArtifact.findUnique({
              where: {
                answerId_submissionId_externalFileId: {
                  answerId: id,
                  submissionId,
                  externalFileId: file.file_id,
                },
              },
            });
        if (artifactId && !previous)
          throw new NotFoundException('MCP_ARTIFACT_NOT_FOUND');
        const where = {
          answerId_submissionId_externalFileId: {
            answerId: id,
            submissionId,
            externalFileId: previous?.externalFileId ?? file.file_id,
          },
        };
        if (previous?.state === 'SUPERSEDED')
          throw new ConflictException('MCP_ARTIFACT_SUPERSEDED');
        if (previous?.state === 'AVAILABLE')
          return { receipt: previous, answer, metadata, saved: true };
        if (metadata.state === 'COMPLETED' || metadata.state === 'CANCELLED')
          throw new ConflictException('MCP_JOB_CLOSED');
        if (previous?.leaseUntil && previous.leaseUntil > new Date())
          throw new ConflictException('MCP_ARTIFACT_RECEIVING');
        if (
          previous &&
          ((file.file_name &&
            previous.filename &&
            file.file_name !== previous.filename) ||
            (file.mime_type &&
              previous.mimeType &&
              file.mime_type !== previous.mimeType))
        )
          throw new ConflictException('MCP_ARTIFACT_METADATA_CONFLICT');
        const data = {
          state: 'RECEIVING',
          downloadCipher: encryptMcpSecret(file.download_url),
          filename: file.file_name ?? previous?.filename,
          mimeType: file.mime_type ?? previous?.mimeType,
          leaseToken,
          leaseUntil: new Date(Date.now() + 120000),
          errorCode: null,
        };
        const receipt = await tx.mcpArtifact.upsert({
          where,
          create: {
            answerId: id,
            submissionId,
            externalFileId: previous?.externalFileId ?? file.file_id,
            ...data,
          },
          update: data,
        });
        return { receipt, answer, metadata, saved: false };
      },
    );
    if (claim.saved) return claim.receipt;
    const storageKey = this.storage.createKey(claim.answer.organizationId);
    const path = join(
      readEnvironment().FILE_STORAGE_PATH,
      storageKey + '.' + leaseToken + '.pending',
    );
    const abort = new AbortController();
    let maintaining = false;
    const heartbeat = async () => {
      if (maintaining) return;
      maintaining = true;
      try {
        await this.forAttempt(
          principal,
          id,
          attempt,
          async ({ tx, metadata }) => {
            if (['CANCELLED', 'COMPLETED'].includes(metadata.state))
              throw new ConflictException('MCP_JOB_CLOSED');
            if (
              !(
                await tx.mcpArtifact.updateMany({
                  where: {
                    id: claim.receipt.id,
                    leaseToken,
                    state: 'RECEIVING',
                  },
                  data: { leaseUntil: new Date(Date.now() + 120000) },
                })
              ).count
            )
              throw new ConflictException('MCP_ARTIFACT_LEASE_LOST');
            await tx.fileStorageReservation.updateMany({
              where: { id: leaseToken },
              data: { expiresAt: fileStorageReservationExpiry() },
            });
          },
        );
      } finally {
        maintaining = false;
      }
    };
    const maintenance = setInterval(() => {
      void heartbeat().catch(() => abort.abort());
    }, 20000);
    maintenance.unref();
    let stage: ArtifactStage = 'PREPARE_STORAGE';
    try {
      await ensurePrivateDirectory(dirname(path));
      await heartbeat();
      stage = 'CONNECT';
      const response = await this.network.download(
        decryptMcpSecret(claim.receipt.downloadCipher!),
      );
      const limits = readEnvironment();
      const contentLength = response.headers['content-length'];
      if (
        contentLength &&
        /^\d+$/.test(contentLength) &&
        BigInt(contentLength) > BigInt(limits.UPLOAD_MAX_FILE_BYTES)
      ) {
        response.destroy();
        throw new Error('MCP_ARTIFACT_STORAGE_LIMIT');
      }
      const hash = createHash('sha256');
      let size = 0,
        lastAdmission = 0;
      stage = 'DOWNLOAD';
      const rootForCapacity = limits.FILE_STORAGE_PATH;
      const meter = new Transform({
        transform: (chunk: Buffer, _encoding, done) => {
          void (async () => {
            size += chunk.length;
            if (size > limits.UPLOAD_MAX_FILE_BYTES)
              throw new Error('MCP_ARTIFACT_STORAGE_LIMIT');
            hash.update(chunk);
            if (
              size - lastAdmission >= 4 * 1024 * 1024 ||
              lastAdmission === 0
            ) {
              abort.signal.throwIfAborted();
              await this.db.$transaction(async (tx) => {
                await lockOrganizationFileCapacity(
                  tx,
                  principal.actor.organizationId,
                );
                await assertFileCapacity(tx, {
                  organizationId: principal.actor.organizationId,
                  actorId: principal.actor.userId,
                  incomingBytes: 3n * BigInt(size - lastAdmission),
                  staging: false,
                  organizationLimitBytes: BigInt(
                    limits.UPLOAD_ORGANIZATION_QUOTA_BYTES,
                  ),
                  globalLimitBytes: BigInt(limits.UPLOAD_GLOBAL_QUOTA_BYTES),
                  unmeasuredFileBytes: BigInt(limits.UPLOAD_MAX_FILE_BYTES),
                  actorStagingLimit: limits.UPLOAD_ACTOR_STAGING_LIMIT,
                });
                await assertUploadDiskSpace(
                  tx,
                  rootForCapacity,
                  BigInt(size - lastAdmission),
                );
                await tx.fileStorageReservation.upsert({
                  where: { id: leaseToken },
                  create: {
                    id: leaseToken,
                    organizationId: principal.actor.organizationId,
                    actorId: principal.actor.userId,
                    storageKey,
                    sizeBytes: 3n * BigInt(size),
                    expiresAt: fileStorageReservationExpiry(),
                  },
                  update: { sizeBytes: 3n * BigInt(size) },
                });
              });
              lastAdmission = size;
            }
          })().then(
            () => done(null, chunk),
            (error: unknown) =>
              done(
                error instanceof Error
                  ? error
                  : new Error('MCP_ARTIFACT_TRANSFER_STOPPED'),
              ),
          );
        },
      });
      await pipeline(
        response,
        meter,
        await createPrivateWriteStream(path, 'wx'),
        { signal: abort.signal },
      );
      stage = 'VALIDATE';
      const checksum = hash.digest('hex');
      if (
        !size ||
        !Number.isSafeInteger(size) ||
        (response.headers['content-length'] &&
          BigInt(response.headers['content-length']) !== BigInt(size))
      )
        throw new Error('MCP_ARTIFACT_BYTES_INVALID');
      const remoteMime = (response.headers['content-type'] ?? '').split(
        ';',
      )[0]!;
      const declaredMime = file.mime_type?.toLowerCase();
      let detectedFormat = Object.keys(formats).find(
        (format) => formats[format] === (file.mime_type ?? remoteMime),
      );
      if (!file.file_name && !detectedFormat) {
        for (const candidate of [
          'xlsx',
          'docx',
          'pptx',
          'pdf',
          'png',
          'jpg',
          'mp4',
          'dwg',
          'zip',
          'txt',
        ]) {
          if (
            await validUploadContent(
              ('.' + candidate) as Parameters<typeof validUploadContent>[0],
              path,
            )
          ) {
            detectedFormat = candidate;
            break;
          }
        }
      }
      const filename = safeFilename(
        file.file_name ?? 'result.' + (detectedFormat ?? 'bin'),
      );
      const format = filename ? extname(filename).slice(1).toLowerCase() : '';
      const mimeType = formats[format];
      if (
        !filename ||
        !mimeType ||
        (declaredMime &&
          declaredMime !== 'application/octet-stream' &&
          !(
            uploadTypes[('.' + format) as keyof typeof uploadTypes]
              .declared as readonly string[]
          ).includes(declaredMime))
      )
        throw new Error('MCP_ARTIFACT_FORMAT_UNSUPPORTED');
      if (
        !(await validUploadContent(
          ('.' + format) as Parameters<typeof validUploadContent>[0],
          path,
        ))
      )
        throw new Error('MCP_ARTIFACT_CONTENT_INVALID');
      if (format === 'xlsx') {
        const manifest: unknown = JSON.parse(
          (await xlsxProcess(path, null, abort.signal)).toString('utf8'),
        );
        if (
          !z
            .object({
              sheets: z
                .array(z.object({ name: z.string() }).passthrough())
                .min(1),
            })
            .safeParse(manifest).success
        )
          throw new Error('MCP_WORKBOOK_INVALID');
      }
      await heartbeat();
      abort.signal.throwIfAborted();
      stage = 'STORE';
      const upload = await this.uploads.initiate(
        principal.actor,
        {
          projectId: claim.answer.projectId,
          aiConversationId: claim.answer.conversationId,
          idempotencyKey: claim.receipt.id,
          originalFilename: filename,
          declaredSize: size,
          mimeType,
          checksum,
        },
        claim.receipt.id,
      );
      if (['INITIATED', 'UPLOADING'].includes(upload.status)) {
        for (
          let part = 1, start = 0;
          start < size;
          part++, start += upload.partSize
        ) {
          const end = Math.min(size - 1, start + upload.partSize - 1),
            digest = createHash('sha256');
          for await (const chunk of createReadStream(path, { start, end }))
            digest.update(chunk as Buffer);
          abort.signal.throwIfAborted();
          await this.uploads.part(
            principal.actor,
            upload.id,
            part,
            digest.digest('hex'),
            createReadStream(path, { start, end }),
          );
        }
      }
      await heartbeat();
      abort.signal.throwIfAborted();
      await this.uploads.complete(principal.actor, upload.id, checksum, {
        check: (tx) =>
          this.forAttempt(
            principal,
            id,
            attempt,
            async ({ tx, metadata }) => {
              if (['CANCELLED', 'COMPLETED'].includes(metadata.state))
                throw new ConflictException('MCP_JOB_CLOSED');
              if (
                !(await tx.mcpArtifact.findFirst({
                  where: {
                    id: claim.receipt.id,
                    leaseToken,
                    state: 'RECEIVING',
                  },
                }))
              )
                throw new ConflictException('MCP_ARTIFACT_LEASE_LOST');
            },
            tx,
          ),
        bind: (tx, uploaded) => {
          stage = 'LINK';
          return this.forAttempt(
            principal,
            id,
            attempt,
            async ({ tx, answer, metadata }) => {
              if (
                metadata.state === 'CANCELLED' ||
                metadata.state === 'COMPLETED'
              )
                throw new ConflictException('MCP_JOB_CLOSED');
              const current = await tx.mcpArtifact.findFirst({
                where: { id: claim.receipt.id, state: 'RECEIVING', leaseToken },
              });
              if (!current)
                throw new ConflictException('MCP_ARTIFACT_LEASE_LOST');
              const source = await tx.chatAiSourceIndex.findFirst({
                where: {
                  clientKey: claim.receipt.id,
                  organizationId: answer.organizationId,
                  projectId: answer.projectId,
                  conversationId: answer.conversationId,
                  ownerId: answer.ownerId,
                  fileAssetId: uploaded.id,
                },
              });
              const asset = await tx.fileAsset.findFirst({
                where: {
                  id: uploaded.id,
                  organizationId: answer.organizationId,
                  uploadedById: answer.ownerId,
                  checksum,
                  deletedAt: null,
                },
              });
              if (!source || !asset || Number(asset.sizeBytes) !== size)
                throw new NotFoundException();
              await tx.entityAttachment.create({
                data: {
                  fileAssetId: asset.id,
                  entityType: 'ChatAiAnswer',
                  entityId: id,
                  projectId: answer.projectId,
                  createdBy: answer.ownerId,
                },
              });
              const artifact = mcpArtifactOutput.parse({
                toolKey: current.id,
                sourceId: source.id,
                fileAssetId: asset.id,
                version: source.version,
                filename,
                sizeBytes: size,
                format,
                provenance: 'AI_DRAFT',
                downloadUrl: `/api/v1/project-chat/projects/${answer.projectId}/ai/files/${source.id}/download`,
                predecessor: null,
                diff: null,
              });
              const artifacts = mcpArtifactOutput
                .array()
                .parse((answer.usage as Prisma.JsonObject).artifacts ?? []);
              await tx.chatAiAnswer.update({
                where: { id },
                data: {
                  usage: {
                    ...(answer.usage as Prisma.InputJsonObject),
                    artifacts: [
                      ...artifacts,
                      artifact,
                    ] as unknown as Prisma.InputJsonValue,
                  },
                },
              });
              return tx.mcpArtifact.update({
                where: { id: current.id },
                data: {
                  state: 'AVAILABLE',
                  sourceId: source.id,
                  fileAssetId: asset.id,
                  checksum,
                  filename,
                  mimeType,
                  downloadCipher: null,
                  leaseToken: null,
                  leaseUntil: null,
                },
              });
            },
            tx,
          );
        },
      });
      return await this.db.mcpArtifact.findUniqueOrThrow({
        where: { id: claim.receipt.id },
      });
    } catch (error) {
      const failure = artifactFailure(error, stage);
      await this.db.mcpArtifact.updateMany({
        where: { id: claim.receipt.id, leaseToken, state: 'RECEIVING' },
        data: {
          state: 'ERROR',
          leaseToken: null,
          leaseUntil: null,
          errorCode: failure.code,
        },
      });
      await this.forAttempt(
        principal,
        id,
        attempt,
        async ({ tx, answer, metadata }) => {
          await tx.auditLog.create({
            data: {
              organizationId: answer.organizationId,
              actorUserId: principal.actor.userId,
              entityType: 'ChatAiAnswer',
              entityId: answer.id,
              action: 'MCP_ARTIFACT_IMPORT_FAILED',
              metadata: { artifactId: claim.receipt.id, attempt, ...failure },
            },
          });
          if (!['CANCELLED', 'COMPLETED'].includes(metadata.state))
            await this.jobs.save(tx, answer, {
              ...metadata,
              state: 'ERROR',
              errorCode: failure.code,
              progress: failure.code.startsWith('MCP_ARTIFACT_STORAGE_')
                ? 'Chưa lưu được tệp đầu ra; cần xử lý dung lượng trước khi thử lại.'
                : 'Chưa lưu được tệp đầu ra; cần gửi lại file reference hợp lệ.',
            });
        },
      ).catch(() => {});
      throw error instanceof ConflictException ||
        error instanceof NotFoundException
        ? error
        : new ConflictException(failure.code, { cause: error });
    } finally {
      clearInterval(maintenance);
      await rm(path, { force: true })
        .then(() =>
          this.db.fileStorageReservation.deleteMany({
            where: { id: leaseToken },
          }),
        )
        .catch(() => {});
    }
  }
}
