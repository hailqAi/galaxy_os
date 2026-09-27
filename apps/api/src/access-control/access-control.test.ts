import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma.service';
import { BusinessEntityPolicy } from './business-entity.policy';
import { actorsForPermission, CurrentActor } from './current-actor';
import { DevelopmentAuthGuard } from './development-auth.guard';
import { PermissionGuard } from './permission.guard';

const context = (actor?: object, request: Record<string, unknown> = {}) => {
  if (actor) request.actor = actor;
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

describe('access control', () => {
  const selfProjectUploader = {
    userId: 'user-1',
    organizationId: 'organization-1',
    organizationMembershipId: 'membership-1',
    email: 'user@example.test',
    displayName: 'User',
    mustChangePassword: false,
    permissions: ['file.upload'],
    permissionSources: [
      {
        permission: 'file.upload',
        roleId: 'self-uploader',
        roleName: 'Self uploader',
        scopeType: 'SELF' as const,
        departmentId: null,
      },
    ],
    administrationScope: 'SELF' as const,
    managedDepartmentIds: [],
    administrationTier: 0,
  } satisfies CurrentActor;

  it('keeps administration scope and tier tied to the permission assignment', () => {
    const actor = {
      ...selfProjectUploader,
      permissions: ['role.assign', 'organization.read'],
      administrationScope: 'ORGANIZATION' as const,
      administrationTier: 100,
      permissionSources: [
        {
          permission: 'role.assign',
          assignmentId: 'a1',
          roleId: 'r1',
          roleName: 'Scoped',
          scopeType: 'SELF' as const,
          departmentId: null,
          administrationTier: 1,
        },
        {
          permission: 'organization.read',
          assignmentId: 'a2',
          roleId: 'r2',
          roleName: 'Reader',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
          administrationTier: 100,
        },
      ],
    };
    const scoped = actorsForPermission(actor, 'role.assign');
    expect(scoped).toHaveLength(1);
    expect(scoped[0]).toMatchObject({
      permissions: ['role.assign'],
      administrationScope: 'SELF',
      administrationTier: 1,
    });
    expect(
      new BusinessEntityPolicy({} as PrismaService).projectWhere(
        scoped[0]!,
        'role.assign',
      ),
    ).toMatchObject({
      AND: [
        {
          OR: expect.arrayContaining([
            { members: { some: { userId: actor.userId } } },
          ]),
        },
      ],
    });
  });

  it('does not merge two assignments to the same role or trust incomplete source identity', () => {
    const base = {
      permission: 'role.assign',
      roleId: 'r1',
      roleName: 'Role',
      departmentId: null,
      administrationTier: 2,
    };
    const actor = {
      ...selfProjectUploader,
      permissions: ['role.assign'],
      permissionSources: [
        { ...base, assignmentId: 'a1', scopeType: 'SELF' as const },
        { ...base, assignmentId: 'a2', scopeType: 'ORGANIZATION' as const },
      ],
    };
    expect(
      actorsForPermission(actor, 'role.assign').map(
        (a) => a.administrationScope,
      ),
    ).toEqual(['SELF', 'ORGANIZATION']);
    expect(
      actorsForPermission(
        { ...actor, permissionSources: [{ ...base, scopeType: 'SYSTEM' }] },
        'role.assign',
      ),
    ).toEqual([]);
    expect(
      actorsForPermission(
        { ...actor, permissionSources: undefined },
        'role.assign',
      ),
    ).toEqual([]);
    expect(
      actorsForPermission({ ...actor, permissions: [] }, 'role.assign'),
    ).toEqual([]);
  });

  it('does not let a Task assignee upload into another Project', async () => {
    const findFirst = vi.fn(async ({ where }) =>
      where.AND
        ? null
        : { id: 'task-b', projectId: 'project-b', customerId: null },
    );
    const policy = new BusinessEntityPolicy({
      task: { findFirst },
    } as unknown as PrismaService);

    await expect(
      policy.assertView(selfProjectUploader, 'Task', 'task-b', 'file.upload'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'task-b',
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { assignees: { some: { userId: selfProjectUploader.userId } } },
              ]),
            }),
            expect.objectContaining({
              OR: expect.arrayContaining([
                { projectId: null },
                {
                  project: expect.objectContaining({
                    organizationId: selfProjectUploader.organizationId,
                    AND: expect.any(Array),
                  }),
                },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('does not let an Opportunity owner upload into another Project', async () => {
    const findFirst = vi.fn(async ({ where }) =>
      where.AND
        ? null
        : {
            id: 'opportunity-b',
            customerId: null,
            project: { id: 'project-b' },
          },
    );
    const policy = new BusinessEntityPolicy({
      opportunity: { findFirst },
    } as unknown as PrismaService);

    await expect(
      policy.assertView(
        selfProjectUploader,
        'Opportunity',
        'opportunity-b',
        'file.upload',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'opportunity-b',
          AND: expect.arrayContaining([
            expect.objectContaining({ ownerId: selfProjectUploader.userId }),
            expect.objectContaining({
              OR: expect.arrayContaining([
                { project: null },
                {
                  project: expect.objectContaining({
                    organizationId: selfProjectUploader.organizationId,
                    AND: expect.any(Array),
                  }),
                },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('does not borrow an organization scope from a role that lacks the required permissions', () => {
    const actor = {
      userId: 'user-1',
      organizationId: 'organization-1',
      organizationMembershipId: 'membership-1',
      email: 'user@example.test',
      displayName: 'User',
      mustChangePassword: false,
      permissions: [
        'organization.read',
        'file.upload',
        'project.document.manage',
      ],
      permissionSources: [
        {
          permission: 'organization.read',
          roleId: 'organization-reader',
          roleName: 'Organization reader',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        ...['file.upload', 'project.document.manage'].map((permission) => ({
          permission,
          roleId: 'self-uploader',
          roleName: 'Self uploader',
          scopeType: 'SELF' as const,
          departmentId: null,
        })),
      ],
      administrationScope: 'ORGANIZATION' as const,
      managedDepartmentIds: [],
      administrationTier: 1,
    } satisfies CurrentActor;

    expect(
      new BusinessEntityPolicy({} as PrismaService).projectWhere(actor, [
        'file.upload',
        'project.document.manage',
      ]),
    ).toMatchObject({
      organizationId: actor.organizationId,
      AND: [
        {
          OR: expect.arrayContaining([
            { members: { some: { userId: actor.userId } } },
          ]),
        },
        {
          OR: expect.arrayContaining([
            { members: { some: { userId: actor.userId } } },
          ]),
        },
      ],
    });
  });

  it('denies a required Project permission missing from a legacy actor', () => {
    const legacyActor = {
      userId: 'user-1',
      organizationId: 'organization-1',
      organizationMembershipId: 'membership-1',
      email: 'user@example.test',
      displayName: 'User',
      mustChangePassword: false,
      permissions: ['project.read'],
      administrationScope: 'ORGANIZATION' as const,
      managedDepartmentIds: [],
      administrationTier: 1,
    } satisfies CurrentActor;

    expect(
      new BusinessEntityPolicy({} as PrismaService).projectWhere(
        legacyActor,
        'file.upload',
      ),
    ).toMatchObject({ id: { in: [] } });
  });

  it('denies a missing permission', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['organization.update']),
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    expect(() =>
      guard.canActivate(context({ permissions: ['organization.read'] })),
    ).toThrow(ForbiddenException);
  });

  it('allows a resolved permission', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['organization.read']),
    } as unknown as Reflector;
    expect(
      new PermissionGuard(reflector).canActivate(
        context({ permissions: ['organization.read'] }),
      ),
    ).toBe(true);
  });

  it('rejects an authenticated session when its user is disabled', async () => {
    process.env.ALLOW_DEV_AUTH = 'false';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.SESSION_COOKIE_NAME = 'galaxy_session';
    const now = new Date();
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          organizationMembershipId: 'membership-1',
          revokedAt: null,
          expiresAt: new Date(now.getTime() + 60_000),
          lastSeenAt: now,
          user: { status: 'active', credential: null },
          organizationMembership: {
            id: 'membership-1',
            status: 'active',
            organization: { status: 'active' },
          },
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'disabled',
          organizationMembers: [],
          roles: [],
        }),
      },
    } as unknown as PrismaService;
    await expect(
      new DevelopmentAuthGuard(reflector, prisma).canActivate(
        context(undefined, {
          method: 'GET',
          headers: { cookie: 'galaxy_session=test-token' },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
  });

  it('rejects ambiguous development organization membership', async () => {
    process.env.ALLOW_DEV_AUTH = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const prisma = {
      session: { findUnique: vi.fn().mockResolvedValue(null) },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'active',
          organizationMembers: [
            { organizationId: 'a' },
            { organizationId: 'b' },
          ],
          roles: [],
        }),
      },
    } as unknown as PrismaService;
    await expect(
      new DevelopmentAuthGuard(reflector, prisma).canActivate(context()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('projects permissions from valid role assignments and excludes expired assignments', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.NODE_ENV = 'test';
    process.env.SESSION_COOKIE_NAME = 'galaxy_session';
    const now = new Date();
    const request: Record<string, unknown> = {
      method: 'GET',
      headers: { cookie: 'galaxy_session=test-token' },
    };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          organizationMembershipId: 'membership-1',
          revokedAt: null,
          expiresAt: new Date(now.getTime() + 60_000),
          lastSeenAt: now,
          user: {
            status: 'active',
            credential: { mustChangePassword: false },
          },
          organizationMembership: {
            id: 'membership-1',
            status: 'active',
            organization: { status: 'active' },
          },
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.test',
          displayName: 'User',
          status: 'active',
          organizationMembers: [
            {
              id: 'membership-1',
              organizationId: 'organization-1',
              organization: { status: 'active' },
              managedDepartments: [],
            },
          ],
          roles: [
            {
              id: 'assignment-valid',
              organizationId: 'organization-1',
              scopeType: 'SELF',
              departmentId: null,
              role: {
                id: 'role-valid',
                name: 'Uploader',
                administrationTier: 0,
                permissions: [{ permission: { code: 'file.upload' } }],
              },
            },
          ],
        }),
      },
    } as unknown as PrismaService;

    await expect(
      new DevelopmentAuthGuard(reflector, prisma).canActivate(
        context(undefined, request),
      ),
    ).resolves.toBe(true);

    expect(request.actor).toMatchObject({
      userId: 'user-1',
      permissions: ['file.upload'],
      permissionSources: [
        {
          assignmentId: 'assignment-valid',
          administrationTier: 0,
          permission: 'file.upload',
        },
      ],
    });
    expect(vi.mocked(prisma.user.findUnique)).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          roles: expect.objectContaining({
            where: {
              status: 'active',
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: expect.any(Date) } },
              ],
              role: { status: 'active' },
            },
          }),
        }),
      }),
    );
  });

  it('rejects a session with an inactive organization membership', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.NODE_ENV = 'test';
    process.env.SESSION_COOKIE_NAME = 'galaxy_session';
    const now = new Date();
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          organizationMembershipId: 'membership-1',
          revokedAt: null,
          expiresAt: new Date(now.getTime() + 60_000),
          lastSeenAt: now,
          user: { status: 'active', credential: null },
          organizationMembership: {
            id: 'membership-1',
            status: 'disabled',
            organization: { status: 'active' },
          },
        }),
      },
    } as unknown as PrismaService;

    await expect(
      new DevelopmentAuthGuard(reflector, prisma).canActivate(
        context(undefined, {
          method: 'GET',
          headers: { cookie: 'galaxy_session=test-token' },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
