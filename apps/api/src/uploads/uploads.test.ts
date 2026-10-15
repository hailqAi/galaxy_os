import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REQUIRED_PERMISSIONS } from '../access-control/access.decorators';
import { redact } from '../security-redaction';
import { CurrentActor } from '../access-control/current-actor';
import { UploadsController } from './uploads.controller';
import {
  CompleteUploadDto,
  InitiateUploadDto,
  RecoverUploadsQuery,
  SubmitUploadsDto,
} from './uploads.dto';
import {
  UploadsService,
  uploadByteLimit,
  uploadConstraints,
  uploadParts,
} from './uploads.service';

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validateUpload(value: Record<string, unknown>) {
  return validation.transform(value, {
    type: 'body',
    metatype: InitiateUploadDto,
  });
}

function validateRecovery(value: Record<string, unknown>) {
  return validation.transform(value, {
    type: 'query',
    metatype: RecoverUploadsQuery,
  });
}

function validateCompletion(value: Record<string, unknown>) {
  return validation.transform(value, {
    type: 'body',
    metatype: CompleteUploadDto,
  });
}

function validateSubmission(value: Record<string, unknown>) {
  return validation.transform(value, {
    type: 'body',
    metatype: SubmitUploadsDto,
  });
}

function zipFixture(entries: string[]) {
  const localEntries: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    localEntries.push(local, name);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralEntries.push(central, name);
    offset += local.length + name.length;
  }
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localEntries, centralDirectory, end]);
}

function zip64Fixture(entries: string[]) {
  const localEntries: Buffer[] = [];
  const centralEntries: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(45, 4);
    local.writeUInt16LE(name.length, 26);
    localEntries.push(local, name);

    const extra = Buffer.alloc(28);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(24, 2);
    extra.writeBigUInt64LE(0n, 4);
    extra.writeBigUInt64LE(0n, 12);
    extra.writeBigUInt64LE(BigInt(offset), 20);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(45, 4);
    central.writeUInt16LE(45, 6);
    central.writeUInt32LE(0xffffffff, 20);
    central.writeUInt32LE(0xffffffff, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(0xffffffff, 42);
    centralEntries.push(central, name, extra);
    offset += local.length + name.length;
  }
  const centralDirectory = Buffer.concat(centralEntries);
  const zip64EndOffset = offset + centralDirectory.length;
  const zip64End = Buffer.alloc(56);
  zip64End.writeUInt32LE(0x06064b50, 0);
  zip64End.writeBigUInt64LE(44n, 4);
  zip64End.writeUInt16LE(45, 12);
  zip64End.writeUInt16LE(45, 14);
  zip64End.writeBigUInt64LE(BigInt(entries.length), 24);
  zip64End.writeBigUInt64LE(BigInt(entries.length), 32);
  zip64End.writeBigUInt64LE(BigInt(centralDirectory.length), 40);
  zip64End.writeBigUInt64LE(BigInt(offset), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(zip64EndOffset), 8);
  locator.writeUInt32LE(1, 16);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0xffff, 8);
  end.writeUInt16LE(0xffff, 10);
  end.writeUInt32LE(0xffffffff, 12);
  end.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([
    ...localEntries,
    centralDirectory,
    zip64End,
    locator,
    end,
  ]);
}

function zip64EndOffset(bytes: Buffer) {
  return Number(bytes.readBigUInt64LE(bytes.length - 34));
}

