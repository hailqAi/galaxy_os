import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { InventoryService } from './inventory.service';

const actor = {
  organizationId: 'org',
  userId: 'user',
  organizationMembershipId: 'member',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

const posting = {
  transactionNumber: 'IT-1',
  type: 'RECEIPT',
  idempotencyKey: 'receipt-1',
  sourceType: 'GoodsReceipt',
  sourceId: '00000000-0000-4000-8000-000000000001',
  lines: [
    {
      inventoryItemId: 'item',
      warehouseId: 'warehouse',
      quantity: '2',
      onHandDelta: '2',
      qualityHoldDelta: '2',
    },
  ],
};

function serviceWith(current: Record<string, unknown> | null = null) {
  const upsert = vi.fn().mockResolvedValue({});
  const tx = {
    inventoryTransaction: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'transaction' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'transaction',
        lines: [],
      }),
    },
    inventoryItem: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'item',
        unitCost: new Prisma.Decimal(10),
        currency: 'VND',
      }),
    },
    warehouse: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'warehouse',
        allowNegativeStock: false,
      }),
    },
    cycleCount: { findFirst: vi.fn().mockResolvedValue(null) },
    inventoryBalance: {
      findUnique: vi.fn().mockResolvedValue(current),
      upsert,
    },
    inventoryTransactionLine: { create: vi.fn() },
    activity: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation((run) => run(tx)),
  } as unknown as PrismaService;
  return {
    service: new InventoryService(prisma, {} as BusinessEntityPolicy),
    tx,
    upsert,
  };
}

describe('Inventory core', () => {
  it('posts an immutable transaction and projects all balance buckets', async () => {
    const { service, upsert } = serviceWith();
    await service.post(actor, posting);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          onHand: new Prisma.Decimal(2),
          qualityHold: new Prisma.Decimal(2),
          available: new Prisma.Decimal(0),
        }),
      }),
    );
  });

  it('returns an existing transaction for the same idempotency key', async () => {
    const { service, tx, upsert } = serviceWith();
    tx.inventoryTransaction.findUnique.mockResolvedValue({
      id: 'existing',
      type: posting.type,
      sourceType: posting.sourceType,
      sourceId: posting.sourceId,
      payloadHash: null,
      lines: [],
    });
    await expect(service.post(actor, posting)).resolves.toMatchObject({
      id: 'existing',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with another payload', async () => {
    const { service, tx } = serviceWith();
    tx.inventoryTransaction.findUnique.mockResolvedValue({
      id: 'existing',
      payloadHash: 'different',
      lines: [],
    });
    await expect(service.post(actor, posting)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a movement that would make stock negative', async () => {
    const { service } = serviceWith({
      onHand: new Prisma.Decimal(0),
      available: new Prisma.Decimal(0),
      reserved: new Prisma.Decimal(0),
      inTransit: new Prisma.Decimal(0),
      qualityHold: new Prisma.Decimal(0),
      damaged: new Prisma.Decimal(0),
      issued: new Prisma.Decimal(0),
      installed: new Prisma.Decimal(0),
    });
    await expect(
      service.post(actor, {
        ...posting,
        type: 'ISSUE',
        lines: [
          {
            inventoryItemId: 'item',
            warehouseId: 'warehouse',
            quantity: '1',
            onHandDelta: '-1',
            availableDelta: '-1',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('never permits negative reserved stock', async () => {
    const { service, tx } = serviceWith({
      onHand: new Prisma.Decimal(1),
      available: new Prisma.Decimal(1),
      reserved: new Prisma.Decimal(0),
      inTransit: new Prisma.Decimal(0),
      qualityHold: new Prisma.Decimal(0),
      damaged: new Prisma.Decimal(0),
      issued: new Prisma.Decimal(0),
      installed: new Prisma.Decimal(0),
    });
    tx.warehouse.findFirst.mockResolvedValue({
      id: 'warehouse',
      allowNegativeStock: true,
    });
    await expect(
      service.post(actor, {
        ...posting,
        type: 'RELEASE_RESERVATION',
        lines: [
          {
            inventoryItemId: 'item',
            warehouseId: 'warehouse',
            quantity: '1',
            availableDelta: '1',
            reservedDelta: '-1',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hides unit cost without financial inventory permission', async () => {
    const service = new InventoryService(
      {
        inventoryItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'item',
            unitCost: new Prisma.Decimal(10),
            balances: [],
            lots: [],
            serials: [],
            transactionLines: [],
          }),
        },
        product: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      {} as BusinessEntityPolicy,
    );
    const result = await service.item(actor, 'item');
    expect(result).not.toHaveProperty('unitCost');
  });
});
