import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
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
  displayName: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const userSelect = (organizationId: string) =>
  ({
    ...safeUserSelect,
    organizationMembers: { where: { organizationId } },
    departmentMembers: {
      where: { organizationId },
      include: { department: true },
    },
    roles: {
      where: { organizationId },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    },
  }) satisfies Prisma.UserSelect;

const withEffectivePermissions = <
  T extends {
    status: string;
    organizationMembers: { status: string }[];
    roles: {
      role: {
        status: string;
        permissions: { permission: { code: string } }[];
      };
    }[];
  },
>(
  user: T,
) => ({
  ...user,
  effectivePermissions: [
    ...new Set(
      user.status === 'active' &&
      user.organizationMembers.some(({ status }) => status === 'active')
        ? user.roles
            .filter(({ role }) => role.status === 'active')
            .flatMap(({ role }) =>
              role.permissions.map(({ permission }) => permission.code),
            )
        : [],
    ),
  ].sort(),
});

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    actor: CurrentActor,
    page: number,
    pageSize: number,
    search?: string,
  ) {
    const where: Prisma.UserWhereInput = {
      organizationMembers: { some: { organizationId: actor.organizationId } },
      OR: search
        ? [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect(actor.organizationId),
        orderBy: { displayName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map(withEffectivePermissions),
      total,
      page,
      pageSize,
    };
  }

  async get(actor: CurrentActor, id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        organizationMembers: { some: { organizationId: actor.organizationId } },
      },
      select: userSelect(actor.organizationId),
    });
    if (!user) throw new NotFoundException('User not found');
    return withEffectivePermissions(user);
  }

  create(actor: CurrentActor, input: CreateUserDto) {
    const email = input.email.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: safeUserSelect,
      });
      if (existing?.status === 'disabled')
        throw new ConflictException('Disabled user account cannot be added');
      const user =
        existing ??
        (await tx.user.create({
          data: { ...input, email },
          select: safeUserSelect,
        }));
      const membership = await tx.organizationMembership.create({
        data: { organizationId: actor.organizationId, userId: user.id },
      });
      if (!existing)
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
      return user;
    });
  }

  update(actor: CurrentActor, id: string, input: UpdateUserDto) {
    if (input.status && input.status !== 'active')
      throw new BadRequestException('Use the protected disable action');
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
        data: { ...input, email: input.email?.trim().toLowerCase() },
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

  disable(actor: CurrentActor, id: string) {
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
        throw new ForbiddenException(
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
      return after;
    });
  }

  async getMembership(actor: CurrentActor, userId: string) {
    return this.requireMembership(this.prisma, actor.organizationId, userId);
  }

  updateMembership(
    actor: CurrentActor,
    userId: string,
    input: UpdateMembershipDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const before = await this.requireMembership(
          tx,
          actor.organizationId,
          userId,
        );
        if (
          input.status === 'disabled' &&
          before.status === 'active' &&
          (await this.isLastActiveAdmin(tx, actor.organizationId, userId))
        )
          throw new ForbiddenException(
            'The final active system administrator membership cannot be disabled',
          );
        const after = await tx.organizationMembership.update({
          where: {
            organizationId_userId: {
              organizationId: actor.organizationId,
              userId,
            },
          },
          data: { status: input.status },
        });
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

  setDepartments(
    actor: CurrentActor,
    userId: string,
    input: SetUserDepartmentsDto,
  ) {
    if (input.departments.filter(({ isPrimary }) => isPrimary).length > 1)
      throw new BadRequestException('Only one primary department is allowed');
    const ids = input.departments.map(({ departmentId }) => departmentId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Duplicate department assignment');
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
        await tx.departmentMembership.deleteMany({
          where: { organizationId: actor.organizationId, userId },
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

  setRoles(actor: CurrentActor, userId: string, input: SetUserRolesDto) {
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
          throw new ForbiddenException(
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
          user: {
            status: 'active',
            organizationMembers: { some: { organizationId, status: 'active' } },
          },
        },
      })) === 1
    );
  }
}
