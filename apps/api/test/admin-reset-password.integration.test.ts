import { PrismaClient } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe.sequential('admin:reset-password', () => {
  const prisma = new PrismaClient();
  const repositoryRoot = resolve(__dirname, '../../..');
  const email = `reset-admin-${Date.now()}@galaxy.local`;
  const temporaryPassword = randomBytes(24).toString('base64url');
  let userId: string;
  let membershipId: string;
  let roleIds: string[];
  let permissionIds: string[];
  let previousHash: string;

  const run = (environment: NodeJS.ProcessEnv, targetEmail = email) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'test',
      PASSWORD_BCRYPT_ROUNDS: '4',
      ADMIN_EMAIL: targetEmail,
      ADMIN_CONFIRM_EMAIL: targetEmail,
      ...environment,
    };
    if (environment.ADMIN_TEMP_PASSWORD === undefined)
      delete env.ADMIN_TEMP_PASSWORD;
    return spawnSync(process.execPath, ['scripts/reset-admin-password.mjs'], {
      cwd: resolve(repositoryRoot, 'apps/api'),
      encoding: 'utf8',
      env,
    });
  };

  beforeAll(async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'galaxy-centre' },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: 'system_admin',
        },
      },
      include: { permissions: true },
    });
    const user = await prisma.user.create({
      data: {
        email,
        normalizedEmail: email,
        displayName: 'Reset Test Administrator',
        status: 'active',
      },
    });
    userId = user.id;
    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId,
        administrationScope: 'SYSTEM',
      },
    });
    membershipId = membership.id;
    await prisma.userRole.create({
      data: {
        organizationId: organization.id,
        userId,
        roleId: role.id,
        scopeType: 'SYSTEM',
      },
    });
    previousHash = await hash(randomBytes(24).toString('base64url'), 4);
    await prisma.passwordCredential.create({
      data: {
        userId,
        passwordHash: previousHash,
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    await prisma.session.create({
      data: {
        userId,
        organizationMembershipId: membership.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    roleIds = [role.id];
    permissionIds = role.permissions.map(({ permissionId }) => permissionId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.passwordCredential.deleteMany({ where: { userId } });
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.organizationMembership.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('refuses production execution', () => {
    const result = run({
      NODE_ENV: 'production',
      ADMIN_TEMP_PASSWORD: temporaryPassword,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('disabled in production');
  });

  it('refuses a missing password', () => {
    const result = run({ ADMIN_TEMP_PASSWORD: undefined });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('temporary password is required');
  });

  it('refuses an empty password', () => {
    const result = run({ ADMIN_TEMP_PASSWORD: '' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('temporary password is required');
  });

  it('applies the existing password policy', () => {
    const result = run({ ADMIN_TEMP_PASSWORD: 'too short' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must be at least 15 characters');
  });

  it('refuses an unknown administrator safely', () => {
    const result = run(
      { ADMIN_TEMP_PASSWORD: temporaryPassword },
      `missing-${email}`,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Administrator not found');
    expect(`${result.stdout}${result.stderr}`).not.toContain(temporaryPassword);
  });

  it('refuses a non-System-Administrator target', () => {
    const result = run(
      { ADMIN_TEMP_PASSWORD: temporaryPassword },
      'employee@galaxy.local',
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Active administrator membership is required',
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(temporaryPassword);
  });

  it('hashes the password, revokes access, and preserves identity and authorization', async () => {
    const activeAdministratorsBefore = await prisma.userRole.count({
      where: {
        role: { code: 'system_admin' },
        scopeType: 'SYSTEM',
        status: 'active',
        user: {
          status: 'active',
          organizationMembers: { some: { status: 'active' } },
        },
      },
    });
    const result = run({ ADMIN_TEMP_PASSWORD: temporaryPassword });
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(temporaryPassword);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        credential: true,
        organizationMembers: true,
        roles: {
          include: { role: { include: { permissions: true } } },
        },
      },
    });
    expect(user.status).toBe('active');
    expect(user.organizationMembers).toEqual([
      expect.objectContaining({ id: membershipId, status: 'active' }),
    ]);
    expect(user.roles.map(({ roleId }) => roleId)).toEqual(roleIds);
    expect(user.roles[0]?.scopeType).toBe('SYSTEM');
    expect(user.roles[0]?.status).toBe('active');
    expect(
      user.roles.flatMap(({ role }) =>
        role.permissions.map(({ permissionId }) => permissionId),
      ),
    ).toEqual(permissionIds);
    expect(user.roles[0]?.role).toMatchObject({
      code: 'system_admin',
      isSystem: true,
      isProtected: true,
      status: 'active',
    });
    expect(user.credential?.mustChangePassword).toBe(true);
    expect(user.credential?.passwordChangedAt).not.toBeNull();
    expect(user.credential?.failedLoginCount).toBe(0);
    expect(user.credential?.lockedUntil).toBeNull();
    expect(user.credential?.passwordHash).not.toBe(previousHash);
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      user.credential!.passwordHash,
    );
    expect(
      await compare(temporaryPassword, user.credential!.passwordHash),
    ).toBe(true);
    expect(
      await prisma.session.count({ where: { userId, revokedAt: null } }),
    ).toBe(0);
    expect(
      await prisma.passwordResetToken.count({
        where: { userId, usedAt: null, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.userRole.count({
        where: {
          role: { code: 'system_admin' },
          scopeType: 'SYSTEM',
          status: 'active',
          user: {
            status: 'active',
            organizationMembers: { some: { status: 'active' } },
          },
        },
      }),
    ).toBe(activeAdministratorsBefore);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityId: userId,
        action: 'system.admin.password.reset',
      },
      orderBy: { createdAt: 'desc' },
    });
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toContain(temporaryPassword);
    expect(auditText).not.toContain(user.credential!.passwordHash);
    expect(audit.metadata).toMatchObject({
      source: 'local administrative reset',
      targetEmail: email,
      sessionsRevoked: 1,
      resetTokensRevoked: 1,
    });
  });
});
