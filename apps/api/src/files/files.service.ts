import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
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
import { readEnvironment } from '../config/env';
import { PrismaService } from '../prisma.service';
import { isStageOneFinancialDocument } from '../projects/project-stage-one.rules';
import { FileStorage } from './file-storage';
import { safeFilename } from './filename';
import { hiddenProjectFileIds } from './project-file';
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
    return this.view(await this.file(actor, id, includeDeleted, 'file.read'));
  }
  private async file(
    actor: CurrentActor,
    id: string,
    includeDeleted = false,
    requiredPermissions: string | readonly string[] = 'file.read',
  ) {
    const hiddenFileIds = await hiddenProjectFileIds(this.prisma, actor);
    const file = await this.prisma.fileAsset.findFirst({
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
        );
        attachments.push(attachment);
      } catch {
        continue;
      }
    if (!attachments.length) throw new NotFoundException('File not found');
    return { ...file, attachments };
  }
  async upload(
    actor: CurrentActor,
    input: UploadFileDto,
    file?: Express.Multer.File,
  ) {
    this.assertSupportedConfidentiality(input.confidentiality);
    if (!file || !file.size || file.size > maximumBytes)
      throw new BadRequestException('File must be between 1 byte and 10 MB');
    if ((input.entityType as string) === 'ProjectRequiredDocument')
      throw new BadRequestException(
        'Project documents must use a resumable upload session',
      );
    const context = await this.entities.assertView(
      actor,
      input.entityType,
      input.entityId,
      'file.upload',
    );
    const original = safeFilename(file.originalname);
    if (!original) throw new BadRequestException('Invalid filename');
    const detected = this.detect(file.buffer);
    if (
      !detected ||
      detected !== file.mimetype ||
      extname(original).toLowerCase() !== allowed.get(detected)
    )
      throw new BadRequestException('File type or extension is not allowed');
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
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
        if (context.projectId)
          await this.lockProjectFor(
            tx,
            actor,
            context.projectId,
            'file.upload',
          );
        const currentContext = await this.entities.assertView(
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
  ) {
    const file = await this.file(actor, id, false, requiredPermissions);
    return { file, data: await this.storage.stream(file.storageKey) };
  }
  async preview(actor: CurrentActor, id: string) {
    const result = await this.download(actor, id, [
      'file.read',
      'file.download',
    ]);
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
    const rows = includeDeleted
      ? await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "FileAsset" WHERE "id" = ${fileId}::uuid AND "organizationId" = ${actor.organizationId}::uuid FOR UPDATE`
      : await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "FileAsset" WHERE "id" = ${fileId}::uuid AND "organizationId" = ${actor.organizationId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('File not found');
  }
  private projectAttachmentGuard(
    actor: CurrentActor,
    requiredPermissions: string | readonly string[],
  ): Prisma.FileAssetWhereInput {
    return {
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
