import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './departments.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(actor: CurrentActor, page: number, pageSize: number) {
    const where = {
      organizationId: actor.organizationId,
      id:
        actor.administrationScope === 'MANAGED_DEPARTMENTS'
          ? { in: actor.managedDepartmentIds }
          : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        include: {
          manager: {
            select: {
              user: { select: { id: true, displayName: true, email: true } },
            },
          },
          _count: { select: { members: true, children: true } },
        },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.department.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.department.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        ...(actor.administrationScope === 'MANAGED_DEPARTMENTS' && {
          id: { in: actor.managedDepartmentIds },
        }),
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
        _count: { select: { members: true } },
        children: { orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] },
        manager: {
          select: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Department not found');
    return item;
  }

  create(actor: CurrentActor, input: CreateDepartmentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.validateRelations(
        tx,
        actor.organizationId,
        input.parentId,
        input.managerMembershipId,
      );
      const item = await tx.department.create({
        data: {
          ...input,
          code: input.code.trim().toUpperCase(),
          organizationId: actor.organizationId,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'department.create',
        entityType: 'Department',
        entityId: item.id,
        afterData: item,
      });
      return item;
    });
  }

  update(actor: CurrentActor, id: string, data: UpdateDepartmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.department.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!before) throw new NotFoundException('Department not found');
      await this.validateRelations(
        tx,
        actor.organizationId,
        data.parentId,
        data.managerMembershipId,
      );
      if (data.parentId) {
        let parentId: string | null = data.parentId;
        while (parentId) {
          if (parentId === id)
            throw new BadRequestException(
              'Organizational hierarchy cycle is not allowed',
            );
          parentId =
            (
              await tx.department.findUnique({
                where: { id: parentId },
                select: { parentId: true },
              })
            )?.parentId ?? null;
        }
      }
      const after = await tx.department.update({ where: { id }, data });
      await this.audit.write(tx, actor, {
        action: 'department.update',
        entityType: 'Department',
        entityId: id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }

  archive(actor: CurrentActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.department.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!before) throw new NotFoundException('Department not found');
      if (
        await tx.department.count({ where: { parentId: id, status: 'active' } })
      )
        throw new ConflictException('Archive child units first');
      if (await tx.departmentMembership.count({ where: { departmentId: id } }))
        throw new ConflictException(
          'Remove active unit memberships before archiving',
        );
      const after = await tx.department.update({
        where: { id },
        data: { status: 'archived' },
      });
      await this.audit.write(tx, actor, {
        action: 'department.archive',
        entityType: 'Department',
        entityId: id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }

  private async validateRelations(
    tx: Prisma.TransactionClient,
    organizationId: string,
    parentId?: string,
    managerMembershipId?: string,
  ) {
    if (
      parentId &&
      !(await tx.department.findFirst({
        where: { id: parentId, organizationId, status: 'active' },
      }))
    )
      throw new BadRequestException(
        'Parent unit must be active in the current organization',
      );
    if (
      managerMembershipId &&
      !(await tx.organizationMembership.findFirst({
        where: { id: managerMembershipId, organizationId, status: 'active' },
      }))
    )
      throw new BadRequestException(
        'Manager must be an active organization member',
      );
  }
}
