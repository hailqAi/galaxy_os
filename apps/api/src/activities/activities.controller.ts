import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { ActivitiesQuery } from './activities.dto';

@Controller('activities')
export class ActivitiesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly entities: BusinessEntityPolicy,
  ) {}

  @Get()
  @RequirePermission('activity.read')
  async list(@Actor() actor: CurrentActor, @Query() query: ActivitiesQuery) {
    await this.entities.assertView(actor, query.entityType, query.entityId);
    const where = {
      organizationId: actor.organizationId,
      entityType: query.entityType,
      entityId: query.entityId,
      event: query.eventType,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        include: { actor: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
}
