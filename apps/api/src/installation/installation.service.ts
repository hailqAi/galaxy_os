import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BusinessEntityPolicy,
  projectWhereForPermissions,
} from '../access-control/business-entity.policy';
import {
  CurrentActor,
  actorsForPermission,
} from '../access-control/current-actor';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { FileStorage } from '../files/file-storage';
import { createHash, randomUUID } from 'node:crypto';
import {
  customerFileSource,
  eligibleCustomerFile,
  lockCustomerFileOwnership,
  verifiedCustomerFileBytes,
} from '../project-chat/contract-file-source';
import { findProjectFile } from '../files/project-file';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma.service';
import {
  CreateInstallationPlanDto,
  CreateSiteDeliveryDto,
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
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  private async deliveryProject(actor: CurrentActor, id: string) {
    if (process.env.FEATURE_PROJECT_CHAT !== 'true')
      throw new NotFoundException();
    const workOrder = await this.prisma.installationWorkOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { projectId: true },
    });
    if (!workOrder) throw new NotFoundException();
    return workOrder.projectId;
  }

  private async deliveryAccess(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    id: string,
    write = true,
  ) {
    const fresh = await this.access.freshActor(tx, actor);
    const required = [
      ...(write ? [['installation.execute']] : []),
      ['installation.read'],
      ['file.read', 'file.download'],
    ];
    const groups = required.map((permissions) =>
      actorsForPermission(fresh, permissions[0]!).filter((binding) =>
        permissions.every((p) => binding.permissions.includes(p)),
      ),
    );
    if (groups.some((group) => !group.length)) throw new NotFoundException();
    const workOrder = await tx.installationWorkOrder.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!workOrder) throw new NotFoundException();
    const project = await tx.project.findFirst({
      where: {
        id: workOrder.projectId,
        organizationId: actor.organizationId,
        deletedAt: null,
        AND: groups.map((group, i) => ({
          OR: group.map((binding) =>
            projectWhereForPermissions(binding, required[i]!),
          ),
        })),
      },
    });
    if (!project?.customerId) throw new NotFoundException();
    return { fresh, workOrder, project };
  }

  private async deliveryLines(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    ids?: string[],
  ) {
    const rows = await tx.stockIssueLine.findMany({
      where: {
        ...(ids ? { id: { in: ids } } : {}),
        issue: {
          organizationId: actor.organizationId,
          projectId,
          status: 'ISSUED',
        },
      },
      include: { issue: true },
      orderBy: { id: 'asc' },
    });
    const lines = [];
    for (const row of rows) {
      const item = await tx.inventoryItem.findFirst({
        where: {
          id: row.inventoryItemId,
          organizationId: actor.organizationId,
          OR: [{ projectId: null }, { projectId }],
        },
      });
      if (!item) continue;
      const lot = row.lotId
        ? await tx.inventoryLot.findFirst({
            where: {
              id: row.lotId,
              organizationId: actor.organizationId,
              inventoryItemId: item.id,
            },
          })
        : null;
      const serial = row.serialId
        ? await tx.inventorySerial.findFirst({
            where: {
              id: row.serialId,
              organizationId: actor.organizationId,
              inventoryItemId: item.id,
            },
          })
        : null;
      if (
        (row.lotId && !lot) ||
        (row.serialId && !serial) ||
        row.quantity.lte(0)
      )
        continue;
      lines.push({
        stockIssueLineId: row.id,
        stockIssueId: row.stockIssueId,
        issueNumber: row.issue.issueNumber,
        inventoryItemId: item.id,
        itemCode: item.itemCode,
        productId: item.productId,
        unit: item.unit,
        lotId: row.lotId,
        lotNumber: lot?.lotNumber ?? null,
        serialId: row.serialId,
        serialNumber: serial?.serialNumber ?? null,
        quantity: row.quantity.toString(),
      });
    }
    if (ids && lines.length !== ids.length)
      throw new NotFoundException('Không có dòng xuất kho đúng Project');
    return lines;
  }

  async deliveryOptions(actor: CurrentActor, id: string) {
    const projectId = await this.deliveryProject(actor, id);
    return this.access.project(actor, projectId, async (tx) => {
      const { fresh } = await this.deliveryAccess(tx, actor, id);
      const candidates = await tx.fileAsset.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          attachments: {
            some: { entityType: 'Project', entityId: projectId, projectId },
          },
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      const files = [];
      for (const candidate of candidates) {
        try {
          const file = await eligibleCustomerFile(
            tx,
            fresh,
            projectId,
            { sourceType: 'SITE_DELIVERY', sourceId: randomUUID() },
            candidate.id,
          );
          files.push({
            id: file.id,
            version: file.version,
            filename: file.originalFilename,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes.toString(),
          });
        } catch (error) {
          if (
            !(
              error instanceof NotFoundException ||
              error instanceof ConflictException
            )
          )
            throw error;
        }
      }
      return {
        workOrderId: id,
        projectId,
        lines: await this.deliveryLines(tx, fresh, projectId),
        files,
      };
    });
  }

  async createDelivery(
    actor: CurrentActor,
    id: string,
    data: CreateSiteDeliveryDto,
  ) {
    const projectId = await this.deliveryProject(actor, id);
    const items = data.items
      .map((item) => ({
        ...item,
        quantity: new Prisma.Decimal(item.quantity).toString(),
      }))
      .sort((a, b) => a.stockIssueLineId.localeCompare(b.stockIssueLineId));
    if (
      !items.length ||
      new Set(items.map((item) => item.stockIssueLineId)).size !==
        items.length ||
      items.some((item) => new Prisma.Decimal(item.quantity).lte(0))
    )
      throw new UnprocessableEntityException('Số lượng/dòng giao không hợp lệ');
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          workOrderId: id,
          deliveryDate: new Date(data.deliveryDate).toISOString(),
          recipient: data.recipient,
          evidenceFileId: data.evidenceFileId,
          evidenceFileVersion: data.evidenceFileVersion,
          items,
        }),
      )
      .digest('hex');
    const deliveryId = randomUUID();
    const read = async (tx: Prisma.TransactionClient, final = false) => {
      const { fresh, project, workOrder } = await this.deliveryAccess(
        tx,
        actor,
        id,
      );
      if (workOrder.projectId !== projectId)
        throw new ConflictException('WorkOrder đã đổi Project');
      await tx.$queryRaw`SELECT "id" FROM "FileAsset" WHERE "id"=${data.evidenceFileId}::uuid AND "organizationId"=${actor.organizationId}::uuid FOR UPDATE`;
      if (final) {
        await lockCustomerFileOwnership(tx);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "StockIssueLine" WHERE "id" IN (${Prisma.join(items.map((item) => Prisma.sql`${item.stockIssueLineId}::uuid`))}) ORDER BY "id" FOR SHARE`,
        );
      }
      const existing = await tx.siteDelivery.findUnique({
        where: {
          installationWorkOrderId_createdBy_clientKey: {
            installationWorkOrderId: id,
            createdBy: actor.userId,
            clientKey: data.clientKey,
          },
        },
      });
      if (existing && existing.requestHash !== requestHash)
        throw new ConflictException('Khóa đã dùng cho nội dung giao hàng khác');
      const file = await eligibleCustomerFile(
        tx,
        fresh,
        projectId,
        { sourceType: 'SITE_DELIVERY', sourceId: existing?.id ?? deliveryId },
        data.evidenceFileId,
      );
      if (file.version !== data.evidenceFileVersion)
        throw new ConflictException('Phiên bản bằng chứng đã đổi');
      const lines = await this.deliveryLines(
        tx,
        fresh,
        projectId,
        items.map((item) => item.stockIssueLineId),
      );
      const recorded = lines.map((line) => {
        const quantity = items.find(
          (item) => item.stockIssueLineId === line.stockIssueLineId,
        )!.quantity;
        if (new Prisma.Decimal(quantity).gt(line.quantity))
          throw new UnprocessableEntityException(
            'Số lượng giao vượt dòng xuất kho',
          );
        return {
          ...line,
          projectId,
          customerId: project.customerId!,
          issuedQuantity: line.quantity,
          quantity,
        };
      });
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            projectId,
            customerId: project.customerId,
            workOrderId: id,
            items: recorded,
            fileId: file.id,
            fileVersion: file.version,
            checksum: file.checksum,
            storageKey: file.storageKey,
            size: file.sizeBytes.toString(),
          }),
        )
        .digest('hex');
      return { file, recorded, fingerprint, existing };
    };
    const initial = await this.access.project(actor, projectId, (tx) =>
      read(tx),
    );
    if (initial.existing) return initial.existing;
    const bytes = await verifiedCustomerFileBytes(
      this.storage,
      initial.file.storageKey,
      initial.file.checksum,
    );
    if (BigInt(bytes.length) !== initial.file.sizeBytes)
      throw new ConflictException('Kích thước bằng chứng không khớp');
    return this.access.project(actor, projectId, async (tx) => {
      const current = await read(tx, true);
      if (current.fingerprint !== initial.fingerprint)
        throw new ConflictException(
          'Nguồn giao hàng đã đổi trong lúc đọc bằng chứng',
        );
      if (current.existing) return current.existing;
      const row = await tx.siteDelivery.create({
        data: {
          id: deliveryId,
          organizationId: actor.organizationId,
          projectId,
          installationWorkOrderId: id,
          deliveryDate: new Date(data.deliveryDate),
          recipient: data.recipient,
          evidenceFileId: current.file.id,
          evidenceFileVersion: current.file.version,
          evidenceChecksum: current.file.checksum,
          clientKey: data.clientKey,
          requestHash,
          items: current.recorded,
          createdBy: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'SITE_DELIVERY_RECORDED',
          entityType: 'SiteDelivery',
          entityId: row.id,
          metadata: {
            projectId,
            workOrderId: id,
            evidenceFileVersion: current.file.version,
          },
        },
      });
      if ((await read(tx)).fingerprint !== current.fingerprint)
        throw new ConflictException('Nguồn giao hàng đã đổi trước khi ghi');
      return row;
    });
  }

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
    if (item.deliveries.some((delivery) => delivery.clientKey)) {
      // The legacy WorkOrder read does not imply rights to newly pinned evidence.
      // Keep legacy rows unchanged; expose new records only with fresh scoped source/file rights.
      try {
        if (process.env.FEATURE_PROJECT_CHAT !== 'true')
          throw new NotFoundException();
        const deliveries = await this.access.project(
          actor,
          item.projectId,
          async (tx) => {
            const current = await this.deliveryAccess(tx, actor, id, false);
            if (current.workOrder.projectId !== item.projectId)
              throw new NotFoundException();
            const rows = await tx.siteDelivery.findMany({
              where: {
                installationWorkOrderId: id,
                organizationId: actor.organizationId,
              },
            });
            const visible = [];
            for (const row of rows) {
              if (!row.clientKey) {
                visible.push(row);
                continue;
              }
              try {
                const input = {
                  sourceType: 'SITE_DELIVERY' as const,
                  sourceId: row.id,
                };
                const source = await customerFileSource(
                  tx,
                  current.fresh,
                  item.projectId,
                  input,
                );
                const file = await eligibleCustomerFile(
                  tx,
                  current.fresh,
                  item.projectId,
                  input,
                  row.evidenceFileId!,
                );
                if (
                  source.pinnedFile?.id === file.id &&
                  source.pinnedFile.version === file.version &&
                  source.pinnedFile.checksum === file.checksum
                )
                  visible.push(row);
              } catch (error) {
                if (
                  !(
                    error instanceof NotFoundException ||
                    error instanceof ConflictException
                  )
                )
                  throw error;
              }
            }
            return visible;
          },
        );
        return { ...item, deliveries };
      } catch (error) {
        if (
          !(
            error instanceof NotFoundException ||
            error instanceof ForbiddenException ||
            error instanceof UnauthorizedException
          )
        )
          throw error;
        return {
          ...item,
          deliveries: item.deliveries.filter((delivery) => !delivery.clientKey),
        };
      }
    }
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
