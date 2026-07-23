import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import {
  ChangeStageDto,
  CreateOpportunityDto,
  UpdateOpportunityDto,
} from './opportunities.dto';

const stages: OpportunityStage[] = [
  'DISCOVERY',
  'QUALIFICATION',
  'SURVEY',
  'REQUIREMENT',
  'DESIGN_PREPARATION',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
];

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private visibleWhere(actor: CurrentActor): Prisma.OpportunityWhereInput {
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
  private include() {
    return {
      customer: { select: { id: true, displayName: true } },
      primaryContact: { select: { id: true, displayName: true } },
      owner: { select: { id: true, displayName: true } },
      department: { select: { id: true, name: true } },
      project: { select: { id: true, code: true } },
    } as const;
  }
  async list(
    actor: CurrentActor,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      stage?: OpportunityStage;
      ownerId?: string;
      departmentId?: string;
      customerId?: string;
      closeFrom?: Date;
      closeTo?: Date;
      valueMin?: number;
      valueMax?: number;
      sort?: 'name' | 'updatedAt' | 'expectedCloseDate' | 'estimatedValue';
      direction?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.OpportunityWhereInput = {
      AND: [
        this.visibleWhere(actor),
        query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {},
      ],
      stage: query.stage,
      ownerId: query.ownerId,
      departmentId: query.departmentId,
      customerId: query.customerId,
      expectedCloseDate:
        query.closeFrom || query.closeTo
          ? { gte: query.closeFrom, lte: query.closeTo }
          : undefined,
      estimatedValue:
        query.valueMin !== undefined || query.valueMax !== undefined
          ? { gte: query.valueMin, lte: query.valueMax }
          : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.opportunity.findMany({
        where,
        include: this.include(),
        orderBy: { [query.sort ?? 'updatedAt']: query.direction ?? 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.opportunity.findFirst({
      where: { ...this.visibleWhere(actor), id },
      include: { ...this.include(), lead: true },
    });
    if (!item) throw new NotFoundException('Opportunity not found');
    const activity = await this.prisma.activity.findMany({
      where: {
        organizationId: actor.organizationId,
        entityType: 'Opportunity',
        entityId: id,
      },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { ...item, activity };
  }
  async create(actor: CurrentActor, data: CreateOpportunityDto) {
    await this.references(actor, data);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.opportunity.create({
        data: {
          ...data,
          expectedCloseDate: data.expectedCloseDate
            ? new Date(data.expectedCloseDate)
            : undefined,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        include: this.include(),
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'OPPORTUNITY_CREATED',
          entityType: 'Opportunity',
          entityId: item.id,
        },
      });
      return item;
    });
  }
  async update(actor: CurrentActor, id: string, data: UpdateOpportunityDto) {
    await this.mutable(actor, id);
    await this.references(actor, data);
    return this.prisma.opportunity.update({
      where: { id },
      data: {
        ...data,
        expectedCloseDate: data.expectedCloseDate
          ? new Date(data.expectedCloseDate)
          : undefined,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      include: this.include(),
    });
  }
  async remove(actor: CurrentActor, id: string) {
    await this.mutable(actor, id);
    return this.prisma.opportunity.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
  }
  async changeStage(actor: CurrentActor, id: string, data: ChangeStageDto) {
    const before = await this.mutable(actor, id);
    const from = stages.indexOf(before.stage);
    const to = stages.indexOf(data.stage);
    if (data.stage === 'LOST' && !data.lostReason?.trim())
      throw new UnprocessableEntityException('lostReason is required');
    if (!['WON', 'LOST'].includes(data.stage) && to !== from + 1)
      throw new UnprocessableEntityException('Invalid stage transition');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.opportunity.update({
        where: { id },
        data: {
          stage: data.stage,
          probability:
            data.stage === 'WON' ? 100 : data.stage === 'LOST' ? 0 : undefined,
          wonAt: data.stage === 'WON' ? new Date() : undefined,
          lostAt: data.stage === 'LOST' ? new Date() : undefined,
          lostReason: data.stage === 'LOST' ? data.lostReason : undefined,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
        include: this.include(),
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'OPPORTUNITY_STAGE_CHANGED',
          entityType: 'Opportunity',
          entityId: id,
          metadata: { from: before.stage, to: data.stage },
        },
      });
      return item;
    });
  }
  markWon(actor: CurrentActor, id: string) {
    return this.changeStage(actor, id, { stage: 'WON' });
  }
  markLost(actor: CurrentActor, id: string, lostReason: string) {
    return this.changeStage(actor, id, { stage: 'LOST', lostReason });
  }
  async createProject(actor: CurrentActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.findFirst({
        where: { ...this.visibleWhere(actor), id },
        include: { lead: true, project: true },
      });
      if (!opportunity) throw new NotFoundException('Opportunity not found');
      if (opportunity.project)
        return {
          opportunityId: id,
          customerId: opportunity.customerId,
          contactId: opportunity.primaryContactId ?? undefined,
          projectId: opportunity.project.id,
          alreadyConverted: true,
        };
      let customerId = opportunity.customerId;
      if (!customerId) {
        const duplicate = opportunity.lead
          ? await tx.customer.findFirst({
              where: {
                organizationId: actor.organizationId,
                deletedAt: null,
                OR: [
                  { email: opportunity.lead.email },
                  { phone: opportunity.lead.phone },
                ].filter((entry) => Object.values(entry)[0]),
              },
            })
          : null;
        const customer =
          duplicate ??
          (await tx.customer.create({
            data: {
              organizationId: actor.organizationId,
              type: opportunity.lead?.companyName ? 'COMPANY' : 'INDIVIDUAL',
              displayName:
                opportunity.lead?.companyName ??
                opportunity.lead?.contactName ??
                opportunity.name,
              phone: opportunity.lead?.phone,
              email: opportunity.lead?.email,
              ownerId: opportunity.ownerId,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          }));
        customerId = customer.id;
      }
      let contactId = opportunity.primaryContactId;
      if (!contactId && opportunity.lead?.contactName) {
        const contact =
          (await tx.contact.findFirst({
            where: {
              organizationId: actor.organizationId,
              customerId,
              deletedAt: null,
              OR: [
                { email: opportunity.lead.email },
                { phone: opportunity.lead.phone },
              ].filter((entry) => Object.values(entry)[0]),
            },
          })) ??
          (await tx.contact.create({
            data: {
              organizationId: actor.organizationId,
              customerId,
              firstName: opportunity.lead.contactName,
              displayName: opportunity.lead.contactName,
              phone: opportunity.lead.phone,
              email: opportunity.lead.email,
              isPrimary: true,
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          }));
        contactId = contact.id;
      }
      const project = await tx.project.create({
        data: {
          organizationId: actor.organizationId,
          opportunityId: id,
          code: `PRJ-${id.slice(0, 8).toUpperCase()}`,
          name: opportunity.name,
          customerId,
          primaryContactId: contactId,
          projectOwnerId: opportunity.ownerId,
          salesOwnerId: opportunity.ownerId,
          projectManagerId: opportunity.ownerId,
          estimatedValue: opportunity.estimatedValue,
          currency: opportunity.currency,
          status: 'ACTIVE',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (opportunity.ownerId)
        await tx.projectMember.create({
          data: {
            organizationId: actor.organizationId,
            projectId: project.id,
            userId: opportunity.ownerId,
            role: 'OWNER',
            createdBy: actor.userId,
          },
        });
      if (opportunity.departmentId)
        await tx.projectDepartment.create({
          data: {
            organizationId: actor.organizationId,
            projectId: project.id,
            departmentId: opportunity.departmentId,
            createdBy: actor.userId,
          },
        });
      await tx.opportunity.update({
        where: { id },
        data: {
          customerId,
          primaryContactId: contactId,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_CREATED',
          entityType: 'Opportunity',
          entityId: id,
          metadata: { projectId: project.id },
        },
      });
      if (opportunity.ownerId)
        await tx.notification.create({
          data: {
            organizationId: actor.organizationId,
            recipientId: opportunity.ownerId,
            type: 'PROJECT_CREATED',
            title: `Dự án ${project.name} đã được tạo`,
            entityType: 'Project',
            entityId: project.id,
            href: `/projects/${project.id}`,
          },
        });
      return {
        opportunityId: id,
        customerId,
        contactId: contactId ?? undefined,
        projectId: project.id,
        alreadyConverted: false,
      };
    });
  }
  private async mutable(actor: CurrentActor, id: string) {
    const item = await this.prisma.opportunity.findFirst({
      where: { ...this.visibleWhere(actor), id },
    });
    if (!item) throw new NotFoundException('Opportunity not found');
    if (['WON', 'LOST'].includes(item.stage))
      throw new ConflictException('Closed Opportunity cannot be changed');
    return item;
  }
  private async references(
    actor: CurrentActor,
    data: {
      leadId?: string;
      customerId?: string;
      primaryContactId?: string;
      ownerId?: string;
      departmentId?: string;
    },
  ) {
    if (
      data.leadId &&
      !(await this.prisma.lead.findFirst({
        where: {
          id: data.leadId,
          organizationId: actor.organizationId,
          deletedAt: null,
        },
      }))
    )
      throw new NotFoundException('Lead not found');
    if (
      data.customerId &&
      !(await this.prisma.customer.findFirst({
        where: {
          id: data.customerId,
          organizationId: actor.organizationId,
          deletedAt: null,
        },
      }))
    )
      throw new NotFoundException('Customer not found');
    if (
      data.primaryContactId &&
      !(await this.prisma.contact.findFirst({
        where: {
          id: data.primaryContactId,
          organizationId: actor.organizationId,
          customerId: data.customerId,
        },
      }))
    )
      throw new NotFoundException('Contact not found');
  }
}
