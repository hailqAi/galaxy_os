import {
  BadRequestException,
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
  UpdateUserDto,
} from './users.dto';

const userInclude = (organizationId: string) =>
  ({
    organizationMembers: { where: { organizationId } },
    departmentMembers: {
      where: { organizationId },
      include: { department: true },
    },
    roles: { where: { organizationId }, include: { role: true } },
  }) satisfies Prisma.UserInclude;

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
        include: userInclude(actor.organizationId),
        orderBy: { displayName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(actor: CurrentActor, id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        organizationMembers: { some: { organizationId: actor.organizationId } },
      },
      include: userInclude(actor.organizationId),
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  create(actor: CurrentActor, input: CreateUserDto) {
    const email = input.email.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { ...input, email } });
      await tx.organizationMembership.create({
        data: { organizationId: actor.organizationId, userId: user.id },
      });
      await this.audit.write(tx, actor, {
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        afterData: user,
      });
      return user;
    });
  }

  update(actor: CurrentActor, id: string, input: UpdateUserDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: {
          id,
          organizationMembers: {
            some: { organizationId: actor.organizationId },
          },
        },
      });
      if (!before) throw new NotFoundException('User not found');
      const after = await tx.user.update({
        where: { id },
        data: { ...input, email: input.email?.trim().toLowerCase() },
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
      });
      if (!before) throw new NotFoundException('User not found');
      if (await this.isLastActiveAdmin(tx, actor.organizationId, id))
        throw new ForbiddenException(
          'The final active system administrator cannot be disabled',
        );
      const after = await tx.user.update({
        where: { id },
        data: { status: 'disabled' },
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
      await this.audit.write(tx, actor, {
        action: 'user.disable',
        entityType: 'User',
        entityId: id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
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
        await this.requireMembership(tx, actor.organizationId, userId);
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
        await this.audit.write(tx, actor, {
          action: 'user.departments.update',
          entityType: 'User',
          entityId: userId,
          beforeData: before,
          afterData: input.departments,
        });
        return tx.departmentMembership.findMany({
          where: { organizationId: actor.organizationId, userId },
          include: { department: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  setRoles(actor: CurrentActor, userId: string, input: SetUserRolesDto) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.requireMembership(tx, actor.organizationId, userId);
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
  ) {
    const membership = await tx.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) throw new NotFoundException('User membership not found');
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