describe('large upload part calculation', () => {
  const temporaryDirectories: string[] = [];
  const actor = {
    organizationId: 'organization',
    userId: 'actor',
    permissions: ['file.upload', 'project.document.manage'],
  } as unknown as CurrentActor;
  const sha256 = (value: Buffer) =>
    createHash('sha256').update(value).digest('hex');
  const uploadCapacityTransaction = (
    uploadSession: Record<string, unknown>,
  ) => {
    let query = 0;
    return {
      $queryRaw: vi.fn(async () =>
        query++ === 0
          ? [{ locked: true }]
          : query === 2
            ? [{ id: actor.organizationId }]
            : [
                {
                  permanentBytes: '0',
                  stagedBytes: '0',
                  materializedBytes: '0',
                  objectRows: '0',
                  recentActorOperations: '0',
                  globalPermanentBytes: '0',
                  globalStagedBytes: '0',
                  globalMaterializedBytes: '0',
                  globalObjectRows: '0',
                },
              ],
      ),
      uploadSession: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        ...uploadSession,
      },
    };
  };
  async function completionFixture(
    bytes: Buffer,
    originalFilename = 'document.pdf',
    mimeType = 'application/pdf',
    options: {
      commitAcknowledgementLost?: boolean;
      declaredSize?: bigint;
      finalized?: boolean;
      completedCleanupError?: boolean;
      materializationAcknowledgementLost?: boolean;
      reconciliationReadsFail?: boolean;
      verifyingStartedAt?: Date;
      expiresAt?: Date;
      staleCleanupError?: boolean;
      publishError?: boolean;
      putError?: boolean;
      requireProjectBeforeSessionLock?: boolean;
      revokeBeforeAvailability?: boolean;
      partCount?: number;
    } = {},
  ) {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    const sessionDirectory = join(directory, 'session');
    await mkdir(sessionDirectory);
    const partPath = join(sessionDirectory, 'committed.part');
    await writeFile(partPath, bytes);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    let status = options.verifyingStartedAt
      ? 'VERIFYING'
      : options.finalized
        ? 'FAILED'
        : 'UPLOADING';
    let fileAssetId: string | null = options.finalized ? 'asset' : null;
    let verificationClaimId: string | null = options.verifyingStartedAt
      ? '00000000-0000-4000-8000-000000000099'
      : null;
    let verificationStartedAt = options.verifyingStartedAt ?? null;
    let checksum: string | null = options.finalized ? sha256(bytes) : null;
    let storageKey = 'organization/2026/08/session';
    let fileAssetDeletedAt: Date | null = null;
    const reportedSize = Number(options.declaredSize ?? BigInt(bytes.length));
    const partSize = Math.ceil(reportedSize / (options.partCount ?? 1));
    const parts: {
      partNumber: number;
      size: number;
      checksum: string;
      storagePath: string;
    }[] = [];
    for (
      let offset = 0;
      options.partCount && offset < bytes.length;
      offset += partSize
    ) {
      const part = bytes.subarray(offset, offset + partSize);
      const storagePath = join(sessionDirectory, `${parts.length + 1}.part`);
      await writeFile(storagePath, part);
      parts.push({
        partNumber: parts.length + 1,
        size: part.length,
        checksum: sha256(part),
        storagePath,
      });
    }
    const session = () => ({
      id: 'session',
      organizationId: 'organization',
      actorId: 'actor',
      submittingOfficerId: 'officer',
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      fileAssetId,
      status,
      verificationClaimId,
      verificationStartedAt,
      declaredSize: options.declaredSize ?? BigInt(bytes.length),
      uploadedBytes: options.declaredSize ?? BigInt(bytes.length),
      partSize,
      totalParts: options.partCount ? parts.length : 1,
      originalFilename,
      mimeType,
      checksum,
      storageKey,
      createdAt: new Date(),
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60_000),
      parts: options.partCount
        ? parts
        : [
            {
              partNumber: 1,
              size: reportedSize,
              checksum: sha256(bytes),
              storagePath: partPath,
            },
          ],
    });
    const updateMany = vi.fn(async ({ data, where }) => {
      if (
        data.status === undefined &&
        data.verificationClaimId &&
        status === 'VERIFYING' &&
        where.verificationClaimId === verificationClaimId
      ) {
        verificationClaimId = data.verificationClaimId;
        verificationStartedAt = data.verificationStartedAt;
        return { count: 1 };
      }
      if (
        data.status === 'EXPIRED' &&
        status === 'VERIFYING' &&
        where.verificationClaimId === verificationClaimId
      ) {
        status = 'EXPIRED';
        verificationClaimId = null;
        verificationStartedAt = null;
        return { count: 1 };
      }
      if (
        data.status === 'ABORTED' &&
        status === 'VERIFYING' &&
        where.verificationClaimId === verificationClaimId &&
        where.fileAssetId === fileAssetId
      ) {
        status = 'ABORTED';
        verificationClaimId = null;
        verificationStartedAt = null;
        return { count: 1 };
      }
      if (
        data.status === 'FAILED' &&
        status === 'VERIFYING' &&
        where.verificationClaimId === verificationClaimId &&
        (where.fileAssetId === undefined || where.fileAssetId === fileAssetId)
      ) {
        status = 'FAILED';
        verificationClaimId = null;
        verificationStartedAt = null;
        return { count: 1 };
      }
      if (
        data.status === 'VERIFYING' &&
        ['INITIATED', 'UPLOADING', 'FAILED'].includes(status)
      ) {
        status = 'VERIFYING';
        verificationClaimId = data.verificationClaimId;
        verificationStartedAt = data.verificationStartedAt;
        return { count: 1 };
      }
      if (
        data.status === 'FAILED' &&
        status === 'VERIFYING' &&
        (where.fileAssetId !== null || fileAssetId === null)
      ) {
        status = 'FAILED';
        return { count: 1 };
      }
      return { count: 0 };
    });
    const attachment = vi.fn();
    const fileAssetCreate = vi.fn().mockResolvedValue({ id: 'asset' });
    let sessionReads = 0;
    let transactionCalls = 0;
    const prisma = {
      uploadSession: {
        findFirst: vi.fn(async () => session()),
        findUnique: vi.fn(async () => session()),
        findUniqueOrThrow: vi.fn(async () => {
          sessionReads++;
          if (options.reconciliationReadsFail && sessionReads > 1)
            throw new Error('reconciliation read failed');
          return session();
        }),
        updateMany,
      },
      $transaction: vi.fn(async (work) => {
        transactionCalls++;
        let projectLocked = false;
        const result = await work({
          $queryRaw: vi.fn(async (statement: unknown) => {
            let sql = String(statement);
            if (Array.isArray(statement)) sql = statement.join('');
            else if (
              statement &&
              typeof statement === 'object' &&
              'strings' in statement &&
              Array.isArray(statement.strings)
            )
              sql = statement.strings.join('');
            if (sql.includes('FROM "Project"')) projectLocked = true;
            if (
              options.requireProjectBeforeSessionLock &&
              sql.includes('FROM "UploadSession"') &&
              !projectLocked
            )
              throw new Error('UploadSession locked before Project');
            return [{ id: 'session' }];
          }),
          uploadSession: {
            findUniqueOrThrow: vi.fn(async () => session()),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn(async ({ data }) => {
              if (data.status !== undefined) status = data.status;
              if (data.fileAssetId !== undefined)
                fileAssetId = data.fileAssetId;
              if (data.checksum !== undefined) checksum = data.checksum;
              if (data.storageKey !== undefined) storageKey = data.storageKey;
              if (data.verificationClaimId !== undefined)
                verificationClaimId = data.verificationClaimId;
              if (data.verificationStartedAt !== undefined)
                verificationStartedAt = data.verificationStartedAt;
              return { ...session(), ...data };
            }),
          },
          fileAsset: {
            create: fileAssetCreate,
            findFirst: vi.fn(async () => ({
              id: 'asset',
              deletedAt: fileAssetDeletedAt,
            })),
            updateMany: vi.fn(async ({ data }) => {
              fileAssetDeletedAt = data.deletedAt;
              return { count: 1 };
            }),
          },
          entityAttachment: {
            create: attachment,
            findFirst: vi.fn().mockResolvedValue(null),
          },
          projectRequiredDocument: {
            findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'document' }),
            findFirst: vi.fn().mockResolvedValue(null),
          },
          projectRequiredDocumentVersion: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          projectStageOneDocument: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          projectStageOneDocumentVersion: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
          importJob: { findFirst: vi.fn().mockResolvedValue(null) },
        });
        if (
          options.commitAcknowledgementLost ||
          (options.materializationAcknowledgementLost && transactionCalls === 1)
        )
          throw new Error('commit acknowledgement lost');
        if (options.completedCleanupError) {
          await rm(directory, { recursive: true, force: true });
          await writeFile(directory, 'not a directory');
        }
        return result;
      }),
    };
    const storage = {
      putStream: vi.fn(async (_organizationId, stream: Readable) => {
        for await (const chunk of stream) {
          void chunk;
          // Consume the real stream so read errors reach the service.
        }
        if (options.putError) throw new Error('put failed');
        return 'organization/2026/08/asset';
      }),
      publishPending: options.publishError
        ? vi.fn().mockRejectedValue(new Error('publish failed'))
        : vi.fn(),
      removePending: options.staleCleanupError
        ? vi.fn().mockRejectedValue(new Error('cleanup failed'))
        : vi.fn(),
      remove: vi.fn(),
    };
    let targetChecks = 0;
    const products = {
      assertDocumentUpload: vi.fn(async () => {
        targetChecks++;
        if (options.revokeBeforeAvailability && targetChecks >= 4)
          throw new NotFoundException('Required document not found');
        return { id: 'document' };
      }),
      linkUploadFileInTransaction: vi.fn(),
    };
    const stageOne = {
      assertUploadTarget: vi.fn().mockResolvedValue({ id: 'logical-document' }),
      linkUploadFileInTransaction: vi.fn(),
    };
    return {
      directory,
      service: Reflect.construct(UploadsService, [
        prisma,
        storage,
        products,
        stageOne,
      ]) as UploadsService,
      storage,
      products,
      stageOne,
      attachment,
      fileAssetCreate,
      updateMany,
      fileAssetId: () => fileAssetId,
      fileAssetDeletedAt: () => fileAssetDeletedAt,
      status: () => status,
    };
  }
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((path) => rm(path, { recursive: true, force: true })),
    );
    vi.unstubAllEnvs();
  });
  it('assembles many committed parts without accumulating output listeners', async () => {
    const bytes = Buffer.from('0007392,275001.10,VND\n'.repeat(100));
    const fixture = await completionFixture(bytes, 'quote.csv', 'text/csv', {
      partCount: 20,
    });
    const warnings = vi.spyOn(process, 'emitWarning');
    try {
      await expect(
        fixture.service.complete(actor, 'session', sha256(bytes)),
      ).resolves.toMatchObject({ status: 'AVAILABLE' });
      expect(
        warnings.mock.calls.filter(
          ([warning]) =>
            warning instanceof Error &&
            warning.name === 'MaxListenersExceededWarning',
        ),
      ).toEqual([]);
      expect(fixture.fileAssetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checksum: sha256(bytes) }),
        }),
      );
    } finally {
      warnings.mockRestore();
    }
  });
  it('accepts 5.1 GiB and keeps provider parts bounded', () => {
    const result = uploadParts(Math.ceil(5.1 * 1024 ** 3));
    expect(result.partSize).toBe(64 * 1024 ** 2);
    expect(result.totalParts).toBe(82);
  });
  it('increases part size when the provider part cap requires it', () => {
    const result = uploadParts(10_001 * 5 * 1024 ** 2, 5 * 1024 ** 2);
    expect(result.totalParts).toBeLessThanOrEqual(10_000);
  });

  it('stops an oversized part while it is streaming', async () => {
    const consume = async () => {
      for await (const chunk of Readable.from([
        Buffer.alloc(4),
        Buffer.alloc(1),
      ]).pipe(uploadByteLimit(4))) {
        void chunk;
        // Consume the limited stream.
      }
    };

    await expect(consume()).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('remediates existing local upload roots at startup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    const staging = join(directory, 'staging');
    await mkdir(staging);
    await chmod(directory, 0o777);
    await chmod(staging, 0o777);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const service = new UploadsService({} as never, {} as never, {} as never);
    const previousUmask = process.umask(0);
    vi.spyOn(service, 'cleanupStaging').mockResolvedValue({} as never);
    vi.spyOn(service, 'cleanupStorageReservations').mockResolvedValue(
      {} as never,
    );

    try {
      await service.onModuleInit();
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect((await stat(staging)).mode & 0o777).toBe(0o700);
    } finally {
      process.umask(previousUmask);
      await service.onModuleDestroy();
    }
  });

  it('creates upload session directories and part files owner-only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const bytes = Buffer.from('part');
    const checksum = sha256(bytes);
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      status: 'INITIATED',
      declaredSize: BigInt(bytes.length),
      uploadedBytes: 0n,
      partSize: bytes.length,
      totalParts: 1,
      originalFilename: 'document.pdf',
      mimeType: 'application/pdf',
      expiresAt: new Date(Date.now() + 60_000),
      parts: [],
    };
    const service = new UploadsService(
      {
        uploadSession: { findFirst: vi.fn().mockResolvedValue(session) },
        $transaction: vi.fn().mockResolvedValue({
          updated: {
            ...session,
            status: 'UPLOADING',
            uploadedBytes: BigInt(bytes.length),
            parts: [{ partNumber: 1, size: bytes.length, checksum }],
          },
        }),
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );
    const previousUmask = process.umask(0);

    try {
      await service.part(actor, 'session', 1, checksum, Readable.from(bytes));
      const staging = join(directory, 'staging');
      const sessionDirectory = join(staging, 'session');
      const [part] = await readdir(sessionDirectory);
      expect((await stat(staging)).mode & 0o777).toBe(0o700);
      expect((await stat(sessionDirectory)).mode & 0o777).toBe(0o700);
      expect((await stat(join(sessionDirectory, part!))).mode & 0o777).toBe(
        0o600,
      );
    } finally {
      process.umask(previousUmask);
    }
  });

  it('rejects a session directory symlink without touching its target', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(parent);
    const directory = join(parent, 'uploads');
    const staging = join(directory, 'staging');
    const target = join(parent, 'unrelated');
    const sentinel = join(target, 'keep');
    await mkdir(staging, { recursive: true });
    await mkdir(target);
    await writeFile(sentinel, 'preserve');
    await symlink(target, join(staging, 'session'));
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const bytes = Buffer.from('part');
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      status: 'INITIATED',
      declaredSize: BigInt(bytes.length),
      uploadedBytes: 0n,
      partSize: bytes.length,
      totalParts: 1,
      expiresAt: new Date(Date.now() + 60_000),
      parts: [],
    };
    const service = new UploadsService(
      {
        uploadSession: { findFirst: vi.fn().mockResolvedValue(session) },
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );

    await expect(
      service.part(actor, 'session', 1, sha256(bytes), Readable.from(bytes)),
    ).rejects.toBeDefined();
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('preserve');
  });

  it('assembles complete upload files owner-only', async () => {
    const fixture = await completionFixture(Buffer.from('%PDF-private'));
    let observed:
      | { staging: number; session: number; complete: number }
      | undefined;
    fixture.storage.putStream.mockImplementationOnce(
      async (_organizationId, stream: Readable) => {
        const staging = join(fixture.directory, 'staging');
        const session = join(staging, 'session');
        observed = {
          staging: (await stat(staging)).mode & 0o777,
          session: (await stat(session)).mode & 0o777,
          complete: (await stat(join(session, 'complete'))).mode & 0o777,
        };
        for await (const chunk of stream) void chunk;
        return 'organization/2026/08/asset';
      },
    );
    const previousUmask = process.umask(0);

    try {
      await fixture.service.complete(actor, 'session');
    } finally {
      process.umask(previousUmask);
    }
    expect(observed).toEqual({
      staging: 0o700,
      session: 0o700,
      complete: 0o600,
    });
  });

  it('rejects compensating malformed part sizes before committing them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, 'session'));
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const session = {
      id: 'session',
      organizationId: 'organization',
      actorId: 'actor',
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      status: 'INITIATED',
      declaredSize: 10n,
      uploadedBytes: 0n,
      partSize: 6,
      totalParts: 2,
      expiresAt: new Date(Date.now() + 60_000),
      parts: [],
    };
    const findFirst = vi.fn().mockResolvedValue(session);
    const transaction = vi.fn().mockResolvedValue({ updated: session });
    const service = new UploadsService(
      {
        uploadSession: { findFirst },
        $transaction: transaction,
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );

    const shortFirstPart = Buffer.alloc(5);
    await expect(
      service.part(
        actor,
        'session',
        1,
        sha256(shortFirstPart),
        Readable.from(shortFirstPart),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    const oversizedFinalPart = Buffer.alloc(5);
    await expect(
      service.part(
        actor,
        'session',
        2,
        sha256(oversizedFinalPart),
        Readable.from(oversizedFinalPart),
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(transaction).not.toHaveBeenCalled();

    findFirst.mockResolvedValue({
      ...session,
      status: 'UPLOADING',
      uploadedBytes: 10n,
      parts: [
        { partNumber: 1, size: 5 },
        { partNumber: 2, size: 5 },
      ],
    });
    await expect(service.complete(actor, 'session')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('stops an oversized final part at its exact expected byte count', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, 'session'));
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      status: 'INITIATED',
      declaredSize: 1n,
      uploadedBytes: 0n,
      partSize: 67_108_864,
      totalParts: 1,
      expiresAt: new Date(Date.now() + 60_000),
      parts: [],
    };
    const transaction = vi.fn();
    const service = new UploadsService(
      {
        uploadSession: { findFirst: vi.fn().mockResolvedValue(session) },
        $transaction: transaction,
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );

    await expect(
      service.part(
        actor,
        'session',
        1,
        sha256(Buffer.alloc(2)),
        Readable.from(Buffer.alloc(2)),
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('allows only one in-flight part writer for an upload session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, 'session'));
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const bytes = Buffer.from('%PDF-ok');
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      status: 'INITIATED',
      declaredSize: BigInt(bytes.length * 2),
      uploadedBytes: 0n,
      partSize: bytes.length,
      totalParts: 2,
      expiresAt: new Date(Date.now() + 60_000),
      parts: [],
    };
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const entered = new Promise<void>((resolve) => (ready = resolve));
    let transactionCalls = 0;
    const transaction = vi.fn(async (work) => {
      if (transactionCalls++) throw new Error('duplicate writer reached DB');
      ready();
      await gate;
      return work({
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'session' }]),
        uploadSession: {
          findUniqueOrThrow: vi.fn().mockResolvedValue(session),
          update: vi.fn().mockResolvedValue({
            ...session,
            status: 'UPLOADING',
            uploadedBytes: BigInt(bytes.length),
            parts: [
              {
                partNumber: 1,
                size: bytes.length,
                checksum: sha256(bytes),
              },
            ],
          }),
        },
        uploadPart: {
          upsert: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { size: bytes.length },
          }),
        },
      });
    });
    const service = new UploadsService(
      {
        uploadSession: { findFirst: vi.fn().mockResolvedValue(session) },
        $transaction: transaction,
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );

    const first = service.part(
      actor,
      'session',
      1,
      sha256(bytes),
      Readable.from(bytes),
    );
    await entered;
    await expect(
      service.part(actor, 'session', 2, sha256(bytes), Readable.from(bytes)),
    ).rejects.toBeInstanceOf(ConflictException);
    release();
    await expect(first).resolves.toMatchObject({ status: 'UPLOADING' });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('publishes the canonical 20 GiB total-file limit', () => {
    expect(uploadConstraints(21_474_836_480)).toEqual({
      maxBytes: 21_474_836_480,
      allowedExtensions: [
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
      ],
    });
  });

  it('keeps chunks bounded at the canonical 20 GiB total-file limit', () => {
    expect(uploadParts(21_474_836_480)).toEqual({
      partSize: 67_108_864,
      totalParts: 320,
    });
  });

  it('accepts exactly 20 GiB and rejects one byte more', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    vi.stubEnv('UPLOAD_MAX_FILE_BYTES', '21474836480');
    const create = vi.fn(async ({ data }) => ({
      ...data,
      status: 'INITIATED',
      uploadedBytes: 0n,
      parts: [],
    }));
    const uploadSession = { create };
    const service = new UploadsService(
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      } as never,
      {} as never,
      { assertDocumentUpload: vi.fn() } as never,
    );
    const input = {
      projectId: 'project',
      requiredDocumentId: 'document',
      idempotencyKey: 'upload-20-gib',
      originalFilename: 'document.pdf',
      mimeType: 'application/pdf',
      declaredSize: 21_474_836_480,
    } as InitiateUploadDto;

    await expect(service.initiate(actor, input)).resolves.toMatchObject({
      declaredSize: '21474836480',
    });
    await expect(
      service.initiate(actor, { ...input, declaredSize: 21_474_836_481 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(create).toHaveBeenCalledOnce();
  });

  it('persists a finalized large FileAsset size as bigint', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-valid'),
      undefined,
      undefined,
      {
        declaredSize: 21_474_836_480n,
      },
    );

    await fixture.service.complete(actor, 'session');

    expect(fixture.fileAssetCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sizeBytes: 21_474_836_480n }),
    });
  });

  it.each([
    {
      stageKey: 'STAGE_1' as const,
      contextType: 'STAGE_MATRIX_DOCUMENT' as const,
      workstreamKey: undefined,
    },
    {
      stageKey: 'STAGE_2' as const,
      contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
      workstreamKey: '  ASSIGNMENT  ',
    },
  ])(
    'accepts one definition-linked $contextType target per file',
    async ({ stageKey, contextType, workstreamKey }) => {
      const target = {
        definitionId: '00000000-0000-4000-8000-000000000004',
        stageKey,
        ...(workstreamKey === undefined ? {} : { workstreamKey }),
        contextType,
        displayName: '  Hồ sơ pháp lý bổ sung  ',
        submittedOfficerId: '00000000-0000-4000-8000-000000000002',
        idempotencyKey: '  file-1  ',
      };
      const base = {
        projectId: '00000000-0000-4000-8000-000000000001',
        originalFilename: 'document.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      };

      await expect(
        validateUpload({ ...base, stageOneDocument: target }),
      ).resolves.toEqual({
        ...base,
        stageOneDocument: {
          ...target,
          ...(workstreamKey === undefined
            ? {}
            : { workstreamKey: 'ASSIGNMENT' }),
          displayName: 'Hồ sơ pháp lý bổ sung',
          idempotencyKey: 'file-1',
        },
      });
      await expect(validateUpload(base)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        validateUpload({
          ...base,
          stageOneDocument: { ...target, contextType: undefined },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        validateUpload({
          ...base,
          stageOneDocument: { ...target, contextType: 'STAGE_DOCUMENT' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        validateUpload({
          ...base,
          requiredDocumentId: '00000000-0000-4000-8000-000000000003',
          stageOneDocument: target,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('requires one normalized initiation key for a required-document target', async () => {
    const base = {
      projectId: '00000000-0000-4000-8000-000000000001',
      requiredDocumentId: '00000000-0000-4000-8000-000000000002',
      originalFilename: 'document.pdf',
      declaredSize: 8,
      mimeType: 'application/pdf',
    };

    await expect(
      validateUpload({ ...base, idempotencyKey: '  required-file-1  ' }),
    ).resolves.toMatchObject({ idempotencyKey: 'required-file-1' });
    await expect(validateUpload(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires the exact definition scope when adding a later logical-document version', async () => {
    const base = {
      projectId: '00000000-0000-4000-8000-000000000001',
      originalFilename: 'document-v2.pdf',
      declaredSize: 8,
      mimeType: 'application/pdf',
    };
    const documentId = '00000000-0000-4000-8000-000000000002';

    await expect(
      validateUpload({
        ...base,
        stageOneDocument: {
          definitionId: '00000000-0000-4000-8000-000000000004',
          stageKey: 'STAGE_1',
          workstreamKey: 'SURVEY',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: '00000000-0000-4000-8000-000000000003',
          documentId,
          idempotencyKey: '  file-v2  ',
        },
      }),
    ).resolves.toEqual({
      ...base,
      stageOneDocument: {
        definitionId: '00000000-0000-4000-8000-000000000004',
        stageKey: 'STAGE_1',
        workstreamKey: 'SURVEY',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
        submittedOfficerId: '00000000-0000-4000-8000-000000000003',
        documentId,
        idempotencyKey: 'file-v2',
      },
    });
    await expect(
      validateUpload({
        ...base,
        stageOneDocument: {
          documentId,
          definitionId: '00000000-0000-4000-8000-000000000004',
          stageKey: 'STAGE_3',
          workstreamKey: 'SURVEY',
          submittedOfficerId: '00000000-0000-4000-8000-000000000003',
          idempotencyKey: 'file-v2',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateUpload({
        ...base,
        stageOneDocument: {
          definitionId: '00000000-0000-4000-8000-000000000004',
          stageKey: 'STAGE_1',
          workstreamKey: 'SURVEY',
          idempotencyKey: 'file-v2',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('logs only the database code when initiation fails and retains the original failure', async () => {
    const failure = new Prisma.PrismaClientKnownRequestError(
      'PRIVATE_FILENAME PRIVATE_TOKEN PRIVATE_QUERY',
      { code: 'P2028', clientVersion: 'test' },
    );
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = Reflect.construct(UploadsService, [
      { $transaction: vi.fn().mockRejectedValue(failure) },
      {},
      { assertDocumentUpload: vi.fn() },
      {},
    ]) as UploadsService;
    try {
      await expect(
        service.initiate(actor, {
          projectId: 'project',
          requiredDocumentId: 'document',
          idempotencyKey: 'synthetic',
          originalFilename: 'PRIVATE_FILENAME.pdf',
          declaredSize: 50_000_000,
          mimeType: 'application/pdf',
        } as InitiateUploadDto),
      ).rejects.toBe(failure);
      expect(log).toHaveBeenCalledWith({
        event: 'UPLOAD_INITIATE_FAILED',
        phase: 'TRANSACTION',
        databaseError: 'P2028',
      });
      expect(redact(log.mock.calls[0]?.[0])).toMatchObject({
        databaseError: 'P2028',
      });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /PRIVATE_FILENAME|PRIVATE_TOKEN|PRIVATE_QUERY/,
      );
    } finally {
      log.mockRestore();
    }
  });

  it('creates and stores the authorized logical target before opening its transfer session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const create = vi.fn(async ({ data }) => ({
      ...data,
      declaredSize: BigInt(data.declaredSize),
      uploadedBytes: 0n,
    }));
    const stageOne = {
      createUploadTargetInTransaction: vi
        .fn()
        .mockResolvedValue({ id: 'logical-document' }),
    };
    const uploadSession = {
      create,
      findFirst: vi.fn().mockResolvedValue(null),
    };
    const service = Reflect.construct(UploadsService, [
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      },
      {},
      { assertDocumentUpload: vi.fn() },
      stageOne,
    ]) as UploadsService;
    const stageOneDocument = {
      definitionId: 'definition',
      stageKey: 'STAGE_1' as const,
      workstreamKey: 'ASSIGNMENT',
      contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
      displayName: 'Hồ sơ pháp lý bổ sung',
      submittedOfficerId: 'officer',
      idempotencyKey: 'file-1',
    };

    await service.initiate(actor, {
      projectId: 'project',
      stageOneDocument,
      originalFilename: 'document.pdf',
      declaredSize: 8,
      mimeType: 'application/pdf',
    } as InitiateUploadDto);

    expect(stageOne.createUploadTargetInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      'project',
      stageOneDocument,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'project',
          requiredDocumentId: undefined,
          stageOneDocumentId: 'logical-document',
          submittingOfficerId: 'officer',
        }),
      }),
    );
  });

  it('reuses the transfer session when the same file initiation is retried', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    let saved: Record<string, unknown> | null = null;
    const uploadSession = {
      findFirst: vi.fn(async () => saved),
      create: vi.fn(async ({ data }) => {
        saved = {
          ...data,
          id: 'session',
          status: 'INITIATED',
          checksum: data.checksum ?? null,
          createdAt: new Date(),
          declaredSize: BigInt(data.declaredSize),
          uploadedBytes: 0n,
        };
        return saved;
      }),
    };
    const stageOne = {
      createUploadTargetInTransaction: vi
        .fn()
        .mockResolvedValue({ id: 'logical-document' }),
    };
    let transaction = Promise.resolve();
    const prisma = {
      uploadSession,
      $transaction: vi.fn((work) => {
        const result = transaction.then(() =>
          work(uploadCapacityTransaction(uploadSession)),
        );
        transaction = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      }),
    };
    const service = Reflect.construct(UploadsService, [
      prisma,
      {},
      {},
      stageOne,
    ]) as UploadsService;
    const request = {
      projectId: 'project',
      stageOneDocument: {
        definitionId: 'definition',
        stageKey: 'STAGE_1' as const,
        workstreamKey: 'ASSIGNMENT',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
        submittedOfficerId: 'officer',
        idempotencyKey: 'file-1',
      },
      originalFilename: 'document.pdf',
      declaredSize: 8,
      mimeType: 'application/pdf',
    } as InitiateUploadDto;

    const [first, retry] = await Promise.all([
      service.initiate(actor, request),
      service.initiate(actor, request),
    ]);

    expect(retry).toMatchObject({
      id: first.id,
      stageOneDocumentId: 'logical-document',
    });
    expect(uploadSession.create).toHaveBeenCalledOnce();
  });

  it('reuses a required-document transfer session and rejects key metadata drift', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    let saved: Record<string, unknown> | null = null;
    const uploadSession = {
      findFirst: vi.fn(async () => saved),
      create: vi.fn(async ({ data }) => {
        saved = {
          ...data,
          id: 'session',
          status: 'INITIATED',
          checksum: data.checksum ?? null,
          createdAt: new Date(),
          uploadedBytes: 0n,
          parts: [],
        };
        return saved;
      }),
    };
    const service = new UploadsService(
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );
    const request = {
      projectId: 'project',
      requiredDocumentId: 'document',
      idempotencyKey: 'required-file-1',
      originalFilename: 'document.pdf',
      declaredSize: 8,
      mimeType: 'application/pdf',
    } as InitiateUploadDto;

    const first = await service.initiate(actor, request);
    await expect(service.initiate(actor, request)).resolves.toMatchObject({
      id: first.id,
    });
    await expect(
      service.initiate(actor, {
        ...request,
        originalFilename: 'different.pdf',
      }),
    ).rejects.toMatchObject({
      response: { category: 'IDEMPOTENCY_CONFLICT' },
    });
    expect(uploadSession.create).toHaveBeenCalledOnce();
  });

  it('does not create a required-document session after access is revoked while initiation waits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    let accessAllowed = true;
    let releaseTransaction!: () => void;
    let transactionWaiting!: () => void;
    const transactionGate = new Promise<void>(
      (resolve) => (releaseTransaction = resolve),
    );
    const transactionEntered = new Promise<void>(
      (resolve) => (transactionWaiting = resolve),
    );
    const create = vi.fn(async ({ data }) => ({
      ...data,
      status: 'INITIATED',
      uploadedBytes: 0n,
      parts: [],
    }));
    let query = 0;
    let projectLocked = false;
    const tx = {
      $queryRaw: vi.fn(async (statement: unknown) => {
        if (
          statement &&
          typeof statement === 'object' &&
          'strings' in statement &&
          Array.isArray(statement.strings) &&
          statement.strings.join('').includes('FROM "Project"')
        )
          projectLocked = true;
        query++;
        if (query === 1) {
          transactionWaiting();
          await transactionGate;
          return [{ locked: true }];
        }
        if (query === 2) return [{ id: actor.organizationId }];
        if (query === 3) return [{ id: 'project' }];
        return [
          {
            permanentBytes: '0',
            stagedBytes: '0',
            materializedBytes: '0',
            objectRows: '0',
            recentActorOperations: '0',
            globalPermanentBytes: '0',
            globalStagedBytes: '0',
            globalMaterializedBytes: '0',
            globalObjectRows: '0',
          },
        ];
      }),
      uploadSession: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        create,
      },
    };
    const products = {
      assertDocumentUpload: vi.fn(async () => {
        if (!accessAllowed) {
          if (!projectLocked)
            throw new Error('Target rechecked before Project lock');
          throw new NotFoundException('Required document not found');
        }
        return { id: 'document' };
      }),
    };
    const service = new UploadsService(
      {
        $transaction: vi.fn(async (work) => work(tx)),
      } as never,
      {} as never,
      products as never,
    );

    const initiation = service.initiate(actor, {
      projectId: 'project',
      requiredDocumentId: 'document',
      idempotencyKey: 'required-file-revoked',
      originalFilename: 'document.pdf',
      declaredSize: 8,
      mimeType: 'application/pdf',
    });
    await transactionEntered;
    accessAllowed = false;
    releaseTransaction();

    await expect(initiation).rejects.toBeInstanceOf(NotFoundException);
    expect(projectLocked).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('never repairs a missing session officer from the mutable document', async () => {
    const existing = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: null,
      stageOneDocumentId: 'logical-document',
      submittingOfficerId: null,
      stageOneDocument: { submittedOfficerId: 'officer' },
      idempotencyKey: 'file-1',
      originalFilename: 'document.pdf',
      declaredSize: 8n,
      uploadedBytes: 0n,
      mimeType: 'application/pdf',
      status: 'INITIATED',
      checksum: null,
      expiresAt: new Date(Date.now() + 60_000),
      parts: [],
    };
    const uploadSession = {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn(),
    };
    const service = Reflect.construct(UploadsService, [
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      },
      {},
      {},
      {
        createUploadTargetInTransaction: vi
          .fn()
          .mockResolvedValue({ id: 'logical-document' }),
      },
    ]) as UploadsService;

    await expect(
      service.initiate(actor, {
        projectId: 'project',
        stageOneDocument: {
          definitionId: 'definition',
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: 'officer',
          idempotencyKey: 'file-1',
        },
        originalFilename: 'document.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      } as InitiateUploadDto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(uploadSession.create).not.toHaveBeenCalled();
  });

  it('creates a fresh transfer session when the prior file-key session has expired', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const expired = {
      id: 'expired-session',
      organizationId: 'organization',
      actorId: 'actor',
      projectId: 'project',
      requiredDocumentId: null,
      stageOneDocumentId: 'logical-document',
      submittingOfficerId: 'officer',
      idempotencyKey: 'file-1',
      originalFilename: 'document.pdf',
      declaredSize: 8n,
      uploadedBytes: 0n,
      mimeType: 'application/pdf',
      status: 'INITIATED',
      checksum: null,
      expiresAt: new Date(Date.now() - 1),
      parts: [],
    };
    const create = vi.fn(async ({ data }) => ({
      ...data,
      id: 'fresh-session',
      status: 'INITIATED',
      uploadedBytes: 0n,
    }));
    const uploadSession = {
      findFirst: vi.fn(async ({ where }) => (where.OR ? null : expired)),
      create,
    };
    const service = Reflect.construct(UploadsService, [
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      },
      {},
      {},
      {
        createUploadTargetInTransaction: vi
          .fn()
          .mockResolvedValue({ id: 'logical-document' }),
      },
    ]) as UploadsService;

    await expect(
      service.initiate(actor, {
        projectId: 'project',
        stageOneDocument: {
          definitionId: 'definition',
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: 'officer',
          idempotencyKey: 'file-1',
        },
        originalFilename: 'document.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      } as InitiateUploadDto),
    ).resolves.toMatchObject({ id: 'fresh-session' });
    expect(create).toHaveBeenCalledOnce();
  });

  it('reuses an available file-key result after its transfer expiry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const available = {
      id: 'available-session',
      organizationId: 'organization',
      actorId: 'actor',
      submittingOfficerId: 'officer',
      projectId: 'project',
      requiredDocumentId: null,
      stageOneDocumentId: 'logical-document',
      idempotencyKey: 'file-1',
      originalFilename: 'document.pdf',
      declaredSize: 8n,
      uploadedBytes: 8n,
      mimeType: 'application/pdf',
      fileAssetId: 'asset',
      status: 'AVAILABLE',
      checksum: 'a'.repeat(64),
      expiresAt: new Date(Date.now() - 1),
      parts: [],
    };
    const create = vi.fn();
    const uploadSession = {
      findFirst: vi.fn(async ({ where }) => (where.OR ? available : null)),
      create,
    };
    const service = Reflect.construct(UploadsService, [
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      },
      {},
      {},
      {
        createUploadTargetInTransaction: vi
          .fn()
          .mockResolvedValue({ id: 'logical-document' }),
      },
    ]) as UploadsService;

    await expect(
      service.initiate(actor, {
        projectId: 'project',
        stageOneDocument: {
          definitionId: 'definition',
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: 'officer',
          idempotencyKey: 'file-1',
        },
        originalFilename: 'document.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      } as InitiateUploadDto),
    ).resolves.toMatchObject({ id: 'available-session', fileAssetId: 'asset' });
    expect(create).not.toHaveBeenCalled();
  });

  it('reuses an expired materialized VERIFYING result for the same file key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const verifying = {
      id: 'verifying-session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      submittingOfficerId: 'officer',
      projectId: 'project',
      requiredDocumentId: null,
      stageOneDocumentId: 'logical-document',
      idempotencyKey: 'file-1',
      originalFilename: 'document.pdf',
      declaredSize: 8n,
      uploadedBytes: 8n,
      mimeType: 'application/pdf',
      fileAssetId: 'asset',
      status: 'VERIFYING',
      checksum: 'a'.repeat(64),
      expiresAt: new Date(0),
      parts: [],
    };
    const findFirst = vi.fn().mockResolvedValue(verifying);
    const create = vi.fn();
    const uploadSession = { findFirst, create };
    const service = Reflect.construct(UploadsService, [
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      },
      {},
      {},
      {
        createUploadTargetInTransaction: vi
          .fn()
          .mockResolvedValue({ id: 'logical-document' }),
      },
    ]) as UploadsService;

    await expect(
      service.initiate(actor, {
        projectId: 'project',
        stageOneDocument: {
          definitionId: 'definition',
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: 'officer',
          idempotencyKey: 'file-1',
        },
        originalFilename: 'document.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      } as InitiateUploadDto),
    ).resolves.toMatchObject({ id: 'verifying-session', fileAssetId: 'asset' });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { status: 'VERIFYING', fileAssetId: { not: null } },
          ]),
        }),
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('creates one transfer session per existing-document file key and reuses an exact retry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const saved: Record<string, unknown>[] = [];
    const uploadSession = {
      findFirst: vi.fn(async ({ where }) =>
        saved.find(
          (session) =>
            session.stageOneDocumentId === where.stageOneDocumentId &&
            session.idempotencyKey === where.idempotencyKey,
        ),
      ),
      create: vi.fn(async ({ data }) => {
        const session = {
          ...data,
          id: `session-${saved.length + 1}`,
          status: 'INITIATED',
          checksum: data.checksum ?? null,
          createdAt: new Date(),
          declaredSize: BigInt(data.declaredSize),
          uploadedBytes: 0n,
        };
        saved.push(session);
        return session;
      }),
    };
    const stageOne = {
      createUploadTargetInTransaction: vi
        .fn()
        .mockResolvedValue({ id: 'logical-document' }),
    };
    const service = Reflect.construct(UploadsService, [
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      },
      {},
      {},
      stageOne,
    ]) as UploadsService;
    const initiate = (idempotencyKey: string) =>
      service.initiate(actor, {
        projectId: 'project',
        stageOneDocument: {
          documentId: 'logical-document',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          idempotencyKey,
        },
        originalFilename: 'document.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      } as unknown as InitiateUploadDto);

    const first = await initiate('version-2');
    const second = await initiate('version-3');
    const retry = await initiate('version-2');
    await expect(
      service.initiate({ ...actor, userId: 'another-uploader' }, {
        projectId: 'project',
        stageOneDocument: {
          documentId: 'logical-document',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          idempotencyKey: 'version-2',
        },
        originalFilename: 'document.pdf',
        declaredSize: 8,
        mimeType: 'application/pdf',
      } as unknown as InitiateUploadDto),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(first.id).not.toBe(second.id);
    expect(retry.id).toBe(first.id);
    expect(uploadSession.create).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(first)).not.toContain('idempotencyKey');
  });

  it('returns actual environment constraints only to an authorized actor', () => {
    vi.stubEnv('UPLOAD_MAX_FILE_BYTES', String(6 * 1024 ** 3));
    const service = new UploadsService({} as never, {} as never, {} as never);

    expect(service.constraints(actor)).toEqual(
      uploadConstraints(6 * 1024 ** 3),
    );
    expect(() =>
      service.constraints({
        organizationId: 'organization',
        userId: 'actor',
        permissions: ['file.upload'],
      } as never),
    ).toThrow(ForbiddenException);
  });

  it('publishes the authorized static constraints route before upload ids', () => {
    const constraints = vi.fn().mockReturnValue({
      maxBytes: 123,
      allowedExtensions: ['.pdf'],
    });
    const controller = new UploadsController({ constraints } as never);

    expect(controller.constraints(actor)).toEqual({
      maxBytes: 123,
      allowedExtensions: ['.pdf'],
    });
    expect(constraints).toHaveBeenCalledWith(actor);
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        UploadsController.prototype.constraints,
      ),
    ).toBe('constraints');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        UploadsController.prototype.constraints,
      ),
    ).toBe(0);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        UploadsController.prototype.constraints,
      ),
    ).toEqual(['file.upload']);
  });

  it('publishes actor-and-target-scoped temporary upload recovery', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const available = {
      id: 'available-session',
      organizationId: 'organization',
      actorId: 'actor',
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      fileAssetId: 'asset',
      status: 'AVAILABLE',
      declaredSize: 8n,
      uploadedBytes: 8n,
      partSize: 8,
      totalParts: 1,
      originalFilename: 'document.pdf',
      mimeType: 'application/pdf',
      expiresAt,
      storageKey: 'private/storage/key',
      checksum: 'private-checksum',
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([available]);
    const products = {
      assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
    };
    const service = new UploadsService(
      { uploadSession: { updateMany, findMany } } as never,
      {} as never,
      products as never,
    );
    const recover = (
      service as unknown as {
        recover?: (
          actor: CurrentActor,
          query: {
            projectId: string;
            requiredDocumentId: string;
          },
        ) => Promise<{ items: unknown[] }>;
      }
    ).recover;

    expect(typeof recover).toBe('function');
    const result = await recover!.call(service, actor, {
      projectId: 'project',
      requiredDocumentId: 'document',
    });

    expect(products.assertDocumentUpload).toHaveBeenCalledWith(
      actor,
      'project',
      'document',
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        projectId: 'project',
        requiredDocumentId: 'document',
        status: 'AVAILABLE',
        expiresAt: { lte: expect.any(Date) },
        fileAsset: { is: { attachments: { none: {} } } },
      }),
      data: { status: 'EXPIRED' },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        projectId: 'project',
        requiredDocumentId: 'document',
        status: 'AVAILABLE',
        expiresAt: { gt: expect.any(Date) },
        fileAssetId: { not: null },
        fileAsset: { is: { attachments: { none: {} } } },
      }),
      orderBy: { createdAt: 'asc' },
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'available-session',
        status: 'AVAILABLE',
        uploadedBytes: '8',
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /storageKey|checksum|organizationId|actorId|fileAssetId/,
    );
  });

  it('accepts Project-only recovery or one UUID target, but never two targets', async () => {
    const projectId = '00000000-0000-4000-8000-000000000001';
    const requiredDocumentId = '00000000-0000-4000-8000-000000000002';
    const stageOneDocumentId = '00000000-0000-4000-8000-000000000003';

    await expect(
      validateRecovery({ projectId, requiredDocumentId }),
    ).resolves.toEqual({ projectId, requiredDocumentId });
    await expect(validateRecovery({ projectId })).resolves.toEqual({
      projectId,
    });
    await expect(
      validateRecovery({ projectId, requiredDocumentId, stageOneDocumentId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('discovers only reauthorized actor-owned Project drafts without exposing storage metadata', async () => {
    const available = (id: string, stageOneDocumentId: string) => ({
      id,
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: null,
      stageOneDocumentId,
      fileAssetId: `asset-${id}`,
      status: 'AVAILABLE',
      declaredSize: 8n,
      uploadedBytes: 8n,
      partSize: 8,
      totalParts: 1,
      originalFilename: `${id}.pdf`,
      mimeType: 'application/pdf',
      expiresAt: new Date(Date.now() + 60_000),
      storageKey: `private/${id}`,
      checksum: `private-${id}`,
      stageOneDocument: {
        requiredDocumentId: `definition-${id}`,
        stageKey: 'STAGE_1',
        workstreamKey: 'ASSIGNMENT',
        submittedOfficerId: actor.userId,
      },
    });
    const findMany = vi
      .fn()
      .mockResolvedValue([
        available('allowed', 'document-allowed'),
        available('revoked', 'document-revoked'),
      ]);
    const stageOne = {
      assertUploadTarget: vi.fn(
        async (
          _actor: CurrentActor,
          _projectId: string,
          documentId: string,
        ) => {
          if (documentId === 'document-revoked')
            throw new ForbiddenException('revoked');
        },
      ),
    };
    const service = Reflect.construct(UploadsService, [
      { uploadSession: { findMany, updateMany: vi.fn() } },
      {},
      {},
      stageOne,
    ]) as UploadsService;

    const result = await service.recover(actor, { projectId: 'project' });

    expect(findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        projectId: 'project',
        status: 'AVAILABLE',
        fileAssetId: { not: null },
        fileAsset: { is: { attachments: { none: {} } } },
      }),
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
    expect(stageOne.assertUploadTarget).toHaveBeenCalledTimes(2);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'allowed',
        stageOneDocumentId: 'document-allowed',
        stageOneDocument: {
          requiredDocumentId: 'definition-allowed',
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          submittedOfficerId: actor.userId,
        },
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /storageKey|checksum|organizationId|actorId|fileAssetId/,
    );
  });

  it('reauthorizes the exact logical-document recovery context', async () => {
    const stageOne = { assertUploadTarget: vi.fn() };
    const findMany = vi.fn().mockResolvedValue([]);
    const service = Reflect.construct(UploadsService, [
      {
        uploadSession: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findMany,
        },
      },
      {},
      {},
      stageOne,
    ]) as UploadsService;

    await expect(
      service.recover(actor, {
        projectId: 'project',
        stageOneDocumentId: 'logical-document',
      }),
    ).resolves.toEqual({ items: [] });
    expect(stageOne.assertUploadTarget).toHaveBeenCalledWith(
      actor,
      'project',
      'logical-document',
    );
    expect(findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        projectId: 'project',
        requiredDocumentId: null,
        stageOneDocumentId: 'logical-document',
      }),
      orderBy: { createdAt: 'asc' },
    });
  });

  it('routes temporary recovery before upload-session ids', () => {
    const recover = vi.fn().mockResolvedValue({ items: [] });
    const controller = new UploadsController({ recover } as never);
    const method = (
      controller as unknown as {
        recovery?: (
          actor: CurrentActor,
          query: Record<string, string>,
        ) => unknown;
      }
    ).recovery;

    expect(typeof method).toBe('function');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        (UploadsController.prototype as unknown as { recovery: object })
          .recovery,
      ),
    ).toBe('recovery');
  });

  it('accepts only 1..20 unique UUID sessions and a stable trimmed key', async () => {
    const projectId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-0000000000ab';

    await expect(
      validateSubmission({
        projectId,
        sessionIds: [sessionId],
        idempotencyKey: '  submit-1  ',
      }),
    ).resolves.toEqual({
      projectId,
      sessionIds: [sessionId],
      idempotencyKey: 'submit-1',
    });
    await expect(
      validateSubmission({ projectId, sessionIds: [], idempotencyKey: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateSubmission({
        projectId,
        sessionIds: Array.from(
          { length: 21 },
          (_, index) =>
            `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        ),
        idempotencyKey: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateSubmission({
        projectId,
        sessionIds: [sessionId, sessionId],
        idempotencyKey: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validateSubmission({
        projectId,
        sessionIds: [sessionId, sessionId.toUpperCase()],
        idempotencyKey: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('routes NOP HO SO through the static submit command', () => {
    const submit = vi.fn();
    const controller = new UploadsController({ submit } as never);
    const dto = {
      projectId: 'project',
      sessionIds: ['session'],
      idempotencyKey: 'submit-1',
    };
    controller.submit(actor, dto);
    expect(submit).toHaveBeenCalledWith(actor, dto);
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        (UploadsController.prototype as unknown as { submit: object }).submit,
      ),
    ).toBe('submit');
  });

  it('links only canonical AVAILABLE sessions without touching chunk or storage bytes', async () => {
    const sessions = [
      {
        id: 'session-required',
        organizationId: actor.organizationId,
        actorId: actor.userId,
        projectId: 'project',
        requiredDocumentId: 'required-document',
        stageOneDocumentId: null,
        fileAssetId: 'asset-required',
        status: 'AVAILABLE',
      },
      {
        id: 'session-stage',
        organizationId: actor.organizationId,
        actorId: actor.userId,
        projectId: 'project',
        requiredDocumentId: null,
        stageOneDocumentId: 'stage-document',
        submittingOfficerId: 'officer-stage',
        fileAssetId: 'asset-stage',
        status: 'AVAILABLE',
      },
    ];
    const upsert = vi.fn().mockResolvedValue({ id: 'attachment' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
      uploadSession: { findMany: vi.fn().mockResolvedValue(sessions) },
      activity: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      entityAttachment: { upsert },
    };
    const prisma = {
      uploadPart: { findMany: vi.fn() },
      $transaction: vi.fn(async (work) => work(tx)),
    };
    const storage = { putStream: vi.fn(), remove: vi.fn() };
    const products = {
      assertDocumentUpload: vi.fn().mockResolvedValue({
        id: 'required-document',
        currentFileAssetId: 'asset-required',
      }),
      linkUploadFileInTransaction: vi.fn().mockResolvedValue({
        id: 'required-document',
        currentFileAssetId: 'asset-required',
      }),
    };
    const stageOne = {
      assertUploadTarget: vi.fn().mockResolvedValue({
        id: 'stage-document',
        currentFileAssetId: 'asset-stage',
      }),
      linkUploadFileInTransaction: vi.fn().mockResolvedValue({
        id: 'stage-document',
        currentFileAssetId: 'asset-stage',
      }),
    };
    const service = Reflect.construct(UploadsService, [
      prisma,
      storage,
      products,
      stageOne,
    ]) as UploadsService;
    const result = await service.submit(actor, {
      projectId: 'project',
      sessionIds: ['session-required', 'session-stage'],
      idempotencyKey: 'submit-1',
    });

    expect(result).toEqual({
      items: [
        {
          sessionId: 'session-required',
          fileAssetId: 'asset-required',
          document: expect.objectContaining({ id: 'required-document' }),
        },
        {
          sessionId: 'session-stage',
          fileAssetId: 'asset-stage',
          document: expect.objectContaining({ id: 'stage-document' }),
        },
      ],
    });
    expect(products.assertDocumentUpload).toHaveBeenCalledWith(
      actor,
      'project',
      'required-document',
    );
    expect(stageOne.assertUploadTarget).toHaveBeenCalledWith(
      actor,
      'project',
      'stage-document',
    );
    expect(stageOne.linkUploadFileInTransaction).toHaveBeenCalledWith(
      actor,
      'project',
      'stage-document',
      'asset-stage',
      'officer-stage',
      tx,
    );
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(prisma.uploadPart.findMany).not.toHaveBeenCalled();
    expect(storage.putStream).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each([
    ['foreign actor', { actorId: 'foreign-actor' }, NotFoundException],
    ['cross Project', { projectId: 'other-project' }, NotFoundException],
    ['non-AVAILABLE', { status: 'FAILED' }, ConflictException],
  ])(
    'rejects a %s session before permanent linkage',
    async (_name, change, ErrorType) => {
      const session = {
        id: 'session',
        organizationId: actor.organizationId,
        actorId: actor.userId,
        projectId: 'project',
        requiredDocumentId: 'document',
        stageOneDocumentId: null,
        fileAssetId: 'asset',
        status: 'AVAILABLE',
        ...change,
      };
      const link = vi.fn();
      const service = new UploadsService(
        {
          $transaction: vi.fn(async (work) =>
            work({
              $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
              uploadSession: { findMany: vi.fn().mockResolvedValue([session]) },
              activity: { findFirst: vi.fn().mockResolvedValue(null) },
              entityAttachment: { upsert: vi.fn() },
            }),
          ),
        } as never,
        {} as never,
        {
          assertDocumentUpload: vi.fn(),
          linkUploadFileInTransaction: link,
        } as never,
      );

      await expect(
        service.submit(actor, {
          projectId: 'project',
          sessionIds: ['session'],
          idempotencyKey: 'submit-1',
        }),
      ).rejects.toBeInstanceOf(ErrorType);
      expect(link).not.toHaveBeenCalled();
    },
  );

  it('replays an exact already-submitted asset without duplicating its attachment', async () => {
    const link = vi.fn().mockResolvedValue({ id: 'document' });
    const upsert = vi.fn();
    const service = new UploadsService(
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: 'session',
                  organizationId: actor.organizationId,
                  actorId: actor.userId,
                  projectId: 'project',
                  requiredDocumentId: 'document',
                  stageOneDocumentId: null,
                  fileAssetId: 'asset',
                  fileAsset: {
                    attachments: [
                      {
                        entityType: 'ProjectRequiredDocument',
                        entityId: 'document',
                        projectId: 'project',
                      },
                    ],
                  },
                  requiredDocument: { currentFileAssetId: 'asset' },
                  status: 'AVAILABLE',
                  expiresAt: new Date(Date.now() + 60_000),
                },
              ]),
            },
            activity: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn(),
            },
            entityAttachment: { upsert },
          }),
        ),
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn(),
        linkUploadFileInTransaction: link,
      } as never,
    );

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session'],
        idempotencyKey: 'new-key',
      }),
    ).resolves.toMatchObject({
      items: [{ sessionId: 'session', fileAssetId: 'asset' }],
    });
    expect(upsert).toHaveBeenCalledOnce();
    expect(link).toHaveBeenCalledOnce();
  });

  it('rejects a target-authorized AVAILABLE session after its expiry before permanent linkage', async () => {
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      fileAssetId: 'asset',
      status: 'AVAILABLE',
      expiresAt: new Date(0),
    };
    const upsert = vi.fn();
    const link = vi.fn();
    const assertDocumentUpload = vi.fn().mockResolvedValue({ id: 'document' });
    const service = new UploadsService(
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: { findMany: vi.fn().mockResolvedValue([session]) },
            activity: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn(),
            },
            entityAttachment: { upsert },
          }),
        ),
      } as never,
      {} as never,
      {
        assertDocumentUpload,
        linkUploadFileInTransaction: link,
      } as never,
    );

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session'],
        idempotencyKey: 'submit-expired',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(assertDocumentUpload).toHaveBeenCalledWith(
      actor,
      'project',
      'document',
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });

  it('returns an exact batch retry after expiry without duplicating attachment or version work', async () => {
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: null,
      stageOneDocumentId: 'document',
      fileAssetId: 'asset',
      status: 'EXPIRED',
      expiresAt: new Date(0),
    };
    const upsert = vi.fn();
    const link = vi.fn();
    const targetDocument = {
      id: 'document',
      currentFileAssetId: 'asset',
      currentVersion: 1,
    };
    const service = Reflect.construct(UploadsService, [
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: { findMany: vi.fn().mockResolvedValue([session]) },
            activity: {
              findFirst: vi.fn().mockResolvedValue({
                metadata: {
                  idempotencyKey: 'submit-1',
                  sessionIds: ['session'],
                  result: {
                    items: [
                      {
                        sessionId: 'session',
                        fileAssetId: 'asset',
                        document: targetDocument,
                      },
                    ],
                  },
                },
              }),
            },
            entityAttachment: { upsert },
          }),
        ),
      },
      {},
      {},
      {
        assertUploadTarget: vi.fn().mockResolvedValue(targetDocument),
        linkUploadFileInTransaction: link,
      },
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session'],
        idempotencyKey: 'submit-1',
      }),
    ).resolves.toEqual({
      items: [
        {
          sessionId: 'session',
          fileAssetId: 'asset',
          document: targetDocument,
        },
      ],
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });

  it('rejects reuse of a submission key for a different session set', async () => {
    const service = Reflect.construct(UploadsService, [
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: 'session-new',
                  organizationId: actor.organizationId,
                  actorId: actor.userId,
                  projectId: 'project',
                  requiredDocumentId: null,
                  stageOneDocumentId: 'document',
                  fileAssetId: 'asset',
                  status: 'AVAILABLE',
                },
              ]),
            },
            activity: {
              findFirst: vi.fn().mockResolvedValue({
                metadata: {
                  idempotencyKey: 'submit-1',
                  sessionIds: ['session-old'],
                  result: { items: [] },
                },
              }),
            },
          }),
        ),
      },
      {},
      {},
      { assertUploadTarget: vi.fn().mockResolvedValue({ id: 'document' }) },
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session-new'],
        idempotencyKey: 'submit-1',
      }),
    ).rejects.toMatchObject({
      response: { category: 'IDEMPOTENCY_CONFLICT' },
    });
  });

  it('matches a submission key across actors within the same Project', async () => {
    const findFirst = vi.fn(({ where }) =>
      where.actorId
        ? null
        : {
            metadata: {
              idempotencyKey: 'project-key',
              sessionIds: ['session-old'],
              result: { items: [] },
            },
          },
    );
    const service = Reflect.construct(UploadsService, [
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: 'session-new',
                  organizationId: actor.organizationId,
                  actorId: actor.userId,
                  projectId: 'project',
                  requiredDocumentId: null,
                  stageOneDocumentId: 'document',
                  fileAssetId: 'asset',
                  status: 'AVAILABLE',
                },
              ]),
            },
            activity: { findFirst, create: vi.fn() },
            entityAttachment: { upsert: vi.fn() },
          }),
        ),
      },
      {},
      {},
      {
        assertUploadTarget: vi.fn().mockResolvedValue({ id: 'document' }),
        linkUploadFileInTransaction: vi
          .fn()
          .mockResolvedValue({ id: 'document' }),
      },
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session-new'],
        idempotencyKey: 'project-key',
      }),
    ).rejects.toMatchObject({
      response: { category: 'IDEMPOTENCY_CONFLICT' },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.not.objectContaining({ actorId: expect.anything() }),
      select: { metadata: true },
    });
  });

  it('uses the Project batch ledger even when prior document linkage returned early', async () => {
    const link = vi.fn().mockResolvedValue({ id: 'document' });
    const service = Reflect.construct(UploadsService, [
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: 'session-new',
                  organizationId: actor.organizationId,
                  actorId: actor.userId,
                  projectId: 'project',
                  requiredDocumentId: null,
                  stageOneDocumentId: 'document',
                  fileAssetId: 'asset-new',
                  status: 'AVAILABLE',
                },
              ]),
            },
            activity: {
              findFirst: vi.fn().mockResolvedValue({
                metadata: {
                  idempotencyKey: 'submit-2',
                  sessionIds: ['session-original'],
                  result: { items: [] },
                },
              }),
              findMany: vi.fn().mockResolvedValue([]),
              create: vi.fn(),
            },
            entityAttachment: { upsert: vi.fn() },
          }),
        ),
      },
      {},
      {},
      {
        assertUploadTarget: vi.fn().mockResolvedValue({ id: 'document' }),
        linkUploadFileInTransaction: link,
      },
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session-new'],
        idempotencyKey: 'submit-2',
      }),
    ).rejects.toMatchObject({
      response: { category: 'IDEMPOTENCY_CONFLICT' },
    });
    expect(link).not.toHaveBeenCalled();
  });

  it('returns the original stored batch projection after its document advances', async () => {
    const original = {
      items: [
        {
          sessionId: 'session',
          fileAssetId: 'asset-original',
          document: {
            id: 'document',
            currentFileAssetId: 'asset-original',
            currentVersion: 1,
          },
        },
      ],
    };
    const service = Reflect.construct(UploadsService, [
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: 'session',
                  organizationId: actor.organizationId,
                  actorId: actor.userId,
                  projectId: 'project',
                  requiredDocumentId: null,
                  stageOneDocumentId: 'document',
                  fileAssetId: 'asset-original',
                  status: 'AVAILABLE',
                },
              ]),
            },
            activity: {
              findFirst: vi.fn().mockResolvedValue({
                metadata: {
                  idempotencyKey: 'submit-1',
                  sessionIds: ['session'],
                  result: original,
                },
              }),
              findMany: vi.fn().mockResolvedValue([
                {
                  metadata: {
                    sessionId: 'session',
                    submissionIdempotencyKey: 'submit-1',
                  },
                },
              ]),
            },
          }),
        ),
      },
      {},
      {},
      {
        assertUploadTarget: vi.fn().mockResolvedValue({
          id: 'document',
          currentFileAssetId: 'asset-later',
          currentVersion: 2,
        }),
      },
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session'],
        idempotencyKey: 'submit-1',
      }),
    ).resolves.toEqual(original);
  });

  it('keeps each session paired with its own document result for a repeated target', async () => {
    const sessions = ['one', 'two'].map((suffix) => ({
      id: `session-${suffix}`,
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: null,
      stageOneDocumentId: 'document',
      fileAssetId: `asset-${suffix}`,
      status: 'AVAILABLE',
    }));
    const link = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'document',
        currentFileAssetId: 'asset-one',
        currentVersion: 1,
      })
      .mockResolvedValueOnce({
        id: 'document',
        currentFileAssetId: 'asset-two',
        currentVersion: 2,
      });
    const service = Reflect.construct(UploadsService, [
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: { findMany: vi.fn().mockResolvedValue(sessions) },
            activity: {
              findFirst: vi.fn().mockResolvedValue(null),
              findMany: vi.fn().mockResolvedValue([]),
              create: vi.fn(),
            },
            entityAttachment: { upsert: vi.fn() },
          }),
        ),
      },
      {},
      {},
      {
        assertUploadTarget: vi.fn().mockResolvedValue({ id: 'document' }),
        linkUploadFileInTransaction: link,
      },
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session-one', 'session-two'],
        idempotencyKey: 'submit-repeated-target',
      }),
    ).resolves.toMatchObject({
      items: [
        {
          sessionId: 'session-one',
          fileAssetId: 'asset-one',
          document: {
            currentFileAssetId: 'asset-one',
            currentVersion: 1,
          },
        },
        {
          sessionId: 'session-two',
          fileAssetId: 'asset-two',
          document: {
            currentFileAssetId: 'asset-two',
            currentVersion: 2,
          },
        },
      ],
    });
  });

  it('normalizes accepted uppercase UUIDs before session lookup and comparison', async () => {
    const projectId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-0000000000ab';
    const service = Reflect.construct(UploadsService, [
      {
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: projectId }]),
            uploadSession: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: sessionId,
                  organizationId: actor.organizationId,
                  actorId: actor.userId,
                  projectId,
                  requiredDocumentId: null,
                  stageOneDocumentId: '00000000-0000-4000-8000-000000000002',
                  fileAssetId: '00000000-0000-4000-8000-000000000003',
                  status: 'AVAILABLE',
                },
              ]),
            },
            activity: {
              findFirst: vi.fn().mockResolvedValue(null),
              findMany: vi.fn().mockResolvedValue([]),
              create: vi.fn(),
            },
            entityAttachment: { upsert: vi.fn() },
          }),
        ),
      },
      {},
      {},
      {
        assertUploadTarget: vi.fn().mockResolvedValue({ id: 'document' }),
        linkUploadFileInTransaction: vi
          .fn()
          .mockResolvedValue({ id: 'document' }),
      },
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: projectId.toUpperCase(),
        sessionIds: [sessionId.toUpperCase()],
        idempotencyKey: 'submit-uppercase',
      }),
    ).resolves.toMatchObject({
      items: [{ sessionId, fileAssetId: expect.any(String) }],
    });
  });

  it('rejects duplicate session UUIDs after case normalization before querying', async () => {
    const transaction = vi.fn();
    const sessionId = '00000000-0000-4000-8000-0000000000ab';
    const service = Reflect.construct(UploadsService, [
      { $transaction: transaction },
      {},
      {},
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: '00000000-0000-4000-8000-000000000001',
        sessionIds: [sessionId, sessionId.toUpperCase()],
        idempotencyKey: 'duplicate-normalized-session',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('leaves the finalized FileAsset untouched when a linkage item fails', async () => {
    const fileDelete = vi.fn();
    const storage = { remove: vi.fn() };
    const service = Reflect.construct(UploadsService, [
      {
        fileAsset: { delete: fileDelete },
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'locked' }]),
            uploadSession: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: 'session',
                  organizationId: actor.organizationId,
                  actorId: actor.userId,
                  projectId: 'project',
                  requiredDocumentId: null,
                  stageOneDocumentId: 'document',
                  fileAssetId: 'asset',
                  status: 'AVAILABLE',
                },
              ]),
            },
            activity: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn(),
            },
            entityAttachment: { upsert: vi.fn() },
          }),
        ),
      },
      storage,
      {},
      {
        assertUploadTarget: vi.fn().mockResolvedValue({ id: 'document' }),
        linkUploadFileInTransaction: vi
          .fn()
          .mockRejectedValue(new Error('link failed')),
      },
    ]) as UploadsService;

    await expect(
      service.submit(actor, {
        projectId: 'project',
        sessionIds: ['session'],
        idempotencyKey: 'submit-1',
      }),
    ).rejects.toThrow('link failed');
    expect(fileDelete).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('rejects business notes from temporary byte completion', async () => {
    const checksum = 'a'.repeat(64);

    await expect(validateCompletion({ checksum })).resolves.toEqual({
      checksum,
    });
    await expect(
      validateCompletion({ note: 'Site-approved copy.' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forwards only checksum through the completion controller', () => {
    const complete = vi.fn();
    const controller = new UploadsController({ complete } as never);
    const checksum = 'a'.repeat(64);

    controller.complete(actor, 'session', { checksum });

    expect(complete).toHaveBeenCalledWith(actor, 'session', checksum);
  });

  it('rejects completion notes at the HTTP boundary before service invocation', async () => {
    const complete = vi.fn();
    Reflect.defineMetadata(
      'design:paramtypes',
      [Object, String, CompleteUploadDto],
      UploadsController.prototype,
      'complete',
    );
    const module = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: { complete } }],
    }).compile();
    const app: INestApplication = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(validation);
    await app.init();

    try {
      await request(app.getHttpServer())
        .post('/api/v1/uploads/00000000-0000-4000-8000-000000000001/complete')
        .send({ note: 'Site-approved copy.' })
        .expect(400);
      expect(complete).not.toHaveBeenCalled();
    } finally {
      await app.close();
      Reflect.deleteMetadata(
        'design:paramtypes',
        UploadsController.prototype,
        'complete',
      );
    }
  });

  it('returns only the finalized temporary asset on a sequential completion retry', async () => {
    const products = { assertDocumentUpload: vi.fn() };
    const service = new UploadsService(
      {} as never,
      {} as never,
      products as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      id: 'session',
      projectId: 'project',
      requiredDocumentId: 'document',
      fileAssetId: 'asset',
      status: 'AVAILABLE',
      declaredSize: 1n,
      uploadedBytes: 1n,
      parts: [],
    });

    const completed = await service.complete({} as never, 'session');

    expect(completed).toEqual({
      fileAssetId: 'asset',
      status: 'AVAILABLE',
      uploadedBytes: '1',
    });
    expect(products.assertDocumentUpload).not.toHaveBeenCalled();
  });

  it('rejects a conflicting checksum precondition on an AVAILABLE completion replay', async () => {
    const service = new UploadsService({} as never, {} as never, {} as never);
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      id: 'session',
      status: 'AVAILABLE',
      fileAssetId: 'asset',
      checksum: 'a'.repeat(64),
      declaredSize: 1n,
      uploadedBytes: 1n,
      parts: [],
    });

    await expect(
      service.complete(actor, 'session', 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects a conflicting checksum precondition before reconciling a materialized VERIFYING result', async () => {
    const transaction = vi.fn();
    const service = new UploadsService(
      { $transaction: transaction } as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      status: 'VERIFYING',
      fileAssetId: 'asset',
      checksum: 'a'.repeat(64),
      declaredSize: 1n,
      uploadedBytes: 1n,
      parts: [],
    });

    await expect(
      service.complete(actor, 'session', 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a completion checksum that conflicts with the initiated session before claiming it', async () => {
    const updateMany = vi.fn();
    const service = new UploadsService(
      { uploadSession: { updateMany } } as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      id: 'session',
      status: 'UPLOADING',
      checksum: 'a'.repeat(64),
      declaredSize: 1n,
      uploadedBytes: 1n,
      totalParts: 1,
      parts: [{ partNumber: 1, size: 1 }],
    });

    await expect(
      service.complete(actor, 'session', 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('publishes a materialized asset left in VERIFYING without storing bytes again', async () => {
    const update = vi.fn().mockResolvedValue({
      id: 'session',
      status: 'AVAILABLE',
      fileAssetId: 'asset',
      uploadedBytes: 1n,
    });
    const storage = { putStream: vi.fn() };
    const products = {
      assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
    };
    const service = new UploadsService(
      {
        uploadSession: {
          findUnique: vi.fn().mockResolvedValue({
            fileAssetId: 'asset',
            storageKey: 'legacy/session.pdf',
            parts: [],
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'session' }]),
            uploadSession: {
              findUniqueOrThrow: vi.fn().mockResolvedValue({
                id: 'session',
                organizationId: actor.organizationId,
                actorId: actor.userId,
                projectId: 'project',
                requiredDocumentId: 'document',
                stageOneDocumentId: null,
                status: 'VERIFYING',
                fileAssetId: 'asset',
              }),
              update,
            },
          }),
        ),
      } as never,
      storage as never,
      products as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      status: 'VERIFYING',
      fileAssetId: 'asset',
      declaredSize: 1n,
      uploadedBytes: 1n,
      parts: [],
    });

    await expect(service.complete(actor, 'session')).resolves.toEqual({
      status: 'AVAILABLE',
      fileAssetId: 'asset',
      uploadedBytes: '1',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'session' },
      data: {
        status: 'AVAILABLE',
        completedAt: expect.any(Date),
        expiresAt: expect.any(Date),
        verificationClaimId: null,
        verificationStartedAt: null,
      },
    });
    expect(products.assertDocumentUpload).toHaveBeenCalledWith(
      actor,
      'project',
      'document',
      expect.any(Object),
    );
    expect(storage.putStream).not.toHaveBeenCalled();
  });

  it('reconciles a materialized VERIFYING asset after its transfer expiry', async () => {
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      status: 'VERIFYING',
      fileAssetId: 'asset',
      expiresAt: new Date(0),
      declaredSize: 1n,
      uploadedBytes: 1n,
      parts: [],
    };
    const update = vi.fn().mockResolvedValue({
      ...session,
      status: 'AVAILABLE',
    });
    const service = new UploadsService(
      {
        uploadSession: {
          findFirst: vi.fn().mockResolvedValue(session),
          findUnique: vi.fn().mockResolvedValue({
            fileAssetId: 'asset',
            storageKey: 'legacy/session.pdf',
            parts: [],
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: vi.fn(async (work) =>
          work({
            $queryRaw: vi.fn().mockResolvedValue([{ id: 'session' }]),
            uploadSession: {
              findUniqueOrThrow: vi.fn().mockResolvedValue(session),
              update,
            },
          }),
        ),
      } as never,
      {} as never,
      { assertDocumentUpload: vi.fn() } as never,
    );

    await expect(service.complete(actor, 'session')).resolves.toMatchObject({
      status: 'AVAILABLE',
      fileAssetId: 'asset',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'session' },
      data: {
        status: 'AVAILABLE',
        completedAt: expect.any(Date),
        expiresAt: expect.any(Date),
        verificationClaimId: null,
        verificationStartedAt: null,
      },
    });
    expect(update.mock.calls[0]?.[0]?.data.expiresAt.getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it('does not reclaim a live pre-materialization verification lease', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-live'),
      undefined,
      undefined,
      {
        verifyingStartedAt: new Date(),
      },
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.updateMany).not.toHaveBeenCalled();
    expect(fixture.storage.putStream).not.toHaveBeenCalled();
  });

  it('reclaims a stale pre-materialization verification lease and completes once', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-stale'),
      undefined,
      undefined,
      {
        verifyingStartedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).resolves.toMatchObject({ status: 'AVAILABLE', fileAssetId: 'asset' });
    expect(fixture.storage.removePending).toHaveBeenCalledWith(
      'organization/2026/08/session',
      '00000000-0000-4000-8000-000000000099',
    );
    expect(fixture.storage.remove).toHaveBeenCalledWith(
      'organization/2026/08/session',
    );
    expect(fixture.storage.putStream).toHaveBeenCalledOnce();
    expect(fixture.fileAssetCreate).toHaveBeenCalledOnce();
  });

  it('removes only the exact legacy final before reopening a stale verification lease', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000002';
    const siblingId = '00000000-0000-4000-8000-000000000003';
    const organizationDirectory = join(directory, organizationId);
    const legacyFinal = join(organizationDirectory, `${sessionId}.pdf`);
    const sibling = join(organizationDirectory, `${siblingId}.pdf`);
    await mkdir(organizationDirectory, { recursive: true });
    await writeFile(legacyFinal, '%PDF-stale');
    await writeFile(sibling, '%PDF-keep');
    const service = new UploadsService(
      {
        uploadSession: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      } as never,
      { removePending: vi.fn(), remove: vi.fn() } as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          recoverVerificationLease: (session: {
            id: string;
            fileAssetId: null;
            storageKey: string;
            expiresAt: Date;
            verificationClaimId: string;
            verificationStartedAt: Date;
          }) => Promise<string | null>;
        }
      ).recoverVerificationLease({
        id: sessionId,
        fileAssetId: null,
        storageKey: `${organizationId}/${sessionId}.pdf`,
        expiresAt: new Date(Date.now() + 60_000),
        verificationClaimId: '00000000-0000-4000-8000-000000000004',
        verificationStartedAt: new Date(0),
      }),
    ).resolves.toBe('FAILED');
    await expect(readFile(legacyFinal)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(sibling)).resolves.toEqual(Buffer.from('%PDF-keep'));
  });

  it('expires and releases a stale verification lease after transfer expiry', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-expired'),
      undefined,
      undefined,
      {
        verifyingStartedAt: new Date(Date.now() - 60 * 60 * 1000),
        expiresAt: new Date(0),
      },
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.status()).toBe('EXPIRED');
    expect(fixture.storage.removePending).toHaveBeenCalledWith(
      'organization/2026/08/session',
      '00000000-0000-4000-8000-000000000099',
    );
    expect(fixture.storage.putStream).not.toHaveBeenCalled();
  });

  it('does not reopen a stale claim until its physical artifacts are removed', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-stale-cleanup'),
      undefined,
      undefined,
      {
        verifyingStartedAt: new Date(Date.now() - 60 * 60 * 1000),
        staleCleanupError: true,
      },
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.status()).toBe('VERIFYING');
    expect(fixture.storage.putStream).not.toHaveBeenCalled();
  });

  it('materializes exactly one actor-owned temporary asset without business linkage', async () => {
    const bytes = Buffer.from('%PDF-temporary');
    const fixture = await completionFixture(bytes);

    const completed = await fixture.service.complete(actor, 'session');
    const retry = await fixture.service.complete(actor, 'session');

    expect(completed).toEqual({
      status: 'AVAILABLE',
      fileAssetId: 'asset',
      uploadedBytes: String(bytes.length),
    });
    expect(retry).toEqual({
      status: 'AVAILABLE',
      fileAssetId: 'asset',
      uploadedBytes: String(bytes.length),
    });
    expect(fixture.fileAssetCreate).toHaveBeenCalledOnce();
    expect(fixture.fileAssetCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ uploadedById: actor.userId }),
    });
    expect(fixture.attachment).not.toHaveBeenCalled();
    expect(fixture.products.linkUploadFileInTransaction).not.toHaveBeenCalled();
    expect(fixture.stageOne.linkUploadFileInTransaction).not.toHaveBeenCalled();
  });

  it('cleans pending bytes without materializing after document access is revoked during storage', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-revoked'),
      undefined,
      undefined,
      { requireProjectBeforeSessionLock: true },
    );
    fixture.storage.putStream.mockImplementationOnce(
      async (_organizationId, stream: Readable) => {
        for await (const chunk of stream) void chunk;
        fixture.products.assertDocumentUpload.mockRejectedValue(
          new NotFoundException('Required document not found'),
        );
        return 'organization/2026/08/revoked';
      },
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.storage.publishPending).not.toHaveBeenCalled();
    expect(fixture.fileAssetCreate).not.toHaveBeenCalled();
    expect(fixture.storage.removePending).toHaveBeenCalledWith(
      'organization/2026/08/revoked',
      expect.any(String),
    );
    expect(fixture.status()).toBe('FAILED');
  });

  it('rechecks the bound target in the transaction that marks bytes available', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-target-deleted'),
      undefined,
      undefined,
      { revokeBeforeAvailability: true },
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.products.assertDocumentUpload).toHaveBeenCalledTimes(4);
    expect(fixture.status()).toBe('ABORTED');
    expect(fixture.fileAssetDeletedAt()).toBeInstanceOf(Date);
    expect(fixture.storage.remove).toHaveBeenCalledOnce();
  });

  it.each([
    ['file.upload', ['project.document.manage']],
    ['project.document.manage', ['file.upload']],
  ])(
    'requires %s on the public initiation method',
    async (_permission, permissions) => {
      const products = { assertDocumentUpload: vi.fn() };
      const service = new UploadsService(
        {} as never,
        {} as never,
        products as never,
      );

      await expect(
        service.initiate(
          {
            organizationId: 'organization',
            userId: 'actor',
            permissions,
          } as never,
          {
            projectId: 'project',
            requiredDocumentId: 'document',
            originalFilename: 'document.pdf',
            declaredSize: 8,
            mimeType: 'application/pdf',
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(products.assertDocumentUpload).not.toHaveBeenCalled();
    },
  );

  it('does not expose an upload owned by another actor or organization', async () => {
    const service = new UploadsService(
      {
        uploadSession: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(service.get(actor, 'session')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('atomically expires an actor-owned, target-authorized AVAILABLE session on read', async () => {
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      fileAssetId: 'asset',
      originalFilename: 'expired.pdf',
      declaredSize: 48n,
      uploadedBytes: 48n,
      mimeType: 'application/pdf',
      status: 'AVAILABLE',
      expiresAt: new Date(0),
      parts: [],
    };
    const products = { assertDocumentUpload: vi.fn() };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new UploadsService(
      {
        uploadSession: {
          findFirst: vi.fn().mockResolvedValue(session),
          updateMany,
        },
      } as never,
      {} as never,
      products as never,
    );

    await expect(service.get(actor, 'session')).resolves.toMatchObject({
      id: 'session',
      status: 'EXPIRED',
    });
    expect(products.assertDocumentUpload).toHaveBeenCalledWith(
      actor,
      'project',
      'document',
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session',
        organizationId: actor.organizationId,
        actorId: actor.userId,
        status: { in: ['INITIATED', 'UPLOADING', 'FAILED', 'AVAILABLE'] },
        expiresAt: { lte: expect.any(Date) },
        fileAssetId: 'asset',
        fileAsset: { is: { attachments: { none: {} } } },
      },
      data: { status: 'EXPIRED' },
    });
    expect(
      products.assertDocumentUpload.mock.invocationCallOrder[0],
    ).toBeLessThan(updateMany.mock.invocationCallOrder[0]!);
  });

  it('keeps an expired AVAILABLE session usable after its asset is attached', async () => {
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      fileAssetId: 'asset',
      originalFilename: 'attached.xlsx',
      declaredSize: 48n,
      uploadedBytes: 48n,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      status: 'AVAILABLE',
      expiresAt: new Date(0),
      parts: [],
    };
    const findFirst = vi.fn().mockResolvedValue(session);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = new UploadsService(
      { uploadSession: { findFirst, updateMany } } as never,
      {} as never,
      { assertDocumentUpload: vi.fn() } as never,
    );

    await expect(service.get(actor, 'session')).resolves.toMatchObject({
      id: 'session',
      status: 'AVAILABLE',
      fileAssetId: 'asset',
    });
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'session',
        fileAssetId: 'asset',
        fileAsset: { is: { attachments: { none: {} } } },
      }),
      data: { status: 'EXPIRED' },
    });
  });

  it('rejects a declared MIME that does not match the filename extension', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const create = vi.fn(async ({ data }) => ({
      ...data,
      declaredSize: BigInt(data.declaredSize),
      uploadedBytes: 0n,
    }));
    const uploadSession = { create };
    const service = new UploadsService(
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );

    await expect(
      service.initiate(actor, {
        projectId: 'project',
        requiredDocumentId: 'document',
        originalFilename: 'renamed.pdf',
        declaredSize: 8,
        mimeType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(create).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('does not create a logical target for an invalid file declaration', async () => {
    const stageOne = { createUploadTargetInTransaction: vi.fn() };
    const service = Reflect.construct(UploadsService, [
      { uploadSession: { create: vi.fn() } },
      {},
      {},
      stageOne,
    ]) as UploadsService;

    await expect(
      service.initiate(actor, {
        projectId: 'project',
        stageOneDocument: {
          definitionId: 'definition',
          stageKey: 'STAGE_1',
          workstreamKey: 'ASSIGNMENT',
          contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
          submittedOfficerId: 'officer',
          idempotencyKey: 'invalid-file',
        },
        originalFilename: 'renamed.pdf',
        declaredSize: 8,
        mimeType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(stageOne.createUploadTargetInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    'folder\\document.pdf',
    'control\u0000.pdf',
    'surrogate\ud800.pdf',
    'bidi\u202efdp.pdf',
  ])(
    'rejects unsafe resumable filename %j before target creation',
    async (originalFilename) => {
      const stageOne = { createUploadTargetInTransaction: vi.fn() };
      const service = Reflect.construct(UploadsService, [
        { uploadSession: { create: vi.fn() } },
        {},
        {},
        stageOne,
      ]) as UploadsService;

      await expect(
        service.initiate(actor, {
          projectId: 'project',
          stageOneDocument: {
            definitionId: 'definition',
            stageKey: 'STAGE_1',
            workstreamKey: 'ASSIGNMENT',
            contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
            submittedOfficerId: 'officer',
            idempotencyKey: 'unsafe-filename',
          },
          originalFilename,
          declaredSize: 8,
          mimeType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(stageOne.createUploadTargetInTransaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a fractional declared size at the public service boundary', async () => {
    const service = new UploadsService(
      { uploadSession: { create: vi.fn() } } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );

    await expect(
      service.initiate(actor, {
        projectId: 'project',
        requiredDocumentId: 'document',
        originalFilename: 'document.pdf',
        declaredSize: 1.5,
        mimeType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('allows only the binary fallback that needs it and persists canonical MIME', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const create = vi.fn(async ({ data }) => ({
      ...data,
      declaredSize: BigInt(data.declaredSize),
      uploadedBytes: 0n,
    }));
    const uploadSession = { create };
    const service = new UploadsService(
      {
        uploadSession,
        $transaction: vi.fn((work) =>
          work(uploadCapacityTransaction(uploadSession)),
        ),
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );

    await expect(
      service.initiate(actor, {
        projectId: 'project',
        requiredDocumentId: 'document',
        idempotencyKey: 'drawing-upload',
        originalFilename: 'drawing.dwg',
        declaredSize: 8,
        mimeType: 'application/octet-stream',
      }),
    ).resolves.toMatchObject({ mimeType: 'application/acad' });
    await expect(
      service.initiate(actor, {
        projectId: 'project',
        requiredDocumentId: 'document',
        idempotencyKey: 'renamed-upload',
        originalFilename: 'renamed.pdf',
        declaredSize: 8,
        mimeType: 'application/octet-stream',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    vi.unstubAllEnvs();
  });

  it('blocks completion while any part retry is pending', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    const sessionDirectory = join(directory, 'session');
    await mkdir(sessionDirectory);
    const committedPath = join(sessionDirectory, '1.part');
    const committed = Buffer.from('%PDF-old');
    const retry = Buffer.from('%PDF-new');
    await writeFile(committedPath, committed);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    let status = 'UPLOADING';
    let fileAssetId: string | null = null;
    let verificationClaimId: string | null = null;
    let verificationStartedAt: Date | null = null;
    let releasePart!: () => void;
    let partTransactionReady!: () => void;
    const partGate = new Promise<void>((resolve) => (releasePart = resolve));
    const partReady = new Promise<void>(
      (resolve) => (partTransactionReady = resolve),
    );
    const session = () => ({
      id: 'session',
      organizationId: 'organization',
      actorId: 'actor',
      projectId: 'project',
      requiredDocumentId: 'document',
      fileAssetId,
      status,
      verificationClaimId,
      verificationStartedAt,
      declaredSize: BigInt(committed.length),
      uploadedBytes: BigInt(committed.length),
      partSize: committed.length,
      totalParts: 1,
      originalFilename: 'document.pdf',
      mimeType: 'application/pdf',
      checksum: null,
      expiresAt: new Date(Date.now() + 60_000),
      parts: [
        {
          partNumber: 1,
          size: committed.length,
          checksum: sha256(committed),
          storagePath: committedPath,
        },
      ],
    });
    let transactionCall = 0;
    const prisma = {
      uploadSession: {
        findFirst: vi.fn(async () => session()),
        findUnique: vi.fn(async () => session()),
        findUniqueOrThrow: vi.fn(async () => session()),
        updateMany: vi.fn(async ({ data }) => {
          if (data.status === 'VERIFYING') status = 'VERIFYING';
          if (data.status === 'FAILED') status = 'FAILED';
          if (data.verificationClaimId !== undefined)
            verificationClaimId = data.verificationClaimId;
          if (data.verificationStartedAt !== undefined)
            verificationStartedAt = data.verificationStartedAt;
          return { count: 1 };
        }),
      },
      $transaction: vi.fn(async (work) => {
        if (transactionCall++ === 0) {
          partTransactionReady();
          await partGate;
          throw new ConflictException('retry stopped');
        }
        const tx = {
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'session' }]),
          uploadSession: {
            findUniqueOrThrow: vi.fn(async () => session()),
            update: vi.fn(async ({ data }) => {
              if (data.status !== undefined) status = data.status;
              if (data.fileAssetId !== undefined)
                fileAssetId = data.fileAssetId;
              if (data.verificationClaimId !== undefined)
                verificationClaimId = data.verificationClaimId;
              if (data.verificationStartedAt !== undefined)
                verificationStartedAt = data.verificationStartedAt;
              return { ...session(), ...data };
            }),
          },
          fileAsset: { create: vi.fn().mockResolvedValue({ id: 'asset' }) },
          entityAttachment: { create: vi.fn() },
          projectRequiredDocument: {
            findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'document' }),
          },
        };
        return work(tx);
      }),
    };
    let published = Buffer.alloc(0);
    const storage = {
      putStream: vi.fn(async (_organizationId, stream: Readable) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        published = Buffer.concat(chunks);
        return 'organization/2026/08/asset';
      }),
      publishPending: vi.fn(),
      removePending: vi.fn(),
      remove: vi.fn(),
    };
    const products = {
      assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      linkUploadFileInTransaction: vi.fn().mockResolvedValue({
        id: 'document',
        currentFileAssetId: 'asset',
      }),
    };
    const service = new UploadsService(
      prisma as never,
      storage as never,
      products as never,
    );

    const retryPromise = service.part(
      actor,
      'session',
      1,
      sha256(retry),
      Readable.from(retry),
    );
    await partReady;
    await expect(service.complete(actor, 'session')).rejects.toBeInstanceOf(
      ConflictException,
    );
    releasePart();

    await expect(retryPromise).rejects.toBeInstanceOf(ConflictException);
    expect(published).toHaveLength(0);
    expect(await readdir(sessionDirectory)).toEqual(['1.part']);
    vi.unstubAllEnvs();
  });

  it('removes only the new pending path when the incoming part stream fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, 'session'));
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const session = {
      id: 'session',
      organizationId: 'organization',
      actorId: 'actor',
      projectId: 'project',
      requiredDocumentId: 'document',
      status: 'UPLOADING',
      declaredSize: 8n,
      uploadedBytes: 0n,
      partSize: 8,
      totalParts: 1,
      expiresAt: new Date(Date.now() + 60_000),
      parts: [],
    };
    const service = new UploadsService(
      {
        uploadSession: { findFirst: vi.fn().mockResolvedValue(session) },
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );
    const broken = new Readable({
      read() {
        this.push('%PDF-');
        this.destroy(new Error('stream failed'));
      },
    });

    await expect(
      service.part(actor, 'session', 1, '0'.repeat(64), broken),
    ).rejects.toThrow('stream failed');
    expect(await readdir(join(directory, 'session'))).toEqual([]);
  });

  it('removes a malformed prior part path after committing its replacement', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    const sessionDirectory = join(directory, 'session');
    const previousPath = join(sessionDirectory, 'previous-part');
    await mkdir(previousPath, { recursive: true });
    await writeFile(join(previousPath, 'block-rm'), 'committed');
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const bytes = Buffer.from('%PDF-new');
    const updated = {
      id: 'session',
      organizationId: 'organization',
      actorId: 'actor',
      projectId: 'project',
      requiredDocumentId: 'document',
      status: 'UPLOADING',
      declaredSize: BigInt(bytes.length),
      uploadedBytes: BigInt(bytes.length),
      partSize: bytes.length,
      totalParts: 1,
      expiresAt: new Date(Date.now() + 60_000),
      parts: [
        {
          partNumber: 1,
          size: bytes.length,
          checksum: sha256(bytes),
          storagePath: previousPath,
        },
      ],
    };
    const service = new UploadsService(
      {
        uploadSession: { findFirst: vi.fn().mockResolvedValue(updated) },
        $transaction: vi.fn().mockResolvedValue({ updated, previousPath }),
      } as never,
      {} as never,
      {
        assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
      } as never,
    );

    await expect(
      service.part(actor, 'session', 1, sha256(bytes), Readable.from(bytes)),
    ).resolves.toMatchObject({ status: 'UPLOADING', uploadedBytes: '8' });
    await expect(readdir(previousPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects renamed garbage before canonical publish and recovers the claim to FAILED', async () => {
    const fixture = await completionFixture(Buffer.from('garbage!'));

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fixture.status()).toBe('FAILED');
    expect(fixture.storage.putStream).not.toHaveBeenCalled();
  });

  it('keeps the verification claim when strict artifact cleanup fails', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-valid'),
      'document.pdf',
      'application/pdf',
      { publishError: true, staleCleanupError: true },
    );

    await expect(fixture.service.complete(actor, 'session')).rejects.toThrow(
      'publish failed',
    );
    expect(fixture.status()).toBe('VERIFYING');
  });

  it('uses the claimed storage key when put fails before returning it', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-valid'),
      'document.pdf',
      'application/pdf',
      { putError: true, staleCleanupError: true },
    );

    await expect(fixture.service.complete(actor, 'session')).rejects.toThrow(
      'put failed',
    );
    expect(fixture.storage.removePending).toHaveBeenCalledWith(
      expect.stringMatching(/\/\d{4}\/\d{2}\/session$/),
      expect.any(String),
    );
    expect(fixture.status()).toBe('VERIFYING');
  });

  it.each([
    ['document.pdf', 'application/pdf', Buffer.from('%PDF-valid')],
    ['document.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x01])],
    ['document.jpeg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x01])],
    [
      'document.png',
      'image/png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    [
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      zipFixture(['[Content_Types].xml', 'word/document.xml']),
    ],
    [
      'document.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      zipFixture(['[Content_Types].xml', 'xl/workbook.xml']),
    ],
    ['document.zip', 'application/zip', Buffer.from('504b0506', 'hex')],
    ['document.mp4', 'video/mp4', Buffer.from('0000000066747970', 'hex')],
    ['document.dwg', 'application/acad', Buffer.from('AC1015')],
    ['document.csv', 'text/csv', Buffer.from('name,value\nfixture,1')],
  ])(
    'accepts the canonical %s content signature',
    async (filename, mimeType, bytes) => {
      const fixture = await completionFixture(bytes, filename, mimeType);

      await expect(fixture.service.complete(actor, 'session')).resolves.toEqual(
        {
          status: 'AVAILABLE',
          fileAssetId: 'asset',
          uploadedBytes: String(bytes.length),
        },
      );
    },
  );

  it('rejects CSV NUL bytes beyond the initial header', async () => {
    const fixture = await completionFixture(
      Buffer.concat([Buffer.alloc(4_096, 0x61), Buffer.from([0, 0x31])]),
      'document.csv',
      'text/csv',
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fixture.status()).toBe('FAILED');
  });

  it('rejects invalid CSV UTF-8 beyond the initial header', async () => {
    const fixture = await completionFixture(
      Buffer.concat([Buffer.alloc(4_096, 0x61), Buffer.from([0xc3, 0x28])]),
      'document.csv',
      'text/csv',
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fixture.status()).toBe('FAILED');
  });

  it('accepts a valid CSV code point split across stream chunks', async () => {
    const fixture = await completionFixture(
      Buffer.concat([Buffer.alloc(65_535, 0x61), Buffer.from('€')]),
      'document.csv',
      'text/csv',
    );

    await expect(fixture.service.complete(actor, 'session')).resolves.toEqual({
      status: 'AVAILABLE',
      fileAssetId: 'asset',
      uploadedBytes: String(65_535 + Buffer.byteLength('€')),
    });
  });

  it.each([
    [
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      zipFixture(['[Content_Types].xml', 'xl/workbook.xml']),
    ],
    [
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      zipFixture(['word/document.xml']),
    ],
    [
      'document.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      zipFixture(['[Content_Types].xml', 'word/document.xml']),
    ],
  ])(
    'rejects invalid %s container entries',
    async (filename, mimeType, bytes) => {
      const fixture = await completionFixture(bytes, filename, mimeType);

      await expect(
        fixture.service.complete(actor, 'session'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(fixture.status()).toBe('FAILED');
    },
  );

  it.each([
    [
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ['[Content_Types].xml', 'word/document.xml'],
    ],
    [
      'document.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ['[Content_Types].xml', 'xl/workbook.xml'],
    ],
  ])(
    'accepts a bounded ZIP64 %s container',
    async (filename, mimeType, entries) => {
      const bytes = zip64Fixture(entries);
      const fixture = await completionFixture(bytes, filename, mimeType);

      await expect(fixture.service.complete(actor, 'session')).resolves.toEqual(
        {
          status: 'AVAILABLE',
          fileAssetId: 'asset',
          uploadedBytes: String(bytes.length),
        },
      );
    },
  );

  it.each([
    [
      'multi-disk',
      (bytes: Buffer) => bytes.writeUInt32LE(2, bytes.length - 26),
    ],
    [
      'oversized central directory',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        bytes.writeBigUInt64LE(1_048_577n, end + 40);
      },
    ],
    [
      'unsafe central offset',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        bytes.writeBigUInt64LE(BigInt(Number.MAX_SAFE_INTEGER) + 1n, end + 48);
      },
    ],
    [
      'out-of-range central offset',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        bytes.writeBigUInt64LE(BigInt(end), end + 48);
      },
    ],
    [
      'out-of-range entry count',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        bytes.writeBigUInt64LE(100_000n, end + 24);
        bytes.writeBigUInt64LE(100_000n, end + 32);
      },
    ],
    [
      'unsafe entry count',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
        bytes.writeBigUInt64LE(unsafe, end + 24);
        bytes.writeBigUInt64LE(unsafe, end + 32);
      },
    ],
    [
      'short end record',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        bytes.writeBigUInt64LE(43n, end + 4);
      },
    ],
    [
      'truncated entry extra',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        const central = Number(bytes.readBigUInt64LE(end + 48));
        const nameLength = bytes.readUInt16LE(central + 28);
        bytes.writeUInt16LE(16, central + 46 + nameLength + 2);
      },
    ],
    [
      'unsafe entry offset',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        const central = Number(bytes.readBigUInt64LE(end + 48));
        const extra = central + 46 + bytes.readUInt16LE(central + 28);
        bytes.writeBigUInt64LE(
          BigInt(Number.MAX_SAFE_INTEGER) + 1n,
          extra + 20,
        );
      },
    ],
    [
      'out-of-range entry offset',
      (bytes: Buffer) => {
        const end = zip64EndOffset(bytes);
        const central = Number(bytes.readBigUInt64LE(end + 48));
        const extra = central + 46 + bytes.readUInt16LE(central + 28);
        bytes.writeBigUInt64LE(BigInt(central), extra + 20);
      },
    ],
  ])('rejects %s ZIP64 metadata', async (_name, mutate) => {
    const bytes = zip64Fixture(['[Content_Types].xml', 'word/document.xml']);
    mutate(bytes);
    const fixture = await completionFixture(
      bytes,
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fixture.status()).toBe('FAILED');
  });

  it('rejects truncated ZIP64 metadata', async () => {
    const bytes = zip64Fixture([
      '[Content_Types].xml',
      'word/document.xml',
    ]).subarray(0, -1);
    const fixture = await completionFixture(
      bytes,
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it.each([
    ['ZIP64', 10, 0xffff],
    ['oversized central directory', 12, 1_048_577],
  ])('rejects an unsupported %s DOCX safely', async (_name, offset, value) => {
    const bytes = zipFixture(['[Content_Types].xml', 'word/document.xml']);
    bytes.writeUIntLE(value, bytes.length - 22 + offset, offset === 10 ? 2 : 4);
    const fixture = await completionFixture(
      bytes,
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fixture.status()).toBe('FAILED');
  });

  it('makes an object checksum failure FAILED and retryable', async () => {
    const bytes = Buffer.from('%PDF-ok');
    const fixture = await completionFixture(bytes);

    await expect(
      fixture.service.complete(actor, 'session', '0'.repeat(64)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fixture.status()).toBe('FAILED');
    await expect(
      fixture.service.complete(actor, 'session', sha256(bytes)),
    ).resolves.toMatchObject({ status: 'AVAILABLE', fileAssetId: 'asset' });
  });

  it('preserves canonical bytes when the database commit acknowledgement is lost', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-committed'),
      'document.pdf',
      'application/pdf',
      { commitAcknowledgementLost: true },
    );

    await expect(fixture.service.complete(actor, 'session')).resolves.toEqual({
      status: 'AVAILABLE',
      fileAssetId: 'asset',
      uploadedBytes: String(Buffer.byteLength('%PDF-committed')),
    });
    expect(fixture.storage.remove).not.toHaveBeenCalled();
  });

  it('rejects a conflicting checksum before reclaiming a finalized failed attempt', async () => {
    const bytes = Buffer.from('%PDF-raced-finalization');
    const fixture = await completionFixture(
      bytes,
      'document.pdf',
      'application/pdf',
      { finalized: true, commitAcknowledgementLost: true },
    );

    await expect(
      fixture.service.complete(actor, 'session', 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fixture.status()).toBe('FAILED');
    expect(fixture.updateMany).not.toHaveBeenCalled();
  });

  it('never deletes committed bytes when acknowledgement and reconciliation reads fail', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-committed-unacknowledged'),
      'document.pdf',
      'application/pdf',
      {
        materializationAcknowledgementLost: true,
        reconciliationReadsFail: true,
      },
    );

    await expect(fixture.service.complete(actor, 'session')).rejects.toThrow(
      'commit acknowledgement lost',
    );
    expect(fixture.fileAssetId()).toBe('asset');
    expect(fixture.storage.remove).not.toHaveBeenCalled();
  });

  it('reconciles a committed linkage-only retry when its acknowledgement is lost', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-finalized'),
      'document.pdf',
      'application/pdf',
      { finalized: true, commitAcknowledgementLost: true },
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).resolves.toMatchObject({ status: 'AVAILABLE', fileAssetId: 'asset' });
    expect(fixture.storage.putStream).not.toHaveBeenCalled();
    expect(fixture.fileAssetCreate).not.toHaveBeenCalled();
  });

  it('keeps finalization successful when completed-session cleanup fails', async () => {
    const fixture = await completionFixture(
      Buffer.from('%PDF-committed'),
      'document.pdf',
      'application/pdf',
      { completedCleanupError: true },
    );

    await expect(
      fixture.service.complete(actor, 'session'),
    ).resolves.toMatchObject({ status: 'AVAILABLE', fileAssetId: 'asset' });
    expect(fixture.status()).toBe('AVAILABLE');
  });

  it('does not let abort delete a session already claimed for verification', async () => {
    const service = new UploadsService(
      {
        uploadSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      } as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      id: 'session',
      status: 'VERIFYING',
      declaredSize: 1n,
      uploadedBytes: 1n,
      projectId: 'project',
      requiredDocumentId: 'document',
      parts: [],
    });
    await expect(service.abort({} as never, 'session')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not abort a FAILED session after its FileAsset is finalized', async () => {
    const updateMany = vi.fn(async ({ where }) => ({
      count: where.fileAssetId === null ? 0 : 1,
    }));
    const service = new UploadsService(
      { uploadSession: { updateMany } } as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      id: 'session',
      status: 'FAILED',
      fileAssetId: 'asset',
      declaredSize: 1n,
      uploadedBytes: 1n,
      projectId: 'project',
      requiredDocumentId: 'document',
      parts: [],
    });

    await expect(service.abort({} as never, 'session')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fileAssetId: null }),
      }),
    );
  });

  it('aborts an owned AVAILABLE draft only while its finalized asset is unattached', async () => {
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      status: 'AVAILABLE',
      fileAssetId: 'asset',
      declaredSize: 1n,
      uploadedBytes: 1n,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      parts: [],
    };
    const aborted = { ...session, status: 'ABORTED', abortedAt: new Date() };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'session' }]),
      entityAttachment: { findFirst: vi.fn().mockResolvedValue(null) },
      uploadSession: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce(session)
          .mockResolvedValueOnce(aborted)
          .mockResolvedValueOnce(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue({
          fileAssetId: 'asset',
          storageKey: 'legacy/session.pdf',
          parts: [],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    };
    const storage = { remove: vi.fn() };
    const service = new UploadsService(
      prisma as never,
      storage as never,
      {} as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue(session);

    await expect(service.abort(actor, 'session')).resolves.toMatchObject({
      status: 'ABORTED',
      fileAssetId: 'asset',
    });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.entityAttachment.findFirst).toHaveBeenCalledWith({
      where: { fileAssetId: 'asset' },
      select: { id: true },
    });
    expect(tx.uploadSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session', fileAssetId: 'asset', status: 'AVAILABLE' },
      data: { status: 'ABORTED', abortedAt: expect.any(Date) },
    });
    expect(storage.remove).not.toHaveBeenCalled();

    tx.entityAttachment.findFirst.mockResolvedValue({ id: 'attachment' });
    await expect(service.abort(actor, 'session')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.uploadSession.updateMany).toHaveBeenCalledOnce();
  });

  it('keeps abort successful when completed-session cleanup fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    const blockedRoot = join(directory, 'not-a-directory');
    await writeFile(blockedRoot, 'blocked');
    vi.stubEnv('LOCAL_UPLOAD_PATH', blockedRoot);
    const aborted = {
      id: 'session',
      status: 'ABORTED',
      declaredSize: 1n,
      uploadedBytes: 0n,
      projectId: 'project',
      requiredDocumentId: 'document',
      parts: [],
    };
    const service = new UploadsService(
      {
        uploadSession: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue(aborted),
        },
      } as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      ...aborted,
      status: 'UPLOADING',
    });

    await expect(service.abort({} as never, 'session')).resolves.toMatchObject({
      status: 'ABORTED',
    });
  });

  it('tombstones an unsubmitted terminal asset before removing its final bytes', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    const projectId = '00000000-0000-4000-8000-000000000002';
    const fileAssetId = '00000000-0000-4000-8000-000000000003';
    const organizationId = '00000000-0000-4000-8000-000000000004';
    const storageKey = `${organizationId}/2026/08/${sessionId}`;
    const deletedAt = new Date('2026-08-24T00:00:00.000Z');
    const fileAssetUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: projectId }]),
      uploadSession: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: sessionId,
          projectId,
          organizationId,
          status: 'ABORTED',
          fileAssetId,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      fileAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: fileAssetId,
          storageKey,
          deletedAt: null,
        }),
        updateMany: fileAssetUpdate,
      },
      entityAttachment: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'business-reference' })
          .mockResolvedValue(null),
      },
      projectRequiredDocument: { findFirst: vi.fn().mockResolvedValue(null) },
      projectRequiredDocumentVersion: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      projectStageOneDocument: { findFirst: vi.fn().mockResolvedValue(null) },
      projectStageOneDocumentVersion: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      importJob: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const sessionReads = vi
      .fn()
      .mockResolvedValueOnce({
        projectId,
        status: 'ABORTED',
        fileAssetId,
      })
      .mockResolvedValueOnce({
        projectId,
        status: 'ABORTED',
        fileAssetId,
      })
      .mockResolvedValueOnce({
        fileAssetId,
        storageKey,
        parts: [],
        fileAsset: { deletedAt },
      });
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
      uploadSession: {
        findUnique: sessionReads,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const storage = { removePending: vi.fn(), remove: vi.fn() };
    const service = new UploadsService(
      prisma as never,
      storage as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          retireUnsubmittedAsset(id: string): Promise<boolean>;
        }
      ).retireUnsubmittedAsset(sessionId),
    ).resolves.toBe(false);
    expect(fileAssetUpdate).not.toHaveBeenCalled();

    await expect(
      (
        service as unknown as { releaseStaging(id: string): Promise<boolean> }
      ).releaseStaging(sessionId),
    ).resolves.toBe(true);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(6);
    expect(fileAssetUpdate).toHaveBeenCalledWith({
      where: { id: fileAssetId, organizationId, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.uploadSession.updateMany).toHaveBeenCalledWith({
      where: { id: sessionId, fileAssetId },
      data: { stagingReleasedAt: null },
    });
    expect(storage.remove).toHaveBeenCalledWith(storageKey);
    expect('delete' in tx.fileAsset).toBe(false);
  });

  it('does not purge a soft-deleted FileAsset that still has a business reference', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000011';
    const projectId = '00000000-0000-4000-8000-000000000012';
    const fileAssetId = '00000000-0000-4000-8000-000000000013';
    const organizationId = '00000000-0000-4000-8000-000000000014';
    const storageKey = `${organizationId}/2026/08/${sessionId}`;
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: projectId }]),
      uploadSession: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: sessionId,
          projectId,
          organizationId,
          status: 'EXPIRED',
          fileAssetId,
        }),
        updateMany: vi.fn(),
      },
      fileAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: fileAssetId,
          deletedAt: new Date(),
        }),
      },
      entityAttachment: {
        findFirst: vi.fn().mockResolvedValue({ id: 'business-reference' }),
      },
      projectRequiredDocument: { findFirst: vi.fn().mockResolvedValue(null) },
      projectRequiredDocumentVersion: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      projectStageOneDocument: { findFirst: vi.fn().mockResolvedValue(null) },
      projectStageOneDocumentVersion: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      importJob: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
      uploadSession: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            projectId,
            status: 'EXPIRED',
            fileAssetId,
          })
          .mockResolvedValueOnce({
            fileAssetId,
            storageKey,
            parts: [],
            fileAsset: { deletedAt: new Date() },
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const storage = { removePending: vi.fn(), remove: vi.fn() };
    const service = new UploadsService(
      prisma as never,
      storage as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as { releaseStaging(id: string): Promise<boolean> }
      ).releaseStaging(sessionId),
    ).resolves.toBe(true);

    expect(storage.remove).not.toHaveBeenCalled();
    expect(tx.uploadSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.uploadSession.updateMany).toHaveBeenCalledWith({
      where: { id: sessionId },
      data: {
        stagingReleasedAt: expect.any(Date),
        stagingCleanupAttemptedAt: expect.any(Date),
      },
    });
  });

  it('marks staging released only after every physical cleanup succeeds', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new UploadsService(
      {
        uploadSession: {
          findUnique: vi.fn().mockResolvedValue({
            fileAssetId: null,
            storageKey:
              '00000000-0000-4000-8000-000000000001/2026/08/00000000-0000-4000-8000-000000000002',
          }),
          updateMany,
        },
      } as never,
      {
        removePending: vi.fn().mockRejectedValue(new Error('disk busy')),
        remove: vi.fn(),
      } as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as { releaseStaging(id: string): Promise<boolean> }
      ).releaseStaging('session'),
    ).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'session' },
      data: { stagingCleanupAttemptedAt: expect.any(Date) },
    });
    expect(updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stagingReleasedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not release quota while an unknown legacy staging artifact remains', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    await mkdir(join(directory, 'session'), { recursive: true });
    await writeFile(join(directory, 'session', 'unknown.part'), 'bytes');
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new UploadsService(
      {
        uploadSession: {
          findUnique: vi.fn().mockResolvedValue({
            fileAssetId: null,
            storageKey:
              '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.pdf',
            parts: [],
          }),
          updateMany,
        },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as { releaseStaging(id: string): Promise<boolean> }
      ).releaseStaging('session'),
    ).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stagingReleasedAt: expect.any(Date) }),
      }),
    );
  });

  it('expires an unattached AVAILABLE draft before releasing its staging quota', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new UploadsService(
      {
        uploadSession: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: '00000000-0000-4000-8000-000000000001',
              status: 'AVAILABLE',
              fileAssetId: '00000000-0000-4000-8000-000000000002',
              storageKey:
                '00000000-0000-4000-8000-000000000009/2026/08/00000000-0000-4000-8000-000000000001',
              expiresAt: new Date(0),
              verificationClaimId: null,
              verificationStartedAt: null,
              stagingReleasedAt: new Date(1),
            },
          ]),
          updateMany,
        },
      } as never,
      {} as never,
      {} as never,
    );
    const release = vi
      .spyOn(service as never, 'releaseStaging')
      .mockResolvedValue(true);

    await service.cleanupStaging();

    expect(
      (
        service as unknown as {
          prisma: { uploadSession: { findMany: ReturnType<typeof vi.fn> } };
        }
      ).prisma.uploadSession.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              stagingReleasedAt: { not: null },
              fileAssetId: { not: null },
            }),
          ]),
        }),
      }),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: '00000000-0000-4000-8000-000000000001',
        status: 'AVAILABLE',
        fileAssetId: '00000000-0000-4000-8000-000000000002',
        expiresAt: { lte: expect.any(Date) },
        fileAsset: { is: { attachments: { none: {} } } },
      },
      data: { status: 'EXPIRED' },
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases staging for an expired AVAILABLE asset already attached to business data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const service = new UploadsService(
      {
        uploadSession: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: '00000000-0000-4000-8000-000000000001',
              status: 'AVAILABLE',
              fileAssetId: '00000000-0000-4000-8000-000000000002',
              storageKey:
                '00000000-0000-4000-8000-000000000009/2026/08/00000000-0000-4000-8000-000000000001',
              expiresAt: new Date(0),
              verificationClaimId: null,
              verificationStartedAt: null,
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      } as never,
      {} as never,
      {} as never,
    );
    const release = vi
      .spyOn(service as never, 'releaseStaging')
      .mockResolvedValue(true);

    await service.cleanupStaging();

    expect(release).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('removes bytes before releasing an expired unreferenced storage reservation', async () => {
    const reservation = {
      id: '00000000-0000-4000-8000-000000000001',
      storageKey:
        '00000000-0000-4000-8000-000000000009/2026/08/00000000-0000-4000-8000-000000000002',
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: reservation.id }]),
      fileAsset: { findUnique: vi.fn().mockResolvedValue(null) },
      quotationDocument: { findUnique: vi.fn().mockResolvedValue(null) },
      uploadSession: { findFirst: vi.fn().mockResolvedValue(null) },
      fileStorageReservation: { delete: vi.fn() },
    };
    const prisma = {
      fileStorageReservation: {
        findMany: vi.fn().mockResolvedValue([reservation]),
      },
      $transaction: vi.fn((work) => work(tx)),
    };
    const storage = {
      removePending: vi.fn(),
      remove: vi.fn(),
      listFinalObjects: vi
        .fn()
        .mockResolvedValue({ objects: [], nextCursor: undefined }),
    };
    const service = new UploadsService(
      prisma as never,
      storage as never,
      {} as never,
    );

    await service.cleanupStorageReservations();

    expect(storage.removePending).toHaveBeenCalledWith(
      reservation.storageKey,
      reservation.id,
    );
    expect(storage.remove).toHaveBeenCalledWith(reservation.storageKey);
    expect(tx.fileStorageReservation.delete).toHaveBeenCalledWith({
      where: { id: reservation.id },
    });
  });

  it('keeps referenced final bytes while releasing a stale storage reservation', async () => {
    const reservation = {
      id: '00000000-0000-4000-8000-000000000001',
      storageKey:
        '00000000-0000-4000-8000-000000000009/2026/08/00000000-0000-4000-8000-000000000002',
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: reservation.id }]),
      fileAsset: { findUnique: vi.fn().mockResolvedValue({ id: 'file' }) },
      quotationDocument: { findUnique: vi.fn().mockResolvedValue(null) },
      uploadSession: { findFirst: vi.fn().mockResolvedValue(null) },
      fileStorageReservation: { delete: vi.fn() },
    };
    const prisma = {
      fileStorageReservation: {
        findMany: vi.fn().mockResolvedValue([reservation]),
      },
      $transaction: vi.fn((work) => work(tx)),
    };
    const storage = {
      removePending: vi.fn(),
      remove: vi.fn(),
      listFinalObjects: vi
        .fn()
        .mockResolvedValue({ objects: [], nextCursor: undefined }),
    };
    const service = new UploadsService(
      prisma as never,
      storage as never,
      {} as never,
    );

    await service.cleanupStorageReservations();

    expect(storage.removePending).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(tx.fileStorageReservation.delete).toHaveBeenCalledWith({
      where: { id: reservation.id },
    });
  });

  it('logs a storage-reservation cleanup failure instead of swallowing it', async () => {
    const error = new Error('storage unavailable');
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const reservationUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const service = new UploadsService(
      {
        fileStorageReservation: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: '00000000-0000-4000-8000-000000000001',
              storageKey:
                '00000000-0000-4000-8000-000000000009/2026/08/00000000-0000-4000-8000-000000000002',
            },
          ]),
          updateMany: reservationUpdate,
        },
        $transaction: vi.fn().mockRejectedValue(error),
      } as never,
      {
        listFinalObjects: vi
          .fn()
          .mockResolvedValue({ objects: [], nextCursor: undefined }),
      } as never,
      {} as never,
    );

    await service.cleanupStorageReservations();

    expect(log).toHaveBeenCalledWith(
      'Storage reservation cleanup failed',
      error.stack,
    );
    expect(reservationUpdate).toHaveBeenCalledWith({
      where: {
        id: '00000000-0000-4000-8000-000000000001',
        expiresAt: { lte: expect.any(Date) },
      },
      data: { expiresAt: expect.any(Date) },
    });
    log.mockRestore();
  });

  it('removes a mature untracked modern final object after checking every reference table', async () => {
    const storageKey =
      '00000000-0000-4000-8000-000000000009/2026/08/00000000-0000-4000-8000-000000000002';
    const prisma = {
      fileStorageReservation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      fileAsset: { findMany: vi.fn().mockResolvedValue([]) },
      quotationDocument: { findMany: vi.fn().mockResolvedValue([]) },
      uploadSession: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const storage = {
      listFinalObjects: vi.fn().mockResolvedValue({
        objects: [
          {
            storageKey,
            modifiedAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
          },
        ],
        nextCursor: undefined,
      }),
      remove: vi.fn(),
    };
    const service = new UploadsService(
      prisma as never,
      storage as never,
      {} as never,
    );

    await service.cleanupStorageReservations();

    expect(storage.remove).toHaveBeenCalledWith(storageKey);
    for (const model of [
      prisma.fileAsset,
      prisma.quotationDocument,
      prisma.uploadSession,
      prisma.fileStorageReservation,
    ])
      expect(model.findMany).toHaveBeenCalledWith({
        where: { storageKey: { in: [storageKey] } },
        select: { storageKey: true },
      });
  });

  it('keeps a mature modern final object referenced by business data', async () => {
    const storageKey =
      '00000000-0000-4000-8000-000000000009/2026/08/00000000-0000-4000-8000-000000000002';
    const prisma = {
      fileStorageReservation: { findMany: vi.fn().mockResolvedValue([]) },
      fileAsset: {
        findMany: vi.fn().mockResolvedValue([{ storageKey }]),
      },
      quotationDocument: { findMany: vi.fn().mockResolvedValue([]) },
      uploadSession: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const storage = {
      listFinalObjects: vi.fn().mockResolvedValue({
        objects: [
          {
            storageKey,
            modifiedAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
          },
        ],
        nextCursor: undefined,
      }),
      remove: vi.fn(),
    };

    await new UploadsService(
      prisma as never,
      storage as never,
      {} as never,
    ).cleanupStorageReservations();

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('never sweeps a legacy organization directory as an orphan session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const legacy = join(
      directory,
      organizationId,
      '00000000-0000-4000-8000-000000000002.pdf',
    );
    await mkdir(join(directory, organizationId), { recursive: true });
    await writeFile(legacy, '%PDF-legacy');
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(directory, organizationId), old, old);
    const service = new UploadsService(
      {
        uploadSession: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
      {} as never,
    );

    await service.cleanupStaging();

    await expect(readFile(legacy)).resolves.toEqual(Buffer.from('%PDF-legacy'));
  });

  it('never reclaims a finalization still running in this process', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'galaxy-upload-'));
    temporaryDirectories.push(directory);
    vi.stubEnv('LOCAL_UPLOAD_PATH', directory);
    const updateMany = vi.fn();
    const findMany = vi.fn().mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        status: 'VERIFYING',
        fileAssetId: null,
        storageKey:
          '00000000-0000-4000-8000-000000000009/2026/08/00000000-0000-4000-8000-000000000001',
        expiresAt: new Date(0),
        verificationClaimId: '00000000-0000-4000-8000-000000000002',
        verificationStartedAt: new Date(0),
      },
    ]);
    const service = new UploadsService(
      {
        uploadSession: {
          findMany,
          updateMany,
        },
      } as never,
      {} as never,
      {} as never,
    );
    (
      service as unknown as { inFlightFinalizations: Set<string> }
    ).inFlightFinalizations.add('00000000-0000-4000-8000-000000000001');

    await service.cleanupStaging();

    expect(updateMany).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { stagingCleanupAttemptedAt: null },
                {
                  stagingCleanupAttemptedAt: { lte: expect.any(Date) },
                },
              ]),
            }),
          ]),
        }),
        orderBy: [
          {
            stagingCleanupAttemptedAt: { sort: 'asc', nulls: 'first' },
          },
          { createdAt: 'asc' },
        ],
      }),
    );
  });

  it('does not refresh a resumable session beyond its absolute lifetime', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new UploadsService(
      { uploadSession: { updateMany } } as never,
      {} as never,
      {} as never,
    );
    const release = vi
      .spyOn(service as never, 'releaseStaging')
      .mockResolvedValue(undefined);
    vi.spyOn(service as never, 'owned').mockResolvedValue({
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      status: 'UPLOADING',
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    await expect(service.refresh(actor, 'session')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'session',
        organizationId: actor.organizationId,
        actorId: actor.userId,
      }),
      data: { status: 'EXPIRED', expiresAt: expect.any(Date) },
    });
    expect(release).toHaveBeenCalledWith('session');
  });

  it('clamps refresh to the absolute session expiry', async () => {
    const createdAt = new Date(Date.now() - (7 * 24 - 1) * 60 * 60 * 1000);
    const absoluteExpiry = createdAt.getTime() + 7 * 24 * 60 * 60 * 1000;
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      status: 'UPLOADING',
      createdAt,
      declaredSize: 1n,
      uploadedBytes: 0n,
      parts: [],
    };
    const service = new UploadsService(
      { uploadSession: { updateMany } } as never,
      {} as never,
      {} as never,
    );
    vi.spyOn(service as never, 'owned').mockResolvedValue(session);

    await service.refresh(actor, 'session');

    expect(updateMany.mock.calls[0]?.[0]?.data.expiresAt.getTime()).toBe(
      absoluteExpiry,
    );
  });

  it('returns an already-aborted session when the first response was lost', async () => {
    const session = {
      id: 'session',
      organizationId: actor.organizationId,
      actorId: actor.userId,
      projectId: 'project',
      requiredDocumentId: 'document',
      stageOneDocumentId: null,
      status: 'ABORTED',
      declaredSize: 1n,
      uploadedBytes: 0n,
      parts: [],
    };
    const service = new UploadsService({} as never, {} as never, {} as never);
    vi.spyOn(service as never, 'owned').mockResolvedValue(session);
    const release = vi
      .spyOn(service as never, 'releaseStaging')
      .mockResolvedValue(true);

    await expect(service.abort(actor, 'session')).resolves.toMatchObject({
      status: 'ABORTED',
    });
    expect(release).toHaveBeenCalledWith('session');
  });

  it.each(['refresh', 'complete'] as const)(
    'rejects %s after the session is terminal',
    async (command) => {
      const session = {
        id: 'session',
        organizationId: 'organization',
        actorId: 'actor',
        projectId: 'project',
        requiredDocumentId: 'document',
        status: 'ABORTED',
        declaredSize: 1n,
        uploadedBytes: 1n,
        partSize: 1,
        totalParts: 1,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        parts: [{ partNumber: 1, size: 1, checksum: '0'.repeat(64) }],
      };
      const service = new UploadsService(
        {
          uploadSession: {
            findFirst: vi.fn().mockResolvedValue(session),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        } as never,
        {} as never,
        {
          assertDocumentUpload: vi.fn().mockResolvedValue({ id: 'document' }),
        } as never,
      );

      await expect(service[command](actor, 'session')).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );
});
