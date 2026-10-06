import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { REQUIRED_PERMISSIONS } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { FileStorage } from './file-storage';
import { FilesController, genericFileUploadLimits } from './files.controller';
import { FilesService } from './files.service';
import { safeFilename, multipartFilename } from './filename';
const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: ['file.read', 'project.stage1.finance.read', 'estimate.read'],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;
const pdf = (name = 'plan.pdf', buffer = Buffer.from('%PDF fixture')) =>
  ({
    originalname: name,
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
  }) as Express.Multer.File;

const previewFixture = (mimeType: string) => {
  const data = Readable.from('preview bytes');
  const storage = {
    stream: vi.fn().mockResolvedValue(data),
  } as unknown as FileStorage;
  const prisma = {
    fileAsset: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'file',
        originalFilename: "Kế hoạch (1)'*.pdf",
        mimeType,
        sizeBytes: 13n,
        version: 2,
        storageKey: 'organization/2026/08/file',
        attachments: [{ entityType: 'Project', entityId: 'project' }],
      }),
    },
    projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
    entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  const entities = {
    assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
  } as unknown as BusinessEntityPolicy;
  return {
    data,
    storage,
    service: new FilesService(prisma, entities, storage),
  };
};

describe('FilesController preview', () => {
  it('từ chối preview sai phiên bản và giữ MISSING_BINARY sau kiểm tra ACL', async () => {
    const { service, storage } = previewFixture('application/pdf');
    await expect(service.preview(actor, 'file', 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(storage.stream).not.toHaveBeenCalled();
    vi.mocked(storage.stream).mockRejectedValue(new NotFoundException());
    await expect(service.preview(actor, 'file', 2)).rejects.toMatchObject({
      response: expect.objectContaining({ category: 'MISSING_BINARY' }),
    });
  });
  it('streams an authorized safe preview inline with RFC 5987 headers', async () => {
    const { data, service } = previewFixture('application/pdf');
    const response = { setHeader: vi.fn() };

    const result = await new FilesController(service).preview(
      actor,
      '00000000-0000-4000-8000-000000000001',
      response,
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getStream()).toBe(data);
    expect(response.setHeader.mock.calls).toEqual([
      ['Content-Type', 'application/pdf'],
      [
        'Content-Disposition',
        "inline; filename*=UTF-8''K%E1%BA%BF%20ho%E1%BA%A1ch%20%281%29%27%2A.pdf",
      ],
      ['Content-Length', '13'],
    ]);
  });

  it('streams downloads with the same RFC 5987 filename escaping', async () => {
    const { data, service } = previewFixture('application/pdf');
    const response = { setHeader: vi.fn() };

    const result = await new FilesController(service).download(
      actor,
      '00000000-0000-4000-8000-000000000001',
      response,
    );

    expect(result.getStream()).toBe(data);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "attachment; filename*=UTF-8''K%E1%BA%BF%20ho%E1%BA%A1ch%20%281%29%27%2A.pdf",
    );
  });

  it('requires download capability before streaming original preview bytes', () => {
    expect(Reflect.getMetadata('path', FilesController.prototype.preview)).toBe(
      ':id/preview',
    );
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        FilesController.prototype.preview,
      ),
    ).toEqual(['file.read', 'file.download']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        FilesController.prototype.download,
      ),
    ).toEqual(['file.download']);
  });

  it('bounds generic multipart metadata before buffering the file', () => {
    expect(genericFileUploadLimits).toEqual({
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 4,
      fieldSize: 4 * 1024,
      parts: 5,
      headerPairs: 50,
    });
  });
});

