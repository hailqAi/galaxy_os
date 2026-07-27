import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import {
  StorageLocationDto,
  WarehouseDto,
  WarehouseZoneDto,
} from './warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
  ) {}

  list(actor: CurrentActor, projectId?: string) {
    return this.prisma.warehouse.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        activeStatus: 'active',
        project: projectId ? this.policy.projectWhere(actor) : undefined,
      },
      include: { _count: { select: { zones: true, locations: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.warehouse.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        OR: [{ projectId: null }, { project: this.policy.projectWhere(actor) }],
      },
      include: {
        zones: { orderBy: { code: 'asc' } },
        locations: { orderBy: { code: 'asc' } },
      },
    });
    if (!item) throw new NotFoundException('Warehouse not found');
    return item;
  }

  async create(actor: CurrentActor, data: WarehouseDto) {
    if (data.projectId)
      await this.policy.assertView(actor, 'Project', data.projectId);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.warehouse.create({
        data: {
          ...data,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'WAREHOUSE_CREATED',
          entityType: 'Warehouse',
          entityId: item.id,
        },
      });
      return item;
    });
  }

  async addZone(actor: CurrentActor, id: string, data: WarehouseZoneDto) {
    await this.get(actor, id);
    return this.prisma.warehouseZone.create({
      data: { ...data, warehouseId: id },
    });
  }

  async addLocation(actor: CurrentActor, id: string, data: StorageLocationDto) {
    await this.get(actor, id);
    if (data.zoneId) {
      const zone = await this.prisma.warehouseZone.findFirst({
        where: { id: data.zoneId, warehouseId: id },
      });
      if (!zone) throw new NotFoundException('Warehouse zone not found');
    }
    if (data.parentLocationId) {
      const parent = await this.prisma.storageLocation.findFirst({
        where: { id: data.parentLocationId, warehouseId: id },
      });
      if (!parent) throw new NotFoundException('Parent location not found');
    }
    return this.prisma.storageLocation.create({
      data: {
        ...data,
        warehouseId: id,
        capacity: data.capacity ? new Prisma.Decimal(data.capacity) : undefined,
      },
    });
  }
}
