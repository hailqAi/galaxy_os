import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { PrismaService } from '../prisma.service';
import { ProcurementService } from './procurement.service';
const actor = {
  organizationId: 'org',
  userId: 'user',
  organizationMembershipId: 'member',
  email: 'u@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;
describe('Purchase requests', () => {
  it('requires a source id for non-manual requests', async () => {
    const policy = { assertView: vi.fn() } as unknown as BusinessEntityPolicy;
    await expect(
      new ProcurementService({} as PrismaService, policy).create(actor, {
        requestNumber: 'PR-1',
        projectId: '00000000-0000-4000-8000-000000000001',
        sourceType: 'SIGNED_CONTRACT',
        priority: 'NORMAL',
        lines: [
          {
            customDescription: 'Item',
            quantity: '1',
            unit: 'cái',
            currency: 'VND',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('prevents creator self approval', async () => {
    const item = {
      id: 'request',
      status: 'SUBMITTED',
      createdBy: actor.userId,
      lines: [{ id: 'line' }],
      project: { projectManagerId: null },
    };
    const prisma = {
      purchaseRequest: { findFirst: vi.fn().mockResolvedValue(item) },
    } as unknown as PrismaService;
    const policy = {
      projectWhere: vi.fn().mockReturnValue({}),
    } as unknown as BusinessEntityPolicy;
    await expect(
      new ProcurementService(prisma, policy).transition(
        actor,
        'request',
        'APPROVED',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Supplier RFQs', () => {
  it('rejects an unapproved purchase request', async () => {
    const service = new ProcurementService(
      {
        supplier: { findMany: vi.fn() },
      } as unknown as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      id: 'request',
      status: 'DRAFT',
    } as never);
    await expect(
      service.createRFQ(actor, {
        rfqNumber: 'RFQ-1',
        purchaseRequestId: '00000000-0000-4000-8000-000000000001',
        responseDeadline: new Date(),
        requestedCurrency: 'VND',
        deliveryDestination: 'Kho',
        language: 'VI',
        supplierIds: ['00000000-0000-4000-8000-000000000002'],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('does not mark an empty RFQ as sent', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getRFQ').mockResolvedValue({
      id: 'rfq',
      status: 'READY_TO_SEND',
      lines: [],
      recipients: [],
    } as never);
    await expect(
      service.transitionRFQ(actor, 'rfq', 'SENT'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('Supplier quotations', () => {
  it('requires the supplier to be an RFQ recipient', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getRFQ').mockResolvedValue({
      status: 'SENT',
      recipients: [],
      lines: [],
    } as never);
    await expect(
      service.createSupplierQuotation(actor, {
        rfqId: '00000000-0000-4000-8000-000000000001',
        supplierId: '00000000-0000-4000-8000-000000000002',
        quotationNumber: 'SQ-1',
        quotationDate: new Date(),
        currency: 'EUR',
        exchangeRateSnapshot: '28000',
        lines: [
          {
            rfqLineId: '00000000-0000-4000-8000-000000000003',
            description: 'Item',
            quantity: '1',
            unit: 'cái',
            listPrice: '100',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('keeps selected supplier quotations immutable', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getSupplierQuotation').mockResolvedValue({
      status: 'SELECTED',
    } as never);
    await expect(
      service.updateSupplierQuotation(actor, 'quote', { notes: 'changed' }),
    ).rejects.toThrow('immutable');
  });
});

describe('Supplier comparison', () => {
  it('requires at least two reviewed quotations', async () => {
    const service = new ProcurementService(
      {
        supplierQuotation: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getRFQ').mockResolvedValue({
      id: 'rfq',
      projectId: 'project',
      purchaseRequestId: 'request',
    } as never);
    await expect(
      service.createSupplierComparison(actor, {
        rfqId: '00000000-0000-4000-8000-000000000001',
        baseCurrency: 'VND',
        exchangeRateDate: new Date(),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('prevents comparison creator self approval', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getSupplierComparison').mockResolvedValue({
      status: 'SUBMITTED',
      createdBy: actor.userId,
      selections: [{}],
    } as never);
    await expect(
      service.transitionSupplierComparison(actor, 'comparison', 'APPROVED'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Purchase orders', () => {
  it('prevents purchase order creator self approval', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getPurchaseOrder').mockResolvedValue({
      status: 'SUBMITTED',
      createdBy: actor.userId,
      lines: [],
    } as never);
    await expect(
      service.transitionPurchaseOrder(actor, 'po', 'APPROVED'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
