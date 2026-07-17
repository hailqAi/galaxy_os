import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
    const where = { organizationId: actor.organizationId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.department.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.department.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!item) throw new NotFoundException('Department not found');
    return item;
  }

  create(actor: CurrentActor, input: CreateDepartmentDto) {
    return this.prisma.$transaction(async (tx) => {
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
}
