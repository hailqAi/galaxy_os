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
import { InventoryService, InventoryPostingLine } from './inventory.service';
import {
  CreateAdjustmentDto,
  CreateCycleCountDto,
  CreateIssueDto,
  CreateReservationDto,
  CreateReturnDto,
  CreateTransferDto,
  ReceiveTransferDto,
  RecordCountDto,
} from './operations.dto';

@Injectable()
export class InventoryOperationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
    @Inject(InventoryService) private readonly inventory: InventoryService,
  ) {}

  async reservations(actor: CurrentActor, projectId?: string) {
    const ids = await this.projectIds(actor, projectId);
    return this.prisma.inventoryReservation.findMany({
      where: { organizationId: actor.organizationId, projectId: { in: ids } },
      include: { lines: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createReservation(actor: CurrentActor, data: CreateReservationDto) {
    await this.policy.assertView(actor, 'Project', data.projectId);
    await this.assertWarehouse(actor, data.warehouseId);
    return this.prisma.inventoryReservation.create({
      data: {
        organizationId: actor.organizationId,
        projectId: data.projectId,
        warehouseId: data.warehouseId,
        reservationNumber: data.reservationNumber,
        requiredDate: data.requiredDate,
        purpose: data.purpose,
        requestedBy: actor.userId,
        lines: {
          create: data.lines.map((line) => ({
            ...line,
            quantity: new Prisma.Decimal(line.quantity),
          })),
        },
        statusHistory: {
          create: { toStatus: 'REQUESTED', actorId: actor.userId },
        },
      },
      include: { lines: true },
    });
  }

  async approveReservation(actor: CurrentActor, id: string, comment?: string) {
    const item = await this.reservation(actor, id);
    if (item.status !== 'REQUESTED')
      throw new ConflictException('Reservation is not pending');
    if (item.requestedBy === actor.userId)
      throw new ForbiddenException('Requester cannot approve reservation');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryReservation.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: actor.userId },
      });
      await tx.inventoryReservationStatusHistory.create({
        data: {
          inventoryReservationId: id,
          fromStatus: 'REQUESTED',
          toStatus: 'APPROVED',
          actorId: actor.userId,
          comment,
        },
      });
      return updated;
    });
  }

  async reserve(actor: CurrentActor, id: string) {
    const item = await this.reservation(actor, id);
    if (item.status === 'RESERVED') return item;
    if (item.status !== 'APPROVED')
      throw new ConflictException('Approved reservation required');
    await this.inventory.post(actor, {
      transactionNumber: `RESERVE-${item.reservationNumber}`,
      type: 'RESERVE',
      idempotencyKey: `reservation:${item.id}:reserve`,
      projectId: item.projectId,
      sourceType: 'InventoryReservation',
      sourceId: item.id,
      lines: item.lines.map((line) => ({
        ...this.postingIdentity(line, item.warehouseId),
        quantity: line.quantity.toString(),
        availableDelta: line.quantity.negated().toString(),
        reservedDelta: line.quantity.toString(),
      })),
    });
    return this.setReservationStatus(actor, item, 'RESERVED');
  }

  async releaseReservation(actor: CurrentActor, id: string) {
    const item = await this.reservation(actor, id);
    if (item.status === 'RELEASED') return item;
    if (!['RESERVED', 'PARTIALLY_ISSUED'].includes(item.status))
      throw new ConflictException('Reserved inventory required');
    const lines = item.lines
      .map((line) => ({
        line,
        quantity: line.quantity.minus(line.issuedQuantity),
      }))
      .filter(({ quantity }) => quantity.gt(0))
      .map(({ line, quantity }) => ({
        ...this.postingIdentity(line, item.warehouseId),
        quantity: quantity.toString(),
        availableDelta: quantity.toString(),
        reservedDelta: quantity.negated().toString(),
      }));
    if (lines.length)
      await this.inventory.post(actor, {
        transactionNumber: `RELEASE-${item.reservationNumber}`,
        type: 'RELEASE_RESERVATION',
        idempotencyKey: `reservation:${item.id}:release`,
        projectId: item.projectId,
        sourceType: 'InventoryReservation',
        sourceId: item.id,
        lines,
      });
    return this.setReservationStatus(actor, item, 'RELEASED');
  }

  async transfers(actor: CurrentActor) {
    const projectIds = await this.projectIds(actor);
    return this.prisma.stockTransfer.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [{ projectId: null }, { projectId: { in: projectIds } }],
      },
      include: { lines: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createTransfer(actor: CurrentActor, data: CreateTransferDto) {
    if (data.projectId)
      await this.policy.assertView(actor, 'Project', data.projectId);
    await Promise.all([
      this.assertWarehouse(actor, data.sourceWarehouseId),
      this.assertWarehouse(actor, data.destinationWarehouseId),
    ]);
    if (
      data.sourceWarehouseId === data.destinationWarehouseId &&
      data.type !== 'LOCATION_TO_LOCATION'
    )
      throw new UnprocessableEntityException('Transfer warehouses must differ');
    return this.prisma.stockTransfer.create({
      data: {
        organizationId: actor.organizationId,
        projectId: data.projectId,
        transferNumber: data.transferNumber,
        type: data.type,
        sourceWarehouseId: data.sourceWarehouseId,
        destinationWarehouseId: data.destinationWarehouseId,
        createdBy: actor.userId,
        lines: {
          create: data.lines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            sourceLocationId: line.storageLocationId,
            destinationLocationId: line.destinationLocationId,
            lotId: line.lotId,
            serialId: line.serialId,
            quantity: new Prisma.Decimal(line.quantity),
          })),
        },
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
      include: { lines: true },
    });
  }

  async approveTransfer(actor: CurrentActor, id: string) {
    const item = await this.transfer(actor, id);
    if (item.status !== 'DRAFT')
      throw new ConflictException('Draft transfer required');
    if (item.createdBy === actor.userId)
      throw new ForbiddenException('Creator cannot approve transfer');
    return this.setTransferStatus(actor, item, 'APPROVED', actor.userId);
  }

  async dispatchTransfer(actor: CurrentActor, id: string) {
    const item = await this.transfer(actor, id);
    if (item.status === 'IN_TRANSIT') return item;
    if (item.status !== 'APPROVED')
      throw new ConflictException('Approved transfer required');
    await this.inventory.post(actor, {
      transactionNumber: `TRANSFER-OUT-${item.transferNumber}`,
      type: 'TRANSFER_OUT',
      idempotencyKey: `transfer:${item.id}:out`,
      projectId: item.projectId ?? undefined,
      sourceType: 'StockTransfer',
      sourceId: item.id,
      lines: item.lines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        warehouseId: item.sourceWarehouseId,
        storageLocationId: line.sourceLocationId ?? undefined,
        lotId: line.lotId ?? undefined,
        serialId: line.serialId ?? undefined,
        quantity: line.quantity.toString(),
        onHandDelta: line.quantity.negated().toString(),
        availableDelta: line.quantity.negated().toString(),
        inTransitDelta: line.quantity.toString(),
      })),
    });
    return this.setTransferStatus(actor, item, 'IN_TRANSIT');
  }

  async receiveTransfer(
    actor: CurrentActor,
    id: string,
    data: ReceiveTransferDto,
  ) {
    const item = await this.transfer(actor, id);
    if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(item.status))
      throw new ConflictException('In-transit transfer required');
    const byId = new Map(item.lines.map((line) => [line.id, line]));
    const posting: InventoryPostingLine[] = [];
    for (const input of data.lines) {
      const line = byId.get(input.stockTransferLineId);
      const quantity = new Prisma.Decimal(input.quantity);
      if (
        !line ||
        quantity.lte(0) ||
        line.receivedQuantity.plus(quantity).gt(line.quantity)
      )
        throw new UnprocessableEntityException('Invalid received quantity');
      posting.push(
        {
          inventoryItemId: line.inventoryItemId,
          warehouseId: item.sourceWarehouseId,
          storageLocationId: line.sourceLocationId ?? undefined,
          lotId: line.lotId ?? undefined,
          serialId: line.serialId ?? undefined,
          quantity: quantity.toString(),
          inTransitDelta: quantity.negated().toString(),
        },
        {
          inventoryItemId: line.inventoryItemId,
          warehouseId: item.destinationWarehouseId,
          storageLocationId: line.destinationLocationId ?? undefined,
          lotId: line.lotId ?? undefined,
          serialId: line.serialId ?? undefined,
          quantity: quantity.toString(),
          onHandDelta: quantity.toString(),
          availableDelta: quantity.toString(),
        },
      );
    }
    const idempotencyKey = `transfer:${item.id}:in:${data.idempotencyKey}`;
    const alreadyPosted = await this.prisma.inventoryTransaction.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: actor.organizationId,
          idempotencyKey,
        },
      },
    });
    await this.inventory.post(actor, {
      transactionNumber: `TRANSFER-IN-${item.transferNumber}-${data.idempotencyKey}`,
      type: 'TRANSFER_IN',
      idempotencyKey,
      projectId: item.projectId ?? undefined,
      sourceType: 'StockTransfer',
      sourceId: item.id,
      lines: posting,
    });
    if (alreadyPosted) return item;
    await this.prisma.$transaction(
      data.lines.map((input) =>
        this.prisma.stockTransferLine.update({
          where: { id: input.stockTransferLineId },
          data: {
            receivedQuantity: { increment: new Prisma.Decimal(input.quantity) },
          },
        }),
      ),
    );
    const refreshed = await this.transfer(actor, id);
    const complete = refreshed.lines.every((line) =>
      line.receivedQuantity.equals(line.quantity),
    );
    return this.setTransferStatus(
      actor,
      refreshed,
      complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
    );
  }

  async issues(actor: CurrentActor) {
    const projectIds = await this.projectIds(actor);
    return this.prisma.stockIssue.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [{ projectId: null }, { projectId: { in: projectIds } }],
      },
      include: { lines: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createIssue(actor: CurrentActor, data: CreateIssueDto) {
    if (data.projectId)
      await this.policy.assertView(actor, 'Project', data.projectId);
    if (data.evidenceFileId) {
      if (!data.projectId)
        throw new UnprocessableEntityException(
          'Project is required for issue evidence',
        );
      const file = await findProjectFile(
        this.prisma,
        actor,
        data.projectId,
        data.evidenceFileId,
      );
      if (!file) throw new NotFoundException('File not found');
    }
    await this.assertWarehouse(actor, data.warehouseId);
    return this.prisma.stockIssue.create({
      data: {
        organizationId: actor.organizationId,
        projectId: data.projectId,
        warehouseId: data.warehouseId,
        issueNumber: data.issueNumber,
        reason: data.reason,
        recipient: data.recipient,
        evidenceFileId: data.evidenceFileId,
        createdBy: actor.userId,
        lines: {
          create: data.lines.map((line) => ({
            ...line,
            quantity: new Prisma.Decimal(line.quantity),
          })),
        },
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
      include: { lines: true },
    });
  }

  async approveIssue(actor: CurrentActor, id: string) {
    const item = await this.issue(actor, id);
    if (item.status !== 'DRAFT')
      throw new ConflictException('Draft issue required');
    if (item.createdBy === actor.userId)
      throw new ForbiddenException('Creator cannot approve issue');
    return this.setIssueStatus(actor, item, 'APPROVED', actor.userId);
  }

  async postIssue(actor: CurrentActor, id: string) {
    const item = await this.issue(actor, id);
    if (item.status === 'ISSUED') return item;
    if (item.status !== 'APPROVED')
      throw new ConflictException('Approved issue required');
    const reservationLines = new Map(
      (
        await this.prisma.inventoryReservationLine.findMany({
          where: {
            id: {
              in: item.lines.flatMap(({ reservationLineId }) =>
                reservationLineId ? [reservationLineId] : [],
              ),
            },
            reservation: { projectId: item.projectId ?? undefined },
          },
        })
      ).map((line) => [line.id, line]),
    );
    const idempotencyKey = `issue:${item.id}`;
    const alreadyPosted = await this.prisma.inventoryTransaction.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: actor.organizationId,
          idempotencyKey,
        },
      },
    });
    await this.inventory.post(actor, {
      transactionNumber: `ISSUE-${item.issueNumber}`,
      type: 'ISSUE',
      idempotencyKey,
      projectId: item.projectId ?? undefined,
      sourceType: 'StockIssue',
      sourceId: item.id,
      lines: item.lines.map((line) => {
        const reserved = line.reservationLineId
          ? reservationLines.get(line.reservationLineId)
          : null;
        if (
          line.reservationLineId &&
          (!reserved ||
            reserved.inventoryItemId !== line.inventoryItemId ||
            reserved.storageLocationId !== line.storageLocationId ||
            reserved.lotId !== line.lotId ||
            reserved.serialId !== line.serialId ||
            reserved.quantity.minus(reserved.issuedQuantity).lt(line.quantity))
        )
          throw new ConflictException('Reservation is unavailable');
        return {
          inventoryItemId: line.inventoryItemId,
          warehouseId: item.warehouseId,
          storageLocationId: line.storageLocationId ?? undefined,
          lotId: line.lotId ?? undefined,
          serialId: line.serialId ?? undefined,
          quantity: line.quantity.toString(),
          onHandDelta: line.quantity.negated().toString(),
          ...(reserved
            ? { reservedDelta: line.quantity.negated().toString() }
            : { availableDelta: line.quantity.negated().toString() }),
          issuedDelta: line.quantity.toString(),
        };
      }),
    });
    if (!alreadyPosted)
      for (const line of item.lines)
        if (line.reservationLineId)
          await this.prisma.inventoryReservationLine.update({
            where: { id: line.reservationLineId },
            data: { issuedQuantity: { increment: line.quantity } },
          });
    return this.setIssueStatus(actor, item, 'ISSUED');
  }

  async createReturn(actor: CurrentActor, data: CreateReturnDto) {
    if (data.projectId)
      await this.policy.assertView(actor, 'Project', data.projectId);
    await this.assertWarehouse(actor, data.warehouseId);
    const issueLines = new Map(
      (
        await this.prisma.stockIssueLine.findMany({
          where: {
            id: {
              in: data.lines.flatMap(({ stockIssueLineId }) =>
                stockIssueLineId ? [stockIssueLineId] : [],
              ),
            },
            issue: {
              organizationId: actor.organizationId,
              projectId: data.projectId ?? undefined,
              status: 'ISSUED',
            },
          },
        })
      ).map((line) => [line.id, line]),
    );
    for (const line of data.lines) {
      const source = line.stockIssueLineId
        ? issueLines.get(line.stockIssueLineId)
        : null;
      if (
        line.stockIssueLineId &&
        (!source ||
          source.inventoryItemId !== line.inventoryItemId ||
          new Prisma.Decimal(line.quantity).gt(source.quantity))
      )
        throw new UnprocessableEntityException('Invalid return issue line');
    }
    return this.prisma.stockReturn.create({
      data: {
        organizationId: actor.organizationId,
        projectId: data.projectId,
        warehouseId: data.warehouseId,
        returnNumber: data.returnNumber,
        reason: data.reason,
        createdBy: actor.userId,
        lines: {
          create: data.lines.map((line) => ({
            ...line,
            quantity: new Prisma.Decimal(line.quantity),
          })),
        },
      },
      include: { lines: true },
    });
  }

  async returns(actor: CurrentActor) {
    const projectIds = await this.projectIds(actor);
    return this.prisma.stockReturn.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [{ projectId: null }, { projectId: { in: projectIds } }],
      },
      include: { lines: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async receiveReturn(actor: CurrentActor, id: string) {
    const item = await this.stockReturn(actor, id);
    if (item.status === 'RECEIVED') return item;
    if (item.status !== 'DRAFT')
      throw new ConflictException('Draft return required');
    await this.inventory.post(actor, {
      transactionNumber: `RETURN-${item.returnNumber}`,
      type: 'RETURN',
      idempotencyKey: `return:${item.id}`,
      projectId: item.projectId ?? undefined,
      sourceType: 'StockReturn',
      sourceId: item.id,
      lines: item.lines.flatMap((line) => [
        ...(line.issueLine
          ? [
              {
                inventoryItemId: line.inventoryItemId,
                warehouseId: line.issueLine.issue.warehouseId,
                storageLocationId:
                  line.issueLine.storageLocationId ?? undefined,
                lotId: line.issueLine.lotId ?? undefined,
                serialId: line.issueLine.serialId ?? undefined,
                quantity: line.quantity.toString(),
                issuedDelta: line.quantity.negated().toString(),
              },
            ]
          : []),
        {
          inventoryItemId: line.inventoryItemId,
          warehouseId: item.warehouseId,
          storageLocationId: line.storageLocationId ?? undefined,
          lotId: line.lotId ?? undefined,
          serialId: line.serialId ?? undefined,
          quantity: line.quantity.toString(),
          onHandDelta: line.quantity.toString(),
          qualityHoldDelta: line.quantity.toString(),
        },
      ]),
    });
    return this.prisma.stockReturn.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    });
  }

  async adjustments(actor: CurrentActor) {
    const projectIds = await this.projectIds(actor);
    return this.prisma.stockAdjustment.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [{ projectId: null }, { projectId: { in: projectIds } }],
      },
      include: { lines: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createAdjustment(actor: CurrentActor, data: CreateAdjustmentDto) {
    if (data.projectId)
      await this.policy.assertView(actor, 'Project', data.projectId);
    await this.assertWarehouse(actor, data.warehouseId);
    const lines = data.lines.map((line) => {
      const expected = new Prisma.Decimal(line.expectedQuantity);
      const actual = new Prisma.Decimal(line.actualQuantity);
      return {
        ...line,
        expectedQuantity: expected,
        actualQuantity: actual,
        variance: actual.minus(expected),
      };
    });
    if (lines.every(({ variance }) => variance.isZero()))
      throw new UnprocessableEntityException('Adjustment variance required');
    for (const line of lines) {
      const balanceKey = [
        line.inventoryItemId,
        data.warehouseId,
        line.storageLocationId ?? '',
        line.lotId ?? '',
        line.serialId ?? '',
      ].join(':');
      const balance = await this.prisma.inventoryBalance.findUnique({
        where: {
          organizationId_balanceKey: {
            organizationId: actor.organizationId,
            balanceKey,
          },
        },
      });
      if (!line.expectedQuantity.equals(balance?.onHand ?? 0))
        throw new ConflictException('Inventory balance changed');
    }
    return this.prisma.stockAdjustment.create({
      data: {
        organizationId: actor.organizationId,
        projectId: data.projectId,
        warehouseId: data.warehouseId,
        adjustmentNumber: data.adjustmentNumber,
        reason: data.reason,
        explanation: data.explanation,
        createdBy: actor.userId,
        lines: { create: lines },
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
      include: { lines: true },
    });
  }

  async approveAdjustment(actor: CurrentActor, id: string) {
    const item = await this.adjustment(actor, id);
    if (item.status !== 'DRAFT')
      throw new ConflictException('Draft adjustment required');
    if (item.createdBy === actor.userId)
      throw new ForbiddenException('Creator cannot approve adjustment');
    return this.setAdjustmentStatus(actor, item, 'APPROVED', actor.userId);
  }

  async postAdjustment(actor: CurrentActor, id: string) {
    const item = await this.adjustment(actor, id);
    if (item.status === 'POSTED') return item;
    if (item.status !== 'APPROVED')
      throw new ConflictException('Approved adjustment required');
    await this.inventory.post(actor, {
      transactionNumber: `ADJUST-${item.adjustmentNumber}`,
      type: item.lines.some((line) => line.variance.lt(0))
        ? 'ADJUSTMENT_OUT'
        : 'ADJUSTMENT_IN',
      idempotencyKey: `adjustment:${item.id}`,
      projectId: item.projectId ?? undefined,
      sourceType: 'StockAdjustment',
      sourceId: item.id,
      reason: item.explanation,
      lines: item.lines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        warehouseId: item.warehouseId,
        storageLocationId: line.storageLocationId ?? undefined,
        lotId: line.lotId ?? undefined,
        serialId: line.serialId ?? undefined,
        quantity: line.variance.abs().toString(),
        onHandDelta: line.variance.toString(),
        availableDelta: line.variance.toString(),
      })),
    });
    return this.setAdjustmentStatus(actor, item, 'POSTED');
  }

  async counts(actor: CurrentActor) {
    const projectIds = await this.projectIds(actor);
    return this.prisma.cycleCount.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [{ projectId: null }, { projectId: { in: projectIds } }],
      },
      include: { lines: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createCount(actor: CurrentActor, data: CreateCycleCountDto) {
    if (data.projectId)
      await this.policy.assertView(actor, 'Project', data.projectId);
    await this.assertWarehouse(actor, data.warehouseId);
    return this.prisma.cycleCount.create({
      data: {
        organizationId: actor.organizationId,
        projectId: data.projectId,
        warehouseId: data.warehouseId,
        countNumber: data.countNumber,
        scope: data.scope,
        createdBy: actor.userId,
        statusHistory: {
          create: { toStatus: 'DRAFT', actorId: actor.userId },
        },
      },
    });
  }

  async freezeCount(actor: CurrentActor, id: string) {
    const item = await this.count(actor, id);
    if (item.status !== 'DRAFT')
      throw new ConflictException('Draft count required');
    const scope = item.scope as {
      storageLocationId?: string;
      inventoryItemId?: string;
    };
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        organizationId: actor.organizationId,
        warehouseId: item.warehouseId,
        storageLocationId: scope.storageLocationId,
        inventoryItemId: scope.inventoryItemId,
      },
    });
    return this.prisma.cycleCount.update({
      where: { id },
      data: {
        status: 'FROZEN',
        snapshotAt: new Date(),
        lines: {
          create: balances.map((balance) => ({
            inventoryItemId: balance.inventoryItemId,
            storageLocationId: balance.storageLocationId,
            lotId: balance.lotId,
            serialId: balance.serialId,
            expectedQuantity: balance.onHand,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async recordCount(actor: CurrentActor, id: string, data: RecordCountDto) {
    const item = await this.count(actor, id);
    if (!['FROZEN', 'COUNTING'].includes(item.status))
      throw new ConflictException('Frozen count required');
    const byId = new Map(item.lines.map((line) => [line.id, line]));
    for (const input of data.lines) {
      const line = byId.get(input.cycleCountLineId);
      const counted = new Prisma.Decimal(input.countedQuantity);
      if (!line || counted.lt(0))
        throw new UnprocessableEntityException('Invalid count line');
      await this.prisma.cycleCountLine.update({
        where: { id: line.id },
        data: {
          countedQuantity: counted,
          variance: counted.minus(line.expectedQuantity),
          countedBy: actor.userId,
          countedAt: new Date(),
        },
      });
    }
    return this.prisma.cycleCount.update({
      where: { id },
      data: { status: 'REVIEW', counterId: actor.userId },
    });
  }

  async approveCount(actor: CurrentActor, id: string) {
    const item = await this.count(actor, id);
    if (item.status !== 'REVIEW')
      throw new ConflictException('Reviewed count required');
    if (item.counterId === actor.userId)
      throw new ForbiddenException('Counter cannot approve own count');
    if (item.lines.some((line) => line.countedQuantity === null))
      throw new ConflictException('All count lines must be counted');
    return this.prisma.cycleCount.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: actor.userId },
    });
  }

  async postCount(actor: CurrentActor, id: string) {
    const item = await this.count(actor, id);
    if (item.status === 'POSTED') return item;
    if (item.status !== 'APPROVED')
      throw new ConflictException('Approved count required');
    const varianceLines = item.lines.filter((line) => !line.variance?.isZero());
    if (!varianceLines.length)
      return this.prisma.cycleCount.update({
        where: { id },
        data: { status: 'POSTED' },
      });
    const adjustment = await this.createAdjustment(actor, {
      adjustmentNumber: `COUNT-${item.countNumber}`,
      projectId: item.projectId ?? undefined,
      warehouseId: item.warehouseId,
      reason: 'COUNT_VARIANCE',
      explanation: `Cycle count ${item.countNumber}`,
      lines: varianceLines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        storageLocationId: line.storageLocationId ?? undefined,
        lotId: line.lotId ?? undefined,
        serialId: line.serialId ?? undefined,
        expectedQuantity: line.expectedQuantity.toString(),
        actualQuantity: line.countedQuantity!.toString(),
      })),
    });
    await this.prisma.stockAdjustment.update({
      where: { id: adjustment.id },
      data: { status: 'APPROVED', approvedBy: item.approvedBy },
    });
    await this.prisma.cycleCount.update({
      where: { id },
      data: { adjustmentId: adjustment.id },
    });
    await this.postAdjustment(actor, adjustment.id);
    return this.prisma.cycleCount.update({
      where: { id },
      data: { status: 'POSTED', adjustmentId: adjustment.id },
    });
  }

  private reservation(actor: CurrentActor, id: string) {
    return this.prisma.inventoryReservation
      .findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { lines: true },
      })
      .then(async (item) => {
        if (!item) throw new NotFoundException('Reservation not found');
        await this.policy.assertView(actor, 'Project', item.projectId);
        return item;
      });
  }

  private transfer(actor: CurrentActor, id: string) {
    return this.prisma.stockTransfer
      .findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { lines: true },
      })
      .then(async (item) => {
        if (!item) throw new NotFoundException('Transfer not found');
        if (item.projectId)
          await this.policy.assertView(actor, 'Project', item.projectId);
        return item;
      });
  }

  private issue(actor: CurrentActor, id: string) {
    return this.prisma.stockIssue
      .findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { lines: true },
      })
      .then(async (item) => {
        if (!item) throw new NotFoundException('Issue not found');
        if (item.projectId)
          await this.policy.assertView(actor, 'Project', item.projectId);
        return item;
      });
  }

  private stockReturn(actor: CurrentActor, id: string) {
    return this.prisma.stockReturn
      .findFirst({
        where: { id, organizationId: actor.organizationId },
        include: {
          lines: { include: { issueLine: { include: { issue: true } } } },
        },
      })
      .then(async (item) => {
        if (!item) throw new NotFoundException('Return not found');
        if (item.projectId)
          await this.policy.assertView(actor, 'Project', item.projectId);
        return item;
      });
  }

  private adjustment(actor: CurrentActor, id: string) {
    return this.prisma.stockAdjustment
      .findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { lines: true },
      })
      .then(async (item) => {
        if (!item) throw new NotFoundException('Adjustment not found');
        if (item.projectId)
          await this.policy.assertView(actor, 'Project', item.projectId);
        return item;
      });
  }

  private count(actor: CurrentActor, id: string) {
    return this.prisma.cycleCount
      .findFirst({
        where: { id, organizationId: actor.organizationId },
        include: { lines: true },
      })
      .then(async (item) => {
        if (!item) throw new NotFoundException('Cycle count not found');
        if (item.projectId)
          await this.policy.assertView(actor, 'Project', item.projectId);
        return item;
      });
  }

  private assertWarehouse(actor: CurrentActor, id: string) {
    return this.prisma.warehouse
      .findFirst({
        where: {
          id,
          organizationId: actor.organizationId,
          activeStatus: 'active',
        },
      })
      .then((item) => {
        if (!item) throw new NotFoundException('Warehouse not found');
        return item;
      });
  }

  private postingIdentity(
    line: {
      inventoryItemId: string;
      storageLocationId: string | null;
      lotId: string | null;
      serialId: string | null;
    },
    warehouseId: string,
  ) {
    return {
      inventoryItemId: line.inventoryItemId,
      warehouseId,
      storageLocationId: line.storageLocationId ?? undefined,
      lotId: line.lotId ?? undefined,
      serialId: line.serialId ?? undefined,
    };
  }

  private async setReservationStatus(
    actor: CurrentActor,
    item: { id: string; status: string },
    status: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryReservation.update({
        where: { id: item.id },
        data: { status },
      });
      await tx.inventoryReservationStatusHistory.create({
        data: {
          inventoryReservationId: item.id,
          fromStatus: item.status,
          toStatus: status,
          actorId: actor.userId,
        },
      });
      return updated;
    });
  }

  private async setTransferStatus(
    actor: CurrentActor,
    item: { id: string; status: string },
    status: string,
    approvedBy?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockTransfer.update({
        where: { id: item.id },
        data: { status, approvedBy },
      });
      await tx.stockTransferStatusHistory.create({
        data: {
          stockTransferId: item.id,
          fromStatus: item.status,
          toStatus: status,
          actorId: actor.userId,
        },
      });
      return updated;
    });
  }

  private async setIssueStatus(
    actor: CurrentActor,
    item: { id: string; status: string },
    status: string,
    approvedBy?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockIssue.update({
        where: { id: item.id },
        data: {
          status,
          approvedBy,
          issuedAt: status === 'ISSUED' ? new Date() : undefined,
        },
      });
      await tx.stockIssueStatusHistory.create({
        data: {
          stockIssueId: item.id,
          fromStatus: item.status,
          toStatus: status,
          actorId: actor.userId,
        },
      });
      return updated;
    });
  }

  private async setAdjustmentStatus(
    actor: CurrentActor,
    item: { id: string; status: string },
    status: string,
    approvedBy?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stockAdjustment.update({
        where: { id: item.id },
        data: {
          status,
          approvedBy,
          postedAt: status === 'POSTED' ? new Date() : undefined,
        },
      });
      await tx.stockAdjustmentStatusHistory.create({
        data: {
          stockAdjustmentId: item.id,
          fromStatus: item.status,
          toStatus: status,
          actorId: actor.userId,
        },
      });
      return updated;
    });
  }

  private async projectIds(actor: CurrentActor, projectId?: string) {
    if (projectId) {
      await this.policy.assertView(actor, 'Project', projectId);
      return [projectId];
    }
    return (
      await this.prisma.project.findMany({
        where: this.policy.projectWhere(actor),
        select: { id: true },
      })
    ).map(({ id }) => id);
  }
}
