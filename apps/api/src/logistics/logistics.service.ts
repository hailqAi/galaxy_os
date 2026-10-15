import {
  ConflictException,
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
  CreateCustomsDto,
  CreateLandedCostDto,
  CreateShipmentDto,
  CustomsStatusDto,
  ForwarderDto,
  ShipmentDocumentDto,
  ShipmentItemDto,
  ShipmentLegDto,
  ShipmentPackageDto,
  ShipmentsQuery,
  ShipmentStatusDto,
  UpdateShipmentDto,
} from './logistics.dto';

@Injectable()
export class LogisticsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
  ) {}

  forwarders(actor: CurrentActor) {
    return this.prisma.forwarder.findMany({
      where: { organizationId: actor.organizationId, activeStatus: 'active' },
      orderBy: { legalName: 'asc' },
    });
  }

  createForwarder(actor: CurrentActor, data: ForwarderDto) {
    return this.prisma.forwarder.create({
      data: { ...data, organizationId: actor.organizationId },
    });
  }

  async list(actor: CurrentActor, query: ShipmentsQuery) {
    const where: Prisma.ShipmentWhereInput = {
      organizationId: actor.organizationId,
      projectId: query.projectId,
      supplierId: query.supplierId,
      purchaseOrderId: query.purchaseOrderId,
      forwarderId: query.forwarderId,
      mode: query.mode,
      status: query.status,
      purchaseOrder: {
        purchaseRequest: {
          project: this.policy.projectWhere(actor, 'logistics.shipment.read'),
        },
      },
      OR: query.search
        ? [
            {
              shipmentNumber: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              trackingNumber: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              containerNumber: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          ]
        : undefined,
      etd:
        query.etdFrom || query.etdTo
          ? { gte: query.etdFrom, lte: query.etdTo }
          : undefined,
      eta:
        query.etaFrom || query.etaTo
          ? { gte: query.etaFrom, lte: query.etaTo }
          : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where,
        include: {
          forwarder: { select: { id: true, legalName: true } },
          purchaseOrder: { select: { id: true, poNumber: true } },
          _count: { select: { items: true, packages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.shipment.count({ where }),
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
    const shipment = await this.prisma.shipment.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        purchaseOrder: {
          purchaseRequest: {
            project: this.policy.projectWhere(actor, 'logistics.shipment.read'),
          },
        },
      },
      include: {
        purchaseOrder: {
          select: { id: true, poNumber: true, createdBy: true },
        },
        productionOrder: { select: { id: true, status: true, ownerId: true } },
        forwarder: true,
        legs: { orderBy: { sequence: 'asc' } },
        packages: { orderBy: { packageNumber: 'asc' } },
        items: {
          include: {
            purchaseOrderLine: {
              select: {
                customDescription: true,
                quantity: true,
                unit: true,
              },
            },
          },
        },
        documents: { orderBy: { createdAt: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        customsDeclarations: {
          include: { lines: true, taxes: true, documents: true },
          orderBy: { createdAt: 'desc' },
        },
        landedCosts: {
          include: { lines: { include: { allocations: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  async create(actor: CurrentActor, data: CreateShipmentDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.shipment.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: actor.organizationId,
              idempotencyKey: data.idempotencyKey,
            },
          },
          include: { items: true },
        });
        if (existing) return existing;
        const po = await tx.purchaseOrder.findFirst({
          where: {
            id: data.purchaseOrderId,
            organizationId: actor.organizationId,
            status: 'CONFIRMED',
            purchaseRequest: { project: this.policy.projectWhere(actor) },
          },
          include: {
            lines: true,
            productionOrder: true,
            shipments: {
              where: { status: { notIn: ['CANCELLED'] } },
              include: { items: true },
            },
          },
        });
        if (!po)
          throw new UnprocessableEntityException('Confirmed PO required');
        if (
          po.productionOrder &&
          po.productionOrder.status !== 'READY_FOR_SHIPMENT'
        )
          throw new ConflictException('Production is not ready for shipment');
        if (
          data.productionOrderId &&
          data.productionOrderId !== po.productionOrder?.id
        )
          throw new UnprocessableEntityException(
            'Production order must belong to PO',
          );
        if (data.forwarderId) {
          const forwarder = await tx.forwarder.findFirst({
            where: {
              id: data.forwarderId,
              organizationId: actor.organizationId,
              activeStatus: 'active',
            },
          });
          if (!forwarder) throw new NotFoundException('Forwarder not found');
        }
        const poLines = new Map(po.lines.map((line) => [line.id, line]));
        const allocated = new Map<string, Prisma.Decimal>();
        for (const shipment of po.shipments)
          for (const item of shipment.items)
            allocated.set(
              item.purchaseOrderLineId,
              (
                allocated.get(item.purchaseOrderLineId) ?? new Prisma.Decimal(0)
              ).plus(item.quantity),
            );
        const seen = new Set<string>();
        const items = data.items.map((input) => {
          const line = poLines.get(input.purchaseOrderLineId);
          if (!line || seen.has(input.purchaseOrderLineId))
            throw new UnprocessableEntityException(
              'Shipment line must be unique and belong to PO',
            );
          seen.add(input.purchaseOrderLineId);
          const quantity = new Prisma.Decimal(input.quantity);
          if (
            quantity.lte(0) ||
            quantity
              .plus(
                allocated.get(input.purchaseOrderLineId) ??
                  new Prisma.Decimal(0),
              )
              .gt(line.quantity.minus(line.cancelledQuantity))
          )
            throw new UnprocessableEntityException(
              'Shipment quantity exceeds PO remaining quantity',
            );
          return {
            purchaseOrderLineId: line.id,
            productId: line.productId,
            variantId: line.variantId,
            quantity,
            unit: line.unit,
            unitValue: line.netUnitPrice,
            weight: input.weight ? new Prisma.Decimal(input.weight) : undefined,
            volume: input.volume ? new Prisma.Decimal(input.volume) : undefined,
          };
        });
        const shipment = await tx.shipment.create({
          data: {
            organizationId: actor.organizationId,
            shipmentNumber: data.shipmentNumber,
            projectId: po.projectId,
            supplierId: po.supplierId,
            purchaseOrderId: po.id,
            productionOrderId: po.productionOrder?.id,
            forwarderId: data.forwarderId,
            idempotencyKey: data.idempotencyKey,
            mode: data.mode,
            incoterms: data.incoterms,
            originCountry: data.originCountry,
            originLocation: data.originLocation,
            destinationCountry: data.destinationCountry,
            destinationLocation: data.destinationLocation,
            portOfLoading: data.portOfLoading,
            portOfDischarge: data.portOfDischarge,
            etd: data.etd,
            eta: data.eta,
            notes: data.notes,
            createdBy: actor.userId,
            updatedBy: actor.userId,
            items: { create: items },
            statusHistory: {
              create: { toStatus: 'PLANNING', actorId: actor.userId },
            },
          },
          include: { items: true },
        });
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'SHIPMENT_CREATED',
            entityType: 'Shipment',
            entityId: shipment.id,
          },
        });
        return shipment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async update(actor: CurrentActor, id: string, data: UpdateShipmentDto) {
    const item = await this.get(actor, id);
    if (['CLOSED', 'CANCELLED'].includes(item.status))
      throw new ConflictException('Closed shipment is immutable');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.update({
        where: { id },
        data: { ...data, updatedBy: actor.userId, version: { increment: 1 } },
      });
      if (
        (data.etd !== undefined &&
          data.etd.getTime() !== item.etd?.getTime()) ||
        (data.eta !== undefined && data.eta.getTime() !== item.eta?.getTime())
      )
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId: id,
            fromStatus: item.status,
            toStatus: item.status,
            previousEtd: item.etd,
            nextEtd: data.etd,
            previousEta: item.eta,
            nextEta: data.eta,
            actorId: actor.userId,
            comment: 'SCHEDULE_UPDATED',
          },
        });
      return updated;
    });
  }

  async transition(actor: CurrentActor, id: string, data: ShipmentStatusDto) {
    const item = await this.get(actor, id);
    const allowed: Record<string, string[]> = {
      PLANNING: ['BOOKED', 'CANCELLED'],
      BOOKED: ['PICKED_UP', 'CANCELLED'],
      PICKED_UP: ['DEPARTED', 'CANCELLED'],
      DEPARTED: ['IN_TRANSIT'],
      IN_TRANSIT: ['CUSTOMS_CLEARANCE', 'ARRIVED'],
      CUSTOMS_CLEARANCE: ['ARRIVED'],
      ARRIVED: ['DELIVERED_TO_WAREHOUSE'],
      DELIVERED_TO_WAREHOUSE: ['CLOSED'],
    };
    if (!allowed[item.status]?.includes(data.status))
      throw new ConflictException('Invalid shipment transition');
    if (
      data.status === 'ARRIVED' &&
      item.customsDeclarations.some(
        (declaration) => declaration.status !== 'CLEARED',
      )
    )
      throw new ConflictException('Customs declaration must be cleared');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.update({
        where: { id },
        data: {
          status: data.status,
          actualDeparture: data.status === 'DEPARTED' ? new Date() : undefined,
          actualArrival: data.status === 'ARRIVED' ? new Date() : undefined,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: id,
          fromStatus: item.status,
          toStatus: data.status,
          actorId: actor.userId,
          comment: data.comment,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `SHIPMENT_${data.status}`,
          entityType: 'Shipment',
          entityId: id,
        },
      });
      const recipient =
        item.productionOrder?.ownerId ?? item.purchaseOrder.createdBy;
      if (recipient !== actor.userId)
        await tx.notification.create({
          data: {
            organizationId: actor.organizationId,
            recipientId: recipient,
            actorId: actor.userId,
            type: 'SHIPMENT_STATUS_CHANGED',
            title: `${item.shipmentNumber}: ${data.status}`,
            entityType: 'Shipment',
            entityId: id,
            projectId: item.projectId,
          },
        });
      return updated;
    });
  }

  async addLeg(actor: CurrentActor, id: string, data: ShipmentLegDto) {
    await this.get(actor, id);
    return this.prisma.shipmentLeg.create({
      data: { ...data, shipmentId: id },
    });
  }

  async addPackage(actor: CurrentActor, id: string, data: ShipmentPackageDto) {
    await this.get(actor, id);
    return this.prisma.shipmentPackage.create({
      data: {
        ...data,
        grossWeight: data.grossWeight
          ? new Prisma.Decimal(data.grossWeight)
          : undefined,
        netWeight: data.netWeight
          ? new Prisma.Decimal(data.netWeight)
          : undefined,
        volume: data.volume ? new Prisma.Decimal(data.volume) : undefined,
        shipmentId: id,
      },
    });
  }

  async addItem(actor: CurrentActor, id: string, data: ShipmentItemDto) {
    const shipment = await this.get(actor, id);
    if (shipment.status !== 'PLANNING')
      throw new ConflictException('Items can only change while planning');
    const source = await this.prisma.purchaseOrderLine.findFirst({
      where: {
        id: data.purchaseOrderLineId,
        purchaseOrderId: shipment.purchaseOrderId,
      },
    });
    if (!source)
      throw new UnprocessableEntityException('PO line not in shipment PO');
    const quantity = new Prisma.Decimal(data.quantity);
    const shipped = await this.prisma.shipmentItem.aggregate({
      where: {
        purchaseOrderLineId: source.id,
        shipment: { status: { not: 'CANCELLED' } },
      },
      _sum: { quantity: true },
    });
    if (
      quantity.lte(0) ||
      quantity
        .plus(shipped._sum.quantity ?? 0)
        .gt(source.quantity.minus(source.cancelledQuantity))
    )
      throw new UnprocessableEntityException(
        'Shipment quantity exceeds PO remaining quantity',
      );
    return this.prisma.shipmentItem.create({
      data: {
        shipmentId: id,
        purchaseOrderLineId: source.id,
        productId: source.productId,
        variantId: source.variantId,
        quantity,
        unit: source.unit,
        unitValue: source.netUnitPrice,
        weight: data.weight ? new Prisma.Decimal(data.weight) : undefined,
        volume: data.volume ? new Prisma.Decimal(data.volume) : undefined,
        packageId: data.packageId,
      },
    });
  }

  async addDocument(
    actor: CurrentActor,
    id: string,
    data: ShipmentDocumentDto,
  ) {
    const shipment = await this.get(actor, id);
    const file = await findProjectFile(
      this.prisma,
      actor,
      shipment.projectId,
      data.fileId,
    );
    if (!file) throw new NotFoundException('File not found');
    const latest = await this.prisma.shipmentDocument.aggregate({
      where: { shipmentId: id, type: data.type },
      _max: { version: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.shipmentDocument.create({
        data: {
          shipmentId: id,
          fileId: file.id,
          type: data.type,
          checksum: data.checksum.toLowerCase(),
          version: (latest._max.version ?? 0) + 1,
          createdBy: actor.userId,
        },
      });
      await tx.entityAttachment.upsert({
        where: {
          fileAssetId_entityType_entityId: {
            fileAssetId: file.id,
            entityType: 'Shipment',
            entityId: id,
          },
        },
        update: {},
        create: {
          fileAssetId: file.id,
          entityType: 'Shipment',
          entityId: id,
          projectId: shipment.projectId,
          createdBy: actor.userId,
        },
      });
      return document;
    });
  }

  async createCustoms(actor: CurrentActor, data: CreateCustomsDto) {
    const shipment = await this.get(actor, data.shipmentId);
    if (
      !['IN_TRANSIT', 'CUSTOMS_CLEARANCE', 'ARRIVED'].includes(shipment.status)
    )
      throw new ConflictException('Shipment is not ready for customs');
    const shipmentItems = new Map(
      shipment.items.map((item) => [item.id, item]),
    );
    if (
      new Set(data.lines.map(({ shipmentItemId }) => shipmentItemId)).size !==
      data.lines.length
    )
      throw new UnprocessableEntityException('Duplicate customs item');
    const exchangeRate = new Prisma.Decimal(data.exchangeRateSnapshot);
    if (exchangeRate.lte(0))
      throw new UnprocessableEntityException('Exchange rate must be positive');
    const lines = data.lines.map((line) => {
      const item = shipmentItems.get(line.shipmentItemId);
      const quantity = new Prisma.Decimal(line.quantity);
      const customsValue = new Prisma.Decimal(line.customsValue);
      const dutyRate = new Prisma.Decimal(line.dutyRate ?? 0);
      if (
        !item ||
        quantity.lte(0) ||
        quantity.gt(item.quantity) ||
        customsValue.lt(0) ||
        dutyRate.lt(0)
      )
        throw new UnprocessableEntityException('Invalid customs line');
      return {
        ...line,
        quantity,
        customsValue,
        dutyRate,
        dutyAmount: customsValue.mul(dutyRate).div(100).toDecimalPlaces(2),
      };
    });
    const customsValue = lines.reduce(
      (sum, line) => sum.plus(line.customsValue),
      new Prisma.Decimal(0),
    );
    const dutyAmount = lines.reduce(
      (sum, line) => sum.plus(line.dutyAmount),
      new Prisma.Decimal(0),
    );
    const vatAmount = new Prisma.Decimal(data.vatAmount ?? 0);
    const otherTaxAmount = new Prisma.Decimal(data.otherTaxAmount ?? 0);
    if (vatAmount.lt(0) || otherTaxAmount.lt(0))
      throw new UnprocessableEntityException('Tax cannot be negative');
    return this.prisma.customsDeclaration.create({
      data: {
        organizationId: actor.organizationId,
        shipmentId: shipment.id,
        projectId: shipment.projectId,
        declarationNumber: data.declarationNumber,
        declarationDate: data.declarationDate,
        customsOffice: data.customsOffice,
        importerLegalEntity: data.importerLegalEntity,
        currency: data.currency,
        customsValue,
        exchangeRateSnapshot: exchangeRate,
        dutyAmount,
        vatAmount,
        otherTaxAmount,
        totalTaxAmount: dutyAmount.plus(vatAmount).plus(otherTaxAmount),
        notes: data.notes,
        createdBy: actor.userId,
        updatedBy: actor.userId,
        lines: { create: lines },
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
      include: { lines: true },
    });
  }

  async getCustoms(actor: CurrentActor, id: string) {
    const item = await this.prisma.customsDeclaration.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        shipment: {
          purchaseOrder: {
            purchaseRequest: { project: this.policy.projectWhere(actor) },
          },
        },
      },
      include: { shipment: true, lines: true, taxes: true, documents: true },
    });
    if (!item) throw new NotFoundException('Customs declaration not found');
    return item;
  }

  listCustoms(actor: CurrentActor) {
    return this.prisma.customsDeclaration.findMany({
      where: {
        organizationId: actor.organizationId,
        shipment: {
          purchaseOrder: {
            purchaseRequest: { project: this.policy.projectWhere(actor) },
          },
        },
      },
      include: {
        shipment: { select: { id: true, shipmentNumber: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async transitionCustoms(
    actor: CurrentActor,
    id: string,
    data: CustomsStatusDto,
  ) {
    const item = await this.getCustoms(actor, id);
    const allowed: Record<string, string[]> = {
      DRAFT: ['SUBMITTED', 'CANCELLED'],
      SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
      UNDER_REVIEW: ['ADDITIONAL_DOCUMENT_REQUIRED', 'ASSESSED', 'REJECTED'],
      ADDITIONAL_DOCUMENT_REQUIRED: ['UNDER_REVIEW', 'CANCELLED'],
      ASSESSED: ['TAX_DUE'],
      TAX_DUE: ['TAX_PAID'],
      TAX_PAID: ['CLEARED'],
    };
    if (!allowed[item.status]?.includes(data.status))
      throw new ConflictException('Invalid customs transition');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customsDeclaration.update({
        where: { id },
        data: {
          status: data.status,
          clearanceDate: data.status === 'CLEARED' ? new Date() : undefined,
          updatedBy: actor.userId,
        },
      });
      await tx.customsStatusHistory.create({
        data: {
          customsDeclarationId: id,
          fromStatus: item.status,
          toStatus: data.status,
          actorId: actor.userId,
          comment: data.comment,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `CUSTOMS_${data.status}`,
          entityType: 'CustomsDeclaration',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async createLandedCost(actor: CurrentActor, data: CreateLandedCostDto) {
    const shipment = await this.get(actor, data.shipmentId);
    const existing = await this.prisma.landedCost.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: actor.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
      },
      include: { lines: { include: { allocations: true } } },
    });
    if (existing) return existing;
    const items = shipment.items;
    const itemIds = new Set(items.map(({ id }) => id));
    const lines = data.lines.map((line) => {
      const originalAmount = new Prisma.Decimal(line.originalAmount);
      const exchangeRate = new Prisma.Decimal(line.exchangeRateSnapshot);
      if (originalAmount.lt(0) || exchangeRate.lte(0))
        throw new UnprocessableEntityException('Invalid landed cost amount');
      if (line.allocationMethod === 'MANUAL' && !line.manualReason)
        throw new UnprocessableEntityException(
          'Manual allocation reason required',
        );
      const baseAmount = originalAmount.mul(exchangeRate).toDecimalPlaces(2);
      return {
        ...line,
        originalAmount,
        exchangeRateSnapshot: exchangeRate,
        baseAmount,
        allocations: this.allocateCost(
          baseAmount,
          line.allocationMethod,
          line.allocations,
          items,
          itemIds,
        ),
      };
    });
    return this.prisma.landedCost.create({
      data: {
        organizationId: actor.organizationId,
        shipmentId: shipment.id,
        projectId: shipment.projectId,
        number: data.number,
        baseCurrency: data.baseCurrency,
        idempotencyKey: data.idempotencyKey,
        notes: data.notes,
        totalAmount: lines.reduce(
          (sum, line) => sum.plus(line.baseAmount),
          new Prisma.Decimal(0),
        ),
        createdBy: actor.userId,
        updatedBy: actor.userId,
        lines: {
          create: lines.map((line) => ({
            category: line.category,
            description: line.description,
            originalCurrency: line.originalCurrency,
            originalAmount: line.originalAmount,
            exchangeRateSnapshot: line.exchangeRateSnapshot,
            baseAmount: line.baseAmount,
            allocationMethod: line.allocationMethod,
            manualReason: line.manualReason,
            allocations: { create: line.allocations },
          })),
        },
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
      include: { lines: { include: { allocations: true } } },
    });
  }

  async getLandedCost(actor: CurrentActor, id: string) {
    const item = await this.prisma.landedCost.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        shipment: {
          purchaseOrder: {
            purchaseRequest: { project: this.policy.projectWhere(actor) },
          },
        },
      },
      include: {
        shipment: { select: { id: true, shipmentNumber: true } },
        lines: { include: { allocations: true } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Landed cost not found');
    return item;
  }

  listLandedCosts(actor: CurrentActor) {
    return this.prisma.landedCost.findMany({
      where: {
        organizationId: actor.organizationId,
        shipment: {
          purchaseOrder: {
            purchaseRequest: { project: this.policy.projectWhere(actor) },
          },
        },
      },
      include: {
        shipment: { select: { id: true, shipmentNumber: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async finalizeLandedCost(actor: CurrentActor, id: string) {
    const item = await this.getLandedCost(actor, id);
    if (item.status === 'FINALIZED') return item;
    if (item.status !== 'DRAFT')
      throw new ConflictException('Landed cost cannot be finalized');
    for (const line of item.lines)
      if (
        !line.allocations
          .reduce(
            (sum, allocation) => sum.plus(allocation.amount),
            new Prisma.Decimal(0),
          )
          .equals(line.baseAmount)
      )
        throw new UnprocessableEntityException(
          'Landed cost allocation is incomplete',
        );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.landedCost.update({
        where: { id },
        data: {
          status: 'FINALIZED',
          finalizedAt: new Date(),
          finalizedBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await tx.landedCostStatusHistory.create({
        data: {
          landedCostId: id,
          fromStatus: 'DRAFT',
          toStatus: 'FINALIZED',
          actorId: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'LANDED_COST_FINALIZED',
          entityType: 'LandedCost',
          entityId: id,
        },
      });
      return updated;
    });
  }

  private allocateCost(
    total: Prisma.Decimal,
    method: string,
    manual: { shipmentItemId: string; amount: string }[] | undefined,
    items: {
      id: string;
      quantity: Prisma.Decimal;
      unitValue: Prisma.Decimal;
      weight: Prisma.Decimal | null;
      volume: Prisma.Decimal | null;
    }[],
    itemIds: Set<string>,
  ) {
    if (method === 'MANUAL') {
      const allocations = (manual ?? []).map((allocation) => {
        if (!itemIds.has(allocation.shipmentItemId))
          throw new UnprocessableEntityException(
            'Allocation item must belong to shipment',
          );
        return {
          shipmentItemId: allocation.shipmentItemId,
          amount: new Prisma.Decimal(allocation.amount),
        };
      });
      if (
        allocations.some(({ amount }) => amount.lt(0)) ||
        !allocations
          .reduce(
            (sum, allocation) => sum.plus(allocation.amount),
            new Prisma.Decimal(0),
          )
          .equals(total)
      )
        throw new UnprocessableEntityException(
          'Manual allocations must equal line amount',
        );
      return allocations;
    }
    const weights = items.map((item) => {
      const basis =
        method === 'BY_VALUE'
          ? item.quantity.mul(item.unitValue)
          : method === 'BY_WEIGHT'
            ? (item.weight ?? new Prisma.Decimal(0))
            : method === 'BY_VOLUME'
              ? (item.volume ?? new Prisma.Decimal(0))
              : item.quantity;
      return { shipmentItemId: item.id, basis };
    });
    const basisTotal = weights.reduce(
      (sum, item) => sum.plus(item.basis),
      new Prisma.Decimal(0),
    );
    if (basisTotal.lte(0))
      throw new UnprocessableEntityException(
        `Allocation basis unavailable for ${method}`,
      );
    let allocated = new Prisma.Decimal(0);
    return weights.map((item, index) => {
      const amount =
        index === weights.length - 1
          ? total.minus(allocated)
          : total.mul(item.basis).div(basisTotal).toDecimalPlaces(2);
      allocated = allocated.plus(amount);
      return { shipmentItemId: item.shipmentItemId, amount };
    });
  }
}
