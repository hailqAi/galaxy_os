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
import { PrismaService } from '../prisma.service';
import {
  CompleteHandoverDto,
  ConfirmTicketDto,
  CreateAcceptanceDto,
  CreateHandoverDto,
  CreateInspectionDto,
  CreateTicketDto,
  DecideInspectionItemDto,
  ResolveTicketDto,
  TicketStatusDto,
} from './after-sales.dto';

@Injectable()
export class AfterSalesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
  ) {}

  async inspections(actor: CurrentActor, projectId: string) {
    await this.policy.assertView(actor, 'Project', projectId);
    return this.prisma.inspection.findMany({
      where: { organizationId: actor.organizationId, projectId },
      include: { items: true, acceptances: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createInspection(actor: CurrentActor, data: CreateInspectionDto) {
    await this.policy.assertView(actor, 'Project', data.projectId);
    const ids = data.items.flatMap(({ installationItemId }) =>
      installationItemId ? [installationItemId] : [],
    );
    if (
      ids.length &&
      (await this.prisma.installationItem.count({
        where: {
          id: { in: ids },
          organizationId: actor.organizationId,
          projectId: data.projectId,
          status: 'INSTALLED',
        },
      })) !== new Set(ids).size
    )
      throw new UnprocessableEntityException('Invalid installation item');
    return this.prisma.inspection.create({
      data: {
        organizationId: actor.organizationId,
        projectId: data.projectId,
        inspectionNumber: data.inspectionNumber,
        type: data.type,
        scheduledAt: data.scheduledAt,
        status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        createdBy: actor.userId,
        items: { create: data.items },
      },
      include: { items: true },
    });
  }

  async inspection(actor: CurrentActor, id: string) {
    const item = await this.prisma.inspection.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        items: true,
        acceptances: { include: { participants: true } },
      },
    });
    if (!item) throw new NotFoundException('Inspection not found');
    await this.policy.assertView(actor, 'Project', item.projectId);
    return item;
  }

  async decideInspectionItem(
    actor: CurrentActor,
    id: string,
    data: DecideInspectionItemDto,
  ) {
    const line = await this.prisma.inspectionItem.findFirst({
      where: { id, inspection: { organizationId: actor.organizationId } },
      include: { inspection: true },
    });
    if (!line) throw new NotFoundException('Inspection item not found');
    await this.policy.assertView(actor, 'Project', line.inspection.projectId);
    if (!['DRAFT', 'SCHEDULED', 'IN_PROGRESS'].includes(line.inspection.status))
      throw new ConflictException('Inspection item cannot be decided');
    if (data.evidenceFileId) await this.assertFile(actor, data.evidenceFileId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspectionItem.update({
        where: { id },
        data: {
          result: data.result,
          notes: data.notes,
          evidenceFileId: data.evidenceFileId,
        },
      });
      if (line.inspection.status !== 'IN_PROGRESS')
        await tx.inspection.update({
          where: { id: line.inspectionId },
          data: { status: 'IN_PROGRESS' },
        });
      if (data.result === 'FAILED' && data.createPunch) {
        const workOrder = line.installationItemId
          ? await tx.installationItem.findUnique({
              where: { id: line.installationItemId },
            })
          : null;
        if (!workOrder)
          throw new UnprocessableEntityException(
            'Installation item required to create punch item',
          );
        await tx.punchItem.create({
          data: {
            organizationId: actor.organizationId,
            projectId: line.inspection.projectId,
            installationWorkOrderId: workOrder.installationWorkOrderId,
            issue: data.notes ?? line.scope,
            location: workOrder.room ?? workOrder.area ?? 'Project site',
            severity: 'HIGH',
            createdBy: actor.userId,
          },
        });
      }
      const remaining = await tx.inspectionItem.count({
        where: { inspectionId: line.inspectionId, result: 'PENDING' },
      });
      if (!remaining) {
        const failed = await tx.inspectionItem.count({
          where: { inspectionId: line.inspectionId, result: 'FAILED' },
        });
        const passed = await tx.inspectionItem.count({
          where: { inspectionId: line.inspectionId, result: 'PASSED' },
        });
        await tx.inspection.update({
          where: { id: line.inspectionId },
          data: {
            status: failed
              ? passed
                ? 'PARTIALLY_PASSED'
                : 'FAILED'
              : 'PASSED',
          },
        });
      }
      return updated;
    });
  }

  async createAcceptance(
    actor: CurrentActor,
    inspectionId: string,
    data: CreateAcceptanceDto,
  ) {
    const inspection = await this.inspection(actor, inspectionId);
    if (inspection.status !== 'PASSED')
      throw new ConflictException('Passed inspection required');
    if (
      await this.prisma.punchItem.count({
        where: {
          organizationId: actor.organizationId,
          projectId: inspection.projectId,
          severity: 'CRITICAL',
          status: { not: 'CLOSED' },
        },
      })
    )
      throw new ConflictException('Critical punch items block acceptance');
    if (data.signedDocumentId)
      await this.assertFile(actor, data.signedDocumentId);
    return this.prisma.acceptanceRecord.create({
      data: {
        organizationId: actor.organizationId,
        projectId: inspection.projectId,
        inspectionId,
        signedDocumentId: data.signedDocumentId,
        status: data.participants.every(
          (item) => item.signingStatus === 'SIGNED',
        )
          ? 'ACCEPTED'
          : 'PENDING_SIGNATURE',
        acceptedAt: data.participants.every(
          (item) => item.signingStatus === 'SIGNED',
        )
          ? new Date()
          : undefined,
        createdBy: actor.userId,
        participants: {
          create: data.participants.map((item) => ({
            ...item,
            signedAt: item.signingStatus === 'SIGNED' ? new Date() : undefined,
          })),
        },
      },
      include: { participants: true },
    });
  }

  async createHandover(actor: CurrentActor, data: CreateHandoverDto) {
    await this.policy.assertView(actor, 'Project', data.projectId);
    if (
      new Set(data.items.map(({ installationItemId }) => installationItemId))
        .size !== data.items.length
    )
      throw new UnprocessableEntityException('Duplicate handover item');
    const installationItems = await this.prisma.installationItem.findMany({
      where: {
        id: {
          in: data.items.map(({ installationItemId }) => installationItemId),
        },
        organizationId: actor.organizationId,
        projectId: data.projectId,
        status: 'INSTALLED',
      },
    });
    if (
      installationItems.length !==
      new Set(data.items.map((i) => i.installationItemId)).size
    )
      throw new UnprocessableEntityException('Invalid handover item');
    const byId = new Map(installationItems.map((item) => [item.id, item]));
    return this.prisma.handover.create({
      data: {
        organizationId: actor.organizationId,
        projectId: data.projectId,
        handoverNumber: data.handoverNumber,
        createdBy: actor.userId,
        items: {
          create: data.items.map((input) => {
            const item = byId.get(input.installationItemId)!;
            return {
              installationItemId: item.id,
              productId: item.productId,
              variantId: item.variantId,
              inventoryLotId: item.lotId,
              inventorySerialId: item.serialId,
              description: input.description,
            };
          }),
        },
        checklist: {
          create: data.checklist.map((item, position) => ({
            ...item,
            position,
          })),
        },
        statusHistory: { create: { toStatus: 'DRAFT', actorId: actor.userId } },
      },
      include: { items: true, checklist: true },
    });
  }

  async handovers(actor: CurrentActor, projectId: string) {
    await this.policy.assertView(actor, 'Project', projectId);
    return this.prisma.handover.findMany({
      where: { organizationId: actor.organizationId, projectId },
      include: { _count: { select: { items: true, checklist: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async handover(actor: CurrentActor, id: string) {
    const item = await this.prisma.handover.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        items: true,
        checklist: true,
        documents: true,
        statusHistory: true,
      },
    });
    if (!item) throw new NotFoundException('Handover not found');
    await this.policy.assertView(actor, 'Project', item.projectId);
    return item;
  }

  async completeChecklist(actor: CurrentActor, handoverId: string, id: string) {
    await this.handover(actor, handoverId);
    const result = await this.prisma.handoverChecklist.updateMany({
      where: { id, handoverId, completedAt: null },
      data: { completedAt: new Date(), completedBy: actor.userId },
    });
    if (!result.count)
      throw new NotFoundException('Handover checklist not found');
    return this.handover(actor, handoverId);
  }

  async completeHandover(
    actor: CurrentActor,
    id: string,
    data: CompleteHandoverDto,
  ) {
    const item = await this.handover(actor, id);
    if (item.status === 'COMPLETED') return item;
    const [missingChecklist, acceptedInspection, criticalPunch] =
      await Promise.all([
        this.prisma.handoverChecklist.count({
          where: { handoverId: id, required: true, completedAt: null },
        }),
        this.prisma.acceptanceRecord.count({
          where: {
            organizationId: actor.organizationId,
            projectId: item.projectId,
            status: 'ACCEPTED',
          },
        }),
        this.prisma.punchItem.count({
          where: {
            organizationId: actor.organizationId,
            projectId: item.projectId,
            severity: 'CRITICAL',
            status: { not: 'CLOSED' },
          },
        }),
      ]);
    const blockers = [
      missingChecklist && 'required checklist',
      !acceptedInspection && 'accepted inspection',
      criticalPunch && 'critical punch item',
    ].filter(Boolean);
    if (blockers.length && !data.overrideReason)
      throw new ConflictException(`Handover blocked: ${blockers.join(', ')}`);
    if (blockers.length && !actor.permissions.includes('handover.override'))
      throw new ForbiddenException('Handover override permission required');
    const project = await this.prisma.project.findFirst({
      where: { id: item.projectId, organizationId: actor.organizationId },
    });
    const policy = await this.prisma.warrantyPolicy.findFirst({
      where: { organizationId: actor.organizationId, activeStatus: 'active' },
      orderBy: { version: 'desc' },
    });
    if (!project || !policy)
      throw new ConflictException(
        'Project customer and warranty policy required',
      );
    const completedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      for (const line of item.items) {
        const installation = await tx.installationItem.findUniqueOrThrow({
          where: { id: line.installationItemId },
        });
        const inventory = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: installation.inventoryItemId },
        });
        const start =
          policy.startRule === 'INSTALLATION_DATE' && installation.installedAt
            ? installation.installedAt
            : completedAt;
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + policy.warrantyMonths);
        await tx.warrantyAsset.upsert({
          where: { handoverItemId: line.id },
          update: {},
          create: {
            organizationId: actor.organizationId,
            projectId: item.projectId,
            customerId: project.customerId,
            productId: line.productId,
            variantId: line.variantId,
            inventorySerialId: line.inventorySerialId,
            inventoryLotId: line.inventoryLotId,
            supplierId: inventory.supplierId,
            purchaseOrderId: inventory.purchaseOrderId,
            installationItemId: installation.id,
            handoverItemId: line.id,
            installationDate: installation.installedAt,
            handoverDate: completedAt,
            warrantyStart: start,
            warrantyEnd: end,
            warrantyMonths: policy.warrantyMonths,
            policySnapshot: {
              policyId: policy.id,
              name: policy.name,
              version: policy.version,
              startRule: policy.startRule,
              terms: policy.terms,
            },
          },
        });
      }
      const updated = await tx.handover.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt,
          completedBy: actor.userId,
          overrideReason: blockers.length ? data.overrideReason : null,
          overrideBy: blockers.length ? actor.userId : null,
        },
      });
      await tx.handoverStatusHistory.create({
        data: {
          handoverId: id,
          fromStatus: item.status,
          toStatus: 'COMPLETED',
          actorId: actor.userId,
          comment: data.overrideReason,
        },
      });
      return updated;
    });
  }

  async warrantyAssets(actor: CurrentActor, projectId: string) {
    await this.policy.assertView(actor, 'Project', projectId);
    return this.prisma.warrantyAsset.findMany({
      where: { organizationId: actor.organizationId, projectId },
      orderBy: { warrantyEnd: 'asc' },
    });
  }

  async createTicket(actor: CurrentActor, data: CreateTicketDto) {
    await this.policy.assertView(actor, 'Project', data.projectId);
    const project = await this.prisma.project.findFirst({
      where: {
        id: data.projectId,
        organizationId: actor.organizationId,
        customerId: data.customerId,
      },
    });
    if (!project) throw new NotFoundException('Project customer not found');
    if (
      data.warrantyAssetId &&
      !(await this.prisma.warrantyAsset.findFirst({
        where: {
          id: data.warrantyAssetId,
          organizationId: actor.organizationId,
          projectId: data.projectId,
          customerId: data.customerId,
        },
      }))
    )
      throw new NotFoundException('Warranty asset not found');
    return this.prisma.serviceTicket.create({
      data: {
        ...data,
        estimatedCost: data.estimatedCost
          ? new Prisma.Decimal(data.estimatedCost)
          : undefined,
        organizationId: actor.organizationId,
        createdBy: actor.userId,
      },
    });
  }

  async tickets(actor: CurrentActor, projectId: string) {
    await this.policy.assertView(actor, 'Project', projectId);
    const items = await this.prisma.serviceTicket.findMany({
      where: { organizationId: actor.organizationId, projectId },
      orderBy: { updatedAt: 'desc' },
    });
    if (actor.permissions.includes('service.cost.read')) return items;
    return items.map((item) => this.redactServiceCost(item));
  }

  async ticket(actor: CurrentActor, id: string) {
    const item = await this.prisma.serviceTicket.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        warrantyAsset: true,
        claims: true,
        visits: true,
        parts: true,
        resolutions: true,
        confirmations: true,
      },
    });
    if (!item) throw new NotFoundException('Service ticket not found');
    await this.policy.assertView(actor, 'Project', item.projectId);
    if (actor.permissions.includes('service.cost.read')) return item;
    return this.redactServiceCost(item);
  }

  async changeTicketStatus(
    actor: CurrentActor,
    id: string,
    data: TicketStatusDto,
  ) {
    const item = await this.ticketRecord(actor, id);
    const allowed: Record<string, string[]> = {
      NEW: ['TRIAGED', 'CANCELLED'],
      TRIAGED: [
        'SCHEDULED',
        'IN_PROGRESS',
        'WAITING_PARTS',
        'WAITING_SUPPLIER',
      ],
      SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['WAITING_PARTS', 'WAITING_SUPPLIER'],
      WAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
      WAITING_SUPPLIER: ['IN_PROGRESS', 'CANCELLED'],
    };
    if (!allowed[item.status]?.includes(data.status))
      throw new ConflictException('Invalid service ticket transition');
    return this.prisma.serviceTicket.update({
      where: { id },
      data: { status: data.status },
    });
  }

  async resolveTicket(actor: CurrentActor, id: string, data: ResolveTicketDto) {
    const item = await this.ticketRecord(actor, id);
    if (
      !['IN_PROGRESS', 'WAITING_PARTS', 'WAITING_SUPPLIER'].includes(
        item.status,
      )
    )
      throw new ConflictException('Active service ticket required');
    await this.assertFile(actor, data.evidenceFileId);
    return this.prisma.$transaction(async (tx) => {
      await tx.serviceResolution.create({
        data: {
          organizationId: actor.organizationId,
          serviceTicketId: id,
          summary: data.summary,
          evidenceFileId: data.evidenceFileId,
          resolvedBy: actor.userId,
        },
      });
      return tx.serviceTicket.update({
        where: { id },
        data: { status: 'RESOLVED', resolution: data.summary },
      });
    });
  }

  async confirmTicket(actor: CurrentActor, id: string, data: ConfirmTicketDto) {
    const item = await this.ticketRecord(actor, id);
    if (item.status !== 'RESOLVED')
      throw new ConflictException('Resolved ticket required');
    if (data.documentId) await this.assertFile(actor, data.documentId);
    return this.prisma.$transaction(async (tx) => {
      await tx.customerConfirmation.create({
        data: {
          ...data,
          organizationId: actor.organizationId,
          serviceTicketId: id,
        },
      });
      return tx.serviceTicket.update({
        where: { id },
        data: { status: data.confirmed ? 'CUSTOMER_CONFIRMED' : 'IN_PROGRESS' },
      });
    });
  }

  async closeTicket(actor: CurrentActor, id: string) {
    const item = await this.ticketRecord(actor, id);
    if (item.status !== 'CUSTOMER_CONFIRMED')
      throw new ConflictException('Customer confirmation required');
    return this.prisma.serviceTicket.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  }

  private async ticketRecord(actor: CurrentActor, id: string) {
    const item = await this.prisma.serviceTicket.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!item) throw new NotFoundException('Service ticket not found');
    await this.policy.assertView(actor, 'Project', item.projectId);
    return item;
  }

  private async assertFile(actor: CurrentActor, id: string) {
    if (
      !(await this.prisma.fileAsset.findFirst({
        where: { id, organizationId: actor.organizationId, deletedAt: null },
      }))
    )
      throw new NotFoundException('File not found');
  }

  private redactServiceCost<
    T extends {
      estimatedCost?: Prisma.Decimal | null;
      actualCost?: Prisma.Decimal | null;
    },
  >(item: T) {
    const safe = { ...item };
    delete safe.estimatedCost;
    delete safe.actualCost;
    return safe;
  }
}
