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
  ) {}

  async list(actor: CurrentActor, page: number, pageSize: number) {
    const where = { organizationId: actor.organizationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        include: { permissions: { include: { permission: true } } },
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
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  create(actor: CurrentActor, input: CreateRoleDto) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: { ...input, organizationId: actor.organizationId },
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
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!role) throw new NotFoundException('Role not found');
      if (role.code === 'system_admin')
        throw new ForbiddenException(
          'The system_admin permission set is seed-controlled',
        );
      const permissions = await tx.permission.findMany({
        where: { id: { in: input.permissionIds } },
      });
      if (permissions.length !== input.permissionIds.length)
        throw new BadRequestException('One or more permissions are invalid');
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

  archive(actor: CurrentActor, id: string) {
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
