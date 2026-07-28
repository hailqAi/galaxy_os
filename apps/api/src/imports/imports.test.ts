import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { ImportsService } from './imports.service';

const actor = {
  organizationId: 'organization',
  userId: 'user',
  organizationMembershipId: 'membership',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

describe('ImportsService', () => {
  it('requires validation before confirmation', async () => {
    const prisma = {
      importJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'job',
          status: 'MAPPED',
          rows: [],
        }),
      },
    } as unknown as PrismaService;
    await expect(
      new ImportsService(prisma).confirm(actor, 'job'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('makes repeated confirmation idempotent', async () => {
    const completed = { id: 'job', status: 'COMPLETED', rows: [] };
    const prisma = {
      importJob: { findFirst: vi.fn().mockResolvedValue(completed) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    await expect(
      new ImportsService(prisma).confirm(actor, 'job'),
    ).resolves.toBe(completed);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects jobs from another organization', async () => {
    const prisma = {
      importJob: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(
      new ImportsService(prisma).get(actor, 'outside'),
    ).rejects.toThrow('Import job not found');
    expect(prisma.importJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outside', organizationId: actor.organizationId },
      }),
    );
  });
});
