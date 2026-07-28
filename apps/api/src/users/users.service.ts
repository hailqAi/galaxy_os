import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { readEnvironment } from '../config/env';
import { UserManagementPolicy } from '../access-control/user-management.policy';
import {
  CreateUserDto,
  SetUserDepartmentsDto,
  SetUserRolesDto,
  UpdateMembershipDto,
  UpdateUserDto,
} from './users.dto';

const safeUserSelect = {
  id: true,
  email: true,
  normalizedEmail: true,
  displayName: true,
  avatarKey: true,
  phone: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const userSelect = (organizationId: string) =>
  ({
    ...safeUserSelect,
    organizationMembers: {
      where: { organizationId },
      include: { managedDepartments: { include: { department: true } } },
    },
    departmentMembers: {
      where: { organizationId },
      include: { department: true },
    },
    roles: {
      where: {
        organizationId,
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { role: true },
    },
    credential: {
      select: { mustChangePassword: true, passwordChangedAt: true },
    },
  }) satisfies Prisma.UserSelect;

const userSummarySelect = (organizationId: string) =>
  ({
    id: true,
    email: true,
    displayName: true,
    status: true,
    createdAt: true,
    lastLoginAt: true,
    organizationMembers: {
      where: { organizationId },
      select: { status: true, administrationScope: true },
    },
    departmentMembers: {
      where: { organizationId },
      select: {
        isPrimary: true,
        department: { select: { id: true, name: true } },
      },
    },
    roles: {
      where: {
        organizationId,
        status: 'active' as const,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        role: { status: 'active' as const },
      },
      select: {
        role: {
          select: {
            id: true,
            name: true,
            isProtected: true,
            administrationTier: true,
          },
        },
      },
    },
    credential: { select: { mustChangePassword: true, lockedUntil: true } },
  }) satisfies Prisma.UserSelect;

export type AccessPreviewResponse = {
  userId: string;
  scope: 'SYSTEM' | 'ORGANIZATION' | 'DEPARTMENT' | 'SELF';
  visibleModules: string[];
  visibleDepartmentIds: string[];
  manageableUsers: number;
  effectivePermissions: string[];
  deniedPermissions: string[];
  sourceRoles: {
    roleId: string;
    roleName: string;
    scopeType: string;
    departmentId: string | null;
  }[];
  roles: { id: string; name: string }[];
  permissions: { code: string; module: string }[];
  scopes: { type: string; departmentId: string | null }[];
  customFields: { key: string; value: Prisma.JsonValue }[];
  protectedTargets: number;
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(UserManagementPolicy) private readonly policy: UserManagementPolicy,
  ) {}

  async list(
    actor: CurrentActor,
    page: number,
    pageSize: number,
    query: {
      search?: string;
      status?: 'invited' | 'active' | 'disabled';
      departmentId?: string;
      roleId?: string;
      membershipStatus?: 'active' | 'disabled';
      mustChangePassword?: boolean;
      locked?: boolean;
      sort?: 'displayName' | 'email' | 'role' | 'createdAt' | 'lastLoginAt';
      direction?: 'asc' | 'desc';
    },
  ) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      AND: [this.policy.visibleWhere(actor)],
      OR: search
        ? [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
      status: query.status,
      organizationMembers: query.membershipStatus
        ? {
            some: {
              organizationId: actor.organizationId,
              status: query.membershipStatus,
            },
          }
        : undefined,
      credential: query.locked
        ? { is: { lockedUntil: { gt: new Date() } } }
        : query.mustChangePassword === undefined
          ? undefined
          : { is: { mustChangePassword: query.mustChangePassword } },
      departmentMembers: query.departmentId
        ? {
            some: {
              organizationId: actor.organizationId,
              departmentId: query.departmentId,
            },
          }
        : undefined,
      roles: query.roleId
        ? {
            some: {
              organizationId: actor.organizationId,
              roleId: query.roleId,
            },
          }
        : undefined,
    };
    const direction = query.direction ?? 'asc';
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      query.sort === 'role'
        ? [{ roles: { _count: direction } }, { id: 'asc' }]
        : [{ [query.sort ?? 'displayName']: direction }, { id: 'asc' }];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSummarySelect(actor.organizationId),
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((user) => ({
        userId: user.id,
        username: user.email,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        membershipStatus: user.organizationMembers[0]?.status ?? null,
        administrationScope:
          user.organizationMembers[0]?.administrationScope ?? 'SELF',
        roles: user.roles.map(({ role }) => ({ id: role.id, name: role.name })),
        departments: user.departmentMembers.map(
          ({ department, isPrimary }) => ({
            ...department,
            isPrimary,
          }),
        ),
        mustChangePassword: user.credential?.mustChangePassword ?? false,
        locked: Boolean(
          user.credential?.lockedUntil &&
            user.credential.lockedUntil > new Date(),
        ),
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        actions: this.policy.actions(actor, { id: user.id, roles: user.roles }),
      })),
      total,
      page,
      pageSize,
    };
  }

  async get(actor: CurrentActor, id: string) {
    await this.policy.assert(actor, id, 'view');
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        organizationMembers: { some: { organizationId: actor.organizationId } },
      },
      select: userSelect(actor.organizationId),
    });
    if (!user) throw new NotFoundException('User not found');
    return { ...user, actions: this.policy.actions(actor, user) };
  }

  async capabilities(actor: CurrentActor, id: string) {
    await this.policy.assert(actor, id, 'view');
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        organizationMembers: { some: { organizationId: actor.organizationId } },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        organizationMembers: {
          where: { organizationId: actor.organizationId },
          select: {
            administrationScope: true,
            managedDepartments: {
              where: { status: 'active' },
              select: { department: { select: { id: true, name: true } } },
            },
          },
        },
        roles: {
          where: {
            organizationId: actor.organizationId,
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: { status: 'active' },
          },
          select: {
            scopeType: true,
            departmentId: true,
            role: {
              select: {
                id: true,
                name: true,
                isProtected: true,
                isDelegable: true,
                permissions: { select: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const membership = user.organizationMembers[0];
    const capabilities = new Map<
      string,
      {
        key: string;
        name: string;
        description: string;
        module: string;
        sourceRoles: {
          id: string;
          name: string;
          scopeType: string;
          departmentId: string | null;
        }[];
        scope: CurrentActor['administrationScope'];
        managedDepartments: { id: string; name: string }[];
        delegableByActor: boolean;
        protected: boolean;
      }
    >();
    for (const { role, scopeType, departmentId } of user.roles)
      for (const { permission } of role.permissions) {
        const item = capabilities.get(permission.code) ?? {
          key: permission.code,
          name: permission.name,
          description: permission.description,
          module: permission.code.split('.')[0]!,
          sourceRoles: [],
          scope: membership?.administrationScope ?? 'SELF',
          managedDepartments:
            membership?.managedDepartments.map(
              ({ department }) => department,
            ) ?? [],
          delegableByActor:
            actor.permissions.includes(permission.code) &&
            role.isDelegable &&
            !role.isProtected,
          protected: role.isProtected,
        };
        item.sourceRoles.push({
          id: role.id,
          name: role.name,
          scopeType,
          departmentId,
        });
        item.protected ||= role.isProtected;
        item.delegableByActor &&=
          actor.permissions.includes(permission.code) &&
          role.isDelegable &&
          !role.isProtected;
        capabilities.set(permission.code, item);
      }
    return {
      user: {
        userId: user.id,
        username: user.email,
        displayName: user.displayName,
      },
      capabilities: [...capabilities.values()].sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
    };
  }

  async accessPreview(
    actor: CurrentActor,
    id: string,
  ): Promise<AccessPreviewResponse> {
    await this.policy.assert(actor, id, 'view');
    const target = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        organizationMembers: {
          where: { organizationId: actor.organizationId },
          include: { managedDepartments: { where: { status: 'active' } } },
        },
        roles: {
          where: {
            organizationId: actor.organizationId,
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    const assignments = target.roles;
    const effectivePermissions = [
      ...new Set(
        assignments.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code),
        ),
      ),
    ].sort();
    const catalogue = await this.prisma.permission.findMany({
      select: { code: true, module: true },
    });
    const scope = assignments.some(({ scopeType }) => scopeType === 'SYSTEM')
      ? 'SYSTEM'
      : assignments.some(({ scopeType }) => scopeType === 'ORGANIZATION')
        ? 'ORGANIZATION'
        : assignments.some(({ scopeType }) => scopeType === 'DEPARTMENT')
          ? 'DEPARTMENT'
          : 'SELF';
    const departmentIds =
      scope === 'ORGANIZATION' || scope === 'SYSTEM'
        ? (
            await this.prisma.department.findMany({
              where: { organizationId: actor.organizationId, status: 'active' },
              select: { id: true },
            })
          ).map(({ id }) => id)
        : (target.organizationMembers[0]?.managedDepartments?.map(
            ({ departmentId }) => departmentId,
          ) ?? []);
    const manageableUsers = await this.prisma.user.count({
      where:
        scope === 'SYSTEM'
          ? {
              organizationMembers: {
                some: {
                  organizationId: actor.organizationId,
                  status: 'active',
                },
              },
            }
          : scope === 'ORGANIZATION'
            ? {
                organizationMembers: {
                  some: {
                    organizationId: actor.organizationId,
                    status: 'active',
                  },
                },
              }
            : scope === 'DEPARTMENT'
              ? {
                  departmentMembers: {
                    some: {
                      organizationId: actor.organizationId,
                      departmentId: { in: departmentIds },
                    },
                  },
                }
              : { id },
    });
    return {
      userId: id,
      scope,
      visibleModules: [
        ...new Set(
          effectivePermissions.map((code) => code.split('.')[0] ?? code),
        ),
      ].sort(),
      visibleDepartmentIds: departmentIds,
      manageableUsers,
      effectivePermissions,
      deniedPermissions: catalogue
        .map(({ code }) => code)
        .filter((code) => !effectivePermissions.includes(code))
        .sort(),
      sourceRoles: assignments.map(({ role, scopeType, departmentId }) => ({
        roleId: role.id,
        roleName: role.name,
        scopeType,
        departmentId,
      })),
      roles: assignments.map(({ role }) => ({ id: role.id, name: role.name })),
      permissions: catalogue.filter(({ code }) =>
        effectivePermissions.includes(code),
      ),
      scopes: assignments.map(({ scopeType, departmentId }) => ({
        type: scopeType,
        departmentId,
      })),
      customFields:
        target.customData &&
        typeof target.customData === 'object' &&
        !Array.isArray(target.customData)
          ? Object.entries(target.customData).flatMap(([key, value]) =>
              value === undefined ? [] : [{ key, value }],
            )
          : [],
      protectedTargets: await this.prisma.user.count({
        where: {
          organizationMembers: {
            some: { organizationId: actor.organizationId },
          },
          roles: {
            some: {
              organizationId: actor.organizationId,
              role: { isProtected: true },
            },
          },
        },
      }),
    };
  }

  async sessions(actor: CurrentActor, id: string) {
    await this.policy.assert(actor, id, 'revokeSessions');
    return this.prisma.session.findMany({
      where: { userId: id },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
      },
      orderBy: [{ revokedAt: 'asc' }, { lastSeenAt: 'desc' }],
      take: 100,
    });
  }

  async create(actor: CurrentActor, input: CreateUserDto) {
    this.policy.requireOrganizationScope(actor);
    const email = input.email.trim().toLowerCase();
    const departmentIds = (input.departments ?? []).map(
      ({ departmentId }) => departmentId,
    );
    if (new Set(departmentIds).size !== departmentIds.length)
      throw new BadRequestException('Duplicate department assignment');
    const temporaryPassword =
      input.temporaryPassword ?? randomBytes(12).toString('base64url');
    if (Buffer.byteLength(temporaryPassword) > 72)
      throw new BadRequestException(
        'Temporary password must be at most 72 UTF-8 bytes',
      );
    const passwordHash = await hash(
      temporaryPassword,
      readEnvironment().PASSWORD_BCRYPT_ROUNDS,
    );
    await this.policy.assertDelegableRoles(actor, input.roleIds ?? []);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { normalizedEmail: email },
        select: safeUserSelect,
      });
      if (existing)
        throw new ConflictException('A user with this email already exists');
      const user = await tx.user.create({
        data: {
          email,
          normalizedEmail: email,
          displayName: input.displayName,
          phone: input.phone,
          status: input.status,
        },
        select: safeUserSelect,
      });
      const membership = await tx.organizationMembership.create({
        data: { organizationId: actor.organizationId, userId: user.id },
      });
      await this.audit.write(tx, actor, {
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        afterData: user,
      });
      await this.audit.write(tx, actor, {
        action: 'membership.create',
        entityType: 'OrganizationMembership',
        entityId: membership.id,
        afterData: membership,
      });
      await tx.passwordCredential.create({
        data: { userId: user.id, passwordHash, mustChangePassword: true },
      });
      const roleIds = input.roleIds ?? [];
      if (
        (await tx.department.count({
          where: {
            id: { in: departmentIds },
            organizationId: actor.organizationId,
            status: 'active',
          },
        })) !== departmentIds.length
      )
        throw new BadRequestException(
          'Department must belong to the current organization',
        );
      if (
        (await tx.role.count({
          where: {
            id: { in: roleIds },
            organizationId: actor.organizationId,
            status: 'active',
          },
        })) !== roleIds.length
      )
        throw new BadRequestException(
          'Role must belong to the current organization',
        );
      if (
        await tx.role.count({
          where: {
            id: { in: roleIds },
            OR: [{ isProtected: true }, { maximumScope: 'SYSTEM' }],
          },
        })
      )
        throw new ConflictException(
          'Protected system roles require an explicit SYSTEM assignment',
        );
      if (
        (input.departments ?? []).filter(({ isPrimary }) => isPrimary).length >
        1
      )
        throw new BadRequestException('Only one primary department is allowed');
      await tx.departmentMembership.createMany({
        data: (input.departments ?? []).map((item) => ({
          ...item,
          organizationId: actor.organizationId,
          userId: user.id,
        })),
      });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({
          roleId,
          organizationId: actor.organizationId,
          userId: user.id,
          assignedByUserId: actor.userId,
        })),
      });
      for (const department of input.departments ?? [])
        await this.audit.write(tx, actor, {
          action: 'department.membership.add',
          entityType: 'DepartmentMembership',
          entityId: user.id,
          metadata: department,
        });
      for (const roleId of roleIds)
        await this.audit.write(tx, actor, {
          action: 'role.assign',
          entityType: 'User',
          entityId: user.id,
          metadata: { roleId },
        });
      return { ...user, temporaryPassword };
    });
  }

  async update(actor: CurrentActor, id: string, input: UpdateUserDto) {
    await this.policy.assert(actor, id, 'update');
    if ('email' in input || 'status' in input || 'normalizedEmail' in input)
      throw new BadRequestException(
        'Login identifier and account status are immutable here',
      );
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: {
          id,
          organizationMembers: {
            some: { organizationId: actor.organizationId },
          },
        },
        select: safeUserSelect,
      });
      if (!before) throw new NotFoundException('User not found');
      if (
        (await tx.organizationMembership.count({ where: { userId: id } })) > 1
      )
        throw new ConflictException(
          'Shared user identity cannot be edited from organization settings',
        );
      const after = await tx.user.update({
        where: { id },
        data: input,
        select: safeUserSelect,
      });
      await this.audit.write(tx, actor, {
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }

  async disable(actor: CurrentActor, id: string) {
    await this.policy.assert(actor, id, 'disable');
    return this.prisma.$transaction(
      async (tx) => {
        const before = await tx.user.findFirst({
          where: {
            id,
            organizationMembers: {
              some: { organizationId: actor.organizationId },
            },
          },
          select: safeUserSelect,
        });
        if (!before) throw new NotFoundException('User not found');
        const beforeMembership =
          await tx.organizationMembership.findUniqueOrThrow({
            where: {
              organizationId_userId: {
                organizationId: actor.organizationId,
                userId: id,
              },
            },
          });
        if (
          (await tx.organizationMembership.count({ where: { userId: id } })) > 1
        )
          throw new ConflictException(
            'Disable the organization membership instead of a shared user account',
          );
        if (await this.isLastActiveAdmin(tx, actor.organizationId, id))
          throw new ConflictException(
            'The final active system administrator cannot be disabled',
          );
        const after = await tx.user.update({
          where: { id },
          data: { status: 'disabled' },
          select: safeUserSelect,
        });
        await tx.organizationMembership.update({
          where: {
            organizationId_userId: {
              organizationId: actor.organizationId,
              userId: id,
            },
          },
          data: { status: 'disabled' },
        });
        const sessions = await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        const afterMembership = {
          ...beforeMembership,
          status: 'disabled' as const,
        };
        await this.audit.write(tx, actor, {
          action: 'user.disable',
          entityType: 'User',
          entityId: id,
          beforeData: before,
          afterData: after,
        });
        await this.audit.write(tx, actor, {
          action: 'membership.update',
          entityType: 'OrganizationMembership',
          entityId: beforeMembership.id,
          beforeData: beforeMembership,
          afterData: afterMembership,
        });
        await this.audit.write(tx, actor, {
          action: 'user.session.revoke',
          entityType: 'User',
          entityId: id,
          metadata: { count: sessions.count, reason: 'user.disable' },
        });
        return after;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async reactivate(actor: CurrentActor, id: string) {
    await this.policy.assert(actor, id, 'reactivate');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: {
          id,
          organizationMembers: {
            some: { organizationId: actor.organizationId },
          },
        },
        select: safeUserSelect,
      });
      if (!before) throw new NotFoundException('User not found');
      if (
        (await tx.organizationMembership.count({ where: { userId: id } })) > 1
      )
        throw new ConflictException(
          'Reactivate the organization membership instead of a shared user account',
        );
      const after = await tx.user.update({
        where: { id },
        data: { status: 'active' },
        select: safeUserSelect,
      });
      await tx.organizationMembership.update({
        where: {
          organizationId_userId: {
            organizationId: actor.organizationId,
            userId: id,
          },
        },
        data: { status: 'active' },
      });
      await this.audit.write(tx, actor, {
        action: 'user.reactivate',
        entityType: 'User',
        entityId: id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }

  async getMembership(actor: CurrentActor, userId: string) {
    await this.policy.assert(actor, userId, 'view');
    return this.requireMembership(this.prisma, actor.organizationId, userId);
  }

  async auditHistory(actor: CurrentActor, userId: string) {
    await this.policy.assert(actor, userId, 'viewAudit');
    return this.prisma.auditLog.findMany({
      where: { organizationId: actor.organizationId, entityId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        entityId: true,
        action: true,
        entityType: true,
        createdAt: true,
        actorUserId: true,
        metadata: true,
      },
    });
  }

  async updateMembership(
    actor: CurrentActor,
    userId: string,
    input: UpdateMembershipDto,
  ) {
    this.policy.requireOrganizationScope(actor);
    await this.policy.assert(actor, userId, 'update');
    return this.prisma.$transaction(
      async (tx) => {
        const before = await this.requireMembership(
          tx,
          actor.organizationId,
          userId,
        );
        if (
          ((input.status === 'disabled' && before.status === 'active') ||
            (input.administrationScope &&
              input.administrationScope !== 'ORGANIZATION')) &&
          (await this.isLastActiveAdmin(tx, actor.organizationId, userId))
        )
          throw new ConflictException(
            'The final active system administrator membership cannot be disabled',
          );
        const after = await tx.organizationMembership.update({
          where: {
            organizationId_userId: {
              organizationId: actor.organizationId,
              userId,
            },
          },
          data: input,
        });
        if (input.status === 'disabled') {
          const sessions = await tx.session.updateMany({
            where: {
              organizationMembershipId: before.id,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
          await this.audit.write(tx, actor, {
            action: 'user.session.revoke',
            entityType: 'User',
            entityId: userId,
            metadata: {
              count: sessions.count,
              reason: 'membership.disable',
            },
          });
        }
        await this.audit.write(tx, actor, {
          action: 'membership.update',
          entityType: 'OrganizationMembership',
          entityId: after.id,
          beforeData: before,
          afterData: after,
        });
        return after;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async setDepartments(
    actor: CurrentActor,
    userId: string,
    input: SetUserDepartmentsDto,
  ) {
    await this.policy.assert(actor, userId, 'manageDepartments');
    if (input.departments.filter(({ isPrimary }) => isPrimary).length > 1)
      throw new BadRequestException('Only one primary department is allowed');
    const ids = input.departments.map(({ departmentId }) => departmentId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Duplicate department assignment');
    if (
      actor.administrationScope === 'MANAGED_DEPARTMENTS' &&
      ids.some((id) => !actor.managedDepartmentIds.includes(id))
    )
      throw new BadRequestException(
        'Department is outside the actor management scope',
      );
    return this.prisma.$transaction(
      async (tx) => {
        await this.requireMembership(tx, actor.organizationId, userId, true);
        const valid = await tx.department.count({
          where: {
            id: { in: ids },
            organizationId: actor.organizationId,
            status: 'active',
          },
        });
        if (valid !== ids.length)
          throw new BadRequestException(
            'Department must belong to the current organization',
          );
        const before = await tx.departmentMembership.findMany({
          where: { organizationId: actor.organizationId, userId },
        });
        if (
          actor.administrationScope === 'MANAGED_DEPARTMENTS' &&
          input.departments.some(({ isPrimary }) => isPrimary) &&
          before.some(
            ({ isPrimary, departmentId }) =>
              isPrimary && !actor.managedDepartmentIds.includes(departmentId),
          )
        )
          throw new ConflictException(
            'Primary department is outside the actor management scope',
          );
        await tx.departmentMembership.deleteMany({
          where: {
            organizationId: actor.organizationId,
            userId,
            departmentId:
              actor.administrationScope === 'MANAGED_DEPARTMENTS'
                ? { in: actor.managedDepartmentIds }
                : undefined,
          },
        });
        await tx.departmentMembership.createMany({
          data: input.departments.map((item) => ({
            ...item,
            organizationId: actor.organizationId,
            userId,
          })),
        });
        const after = await tx.departmentMembership.findMany({
          where: { organizationId: actor.organizationId, userId },
          include: { department: true },
        });
        for (const membership of after.filter(
          ({ departmentId }) =>
            !before.some((item) => item.departmentId === departmentId),
        ))
          await this.audit.write(tx, actor, {
            action: 'department.membership.add',
            entityType: 'DepartmentMembership',
            entityId: membership.id,
            afterData: membership,
          });
        for (const membership of before.filter(
          ({ departmentId }) =>
            !after.some((item) => item.departmentId === departmentId),
        ))
          await this.audit.write(tx, actor, {
            action: 'department.membership.remove',
            entityType: 'DepartmentMembership',
            entityId: membership.id,
            beforeData: membership,
          });
        for (const membership of before.filter(({ departmentId, isPrimary }) =>
          after.some(
            (item) =>
              item.departmentId === departmentId &&
              item.isPrimary !== isPrimary,
          ),
        ))
          await this.audit.write(tx, actor, {
            action: 'department.membership.update',
            entityType: 'DepartmentMembership',
            entityId: membership.id,
            beforeData: membership,
            afterData: after.find(
              ({ departmentId }) => departmentId === membership.departmentId,
            ),
          });
        return after;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async setRoles(actor: CurrentActor, userId: string, input: SetUserRolesDto) {
    await this.policy.assert(actor, userId, 'assignRoles', input.roleIds);
    return this.prisma.$transaction(
      async (tx) => {
        await this.requireMembership(tx, actor.organizationId, userId, true);
        const roles = await tx.role.findMany({
          where: {
            id: { in: input.roleIds },
            organizationId: actor.organizationId,
            status: 'active',
          },
        });
        if (roles.length !== input.roleIds.length)
          throw new BadRequestException(
            'Role must belong to the current organization',
          );
        if (
          roles.some(
            ({ isProtected, maximumScope }) =>
              isProtected || maximumScope === 'SYSTEM',
          )
        )
          throw new ConflictException(
            'Protected system roles require the scoped assignment endpoint',
          );
        const before = await tx.userRole.findMany({
          where: { organizationId: actor.organizationId, userId },
          include: { role: true },
        });
        const removingAdmin =
          before.some(({ role }) => role.code === 'system_admin') &&
          !roles.some(({ code }) => code === 'system_admin');
        if (
          removingAdmin &&
          (await this.isLastActiveAdmin(tx, actor.organizationId, userId))
        )
          throw new ConflictException(
            'The final active system administrator cannot lose the system_admin role',
          );
        await tx.userRole.deleteMany({
          where: { organizationId: actor.organizationId, userId },
        });
        await tx.userRole.createMany({
          data: input.roleIds.map((roleId) => ({
            organizationId: actor.organizationId,
            userId,
            roleId,
            assignedByUserId: actor.userId,
          })),
        });
        const beforeIds = before.map(({ roleId }) => roleId);
        for (const roleId of input.roleIds.filter(
          (id) => !beforeIds.includes(id),
        ))
          await this.audit.write(tx, actor, {
            action: 'role.assign',
            entityType: 'User',
            entityId: userId,
            metadata: { roleId },
          });
        for (const roleId of beforeIds.filter(
          (id) => !input.roleIds.includes(id),
        ))
          await this.audit.write(tx, actor, {
            action: 'role.remove',
            entityType: 'User',
            entityId: userId,
            metadata: { roleId },
          });
        return tx.userRole.findMany({
          where: { organizationId: actor.organizationId, userId },
          include: { role: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async setScopedRoleAssignments(
    actor: CurrentActor,
    userId: string,
    assignments: {
      roleId: string;
      scopeType: 'SYSTEM' | 'ORGANIZATION' | 'DEPARTMENT' | 'SELF';
      departmentId?: string;
      expiresAt?: string;
    }[],
  ) {
    const roleIds = [...new Set(assignments.map(({ roleId }) => roleId))];
    await this.policy.assert(actor, userId, 'assignRoles', roleIds);
    if (
      assignments.some(
        ({ scopeType, departmentId }) =>
          (scopeType === 'DEPARTMENT') !== Boolean(departmentId),
      )
    )
      throw new BadRequestException(
        'Department scope requires exactly one department',
      );
    if (
      assignments.some(({ scopeType }) => scopeType === 'SYSTEM') &&
      actor.administrationScope !== 'SYSTEM'
    )
      throw new ConflictException(
        'Only a System Administrator may assign SYSTEM scope',
      );
    return this.prisma.$transaction(
      async (tx) => {
        await this.requireMembership(tx, actor.organizationId, userId, true);
        const roles = await tx.role.findMany({
          where: {
            id: { in: roleIds },
            organizationId: actor.organizationId,
            status: 'active',
          },
        });
        if (roles.length !== roleIds.length)
          throw new BadRequestException(
            'Role must belong to the current organization',
          );
        const rank = {
          SELF: 0,
          DEPARTMENT: 1,
          ORGANIZATION: 2,
          SYSTEM: 3,
        } as const;
        for (const assignment of assignments) {
          const role = roles.find(({ id }) => id === assignment.roleId)!;
          if (rank[assignment.scopeType] > rank[role.maximumScope])
            throw new ConflictException(
              'Assignment exceeds the role scope ceiling',
            );
          if (
            assignment.departmentId &&
            !(await tx.department.findFirst({
              where: {
                id: assignment.departmentId,
                organizationId: actor.organizationId,
                status: 'active',
              },
            }))
          )
            throw new BadRequestException(
              'Department must be active in the current organization',
            );
          if (
            actor.administrationScope === 'MANAGED_DEPARTMENTS' &&
            (!assignment.departmentId ||
              !actor.managedDepartmentIds.includes(assignment.departmentId))
          )
            throw new ConflictException(
              'Assignment exceeds managed department scope',
            );
        }
        const before = await tx.userRole.findMany({
          where: { organizationId: actor.organizationId, userId },
          include: { role: true },
        });
        const removingFinal =
          before.some(({ role }) => role.code === 'system_admin') &&
          !assignments.some(
            ({ roleId }) =>
              roles.find(({ id }) => id === roleId)?.code === 'system_admin',
          );
        if (
          removingFinal &&
          (await this.isLastActiveAdmin(tx, actor.organizationId, userId))
        )
          throw new ConflictException(
            'The final active system administrator cannot lose SYSTEM access',
          );
        await tx.userRole.deleteMany({
          where: { organizationId: actor.organizationId, userId },
        });
        for (const assignment of assignments)
          await tx.userRole.create({
            data: {
              organizationId: actor.organizationId,
              userId,
              roleId: assignment.roleId,
              scopeType: assignment.scopeType,
              departmentId: assignment.departmentId,
              expiresAt: assignment.expiresAt
                ? new Date(assignment.expiresAt)
                : null,
              assignedByUserId: actor.userId,
            },
          });
        await this.audit.write(tx, actor, {
          action: 'role.assignment.update',
          entityType: 'User',
          entityId: userId,
          beforeData: before.map(({ roleId, scopeType, departmentId }) => ({
            roleId,
            scopeType,
            departmentId,
          })),
          afterData: assignments,
        });
        return tx.userRole.findMany({
          where: { organizationId: actor.organizationId, userId },
          include: { role: true, department: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async setAccessProfile(
    actor: CurrentActor,
    userId: string,
    input: {
      name: string;
      permissionIds: string[];
      maximumScope: 'ORGANIZATION' | 'DEPARTMENT' | 'SELF';
      departmentId?: string;
    },
  ) {
    await this.policy.assert(actor, userId, 'assignRoles');
    const scopeType = input.maximumScope;
    if ((scopeType === 'DEPARTMENT') !== Boolean(input.departmentId))
      throw new BadRequestException(
        'Department scope requires exactly one department',
      );
    if (
      actor.administrationScope === 'MANAGED_DEPARTMENTS' &&
      (!input.departmentId ||
        !actor.managedDepartmentIds.includes(input.departmentId))
    )
      throw new ConflictException(
        'Access profile exceeds managed department scope',
      );
    const code = `access_${userId.replaceAll('-', '')}`;
    return this.prisma.$transaction(
      async (tx) => {
        const permissions = await tx.permission.findMany({
          where: { id: { in: input.permissionIds }, isDelegable: true },
        });
        if (
          permissions.length !== input.permissionIds.length ||
          permissions.some(({ code }) => !actor.permissions.includes(code))
        )
          throw new ConflictException(
            'Access profile exceeds the actor delegation ceiling',
          );
        if (
          input.departmentId &&
          !(await tx.department.findFirst({
            where: {
              id: input.departmentId,
              organizationId: actor.organizationId,
              status: 'active',
            },
          }))
        )
          throw new BadRequestException(
            'Department must be active in the current organization',
          );
        const role = await tx.role.upsert({
          where: {
            organizationId_code: { organizationId: actor.organizationId, code },
          },
          create: {
            organizationId: actor.organizationId,
            code,
            name: input.name,
            category: 'CUSTOM',
            maximumScope: input.maximumScope,
            administrationTier: Math.max(0, actor.administrationTier - 1),
            isDelegable: false,
            createdByUserId: actor.userId,
          },
          update: {
            name: input.name,
            maximumScope: input.maximumScope,
            status: input.permissionIds.length ? 'active' : 'archived',
          },
        });
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({
          data: input.permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        });
        await tx.userRole.deleteMany({
          where: {
            organizationId: actor.organizationId,
            userId,
            roleId: role.id,
          },
        });
        if (input.permissionIds.length)
          await tx.userRole.create({
            data: {
              organizationId: actor.organizationId,
              userId,
              roleId: role.id,
              scopeType,
              departmentId: input.departmentId,
              assignedByUserId: actor.userId,
            },
          });
        await this.audit.write(tx, actor, {
          action: 'user.access-profile.update',
          entityType: 'User',
          entityId: userId,
          metadata: {
            roleId: role.id,
            scopeType,
            departmentId: input.departmentId,
            permissionIds: input.permissionIds,
          },
        });
        return { roleId: role.id, archived: !input.permissionIds.length };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async setManagedDepartments(
    actor: CurrentActor,
    userId: string,
    departmentIds: string[],
  ) {
    this.policy.requireOrganizationScope(actor);
    await this.policy.assert(actor, userId, 'manageDepartments');
    return this.prisma.$transaction(async (tx) => {
      const manager = await this.requireMembership(
        tx,
        actor.organizationId,
        userId,
        true,
      );
      const valid = await tx.department.count({
        where: {
          id: { in: departmentIds },
          organizationId: actor.organizationId,
          status: 'active',
        },
      });
      if (valid !== departmentIds.length)
        throw new BadRequestException(
          'Managed department must be active in the current organization',
        );
      const before = await tx.managedDepartment.findMany({
        where: { managerId: manager.id },
      });
      await tx.managedDepartment.deleteMany({
        where: { managerId: manager.id },
      });
      await tx.managedDepartment.createMany({
        data: departmentIds.map((departmentId) => ({
          organizationId: actor.organizationId,
          managerId: manager.id,
          departmentId,
          createdByUserId: actor.userId,
        })),
      });
      const after = await tx.managedDepartment.findMany({
        where: { managerId: manager.id },
        include: { department: true },
      });
      await this.audit.write(tx, actor, {
        action: 'managed-department.update',
        entityType: 'OrganizationMembership',
        entityId: manager.id,
        beforeData: before.map(({ departmentId }) => departmentId),
        afterData: departmentIds,
      });
      return after;
    });
  }

  private async requireMembership(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    active = false,
  ) {
    const membership = await tx.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership || (active && membership.status !== 'active'))
      throw new NotFoundException('Active user membership not found');
    return membership;
  }

  private async isLastActiveAdmin(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ) {
    const targetIsAdmin = await tx.userRole.count({
      where: {
        organizationId,
        userId,
        role: { code: 'system_admin' },
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        user: {
          status: 'active',
          organizationMembers: { some: { organizationId, status: 'active' } },
        },
      },
    });
    if (!targetIsAdmin) return false;
    return (
      (await tx.userRole.count({
        where: {
          organizationId,
          role: { code: 'system_admin' },
          status: 'active',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          user: {
            status: 'active',
            organizationMembers: { some: { organizationId, status: 'active' } },
          },
        },
      })) === 1
    );
  }
}
