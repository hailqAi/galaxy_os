import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { InventoryQuery } from './inventory.dto';

export type InventoryPostingLine = {
  inventoryItemId: string;
  warehouseId: string;
  storageLocationId?: string;
  lotId?: string;
  serialId?: string;
  quantity: string;
  onHandDelta?: string;
  availableDelta?: string;
  reservedDelta?: string;
  inTransitDelta?: string;
  qualityHoldDelta?: string;
  damagedDelta?: string;
  issuedDelta?: string;
  installedDelta?: string;
};

export type InventoryPosting = {
  transactionNumber: string;
  type: string;
  idempotencyKey: string;
  projectId?: string;
  sourceType: string;
  sourceId: string;
  reason?: string;
  lines: InventoryPostingLine[];
};

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
  ) {}

  async items(actor: CurrentActor, query: InventoryQuery) {
    const projectIds = await this.projectIds(actor, query.projectId);
    const where: Prisma.InventoryItemWhereInput = {
      organizationId: actor.organizationId,
      AND: [
        {
          OR: [{ projectId: null }, { projectId: { in: projectIds } }],
        },
        ...(query.search
          ? [
              {
                itemCode: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ]
          : []),
      ],
      productId: query.productId,
      balances: query.warehouseId
        ? { some: { warehouseId: query.warehouseId } }
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        include: { balances: true, lots: true, serials: true },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    const products = new Map(
      (
        await this.prisma.product.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: [...new Set(items.map(({ productId }) => productId))] },
          },
          select: { id: true, productCode: true, name: true },
        })
      ).map((product) => [product.id, product]),
    );
    return {
      items: items.map((item) =>
        this.redactCost(actor, {
          ...item,
          product: products.get(item.productId),
        }),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async item(actor: CurrentActor, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        balances: { include: { warehouse: true, storageLocation: true } },
        lots: true,
        serials: true,
        transactionLines: {
          include: { transaction: true },
          orderBy: { transaction: { postedAt: 'desc' } },
        },
      },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    if (item.projectId)
      await this.policy.assertView(actor, 'Project', item.projectId);
    const product = await this.prisma.product.findFirst({
      where: {
        id: item.productId,
        organizationId: actor.organizationId,
      },
      select: { id: true, productCode: true, name: true },
    });
    return this.redactCost(actor, { ...item, product });
  }

  async balances(actor: CurrentActor, query: InventoryQuery) {
    if (query.projectId)
      await this.policy.assertView(actor, 'Project', query.projectId);
    return this.prisma.inventoryBalance.findMany({
      where: {
        organizationId: actor.organizationId,
        warehouseId: query.warehouseId,
        inventoryItem: { productId: query.productId },
        warehouse: query.projectId
          ? { projectId: query.projectId }
          : {
              OR: [
                { projectId: null },
                { project: this.policy.projectWhere(actor) },
              ],
            },
      },
      include: {
        inventoryItem: true,
        warehouse: true,
        storageLocation: true,
        lot: true,
        serial: true,
      },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async summary(actor: CurrentActor, projectId?: string) {
    if (projectId) await this.policy.assertView(actor, 'Project', projectId);
    const result = await this.prisma.inventoryBalance.aggregate({
      where: {
        organizationId: actor.organizationId,
        warehouse: projectId
          ? { projectId }
          : {
              OR: [
                { projectId: null },
                { project: this.policy.projectWhere(actor) },
              ],
            },
      },
      _sum: {
        onHand: true,
        available: true,
        reserved: true,
        inTransit: true,
        qualityHold: true,
        damaged: true,
        issued: true,
        installed: true,
      },
    });
    return result._sum;
  }

  async transactions(actor: CurrentActor, query: InventoryQuery) {
    const projectIds = query.projectId
      ? (await this.policy.assertView(actor, 'Project', query.projectId),
        [query.projectId])
      : (
          await this.prisma.project.findMany({
            where: this.policy.projectWhere(actor),
            select: { id: true },
          })
        ).map(({ id }) => id);
    return this.prisma.inventoryTransaction.findMany({
      where: {
        organizationId: actor.organizationId,
        OR: [{ projectId: null }, { projectId: { in: projectIds } }],
        type: query.type,
      },
      include: { lines: true },
      orderBy: { postedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  async transaction(actor: CurrentActor, id: string) {
    const item = await this.prisma.inventoryTransaction.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { lines: true },
    });
    if (!item) throw new NotFoundException('Inventory transaction not found');
    if (item.projectId)
      await this.policy.assertView(actor, 'Project', item.projectId);
    return item;
  }

  post(actor: CurrentActor, data: InventoryPosting) {
    if (!data.lines.length)
      throw new UnprocessableEntityException('Inventory lines required');
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          type: data.type,
          projectId: data.projectId,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          reason: data.reason,
          lines: [...data.lines].sort((a, b) =>
            [
              a.inventoryItemId,
              a.warehouseId,
              a.storageLocationId,
              a.lotId,
              a.serialId,
            ]
              .join(':')
              .localeCompare(
                [
                  b.inventoryItemId,
                  b.warehouseId,
                  b.storageLocationId,
                  b.lotId,
                  b.serialId,
                ].join(':'),
              ),
          ),
        }),
      )
      .digest('hex');
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.inventoryTransaction.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: actor.organizationId,
              idempotencyKey: data.idempotencyKey,
            },
          },
          include: { lines: true },
        });
        if (existing) {
          if (
            (existing.payloadHash && existing.payloadHash !== payloadHash) ||
            (!existing.payloadHash &&
              (existing.type !== data.type ||
                existing.sourceType !== data.sourceType ||
                existing.sourceId !== data.sourceId))
          )
            throw new ConflictException('Idempotency payload mismatch');
          return existing;
        }
        if (data.projectId)
          await this.policy.assertView(actor, 'Project', data.projectId);
        const created = await tx.inventoryTransaction.create({
          data: {
            organizationId: actor.organizationId,
            projectId: data.projectId,
            transactionNumber: data.transactionNumber,
            type: data.type,
            idempotencyKey: data.idempotencyKey,
            payloadHash,
            sourceType: data.sourceType,
            sourceId: data.sourceId,
            reason: data.reason,
            postedBy: actor.userId,
          },
        });
        for (const input of data.lines) {
          const item = await tx.inventoryItem.findFirst({
            where: {
              id: input.inventoryItemId,
              organizationId: actor.organizationId,
            },
          });
          const warehouse = await tx.warehouse.findFirst({
            where: {
              id: input.warehouseId,
              organizationId: actor.organizationId,
              activeStatus: 'active',
            },
          });
          if (!item || !warehouse)
            throw new NotFoundException(
              'Inventory item or warehouse not found',
            );
          const frozenCount = await tx.cycleCount.findFirst({
            where: {
              organizationId: actor.organizationId,
              warehouseId: warehouse.id,
              status: { in: ['FROZEN', 'COUNTING', 'REVIEW', 'APPROVED'] },
              lines: {
                some: {
                  inventoryItemId: item.id,
                  storageLocationId: input.storageLocationId,
                },
              },
            },
          });
          if (frozenCount && frozenCount.adjustmentId !== data.sourceId)
            throw new ConflictException('Inventory is frozen for cycle count');
          if (input.storageLocationId) {
            const location = await tx.storageLocation.findFirst({
              where: {
                id: input.storageLocationId,
                warehouseId: warehouse.id,
                activeStatus: 'active',
              },
            });
            if (!location)
              throw new NotFoundException('Storage location not found');
          }
          if (input.lotId) {
            const lot = await tx.inventoryLot.findFirst({
              where: { id: input.lotId, inventoryItemId: item.id },
            });
            if (!lot) throw new NotFoundException('Inventory lot not found');
          }
          if (input.serialId) {
            const serial = await tx.inventorySerial.findFirst({
              where: { id: input.serialId, inventoryItemId: item.id },
            });
            if (!serial)
              throw new NotFoundException('Inventory serial not found');
          }
          const quantity = new Prisma.Decimal(input.quantity);
          const deltas = {
            onHand: new Prisma.Decimal(input.onHandDelta ?? 0),
            available: new Prisma.Decimal(input.availableDelta ?? 0),
            reserved: new Prisma.Decimal(input.reservedDelta ?? 0),
            inTransit: new Prisma.Decimal(input.inTransitDelta ?? 0),
            qualityHold: new Prisma.Decimal(input.qualityHoldDelta ?? 0),
            damaged: new Prisma.Decimal(input.damagedDelta ?? 0),
            issued: new Prisma.Decimal(input.issuedDelta ?? 0),
            installed: new Prisma.Decimal(input.installedDelta ?? 0),
          };
          if (
            quantity.lte(0) ||
            (input.serialId && !quantity.equals(1)) ||
            !deltas.onHand.equals(
              deltas.available
                .plus(deltas.reserved)
                .plus(deltas.qualityHold)
                .plus(deltas.damaged),
            )
          )
            throw new UnprocessableEntityException(
              'Invalid inventory quantity projection',
            );
          const balanceKey = [
            item.id,
            warehouse.id,
            input.storageLocationId ?? '',
            input.lotId ?? '',
            input.serialId ?? '',
          ].join(':');
          const current = await tx.inventoryBalance.findUnique({
            where: {
              organizationId_balanceKey: {
                organizationId: actor.organizationId,
                balanceKey,
              },
            },
          });
          const next = Object.fromEntries(
            Object.entries(deltas).map(([key, delta]) => [
              key,
              delta.plus(
                current?.[key as keyof typeof deltas] instanceof Prisma.Decimal
                  ? (current[key as keyof typeof deltas] as Prisma.Decimal)
                  : 0,
              ),
            ]),
          ) as Record<keyof typeof deltas, Prisma.Decimal>;
          const controlledBuckets = [
            next.reserved,
            next.inTransit,
            next.qualityHold,
            next.damaged,
            next.issued,
            next.installed,
          ];
          if (
            controlledBuckets.some((value) => value.lt(0)) ||
            (!warehouse.allowNegativeStock &&
              (next.onHand.lt(0) || next.available.lt(0)))
          )
            throw new ConflictException('Insufficient inventory balance');
          await tx.inventoryBalance.upsert({
            where: {
              organizationId_balanceKey: {
                organizationId: actor.organizationId,
                balanceKey,
              },
            },
            update: {
              ...next,
              version: { increment: 1 },
            },
            create: {
              organizationId: actor.organizationId,
              balanceKey,
              inventoryItemId: item.id,
              warehouseId: warehouse.id,
              storageLocationId: input.storageLocationId,
              lotId: input.lotId,
              serialId: input.serialId,
              ...next,
            },
          });
          await tx.inventoryTransactionLine.create({
            data: {
              inventoryTransactionId: created.id,
              inventoryItemId: item.id,
              warehouseId: warehouse.id,
              storageLocationId: input.storageLocationId,
              lotId: input.lotId,
              serialId: input.serialId,
              quantity,
              onHandDelta: deltas.onHand,
              availableDelta: deltas.available,
              reservedDelta: deltas.reserved,
              inTransitDelta: deltas.inTransit,
              qualityHoldDelta: deltas.qualityHold,
              damagedDelta: deltas.damaged,
              issuedDelta: deltas.issued,
              installedDelta: deltas.installed,
              unitCostSnapshot: item.unitCost,
              currency: item.currency,
            },
          });
        }
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: `INVENTORY_${data.type}`,
            entityType: 'InventoryTransaction',
            entityId: created.id,
          },
        });
        return tx.inventoryTransaction.findUniqueOrThrow({
          where: { id: created.id },
          include: { lines: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private redactCost<T extends { unitCost?: Prisma.Decimal | null }>(
    actor: CurrentActor,
    item: T,
  ) {
    if (actor.permissions.includes('inventory.cost.read')) return item;
    const safe = { ...item };
    delete safe.unitCost;
    return safe;
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
