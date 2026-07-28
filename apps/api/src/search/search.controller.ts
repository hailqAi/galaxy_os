import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { SearchQuery } from './search.dto';

@Controller('search')
export class SearchController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly entities: BusinessEntityPolicy,
  ) {}

  @Get()
  @RequirePermission('search.read')
  async search(@Actor() actor: CurrentActor, @Query() query: SearchQuery) {
    const selected = new Set(
      query.entityTypes ?? [
        'Customer',
        'Contact',
        'Lead',
        'Opportunity',
        'Project',
        'Task',
        'File',
      ],
    );
    const skip = (query.page - 1) * query.pageSize;
    const contains = { contains: query.q.trim(), mode: 'insensitive' as const };
    const groups: {
      entityType: string;
      total: number;
      items: { id: string; title: string; subtitle?: string; href: string }[];
    }[] = [];
    if (
      selected.has('Customer') &&
      actor.permissions.includes('crm.customer.read')
    ) {
      const where = {
        organizationId: actor.organizationId,
        deletedAt: null,
        OR: [
          { displayName: contains },
          { phone: contains },
          { email: contains },
        ],
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.customer.findMany({
          where,
          select: { id: true, displayName: true, type: true },
          skip,
          take: query.pageSize,
        }),
        this.prisma.customer.count({ where }),
      ]);
      groups.push({
        entityType: 'Customer',
        total,
        items: items.map((item) => ({
          id: item.id,
          title: item.displayName,
          subtitle: item.type,
          href: `/customers/${item.id}`,
        })),
      });
    }
    if (
      selected.has('Contact') &&
      actor.permissions.includes('crm.contact.read')
    ) {
      const where = {
        organizationId: actor.organizationId,
        deletedAt: null,
        OR: [
          { displayName: contains },
          { phone: contains },
          { email: contains },
        ],
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.contact.findMany({
          where,
          select: {
            id: true,
            displayName: true,
            customerId: true,
            customer: { select: { displayName: true } },
          },
          skip,
          take: query.pageSize,
        }),
        this.prisma.contact.count({ where }),
      ]);
      groups.push({
        entityType: 'Contact',
        total,
        items: items.map((item) => ({
          id: item.id,
          title: item.displayName,
          subtitle: item.customer.displayName,
          href: `/customers/${item.customerId}`,
        })),
      });
    }
    await this.addScopedGroups(
      groups,
      actor,
      selected,
      contains,
      skip,
      query.pageSize,
    );
    if (selected.has('File') && actor.permissions.includes('file.read')) {
      const candidates = await this.prisma.fileAsset.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          originalFilename: contains,
        },
        include: { attachments: true },
        orderBy: { createdAt: 'desc' },
        take: Math.min(query.pageSize * 5, 100),
      });
      const visible = [];
      for (const file of candidates) {
        const attachment = file.attachments[0];
        if (!attachment) continue;
        try {
          await this.entities.assertView(
            actor,
            attachment.entityType,
            attachment.entityId,
          );
          visible.push(file);
        } catch {
          continue;
        }
        if (visible.length === query.pageSize) break;
      }
      groups.push({
        entityType: 'File',
        total: visible.length,
        items: visible.map((item) => ({
          id: item.id,
          title: item.originalFilename,
          subtitle: item.category,
          href: `/files`,
        })),
      });
    }
    return { groups, query: query.q.trim(), page: query.page };
  }

  private async addScopedGroups(
    groups: {
      entityType: string;
      total: number;
      items: { id: string; title: string; subtitle?: string; href: string }[];
    }[],
    actor: CurrentActor,
    selected: Set<string>,
    contains: { contains: string; mode: 'insensitive' },
    skip: number,
    take: number,
  ) {
    const definitions: {
      type: string;
      permission: string;
      href: string;
      items: Promise<
        { id: string; name?: string; title?: string; code?: string }[]
      >;
      total: Promise<number>;
    }[] = [
      {
        type: 'Lead',
        permission: 'crm.lead.read',
        href: '/crm/leads',
        items: this.prisma.lead.findMany({
          where: { ...this.entities.leadWhere(actor), name: contains },
          select: { id: true, name: true },
          skip,
          take,
        }),
        total: this.prisma.lead.count({
          where: { ...this.entities.leadWhere(actor), name: contains },
        }),
      },
      {
        type: 'Opportunity',
        permission: 'crm.opportunity.read',
        href: '/crm/opportunities',
        items: this.prisma.opportunity.findMany({
          where: { ...this.entities.opportunityWhere(actor), name: contains },
          select: { id: true, name: true },
          skip,
          take,
        }),
        total: this.prisma.opportunity.count({
          where: { ...this.entities.opportunityWhere(actor), name: contains },
        }),
      },
      {
        type: 'Project',
        permission: 'project.read',
        href: '/projects',
        items: this.prisma.project.findMany({
          where: {
            ...this.entities.projectWhere(actor),
            OR: [{ name: contains }, { code: contains }],
          },
          select: { id: true, name: true, code: true },
          skip,
          take,
        }),
        total: this.prisma.project.count({
          where: {
            ...this.entities.projectWhere(actor),
            OR: [{ name: contains }, { code: contains }],
          },
        }),
      },
      {
        type: 'Task',
        permission: 'task.read',
        href: '/tasks',
        items: this.prisma.task.findMany({
          where: { ...this.entities.taskWhere(actor), title: contains },
          select: { id: true, title: true },
          skip,
          take,
        }),
        total: this.prisma.task.count({
          where: { ...this.entities.taskWhere(actor), title: contains },
        }),
      },
    ];
    for (const definition of definitions) {
      if (
        !selected.has(definition.type) ||
        !actor.permissions.includes(definition.permission)
      )
        continue;
      const [items, total] = await Promise.all([
        definition.items,
        definition.total,
      ]);
      groups.push({
        entityType: definition.type,
        total,
        items: items.map((item) => ({
          id: item.id,
          title: item.name ?? item.title ?? item.code ?? '',
          subtitle: item.code ?? undefined,
          href: `${definition.href}/${item.id}`,
        })),
      });
    }
  }
}
