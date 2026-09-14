import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { expectedMonetaryValue } from '../commercial/project-financial-calculations';
import { PrismaService } from '../prisma.service';
import {
  AllocateProjectRiskDto,
  CreateProjectRiskDto,
} from './project-risks.dto';

@Injectable()
export class ProjectRisksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private require(actor: CurrentActor, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('Insufficient permission');
  }

  private project(
    actor: CurrentActor,
    projectId: string,
    permission: string | readonly string[],
    db: Pick<Prisma.TransactionClient, 'project'> = this.prisma,
  ) {
    return db.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, permission),
      },
      select: { id: true },
    });
  }

  async list(actor: CurrentActor, projectId: string) {
    this.require(actor, 'project.read');
    if (!(await this.project(actor, projectId, 'project.read')))
      throw new NotFoundException('Project not found');
    const projectActor =
      actor.permissionSources === undefined
        ? actor
        : await this.policy.actorForProject(actor, projectId);
    const items = await this.prisma.projectRisk.findMany({
      where: { organizationId: actor.organizationId, projectId },
      include: {
        allocations: {
          select: {
            id: true,
            estimateVersionId: true,
            approvedAmount: true,
            basis: true,
            status: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { priorityScore: 'desc' }, { code: 'asc' }],
    });
    if (projectActor.permissions.includes('financial_margin.read'))
      return items;
    return items
      .filter(({ category }) => category !== 'FINANCIAL')
      .map((item) => {
        const {
          probability: hiddenProbability,
          financialImpact: hiddenFinancialImpact,
          emv: hiddenEmv,
          allocations: hiddenAllocations,
          ...visible
        } = item;
        void hiddenProbability;
        void hiddenFinancialImpact;
        void hiddenEmv;
        void hiddenAllocations;
        return visible;
      });
  }

  async create(
    actor: CurrentActor,
    projectId: string,
    input: CreateProjectRiskDto,
  ) {
    this.require(actor, 'project.update');
    const narrative = {
      code: input.code.trim().toUpperCase(),
      title: input.title.trim(),
      cause: input.cause.trim(),
      event: input.event.trim(),
      impact: input.impact.trim(),
    };
    if (Object.values(narrative).some((value) => !value))
      throw new BadRequestException('Risk narrative is required');
    const includesFinancialData =
      input.category === 'FINANCIAL' ||
      input.probability !== undefined ||
      input.financialImpact !== undefined;
    if (includesFinancialData) this.require(actor, 'financial_margin.read');
    if (
      (input.probability === undefined) !==
      (input.financialImpact === undefined)
    )
      throw new BadRequestException(
        'Probability and financial impact must be supplied together',
      );
    const emv = expectedMonetaryValue(
      input.probability ?? null,
      input.financialImpact ?? null,
    );
    return this.prisma.$transaction(async (tx) => {
      if (
        !(await this.project(
          actor,
          projectId,
          includesFinancialData
            ? ['project.update', 'financial_margin.read']
            : 'project.update',
          tx,
        ))
      )
        throw new NotFoundException('Project not found');
      if (
        !(await tx.projectMember.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId,
            userId: input.ownerId,
          },
          select: { id: true },
        }))
      )
        throw new BadRequestException('Risk owner must be a Project member');
      const item = await tx.projectRisk.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          ...input,
          ...narrative,
          probability:
            input.probability === undefined
              ? null
              : new Prisma.Decimal(input.probability),
          financialImpact:
            input.financialImpact === undefined
              ? null
              : new Prisma.Decimal(input.financialImpact),
          emv: emv === null ? null : new Prisma.Decimal(emv),
          priorityScore: input.likelihood * input.impactScore,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_RISK_CREATED',
        entityType: 'ProjectRisk',
        entityId: item.id,
        afterData: item,
      });
      return item;
    });
  }

  async allocate(
    actor: CurrentActor,
    projectId: string,
    riskId: string,
    input: AllocateProjectRiskDto,
  ) {
    this.require(actor, 'estimate.update');
    this.require(actor, 'estimate.read');
    this.require(actor, 'financial_margin.read');
    const approvedAmount = new Prisma.Decimal(input.approvedAmount);
    if (approvedAmount.lt(0)) throw new BadRequestException('Invalid amount');
    const basis = input.basis.trim();
    if (!basis) throw new BadRequestException('Allocation basis is required');
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Project"
        WHERE "id" = ${projectId}::uuid
          AND "organizationId" = ${actor.organizationId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (!locked.length) throw new NotFoundException('Project not found');
      if (
        !(await this.project(
          actor,
          projectId,
          ['estimate.read', 'estimate.update', 'financial_margin.read'],
          tx,
        ))
      )
        throw new NotFoundException('Project not found');
      const risk = await tx.projectRisk.findFirst({
        where: { id: riskId, organizationId: actor.organizationId, projectId },
        select: { id: true, status: true },
      });
      if (!risk) throw new NotFoundException('Risk not found');
      if (risk.status === 'OCCURRED' || risk.status === 'CLOSED')
        throw new ConflictException('Risk cannot receive contingency');
      const version = await tx.estimateVersion.findFirst({
        where: {
          id: input.estimateVersionId,
          status: 'DRAFT',
          estimate: {
            organizationId: actor.organizationId,
            projectId,
          },
        },
        select: { id: true },
      });
      if (!version)
        throw new NotFoundException('Draft estimate version not found');
      const item = await tx.estimateRiskAllocation.upsert({
        where: {
          estimateVersionId_riskId: {
            estimateVersionId: version.id,
            riskId: risk.id,
          },
        },
        create: {
          estimateVersionId: version.id,
          riskId: risk.id,
          approvedAmount,
          basis,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        update: {
          approvedAmount,
          basis,
          updatedBy: actor.userId,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'ESTIMATE_RISK_ALLOCATION_SAVED',
        entityType: 'EstimateRiskAllocation',
        entityId: item.id,
        afterData: item,
      });
      return item;
    });
  }
}
