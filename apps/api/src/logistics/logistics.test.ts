import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { LogisticsService } from './logistics.service';

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

describe('Logistics', () => {
  it('rejects an invalid shipment transition', async () => {
    const service = new LogisticsService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      status: 'PLANNING',
      customsDeclarations: [],
    } as never);
    await expect(
      service.transition(actor, 'shipment', { status: 'ARRIVED' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('calculates customs duty and totals on the backend', async () => {
    const create = vi.fn().mockImplementation(({ data }) => data);
    const service = new LogisticsService(
      { customsDeclaration: { create } } as unknown as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      id: 'shipment',
      status: 'IN_TRANSIT',
      projectId: 'project',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          quantity: new Prisma.Decimal(2),
        },
      ],
    } as never);
    const result = await service.createCustoms(actor, {
      shipmentId: '00000000-0000-4000-8000-000000000001',
      declarationNumber: 'HQ-1',
      declarationDate: new Date(),
      customsOffice: 'HCM',
      importerLegalEntity: 'Galaxy',
      currency: 'VND',
      exchangeRateSnapshot: '1',
      vatAmount: '10',
      lines: [
        {
          shipmentItemId: '00000000-0000-4000-8000-000000000002',
          hsCode: '9403',
          description: 'Furniture',
          quantity: '2',
          customsValue: '100',
          dutyRate: '5',
        },
      ],
    });
    expect(result.dutyAmount.toString()).toBe('5');
    expect(result.totalTaxAmount.toString()).toBe('15');
  });

  it('rejects duplicate customs lines for one shipment item', async () => {
    const service = new LogisticsService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    const shipmentItemId = '00000000-0000-4000-8000-000000000002';
    vi.spyOn(service, 'get').mockResolvedValue({
      id: 'shipment',
      status: 'IN_TRANSIT',
      items: [{ id: shipmentItemId, quantity: new Prisma.Decimal(2) }],
    } as never);
    const line = {
      shipmentItemId,
      hsCode: '9403',
      description: 'Furniture',
      quantity: '1',
      customsValue: '10',
    };
    await expect(
      service.createCustoms(actor, {
        shipmentId: '00000000-0000-4000-8000-000000000001',
        declarationNumber: 'HQ-2',
        declarationDate: new Date(),
        customsOffice: 'HCM',
        importerLegalEntity: 'Galaxy',
        currency: 'VND',
        exchangeRateSnapshot: '1',
        lines: [line, line],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('requires manual landed-cost allocations to equal the line amount', async () => {
    const service = new LogisticsService(
      {
        landedCost: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      id: 'shipment',
      projectId: 'project',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          quantity: new Prisma.Decimal(1),
          unitValue: new Prisma.Decimal(1),
          weight: null,
          volume: null,
        },
      ],
    } as never);
    await expect(
      service.createLandedCost(actor, {
        shipmentId: '00000000-0000-4000-8000-000000000001',
        number: 'LC-1',
        baseCurrency: 'VND',
        idempotencyKey: 'landed-cost-1',
        lines: [
          {
            category: 'FREIGHT',
            description: 'Freight',
            originalCurrency: 'VND',
            originalAmount: '100',
            exchangeRateSnapshot: '1',
            allocationMethod: 'MANUAL',
            manualReason: 'Quoted charge',
            allocations: [
              {
                shipmentItemId: '00000000-0000-4000-8000-000000000002',
                amount: '99',
              },
            ],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
