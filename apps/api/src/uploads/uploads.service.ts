import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, UploadSession, FileAsset } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { FileHandle, open, readdir, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { CurrentActor } from '../access-control/current-actor';
import { PROJECT_CHAT_TRANSACTION_TIMEOUT_MS } from '../access-control/project-chat.policy';
import { readEnvironment } from '../config/env';
import {
  createPrivateWriteStream,
  ensurePrivateDirectory,
  FileStorage,
} from '../files/file-storage';
import { safeFilename } from '../files/filename';
import { FilesService } from '../files/files.service';
import {
  assertFileCapacity,
  assertUploadDiskSpace,
  lockOrganizationFileCapacity,
} from '../files/file-quota';
import { PrismaService } from '../prisma.service';
import { ProjectProductsService } from '../projects/project-products.service';
import { ProjectStageOneService } from '../projects/project-stage-one.service';
import {
  InitiateUploadDto,
  RecoverUploadsQuery,
  SubmitUploadsDto,
  UploadConstraintsQuery,
} from './uploads.dto';

export const uploadTypes = {
  '.pdf': { canonical: 'application/pdf', declared: ['application/pdf'] },
  '.docx': {
    canonical:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    declared: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  '.xlsx': {
    canonical:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    declared: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  '.csv': { canonical: 'text/csv', declared: ['text/csv'] },
  '.txt': {
    canonical: 'text/plain',
    declared: ['text/plain', 'application/octet-stream'],
  },
  '.md': {
    canonical: 'text/markdown',
    declared: ['text/markdown', 'text/plain', 'application/octet-stream'],
  },
  '.pptx': {
    canonical:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    declared: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  '.zip': {
    canonical: 'application/zip',
    declared: ['application/zip', 'application/x-zip-compressed'],
  },
  '.jpg': { canonical: 'image/jpeg', declared: ['image/jpeg'] },
  '.jpeg': { canonical: 'image/jpeg', declared: ['image/jpeg'] },
  '.png': { canonical: 'image/png', declared: ['image/png'] },
  '.mp4': { canonical: 'video/mp4', declared: ['video/mp4'] },
  '.dwg': {
    canonical: 'application/acad',
    declared: [
      'application/acad',
      'application/dwg',
      'image/vnd.dwg',
      'application/octet-stream',
    ],
  },
} as const;
const chatExtensions = Object.keys(uploadTypes) as (keyof typeof uploadTypes)[];
const allowedExtensions = chatExtensions.filter(
  (extension) => !['.txt', '.md', '.pptx'].includes(extension),
);
const maximumZipCentralDirectoryBytes = 1_048_576;
const uploadSessionExpiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
const uploadSessionMaximumLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maximumInFlightPartStreams = 20;
const maximumActorInFlightPartStreams = 4;
const verificationLeaseCutoff = () => new Date(Date.now() - 15 * 60 * 1000);
const stagingCleanupRetryCutoff = () => new Date(Date.now() - 15 * 60 * 1000);
const finalObjectGraceMs = 48 * 60 * 60 * 1000;
const uploadStorageKey = (
  organizationId: string,
  id: string,
  now = new Date(),
) =>
  `${organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
const modernUploadStorageKey = /^[0-9a-f-]+\/\d{4}\/\d{2}\/[0-9a-f-]+$/;
const legacyUploadStorageKey =
  /^([0-9a-f-]+)\/([0-9a-f-]+)\.(?:pdf|docx|xlsx|csv|zip|jpe?g|png|mp4|dwg)$/;

type SubmittedDocument =
  | Awaited<ReturnType<ProjectStageOneService['linkUploadFileInTransaction']>>
  | Awaited<ReturnType<ProjectProductsService['linkUploadFileInTransaction']>>;
type SubmitUploadsResult = {
  items: {
    sessionId: string;
    fileAssetId: string;
    document: SubmittedDocument;
  }[];
};

export function validUploadHeader(
  extension: keyof typeof uploadTypes,
  header: Buffer,
) {
  if (extension === '.pdf') return header.subarray(0, 5).toString() === '%PDF-';
  if (extension === '.jpg' || extension === '.jpeg')
    return header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (extension === '.png')
    return header
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.zip')
    return ['504b0304', '504b0506', '504b0708'].includes(
      header.subarray(0, 4).toString('hex'),
    );
  if (extension === '.mp4') return header.subarray(4, 8).toString() === 'ftyp';
  if (extension === '.dwg') return header.subarray(0, 4).toString() === 'AC10';
  return false;
}

async function readRange(file: FileHandle, length: number, position: number) {
  const buffer = Buffer.alloc(length);
  let bytesRead = 0;
  while (bytesRead < length) {
    const result = await file.read(
      buffer,
      bytesRead,
      length - bytesRead,
      position + bytesRead,
    );
    if (!result.bytesRead) return null;
    bytesRead += result.bytesRead;
  }
  return buffer;
}

function safeZip64Number(value: bigint, maximum = Number.MAX_SAFE_INTEGER) {
  return value <= BigInt(maximum) ? Number(value) : null;
}

function zip64EntryMetadata(
  extra: Buffer,
  compressedSize32: number,
  uncompressedSize32: number,
  localOffset32: number,
  startingDisk16: number,
) {
  let offset = 0;
  let zip64: Buffer | undefined;
  while (offset < extra.length) {
    if (offset + 4 > extra.length) return null;
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > extra.length) return null;
    if (id === 0x0001) {
      if (zip64) return null;
      zip64 = extra.subarray(offset, offset + size);
    }
    offset += size;
  }
  const needsUncompressed = uncompressedSize32 === 0xffffffff;
  const needsCompressed = compressedSize32 === 0xffffffff;
  const needsLocalOffset = localOffset32 === 0xffffffff;
  const needsStartingDisk = startingDisk16 === 0xffff;
  if (
    !needsUncompressed &&
    !needsCompressed &&
    !needsLocalOffset &&
    !needsStartingDisk
  )
    return zip64
      ? null
      : {
          compressedSize: compressedSize32,
          uncompressedSize: uncompressedSize32,
          localOffset: localOffset32,
          startingDisk: startingDisk16,
        };
  if (!zip64) return null;
  let cursor = 0;
  const read64 = () => {
    if (cursor + 8 > zip64.length) return null;
    const value = safeZip64Number(zip64.readBigUInt64LE(cursor));
    cursor += 8;
    return value;
  };
  const uncompressedSize = needsUncompressed ? read64() : uncompressedSize32;
  const compressedSize = needsCompressed ? read64() : compressedSize32;
  const localOffset = needsLocalOffset ? read64() : localOffset32;
  let startingDisk: number | null = startingDisk16;
  if (needsStartingDisk) {
    if (cursor + 4 > zip64.length) return null;
    startingDisk = zip64.readUInt32LE(cursor);
    cursor += 4;
  }
  return uncompressedSize === null ||
    compressedSize === null ||
    localOffset === null ||
    cursor !== zip64.length
    ? null
    : { compressedSize, uncompressedSize, localOffset, startingDisk };
}

async function validOpenXmlContainer(
  path: string,
  requiredDirectory: 'word/' | 'xl/' | 'ppt/',
) {
  try {
    const details = await stat(path);
    if (!Number.isSafeInteger(details.size) || details.size < 22) return false;
    const file = await open(path, 'r');
    try {
      const prefix = await readRange(file, 4, 0);
      if (!prefix || prefix.readUInt32LE(0) !== 0x04034b50) return false;
      const tailSize = Math.min(details.size, 65_577);
      const tail = await readRange(file, tailSize, details.size - tailSize);
      if (!tail) return false;
      let endOffset = -1;
      for (let offset = tail.length - 22; offset >= 0; offset--) {
        if (
          tail.readUInt32LE(offset) === 0x06054b50 &&
          offset + 22 + tail.readUInt16LE(offset + 20) === tail.length
        ) {
          endOffset = offset;
          break;
        }
      }
      if (endOffset < 0) return false;
      const absoluteEndOffset = details.size - tailSize + endOffset;
      if (
        tail.readUInt16LE(endOffset + 4) !== 0 ||
        tail.readUInt16LE(endOffset + 6) !== 0
      )
        return false;
      const entriesOnDisk16 = tail.readUInt16LE(endOffset + 8);
      const totalEntries16 = tail.readUInt16LE(endOffset + 10);
      const centralSize32 = tail.readUInt32LE(endOffset + 12);
      const centralOffset32 = tail.readUInt32LE(endOffset + 16);
      const usesZip64 =
        entriesOnDisk16 === 0xffff ||
        totalEntries16 === 0xffff ||
        centralSize32 === 0xffffffff ||
        centralOffset32 === 0xffffffff;
      const locatorOffset = absoluteEndOffset - 20;
      const locator =
        locatorOffset >= 0 ? await readRange(file, 20, locatorOffset) : null;
      const hasLocator = locator?.readUInt32LE(0) === 0x07064b50;
      let entriesOnDisk = entriesOnDisk16;
      let totalEntries = totalEntries16;
      let centralSize = centralSize32;
      let centralOffset = centralOffset32;
      let centralEnd = absoluteEndOffset;
      if (usesZip64) {
        if (
          !locator ||
          !hasLocator ||
          locator.readUInt32LE(4) !== 0 ||
          locator.readUInt32LE(16) !== 1
        )
          return false;
        const zip64EndOffset = safeZip64Number(
          locator.readBigUInt64LE(8),
          locatorOffset - 56,
        );
        if (zip64EndOffset === null) return false;
        const zip64End = await readRange(file, 56, zip64EndOffset);
        if (!zip64End || zip64End.readUInt32LE(0) !== 0x06064b50) return false;
        const zip64RecordSize = zip64End.readBigUInt64LE(4);
        if (
          zip64RecordSize < 44n ||
          zip64End.readUInt32LE(16) !== 0 ||
          zip64End.readUInt32LE(20) !== 0 ||
          BigInt(zip64EndOffset) + 12n + zip64RecordSize !==
            BigInt(locatorOffset)
        )
          return false;
        const entriesOnDisk64 = zip64End.readBigUInt64LE(24);
        const totalEntries64 = zip64End.readBigUInt64LE(32);
        const centralSize64 = zip64End.readBigUInt64LE(40);
        const centralOffset64 = zip64End.readBigUInt64LE(48);
        if (
          (entriesOnDisk16 !== 0xffff &&
            BigInt(entriesOnDisk16) !== entriesOnDisk64) ||
          (totalEntries16 !== 0xffff &&
            BigInt(totalEntries16) !== totalEntries64) ||
          (centralSize32 !== 0xffffffff &&
            BigInt(centralSize32) !== centralSize64) ||
          (centralOffset32 !== 0xffffffff &&
            BigInt(centralOffset32) !== centralOffset64)
        )
          return false;
        entriesOnDisk =
          safeZip64Number(entriesOnDisk64, maximumZipCentralDirectoryBytes) ??
          -1;
        totalEntries =
          safeZip64Number(totalEntries64, maximumZipCentralDirectoryBytes) ??
          -1;
        centralSize =
          safeZip64Number(centralSize64, maximumZipCentralDirectoryBytes) ?? -1;
        centralOffset = safeZip64Number(centralOffset64, zip64EndOffset) ?? -1;
        centralEnd = zip64EndOffset;
      } else if (hasLocator) {
        return false;
      }
      if (
        entriesOnDisk !== totalEntries ||
        totalEntries === 0 ||
        totalEntries < 0 ||
        centralSize < 0 ||
        centralOffset < 0 ||
        centralSize > maximumZipCentralDirectoryBytes ||
        totalEntries * 46 > centralSize ||
        centralOffset + centralSize !== centralEnd
      )
        return false;
      const central = await readRange(file, centralSize, centralOffset);
      if (!central) return false;
      let cursor = 0;
      let entries = 0;
      let hasContentTypes = false;
      let hasRequiredDirectory = false;
      while (cursor < central.length) {
        if (
          cursor + 46 > central.length ||
          central.readUInt32LE(cursor) !== 0x02014b50
        )
          return false;
        const compressedSize32 = central.readUInt32LE(cursor + 20);
        const uncompressedSize32 = central.readUInt32LE(cursor + 24);
        const nameLength = central.readUInt16LE(cursor + 28);
        const extraLength = central.readUInt16LE(cursor + 30);
        const commentLength = central.readUInt16LE(cursor + 32);
        const startingDisk16 = central.readUInt16LE(cursor + 34);
        const localOffset32 = central.readUInt32LE(cursor + 42);
        const entryLength = 46 + nameLength + extraLength + commentLength;
        if (cursor + entryLength > central.length) return false;
        const nameStart = cursor + 46;
        const name = central
          .subarray(nameStart, nameStart + nameLength)
          .toString('utf8');
        const extra = central.subarray(
          nameStart + nameLength,
          nameStart + nameLength + extraLength,
        );
        const metadata = zip64EntryMetadata(
          extra,
          compressedSize32,
          uncompressedSize32,
          localOffset32,
          startingDisk16,
        );
        if (
          !metadata ||
          metadata.startingDisk !== 0 ||
          metadata.localOffset >= centralOffset
        )
          return false;
        hasContentTypes ||= name === '[Content_Types].xml';
        hasRequiredDirectory ||=
          name === requiredDirectory || name.startsWith(requiredDirectory);
        cursor += entryLength;
        entries++;
      }
      return (
        entries === totalEntries && hasContentTypes && hasRequiredDirectory
      );
    } finally {
      await file.close();
    }
  } catch {
    return false;
  }
}

export async function validUploadContent(
  extension: keyof typeof uploadTypes,
  path: string,
) {
  if (extension === '.docx') return validOpenXmlContainer(path, 'word/');
  if (extension === '.xlsx') return validOpenXmlContainer(path, 'xl/');
  if (extension === '.pptx') return validOpenXmlContainer(path, 'ppt/');
  const header = Buffer.alloc(4_096);
  const file = await open(path, 'r');
  const { bytesRead } = await file
    .read(header, 0, header.length, 0)
    .finally(() => file.close());
  return validUploadHeader(extension, header.subarray(0, bytesRead));
}

export function uploadByteLimit(maximumBytes: number) {
  let receivedBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      callback(
        receivedBytes > maximumBytes
          ? new PayloadTooLargeException('Invalid part size')
          : null,
        chunk,
      );
    },
  });
}

export function uploadParts(
  size: number,
  configuredPartSize = 67_108_864,
  maxParts = 10_000,
) {
  const partSize = Math.max(configuredPartSize, Math.ceil(size / maxParts));
  return { partSize, totalParts: Math.ceil(size / partSize) };
}

function expectedUploadPartSize(
  session: { declaredSize: bigint; partSize: number; totalParts: number },
  partNumber: number,
) {
  return partNumber === session.totalParts
    ? Number(
        session.declaredSize -
          BigInt(session.partSize) * BigInt(session.totalParts - 1),
      )
    : session.partSize;
}

function hasValidUploadPartGeometry(session: {
  declaredSize: bigint;
  partSize: number;
  totalParts: number;
  parts: { partNumber: number; size: number }[];
}) {
  return session.parts.every(
    (part) =>
      part.partNumber >= 1 &&
      part.partNumber <= session.totalParts &&
      part.size === expectedUploadPartSize(session, part.partNumber),
  );
}

export function uploadConstraints(
  configuredMaximumBytes: number,
  chat = false,
) {
  return {
    maxBytes: configuredMaximumBytes,
    allowedExtensions: [...(chat ? chatExtensions : allowedExtensions)],
  };
}

@Injectable()
export class UploadsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadsService.name);
  private readonly environment = readEnvironment();
  // ponytail: LOCAL storage is process-local; use a distributed claim with shared storage.
  private readonly inFlightParts = new Map<string, string>();
  private readonly inFlightFinalizations = new Set<string>();
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private cleanupRunning?: Promise<void>;
  private reservationCleanupRunning?: Promise<void>;
  private orphanCursor = 0;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(ProjectProductsService)
    private readonly products: ProjectProductsService,
    @Optional()
    @Inject(ProjectStageOneService)
    private readonly stageOne?: ProjectStageOneService,
    @Optional()
    @Inject(FilesService)
    private readonly files?: FilesService,
  ) {}

  async onModuleInit() {
    await ensurePrivateDirectory(this.environment.LOCAL_UPLOAD_PATH);
    await ensurePrivateDirectory(this.stagingRoot());
    void this.cleanupStaging().catch((error) =>
      this.logCleanupError('Upload staging cleanup failed', error),
    );
    void this.cleanupStorageReservations().catch((error) =>
      this.logCleanupError('Storage reservation cleanup failed', error),
    );
    this.cleanupTimer = setInterval(
      () => {
        void this.cleanupStaging().catch((error) =>
          this.logCleanupError('Upload staging cleanup failed', error),
        );
        void this.cleanupStorageReservations().catch((error) =>
          this.logCleanupError('Storage reservation cleanup failed', error),
        );
      },
      5 * 60 * 1000,
    );
    this.cleanupTimer.unref();
  }

  private logCleanupError(message: string, error: unknown) {
    this.logger.error(
      message,
      error instanceof Error ? error.stack : String(error),
    );
  }

  async onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await Promise.all([
      this.cleanupRunning?.catch(() => undefined),
      this.reservationCleanupRunning?.catch(() => undefined),
    ]);
  }

  private stagingRoot() {
    return join(this.environment.LOCAL_UPLOAD_PATH, 'staging');
  }

  private stagingPath(id: string) {
    return join(this.stagingRoot(), id);
  }

  private async purgeUnreferencedParts(session: {
    id: string;
    parts: { storagePath: string }[];
  }) {
    const directory = resolve(this.stagingPath(session.id));
    await ensurePrivateDirectory(directory);
    const legacyDirectory = resolve(
      this.environment.LOCAL_UPLOAD_PATH,
      session.id,
    );
    const referenced = new Set(
      session.parts.map(({ storagePath }) => {
        const path = resolve(storagePath);
        if (![directory, legacyDirectory].includes(dirname(path)))
          throw new ConflictException('Upload part path is invalid');
        return path;
      }),
    );
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      (error: unknown) => {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return [];
        throw error;
      },
    );
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (!referenced.has(path))
        await rm(path, { recursive: entry.isDirectory(), force: true });
    }
  }

  private async releaseStaging(id: string) {
    if (this.inFlightParts.has(id)) return false;
    const attemptedAt = new Date();
    try {
      const removeFinalAsset = await this.retireUnsubmittedAsset(id);
      const session = await this.prisma.uploadSession.findUnique({
        where: { id },
        select: {
          fileAssetId: true,
          storageKey: true,
          parts: { select: { storagePath: true } },
        },
      });
      if (!session) return false;
      if (modernUploadStorageKey.test(session.storageKey))
        await this.storage.removePending(session.storageKey);
      if (!session.fileAssetId || removeFinalAsset)
        await this.storage.remove(session.storageKey);
      await rm(this.stagingPath(id), {
        recursive: true,
        force: true,
      });
      const legacyDirectory = resolve(this.environment.LOCAL_UPLOAD_PATH, id);
      for (const { storagePath } of session.parts ?? []) {
        const path = resolve(storagePath);
        if (dirname(path) !== legacyDirectory) continue;
        await rm(path, { force: true });
      }
      await rm(join(legacyDirectory, 'complete'), { force: true });
      await rmdir(legacyDirectory).catch((error: unknown) => {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          return;
        throw error;
      });
      await this.prisma.uploadSession.updateMany({
        where: { id },
        data: {
          stagingReleasedAt: attemptedAt,
          stagingCleanupAttemptedAt: attemptedAt,
        },
      });
      return true;
    } catch {
      await this.prisma.uploadSession
        .updateMany({
          where: { id },
          data: { stagingCleanupAttemptedAt: attemptedAt },
        })
        .catch(() => undefined);
      return false;
    }
  }

  private async retireUnsubmittedAsset(id: string) {
    const candidate = await this.prisma.uploadSession.findUnique({
      where: { id },
      select: { projectId: true, status: true, fileAssetId: true },
    });
    if (
      !candidate?.projectId ||
      !candidate.fileAssetId ||
      !['ABORTED', 'EXPIRED'].includes(candidate.status)
    )
      return false;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Project"
        WHERE "id" = ${candidate.projectId}::uuid
        FOR UPDATE
      `);
      if (!project.length) return false;
      await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "UploadSession" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const session = await tx.uploadSession.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          status: true,
          fileAssetId: true,
        },
      });
      if (
        session.projectId !== candidate.projectId ||
        !['ABORTED', 'EXPIRED'].includes(session.status) ||
        !session.fileAssetId
      )
        return false;
      await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "FileAsset" WHERE "id" = ${session.fileAssetId}::uuid FOR UPDATE`;
      const file = await tx.fileAsset.findFirst({
        where: {
          id: session.fileAssetId,
          organizationId: session.organizationId,
        },
        select: {
          id: true,
          deletedAt: true,
          aiSources: { take: 1, select: { id: true } },
          aiProjectSources: { take: 1, select: { id: true } },
        },
      });
      if (!file) return false;
      if (file.aiSources?.length || file.aiProjectSources?.length) return false;
      const referenced = (
        await Promise.all([
          tx.entityAttachment.findFirst({
            where: { fileAssetId: file.id },
            select: { id: true },
          }),
          tx.projectRequiredDocument.findFirst({
            where: { currentFileAssetId: file.id },
            select: { id: true },
          }),
          tx.projectRequiredDocumentVersion.findFirst({
            where: { fileAssetId: file.id },
            select: { id: true },
          }),
          tx.projectStageOneDocument.findFirst({
            where: { currentFileAssetId: file.id },
            select: { id: true },
          }),
          tx.projectStageOneDocumentVersion.findFirst({
            where: { fileAssetId: file.id },
            select: { id: true },
          }),
          tx.importJob.findFirst({
            where: { fileAssetId: file.id },
            select: { id: true },
          }),
        ])
      ).some(Boolean);
      if (referenced) return false;
      if (!file.deletedAt) {
        const retired = await tx.fileAsset.updateMany({
          where: {
            id: file.id,
            organizationId: session.organizationId,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });
        if (retired.count !== 1) return false;
      }
      await tx.uploadSession.updateMany({
        where: { id, fileAssetId: file.id },
        data: { stagingReleasedAt: null },
      });
      return true;
    });
  }

  private async recoverVerificationLease(session: {
    id: string;
    fileAssetId: string | null;
    storageKey: string;
    expiresAt: Date;
    verificationClaimId: string | null;
    verificationStartedAt: Date | null;
  }) {
    const now = new Date();
    const status = session.expiresAt <= now ? 'EXPIRED' : 'FAILED';
    const recoveryClaimId = randomUUID();
    const takeover = await this.prisma.uploadSession.updateMany({
      where: {
        id: session.id,
        status: 'VERIFYING',
        fileAssetId: null,
        verificationClaimId: session.verificationClaimId,
        verificationStartedAt: session.verificationStartedAt,
      },
      data: {
        verificationClaimId: recoveryClaimId,
        verificationStartedAt: now,
      },
    });
    if (!takeover.count) return null;
    try {
      await this.storage.removePending(
        session.storageKey,
        session.verificationClaimId ?? undefined,
      );
      await this.storage.remove(session.storageKey);
      const legacy = legacyUploadStorageKey.exec(session.storageKey);
      if (legacy?.[2] === session.id)
        await rm(
          resolve(
            this.environment.LOCAL_UPLOAD_PATH,
            ...session.storageKey.split('/'),
          ),
          { force: true },
        );
    } catch {
      return null;
    }
    const recovered = await this.prisma.uploadSession.updateMany({
      where: {
        id: session.id,
        status: 'VERIFYING',
        fileAssetId: null,
        verificationClaimId: recoveryClaimId,
      },
      data: {
        status,
        verificationClaimId: null,
        verificationStartedAt: null,
      },
    });
    return recovered.count ? status : null;
  }

  async cleanupStaging(limit = 100) {
    if (this.cleanupRunning) return this.cleanupRunning;
    const work = this.cleanupStagingBatch(
      Math.max(1, Math.min(limit, 100)),
    ).finally(() => {
      if (this.cleanupRunning === work) this.cleanupRunning = undefined;
    });
    this.cleanupRunning = work;
    return work;
  }

  private async cleanupStagingBatch(limit: number) {
    const now = new Date();
    const cutoff = verificationLeaseCutoff();
    const sessions = await this.prisma.uploadSession.findMany({
      where: {
        AND: [
          {
            OR: [
              { stagingCleanupAttemptedAt: null },
              {
                stagingCleanupAttemptedAt: {
                  lte: stagingCleanupRetryCutoff(),
                },
              },
            ],
          },
        ],
        OR: [
          {
            stagingReleasedAt: null,
            OR: [
              { status: { in: ['AVAILABLE', 'ABORTED', 'EXPIRED'] } },
              { status: 'VERIFYING', fileAssetId: { not: null } },
              {
                status: 'VERIFYING',
                fileAssetId: null,
                OR: [
                  { verificationStartedAt: null },
                  { verificationStartedAt: { lte: cutoff } },
                ],
              },
              {
                status: { in: ['INITIATED', 'UPLOADING', 'FAILED'] },
                expiresAt: { lte: now },
              },
            ],
          },
          {
            stagingReleasedAt: { not: null },
            fileAssetId: { not: null },
            fileAsset: { is: { attachments: { none: {} } } },
            OR: [
              { status: { in: ['ABORTED', 'EXPIRED'] } },
              { status: 'AVAILABLE', expiresAt: { lte: now } },
            ],
          },
        ],
      },
      select: {
        id: true,
        status: true,
        fileAssetId: true,
        storageKey: true,
        expiresAt: true,
        verificationClaimId: true,
        verificationStartedAt: true,
      },
      orderBy: [
        {
          stagingCleanupAttemptedAt: { sort: 'asc', nulls: 'first' },
        },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
    for (const session of sessions) {
      if (
        this.inFlightFinalizations.has(session.id) ||
        this.inFlightParts.has(session.id)
      )
        continue;
      if (session.status === 'VERIFYING' && !session.fileAssetId) {
        const status = await this.recoverVerificationLease({
          ...session,
          storageKey: session.storageKey,
        });
        if (status !== 'EXPIRED') continue;
      } else if (
        session.status === 'AVAILABLE' &&
        session.fileAssetId &&
        session.expiresAt <= now
      ) {
        await this.prisma.uploadSession.updateMany({
          where: {
            id: session.id,
            status: 'AVAILABLE',
            fileAssetId: session.fileAssetId,
            expiresAt: { lte: now },
            fileAsset: { is: { attachments: { none: {} } } },
          },
          data: { status: 'EXPIRED' },
        });
      } else if (
        ['INITIATED', 'UPLOADING', 'FAILED'].includes(session.status)
      ) {
        const claim = await this.prisma.uploadSession.updateMany({
          where: {
            id: session.id,
            status: session.status as 'INITIATED' | 'UPLOADING' | 'FAILED',
            fileAssetId: null,
            expiresAt: { lte: now },
          },
          data: { status: 'EXPIRED' },
        });
        if (!claim.count) continue;
      }
      await this.releaseStaging(session.id);
    }
    const entries = await readdir(this.stagingRoot(), {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return [];
      throw error;
    });
    const allCandidates = entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            entry.name,
          ),
      )
      .map(({ name }) => name);
    const start = allCandidates.length
      ? this.orphanCursor % allCandidates.length
      : 0;
    const orphanCandidates = Array.from(
      { length: Math.min(limit, allCandidates.length) },
      (_, index) => allCandidates[(start + index) % allCandidates.length]!,
    );
    this.orphanCursor = start + orphanCandidates.length;
    if (!orphanCandidates.length) return;
    const known = new Set(
      (
        await this.prisma.uploadSession.findMany({
          where: { id: { in: orphanCandidates } },
          select: { id: true },
        })
      ).map(({ id }) => id),
    );
    const grace = Date.now() - 60 * 60 * 1000;
    await Promise.allSettled(
      orphanCandidates.flatMap((id) => {
        if (known.has(id)) return [];
        const path = this.stagingPath(id);
        return [
          stat(path).then((details) =>
            details.mtimeMs <= grace
              ? rm(path, { recursive: true, force: true })
              : undefined,
          ),
        ];
      }),
    );
  }

  async cleanupStorageReservations(limit = 100) {
    if (this.reservationCleanupRunning) return this.reservationCleanupRunning;
    const work = this.cleanupStorageReservationBatch(
      Math.max(1, Math.min(limit, 100)),
    ).finally(() => {
      if (this.reservationCleanupRunning === work)
        this.reservationCleanupRunning = undefined;
    });
    this.reservationCleanupRunning = work;
    return work;
  }

  private async cleanupStorageReservationBatch(limit: number) {
    const reservations = await this.prisma.fileStorageReservation.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, storageKey: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    for (const reservation of reservations)
      await this.prisma
        .$transaction(async (tx) => {
          const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT "id" FROM "FileStorageReservation"
            WHERE "id" = ${reservation.id}::uuid AND "expiresAt" <= NOW()
            FOR UPDATE
          `);
          if (!locked.length) return;
          const [fileAsset, quotationDocument, uploadSession] =
            await Promise.all([
              tx.fileAsset.findUnique({
                where: { storageKey: reservation.storageKey },
                select: { id: true },
              }),
              tx.quotationDocument.findUnique({
                where: { storageKey: reservation.storageKey },
                select: { id: true },
              }),
              tx.uploadSession.findFirst({
                where: { storageKey: reservation.storageKey },
                select: { id: true },
              }),
            ]);
          if (!fileAsset && !quotationDocument && !uploadSession) {
            await this.storage.removePending(
              reservation.storageKey,
              reservation.id,
            );
            await this.storage.remove(reservation.storageKey);
          }
          await tx.fileStorageReservation.delete({
            where: { id: reservation.id },
          });
        })
        .catch(async (error) => {
          this.logCleanupError('Storage reservation cleanup failed', error);
          await this.prisma.fileStorageReservation
            .updateMany({
              where: {
                id: reservation.id,
                expiresAt: { lte: new Date() },
              },
              data: {
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
              },
            })
            .catch((retryError) =>
              this.logCleanupError(
                'Storage reservation retry scheduling failed',
                retryError,
              ),
            );
        });
    await this.cleanupUntrackedFinalObjects(limit);
  }

  private async cleanupUntrackedFinalObjects(limit: number) {
    const scan = await this.storage.listFinalObjects(limit);
    const storageKeys = scan.objects
      .filter(
        ({ modifiedAt }) =>
          modifiedAt.getTime() <= Date.now() - finalObjectGraceMs,
      )
      .map(({ storageKey }) => storageKey);
    if (!storageKeys.length) return;
    const references = await Promise.all([
      this.prisma.fileAsset.findMany({
        where: { storageKey: { in: storageKeys } },
        select: { storageKey: true },
      }),
      this.prisma.quotationDocument.findMany({
        where: { storageKey: { in: storageKeys } },
        select: { storageKey: true },
      }),
      this.prisma.uploadSession.findMany({
        where: { storageKey: { in: storageKeys } },
        select: { storageKey: true },
      }),
      this.prisma.fileStorageReservation.findMany({
        where: { storageKey: { in: storageKeys } },
        select: { storageKey: true },
      }),
    ]);
    const referenced = new Set(
      references.flatMap((rows) => rows.map(({ storageKey }) => storageKey)),
    );
    for (const storageKey of storageKeys)
      if (!referenced.has(storageKey)) await this.storage.remove(storageKey);
  }

  private view<
    T extends {
      declaredSize: bigint;
      uploadedBytes: bigint;
      parts?: { partNumber: number; size: number; checksum: string }[];
      storageKey?: string;
      storageProvider?: string;
      providerUploadId?: string | null;
      idempotencyKey?: string | null;
      checksum?: string | null;
    },
  >(session: T, completed = false) {
    const {
      storageKey,
      storageProvider,
      providerUploadId,
      idempotencyKey,
      checksum,
      parts,
      ...value
    } = session;
    void storageKey;
    void storageProvider;
    void providerUploadId;
    void idempotencyKey;
    void checksum;
    return {
      ...value,
      declaredSize: session.declaredSize.toString(),
      uploadedBytes: session.uploadedBytes.toString(),
      uploadedParts:
        completed &&
        !('aiConversationId' in session && session.aiConversationId)
          ? undefined
          : (parts?.map(({ partNumber, size, checksum }) => ({
              partNumber,
              size,
              checksum,
            })) ?? []),
      constraints: uploadConstraints(
        'aiConversationId' in session && session.aiConversationId
          ? Math.min(10_000_000_000, this.environment.UPLOAD_MAX_FILE_BYTES)
          : this.environment.UPLOAD_MAX_FILE_BYTES,
        Boolean('aiConversationId' in session && session.aiConversationId),
      ),
    };
  }

  private async completedView(
    actor: CurrentActor,
    session: Pick<
      UploadSession,
      | 'fileAssetId'
      | 'uploadedBytes'
      | 'checksum'
      | 'originalFilename'
      | 'mimeType'
      | 'aiConversationId'
      | 'idempotencyKey'
      | 'projectId'
      | 'requiredDocumentId'
      | 'stageOneDocumentId'
    >,
  ) {
    const source = session.aiConversationId
      ? await this.prisma.$transaction(
          async (tx) => {
            await this.assertTargetInTransaction(tx, actor, session);
            const replay = await this.files!.replayAiUpload(
              actor,
              session.aiConversationId!,
              session.idempotencyKey!,
              createHash('sha256')
                .update(
                  JSON.stringify([
                    session.checksum,
                    session.originalFilename,
                    session.mimeType,
                  ]),
                )
                .digest('hex'),
              tx,
            );
            if (!replay || replay.fileAssetId !== session.fileAssetId)
              throw new NotFoundException();
            return replay;
          },
          { timeout: PROJECT_CHAT_TRANSACTION_TIMEOUT_MS },
        )
      : null;
    return {
      status: 'AVAILABLE' as const,
      fileAssetId: session.fileAssetId,
      uploadedBytes: session.uploadedBytes.toString(),
      ...(source
        ? { sourceId: source.id, version: source.version, label: source.label }
        : {}),
    };
  }

  private recoveryView(session: {
    id: string;
    projectId: string | null;
    requiredDocumentId: string | null;
    stageOneDocumentId: string | null;
    submittingOfficerId?: string | null;
    originalFilename: string;
    declaredSize: bigint;
    uploadedBytes: bigint;
    mimeType: string;
    status: string;
    stageOneDocument?: {
      requiredDocumentId: string | null;
      stageKey: string;
      workstreamKey: string;
      submittedOfficerId: string;
    } | null;
  }) {
    return {
      id: session.id,
      projectId: session.projectId,
      requiredDocumentId: session.requiredDocumentId,
      stageOneDocumentId: session.stageOneDocumentId,
      submittingOfficerId: session.submittingOfficerId ?? null,
      originalFilename: session.originalFilename,
      declaredSize: session.declaredSize.toString(),
      uploadedBytes: session.uploadedBytes.toString(),
      mimeType: session.mimeType,
      status: session.status,
      ...('stageOneDocument' in session
        ? { stageOneDocument: session.stageOneDocument }
        : {}),
    };
  }

  private assertPermissions(actor: CurrentActor) {
    if (
      !actor.permissions.includes('file.upload') ||
      !actor.permissions.some((permission) =>
        ['project.document.manage', 'project.key_dossier.manage'].includes(
          permission,
        ),
      )
    )
      throw new ForbiddenException('Required permission is missing');
  }

  constraints(actor: CurrentActor, query?: UploadConstraintsQuery) {
    if (query?.aiConversationId)
      return this.target(actor, {
        projectId: query.projectId ?? null,
        requiredDocumentId: null,
        stageOneDocumentId: null,
        aiConversationId: query.aiConversationId,
        idempotencyKey: randomUUID(),
      }).then(() =>
        uploadConstraints(
          Math.min(10_000_000_000, this.environment.UPLOAD_MAX_FILE_BYTES),
          true,
        ),
      );
    this.assertPermissions(actor);
    return uploadConstraints(this.environment.UPLOAD_MAX_FILE_BYTES);
  }

  private async owned(actor: CurrentActor, id: string, terminalRead = false) {
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
      !session.projectId ||
      [
        session.requiredDocumentId,
        session.stageOneDocumentId,
        session.aiConversationId,
      ].filter(Boolean).length !== 1
    )
      throw new NotFoundException('Upload session not found');
    if (!session.aiConversationId) this.assertPermissions(actor);
    await this.target(actor, session);
    const now = new Date();
    if (
      session.status === 'VERIFYING' &&
      !session.fileAssetId &&
      !this.inFlightFinalizations.has(id) &&
      (!session.verificationStartedAt ||
        session.verificationStartedAt <= verificationLeaseCutoff())
    ) {
      const status = await this.recoverVerificationLease(session);
      if (!status)
        throw new ConflictException('Upload verification lease changed');
      if (status === 'EXPIRED') {
        await this.releaseStaging(id);
        if (terminalRead) return { ...session, status };
        throw new ForbiddenException('Upload session expired');
      }
      return {
        ...session,
        status,
        verificationClaimId: null,
        verificationStartedAt: null,
      };
    }
    if (
      session.expiresAt <= now &&
      session.status !== 'ABORTED' &&
      session.status !== 'VERIFYING'
    ) {
      const expiringAvailable =
        session.status === 'AVAILABLE' && Boolean(session.fileAssetId);
      const expired = await this.prisma.uploadSession.updateMany({
        where: {
          id,
          organizationId: actor.organizationId,
          actorId: actor.userId,
          status: { in: ['INITIATED', 'UPLOADING', 'FAILED', 'AVAILABLE'] },
          expiresAt: { lte: now },
          ...(expiringAvailable && {
            fileAssetId: session.fileAssetId!,
            fileAsset: { is: { attachments: { none: {} } } },
          }),
        },
        data: { status: 'EXPIRED' },
      });
      if (expired.count) await this.releaseStaging(id);
      if (!expired.count && expiringAvailable) {
        const current = await this.prisma.uploadSession.findFirst({
          where: {
            id,
            organizationId: actor.organizationId,
            actorId: actor.userId,
          },
          include: { parts: { orderBy: { partNumber: 'asc' } } },
        });
        if (
          current?.status === 'AVAILABLE' &&
          current.fileAssetId === session.fileAssetId
        )
          return current;
        if (terminalRead && current) return current;
        throw new ConflictException('Upload session changed');
      }
      if (terminalRead) return { ...session, status: 'EXPIRED' };
      throw new ForbiddenException('Upload session expired');
    }
    return session;
  }

  private target(
    actor: CurrentActor,
    session: {
      projectId: string | null;
      requiredDocumentId: string | null;
      stageOneDocumentId: string | null;
      aiConversationId?: string | null;
      idempotencyKey?: string | null;
    },
    db?: Prisma.TransactionClient,
  ) {
    if (session.aiConversationId) {
      if (!this.files) throw new NotFoundException('Upload session not found');
      return this.files
        .assertAiUpload(
          actor,
          session.aiConversationId,
          session.idempotencyKey ?? undefined,
          db ?? this.prisma,
        )
        .then((conversation) => {
          if (conversation.projectId !== session.projectId)
            throw new NotFoundException('Upload session not found');
          return conversation;
        });
    }
    if (session.stageOneDocumentId) {
      const args = [
        actor,
        session.projectId!,
        session.stageOneDocumentId,
      ] as const;
      return db
        ? this.stageOne!.assertUploadTarget(...args, db)
        : this.stageOne!.assertUploadTarget(...args);
    }
    const args = [
      actor,
      session.projectId!,
      session.requiredDocumentId!,
    ] as const;
    return db
      ? this.products.assertDocumentUpload(...args, db)
      : this.products.assertDocumentUpload(...args);
  }

  private async assertTargetInTransaction(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    session: {
      projectId: string | null;
      requiredDocumentId: string | null;
      stageOneDocumentId: string | null;
      aiConversationId?: string | null;
      idempotencyKey?: string | null;
    },
  ) {
    const project = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Project"
      WHERE "id" = ${session.projectId!}::uuid
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (!project.length)
      throw new NotFoundException({
        category: 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE',
        message: 'Dự án đã bị xóa hoặc không còn khả dụng.',
      });
    await this.target(actor, session, tx);
  }

  async initiate(
    actor: CurrentActor,
    data: InitiateUploadDto,
    mcpArtifactId?: string,
  ) {
    if (mcpArtifactId && !actor.mcpAuthorizationId)
      throw new ForbiddenException();
    if (!data.aiConversationId) this.assertPermissions(actor);
    const suppliedKey = (
      data.idempotencyKey ?? data.stageOneDocument?.idempotencyKey
    )?.trim();
    const idempotencyKey = data.aiConversationId
      ? suppliedKey?.toLowerCase()
      : suppliedKey;
    if (
      !idempotencyKey ||
      (data.idempotencyKey &&
        data.stageOneDocument?.idempotencyKey &&
        data.idempotencyKey.trim() !==
          data.stageOneDocument.idempotencyKey.trim())
    )
      throw new UnprocessableEntityException('Invalid upload initiation key');
    if (data.aiConversationId)
      await this.target(actor, {
        projectId: data.projectId,
        requiredDocumentId: data.requiredDocumentId ?? null,
        stageOneDocumentId: null,
        aiConversationId: data.aiConversationId,
        idempotencyKey,
      });
    const originalFilename = safeFilename(data.originalFilename);
    if (!originalFilename)
      throw new UnprocessableEntityException('Invalid filename');
    if (data.requiredDocumentId)
      await this.products.assertDocumentUpload(
        actor,
        data.projectId,
        data.requiredDocumentId,
      );
    const constraints = uploadConstraints(
      data.aiConversationId
        ? Math.min(10_000_000_000, this.environment.UPLOAD_MAX_FILE_BYTES)
        : this.environment.UPLOAD_MAX_FILE_BYTES,
      Boolean(data.aiConversationId),
    );
    if (!Number.isSafeInteger(data.declaredSize) || data.declaredSize < 1)
      throw new UnprocessableEntityException(
        'Declared size must be an integer',
      );
    if (data.declaredSize > constraints.maxBytes)
      throw new PayloadTooLargeException('Object exceeds configured limit');
    const extension = extname(originalFilename).toLowerCase();
    if (
      !constraints.allowedExtensions.includes(
        extension as (typeof allowedExtensions)[number],
      )
    )
      throw new UnprocessableEntityException('File extension is not allowed');
    const type = uploadTypes[extension as keyof typeof uploadTypes];
    if (
      !(type.declared as readonly string[]).includes(
        data.mimeType.toLowerCase(),
      )
    )
      throw new UnprocessableEntityException('Declared MIME is not allowed');
    const { partSize, totalParts } = uploadParts(
      data.declaredSize,
      this.environment.UPLOAD_PART_SIZE_BYTES,
    );
    const id = randomUUID();
    const sessionData = {
      id,
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: data.projectId,
      requiredDocumentId: data.requiredDocumentId,
      aiConversationId: data.aiConversationId,
      mcpArtifactId,
      submittingOfficerId: data.stageOneDocument?.submittedOfficerId,
      idempotencyKey,
      originalFilename,
      declaredSize: BigInt(data.declaredSize),
      mimeType: type.canonical,
      storageKey: uploadStorageKey(actor.organizationId, id),
      partSize,
      totalParts,
      checksum: data.checksum,
      expiresAt: uploadSessionExpiry(),
    };
    const result = await this.prisma
      .$transaction(
        async (tx) => {
          await lockOrganizationFileCapacity(tx, actor.organizationId);
          if (data.aiConversationId)
            await this.assertTargetInTransaction(tx, actor, {
              ...sessionData,
              requiredDocumentId: null,
              stageOneDocumentId: null,
            });
          if (data.requiredDocumentId) {
            const project = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "Project"
          WHERE "id" = ${data.projectId}::uuid
            AND "organizationId" = ${actor.organizationId}::uuid
            AND "deletedAt" IS NULL
          FOR UPDATE
        `);
            if (!project.length)
              throw new NotFoundException({
                category: 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE',
                message: 'Dự án đã bị xóa hoặc không còn khả dụng.',
              });
            await this.products.assertDocumentUpload(
              actor,
              data.projectId,
              data.requiredDocumentId,
            );
          }
          const stageOneDocument = data.stageOneDocument
            ? await this.stageOne!.createUploadTargetInTransaction(
                tx,
                actor,
                data.projectId,
                { ...data.stageOneDocument, idempotencyKey },
              )
            : null;
          const currentSessionData = {
            ...sessionData,
            stageOneDocumentId: stageOneDocument?.id,
          };
          const existing = await tx.uploadSession.findFirst({
            where: {
              organizationId: actor.organizationId,
              projectId: data.projectId,
              requiredDocumentId:
                stageOneDocument || data.aiConversationId
                  ? null
                  : data.requiredDocumentId,
              stageOneDocumentId: stageOneDocument?.id ?? null,
              aiConversationId: data.aiConversationId ?? null,
              idempotencyKey,
              ...(!data.aiConversationId
                ? {
                    status: { notIn: ['ABORTED', 'EXPIRED'] },
                    OR: [
                      { status: 'AVAILABLE' },
                      { status: 'VERIFYING', fileAssetId: { not: null } },
                      { expiresAt: { gt: new Date() } },
                    ],
                  }
                : {}),
            },
            include: {
              parts: { orderBy: { partNumber: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (existing) {
            if (
              data.aiConversationId &&
              ['ABORTED', 'EXPIRED'].includes(existing.status)
            )
              throw new ConflictException(
                'Upload đã kết thúc; cần khóa upload mới',
              );
            if (
              existing.actorId !== actor.userId ||
              existing.originalFilename !==
                currentSessionData.originalFilename ||
              existing.declaredSize !== currentSessionData.declaredSize ||
              existing.mimeType !== currentSessionData.mimeType ||
              (existing.submittingOfficerId ?? undefined) !==
                currentSessionData.submittingOfficerId ||
              (currentSessionData.checksum !== undefined &&
                existing.checksum !== currentSessionData.checksum)
            )
              throw new ConflictException({
                category: 'IDEMPOTENCY_CONFLICT',
                message: 'Khóa tải tệp đã được dùng cho tệp khác.',
              });
            return { session: existing, created: false };
          }
          if (
            data.aiConversationId &&
            (await tx.chatAiSourceIndex.findUnique({
              where: {
                conversationId_clientKey: {
                  conversationId: data.aiConversationId,
                  clientKey: idempotencyKey,
                },
              },
            }))
          )
            throw new ConflictException('Khóa upload đã dùng cho file khác');
          await assertFileCapacity(tx, {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            incomingBytes: currentSessionData.declaredSize,
            staging: true,
            organizationLimitBytes: BigInt(
              this.environment.UPLOAD_ORGANIZATION_QUOTA_BYTES,
            ),
            globalLimitBytes: BigInt(
              this.environment.UPLOAD_GLOBAL_QUOTA_BYTES,
            ),
            unmeasuredFileBytes: BigInt(this.environment.UPLOAD_MAX_FILE_BYTES),
            actorStagingLimit: this.environment.UPLOAD_ACTOR_STAGING_LIMIT,
          });
          if (data.aiConversationId)
            await assertUploadDiskSpace(
              tx,
              this.environment.LOCAL_UPLOAD_PATH,
              currentSessionData.declaredSize,
            );
          return {
            session: await tx.uploadSession.create({
              data: currentSessionData,
            }),
            created: true,
          };
        },
        data.aiConversationId
          ? { timeout: PROJECT_CHAT_TRANSACTION_TIMEOUT_MS }
          : undefined,
      )
      .catch((error: unknown) => {
        this.logger.error({
          event: 'UPLOAD_INITIATE_FAILED',
          phase: 'TRANSACTION',
          databaseError:
            error instanceof Prisma.PrismaClientKnownRequestError &&
            /^P\d{4}$/.test(error.code)
              ? error.code
              : 'UNKNOWN',
        });
        throw error;
      });
    if (result.created)
      try {
        await ensurePrivateDirectory(this.stagingPath(id));
      } catch (error) {
        await this.prisma.uploadSession.updateMany({
          where: { id, status: 'INITIATED', fileAssetId: null },
          data: { status: 'ABORTED', abortedAt: new Date() },
        });
        await this.releaseStaging(id).catch(() => false);
        throw error;
      }
    if (
      result.session.aiConversationId &&
      result.session.status === 'AVAILABLE'
    )
      await this.completedView(actor, result.session);
    return this.view(result.session);
  }

  async get(actor: CurrentActor, id: string) {
    const session = await this.owned(actor, id, true);
    if (session.aiConversationId && session.status === 'AVAILABLE')
      await this.completedView(actor, session);
    return this.view(session);
  }

  private async assertTransferCapacity(
    actor: CurrentActor,
    session: Pick<
      UploadSession,
      | 'projectId'
      | 'requiredDocumentId'
      | 'stageOneDocumentId'
      | 'aiConversationId'
      | 'idempotencyKey'
    >,
  ) {
    if (!session.aiConversationId) return;
    await this.prisma.$transaction(async (tx) => {
      await lockOrganizationFileCapacity(tx, actor.organizationId);
      await this.target(actor, session, tx);
      await assertUploadDiskSpace(tx, this.environment.LOCAL_UPLOAD_PATH);
    });
  }

  async recover(actor: CurrentActor, query: RecoverUploadsQuery) {
    if (query.aiConversationId) {
      await this.target(actor, {
        projectId: query.projectId,
        requiredDocumentId: null,
        stageOneDocumentId: null,
        aiConversationId: query.aiConversationId,
        idempotencyKey: randomUUID(),
      });
      const sessions = await this.prisma.uploadSession.findMany({
        where: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          projectId: query.projectId,
          aiConversationId: query.aiConversationId,
          status: { in: ['INITIATED', 'UPLOADING', 'VERIFYING', 'FAILED'] },
          expiresAt: { gt: new Date() },
          AND: [
            {
              OR: [
                { fileAssetId: null },
                { fileAsset: { is: { deletedAt: null } } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 101,
      });
      await this.target(actor, {
        projectId: query.projectId,
        requiredDocumentId: null,
        stageOneDocumentId: null,
        aiConversationId: query.aiConversationId,
        idempotencyKey: randomUUID(),
      });
      return {
        truncated: sessions.length > 100,
        items: sessions.slice(0, 100).map((session) => ({
          ...this.recoveryView(session),
          aiConversationId: session.aiConversationId,
        })),
      };
    }
    this.assertPermissions(actor);
    if (query.requiredDocumentId && query.stageOneDocumentId)
      throw new UnprocessableEntityException(
        'Only one upload target is allowed',
      );
    const now = new Date();
    const unattached = {
      fileAssetId: { not: null },
      fileAsset: { is: { attachments: { none: {} } } },
    };
    if (!query.requiredDocumentId && !query.stageOneDocumentId) {
      const sessions = await this.prisma.uploadSession.findMany({
        where: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          projectId: query.projectId,
          ...(query.contextType && {
            stageOneDocument: {
              is: {
                requiredDocument: {
                  is: {
                    initialMatrix:
                      query.contextType === 'STAGE_MATRIX_DOCUMENT',
                    deletedAt: null,
                  },
                },
              },
            },
          }),
          status: 'AVAILABLE',
          expiresAt: { gt: now },
          ...unattached,
        },
        include: {
          stageOneDocument: {
            select: {
              requiredDocumentId: true,
              stageKey: true,
              workstreamKey: true,
              submittedOfficerId: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      const authorized: typeof sessions = [];
      for (const session of sessions) {
        try {
          await this.target(actor, session);
          authorized.push(session);
        } catch (error) {
          if (
            !(error instanceof ForbiddenException) &&
            !(error instanceof NotFoundException)
          )
            throw error;
        }
      }
      return { items: authorized.map((session) => this.recoveryView(session)) };
    }
    const scope = query.requiredDocumentId
      ? {
          projectId: query.projectId,
          requiredDocumentId: query.requiredDocumentId,
          stageOneDocumentId: null,
        }
      : {
          projectId: query.projectId,
          requiredDocumentId: null,
          stageOneDocumentId: query.stageOneDocumentId!,
        };
    if (query.requiredDocumentId)
      await this.products.assertDocumentUpload(
        actor,
        query.projectId,
        query.requiredDocumentId,
      );
    else
      await this.stageOne!.assertUploadTarget(
        actor,
        query.projectId,
        query.stageOneDocumentId!,
      );
    await this.prisma.uploadSession.updateMany({
      where: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        ...scope,
        status: 'AVAILABLE',
        expiresAt: { lte: now },
        ...unattached,
      },
      data: { status: 'EXPIRED' },
    });
    return {
      items: (
        await this.prisma.uploadSession.findMany({
          where: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            ...scope,
            status: 'AVAILABLE',
            expiresAt: { gt: now },
            ...unattached,
          },
          orderBy: { createdAt: 'asc' },
        })
      ).map((session) => this.recoveryView(session)),
    };
  }

  async submit(
    actor: CurrentActor,
    data: SubmitUploadsDto,
  ): Promise<SubmitUploadsResult> {
    this.assertPermissions(actor);
    const projectId = data.projectId.toLowerCase();
    const sessionIds = data.sessionIds.map((id) => id.toLowerCase());
    if (new Set(sessionIds).size !== sessionIds.length)
      throw new UnprocessableEntityException('Upload sessions must be unique');
    const normalizedSessionIds = [...sessionIds].sort();
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Project"
        WHERE "id" = ${projectId}::uuid
          AND "organizationId" = ${actor.organizationId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (!project.length)
        throw new NotFoundException({
          category: 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE',
          message: 'Dự án đã bị xóa hoặc không còn khả dụng.',
        });
      await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "UploadSession"
        WHERE "id" IN (${Prisma.join(
          sessionIds.map((id) => Prisma.sql`${id}::uuid`),
        )})
        ORDER BY "id"
        FOR UPDATE
      `);
      const found = await tx.uploadSession.findMany({
        where: { id: { in: sessionIds } },
        include: {
          fileAsset: {
            select: {
              attachments: {
                select: { entityType: true, entityId: true, projectId: true },
              },
            },
          },
        },
      });
      const byId = new Map(found.map((session) => [session.id, session]));
      const sessions = sessionIds.map((id) => byId.get(id));
      if (
        sessions.some(
          (session) =>
            !session ||
            session.organizationId !== actor.organizationId ||
            session.actorId !== actor.userId ||
            session.projectId !== projectId ||
            Boolean(session.requiredDocumentId) ===
              Boolean(session.stageOneDocumentId),
        )
      )
        throw new NotFoundException('Upload session not found');
      await Promise.all(
        sessions.map((session) => this.target(actor, session!)),
      );
      const prior = await tx.activity.findFirst({
        where: {
          organizationId: actor.organizationId,
          event: 'PROJECT_UPLOAD_BATCH_SUBMITTED',
          entityType: 'Project',
          entityId: projectId,
          metadata: {
            path: ['idempotencyKey'],
            equals: data.idempotencyKey,
          },
        },
        select: { metadata: true },
      });
      if (prior) {
        const metadata =
          prior.metadata &&
          typeof prior.metadata === 'object' &&
          !Array.isArray(prior.metadata)
            ? prior.metadata
            : {};
        const priorIds = Array.isArray(metadata.sessionIds)
          ? metadata.sessionIds
              .filter((id): id is string => typeof id === 'string')
              .map((id) => id.toLowerCase())
              .sort()
          : [];
        if (
          priorIds.length !== normalizedSessionIds.length ||
          priorIds.some((id, index) => id !== normalizedSessionIds[index])
        )
          throw new ConflictException({
            category: 'IDEMPOTENCY_CONFLICT',
            message: 'Submission key was used for another batch.',
          });
        if (
          !metadata.result ||
          typeof metadata.result !== 'object' ||
          Array.isArray(metadata.result) ||
          !Array.isArray(metadata.result.items)
        )
          throw new ConflictException('Stored submission result is invalid');
        return metadata.result as unknown as SubmitUploadsResult;
      }
      const now = new Date();
      if (
        sessions.some((session) => {
          const current = session!;
          const attachments = current.fileAsset?.attachments ?? [];
          const entityType = current.stageOneDocumentId
            ? 'ProjectStageOneDocument'
            : 'ProjectRequiredDocument';
          const entityId =
            current.stageOneDocumentId ?? current.requiredDocumentId!;
          return (
            current.status !== 'AVAILABLE' ||
            !current.fileAssetId ||
            attachments.some(
              (attachment) =>
                attachment.entityType !== entityType ||
                attachment.entityId !== entityId ||
                attachment.projectId !== projectId,
            ) ||
            current.expiresAt <= now
          );
        })
      )
        throw new ConflictException('Upload is not available');

      const items: SubmitUploadsResult['items'] = [];
      for (const session of sessions) {
        const current = session!;
        const entityType = current.stageOneDocumentId
          ? 'ProjectStageOneDocument'
          : 'ProjectRequiredDocument';
        const entityId =
          current.stageOneDocumentId ?? current.requiredDocumentId!;
        const lockedFile = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "FileAsset"
          WHERE "id" = ${current.fileAssetId!}::uuid
            AND "organizationId" = ${actor.organizationId}::uuid
            AND "deletedAt" IS NULL
          FOR UPDATE
        `);
        if (!lockedFile.length)
          throw new NotFoundException('Upload session not found');
        await tx.entityAttachment.upsert({
          where: {
            fileAssetId_entityType_entityId: {
              fileAssetId: current.fileAssetId!,
              entityType,
              entityId,
            },
          },
          create: {
            fileAssetId: current.fileAssetId!,
            entityType,
            entityId,
            projectId,
            createdBy: actor.userId,
          },
          update: {},
        });
        const document = current.stageOneDocumentId
          ? await this.stageOne!.linkUploadFileInTransaction(
              actor,
              projectId,
              current.stageOneDocumentId,
              current.fileAssetId!,
              current.submittingOfficerId,
              tx,
            )
          : await this.products.linkUploadFileInTransaction(
              actor,
              projectId,
              current.requiredDocumentId!,
              current.fileAssetId!,
              tx,
            );
        items.push({
          sessionId: current.id,
          fileAssetId: current.fileAssetId!,
          document,
        });
      }
      const result = JSON.parse(
        JSON.stringify({ items }),
      ) as SubmitUploadsResult;
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_UPLOAD_BATCH_SUBMITTED',
          entityType: 'Project',
          entityId: projectId,
          metadata: JSON.parse(
            JSON.stringify({
              idempotencyKey: data.idempotencyKey,
              sessionIds: normalizedSessionIds,
              result,
            }),
          ) as Prisma.InputJsonObject,
        },
      });
      return result;
    });
  }

  async part(
    actor: CurrentActor,
    id: string,
    partNumber: number,
    expectedChecksum: string,
    body: Readable,
  ) {
    await this.owned(actor, id);
    const actorStreams = [...this.inFlightParts.values()].filter(
      (actorId) => actorId === actor.userId,
    ).length;
    // ponytail: O(20) process-local cap; replace with distributed leases only
    // when LOCAL storage is replaced by shared multi-process storage.
    if (
      this.inFlightParts.has(id) ||
      this.inFlightParts.size >= maximumInFlightPartStreams ||
      actorStreams >= maximumActorInFlightPartStreams
    )
      throw new ConflictException('Upload part is already in progress');
    this.inFlightParts.set(id, actor.userId);
    return this.writePart(
      actor,
      id,
      partNumber,
      expectedChecksum,
      body,
    ).finally(() => this.inFlightParts.delete(id));
  }

  private async writePart(
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
    await this.purgeUnreferencedParts(session);
    const expectedSize = expectedUploadPartSize(session, partNumber);
    await this.assertTransferCapacity(actor, session);
    const path = join(
      this.stagingPath(id),
      `${partNumber}-${randomUUID()}.pending`,
    );
    let details: Awaited<ReturnType<typeof stat>>;
    let checksum: string;
    try {
      await pipeline(
        body,
        uploadByteLimit(expectedSize),
        await createPrivateWriteStream(path, 'wx'),
      );
      details = await stat(path);
      if (details.size !== expectedSize)
        throw new UnprocessableEntityException('Invalid part size');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      checksum = hash.digest('hex');
      if (checksum !== expectedChecksum)
        throw new UnprocessableEntityException('Part checksum mismatch');
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    const result = await this.prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw<
          { id: string }[]
        >`SELECT "id" FROM "UploadSession" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const current = await tx.uploadSession.findUniqueOrThrow({
          where: { id },
          include: { parts: { orderBy: { partNumber: 'asc' } } },
        });
        if (
          current.organizationId !== actor.organizationId ||
          current.actorId !== actor.userId ||
          current.projectId !== session.projectId ||
          current.requiredDocumentId !== session.requiredDocumentId ||
          current.aiConversationId !== session.aiConversationId ||
          !['INITIATED', 'UPLOADING'].includes(current.status) ||
          current.expiresAt <= new Date()
        )
          throw new ConflictException('Upload is not writable');
        if (current.aiConversationId) await this.target(actor, current, tx);
        const previous = current.parts.find(
          (part) => part.partNumber === partNumber,
        );
        await tx.uploadPart.upsert({
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
        const aggregate = await tx.uploadPart.aggregate({
          where: { uploadSessionId: id },
          _sum: { size: true },
        });
        const updatedSession = await tx.uploadSession.update({
          where: { id },
          data: {
            status: 'UPLOADING',
            uploadedBytes: BigInt(aggregate._sum.size || 0),
          },
          include: { parts: { orderBy: { partNumber: 'asc' } } },
        });
        return { updated: updatedSession, previousPath: previous?.storagePath };
      })
      .catch(async (error) => {
        await rm(path, { force: true });
        throw error;
      });
    if (result.previousPath && result.previousPath !== path)
      await rm(result.previousPath, { recursive: true, force: true });
    return this.view(result.updated);
  }

  async complete(
    actor: CurrentActor,
    id: string,
    expectedChecksum?: string,
    publication?: {
      check(tx: Prisma.TransactionClient): Promise<unknown>;
      bind(tx: Prisma.TransactionClient, asset: FileAsset): Promise<unknown>;
    },
  ) {
    await this.owned(actor, id);
    if (this.inFlightParts.has(id))
      throw new ConflictException('Upload session is busy');
    return this.completeSession(actor, id, expectedChecksum, publication);
  }

  private assertCompletionChecksum(
    session: { checksum?: string | null },
    expectedChecksum?: string,
  ) {
    if (
      expectedChecksum &&
      session.checksum &&
      session.checksum !== expectedChecksum
    )
      throw new UnprocessableEntityException('Object checksum mismatch');
  }

  private async completeSession(
    actor: CurrentActor,
    id: string,
    expectedChecksum?: string,
    publication?: Parameters<UploadsService['complete']>[3],
  ) {
    const session = await this.owned(actor, id);
    if (session.mcpArtifactId && (!publication || !actor.mcpAuthorizationId))
      throw new ForbiddenException('MCP_UPLOAD_REQUIRES_RESULT_TRANSPORT');
    this.assertCompletionChecksum(session, expectedChecksum);
    if (session.status === 'AVAILABLE') {
      return this.completedView(actor, session);
    }
    if (session.status === 'VERIFYING' && session.fileAssetId) {
      this.assertCompletionChecksum(session, expectedChecksum);
      const completed = await this.prisma.$transaction(
        async (tx) => {
          await this.assertTargetInTransaction(tx, actor, session);
          await publication?.check(tx);
          await tx.$queryRaw<
            { id: string }[]
          >`SELECT "id" FROM "UploadSession" WHERE "id" = ${id}::uuid FOR UPDATE`;
          const current = await tx.uploadSession.findUniqueOrThrow({
            where: { id },
          });
          if (
            current.status !== 'VERIFYING' ||
            current.actorId !== actor.userId ||
            current.organizationId !== actor.organizationId ||
            current.projectId !== session.projectId ||
            current.requiredDocumentId !== session.requiredDocumentId ||
            current.stageOneDocumentId !== session.stageOneDocumentId ||
            current.fileAssetId !== session.fileAssetId
          )
            throw new ConflictException('Upload claim was lost');
          this.assertCompletionChecksum(current, expectedChecksum);
          if (current.aiConversationId)
            await this.files!.attachAiUpload(
              actor,
              current.aiConversationId,
              current.idempotencyKey!,
              await tx.fileAsset.findUniqueOrThrow({
                where: { id: current.fileAssetId! },
              }),
              tx,
              current.mcpArtifactId ? 'AI_DRAFT' : 'UNCONFIRMED',
            );
          if (publication)
            await publication.bind(
              tx,
              await tx.fileAsset.findUniqueOrThrow({
                where: { id: current.fileAssetId! },
              }),
            );
          return tx.uploadSession.update({
            where: { id },
            data: {
              status: 'AVAILABLE',
              completedAt: new Date(),
              expiresAt: uploadSessionExpiry(),
              verificationClaimId: null,
              verificationStartedAt: null,
            },
          });
        },
        session.aiConversationId
          ? { timeout: PROJECT_CHAT_TRANSACTION_TIMEOUT_MS }
          : undefined,
      );
      await this.releaseStaging(id);
      return this.completedView(actor, completed);
    }
    if (session.status === 'VERIFYING')
      throw new ConflictException('Upload verification is in progress');
    if (
      session.parts.length !== session.totalParts ||
      session.uploadedBytes !== session.declaredSize ||
      !hasValidUploadPartGeometry(session)
    )
      throw new ConflictException('Upload is incomplete');
    if (
      this.inFlightFinalizations.has(id) ||
      this.inFlightFinalizations.size >= 2
    )
      throw new ConflictException('Upload verification capacity is busy');
    this.inFlightFinalizations.add(id);
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const claimTime = new Date();
      const verificationClaimId = randomUUID();
      const claim = await this.prisma.uploadSession.updateMany({
        where: {
          id,
          expiresAt: { gt: claimTime },
          status: { in: ['INITIATED', 'UPLOADING', 'FAILED'] },
        },
        data: {
          status: 'VERIFYING',
          verificationClaimId,
          verificationStartedAt: claimTime,
        },
      });
      if (!claim.count) {
        const current = await this.owned(actor, id);
        if (current.status === 'AVAILABLE') {
          this.assertCompletionChecksum(current, expectedChecksum);
          return this.completedView(actor, current);
        }
        throw new ConflictException('Upload is not completable');
      }
      const claimed = await this.prisma.uploadSession
        .findUniqueOrThrow({
          where: { id },
          include: { parts: { orderBy: { partNumber: 'asc' } } },
        })
        .catch(async (error) => {
          await this.prisma.uploadSession.updateMany({
            where: { id, status: 'VERIFYING', verificationClaimId },
            data: {
              status: 'FAILED',
              verificationClaimId: null,
              verificationStartedAt: null,
            },
          });
          throw error;
        });
      if (
        claimed.status !== 'VERIFYING' ||
        claimed.organizationId !== actor.organizationId ||
        claimed.actorId !== actor.userId ||
        claimed.projectId !== session.projectId ||
        claimed.requiredDocumentId !== session.requiredDocumentId ||
        claimed.stageOneDocumentId !== session.stageOneDocumentId ||
        claimed.verificationClaimId !== verificationClaimId ||
        claimed.parts.length !== claimed.totalParts ||
        claimed.uploadedBytes !== claimed.declaredSize ||
        !hasValidUploadPartGeometry(claimed)
      ) {
        await this.prisma.uploadSession.updateMany({
          where: { id, status: 'VERIFYING', verificationClaimId },
          data: {
            status: 'FAILED',
            verificationClaimId: null,
            verificationStartedAt: null,
          },
        });
        throw new ConflictException('Upload claim was lost');
      }
      this.assertCompletionChecksum(claimed, expectedChecksum);
      heartbeat = setInterval(
        () =>
          void this.prisma.uploadSession
            .updateMany({
              where: {
                id,
                status: 'VERIFYING',
                verificationClaimId,
              },
              data: { verificationStartedAt: new Date() },
            })
            .catch(() => undefined),
        60_000,
      );
      heartbeat.unref();
      await this.purgeUnreferencedParts(claimed);
      const finalPath = join(this.stagingPath(id), 'complete');
      let storageKey = modernUploadStorageKey.test(claimed.storageKey)
        ? claimed.storageKey
        : uploadStorageKey(actor.organizationId, id, claimed.createdAt);
      let finalizedAssetId = claimed.fileAssetId ?? undefined;
      let completed;
      try {
        if (!finalizedAssetId) {
          await this.assertTransferCapacity(actor, claimed);
          const extension = extname(
            claimed.originalFilename,
          ).toLowerCase() as keyof typeof uploadTypes;
          const decoder = ['.csv', '.txt', '.md'].includes(extension)
            ? new TextDecoder('utf-8', { fatal: true })
            : undefined;
          const hash = createHash('sha256');
          const assembled = Readable.from(
            (async function* () {
              for (const part of claimed.parts) {
                for await (const chunk of createReadStream(part.storagePath)) {
                  const bytes = Buffer.from(chunk);
                  if (decoder) {
                    try {
                      if (bytes.includes(0)) throw new Error('NUL in text');
                      decoder.decode(bytes, { stream: true });
                    } catch {
                      throw new UnprocessableEntityException(
                        'File content is not allowed',
                      );
                    }
                  }
                  hash.update(bytes);
                  yield bytes;
                }
              }
              try {
                decoder?.decode();
              } catch {
                throw new UnprocessableEntityException(
                  'File content is not allowed',
                );
              }
            })(),
            { objectMode: false },
          );
          await pipeline(
            assembled,
            await createPrivateWriteStream(finalPath, 'w'),
          );
          if (!decoder && !(await validUploadContent(extension, finalPath)))
            throw new UnprocessableEntityException(
              'File content is not allowed',
            );
          const checksum = hash.digest('hex');
          const checksumPrecondition = claimed.checksum ?? expectedChecksum;
          if (checksumPrecondition && checksumPrecondition !== checksum)
            throw new UnprocessableEntityException('Object checksum mismatch');
          storageKey = await this.storage.putStream(
            actor.organizationId,
            createReadStream(finalPath),
            storageKey,
            verificationClaimId,
          );
          const materialized = await this.prisma
            .$transaction(
              async (tx) => {
                await this.assertTargetInTransaction(tx, actor, claimed);
                await publication?.check(tx);
                await tx.$queryRaw<
                  { id: string }[]
                >`SELECT "id" FROM "UploadSession" WHERE "id" = ${id}::uuid FOR UPDATE`;
                const current = await tx.uploadSession.findUniqueOrThrow({
                  where: { id },
                });
                if (
                  current.status !== 'VERIFYING' ||
                  current.actorId !== actor.userId ||
                  current.organizationId !== actor.organizationId ||
                  current.projectId !== session.projectId ||
                  current.requiredDocumentId !== session.requiredDocumentId ||
                  current.stageOneDocumentId !== session.stageOneDocumentId ||
                  current.verificationClaimId !== verificationClaimId
                )
                  throw new ConflictException('Upload claim was lost');
                if (current.fileAssetId) return current;
                await this.storage.publishPending(
                  storageKey!,
                  verificationClaimId,
                );
                const fileAsset = await tx.fileAsset.create({
                  data: {
                    organizationId: actor.organizationId,
                    originalFilename: claimed.originalFilename,
                    storedFilename: randomUUID(),
                    mimeType: claimed.mimeType,
                    sizeBytes: claimed.declaredSize,
                    storageKey: storageKey!,
                    checksum,
                    category: claimed.mcpArtifactId
                      ? 'AI_DRAFT'
                      : claimed.aiConversationId
                        ? 'AI_ATTACHMENT'
                        : 'PROJECT_DOCUMENT',
                    uploadedById: actor.userId,
                  },
                });
                return tx.uploadSession.update({
                  where: { id },
                  data: {
                    fileAssetId: fileAsset.id,
                    checksum,
                    storageKey: storageKey!,
                  },
                });
              },
              claimed.aiConversationId
                ? { timeout: PROJECT_CHAT_TRANSACTION_TIMEOUT_MS }
                : undefined,
            )
            .catch(async (error) => {
              const current = await this.prisma.uploadSession
                .findUniqueOrThrow({ where: { id } })
                .catch(() => null);
              if (current?.status === 'VERIFYING' && current.fileAssetId)
                return current;
              throw error;
            });
          finalizedAssetId = materialized.fileAssetId!;
        }
        completed = await this.prisma.$transaction(
          async (tx) => {
            await this.assertTargetInTransaction(tx, actor, claimed);
            await publication?.check(tx);
            await tx.$queryRaw<
              { id: string }[]
            >`SELECT "id" FROM "UploadSession" WHERE "id" = ${id}::uuid FOR UPDATE`;
            const current = await tx.uploadSession.findUniqueOrThrow({
              where: { id },
            });
            if (
              current.status !== 'VERIFYING' ||
              current.actorId !== actor.userId ||
              current.organizationId !== actor.organizationId ||
              current.projectId !== session.projectId ||
              current.requiredDocumentId !== session.requiredDocumentId ||
              current.stageOneDocumentId !== session.stageOneDocumentId ||
              current.fileAssetId !== finalizedAssetId ||
              current.verificationClaimId !== verificationClaimId
            )
              throw new ConflictException('Upload claim was lost');
            if (current.aiConversationId)
              await this.files!.attachAiUpload(
                actor,
                current.aiConversationId,
                current.idempotencyKey!,
                await tx.fileAsset.findUniqueOrThrow({
                  where: { id: current.fileAssetId! },
                }),
                tx,
                current.mcpArtifactId ? 'AI_DRAFT' : 'UNCONFIRMED',
              );
            if (publication)
              await publication.bind(
                tx,
                await tx.fileAsset.findUniqueOrThrow({
                  where: { id: current.fileAssetId! },
                }),
              );
            return tx.uploadSession.update({
              where: { id },
              data: {
                status: 'AVAILABLE',
                completedAt: new Date(),
                expiresAt: uploadSessionExpiry(),
                verificationClaimId: null,
                verificationStartedAt: null,
              },
            });
          },
          claimed.aiConversationId
            ? { timeout: PROJECT_CHAT_TRANSACTION_TIMEOUT_MS }
            : undefined,
        );
      } catch (error) {
        const published = await this.prisma.uploadSession
          .findUniqueOrThrow({
            where: { id },
            include: { parts: { orderBy: { partNumber: 'asc' } } },
          })
          .catch(() => null);
        if (published?.status === 'AVAILABLE' && published.fileAssetId) {
          await this.releaseStaging(id);
          this.assertCompletionChecksum(published, expectedChecksum);
          return this.completedView(actor, published);
        }
        if (
          error instanceof NotFoundException &&
          published?.status === 'VERIFYING' &&
          published.fileAssetId &&
          published.verificationClaimId === verificationClaimId
        ) {
          const invalidated = await this.prisma.uploadSession.updateMany({
            where: {
              id,
              status: 'VERIFYING',
              fileAssetId: published.fileAssetId,
              verificationClaimId,
            },
            data: {
              status: 'ABORTED',
              verificationClaimId: null,
              verificationStartedAt: null,
            },
          });
          if (invalidated.count) await this.releaseStaging(id);
          throw error;
        }
        if (
          !published ||
          published.status !== 'VERIFYING' ||
          published.fileAssetId ||
          published.verificationClaimId !== verificationClaimId
        )
          throw error;
        try {
          if (storageKey) {
            await this.storage.removePending(storageKey, verificationClaimId);
            await this.storage.remove(storageKey);
          }
          await rm(finalPath, { force: true });
        } catch {
          throw error;
        }
        await this.prisma.uploadSession.updateMany({
          where: {
            id,
            status: 'VERIFYING',
            fileAssetId: null,
            verificationClaimId,
          },
          data: {
            status: 'FAILED',
            verificationClaimId: null,
            verificationStartedAt: null,
          },
        });
        throw error;
      }
      await this.releaseStaging(id);
      return this.completedView(actor, completed);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.inFlightFinalizations.delete(id);
    }
  }

  async abort(actor: CurrentActor, id: string) {
    const session = await this.owned(actor, id);
    if (session.status === 'ABORTED') {
      await this.releaseStaging(id);
      return this.view(session);
    }
    if (session.status === 'AVAILABLE') {
      const aborted = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "UploadSession"
          WHERE "id" = ${id}::uuid
          FOR UPDATE
        `);
        const current = await tx.uploadSession.findUniqueOrThrow({
          where: { id },
        });
        if (
          current.organizationId !== actor.organizationId ||
          current.actorId !== actor.userId ||
          current.status !== 'AVAILABLE' ||
          !current.fileAssetId
        )
          throw new ConflictException('Upload cannot be aborted');
        if (
          await tx.entityAttachment.findFirst({
            where: { fileAssetId: current.fileAssetId },
            select: { id: true },
          })
        )
          throw new ConflictException('Upload cannot be aborted');
        const claim = await tx.uploadSession.updateMany({
          where: {
            id,
            fileAssetId: current.fileAssetId,
            status: 'AVAILABLE',
          },
          data: { status: 'ABORTED', abortedAt: new Date() },
        });
        if (!claim.count)
          throw new ConflictException('Upload cannot be aborted');
        return tx.uploadSession.findUniqueOrThrow({ where: { id } });
      });
      await this.releaseStaging(id);
      return this.view(aborted);
    }
    const claim = await this.prisma.uploadSession.updateMany({
      where: {
        id,
        fileAssetId: null,
        status: { in: ['INITIATED', 'UPLOADING', 'FAILED'] },
      },
      data: { status: 'ABORTED', abortedAt: new Date() },
    });
    if (!claim.count) throw new ConflictException('Upload cannot be aborted');
    await this.releaseStaging(id);
    return this.view(
      await this.prisma.uploadSession.findUniqueOrThrow({ where: { id } }),
    );
  }

  async refresh(actor: CurrentActor, id: string) {
    const session = await this.owned(actor, id);
    const now = new Date();
    const absoluteExpiry = new Date(
      session.createdAt.getTime() + uploadSessionMaximumLifetimeMs,
    );
    if (absoluteExpiry <= now) {
      const expired = await this.prisma.uploadSession.updateMany({
        where: {
          id,
          organizationId: actor.organizationId,
          actorId: actor.userId,
          status: { in: ['INITIATED', 'UPLOADING', 'FAILED'] },
        },
        data: { status: 'EXPIRED', expiresAt: now },
      });
      if (!expired.count)
        throw new ConflictException('Upload cannot be refreshed');
      await this.releaseStaging(id);
      throw new ForbiddenException('Upload session expired');
    }
    const claim = await this.prisma.uploadSession.updateMany({
      where: {
        id,
        organizationId: actor.organizationId,
        actorId: actor.userId,
        status: { in: ['INITIATED', 'UPLOADING', 'FAILED'] },
      },
      data: {
        expiresAt: new Date(
          Math.min(uploadSessionExpiry().getTime(), absoluteExpiry.getTime()),
        ),
      },
    });
    if (!claim.count) throw new ConflictException('Upload cannot be refreshed');
    return this.view(await this.owned(actor, id));
  }
}
