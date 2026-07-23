import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { FileStorage } from './file-storage';
import { FilesService } from './files.service';
const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: [],
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
describe('FilesService', () => {
  it('persists metadata, attachment and activity atomically', async () => {
    const tx = {
      fileAsset: {
        create: vi.fn().mockResolvedValue({ id: 'file' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'file' }),
      },
      entityAttachment: { create: vi.fn() },
      activity: { create: vi.fn() },
    };
    const prisma = {
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
  });
  it('hides files when attachment scope is denied', async () => {
    const prisma = {
      fileAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'file',
          attachments: [{ entityType: 'Project', entityId: 'project' }],
        }),
      },
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockRejectedValue(new NotFoundException()),
    } as unknown as BusinessEntityPolicy;
    await expect(
      new FilesService(prisma, entities, {} as FileStorage).get(actor, 'file'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('soft deletes and prevents normal reads', async () => {
    const item = {
      id: 'file',
      attachments: [{ entityType: 'Project', entityId: 'project' }],
    };
    const prisma = {
      fileAsset: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(item)
          .mockResolvedValueOnce(null),
        update: vi.fn(),
      },
      activity: { create: vi.fn() },
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
    expect(prisma.fileAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });
});
