import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { Prisma } from '@prisma/client';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { FileStorage } from './file-storage';
import { FilesQuery, UpdateFileDto, UploadFileDto } from './files.dto';
const maximumBytes = 10 * 1024 * 1024;
const allowed = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['application/pdf', '.pdf'],
  ['text/plain', '.txt'],
]);
@Injectable()
export class FilesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly entities: BusinessEntityPolicy,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}
  async list(actor: CurrentActor, q: FilesQuery) {
    const attachmentAccess: Prisma.EntityAttachmentWhereInput = [
      'SYSTEM',
      'ORGANIZATION',
    ].includes(actor.administrationScope)
      ? {}
      : {
          OR: [
            { project: this.entities.projectWhere(actor) },
            {
              customer: {
                organizationId: actor.organizationId,
                deletedAt: null,
              },
            },
            { fileAsset: { uploadedById: actor.userId } },
          ],
        };
    const where: Prisma.FileAssetWhereInput = {
      organizationId: actor.organizationId,
      deletedAt: null,
      originalFilename: q.search
        ? { contains: q.search, mode: 'insensitive' }
        : undefined,
      category: q.category,
      mimeType: q.mimeType,
      uploadedById: q.uploadedById,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
      attachments: {
        some: {
          ...attachmentAccess,
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
        include: this.include(),
        orderBy: { [q.sort ?? 'createdAt']: q.direction ?? 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.fileAsset.count({ where }),
    ]);
    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }
  async get(actor: CurrentActor, id: string, includeDeleted = false) {
    const file = await this.prisma.fileAsset.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: includeDeleted ? undefined : null,
      },
      include: this.include(),
    });
    if (!file) throw new NotFoundException('File not found');
    let visible = false;
    for (const attachment of file.attachments)
      try {
        await this.entities.assertView(
          actor,
          attachment.entityType,
          attachment.entityId,
        );
        visible = true;
        break;
      } catch {
        continue;
      }
    if (!visible) throw new NotFoundException('File not found');
    return file;
  }
  async upload(
    actor: CurrentActor,
    input: UploadFileDto,
    file?: Express.Multer.File,
  ) {
    if (!file || !file.size || file.size > maximumBytes)
      throw new BadRequestException('File must be between 1 byte and 10 MB');
    const context = await this.entities.assertView(
      actor,
      input.entityType,
      input.entityId,
    );
    const original = this.filename(file.originalname);
    const detected = this.detect(file.buffer);
    if (
      !detected ||
      detected !== file.mimetype ||
      extname(original).toLowerCase() !== allowed.get(detected)
    )
      throw new BadRequestException('File type or extension is not allowed');
    const storageKey = await this.storage.put(
      actor.organizationId,
      file.buffer,
    );
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.fileAsset.create({
        data: {
          organizationId: actor.organizationId,
          originalFilename: original,
          storedFilename: randomUUID(),
          mimeType: detected,
          sizeBytes: file.size,
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
      return tx.fileAsset.findUniqueOrThrow({
        where: { id: asset.id },
        include: this.include(),
      });
    });
  }
  async update(actor: CurrentActor, id: string, data: UpdateFileDto) {
    const before = await this.get(actor, id);
    const file = await this.prisma.fileAsset.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: this.include(),
    });
    await this.activity(actor, before, 'FILE_UPDATED');
    return file;
  }
  async remove(actor: CurrentActor, id: string) {
    const file = await this.get(actor, id);
    await this.prisma.fileAsset.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await this.activity(actor, file, 'FILE_DELETED');
    return { deleted: true };
  }
  async restore(actor: CurrentActor, id: string) {
    const file = await this.get(actor, id, true);
    if (!file.deletedAt) return file;
    const restored = await this.prisma.fileAsset.update({
      where: { id },
      data: { deletedAt: null, version: { increment: 1 } },
      include: this.include(),
    });
    await this.activity(actor, file, 'FILE_RESTORED');
    return restored;
  }
  async download(actor: CurrentActor, id: string) {
    const file = await this.get(actor, id);
    return { file, data: await this.storage.read(file.storageKey) };
  }
  private include() {
    return {
      uploadedBy: { select: { id: true, displayName: true } },
      attachments: true,
    } as const;
  }
  private filename(value: string) {
    if (
      value !== basename(value) ||
      value.includes('\\') ||
      value.includes('/') ||
      [...value].some((character) => character.charCodeAt(0) < 32)
    )
      throw new BadRequestException('Invalid filename');
    const clean = value.trim().replace(/[^\p{L}\p{N}._ -]/gu, '_');
    if (!clean || clean.length > 200)
      throw new BadRequestException('Invalid filename');
    return clean;
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
    actor: CurrentActor,
    file: Awaited<ReturnType<FilesService['get']>>,
    event: string,
  ) {
    const target = file.attachments[0];
    if (!target) return;
    return this.prisma.activity.create({
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
