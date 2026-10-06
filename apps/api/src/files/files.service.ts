import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { Prisma } from '@prisma/client';
import {
  BusinessEntityPolicy,
  projectWhereForPermissions,
} from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { readEnvironment } from '../config/env';
import { PrismaService } from '../prisma.service';
import { isStageOneFinancialDocument } from '../projects/project-stage-one.rules';
import { FileStorage } from './file-storage';
import { safeFilename } from './filename';
import { hiddenProjectFileIds } from './project-file';
import { assertBoundedWorkbook } from '../imports/imports.service';
import {
  assertFileCapacity,
  fileStorageReservationExpiry,
  lockOrganizationFileCapacity,
} from './file-quota';
import { FilesQuery, UpdateFileDto, UploadFileDto } from './files.dto';
const maximumBytes = 10 * 1024 * 1024;
const allowed = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['application/pdf', '.pdf'],
  ['text/plain', '.txt'],
  [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xlsx',
  ],
]);
const previewMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'text/plain',
]);
type DocumentFileClient = Pick<
  Prisma.TransactionClient,
  'entityAttachment' | 'projectRequiredDocument' | 'projectStageOneDocument'
>;
type ProjectDocumentReference = {
  stageKey: string;
  workstreamKey: string;
  documentType: string;
  projectId: string;
};
@Injectable()
export class FilesService {
  private readonly environment = readEnvironment();
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly entities: BusinessEntityPolicy,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Optional()
    @Inject(ProjectChatPolicy)
    private readonly chat?: ProjectChatPolicy,
  ) {}
  private view<
    T extends {
      sizeBytes?: bigint;
      storageProvider?: string;
      storageKey?: string;
      thumbnailKey?: string | null;
      storedFilename?: string;
      checksum?: string | null;
    },
  >(file: T) {
    const {
      sizeBytes,
      storageProvider,
      storageKey,
      thumbnailKey,
      storedFilename,
      checksum,
      ...value
    } = file;
    void storageProvider;
    void storageKey;
    void thumbnailKey;
    void storedFilename;
    void checksum;
    return {
      ...value,
      ...(sizeBytes === undefined ? {} : { sizeBytes: sizeBytes.toString() }),
    };
  }
  private assertSupportedConfidentiality(value?: string) {
    if (value && value !== 'INTERNAL')
      throw new BadRequestException(
        'Restricted confidentiality policy is not available',
      );
  }
  async list(actor: CurrentActor, q: FilesQuery) {
    const attachmentAccess = this.attachmentAccess(actor, 'file.read');
    const hiddenFileIds = await hiddenProjectFileIds(this.prisma, actor);
    const where: Prisma.FileAssetWhereInput = {
      organizationId: actor.organizationId,
      deletedAt: null,
      id: hiddenFileIds.length ? { notIn: hiddenFileIds } : undefined,
      originalFilename: q.search
        ? { contains: q.search, mode: 'insensitive' }
        : undefined,
      category: q.category,
      mimeType: q.mimeType,
      uploadedById: q.uploadedById,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
      AND: [this.projectAttachmentGuard(actor, 'file.read')],
      attachments: {
        some: {
          AND: [attachmentAccess],
          projectId: q.projectId,
          customerId: q.customerId,
          entityType: q.entityType,
          entityId: q.entityId,
        },
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fileAsset.findMany({
        where,
        include: this.include(actor, 'file.read'),
        orderBy: { [q.sort ?? 'createdAt']: q.direction ?? 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.fileAsset.count({ where }),
    ]);
    return {
      items: items.map((item) => this.view(item)),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }
  async get(actor: CurrentActor, id: string, includeDeleted = false) {
    const file = await this.file(actor, id, includeDeleted, 'file.read');
    let canDownload = false;
    if (actor.permissions.includes('file.download')) {
      try {
        await this.file(actor, id, includeDeleted, [
          'file.read',
          'file.download',
        ]);
        canDownload = true;
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return { ...this.view(file), canDownload };
  }
  private async file(
    actor: CurrentActor,
    id: string,
    includeDeleted = false,
    requiredPermissions: string | readonly string[] = 'file.read',
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const hiddenFileIds = await hiddenProjectFileIds(tx, actor);
    const file = await tx.fileAsset.findFirst({
      where: {
        id: { equals: id, notIn: hiddenFileIds },
        organizationId: actor.organizationId,
        deletedAt: includeDeleted ? undefined : null,
        AND: [this.projectAttachmentGuard(actor, requiredPermissions)],
        attachments: {
          some: this.attachmentAccess(actor, requiredPermissions),
        },
      },
      include: this.include(actor, requiredPermissions),
    });
    if (!file) throw new NotFoundException('File not found');
    const attachments = [];
    for (const attachment of file.attachments)
      try {
        await this.entities.assertView(
          actor,
          attachment.entityType === 'ProjectStageOneDocument'
            ? 'Project'
            : attachment.entityType,
          attachment.entityType === 'ProjectStageOneDocument'
            ? attachment.projectId!
            : attachment.entityId,
          requiredPermissions,
          tx,
        );
        attachments.push(attachment);
      } catch {
        continue;
      }
    if (!attachments.length) throw new NotFoundException('File not found');
    return { ...file, attachments };
  }
  async projectAiFile(
    actor: CurrentActor,
    projectId: string,
    id: string,
    tx: Prisma.TransactionClient,
  ) {
    const file = await this.file(
      actor,
      id,
      false,
      ['file.read', 'file.download'],
      tx,
    );
    if (
      file.confidentiality !== 'INTERNAL' ||
      !file.attachments.some((attachment) => attachment.projectId === projectId)
    )
      throw new NotFoundException();
    return file;
  }
  async projectAiWhere(
    actor: CurrentActor,
    projectId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Prisma.FileAssetWhereInput> {
    return {
      organizationId: actor.organizationId,
      deletedAt: null,
      confidentiality: 'INTERNAL',
      id: { notIn: await hiddenProjectFileIds(tx, actor) },
      AND: [this.projectAttachmentGuard(actor, ['file.read', 'file.download'])],
      attachments: {
        some: {
          projectId,
          project: projectWhereForPermissions(actor, [
            'file.read',
            'file.download',
          ]),
        },
      },
    };
  }
  async upload(
    actor: CurrentActor,
    input:
      | UploadFileDto
      | {
          entityType: 'ChatRoom' | 'ChatAiConversation';
          entityId: string;
          category: string;
          confidentiality?: 'INTERNAL';
        },
    file?: Express.Multer.File,
    chatKey?: string,
  ) {
    this.assertSupportedConfidentiality(input.confidentiality);
    if (!file || !file.size || file.size > maximumBytes)
      throw new BadRequestException('File must be between 1 byte and 10 MB');
    if ((input.entityType as string) === 'ProjectRequiredDocument')
      throw new BadRequestException(
        'Project documents must use a resumable upload session',
      );
    const aiContext =
      input.entityType === 'ChatAiConversation'
        ? await this.aiUpload(actor, input.entityId, chatKey, this.prisma)
        : null;
    const chatContext =
      input.entityType === 'ChatRoom'
        ? await this.chatUpload(actor, input.entityId, chatKey, this.prisma)
        : null;
    const context = aiContext
      ? { projectId: aiContext.projectId, customerId: undefined }
      : chatContext
        ? { projectId: chatContext.room.projectId, customerId: undefined }
        : await this.entities.assertView(
            actor,
            input.entityType,
            input.entityId,
            'file.upload',
          );
    const original = safeFilename(file.originalname);
    if (!original) throw new BadRequestException('Invalid filename');
    const xlsx = aiContext && extname(original).toLowerCase() === '.xlsx';
    if (xlsx && (file.size > 5_000_000 || !assertBoundedWorkbook(file.buffer)))
      throw new BadRequestException('Tệp XLSX không hợp lệ hoặc quá lớn');
    const detected = xlsx
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : this.detect(file.buffer);
    if (
      !detected ||
      (detected !== file.mimetype &&
        !(
          detected === 'text/plain' &&
          ['.md', '.txt'].includes(extname(original).toLowerCase()) &&
          ['text/markdown', 'application/octet-stream', ''].includes(
            file.mimetype,
          )
        )) ||
      ![
        allowed.get(detected),
        ...(detected === 'text/plain'
          ? ['.md']
          : detected === 'image/jpeg'
            ? ['.jpeg']
            : []),
      ].includes(extname(original).toLowerCase())
    )
      throw new BadRequestException('File type or extension is not allowed');
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const chatHash = createHash('sha256')
      .update(JSON.stringify([checksum, original, detected]))
      .digest('hex');
    if (aiContext) {
      const replay = await this.aiReplay(
        actor,
        input.entityId,
        chatKey!,
        chatHash,
        this.prisma,
      );
      if (replay) return replay;
    }
    if (chatContext) {
      const replay = await this.chat!.project(
        actor,
        chatContext.room.projectId,
        async (tx) => {
          const current = await this.chatUpload(
            actor,
            input.entityId,
            chatKey,
            tx,
          );
          const result = await this.chatReplay(
            actor,
            input.entityId,
            chatKey!,
            chatHash,
            current.grant.effectiveAt,
            tx,
          );
          await this.chatUpload(actor, input.entityId, chatKey, tx);
          return result;
        },
      );
      if (replay) return replay;
    }
    const reservationId = randomUUID();
    const storageKey = this.storage.createKey(actor.organizationId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockOrganizationFileCapacity(tx, actor.organizationId);
        await assertFileCapacity(tx, {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          incomingBytes: BigInt(file.size),
          staging: false,
          organizationLimitBytes: BigInt(
            this.environment.UPLOAD_ORGANIZATION_QUOTA_BYTES,
          ),
          globalLimitBytes: BigInt(this.environment.UPLOAD_GLOBAL_QUOTA_BYTES),
          unmeasuredFileBytes: BigInt(this.environment.UPLOAD_MAX_FILE_BYTES),
          actorStagingLimit: this.environment.UPLOAD_ACTOR_STAGING_LIMIT,
        });
        await tx.fileStorageReservation.create({
          data: {
            id: reservationId,
            organizationId: actor.organizationId,
            actorId: actor.userId,
            storageKey,
            sizeBytes: BigInt(file.size),
            expiresAt: fileStorageReservationExpiry(),
          },
        });
      });
      await this.storage.putStream(
        actor.organizationId,
        Readable.from(file.buffer),
        storageKey,
        reservationId,
      );
      return await this.prisma.$transaction(async (tx) => {
        const reservation = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "FileStorageReservation"
          WHERE "id" = ${reservationId}::uuid AND "expiresAt" > NOW()
          FOR UPDATE
        `);
        if (!reservation.length)
          throw new ConflictException('File storage reservation expired');
        if (aiContext)
          await this.lockProjects(tx, actor, [aiContext.projectId]);
        else if (chatContext)
          await this.lockProjects(tx, actor, [chatContext.room.projectId]);
        else if (context.projectId)
          await this.lockProjectFor(
            tx,
            actor,
            context.projectId,
            'file.upload',
          );
        const aiCurrent = aiContext
          ? await this.aiUpload(actor, input.entityId, chatKey, tx)
          : null;
        if (aiCurrent) {
          const replay = await this.aiReplay(
            actor,
            input.entityId,
            chatKey!,
            chatHash,
            tx,
          );
          if (replay) {
            await this.storage.removePending(storageKey, reservationId);
            await tx.fileStorageReservation.delete({
              where: { id: reservationId },
            });
            await this.aiUpload(actor, input.entityId, chatKey, tx);
            return replay;
          }
        }
        const chatCurrent = chatContext
          ? await this.chatUpload(actor, input.entityId, chatKey, tx)
          : null;
        if (chatCurrent) {
          const replay = await this.chatReplay(
            actor,
            input.entityId,
            chatKey!,
            chatHash,
            chatCurrent.grant.effectiveAt,
            tx,
          );
          if (replay) {
            await this.storage.removePending(storageKey, reservationId);
            await tx.fileStorageReservation.delete({
              where: { id: reservationId },
            });
            await this.chatUpload(actor, input.entityId, chatKey, tx);
            return replay;
          }
        }
        const currentContext = aiCurrent
          ? { projectId: aiCurrent.projectId, customerId: undefined }
          : chatCurrent
            ? { projectId: chatCurrent.room.projectId, customerId: undefined }
            : await this.entities.assertView(
                actor,
                input.entityType,
                input.entityId,
                'file.upload',
                tx,
              );
        if (
          currentContext.projectId !== context.projectId ||
          currentContext.customerId !== context.customerId
        )
          throw new NotFoundException('Entity not found');
        await this.storage.publishPending(storageKey, reservationId);
        const asset = await tx.fileAsset.create({
          data: {
            organizationId: actor.organizationId,
            originalFilename: original,
            storedFilename: randomUUID(),
            mimeType: detected,
            sizeBytes: BigInt(file.size),
            storageKey,
            checksum,
            category: input.category,
            confidentiality: input.confidentiality,
            uploadedById: actor.userId,
          },
        });
        await tx.entityAttachment.create({
          data: {
            fileAssetId: asset.id,
            entityType: input.entityType,
            entityId: input.entityId,
            projectId: context.projectId,
            customerId: context.customerId,
            createdBy: actor.userId,
          },
        });
        if (aiCurrent) {
          const linked = await tx.chatAiSourceIndex.create({
            data: {
              organizationId: actor.organizationId,
              projectId: aiCurrent.projectId,
              ownerId: actor.userId,
              conversationId: input.entityId,
              clientKey: chatKey,
              payloadHash: chatHash,
              fileAssetId: asset.id,
              version: `${asset.version}:${checksum}`,
              label: original,
              provenance: 'UNCONFIRMED',
            },
          });
          await tx.activity.create({
            data: {
              organizationId: actor.organizationId,
              actorId: actor.userId,
              event: 'FILE_UPLOADED',
              entityType: 'ChatAiConversation',
              entityId: input.entityId,
              metadata: {
                fileId: asset.id,
                sourceId: linked.id,
                version: asset.version,
              },
            },
          });
          await tx.fileStorageReservation.delete({
            where: { id: reservationId },
          });
          await this.aiUpload(actor, input.entityId, chatKey, tx);
          return {
            id: linked.id,
            fileAssetId: asset.id,
            version: linked.version,
            status: linked.status,
            label: original,
            sizeBytes: file.size,
          };
        }
        if (chatCurrent) {
          const linked = await tx.chatFile.create({
            data: {
              organizationId: actor.organizationId,
              projectId: chatCurrent.room.projectId,
              roomId: input.entityId,
              actorId: actor.userId,
              clientKey: chatKey!,
              payloadHash: chatHash,
              fileAssetId: asset.id,
              version: asset.version,
              origin:
                actor.membershipKind === 'EXTERNAL'
                  ? 'EXTERNAL_UNCONFIRMED'
                  : 'INTERNAL',
              createdAt: new Date(),
            },
          });
          await this.chat!.assertRoom(actor, input.entityId, 'UPLOAD', tx);
          await tx.fileStorageReservation.delete({
            where: { id: reservationId },
          });
          return {
            id: linked.id,
            fileAssetId: asset.id,
            version: asset.version,
            originalFilename: asset.originalFilename,
            origin: linked.origin,
          };
        }
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'FILE_UPLOADED',
            entityType: input.entityType,
            entityId: input.entityId,
            metadata: { fileId: asset.id, category: input.category },
          },
        });
        await tx.fileStorageReservation.delete({
          where: { id: reservationId },
        });
        return this.view(
          await tx.fileAsset.findUniqueOrThrow({
            where: { id: asset.id },
            include: this.include(actor, 'file.upload'),
          }),
        );
      });
    } catch (error) {
      const reservation = await this.prisma.fileStorageReservation
        .findUnique({ where: { id: reservationId }, select: { id: true } })
        .catch(() => undefined);
      if (reservation) {
        try {
          await this.storage.removePending(storageKey, reservationId);
          await this.storage.remove(storageKey);
          await this.prisma.fileStorageReservation.deleteMany({
            where: { id: reservationId, storageKey },
          });
        } catch {
          // Keep the reservation charged so periodic cleanup can retry safely.
        }
      }
      throw error;
    }
  }
  private async aiUpload(
    actor: CurrentActor,
    conversationId: string,
    key: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (
      !this.chat ||
      process.env.FEATURE_PROJECT_AI !== 'true' ||
      !key ||
      !/^[0-9a-f-]{36}$/i.test(key)
    )
      throw new NotFoundException();
    const fresh = await this.chat.freshActor(tx, actor);
    const conversation = await tx.chatAiConversation.findFirst({
      where: {
        id: conversationId,
        organizationId: actor.organizationId,
        ownerId: actor.userId,
        project: projectWhereForPermissions(fresh, [
          'ai.invoke',
          'file.upload',
        ]),
        answers: { none: { usage: { path: ['kind'], equals: 'ADMIN_SMOKE' } } },
      },
    });
    if (!conversation) throw new NotFoundException();
    await this.chat.authority(tx, actor, conversation.projectId, 'INVOKE');
    return conversation;
  }
  private async aiReplay(
    actor: CurrentActor,
    conversationId: string,
    clientKey: string,
    payloadHash: string,
    tx: Prisma.TransactionClient,
  ) {
    const source = await tx.chatAiSourceIndex.findFirst({
      where: {
        conversationId,
        clientKey,
        ownerId: actor.userId,
        organizationId: actor.organizationId,
      },
      include: { file: true },
    });
    if (!source) return null;
    if (source.payloadHash !== payloadHash)
      throw new ConflictException('Khóa upload đã dùng cho file khác');
    if (
      !source.file ||
      source.file.deletedAt ||
      source.version !== `${source.file.version}:${source.file.checksum}`
    )
      throw new NotFoundException();
    await this.aiUpload(actor, conversationId, clientKey, tx);
    return {
      id: source.id,
      fileAssetId: source.file.id,
      version: source.version,
      status: source.status,
      label: source.label,
      sizeBytes: Number(source.file.sizeBytes),
    };
  }
  private async chatUpload(
    actor: CurrentActor,
    roomId: string,
    key: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (!this.chat || !key || !/^[0-9a-f-]{36}$/i.test(key))
      throw new BadRequestException('Cần khóa upload hợp lệ');
    const member = await this.chat.live(actor, tx);
    const scope = await this.chat.assertRoom(actor, roomId, 'UPLOAD', tx);
    if (scope.room.locked) throw new ConflictException('Cuộc trao đổi đã khóa');
    if (scope.room.audience === 'CUSTOMER' && member.kind !== 'EXTERNAL')
      throw new ForbiddenException('Hồ sơ nội bộ phải qua phát hành');
    return scope;
  }
  private async chatReplay(
    actor: CurrentActor,
    roomId: string,
    key: string,
    hash: string,
    since: Date,
    tx: Prisma.TransactionClient,
  ) {
    const found = await tx.chatFile.findUnique({
      where: {
        roomId_actorId_clientKey: {
          roomId,
          actorId: actor.userId,
          clientKey: key,
        },
      },
      include: { file: true },
    });
    if (!found) return null;
    if (found.createdAt < since || found.file.deletedAt)
      throw new NotFoundException();
    if (found.payloadHash !== hash)
      throw new ConflictException('Khóa upload đã dùng cho file khác');
    return {
      id: found.id,
      fileAssetId: found.fileAssetId,
      version: found.version,
      originalFilename: found.file.originalFilename,
      origin: found.origin,
    };
  }
  async update(actor: CurrentActor, id: string, data: UpdateFileDto) {
    this.assertSupportedConfidentiality(data.confidentiality);
    const before = await this.file(actor, id, false, 'file.update');
    return this.prisma.$transaction(async (tx) => {
      const references = await this.lockFileForMutation(
        tx,
        actor,
        id,
        'file.update',
      );
      await this.assertDocumentFileMutation(
        tx,
        actor,
        references,
        true,
        'file.update',
      );
      const file = await tx.fileAsset.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
        include: this.include(actor, 'file.update'),
      });
      await this.activity(tx, actor, before, 'FILE_UPDATED');
      return this.view(file);
    });
  }
  async remove(actor: CurrentActor, id: string) {
    const file = await this.file(actor, id, false, 'file.delete');
    return this.prisma.$transaction(async (tx) => {
      const references = await this.lockFileForMutation(
        tx,
        actor,
        id,
        'file.delete',
      );
      await this.assertDocumentFileMutation(
        tx,
        actor,
        references,
        true,
        'file.delete',
      );
      await tx.fileAsset.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.activity(tx, actor, file, 'FILE_DELETED');
      return { deleted: true };
    });
  }
  async restore(actor: CurrentActor, id: string) {
    const file = await this.file(actor, id, true, 'file.restore');
    if (!file.deletedAt) return this.view(file);
    return this.prisma.$transaction(async (tx) => {
      const references = await this.lockFileForMutation(
        tx,
        actor,
        id,
        'file.restore',
        true,
      );
      await this.assertDocumentFileMutation(
        tx,
        actor,
        references,
        false,
        'file.restore',
      );
      const restored = await tx.fileAsset.update({
        where: { id },
        data: { deletedAt: null, version: { increment: 1 } },
        include: this.include(actor, 'file.restore'),
      });
      await this.activity(tx, actor, file, 'FILE_RESTORED');
      return this.view(restored);
    });
  }
  async download(
    actor: CurrentActor,
    id: string,
    requiredPermissions: string | readonly string[] = 'file.download',
    version?: number,
  ) {
    const file = await this.file(actor, id, false, requiredPermissions);
    if (version !== undefined && file.version !== version)
      throw new ConflictException(
        'Phiên bản file đã thay đổi; tải lại danh sách trước khi mở.',
      );
    try {
      return { file, data: await this.storage.stream(file.storageKey) };
    } catch (error) {
      if (error instanceof NotFoundException)
        throw new NotFoundException({
          category: 'MISSING_BINARY',
          message:
            'Thiếu file gốc trong kho lưu trữ. Hồ sơ vẫn được giữ; cần khôi phục đúng binary từ nguồn hợp lệ.',
        });
      throw error;
    }
  }
  async preview(actor: CurrentActor, id: string, version?: number) {
    const result = await this.download(
      actor,
      id,
      ['file.read', 'file.download'],
      version,
    );
    if (!previewMimeTypes.has(result.file.mimeType)) {
      result.data.destroy();
      throw new UnsupportedMediaTypeException('Preview is not supported');
    }
    return result;
  }
  private attachmentAccess(
    actor: CurrentActor,
    requiredPermissions: string | readonly string[],
  ): Prisma.EntityAttachmentWhereInput {
    return {
      NOT: { entityType: 'ChatAiConversation' },
      OR: [
        {
          projectId: { not: null },
          project: projectWhereForPermissions(actor, requiredPermissions),
        },
        {
          projectId: null,
          customer: {
            organizationId: actor.organizationId,
            deletedAt: null,
          },
        },
        { projectId: null, fileAsset: { uploadedById: actor.userId } },
      ],
    };
  }
  private async assertDocumentFileMutation(
    db: Prisma.TransactionClient,
    actor: CurrentActor,
    references: {
      documents: ProjectDocumentReference[];
      projectIds: string[];
    },
    enforceImmutability: boolean,
    operationPermission: string,
  ) {
    const { documents, projectIds } = references;
    if (!documents.length) return;
    const financial = documents.some(isStageOneFinancialDocument);
    if (
      !actor.permissions.includes('project.document.manage') ||
      (financial &&
        (!actor.permissions.includes('project.stage1.finance.read') ||
          !actor.permissions.includes('project.stage1.finance.manage')))
    )
      throw new NotFoundException('File not found');
    await this.assertProjectsVisible(db, actor, projectIds, [
      operationPermission,
      'project.document.manage',
      ...(financial
        ? ['project.stage1.finance.read', 'project.stage1.finance.manage']
        : []),
    ]);
    if (enforceImmutability)
      throw new ConflictException('Required document evidence is immutable');
  }
  private async assertProjectsVisible(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectIds: string[],
    requiredPermissions: string | readonly string[],
  ) {
    if (!projectIds.length) return;
    const visible = await tx.project.count({
      where: {
        AND: [
          { id: { in: projectIds } },
          projectWhereForPermissions(actor, requiredPermissions),
        ],
      },
    });
    if (visible !== projectIds.length)
      throw new NotFoundException('File not found');
  }

  private async fileProjectReferences(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    fileId: string,
  ) {
    const [attachments, documents] = await Promise.all([
      tx.entityAttachment.findMany({
        where: { fileAssetId: fileId, projectId: { not: null } },
        select: { projectId: true },
      }),
      this.documentReferences(tx, actor, fileId),
    ]);
    return {
      documents,
      projectIds: [
        ...new Set([
          ...attachments.flatMap(({ projectId }) =>
            projectId ? [projectId] : [],
          ),
          ...documents.map(({ projectId }) => projectId),
        ]),
      ].sort(),
    };
  }

  private async lockFileForMutation(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    fileId: string,
    requiredPermissions: string,
    includeDeleted = false,
  ) {
    const before = await this.fileProjectReferences(tx, actor, fileId);
    await this.lockProjects(tx, actor, before.projectIds);
    await this.lockFile(tx, actor, fileId, includeDeleted);
    const current = await this.fileProjectReferences(tx, actor, fileId);
    if (
      before.projectIds.length !== current.projectIds.length ||
      before.projectIds.some((id, index) => id !== current.projectIds[index])
    )
      throw new ConflictException('File references changed; retry');
    await this.assertProjectsVisible(
      tx,
      actor,
      current.projectIds,
      requiredPermissions,
    );
    return current;
  }

  private async lockProjects(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectIds: string[],
  ) {
    if (!projectIds.length) return;
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Project"
      WHERE "id" IN (${Prisma.join(
        projectIds.map((id) => Prisma.sql`${id}::uuid`),
      )})
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "deletedAt" IS NULL
      ORDER BY "id"
      FOR UPDATE
    `);
    if (locked.length !== projectIds.length)
      throw new NotFoundException('File not found');
  }

  private async lockProjectFor(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    requiredPermissions: string | readonly string[],
  ) {
    await this.lockProjects(tx, actor, [projectId]);
    const scoped = await tx.project.findFirst({
      where: {
        id: projectId,
        ...projectWhereForPermissions(actor, requiredPermissions),
      },
      select: { id: true },
    });
    if (!scoped) throw new NotFoundException('Entity not found');
  }
  private async documentReferences(
    db: DocumentFileClient,
    actor: CurrentActor,
    fileId: string,
  ) {
    const attachments = await db.entityAttachment.findMany({
      where: {
        fileAssetId: fileId,
        entityType: {
          in: ['ProjectRequiredDocument', 'ProjectStageOneDocument'],
        },
      },
      select: { entityType: true, entityId: true },
    });
    const attached = (entityType: string) =>
      attachments.flatMap((attachment) =>
        attachment.entityType === entityType ? [attachment.entityId] : [],
      );
    const logicalIds = attached('ProjectStageOneDocument');
    const [required, logical] = await Promise.all([
      db.projectRequiredDocument.findMany({
        where: {
          organizationId: actor.organizationId,
          OR: [
            { currentFileAssetId: fileId },
            { versions: { some: { fileAssetId: fileId } } },
            { id: { in: attached('ProjectRequiredDocument') } },
          ],
        },
        select: {
          stageKey: true,
          workstreamKey: true,
          documentType: true,
          projectId: true,
        },
      }),
      logicalIds.length
        ? db.projectStageOneDocument.findMany({
            where: {
              project: { organizationId: actor.organizationId },
              OR: [
                { currentFileAssetId: fileId },
                { versions: { some: { fileAssetId: fileId } } },
                { id: { in: logicalIds } },
              ],
            },
            select: {
              stageKey: true,
              workstreamKey: true,
              documentType: true,
              projectId: true,
            },
          })
        : [],
    ]);
    return [...required, ...logical];
  }
  private async lockFile(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    fileId: string,
    includeDeleted = false,
  ) {
    const rows = await tx.$queryRaw<
      { id: string; publicationBound: boolean }[]
    >(Prisma.sql`
      SELECT "id", EXISTS (
        SELECT 1 FROM "ChatDocumentRelease" r
        WHERE r."fileAssetId" = f."id" AND r."publishedAt" IS NOT NULL
      ) AS "publicationBound"
      FROM "FileAsset" f
      WHERE f."id" = ${fileId}::uuid AND f."organizationId" = ${actor.organizationId}::uuid
        ${includeDeleted ? Prisma.empty : Prisma.sql`AND f."deletedAt" IS NULL`}
      FOR UPDATE OF f
    `);
    if (!rows.length) throw new NotFoundException('File not found');
    // Access revocation belongs to publication; generic file commands cannot rewrite history.
    if (rows[0]!.publicationBound)
      throw new ConflictException(
        'Tài liệu đã phát hành cho khách không được sửa hoặc xóa qua thao tác file.',
      );
  }
  private projectAttachmentGuard(
    actor: CurrentActor,
    requiredPermissions: string | readonly string[],
  ): Prisma.FileAssetWhereInput {
    return {
      NOT: {
        attachments: {
          some: { entityType: { in: ['ChatRoom', 'ChatAiConversation'] } },
        },
      },
      OR: [
        { attachments: { none: { projectId: { not: null } } } },
        {
          attachments: {
            some: {
              project: projectWhereForPermissions(actor, requiredPermissions),
            },
          },
        },
      ],
    };
  }
  private include(
    actor: CurrentActor,
    requiredPermissions: string | readonly string[],
  ) {
    return {
      uploadedBy: { select: { id: true, displayName: true } },
      attachments: {
        where: this.attachmentAccess(actor, requiredPermissions),
      },
    } as const;
  }
  private detect(buffer: Buffer) {
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return 'image/png';
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
      return 'image/jpeg';
    if (buffer.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
    if (!buffer.includes(0)) return 'text/plain';
    return null;
  }
  private activity(
    db: Pick<Prisma.TransactionClient, 'activity'>,
    actor: CurrentActor,
    file: {
      id: string;
      attachments: { entityType: string; entityId: string }[];
    },
    event: string,
  ) {
    const target = file.attachments[0];
    if (!target) return;
    return db.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event,
        entityType: target.entityType,
        entityId: target.entityId,
        metadata: { fileId: file.id },
      },
    });
  }
}
