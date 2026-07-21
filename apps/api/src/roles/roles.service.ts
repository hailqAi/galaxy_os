import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { UserManagementPolicy } from '../access-control/user-management.policy';
import {
  CreateRoleDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './roles.dto';

@Injectable()
export class RolesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(UserManagementPolicy) private readonly policy: UserManagementPolicy,
  ) {}

  async list(actor: CurrentActor, page: number, pageSize: number) {
    const where = { organizationId: actor.organizationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        include: {
          permissions: { include: { permission: true } },
          users: {
            include: {
              user: { select: { id: true, displayName: true, email: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.role.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(actor: CurrentActor, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        permissions: { include: { permission: true } },
        users: {
          include: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  create(actor: CurrentActor, input: CreateRoleDto) {
    this.policy.requireOrganizationScope(actor);
    if (
      (input.isSystem ||
        input.isProtected ||
        input.maximumScope === 'SYSTEM' ||
        input.category === 'SYSTEM') &&
      actor.administrationScope !== 'SYSTEM'
    )
      throw new ForbiddenException(
        'Only a System Administrator may create protected system roles',
      );
    if ((input.administrationTier ?? 0) >= actor.administrationTier)
      throw new ForbiddenException('Role exceeds the actor delegation ceiling');
    this.assertScopeCeiling(actor, input.maximumScope ?? 'DEPARTMENT');
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          ...input,
          organizationId: actor.organizationId,
          createdByUserId: actor.userId,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'role.create',
        entityType: 'Role',
        entityId: role.id,
        afterData: role,
      });
      return role;
    });
  }

  update(actor: CurrentActor, id: string, data: UpdateRoleDto) {
    this.policy.requireOrganizationScope(actor);
    if ((data.administrationTier ?? 0) >= actor.administrationTier)
      throw new ForbiddenException('Role exceeds the actor delegation ceiling');
    if (data.maximumScope) this.assertScopeCeiling(actor, data.maximumScope);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.role.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!before) throw new NotFoundException('Role not found');
      if (before.isSystem && data.code && data.code !== before.code)
        throw new ForbiddenException('System role codes cannot be renamed');
      const after = await tx.role.update({ where: { id }, data });
      await this.audit.write(tx, actor, {
        action: 'role.update',
        entityType: 'Role',
        entityId: id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }

  setPermissions(
    actor: CurrentActor,
    id: string,
    input: SetRolePermissionsDto,
  ) {
    this.policy.requireOrganizationScope(actor);
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!role) throw new NotFoundException('Role not found');
      if (role.code === 'system_admin')
        throw new ForbiddenException(
          'The system_admin permission set is seed-controlled',
        );
      if (
        role.isProtected ||
        role.administrationTier >= actor.administrationTier
      )
        throw new ForbiddenException(
          'Protected or equal-authority role cannot be changed',
        );
      const permissions = await tx.permission.findMany({
        where: { id: { in: input.permissionIds } },
      });
      if (permissions.length !== input.permissionIds.length)
        throw new BadRequestException('One or more permissions are invalid');
      if (
        permissions.some(
          ({ code, isDelegable }) =>
            !isDelegable || !actor.permissions.includes(code),
        )
      )
        throw new ForbiddenException(
          'Cannot delegate a permission the actor does not hold',
        );
      const before = await tx.rolePermission.findMany({
        where: { roleId: id },
        select: { permissionId: true },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: input.permissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
        })),
      });
      const beforeIds = before.map(({ permissionId }) => permissionId);
      for (const permissionId of input.permissionIds.filter(
        (value) => !beforeIds.includes(value),
      )) {
        await this.audit.write(tx, actor, {
          action: 'role.permission.assign',
          entityType: 'Role',
          entityId: id,
          metadata: { permissionId },
        });
      }
      for (const permissionId of beforeIds.filter(
        (value) => !input.permissionIds.includes(value),
      )) {
        await this.audit.write(tx, actor, {
          action: 'role.permission.remove',
          entityType: 'Role',
          entityId: id,
          metadata: { permissionId },
        });
      }
      return tx.role.findUnique({
        where: { id },
        include: { permissions: { include: { permission: true } } },
      });
    });
  }

  async clone(actor: CurrentActor, id: string, input: CreateRoleDto) {
    const source = await this.get(actor, id);
    const created = await this.create(actor, input);
    const permissionIds = source.permissions.map(
      ({ permissionId }) => permissionId,
    );
    if (permissionIds.length)
      await this.setPermissions(actor, created.id, { permissionIds });
    return this.get(actor, created.id);
  }

  private assertScopeCeiling(
    actor: CurrentActor,
    scope: 'SYSTEM' | 'ORGANIZATION' | 'DEPARTMENT' | 'SELF',
  ) {
    const rank = {
      SELF: 0,
      DEPARTMENT: 1,
      ORGANIZATION: 2,
      SYSTEM: 3,
    } as const;
    const actorScope =
      actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? 'DEPARTMENT'
        : actor.administrationScope;
    if (rank[scope] > rank[actorScope])
      throw new ForbiddenException(
        'Role scope exceeds the actor delegation ceiling',
      );
  }

  archive(actor: CurrentActor, id: string) {
    this.policy.requireOrganizationScope(actor);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.role.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!before) throw new NotFoundException('Role not found');
      if (before.isSystem || before.code === 'system_admin')
        throw new ForbiddenException('System roles cannot be archived');
      const after = await tx.role.update({
        where: { id },
        data: { status: 'archived' },
      });
      await this.audit.write(tx, actor, {
        action: 'role.archive',
        entityType: 'Role',
        entityId: id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }
}
