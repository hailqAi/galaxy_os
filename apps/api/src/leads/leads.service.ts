import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import {
  AssignLeadDto,
  ChangeLeadStatusDto,
  CreateLeadDto,
  UpdateLeadDto,
} from './leads.dto';

@Injectable()
export class LeadsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private visibleWhere(actor: CurrentActor): Prisma.LeadWhereInput {
    const scope = actor.administrationScope;
    const access = ['SYSTEM', 'ORGANIZATION'].includes(scope)
      ? {}
      : scope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { ownerId: actor.userId },
              { departmentId: { in: actor.managedDepartmentIds } },
            ],
          }
        : { ownerId: actor.userId };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }

  async list(
    actor: CurrentActor,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      status?: LeadStatus;
      sourceId?: string;
      ownerId?: string;
      departmentId?: string;
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
      from?: Date;
      to?: Date;
      expectedFrom?: Date;
      expectedTo?: Date;
      sort?:
        | 'name'
        | 'updatedAt'
        | 'createdAt'
        | 'expectedCloseDate'
        | 'estimatedValue';
      direction?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.LeadWhereInput = {
      AND: [
        this.visibleWhere(actor),
        query.search
          ? {
              OR: ['name', 'companyName', 'contactName', 'phone', 'email'].map(
                (field) => ({
                  [field]: { contains: query.search, mode: 'insensitive' },
                }),
              ),
            }
          : {},
      ],
      status: query.status,
      sourceId: query.sourceId,
      ownerId: query.ownerId,
      departmentId: query.departmentId,
      priority: query.priority,
      createdAt:
        query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
      expectedCloseDate:
        query.expectedFrom || query.expectedTo
          ? { gte: query.expectedFrom, lte: query.expectedTo }
          : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: this.include(),
        orderBy: { [query.sort ?? 'updatedAt']: query.direction ?? 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  sources(actor: CurrentActor) {
    return this.prisma.leadSource.findMany({
      where: { organizationId: actor.organizationId, status: 'active' },
      orderBy: { name: 'asc' },
    });
  }

  async get(actor: CurrentActor, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { ...this.visibleWhere(actor), id },
      include: {
        ...this.include(),
        opportunity: { select: { id: true, name: true, stage: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    const activity = await this.prisma.activity.findMany({
      where: {
        organizationId: actor.organizationId,
        entityType: 'Lead',
        entityId: id,
      },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { ...lead, activity };
  }

  async create(actor: CurrentActor, data: CreateLeadDto) {
    await this.assertReferences(actor, data);
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
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
          event: 'LEAD_CREATED',
          entityType: 'Lead',
          entityId: lead.id,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'LEAD_CREATED',
        entityType: 'Lead',
        entityId: lead.id,
        afterData: lead,
      });
      return lead;
    });
  }

  async update(actor: CurrentActor, id: string, data: UpdateLeadDto) {
    const before = await this.mutable(actor, id);
    await this.assertReferences(actor, data);
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
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
      await this.audit.write(tx, actor, {
        action: 'LEAD_UPDATED',
        entityType: 'Lead',
        entityId: id,
        beforeData: before,
        afterData: lead,
      });
      return lead;
    });
  }

  async remove(actor: CurrentActor, id: string) {
    await this.mutable(actor, id);
    return this.prisma.lead.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
  }

  async assign(actor: CurrentActor, id: string, data: AssignLeadDto) {
    const lead = await this.mutable(actor, id);
    await this.assertAssignableUser(
      actor,
      data.ownerId,
      data.departmentId ?? lead.departmentId ?? undefined,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          ownerId: data.ownerId,
          departmentId: data.departmentId,
          status: lead.status === 'NEW' ? 'ASSIGNED' : undefined,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
        include: this.include(),
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'LEAD_ASSIGNED',
          entityType: 'Lead',
          entityId: id,
          metadata: { ownerId: data.ownerId },
        },
      });
      await tx.notification.create({
        data: {
          organizationId: actor.organizationId,
          recipientId: data.ownerId,
          type: 'LEAD_ASSIGNED',
          title: `Bạn được giao Lead ${lead.name}`,
          entityType: 'Lead',
          entityId: id,
          href: `/crm/leads/${id}`,
        },
      });
      return updated;
    });
  }

  async changeStatus(
    actor: CurrentActor,
    id: string,
    data: ChangeLeadStatusDto,
  ) {
    const lead = await this.mutable(actor, id);
    if (data.status === 'ASSIGNED' && !lead.ownerId)
      throw new UnprocessableEntityException(
        'Assign an owner before using ASSIGNED status',
      );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          status: data.status,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
        include: this.include(),
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'LEAD_STATUS_CHANGED',
          entityType: 'Lead',
          entityId: id,
          metadata: { from: lead.status, to: data.status },
        },
      });
      return updated;
    });
  }

  qualify(actor: CurrentActor, id: string) {
    return this.changeStatus(actor, id, { status: 'QUALIFIED' });
  }
  disqualify(actor: CurrentActor, id: string) {
    return this.changeStatus(actor, id, { status: 'UNQUALIFIED' });
  }

  async convert(actor: CurrentActor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { ...this.visibleWhere(actor), id },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      if (
        lead.status === 'CONVERTED' ||
        (await tx.opportunity.findUnique({ where: { leadId: id } }))
      )
        throw new ConflictException('Lead has already been converted');
      if (lead.status === 'ARCHIVED')
        throw new ConflictException('Archived Lead cannot be converted');
      const opportunity = await tx.opportunity.create({
        data: {
          organizationId: actor.organizationId,
          leadId: id,
          name: lead.name,
          ownerId: lead.ownerId,
          departmentId: lead.departmentId,
          estimatedValue: lead.estimatedValue,
          currency: lead.currency,
          expectedCloseDate: lead.expectedCloseDate,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await tx.lead.update({
        where: { id },
        data: {
          status: 'CONVERTED',
          convertedAt: new Date(),
          convertedBy: actor.userId,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'LEAD_CONVERTED',
          entityType: 'Lead',
          entityId: id,
          metadata: { opportunityId: opportunity.id },
        },
      });
      return { leadId: id, opportunityId: opportunity.id };
    });
  }

  private async mutable(actor: CurrentActor, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { ...this.visibleWhere(actor), id },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (['CONVERTED', 'ARCHIVED'].includes(lead.status))
      throw new ConflictException(`${lead.status} Lead cannot be changed`);
    return lead;
  }

  private async assertReferences(
    actor: CurrentActor,
    data: {
      sourceId?: string;
      campaignId?: string;
      contentItemId?: string;
      ownerId?: string;
      departmentId?: string;
    },
  ) {
    if (
      data.sourceId &&
      !(await this.prisma.leadSource.findFirst({
        where: {
          id: data.sourceId,
          organizationId: actor.organizationId,
          status: 'active',
        },
      }))
    )
      throw new NotFoundException('Lead source not found');
    if (
      data.campaignId &&
      !(await this.prisma.campaign.findFirst({
        where: { id: data.campaignId, organizationId: actor.organizationId },
      }))
    )
      throw new NotFoundException('Campaign not found');
    if (
      data.contentItemId &&
      !(await this.prisma.contentItem.findFirst({
        where: {
          id: data.contentItemId,
          organizationId: actor.organizationId,
          campaignId: data.campaignId,
        },
      }))
    )
      throw new NotFoundException('Marketing content not found');
    if (data.ownerId)
      await this.assertAssignableUser(actor, data.ownerId, data.departmentId);
    if (
      data.departmentId &&
      !['SYSTEM', 'ORGANIZATION'].includes(actor.administrationScope) &&
      !actor.managedDepartmentIds.includes(data.departmentId)
    )
      throw new ForbiddenException('Department is outside assignment scope');
  }

  private async assertAssignableUser(
    actor: CurrentActor,
    userId: string,
    departmentId?: string,
  ) {
    if (
      departmentId &&
      !['SYSTEM', 'ORGANIZATION'].includes(actor.administrationScope) &&
      !actor.managedDepartmentIds.includes(departmentId)
    )
      throw new ForbiddenException(
        'Cross-department assignment is not allowed',
      );
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: 'active',
        organizationMembers: {
          some: { organizationId: actor.organizationId, status: 'active' },
        },
        departmentMembers: departmentId
          ? { some: { organizationId: actor.organizationId, departmentId } }
          : undefined,
      },
    });
    if (!user) throw new NotFoundException('Assignable user not found');
  }

  private include() {
    return {
      source: true,
      owner: { select: { id: true, displayName: true } },
      department: { select: { id: true, name: true } },
    } as const;
  }
}
