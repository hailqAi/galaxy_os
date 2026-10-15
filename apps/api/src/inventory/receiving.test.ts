import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { InventoryService } from './inventory.service';
import { ReceivingService } from './receiving.service';

const actor = {
  organizationId: 'org',
  userId: 'user',
  organizationMembershipId: 'member',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: ['file.read', 'project.stage1.finance.read', 'estimate.read'],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

describe('Goods receipt and quality', () => {
  it('requires exactly one receipt source', async () => {
    const service = new ReceivingService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
      {} as InventoryService,
    );
    await expect(
      service.create(actor, {
        receiptNumber: 'GR-1',
        warehouseId: '00000000-0000-4000-8000-000000000001',
        lines: [],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects duplicate receipt source lines', async () => {
    const service = new ReceivingService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
      {} as InventoryService,
    );
    const line = {
      purchaseOrderLineId: '00000000-0000-4000-8000-000000000003',
      storageLocationId: '00000000-0000-4000-8000-000000000004',
      receivedQuantity: '1',
    };
    await expect(
      service.create(actor, {
        receiptNumber: 'GR-1',
        warehouseId: '00000000-0000-4000-8000-000000000001',
        purchaseOrderId: '00000000-0000-4000-8000-000000000002',
        lines: [line, line],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects an unavailable PO or delivered shipment source', async () => {
    const service = new ReceivingService(
      {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      {} as BusinessEntityPolicy,
      {} as InventoryService,
    );
    await expect(
      service.create(actor, {
        receiptNumber: 'GR-1',
        warehouseId: '00000000-0000-4000-8000-000000000001',
        purchaseOrderId: '00000000-0000-4000-8000-000000000002',
        lines: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates partial inspection quantities before posting', async () => {
    const service = new ReceivingService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
      {} as InventoryService,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      status: 'RECEIVED',
      projectId: 'project',
      lines: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          receivedQuantity: new Prisma.Decimal(10),
        },
      ],
    } as never);
    await expect(
      service.createInspection(actor, 'receipt', {
        inspectionNumber: 'QC-1',
        lines: [
          {
            goodsReceiptLineId: '00000000-0000-4000-8000-000000000001',
            inspectedQuantity: '10',
            passedQuantity: '8',
            failedQuantity: '1',
            quarantinedQuantity: '0',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects temporary or other-Project inspection evidence', async () => {
    const findMany = vi.fn(({ where }) =>
      Promise.resolve(where.attachments ? [] : [{ id: 'file' }]),
    );
    const service = new ReceivingService(
      { fileAsset: { findMany } } as unknown as PrismaService,
      {} as BusinessEntityPolicy,
      {} as InventoryService,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      status: 'RECEIVED',
      projectId: 'project',
      lines: [],
    } as never);

    await expect(
      service.createInspection(actor, 'receipt', {
        inspectionNumber: 'QC-1',
        lines: [
          {
            goodsReceiptLineId: '00000000-0000-4000-8000-000000000002',
            inspectedQuantity: '1',
            passedQuantity: '1',
            failedQuantity: '0',
            quarantinedQuantity: '0',
            evidenceFileId: '00000000-0000-4000-8000-000000000001',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attachments: { some: { projectId: 'project' } },
        }),
      }),
    );
  });

  it('prevents inspectors from approving their own inspection', async () => {
    const service = new ReceivingService(
      {
        qualityInspection: {
          findFirst: vi.fn().mockResolvedValue({
            inspectorId: actor.userId,
            projectId: 'project',
            lines: [],
            goodsReceipt: {},
          }),
        },
      } as unknown as PrismaService,
      { assertView: vi.fn() } as unknown as BusinessEntityPolicy,
      {} as InventoryService,
    );
    await expect(
      service.completeInspection(actor, 'inspection'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