describe('FilesService', () => {
  it.each([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'text/plain',
  ])(
    'allows the authorized %s preview through the download path',
    async (mimeType) => {
      const { data, storage, service } = previewFixture(mimeType);

      await expect(service.preview(actor, 'file')).resolves.toMatchObject({
        file: { id: 'file', mimeType },
        data,
      });
      expect(storage.stream).toHaveBeenCalledWith('organization/2026/08/file');
    },
  );

  it('rejects an authorized unsupported preview without changing download', async () => {
    const { data, service } = previewFixture(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    await expect(service.preview(actor, 'file')).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    expect(data.destroyed).toBe(true);
    await expect(service.download(actor, 'file')).resolves.toMatchObject({
      file: {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });
  });

  it('masks an inaccessible Project preview as 404 before reading bytes', async () => {
    const storage = { stream: vi.fn() } as unknown as FileStorage;
    const prisma = {
      fileAsset: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const entities = {
      projectWhere: vi.fn().mockReturnValue({ id: 'visible-project' }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new FilesService(prisma, entities, storage).preview(
        { ...actor, administrationScope: 'SELF' },
        'file',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.stream).not.toHaveBeenCalled();
  });

  it('serializes FileAsset byte counts as decimal strings', async () => {
    const prisma = {
      fileAsset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'file',
            sizeBytes: 9_007_199_254_740_993n,
            storageKey: 'private',
            storedFilename: 'private',
            checksum: 'private',
            attachments: [],
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;

    const result = await new FilesService(
      prisma,
      {} as BusinessEntityPolicy,
      {} as FileStorage,
    ).list(
      {
        ...actor,
        permissions: ['project.stage1.finance.read', 'estimate.read'],
      },
      { page: 1, pageSize: 20 },
    );

    expect(result.items[0]).toMatchObject({
      id: 'file',
      sizeBytes: '9007199254740993',
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('excludes Stage 1 financial document files from list queries', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'financial-document',
            currentFileAssetId: 'financial-current',
            versions: [{ fileAssetId: 'financial-old' }],
          },
        ]),
      },
      projectStageOneDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'logical-financial-document',
            currentFileAssetId: 'logical-financial-current',
            versions: [{ fileAssetId: 'logical-financial-old' }],
          },
        ]),
      },
      entityAttachment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { fileAssetId: 'financial-direct' },
            { fileAssetId: 'logical-financial-direct' },
          ]),
      },
      fileAsset: { findMany, count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;

    await new FilesService(
      prisma,
      {} as BusinessEntityPolicy,
      {} as FileStorage,
    ).list(
      { ...actor, permissions: ['file.read', 'estimate.read'] },
      { page: 1, pageSize: 20 },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            notIn: [
              'financial-current',
              'financial-old',
              'logical-financial-current',
              'logical-financial-old',
              'financial-direct',
              'logical-financial-direct',
            ],
          },
        }),
      }),
    );
  });
  it('persists metadata, attachment and activity atomically', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ id: 'organization' }])
        .mockResolvedValueOnce([
          {
            permanentBytes: '0',
            stagedBytes: '0',
            materializedBytes: '0',
            objectRows: '0',
            recentActorOperations: '0',
          },
        ])
        .mockResolvedValueOnce([
          {
            globalPermanentBytes: '0',
            globalStagedBytes: '0',
            globalMaterializedBytes: '0',
            globalObjectRows: '0',
          },
        ])
        .mockResolvedValueOnce([{ id: 'reservation' }])
        .mockResolvedValueOnce([{ id: 'project' }]),
      uploadSession: { count: vi.fn() },
      fileAsset: {
        create: vi.fn().mockResolvedValue({ id: 'file' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'file' }),
      },
      fileStorageReservation: {
        create: vi.fn().mockResolvedValue({ id: 'reservation' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'reservation' }),
        delete: vi.fn(),
      },
      entityAttachment: { create: vi.fn() },
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      fileStorageReservation: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({
        entityType: 'Project',
        entityId: 'project',
        projectId: 'project',
        customerId: 'customer',
      }),
    } as unknown as BusinessEntityPolicy;
    const storage = {
      put: vi.fn().mockResolvedValue('organization/2026/07/key'),
      createKey: vi.fn().mockReturnValue('organization/2026/07/key'),
      putStream: vi.fn().mockResolvedValue('organization/2026/07/key'),
      publishPending: vi.fn(),
    } as unknown as FileStorage;
    await new FilesService(prisma, entities, storage).upload(
      actor,
      { entityType: 'Project', entityId: 'project', category: 'DRAWING' },
      pdf(),
    );
    expect(tx.fileAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
          storageKey: 'organization/2026/07/key',
        }),
      }),
    );
    expect(tx.entityAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 'project' }),
      }),
    );
    expect(tx.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'FILE_UPLOADED' }),
      }),
    );
    expect(tx.fileStorageReservation.create).toHaveBeenCalledOnce();
    expect(tx.fileStorageReservation.delete).toHaveBeenCalledOnce();
    expect(storage.putStream).toHaveBeenCalledOnce();
    expect(storage.publishPending).toHaveBeenCalledOnce();
  });

  it('does not publish a generic Project upload after membership is revoked while bytes are being stored', async () => {
    let membershipActive = true;
    const fileCreate = vi.fn().mockResolvedValue({ id: 'file' });
    const attachmentCreate = vi.fn();
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ id: 'organization' }])
        .mockResolvedValueOnce([
          {
            permanentBytes: '0',
            stagedBytes: '0',
            materializedBytes: '0',
            objectRows: '0',
            recentActorOperations: '0',
          },
        ])
        .mockResolvedValueOnce([
          {
            globalPermanentBytes: '0',
            globalStagedBytes: '0',
            globalMaterializedBytes: '0',
            globalObjectRows: '0',
          },
        ])
        .mockResolvedValueOnce([{ id: 'reservation' }])
        .mockResolvedValueOnce([{ id: 'project' }]),
      uploadSession: { count: vi.fn() },
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      fileAsset: {
        create: fileCreate,
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'file' }),
      },
      fileStorageReservation: {
        create: vi.fn().mockResolvedValue({ id: 'reservation' }),
        delete: vi.fn(),
      },
      entityAttachment: { create: attachmentCreate },
      activity: { create: vi.fn() },
    };
    const prisma = {
      fileStorageReservation: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const context = {
      entityType: 'Project',
      entityId: 'project',
      projectId: 'project',
      customerId: 'customer',
    };
    const entities = {
      assertView: vi.fn(async () => {
        if (!membershipActive) throw new NotFoundException('Entity not found');
        return context;
      }),
    } as unknown as BusinessEntityPolicy;
    const publishPending = vi.fn();
    const storage = {
      createKey: vi.fn().mockReturnValue('organization/2026/07/key'),
      putStream: vi.fn(async () => {
        membershipActive = false;
      }),
      publishPending,
    } as unknown as FileStorage;

    await expect(
      new FilesService(prisma, entities, storage).upload(
        { ...actor, permissions: ['file.upload'], administrationScope: 'SELF' },
        { entityType: 'Project', entityId: 'project', category: 'DRAWING' },
        pdf(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(publishPending).not.toHaveBeenCalled();
    expect(fileCreate).not.toHaveBeenCalled();
    expect(attachmentCreate).not.toHaveBeenCalled();
  });
  it('rejects a direct file before writing bytes when organization capacity is exhausted', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ id: 'organization' }])
        .mockResolvedValueOnce([
          {
            permanentBytes: '107374182400',
            stagedBytes: '0',
            materializedBytes: '0',
            objectRows: '0',
            recentActorOperations: '0',
          },
        ])
        .mockResolvedValueOnce([
          {
            globalPermanentBytes: '0',
            globalStagedBytes: '0',
            globalMaterializedBytes: '0',
            globalObjectRows: '0',
          },
        ]),
      uploadSession: { count: vi.fn() },
    };
    const prisma = {
      fileStorageReservation: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
    } as unknown as BusinessEntityPolicy;
    const storage = {
      createKey: vi.fn().mockReturnValue('organization/2026/07/key'),
      putStream: vi.fn(),
    } as unknown as FileStorage;

    await expect(
      new FilesService(prisma, entities, storage).upload(
        actor,
        { entityType: 'Project', entityId: 'project', category: 'DRAWING' },
        pdf(),
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(storage.putStream).not.toHaveBeenCalled();
  });
  it('routes every Project required-document upload through UploadSession', async () => {
    const prisma = {} as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
    } as unknown as BusinessEntityPolicy;
    const storage = { put: vi.fn() } as unknown as FileStorage;

    await expect(
      new FilesService(prisma, entities, storage).upload(
        {
          ...actor,
          permissions: ['project.document.manage', 'file.upload'],
        },
        {
          entityType: 'ProjectRequiredDocument',
          entityId: 'document',
          category: 'DOCUMENT',
        } as never,
        pdf(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(entities.assertView).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });
  it('rejects path traversal, oversized and mismatched MIME files', async () => {
    const service = new FilesService(
      {} as PrismaService,
      {
        assertView: vi.fn().mockResolvedValue({}),
      } as unknown as BusinessEntityPolicy,
      { put: vi.fn() } as unknown as FileStorage,
    );
    await expect(
      service.upload(
        actor,
        { entityType: 'Project', entityId: 'project', category: 'DOC' },
        pdf('../plan.pdf'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upload(
        actor,
        { entityType: 'Project', entityId: 'project', category: 'DOC' },
        { ...pdf(), size: 11 * 1024 * 1024 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upload(
        actor,
        { entityType: 'Project', entityId: 'project', category: 'DOC' },
        { ...pdf('plan.png'), mimetype: 'image/png' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upload(
        actor,
        {
          entityType: 'Project',
          entityId: 'project',
          category: 'DOC',
          confidentiality: 'RESTRICTED',
        },
        pdf(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('hides files when attachment scope is denied', async () => {
    const prisma = {
      fileAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'file',
          attachments: [{ entityType: 'Project', entityId: 'project' }],
        }),
      },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockRejectedValue(new NotFoundException()),
    } as unknown as BusinessEntityPolicy;
    await expect(
      new FilesService(prisma, entities, {} as FileStorage).get(actor, 'file'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('authorizes logical Stage 1 document bytes through their current Project scope', async () => {
    const attachment = {
      entityType: 'ProjectStageOneDocument',
      entityId: 'logical-document',
      projectId: 'project',
    };
    const prisma = {
      fileAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'file',
          storageKey: 'private/storage-key',
          attachments: [attachment],
        }),
      },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const entities = {
      projectWhere: vi.fn().mockReturnValue({ id: 'project' }),
      assertView: vi.fn(async (_actor, entityType, entityId) => {
        if (entityType === 'Project' && entityId === 'project')
          return { entityType, entityId, projectId: 'project' };
        throw new NotFoundException();
      }),
    } as unknown as BusinessEntityPolicy;
    const data = Readable.from('%PDF-logical');
    const storage = {
      stream: vi.fn().mockResolvedValue(data),
    } as unknown as FileStorage;

    await expect(
      new FilesService(prisma, entities, storage).download(
        {
          ...actor,
          administrationScope: 'SELF',
          permissions: [
            'file.read',
            'estimate.read',
            'project.stage1.finance.read',
          ],
        },
        'file',
      ),
    ).resolves.toEqual({
      file: expect.objectContaining({ id: 'file', attachments: [attachment] }),
      data,
    });
    expect(entities.assertView).toHaveBeenCalledWith(
      expect.anything(),
      'Project',
      'project',
      'file.download',
      prisma,
    );
  });
  it('does not expose storage and checksum internals from file metadata', async () => {
    const prisma = {
      fileAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'file',
          originalFilename: 'logical.pdf',
          storageProvider: 'LOCAL',
          storageKey: 'private/storage-key',
          thumbnailKey: 'private/thumbnail-key',
          storedFilename: 'private-name',
          checksum: 'a'.repeat(64),
          attachments: [{ entityType: 'Project', entityId: 'project' }],
        }),
      },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
    } as unknown as BusinessEntityPolicy;

    const result = await new FilesService(
      prisma,
      entities,
      {} as FileStorage,
    ).get(actor, 'file');

    expect(result).toMatchObject({
      id: 'file',
      originalFilename: 'logical.pdf',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /storageProvider|storageKey|thumbnailKey|storedFilename|checksum|private\/storage-key|private\/thumbnail-key|private-name/,
    );
  });
  it('does not let an accessible Customer attachment bypass Project file scope', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { fileAsset: { findFirst } } as unknown as PrismaService;
    const entities = {
      projectWhere: vi.fn().mockReturnValue({ id: 'visible-project' }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new FilesService(prisma, entities, {} as FileStorage).get(
        { ...actor, administrationScope: 'SELF' },
        'file',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { attachments: { none: { projectId: { not: null } } } },
                expect.objectContaining({
                  attachments: { some: expect.anything() },
                }),
              ]),
            }),
          ]),
        }),
        include: expect.objectContaining({
          attachments: expect.objectContaining({ where: expect.anything() }),
        }),
      }),
    );
  });
  it('denies direct access to a Stage 1 financial document file', async () => {
    const prisma = {
      fileAsset: {
        findFirst: vi.fn(({ where }) =>
          Promise.resolve(
            where.id.notIn.includes('file')
              ? null
              : {
                  id: 'file',
                  attachments: [{ entityType: 'Project', entityId: 'project' }],
                },
          ),
        ),
      },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'financial-document',
            currentFileAssetId: 'file',
            versions: [],
          },
        ]),
      },
      projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const entities = {
      projectWhere: vi.fn().mockReturnValue({ id: 'project' }),
      assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new FilesService(prisma, entities, {} as FileStorage).get(
        {
          ...actor,
          administrationScope: 'SELF',
          permissions: ['file.read', 'estimate.read'],
        },
        'file',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('keeps every required-document evidence file immutable through generic commands', async () => {
    const item = {
      id: 'file',
      attachments: [
        { entityType: 'ProjectRequiredDocument', entityId: 'document' },
      ],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'file' }]),
      fileAsset: {
        update: vi.fn(),
      },
      entityAttachment: {
        findMany: vi.fn().mockResolvedValue([{ entityId: 'document' }]),
      },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            projectId: 'project',
            documentType: 'SURVEY_REPORT',
            status: 'DRAFT',
            currentFileAssetId: 'file',
            versions: [],
          },
        ]),
      },
      project: { count: vi.fn().mockResolvedValue(1) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      fileAsset: { findFirst: vi.fn().mockResolvedValue(item) },
      projectRequiredDocument: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ documentType: 'SURVEY_REPORT' }]),
      },
      entityAttachment: {
        findMany: vi.fn().mockResolvedValue([{ entityId: 'document' }]),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new FilesService(prisma, entities, {} as FileStorage).remove(
        {
          ...actor,
          permissions: [
            'project.document.manage',
            'file.read',
            'project.stage1.finance.read',
            'estimate.read',
          ],
        },
        'file',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.fileAsset.update).not.toHaveBeenCalled();
  });
  it('keeps logical Stage 1 version files immutable through generic commands', async () => {
    const item = {
      id: 'file',
      attachments: [
        {
          entityType: 'ProjectStageOneDocument',
          entityId: 'logical-document',
          projectId: 'project',
        },
      ],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'file' }]),
      fileAsset: { update: vi.fn() },
      entityAttachment: {
        findMany: vi.fn().mockResolvedValue([
          {
            entityType: 'ProjectStageOneDocument',
            entityId: 'logical-document',
          },
        ]),
      },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageOneDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'logical-document',
            projectId: 'project',
            stageKey: 'STAGE_1',
            workstreamKey: 'ASSIGNMENT',
            documentType: 'SURVEY_REPORT',
          },
        ]),
      },
      project: { count: vi.fn().mockResolvedValue(1) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      fileAsset: { findFirst: vi.fn().mockResolvedValue(item) },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageOneDocument: {
        findMany: vi.fn().mockResolvedValue([{ id: 'logical-document' }]),
      },
      entityAttachment: {
        findMany: vi.fn().mockResolvedValue([
          {
            entityType: 'ProjectStageOneDocument',
            entityId: 'logical-document',
          },
        ]),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new FilesService(prisma, entities, {} as FileStorage).remove(
        {
          ...actor,
          permissions: [
            'project.document.manage',
            'file.read',
            'project.stage1.finance.read',
            'estimate.read',
          ],
        },
        'file',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.fileAsset.update).not.toHaveBeenCalled();
  });
  it.each(['remove', 'update', 'restore'] as const)(
    'blocks generic %s of a binary pinned by a customer publication',
    async (operation) => {
      const item = {
        id: 'file',
        deletedAt: operation === 'restore' ? new Date() : null,
        attachments: [{ entityType: 'Project', entityId: 'project' }],
      };
      const tx = {
        $queryRaw: vi
          .fn()
          .mockResolvedValue([{ id: 'file', publicationBound: true }]),
        fileAsset: { update: vi.fn().mockResolvedValue(item) },
        projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
        entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
        activity: { create: vi.fn() },
      };
      const prisma = {
        fileAsset: { findFirst: vi.fn().mockResolvedValue(item) },
        projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
        entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;
      const entities = {
        assertView: vi.fn().mockResolvedValue({}),
      } as unknown as BusinessEntityPolicy;
      const service = new FilesService(prisma, entities, {} as FileStorage);
      const command =
        operation === 'update'
          ? service.update(actor, 'file', { category: 'Changed' })
          : service[operation](actor, 'file');
      await expect(command).rejects.toBeInstanceOf(ConflictException);
      expect(tx.fileAsset.update).not.toHaveBeenCalled();
    },
  );

  it('soft deletes and prevents normal reads', async () => {
    const item = {
      id: 'file',
      attachments: [{ entityType: 'Project', entityId: 'project' }],
    };
    const fileUpdate = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'file' }]),
      fileAsset: { update: fileUpdate },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      fileAsset: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(item)
          .mockResolvedValueOnce(null),
      },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({}),
    } as unknown as BusinessEntityPolicy;
    const service = new FilesService(prisma, entities, {} as FileStorage);
    await expect(service.remove(actor, 'file')).resolves.toEqual({
      deleted: true,
    });
    await expect(service.get(actor, 'file')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it('rejects mutation when one FileAsset is also attached to a hidden Project', async () => {
    const item = {
      id: 'file',
      attachments: [
        {
          entityType: 'Project',
          entityId: 'visible-project',
          projectId: 'visible-project',
        },
      ],
    };
    const update = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'file' }]),
      fileAsset: { update },
      entityAttachment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { projectId: 'visible-project' },
            { projectId: 'hidden-project' },
          ]),
      },
      project: { count: vi.fn().mockResolvedValue(1) },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      fileAsset: { findFirst: vi.fn().mockResolvedValue(item) },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const entities = {
      projectWhere: vi.fn().mockReturnValue({
        organizationId: actor.organizationId,
        members: { some: { userId: actor.userId } },
      }),
      assertView: vi.fn().mockResolvedValue({ projectId: 'visible-project' }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new FilesService(prisma, entities, {} as FileStorage).remove(
        {
          ...actor,
          permissions: ['file.delete'],
          permissionSources: [
            {
              permission: 'file.delete',
              roleId: 'self-file-delete',
              roleName: 'Self file delete',
              scopeType: 'SELF',
              departmentId: null,
            },
          ],
        },
        'file',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['update', 'remove', 'restore'] as const)(
    'does not %s a file when Project membership is revoked after the scoped precheck',
    async (operation) => {
      const item = {
        id: 'file',
        deletedAt: operation === 'restore' ? new Date() : null,
        attachments: [
          {
            entityType: 'Project',
            entityId: 'project',
            projectId: 'project',
          },
        ],
      };
      let membershipActive = true;
      const update = vi.fn().mockResolvedValue(item);
      const queryText = (query: unknown) =>
        Array.isArray(query)
          ? query.join('')
          : ((query as { sql?: string }).sql ?? String(query));
      const tx = {
        $queryRaw: vi.fn(async (query) => {
          if (queryText(query).includes('FROM "Project"')) {
            membershipActive = false;
            return [{ id: 'project' }];
          }
          return [{ id: 'file' }];
        }),
        fileAsset: { update },
        uploadSession: { findMany: vi.fn().mockResolvedValue([]) },
        entityAttachment: {
          findMany: vi.fn(({ select }) =>
            select.projectId ? [{ projectId: 'project' }] : [],
          ),
        },
        project: {
          count: vi.fn(async () => {
            const visible = membershipActive ? 1 : 0;
            membershipActive = false;
            return visible;
          }),
        },
        projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
        projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
        activity: { create: vi.fn() },
      };
      const prisma = {
        fileAsset: { findFirst: vi.fn().mockResolvedValue(item) },
        projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
        projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
        entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService;
      const scopedActor = {
        ...actor,
        permissions: [`file.${operation === 'remove' ? 'delete' : operation}`],
        administrationScope: 'SELF' as const,
        administrationTier: 0,
      };
      const command = new FilesService(
        prisma,
        {
          assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
        } as unknown as BusinessEntityPolicy,
        {} as FileStorage,
      );

      await expect(
        operation === 'update'
          ? command.update(scopedActor, 'file', { category: 'UPDATED' })
          : operation === 'remove'
            ? command.remove(scopedActor, 'file')
            : command.restore(scopedActor, 'file'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('requires finance read and manage together for financial file mutation', async () => {
    const item = {
      id: 'file',
      attachments: [
        {
          entityType: 'ProjectRequiredDocument',
          entityId: 'document',
          projectId: 'project',
        },
      ],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'file' }]),
      fileAsset: { update: vi.fn() },
      entityAttachment: {
        findMany: vi.fn(({ select }) =>
          select.projectId
            ? [{ projectId: 'project' }]
            : [
                {
                  entityType: 'ProjectRequiredDocument',
                  entityId: 'document',
                },
              ],
        ),
      },
      project: { count: vi.fn().mockResolvedValue(1) },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            documentType: 'PRELIMINARY_FINANCIAL_PLAN',
            projectId: 'project',
          },
        ]),
      },
      projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      fileAsset: { findFirst: vi.fn().mockResolvedValue(item) },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
    } as unknown as BusinessEntityPolicy;

    await expect(
      new FilesService(prisma, entities, {} as FileStorage).remove(
        {
          ...actor,
          permissions: [
            'file.delete',
            'project.document.manage',
            'project.stage1.finance.manage',
          ],
        },
        'file',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.fileAsset.update).not.toHaveBeenCalled();
  });

  it('cleans a partial physical write and reports a missing stream', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('FILE_STORAGE_PATH', root);
    const storage = new FileStorage();
    const broken = new Readable({
      read() {
        this.push('partial');
        this.destroy(new Error('stream failed'));
      },
    });

    try {
      await expect(storage.putStream('deadbeef', broken)).rejects.toThrow(
        'stream failed',
      );
      expect(
        (await readdir(root, { recursive: true, withFileTypes: true })).filter(
          (entry) => !entry.isDirectory(),
        ),
      ).toHaveLength(0);
      await expect(
        storage.stream('deadbeef/2026/08/deadbeef'),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts exactly the configured storage limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('FILE_STORAGE_PATH', root);
    vi.stubEnv('UPLOAD_MAX_FILE_BYTES', '8');
    const storage = new FileStorage();

    try {
      const key = await storage.put('deadbeef', Buffer.from('12345678'));
      await expect(storage.read(key)).resolves.toEqual(Buffer.from('12345678'));
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects one byte over the configured storage limit without a partial file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('FILE_STORAGE_PATH', root);
    vi.stubEnv('UPLOAD_MAX_FILE_BYTES', '8');
    const storage = new FileStorage();

    try {
      await expect(
        storage.putStream(
          'deadbeef',
          Readable.from([Buffer.from('1234'), Buffer.from('56789')]),
        ),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(
        (await readdir(root, { recursive: true, withFileTypes: true })).filter(
          (entry) => !entry.isDirectory(),
        ),
      ).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('publishes a claimed replacement atomically without truncating prior bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('FILE_STORAGE_PATH', root);
    vi.stubEnv('UPLOAD_MAX_FILE_BYTES', '32');
    const storage = new FileStorage();
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const key = `${organizationId}/2026/08/00000000-0000-4000-8000-000000000002`;
    const firstClaim = '00000000-0000-4000-8000-000000000003';
    const secondClaim = '00000000-0000-4000-8000-000000000004';

    try {
      await storage.putStream(
        organizationId,
        Readable.from('first'),
        key,
        firstClaim,
      );
      await storage.publishPending(key, firstClaim);

      const broken = new Readable({
        read() {
          this.push('broken');
          this.destroy(new Error('stream failed'));
        },
      });
      await expect(
        storage.putStream(organizationId, broken, key, secondClaim),
      ).rejects.toThrow('stream failed');
      await expect(storage.read(key)).resolves.toEqual(Buffer.from('first'));

      await storage.putStream(
        organizationId,
        Readable.from('second'),
        key,
        secondClaim,
      );
      await expect(storage.read(key)).resolves.toEqual(Buffer.from('first'));
      await storage.publishPending(key, secondClaim);
      await expect(storage.read(key)).resolves.toEqual(Buffer.from('second'));
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('incrementally inventories modern and legacy final objects with bounded directory work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('FILE_STORAGE_PATH', root);
    const storage = new FileStorage();
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const modernKey = `${organizationId}/2026/08/00000000-0000-4000-8000-000000000002`;
    const legacyKey = `${organizationId}/00000000-0000-4000-8000-000000000003.pdf`;
    const pending = `${modernKey}.00000000-0000-4000-8000-000000000004.pending`;
    await mkdir(join(root, organizationId, '2026', '08'), {
      recursive: true,
    });
    await writeFile(join(root, ...modernKey.split('/')), 'modern');
    await writeFile(join(root, ...legacyKey.split('/')), 'legacy');
    await writeFile(join(root, ...pending.split('/')), 'pending');

    try {
      const found = new Set<string>();
      for (let call = 0; call < 20; call += 1) {
        const page = await storage.listFinalObjects(1);
        expect(page.processedEntries).toBeLessThanOrEqual(1);
        page.objects.forEach(({ storageKey }) => found.add(storageKey));
        if (page.completed) break;
      }
      expect(found).toEqual(new Set([legacyKey, modernKey]));
      expect(found).not.toContain(pending);
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes only the requested finalization claim', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('FILE_STORAGE_PATH', root);
    const storage = new FileStorage();
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const key = `${organizationId}/2026/08/00000000-0000-4000-8000-000000000002`;
    const firstClaim = '00000000-0000-4000-8000-000000000003';
    const secondClaim = '00000000-0000-4000-8000-000000000004';

    try {
      await storage.putStream(
        organizationId,
        Readable.from('first'),
        key,
        firstClaim,
      );
      await storage.putStream(
        organizationId,
        Readable.from('second'),
        key,
        secondClaim,
      );

      await storage.removePending(key, firstClaim);
      await expect(
        storage.publishPending(key, firstClaim),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        storage.publishPending(key, secondClaim),
      ).resolves.toBeUndefined();
      await expect(storage.read(key)).resolves.toEqual(Buffer.from('second'));
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('can read and remove a preserved legacy resumable-upload object', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('FILE_STORAGE_PATH', root);
    const storage = new FileStorage();
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000002';
    const key = `${organizationId}/${sessionId}.pdf`;
    const path = join(root, organizationId, `${sessionId}.pdf`);

    try {
      await mkdir(join(root, organizationId), { recursive: true });
      await writeFile(path, '%PDF-legacy');
      await expect(storage.read(key)).resolves.toEqual(
        Buffer.from('%PDF-legacy'),
      );
      await storage.remove(key);
      await expect(storage.read(key)).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('propagates pending cleanup failures instead of releasing quota', async () => {
    const root = await mkdtemp(join(tmpdir(), 'galaxy-files-'));
    vi.stubEnv('FILE_STORAGE_PATH', root);
    const storage = new FileStorage();
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const key = `${organizationId}/2026/08/00000000-0000-4000-8000-000000000002`;
    const pendingDirectory = join(
      root,
      organizationId,
      '2026',
      '08',
      '00000000-0000-4000-8000-000000000002.00000000-0000-4000-8000-000000000003.pending',
    );

    try {
      await mkdir(pendingDirectory, { recursive: true });
      await expect(storage.removePending(key)).rejects.toBeDefined();
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('untrusted upload names', () => {
  it.each([
    '../other.txt',
    '/etc/passwd.txt',
    'C:\\other.txt',
    'line\r\nInjected.txt',
    'nul\0.txt',
    'a'.repeat(201) + '.txt',
  ])(
    'rejects storage traversal, control bytes and oversize names: %s',
    (name) => expect(safeFilename(name)).toBeNull(),
  );
  it('keeps Vietnamese text while neutralizing HTML and quotes without choosing storage paths', () => {
    expect(safeFilename('ảnh<img onerror=alert(1)>.txt')).toBe(
      'ảnh_img onerror_alert_1__.txt',
    );
    expect(safeFilename('bản "khách".txt')).toBe('bản _khách_.txt');
    expect(safeFilename('tài liệu.txt')).toBe('tài liệu.txt');
  });
});

it('decodes browser multipart UTF-8 bytes without corrupting legacy Latin-1 or extended Unicode names', () => {
  expect(
    multipartFilename(Buffer.from('ảnh khách.txt', 'utf8').toString('latin1')),
  ).toBe('ảnh khách.txt');
  expect(multipartFilename('café.txt')).toBe('café.txt');
  expect(multipartFilename('ảnh khách.txt')).toBe('ảnh khách.txt');
});

it('does not strip a multipart BOM before the control-character guard', () => {
  expect(
    safeFilename(
      multipartFilename(Buffer.from('\uFEFFx.txt', 'utf8').toString('latin1')),
    ),
  ).toBeNull();
});
