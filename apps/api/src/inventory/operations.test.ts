import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { InventoryService } from './inventory.service';
import { InventoryOperationsService } from './operations.service';

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
const policy = {
  assertView: vi.fn(),
  projectWhere: vi.fn().mockReturnValue({}),
} as unknown as BusinessEntityPolicy;

describe('Inventory operations', () => {
  it('prevents reservation requester self approval', async () => {
    const service = new InventoryOperationsService(
      {
        inventoryReservation: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'reservation',
            projectId: 'project',
            status: 'REQUESTED',
            requestedBy: actor.userId,
            lines: [],
          }),
        },
      } as unknown as PrismaService,
      policy,
      {} as InventoryService,
    );
    await expect(
      service.approveReservation(actor, 'reservation'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reserves by moving available quantity without changing on-hand', async () => {
    const post = vi.fn().mockResolvedValue({});
    const service = new InventoryOperationsService(
      {
        inventoryReservation: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'reservation',
            projectId: 'project',
            warehouseId: 'warehouse',
            reservationNumber: 'RS-1',
            status: 'APPROVED',
            lines: [
              {
                inventoryItemId: 'item',
                storageLocationId: null,
                lotId: null,
                serialId: null,
                quantity: new Prisma.Decimal(2),
              },
            ],
          }),
        },
        $transaction: vi.fn().mockImplementation((run) =>
          run({
            inventoryReservation: {
              update: vi.fn().mockResolvedValue({ status: 'RESERVED' }),
            },
            inventoryReservationStatusHistory: { create: vi.fn() },
          }),
        ),
      } as unknown as PrismaService,
      policy,
      { post } as unknown as InventoryService,
    );
    await service.reserve(actor, 'reservation');
    expect(post).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            availableDelta: '-2',
            reservedDelta: '2',
          }),
        ],
      }),
    );
  });

  it('rejects transfer receive above remaining quantity', async () => {
    const service = new InventoryOperationsService(
      {
        stockTransfer: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'transfer',
            status: 'IN_TRANSIT',
            projectId: null,
            lines: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                quantity: new Prisma.Decimal(2),
                receivedQuantity: new Prisma.Decimal(1),
              },
            ],
          }),
        },
      } as unknown as PrismaService,
      policy,
      {} as InventoryService,
    );
    await expect(
      service.receiveTransfer(actor, 'transfer', {
        idempotencyKey: 'receive-1',
        lines: [
          {
            stockTransferLineId: '00000000-0000-4000-8000-000000000001',
            quantity: '2',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('prevents adjustment creator self approval', async () => {
    const service = new InventoryOperationsService(
      {
        stockAdjustment: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'adjustment',
            status: 'DRAFT',
            createdBy: actor.userId,
            projectId: null,
            lines: [],
          }),
        },
      } as unknown as PrismaService,
      policy,
      {} as InventoryService,
    );
    await expect(
      service.approveAdjustment(actor, 'adjustment'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents cycle counter self approval', async () => {
    const service = new InventoryOperationsService(
      {
        cycleCount: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'count',
            status: 'REVIEW',
            counterId: actor.userId,
            projectId: null,
            lines: [],
          }),
        },
      } as unknown as PrismaService,
      policy,
      {} as InventoryService,
    );
    await expect(service.approveCount(actor, 'count')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
