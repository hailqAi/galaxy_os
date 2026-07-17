import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { RolesService } from './roles.service';

const actor = {
  userId: 'a',
  organizationId: 'o',
  email: 'a@b.com',
  displayName: 'A',
  permissions: [],
};

describe('RolesService protections', () => {
  it('prevents archiving the system_admin role', async () => {
    const tx = {
      role: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'r', code: 'system_admin', isSystem: true }),
      },
    };
    const prisma = {
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    } as unknown as PrismaService;
    await expect(
      new RolesService(prisma, {} as AuditService).archive(actor, 'r'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unknown permission assignments', async () => {
    const tx = {
      role: {
        findFirst: vi.fn().mockResolvedValue({ id: 'r', code: 'custom' }),
      },
      permission: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    } as unknown as PrismaService;
    await expect(
      new RolesService(prisma, {} as AuditService).setPermissions(actor, 'r', {
        permissionIds: ['00000000-0000-4000-8000-000000000001'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
