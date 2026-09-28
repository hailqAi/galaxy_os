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
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma.service';
import {
  CreateInstallationPlanDto,
  CreateWorkOrderDto,
  InstallItemDto,
  PunchItemDto,
  ReleaseWorkOrderDto,
  ResolvePunchDto,
  SiteDailyLogDto,
} from './installation.dto';

@Injectable()
export class InstallationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}

  async plans(actor: CurrentActor, projectId: string) {
    await this.policy.assertView(actor, 'Project', projectId);
    return this.prisma.installationPlan.findMany({
      where: { organizationId: actor.organizationId, projectId },
      include: {
        workOrders: { orderBy: { updatedAt: 'desc' } },
        _count: { select: { teams: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createPlan(actor: CurrentActor, data: CreateInstallationPlanDto) {
    await this.policy.assertView(actor, 'Project', data.projectId);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.installationPlan.create({
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
          event: 'INSTALLATION_PLAN_CREATED',
          entityType: 'InstallationPlan',
          entityId: item.id,
        },
      });
      return item;
    });
  }

  async createWorkOrder(
    actor: CurrentActor,
    planId: string,
    data: CreateWorkOrderDto,
  ) {
    const plan = await this.plan(actor, planId);
    if (
      data.teamId &&
      !(await this.prisma.installationTeam.findFirst({
        where: {
          id: data.teamId,
          planId,
          organizationId: actor.organizationId,
          activeStatus: 'active',
        },
      }))
    )
      throw new NotFoundException('Installation team not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Project" WHERE "id"=${plan.projectId}::uuid FOR UPDATE`,
      );
      return tx.installationWorkOrder.create({
        data: {
          organizationId: actor.organizationId,
          projectId: plan.projectId,
          planId,
          teamId: data.teamId,
          workOrderNumber: data.workOrderNumber,
          title: data.title,
          area: data.area,
          plannedDate: data.plannedDate,
          requiredInventory: data.requiredInventory,
          approvedDrawing: data.approvedDrawing,
          createdBy: actor.userId,
          checklist: {
            create: data.checklist.map((item, position) => ({
              ...item,
              position,
            })),
          },
        },
        include: { checklist: true },
      });
    });
  }

  async getWorkOrder(actor: CurrentActor, id: string) {
    const item = await this.prisma.installationWorkOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        plan: true,
        team: { include: { installers: true } },
        checklist: { orderBy: { position: 'asc' } },
        items: true,
        deliveries: true,
        dailyLogs: { orderBy: { logDate: 'desc' } },
        issues: true,
        punchItems: true,
      },
    });
    if (!item) throw new NotFoundException('Installation work order not found');
    await this.policy.assertView(actor, 'Project', item.projectId);
    return item;
  }

  async release(actor: CurrentActor, id: string, data: ReleaseWorkOrderDto) {
    const item = await this.getWorkOrder(actor, id);
    if (item.status === 'RELEASED') return item;
    if (!['DRAFT', 'READY'].includes(item.status))
      throw new ConflictException('Work order cannot be released');
    const [blockedApprovals, inventoryReady] = await Promise.all([
      this.prisma.technicalApproval.count({
        where: {
          productionOrder: {
            organizationId: actor.organizationId,
            projectId: item.projectId,
          },
          required: true,
          status: { not: 'APPROVED' },
        },
      }),
      item.requiredInventory
        ? this.prisma.inventoryReservation.count({
            where: {
              organizationId: actor.organizationId,
              projectId: item.projectId,
              status: { in: ['RESERVED', 'PARTIALLY_ISSUED', 'ISSUED'] },
            },
          })
        : Promise.resolve(1),
    ]);
    const missing = [
      !item.teamId && 'assigned team',
      !item.plan.siteReady && 'site readiness',
      !item.plan.customerCoordination && 'customer coordination',
      !item.approvedDrawing && 'approved drawing',
      blockedApprovals > 0 && 'technical approval',
      inventoryReady === 0 && 'reserved inventory',
    ].filter(Boolean);
    if (missing.length && !data.overrideReason)
      throw new ConflictException(`Missing readiness: ${missing.join(', ')}`);
    if (
      missing.length &&
      !actor.permissions.includes('installation.readiness.override')
    )
      throw new ForbiddenException('Readiness override permission required');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Project" WHERE "id"=${item.projectId}::uuid FOR UPDATE`,
      );
      const current = await tx.installationWorkOrder.findUniqueOrThrow({
        where: { id },
      });
      if (current.status !== item.status)
        throw new ConflictException(
          'Work order changed; reload before release',
        );
      const updated = await tx.installationWorkOrder.update({
        where: { id },
        data: {
          status: 'RELEASED',
          releasedBy: actor.userId,
          releasedAt: new Date(),
          overrideReason: missing.length ? data.overrideReason : null,
          overrideBy: missing.length ? actor.userId : null,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: missing.length
            ? 'INSTALLATION_WORK_ORDER_RELEASED_WITH_OVERRIDE'
            : 'INSTALLATION_WORK_ORDER_RELEASED',
          entityType: 'InstallationWorkOrder',
          entityId: id,
          metadata: missing.length
            ? { missing, reason: data.overrideReason }
            : undefined,
        },
      });
      return updated;
    });
  }

  async installItem(actor: CurrentActor, id: string, data: InstallItemDto) {
    const workOrder = await this.getWorkOrder(actor, id);
    if (!['RELEASED', 'IN_PROGRESS'].includes(workOrder.status))
      throw new ConflictException('Released work order required');
    const source = await this.prisma.stockIssueLine.findFirst({
      where: {
        id: data.stockIssueLineId,
        inventoryItemId: data.inventoryItemId,
        issue: {
          organizationId: actor.organizationId,
          projectId: workOrder.projectId,
          status: 'ISSUED',
        },
      },
      include: { issue: true },
    });
    if (!source) throw new NotFoundException('Issued inventory not found');
    if (source.serialId !== data.serialId || source.lotId !== data.lotId)
      throw new UnprocessableEntityException('Lot or serial mismatch');
    const created =
      (await this.prisma.installationItem.findUnique({
        where: { stockIssueLineId: data.stockIssueLineId },
      })) ??
      (await this.prisma.installationItem.create({
        data: {
          ...data,
          organizationId: actor.organizationId,
          projectId: workOrder.projectId,
          installationWorkOrderId: id,
        },
      }));
    if (
      created.organizationId !== actor.organizationId ||
      created.installationWorkOrderId !== id
    )
      throw new ConflictException('Issued inventory is already installed');
    await this.inventory.post(actor, {
      transactionNumber: `INSTALL-${created.id}`,
      type: 'INSTALL',
      idempotencyKey: `installation-item:${created.id}`,
      projectId: workOrder.projectId,
      sourceType: 'InstallationItem',
      sourceId: created.id,
      lines: [
        {
          inventoryItemId: data.inventoryItemId,
          warehouseId: source.issue.warehouseId,
          storageLocationId: source.storageLocationId ?? undefined,
          lotId: source.lotId ?? undefined,
          serialId: source.serialId ?? undefined,
          quantity: source.quantity.toString(),
          issuedDelta: source.quantity.negated().toString(),
          installedDelta: source.quantity.toString(),
        },
      ],
    });
    return this.prisma.installationItem.update({
      where: { id: created.id },
      data: {
        installedBy: actor.userId,
        installedAt: new Date(),
        status: 'INSTALLED',
      },
    });
  }

  async addDailyLog(actor: CurrentActor, id: string, data: SiteDailyLogDto) {
    const item = await this.getWorkOrder(actor, id);
    return this.prisma.siteDailyLog.create({
      data: {
        ...data,
        organizationId: actor.organizationId,
        projectId: item.projectId,
        installationWorkOrderId: id,
        createdBy: actor.userId,
      },
    });
  }

  async addPunch(actor: CurrentActor, id: string, data: PunchItemDto) {
    const item = await this.getWorkOrder(actor, id);
    if (
      data.evidenceFileId &&
      !(await findProjectFile(
        this.prisma,
        actor,
        item.projectId,
        data.evidenceFileId,
      ))
    )
      throw new NotFoundException('Punch evidence not found');
    return this.prisma.punchItem.create({
      data: {
        ...data,
        organizationId: actor.organizationId,
        projectId: item.projectId,
        installationWorkOrderId: id,
        createdBy: actor.userId,
      },
    });
  }

  async resolvePunch(actor: CurrentActor, id: string, data: ResolvePunchDto) {
    const item = await this.punch(actor, id);
    if (!['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(item.status))
      throw new ConflictException('Punch item cannot be resolved');
    return this.prisma.punchItem.update({
      where: { id },
      data: {
        status: 'READY_FOR_VERIFY',
        resolution: data.resolution,
        resolvedBy: actor.userId,
      },
    });
  }

  async verifyPunch(actor: CurrentActor, id: string) {
    const item = await this.punch(actor, id);
    if (item.status !== 'READY_FOR_VERIFY')
      throw new ConflictException('Resolved punch item required');
    if (item.resolvedBy === actor.userId)
      throw new ForbiddenException('Resolver cannot verify own punch item');
    return this.prisma.punchItem.update({
      where: { id },
      data: { status: 'CLOSED', verifiedBy: actor.userId },
    });
  }

  private async plan(actor: CurrentActor, id: string) {
    const item = await this.prisma.installationPlan.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!item) throw new NotFoundException('Installation plan not found');
    await this.policy.assertView(actor, 'Project', item.projectId);
    return item;
  }

  private async punch(actor: CurrentActor, id: string) {
    const item = await this.prisma.punchItem.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!item) throw new NotFoundException('Punch item not found');
    await this.policy.assertView(actor, 'Project', item.projectId);
    return item;
  }
}
