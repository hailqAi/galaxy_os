import { UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { UserManagementPolicy } from '../access-control/user-management.policy';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma.service';
import type { EmailService } from './email.service';
import { AuthService } from './auth.service';

const service = (prisma: PrismaService, audit = { write: vi.fn() }) =>
  new AuthService(
    prisma,
    audit as unknown as AuditService,
    {} as EmailService,
    {} as UserManagementPolicy,
  );

const user = async (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'admin@example.test',
  displayName: 'Admin',
  status: 'active',
  credential: {
    passwordHash: await hash('correct password', 4),
    failedLoginCount: 0,
    lockedUntil: null,
    mustChangePassword: false,
    ...overrides,
  },
  organizationMembers: [
    { id: 'membership-1', organizationId: 'organization-1' },
  ],
});

describe('AuthService account lockout', () => {
  it('rejects a correct password while the persisted account lock is active', async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            await user({ lockedUntil: new Date(Date.now() + 60_000) }),
          ),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;

    await expect(
      service(prisma).login('admin@example.test', 'correct password', 'ip'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('persists a temporary account lock on the fifth failed password', async () => {
    const credentialUpdate = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ failedLoginCount: 4 }]),
      passwordCredential: { update: credentialUpdate },
    };
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue(await user({ failedLoginCount: 4 })),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;

    await expect(
      service(prisma).login('admin@example.test', 'wrong password', 'ip'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(credentialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          failedLoginCount: 5,
          lockedUntil: expect.any(Date),
        },
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });
});
