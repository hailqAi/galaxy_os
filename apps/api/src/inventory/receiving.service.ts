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
import { InventoryService } from './inventory.service';
import {
  CreateGoodsReceiptDto,
  CreateQualityInspectionDto,
  GoodsReceiptsQuery,
} from './receiving.dto';

@Injectable()
export class ReceivingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}

  async list(actor: CurrentActor, query: GoodsReceiptsQuery) {
    const projectIds = query.projectId
      ? (await this.policy.assertView(actor, 'Project', query.projectId),
        [query.projectId])
      : await this.accessibleProjectIds(actor);
    return this.prisma.goodsReceipt.findMany({
      where: {
        organizationId: actor.organizationId,
        warehouseId: query.warehouseId,
        status: query.status,
        projectId: { in: projectIds },
      },
      include: { _count: { select: { lines: true, inspections: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.goodsReceipt.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        lines: true,
        inspections: { include: { lines: true } },
        damageRecords: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Goods receipt not found');
    await this.policy.assertView(actor, 'Project', item.projectId);
    return item;
  }

  async create(actor: CurrentActor, data: CreateGoodsReceiptDto) {
    if (!!data.shipmentId === !!data.purchaseOrderId)
      throw new UnprocessableEntityException(
        'Choose either shipment or purchase order',
      );
    const sourceKeys = data.lines.map((line) =>
      data.shipmentId ? line.shipmentItemId : line.purchaseOrderLineId,
    );
    if (
      sourceKeys.some((key) => !key) ||
      new Set(sourceKeys).size !== sourceKeys.length
    )
      throw new UnprocessableEntityException('Duplicate receipt source line');
    const shipment = data.shipmentId
      ? await this.prisma.shipment.findFirst({
          where: {
            id: data.shipmentId,
            organizationId: actor.organizationId,
            status: 'DELIVERED_TO_WAREHOUSE',
          },
          include: {
            items: true,
            purchaseOrder: {
              include: { lines: true },
            },
          },
        })
      : null;
    const purchaseOrder =
      shipment?.purchaseOrder ??
      (data.purchaseOrderId
        ? await this.prisma.purchaseOrder.findFirst({
            where: {
              id: data.purchaseOrderId,
              organizationId: actor.organizationId,
              status: 'CONFIRMED',
            },
            include: { lines: true },
          })
        : null);
    if (!purchaseOrder) throw new NotFoundException('Receipt source not found');
    await this.policy.assertView(actor, 'Project', purchaseOrder.projectId);
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id: data.warehouseId,
        organizationId: actor.organizationId,
        activeStatus: 'active',
      },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    const poLines = new Map(purchaseOrder.lines.map((line) => [line.id, line]));
    const shipmentItems = new Map(
      (shipment?.items ?? []).map((line) => [line.id, line]),
    );
    return this.prisma.$transaction(
      async (tx) => {
        const lines = [];
        for (const [position, input] of data.lines.entries()) {
          const source = poLines.get(input.purchaseOrderLineId);
          const shipped = input.shipmentItemId
            ? shipmentItems.get(input.shipmentItemId)
            : null;
          if (
            !source ||
            (shipment &&
              (!shipped ||
                shipped.purchaseOrderLineId !== input.purchaseOrderLineId))
          )
            throw new UnprocessableEntityException(
              'Invalid receipt source line',
            );
          const location = await tx.storageLocation.findFirst({
            where: {
              id: input.storageLocationId,
              warehouseId: warehouse.id,
              activeStatus: 'active',
            },
          });
          if (!location)
            throw new NotFoundException('Storage location not found');
          const received = new Prisma.Decimal(input.receivedQuantity);
          const sourceQuantity = shipment ? shipped!.quantity : source.quantity;
          const prior = await tx.goodsReceiptLine.aggregate({
            where: {
              ...(shipment
                ? { shipmentItemId: shipped!.id }
                : { purchaseOrderLineId: source.id }),
              goodsReceipt: {
                organizationId: actor.organizationId,
                status: { not: 'CANCELLED' },
              },
            },
            _sum: { receivedQuantity: true },
          });
          const expected = sourceQuantity.minus(
            prior._sum.receivedQuantity ?? 0,
          );
          const damaged = new Prisma.Decimal(input.damagedQuantity ?? 0);
          if (
            expected.lte(0) ||
            received.lte(0) ||
            received.gt(expected) ||
            damaged.gt(received)
          )
            throw new UnprocessableEntityException('Invalid receipt quantity');
          const product = await tx.product.findFirst({
            where: {
              id: source.productId ?? undefined,
              organizationId: actor.organizationId,
            },
          });
          if (!product)
            throw new NotFoundException('Receipt product not found');
          if (product.lotTrackingRequired && !input.lotNumber)
            throw new UnprocessableEntityException('Lot number required');
          if (
            product.serialTrackingRequired &&
            (input.serialNumbers?.length !== received.toNumber() ||
              !received.isInteger())
          )
            throw new UnprocessableEntityException(
              'One serial number per received unit required',
            );
          const inventoryItem = await tx.inventoryItem.create({
            data: {
              organizationId: actor.organizationId,
              projectId: purchaseOrder.projectId,
              itemCode: `${data.receiptNumber}-${position + 1}`,
              brandId: product.brandId,
              productId: product.id,
              variantId: source.variantId,
              supplierId: purchaseOrder.supplierId,
              purchaseOrderId: purchaseOrder.id,
              purchaseOrderLineId: source.id,
              productionOrderId: shipment?.productionOrderId,
              shipmentId: shipment?.id,
              shipmentItemId: shipped?.id,
              unit: source.unit,
              unitCost: source.netUnitPrice,
              currency: purchaseOrder.currency,
            },
          });
          const lot = input.lotNumber
            ? await tx.inventoryLot.create({
                data: {
                  organizationId: actor.organizationId,
                  inventoryItemId: inventoryItem.id,
                  lotNumber: input.lotNumber,
                },
              })
            : null;
          if (input.serialNumbers?.length)
            await tx.inventorySerial.createMany({
              data: input.serialNumbers.map((serialNumber) => ({
                organizationId: actor.organizationId,
                inventoryItemId: inventoryItem.id,
                serialNumber,
              })),
            });
          lines.push({
            purchaseOrderLineId: source.id,
            shipmentItemId: shipped?.id,
            inventoryItemId: inventoryItem.id,
            productId: product.id,
            variantId: source.variantId,
            storageLocationId: location.id,
            lotId: lot?.id,
            expectedQuantity: expected,
            receivedQuantity: received,
            shortageQuantity: Prisma.Decimal.max(expected.minus(received), 0),
            excessQuantity: Prisma.Decimal.max(received.minus(expected), 0),
            damagedQuantity: damaged,
            unit: source.unit,
            notes: input.notes,
          });
        }
        const receipt = await tx.goodsReceipt.create({
          data: {
            organizationId: actor.organizationId,
            projectId: purchaseOrder.projectId,
            receiptNumber: data.receiptNumber,
            warehouseId: warehouse.id,
            shipmentId: shipment?.id,
            purchaseOrderId: purchaseOrder.id,
            supplierId: purchaseOrder.supplierId,
            createdBy: actor.userId,
            lines: { create: lines },
            statusHistory: {
              create: { toStatus: 'DRAFT', actorId: actor.userId },
            },
          },
          include: { lines: true },
        });
        await tx.inventoryItem.updateMany({
          where: {
            id: { in: lines.map(({ inventoryItemId }) => inventoryItemId) },
          },
          data: { goodsReceiptId: receipt.id },
        });
        return receipt;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async receive(actor: CurrentActor, id: string) {
    const receipt = await this.get(actor, id);
    if (receipt.status === 'RECEIVED' || receipt.status === 'UNDER_INSPECTION')
      return receipt;
    if (receipt.status !== 'DRAFT')
      throw new ConflictException('Receipt cannot be posted');
    const postingLines = [];
    for (const line of receipt.lines) {
      const serials = await this.prisma.inventorySerial.findMany({
        where: { inventoryItemId: line.inventoryItemId },
      });
      if (serials.length)
        postingLines.push(
          ...serials.map((serial) => ({
            inventoryItemId: line.inventoryItemId,
            warehouseId: receipt.warehouseId,
            storageLocationId: line.storageLocationId,
            lotId: line.lotId ?? undefined,
            serialId: serial.id,
            quantity: '1',
            onHandDelta: '1',
            qualityHoldDelta: '1',
          })),
        );
      else
        postingLines.push({
          inventoryItemId: line.inventoryItemId,
          warehouseId: receipt.warehouseId,
          storageLocationId: line.storageLocationId,
          lotId: line.lotId ?? undefined,
          quantity: line.receivedQuantity.toString(),
          onHandDelta: line.receivedQuantity.toString(),
          qualityHoldDelta: line.receivedQuantity.toString(),
        });
    }
    await this.inventory.post(actor, {
      transactionNumber: `RECEIPT-${receipt.receiptNumber}`,
      type: 'RECEIPT',
      idempotencyKey: `goods-receipt:${receipt.id}`,
      projectId: receipt.projectId,
      sourceType: 'GoodsReceipt',
      sourceId: receipt.id,
      lines: postingLines,
    });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.goodsReceipt.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          receivedAt: new Date(),
          receivedBy: actor.userId,
        },
      });
      await tx.goodsReceiptStatusHistory.create({
        data: {
          goodsReceiptId: id,
          fromStatus: 'DRAFT',
          toStatus: 'RECEIVED',
          actorId: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'GOODS_RECEIPT_POSTED',
          entityType: 'GoodsReceipt',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async createInspection(
    actor: CurrentActor,
    receiptId: string,
    data: CreateQualityInspectionDto,
  ) {
    const receipt = await this.get(actor, receiptId);
    if (receipt.status !== 'RECEIVED')
      throw new ConflictException('Received goods required');
    const evidenceIds = data.lines.flatMap(({ evidenceFileId }) =>
      evidenceFileId ? [evidenceFileId] : [],
    );
    if (
      evidenceIds.length &&
      (await this.prisma.fileAsset.count({
        where: {
          id: { in: evidenceIds },
          organizationId: actor.organizationId,
          deletedAt: null,
        },
      })) !== new Set(evidenceIds).size
    )
      throw new NotFoundException('Inspection evidence not found');
    const byId = new Map(receipt.lines.map((line) => [line.id, line]));
    const lines = data.lines.map((input) => {
      const line = byId.get(input.goodsReceiptLineId);
      const inspected = new Prisma.Decimal(input.inspectedQuantity);
      const passed = new Prisma.Decimal(input.passedQuantity);
      const failed = new Prisma.Decimal(input.failedQuantity);
      const quarantined = new Prisma.Decimal(input.quarantinedQuantity);
      if (
        !line ||
        inspected.lte(0) ||
        inspected.gt(line.receivedQuantity) ||
        !passed.plus(failed).plus(quarantined).equals(inspected) ||
        [passed, failed, quarantined].some((value) => value.lt(0))
      )
        throw new UnprocessableEntityException('Invalid inspection quantity');
      return {
        ...input,
        inspectedQuantity: inspected,
        passedQuantity: passed,
        failedQuantity: failed,
        quarantinedQuantity: quarantined,
        result: failed.equals(inspected)
          ? 'FAILED'
          : passed.equals(inspected)
            ? 'PASSED'
            : 'PARTIALLY_PASSED',
      };
    });
    return this.prisma.$transaction(async (tx) => {
      const inspection = await tx.qualityInspection.create({
        data: {
          organizationId: actor.organizationId,
          projectId: receipt.projectId,
          goodsReceiptId: receipt.id,
          inspectionNumber: data.inspectionNumber,
          inspectorId: actor.userId,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          notes: data.notes,
          lines: { create: lines },
        },
        include: { lines: true },
      });
      await tx.goodsReceipt.update({
        where: { id: receipt.id },
        data: { status: 'UNDER_INSPECTION' },
      });
      return inspection;
    });
  }

  async completeInspection(actor: CurrentActor, id: string) {
    const inspection = await this.prisma.qualityInspection.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        status: 'IN_PROGRESS',
      },
      include: {
        lines: { include: { goodsReceiptLine: true } },
        goodsReceipt: true,
      },
    });
    if (!inspection) throw new NotFoundException('Inspection not found');
    await this.policy.assertView(actor, 'Project', inspection.projectId);
    if (inspection.inspectorId === actor.userId)
      throw new ForbiddenException('Inspector cannot approve own inspection');
    const postingLines = [];
    for (const line of inspection.lines) {
      if (line.passedQuantity.gt(0))
        postingLines.push({
          inventoryItemId: line.goodsReceiptLine.inventoryItemId,
          warehouseId: inspection.goodsReceipt.warehouseId,
          storageLocationId: line.goodsReceiptLine.storageLocationId,
          lotId: line.goodsReceiptLine.lotId ?? undefined,
          quantity: line.passedQuantity.toString(),
          availableDelta: line.passedQuantity.toString(),
          qualityHoldDelta: line.passedQuantity.negated().toString(),
        });
      if (line.failedQuantity.gt(0))
        postingLines.push({
          inventoryItemId: line.goodsReceiptLine.inventoryItemId,
          warehouseId: inspection.goodsReceipt.warehouseId,
          storageLocationId: line.goodsReceiptLine.storageLocationId,
          lotId: line.goodsReceiptLine.lotId ?? undefined,
          quantity: line.failedQuantity.toString(),
          qualityHoldDelta: line.failedQuantity.negated().toString(),
          damagedDelta: line.failedQuantity.toString(),
        });
    }
    if (postingLines.length)
      await this.inventory.post(actor, {
        transactionNumber: `QC-${inspection.inspectionNumber}`,
        type: 'QUALITY_RELEASE',
        idempotencyKey: `quality-inspection:${inspection.id}`,
        projectId: inspection.projectId,
        sourceType: 'QualityInspection',
        sourceId: inspection.id,
        lines: postingLines,
      });
    const failed = inspection.lines.reduce(
      (sum, line) => sum.plus(line.failedQuantity),
      new Prisma.Decimal(0),
    );
    const passed = inspection.lines.reduce(
      (sum, line) => sum.plus(line.passedQuantity),
      new Prisma.Decimal(0),
    );
    const status = failed.isZero()
      ? 'PASSED'
      : passed.isZero()
        ? 'FAILED'
        : 'PARTIALLY_PASSED';
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.qualityInspection.update({
        where: { id },
        data: {
          status,
          approverId: actor.userId,
          completedAt: new Date(),
        },
      });
      await tx.goodsReceipt.update({
        where: { id: inspection.goodsReceiptId },
        data: {
          status:
            status === 'PASSED'
              ? 'ACCEPTED'
              : status === 'FAILED'
                ? 'REJECTED'
                : 'PARTIALLY_ACCEPTED',
        },
      });
      for (const line of inspection.lines)
        if (line.failedQuantity.gt(0))
          await tx.damageRecord.create({
            data: {
              organizationId: actor.organizationId,
              projectId: inspection.projectId,
              goodsReceiptId: inspection.goodsReceiptId,
              goodsReceiptLineId: line.goodsReceiptLineId,
              qualityInspectionId: inspection.id,
              inventoryItemId: line.goodsReceiptLine.inventoryItemId,
              lotId: line.goodsReceiptLine.lotId,
              quantity: line.failedQuantity,
              reason: line.reason ?? 'Quality inspection failed',
              evidenceFileId: line.evidenceFileId,
              createdBy: actor.userId,
            },
          });
      return updated;
    });
  }

  private accessibleProjectIds(actor: CurrentActor) {
    return this.prisma.project
      .findMany({
        where: this.policy.projectWhere(actor),
        select: { id: true },
      })
      .then((items) => items.map(({ id }) => id));
  }
}
