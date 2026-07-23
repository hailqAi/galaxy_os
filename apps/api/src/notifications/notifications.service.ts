import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { NotificationsQuery } from './notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly entities: BusinessEntityPolicy,
  ) {}

  async list(actor: CurrentActor, query: NotificationsQuery) {
    const where: Prisma.NotificationWhereInput = {
      organizationId: actor.organizationId,
      recipientId: actor.userId,
      archivedAt: null,
      readAt: query.unreadOnly ? null : undefined,
      type: query.type,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: { actor: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items: await Promise.all(
        items.map(async (item) => ({
          ...item,
          href: (await this.canOpen(actor, item.entityType, item.entityId))
            ? item.href
            : null,
        })),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  unreadCount(actor: CurrentActor) {
    return this.prisma.notification
      .count({
        where: {
          organizationId: actor.organizationId,
          recipientId: actor.userId,
          archivedAt: null,
          readAt: null,
        },
      })
      .then((count) => ({ count }));
  }

  markRead(actor: CurrentActor, id: string, read: boolean) {
    return this.updateOwned(actor, id, { readAt: read ? new Date() : null });
  }

  async readAll(actor: CurrentActor) {
    const result = await this.prisma.notification.updateMany({
      where: {
        organizationId: actor.organizationId,
        recipientId: actor.userId,
        archivedAt: null,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  archive(actor: CurrentActor, id: string) {
    return this.updateOwned(actor, id, { archivedAt: new Date() });
  }

  private async updateOwned(
    actor: CurrentActor,
    id: string,
    data: Prisma.NotificationUpdateInput,
  ) {
    const item = await this.prisma.notification.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        recipientId: actor.userId,
      },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data });
  }

  private async canOpen(
    actor: CurrentActor,
    entityType: string | null,
    entityId: string | null,
  ) {
    if (!entityType || !entityId) return false;
    try {
      await this.entities.assertView(actor, entityType, entityId);
      return true;
    } catch {
      return false;
    }
  }
}
