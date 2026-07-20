import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { UsersService } from './users.service';

const actor = {
  userId: 'a',
  organizationId: 'o',
  email: 'a@b.com',
  displayName: 'A',
  permissions: [],
};

describe('UsersService security rules', () => {
  it('normalizes email and writes the audit in one transaction', async () => {
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi
          .fn()
          .mockResolvedValue({ id: 'u', email: 'person@example.com' }),
      },
      organizationMembership: {
        create: vi.fn().mockResolvedValue({ id: 'm' }),
      },
    };
    const prisma = {
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    } as unknown as PrismaService;
    const audit = { write: vi.fn() } as unknown as AuditService;
    await new UsersService(prisma, audit).create(actor, {
      email: ' Person@Example.COM ',
      displayName: 'Person',
    });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { email: 'person@example.com', displayName: 'Person' },
      }),
    );
    expect(audit.write).toHaveBeenCalledTimes(2);
  });

  it('rejects multiple primary departments before writing', async () => {
    const service = new UsersService({} as PrismaService, {} as AuditService);
    expect(() =>
      service.setDepartments(actor, 'u', {
        departments: [
          { departmentId: 'd1', isPrimary: true },
          { departmentId: 'd2', isPrimary: true },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a role from another organization', async () => {
    const tx = {
      organizationMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: 'm', status: 'active' }),
      },
      role: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    } as unknown as PrismaService;
    await expect(
      new UsersService(prisma, {} as AuditService).setRoles(actor, 'u', {
        roleIds: ['00000000-0000-4000-8000-000000000001'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a department from another organization', async () => {
    const tx = {
      organizationMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: 'm', status: 'active' }),
      },
      department: { count: vi.fn().mockResolvedValue(0) },
    };
    const prisma = {
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    } as unknown as PrismaService;
    await expect(
      new UsersService(prisma, {} as AuditService).setDepartments(actor, 'u', {
        departments: [
          {
            departmentId: '00000000-0000-4000-8000-000000000001',
            isPrimary: false,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('protects the final active administrator', async () => {
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'u', status: 'active' }),
      },
      userRole: {
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
      },
      organizationMembership: {
        count: vi.fn().mockResolvedValue(1),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'm' }),
      },
    };
    const prisma = {
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    } as unknown as PrismaService;
    await expect(
      new UsersService(prisma, {} as AuditService).disable(actor, 'u'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
