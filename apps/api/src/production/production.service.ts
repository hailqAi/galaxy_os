import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { findProjectFile } from '../files/project-file';
import { PrismaService } from '../prisma.service';
import {
  ApprovalDecisionDto,
  CreateProductionOrderDto,
  PackingRecordDto,
  ProductionMilestoneDto,
  ProductionQuery,
  ProductionStatusDto,
  ProductionUpdateDto,
  QualityReportDto,
  SampleApprovalDto,
  TechnicalApprovalDto,
  TechnicalRevisionDto,
  UpdateProductionOrderDto,
} from './production.dto';

@Injectable()
export class ProductionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
  ) {}

  async list(actor: CurrentActor, query: ProductionQuery) {
    const projects = await this.prisma.project.findMany({
      where: {
        ...this.policy.projectWhere(actor),
        id: query.projectId,
      },
      select: { id: true },
    });
    return this.prisma.productionOrder.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId: { in: projects.map(({ id }) => id) },
        status: query.status,
      },
      include: {
        purchaseOrder: { select: { poNumber: true } },
        _count: { select: { milestones: true, technicalApprovals: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.productionOrder.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        purchaseOrder: {
          purchaseRequest: { project: this.policy.projectWhere(actor) },
        },
      },
      include: {
        purchaseOrder: { select: { id: true, poNumber: true, status: true } },
        milestones: { orderBy: { sequence: 'asc' } },
        updates: { orderBy: { reportedAt: 'desc' } },
        technicalApprovals: {
          include: { revisions: { orderBy: { revision: 'desc' } } },
        },
        sampleApprovals: { orderBy: { createdAt: 'desc' } },
        qualityReports: { orderBy: { inspectionDate: 'desc' } },
        packingRecords: { orderBy: { packedAt: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Production order not found');
    return item;
  }

  async create(actor: CurrentActor, data: CreateProductionOrderDto) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: data.purchaseOrderId,
        organizationId: actor.organizationId,
        status: 'CONFIRMED',
        purchaseRequest: { project: this.policy.projectWhere(actor) },
      },
    });
    if (!purchaseOrder)
      throw new UnprocessableEntityException('Confirmed PO required');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.productionOrder.upsert({
        where: { purchaseOrderId: purchaseOrder.id },
        update: {},
        create: {
          organizationId: actor.organizationId,
          projectId: purchaseOrder.projectId,
          purchaseOrderId: purchaseOrder.id,
          supplierId: purchaseOrder.supplierId,
          plannedStartDate:
            data.plannedStartDate ?? purchaseOrder.expectedProductionStart,
          plannedReadyDate:
            data.plannedReadyDate ?? purchaseOrder.expectedReadyDate,
          ownerId: actor.userId,
          supplierContactId: data.supplierContactId,
          statusHistory: {
            create: { toStatus: 'ORDER_CONFIRMED', actorId: actor.userId },
          },
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PRODUCTION_ORDER_CREATED',
          entityType: 'ProductionOrder',
          entityId: item.id,
        },
      });
      return item;
    });
  }

  async update(
    actor: CurrentActor,
    id: string,
    data: UpdateProductionOrderDto,
  ) {
    const item = await this.get(actor, id);
    if (['READY_FOR_SHIPMENT', 'CANCELLED'].includes(item.status))
      throw new ConflictException('Closed production order is immutable');
    return this.prisma.productionOrder.update({ where: { id }, data });
  }

  async changeStatus(
    actor: CurrentActor,
    id: string,
    data: ProductionStatusDto,
  ) {
    const item = await this.get(actor, id);
    const allowed: Record<string, string[]> = {
      ORDER_CONFIRMED: [
        'TECHNICAL_APPROVAL',
        'MATERIAL_PREPARATION',
        'CANCELLED',
      ],
      TECHNICAL_APPROVAL: ['MATERIAL_PREPARATION', 'DELAYED', 'CANCELLED'],
      MATERIAL_PREPARATION: ['IN_PRODUCTION', 'DELAYED', 'CANCELLED'],
      IN_PRODUCTION: ['QUALITY_CHECK', 'DELAYED', 'CANCELLED'],
      QUALITY_CHECK: ['PACKING', 'DELAYED', 'CANCELLED'],
      PACKING: ['READY_FOR_SHIPMENT', 'DELAYED', 'CANCELLED'],
      DELAYED: [
        'TECHNICAL_APPROVAL',
        'MATERIAL_PREPARATION',
        'IN_PRODUCTION',
        'QUALITY_CHECK',
        'PACKING',
        'CANCELLED',
      ],
    };
    if (!allowed[item.status]?.includes(data.status))
      throw new ConflictException('Invalid production transition');
    if (data.status === 'DELAYED' && !data.reason)
      throw new UnprocessableEntityException('Delay reason is required');
    if (data.status === 'READY_FOR_SHIPMENT') {
      const pendingApproval = item.technicalApprovals.some(
        (approval) => approval.required && approval.status !== 'APPROVED',
      );
      const pendingSample = item.sampleApprovals.some(
        (approval) => approval.status !== 'APPROVED',
      );
      const pendingMilestone = item.milestones.some(
        (milestone) => milestone.required && milestone.status !== 'COMPLETED',
      );
      if (pendingApproval || pendingSample || pendingMilestone)
        throw new UnprocessableEntityException(
          'Required production approvals are incomplete',
        );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productionOrder.update({
        where: { id },
        data: {
          status: data.status,
          delayReason: data.status === 'DELAYED' ? data.reason : null,
          actualStartDate:
            data.status === 'IN_PRODUCTION'
              ? (item.actualStartDate ?? new Date())
              : undefined,
          actualReadyDate:
            data.status === 'READY_FOR_SHIPMENT' ? new Date() : undefined,
        },
      });
      await tx.productionStatusHistory.create({
        data: {
          productionOrderId: id,
          fromStatus: item.status,
          toStatus: data.status,
          actorId: actor.userId,
          comment: data.reason,
        },
      });
      if (data.status === 'READY_FOR_SHIPMENT')
        await tx.supplierPaymentSchedule.updateMany({
          where: {
            dependencyId: id,
            dependencyType: 'PRE_SHIPMENT',
          },
          data: { dependencyStatus: 'COMPLETED', status: 'DUE' },
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `PRODUCTION_${data.status}`,
          entityType: 'ProductionOrder',
          entityId: id,
        },
      });
      if (item.ownerId !== actor.userId)
        await tx.notification.create({
          data: {
            organizationId: actor.organizationId,
            recipientId: item.ownerId,
            actorId: actor.userId,
            type: 'PRODUCTION_STATUS_CHANGED',
            title: `Production status: ${data.status}`,
            entityType: 'ProductionOrder',
            entityId: id,
          },
        });
      return updated;
    });
  }

  async milestone(
    actor: CurrentActor,
    id: string,
    data: ProductionMilestoneDto,
  ) {
    const item = await this.get(actor, id);
    await this.assertProjectFile(actor, item.projectId, data.evidenceFileId);
    if (data.status === 'DELAYED' && !data.delayReason)
      throw new UnprocessableEntityException('Delay reason is required');
    return this.prisma.$transaction(async (tx) => {
      const milestone = await tx.productionMilestone.create({
        data: { ...data, productionOrderId: id },
      });
      if (milestone.status === 'COMPLETED')
        await tx.supplierPaymentSchedule.updateMany({
          where: { dependencyId: milestone.id },
          data: { dependencyStatus: 'COMPLETED', status: 'DUE' },
        });
      return milestone;
    });
  }

  async addUpdate(actor: CurrentActor, id: string, data: ProductionUpdateDto) {
    await this.get(actor, id);
    const progress = new Prisma.Decimal(data.progressPercentage);
    if (progress.lt(0) || progress.gt(100))
      throw new UnprocessableEntityException('Progress must be 0 to 100');
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.productionUpdate.create({
        data: {
          productionOrderId: id,
          progressPercentage: progress,
          summary: data.summary,
          reportedAt: data.reportedAt,
          reportedBy: actor.userId,
        },
      });
      await tx.productionOrder.update({
        where: { id },
        data: { progressPercentage: progress },
      });
      return update;
    });
  }

  async technicalApproval(
    actor: CurrentActor,
    id: string,
    data: TechnicalApprovalDto,
  ) {
    const item = await this.get(actor, id);
    await this.assertProjectFile(actor, item.projectId, data.fileId);
    return this.prisma.technicalApproval.create({
      data: {
        productionOrderId: id,
        type: data.type,
        title: data.title,
        required: data.required ?? true,
        createdBy: actor.userId,
        revisions: {
          create: {
            revision: 1,
            description: data.description,
            fileId: data.fileId,
            submittedBy: actor.userId,
          },
        },
      },
      include: { revisions: true },
    });
  }

  async technicalRevision(
    actor: CurrentActor,
    approvalId: string,
    data: TechnicalRevisionDto,
  ) {
    const approval = await this.scopedTechnicalApproval(actor, approvalId);
    await this.assertProjectFile(
      actor,
      approval.productionOrder.projectId,
      data.fileId,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.lockSourceProject(tx, approval.productionOrder.projectId);
      const current = await this.scopedTechnicalApproval(actor, approvalId, tx);
      if (
        data.fileId &&
        !(await findProjectFile(
          tx,
          actor,
          current.productionOrder.projectId,
          data.fileId,
        ))
      )
        throw new NotFoundException('File not found');
      const revision = current.currentRevision + 1;
      await tx.technicalApproval.update({
        where: { id: approvalId },
        data: { currentRevision: revision, status: 'PENDING' },
      });
      return tx.technicalApprovalRevision.create({
        data: {
          technicalApprovalId: approvalId,
          revision,
          description: data.description,
          fileId: data.fileId,
          submittedBy: actor.userId,
        },
      });
    });
  }

  async decideTechnical(
    actor: CurrentActor,
    approvalId: string,
    data: ApprovalDecisionDto,
  ) {
    const approval = await this.scopedTechnicalApproval(actor, approvalId);
    if (approval.createdBy === actor.userId)
      throw new ForbiddenException('Submitter cannot approve own document');
    return this.prisma.$transaction(async (tx) => {
      await this.lockSourceProject(tx, approval.productionOrder.projectId);
      const current = await this.scopedTechnicalApproval(actor, approvalId, tx);
      if (current.currentRevision !== approval.currentRevision)
        throw new ConflictException(
          'Phiên bản đã đổi; xem lại tài liệu hiện tại trước khi quyết định',
        );
      if (current.createdBy === actor.userId)
        throw new ForbiddenException('Submitter cannot approve own document');
      await tx.technicalApprovalRevision.update({
        where: {
          technicalApprovalId_revision: {
            technicalApprovalId: approvalId,
            revision: current.currentRevision,
          },
        },
        data: {
          decision: data.decision,
          comment: data.comment,
          decidedBy: actor.userId,
          decidedAt: new Date(),
        },
      });
      return tx.technicalApproval.update({
        where: { id: approvalId },
        data: { status: data.decision },
      });
    });
  }

  async sample(actor: CurrentActor, id: string, data: SampleApprovalDto) {
    const item = await this.get(actor, id);
    await this.assertProjectFile(actor, item.projectId, data.fileId);
    return this.prisma.sampleApproval.create({
      data: {
        ...data,
        productionOrderId: id,
        submittedBy: actor.userId,
      },
    });
  }

  async decideSample(
    actor: CurrentActor,
    sampleId: string,
    data: ApprovalDecisionDto,
  ) {
    const sample = await this.prisma.sampleApproval.findFirst({
      where: {
        id: sampleId,
        productionOrder: {
          organizationId: actor.organizationId,
          purchaseOrder: {
            purchaseRequest: { project: this.policy.projectWhere(actor) },
          },
        },
      },
      include: { productionOrder: { select: { projectId: true } } },
    });
    if (!sample) throw new NotFoundException('Sample approval not found');
    if (sample.status !== 'PENDING')
      throw new ConflictException('Sample approval is already decided');
    if (sample.submittedBy === actor.userId)
      throw new ForbiddenException('Submitter cannot approve own sample');
    return this.prisma.$transaction(async (tx) => {
      await this.lockSourceProject(tx, sample.productionOrder.projectId);
      const current = await tx.sampleApproval.findUniqueOrThrow({
        where: { id: sampleId },
      });
      if (current.status !== 'PENDING')
        throw new ConflictException('Sample approval is already decided');
      if (current.submittedBy === actor.userId)
        throw new ForbiddenException('Submitter cannot approve own sample');
      return tx.sampleApproval.update({
        where: { id: sampleId },
        data: {
          status: data.decision,
          comment: data.comment,
          decidedBy: actor.userId,
          decidedAt: new Date(),
        },
      });
    });
  }

  async quality(actor: CurrentActor, id: string, data: QualityReportDto) {
    const item = await this.get(actor, id);
    await this.assertProjectFile(actor, item.projectId, data.fileId);
    return this.prisma.qualityReport.create({
      data: { ...data, productionOrderId: id, createdBy: actor.userId },
    });
  }

  async packing(actor: CurrentActor, id: string, data: PackingRecordDto) {
    const item = await this.get(actor, id);
    await this.assertProjectFile(actor, item.projectId, data.fileId);
    return this.prisma.packingRecord.create({
      data: {
        ...data,
        grossWeight: data.grossWeight
          ? new Prisma.Decimal(data.grossWeight)
          : undefined,
        volume: data.volume ? new Prisma.Decimal(data.volume) : undefined,
        productionOrderId: id,
        createdBy: actor.userId,
      },
    });
  }

  private async lockSourceProject(
    tx: Prisma.TransactionClient,
    projectId: string,
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Project" WHERE "id" = ${projectId}::uuid FOR UPDATE`,
    );
  }

  private async scopedTechnicalApproval(
    actor: CurrentActor,
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const approval = await db.technicalApproval.findFirst({
      where: {
        id,
        productionOrder: {
          organizationId: actor.organizationId,
          purchaseOrder: {
            purchaseRequest: { project: this.policy.projectWhere(actor) },
          },
        },
      },
      include: { productionOrder: { select: { projectId: true } } },
    });
    if (!approval) throw new NotFoundException('Technical approval not found');
    return approval;
  }

  private async assertProjectFile(
    actor: CurrentActor,
    projectId: string,
    fileId?: string,
  ) {
    if (
      fileId &&
      !(await findProjectFile(this.prisma, actor, projectId, fileId))
    )
      throw new NotFoundException('File not found');
  }
}
