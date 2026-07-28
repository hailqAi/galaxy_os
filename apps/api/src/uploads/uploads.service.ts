import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { finished, pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { CurrentActor } from '../access-control/current-actor';
import { readEnvironment } from '../config/env';
import { PrismaService } from '../prisma.service';
import { InitiateUploadDto } from './uploads.dto';

export function uploadParts(
  size: number,
  configuredPartSize = 67_108_864,
  maxParts = 10_000,
) {
  const partSize = Math.max(configuredPartSize, Math.ceil(size / maxParts));
  return { partSize, totalParts: Math.ceil(size / partSize) };
}

@Injectable()
export class UploadsService {
  private readonly environment = readEnvironment();
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private view<T extends { declaredSize: bigint; uploadedBytes: bigint }>(
    session: T,
  ) {
    return {
      ...session,
      declaredSize: session.declaredSize.toString(),
      uploadedBytes: session.uploadedBytes.toString(),
    };
  }

  private async owned(actor: CurrentActor, id: string) {
    const session = await this.prisma.uploadSession.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        actorId: actor.userId,
      },
      include: { parts: { orderBy: { partNumber: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Upload session not found');
    if (
      session.expiresAt <= new Date() &&
      !['AVAILABLE', 'ABORTED'].includes(session.status)
    ) {
      await this.prisma.uploadSession.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      throw new ForbiddenException('Upload session expired');
    }
    return session;
  }

  async initiate(actor: CurrentActor, data: InitiateUploadDto) {
    if (data.declaredSize > this.environment.MAX_OBJECT_SIZE_BYTES)
      throw new PayloadTooLargeException('Object exceeds configured limit');
    const extension = extname(data.originalFilename).toLowerCase();
    if (
      ![
        '.pdf',
        '.docx',
        '.xlsx',
        '.csv',
        '.zip',
        '.jpg',
        '.jpeg',
        '.png',
        '.mp4',
        '.dwg',
      ].includes(extension)
    )
      throw new UnprocessableEntityException('File extension is not allowed');
    const { partSize, totalParts } = uploadParts(
      data.declaredSize,
      this.environment.UPLOAD_PART_SIZE_BYTES,
    );
    const id = randomUUID();
    const storageKey = `${actor.organizationId}/${id}${extension}`;
    await mkdir(join(this.environment.LOCAL_UPLOAD_PATH, id), {
      recursive: true,
    });
    return this.view(
      await this.prisma.uploadSession.create({
        data: {
          id,
          organizationId: actor.organizationId,
          actorId: actor.userId,
          originalFilename: basename(data.originalFilename),
          declaredSize: BigInt(data.declaredSize),
          mimeType: data.mimeType,
          storageKey,
          partSize,
          totalParts,
          checksum: data.checksum,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
    );
  }

  async get(actor: CurrentActor, id: string) {
    return this.view(await this.owned(actor, id));
  }

  async part(
    actor: CurrentActor,
    id: string,
    partNumber: number,
    expectedChecksum: string,
    body: Readable,
  ) {
    const session = await this.owned(actor, id);
    if (!['INITIATED', 'UPLOADING'].includes(session.status))
      throw new ConflictException('Upload is not writable');
    if (partNumber > session.totalParts)
      throw new UnprocessableEntityException('Invalid part number');
    const path = join(
      this.environment.LOCAL_UPLOAD_PATH,
      id,
      `${partNumber}.part`,
    );
    await pipeline(body, createWriteStream(path, { flags: 'w' }));
    const details = await stat(path);
    if (details.size > session.partSize || details.size === 0) {
      await rm(path, { force: true });
      throw new PayloadTooLargeException('Invalid part size');
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    const checksum = hash.digest('hex');
    if (checksum !== expectedChecksum) {
      await rm(path, { force: true });
      throw new UnprocessableEntityException('Part checksum mismatch');
    }
    await this.prisma.uploadPart.upsert({
      where: {
        uploadSessionId_partNumber: { uploadSessionId: id, partNumber },
      },
      create: {
        uploadSessionId: id,
        partNumber,
        size: details.size,
        checksum,
        storagePath: path,
      },
      update: { size: details.size, checksum, storagePath: path },
    });
    const aggregate = await this.prisma.uploadPart.aggregate({
      where: { uploadSessionId: id },
      _sum: { size: true },
    });
    return this.view(
      await this.prisma.uploadSession.update({
        where: { id },
        data: {
          status: 'UPLOADING',
          uploadedBytes: BigInt(aggregate._sum.size || 0),
        },
      }),
    );
  }

  async complete(actor: CurrentActor, id: string, expectedChecksum: string) {
    const session = await this.owned(actor, id);
    if (session.status === 'AVAILABLE') return this.view(session);
    if (
      session.parts.length !== session.totalParts ||
      session.uploadedBytes !== session.declaredSize
    )
      throw new ConflictException('Upload is incomplete');
    await this.prisma.uploadSession.update({
      where: { id },
      data: { status: 'VERIFYING' },
    });
    const finalPath = join(
      this.environment.LOCAL_UPLOAD_PATH,
      session.storageKey,
    );
    await mkdir(join(finalPath, '..'), { recursive: true });
    const output = createWriteStream(finalPath, { flags: 'wx' });
    for (const part of session.parts)
      await pipeline(createReadStream(part.storagePath), output, {
        end: false,
      });
    output.end();
    await finished(output);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(finalPath)) hash.update(chunk);
    if (hash.digest('hex') !== expectedChecksum) {
      await rm(finalPath, { force: true });
      await this.prisma.uploadSession.update({
        where: { id },
        data: { status: 'FAILED' },
      });
      throw new UnprocessableEntityException('Object checksum mismatch');
    }
    await rm(join(this.environment.LOCAL_UPLOAD_PATH, id), {
      recursive: true,
      force: true,
    });
    return this.view(
      await this.prisma.uploadSession.update({
        where: { id },
        data: {
          status: 'AVAILABLE',
          checksum: expectedChecksum,
          completedAt: new Date(),
        },
      }),
    );
  }

  async abort(actor: CurrentActor, id: string) {
    const session = await this.owned(actor, id);
    if (session.status === 'AVAILABLE')
      throw new ConflictException('Completed upload cannot be aborted');
    await rm(join(this.environment.LOCAL_UPLOAD_PATH, id), {
      recursive: true,
      force: true,
    });
    return this.view(
      await this.prisma.uploadSession.update({
        where: { id },
        data: { status: 'ABORTED', abortedAt: new Date() },
      }),
    );
  }

  async refresh(actor: CurrentActor, id: string) {
    const session = await this.owned(actor, id);
    if (!['INITIATED', 'UPLOADING'].includes(session.status))
      throw new ConflictException('Upload cannot be refreshed');
    return this.view(
      await this.prisma.uploadSession.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      }),
    );
  }
}
