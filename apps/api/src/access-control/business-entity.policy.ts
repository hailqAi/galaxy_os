import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CurrentActor } from './current-actor';

export const businessEntityTypes = [
  'Customer',
  'Contact',
  'Lead',
  'Opportunity',
  'Project',
  'Task',
  'Survey',
  'Requirement',
  'Comment',
  'MarketingContent',
] as const;
export type BusinessEntityType = (typeof businessEntityTypes)[number];
export type EntityContext = {
  entityType: BusinessEntityType;
  entityId: string;
  projectId?: string;
  customerId?: string;
};

@Injectable()
export class BusinessEntityPolicy {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async assertView(
    actor: CurrentActor,
    entityType: string,
    entityId: string,
  ): Promise<EntityContext> {
    if (!businessEntityTypes.includes(entityType as BusinessEntityType))
      throw new NotFoundException('Entity not found');
    const organizationId = actor.organizationId;
    switch (entityType as BusinessEntityType) {
      case 'Customer': {
        const item = await this.prisma.customer.findFirst({
          where: { id: entityId, organizationId, deletedAt: null },
          select: { id: true },
        });
        if (item)
          return { entityType: 'Customer', entityId, customerId: item.id };
        break;
      }
      case 'Contact': {
        const item = await this.prisma.contact.findFirst({
          where: { id: entityId, organizationId, deletedAt: null },
          select: { id: true, customerId: true },
        });
        if (item)
          return {
            entityType: 'Contact',
            entityId,
            customerId: item.customerId,
          };
        break;
      }
      case 'Lead': {
        const item = await this.prisma.lead.findFirst({
          where: { id: entityId, ...this.leadWhere(actor) },
          select: { id: true },
        });
        if (item) return { entityType: 'Lead', entityId };
        break;
      }
      case 'Opportunity': {
        const item = await this.prisma.opportunity.findFirst({
          where: { id: entityId, ...this.opportunityWhere(actor) },
          select: {
            id: true,
            customerId: true,
            project: { select: { id: true } },
          },
        });
        if (item)
          return {
            entityType: 'Opportunity',
            entityId,
            customerId: item.customerId ?? undefined,
            projectId: item.project?.id,
          };
        break;
      }
      case 'Project': {
        const item = await this.prisma.project.findFirst({
          where: { id: entityId, ...this.projectWhere(actor) },
          select: { id: true, customerId: true },
        });
        if (item)
          return {
            entityType: 'Project',
            entityId,
            projectId: item.id,
            customerId: item.customerId,
          };
        break;
      }
      case 'Task': {
        const item = await this.prisma.task.findFirst({
          where: { id: entityId, ...this.taskWhere(actor) },
          select: { id: true, projectId: true, customerId: true },
        });
        if (item)
          return {
            entityType: 'Task',
            entityId,
            projectId: item.projectId ?? undefined,
            customerId: item.customerId ?? undefined,
          };
        break;
      }
      case 'Survey': {
        const item = await this.prisma.survey.findFirst({
          where: {
            id: entityId,
            organizationId,
            deletedAt: null,
            project: this.projectWhere(actor),
          },
          select: {
            id: true,
            project: { select: { id: true, customerId: true } },
          },
        });
        if (item)
          return {
            entityType: 'Survey',
            entityId,
            projectId: item.project.id,
            customerId: item.project.customerId,
          };
        break;
      }
      case 'Requirement': {
        const item = await this.prisma.requirement.findFirst({
          where: {
            id: entityId,
            organizationId,
            deletedAt: null,
            project: this.projectWhere(actor),
          },
          select: {
            id: true,
            project: { select: { id: true, customerId: true } },
          },
        });
        if (item)
          return {
            entityType: 'Requirement',
            entityId,
            projectId: item.project.id,
            customerId: item.project.customerId,
          };
        break;
      }
      case 'Comment': {
        const item = await this.prisma.comment.findFirst({
          where: { id: entityId, organizationId },
          select: { entityType: true, entityId: true },
        });
        if (item) {
          const parent = await this.assertView(
            actor,
            item.entityType,
            item.entityId,
          );
          return { ...parent, entityType: 'Comment', entityId };
        }
        break;
      }
      case 'MarketingContent': {
        const item = await this.prisma.contentItem.findFirst({
          where: { id: entityId, organizationId },
          select: { id: true },
        });
        if (item) return { entityType: 'MarketingContent', entityId };
        break;
      }
    }
    throw new NotFoundException('Entity not found');
  }

  projectWhere(actor: CurrentActor): Prisma.ProjectWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { projectOwnerId: actor.userId },
              { projectManagerId: actor.userId },
              { members: { some: { userId: actor.userId } } },
              {
                departments: {
                  some: { departmentId: { in: actor.managedDepartmentIds } },
                },
              },
            ],
          }
        : {
            OR: [
              { projectOwnerId: actor.userId },
              { projectManagerId: actor.userId },
              { members: { some: { userId: actor.userId } } },
            ],
          };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
  leadWhere(actor: CurrentActor): Prisma.LeadWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { ownerId: actor.userId },
              { departmentId: { in: actor.managedDepartmentIds } },
            ],
          }
        : { ownerId: actor.userId };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
  opportunityWhere(actor: CurrentActor): Prisma.OpportunityWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { ownerId: actor.userId },
              { departmentId: { in: actor.managedDepartmentIds } },
            ],
          }
        : { ownerId: actor.userId };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
  taskWhere(actor: CurrentActor): Prisma.TaskWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { createdBy: actor.userId },
              { departmentId: { in: actor.managedDepartmentIds } },
              { assignees: { some: { userId: actor.userId } } },
              { watchers: { some: { userId: actor.userId } } },
            ],
          }
        : {
            OR: [
              { createdBy: actor.userId },
              { assignees: { some: { userId: actor.userId } } },
              { watchers: { some: { userId: actor.userId } } },
            ],
          };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
}
