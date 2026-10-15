import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
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

describe('Proforma invoices', () => {
  it('rejects protected bank reference without update permission', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    await expect(
      service.createProformaInvoice(actor, {
        piNumber: 'PI-1',
        purchaseOrderId: '00000000-0000-4000-8000-000000000001',
        piDate: new Date(),
        currency: 'USD',
        exchangeRateSnapshot: '1',
        bankReferenceProtected: 'secret',
        lines: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('calculates totals from PO-linked lines with Decimal', async () => {
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: 'pi',
      ...data,
      lines: data.lines.create,
    }));
    const prisma = {
      purchaseOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'po',
          supplierId: 'supplier',
          currency: 'USD',
          totalAmount: '200',
          lines: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              productId: null,
              variantId: null,
              quantity: '2',
              unit: 'pcs',
            },
          ],
          proformaInvoices: [],
        }),
      },
      $transaction: vi.fn().mockImplementation(async (run) =>
        run({
          proformaInvoice: { create },
          activity: { create: vi.fn() },
        }),
      ),
    } as unknown as PrismaService;
    const policy = {
      projectWhere: vi.fn().mockReturnValue({}),
    } as unknown as BusinessEntityPolicy;
    const result = await new ProcurementService(
      prisma,
      policy,
    ).createProformaInvoice(actor, {
      piNumber: 'PI-1',
      purchaseOrderId: '00000000-0000-4000-8000-000000000001',
      piDate: new Date(),
      currency: 'USD',
      exchangeRateSnapshot: '25000',
      shippingAmount: '10.10',
      lines: [
        {
          purchaseOrderLineId: '00000000-0000-4000-8000-000000000002',
          description: 'Item',
          quantity: '2',
          unit: 'pcs',
          unitPrice: '50.25',
        },
      ],
    });
    expect(String(result.totalAmount)).toBe('110.6');
    expect(create).toHaveBeenCalledOnce();
  });

  it('marks aggregate quantity above PO commitment for special approval', async () => {
    const create = vi.fn().mockImplementation(({ data }) => ({
      id: 'pi',
      ...data,
      lines: data.lines.create,
    }));
    const prisma = {
      purchaseOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'po',
          supplierId: 'supplier',
          currency: 'USD',
          totalAmount: '1000',
          lines: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              productId: null,
              variantId: null,
              quantity: '2',
              unit: 'pcs',
            },
          ],
          proformaInvoices: [
            {
              totalAmount: '10',
              lines: [
                {
                  purchaseOrderLineId: '00000000-0000-4000-8000-000000000002',
                  quantity: '1',
                },
              ],
            },
          ],
        }),
      },
      $transaction: vi.fn().mockImplementation(async (run) =>
        run({
          proformaInvoice: { create },
          activity: { create: vi.fn() },
        }),
      ),
    } as unknown as PrismaService;
    const result = await new ProcurementService(prisma, {
      projectWhere: vi.fn().mockReturnValue({}),
    } as unknown as BusinessEntityPolicy).createProformaInvoice(actor, {
      piNumber: 'PI-2',
      purchaseOrderId: '00000000-0000-4000-8000-000000000001',
      piDate: new Date(),
      currency: 'USD',
      exchangeRateSnapshot: '1',
      lines: [
        {
          purchaseOrderLineId: '00000000-0000-4000-8000-000000000002',
          description: 'Item',
          quantity: '2',
          unit: 'pcs',
          unitPrice: '10',
        },
      ],
    });
    expect(result.exceedsCommitment).toBe(true);
  });

  it('keeps approved PI immutable', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getProformaInvoice').mockResolvedValue({
      status: 'APPROVED',
    } as never);
    await expect(
      service.updateProformaInvoice(actor, 'pi', { notes: 'changed' }),
    ).rejects.toThrow('immutable');
  });

  it('requires special permission to approve an over-commitment PI', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getProformaInvoice').mockResolvedValue({
      status: 'VERIFIED',
      exceedsCommitment: true,
      createdBy: 'other',
    } as never);
    await expect(
      service.transitionProformaInvoice(actor, 'pi', 'APPROVED'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Supplier payables', () => {
  it('rejects protected payment bank reference without update permission', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    await expect(
      service.createSupplierPayment(actor, {
        supplierId: '00000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000002',
        paymentDate: new Date(),
        amount: '1',
        currency: 'USD',
        exchangeRateSnapshot: '1',
        paymentMethod: 'BANK_TRANSFER',
        bankReferenceProtected: 'secret',
        idempotencyKey: 'payment-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires schedules to equal approved PI total', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getProformaInvoice').mockResolvedValue({
      id: 'pi',
      status: 'APPROVED',
      totalAmount: new Prisma.Decimal(100),
    } as never);
    await expect(
      service.generateSupplierPayable(actor, {
        proformaInvoiceId: '00000000-0000-4000-8000-000000000001',
        schedules: [
          {
            milestone: 'DEPOSIT',
            sequence: 1,
            dueDate: new Date(),
            amount: '99',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('prevents payment recorder self approval', async () => {
    const service = new ProcurementService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'getSupplierPayment').mockResolvedValue({
      status: 'SUBMITTED',
      recordedBy: actor.userId,
    } as never);
    await expect(
      service.transitionSupplierPayment(actor, 'payment', 'APPROVED'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects allocation above payment amount', async () => {
    const prisma = {
      $transaction: vi.fn().mockImplementation((run) =>
        run({
          supplierPayment: {
            findUniqueOrThrow: vi.fn().mockResolvedValue({
              status: 'APPROVED',
              amount: new Prisma.Decimal(100),
              allocations: [],
            }),
          },
        }),
      ),
    } as unknown as PrismaService;
    const service = new ProcurementService(prisma, {} as BusinessEntityPolicy);
    vi.spyOn(service, 'getSupplierPayment').mockResolvedValue({} as never);
    await expect(
      service.allocateSupplierPayment(actor, 'payment', {
        allocations: [
          {
            scheduleId: '00000000-0000-4000-8000-000000000001',
            amount: '101',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects duplicate schedules in one allocation command', async () => {
    const prisma = {
      $transaction: vi.fn().mockImplementation((run) =>
        run({
          supplierPayment: {
            findUniqueOrThrow: vi.fn().mockResolvedValue({
              status: 'APPROVED',
              amount: new Prisma.Decimal(100),
              allocations: [],
            }),
          },
        }),
      ),
    } as unknown as PrismaService;
    const service = new ProcurementService(prisma, {} as BusinessEntityPolicy);
    vi.spyOn(service, 'getSupplierPayment').mockResolvedValue({} as never);
    const scheduleId = '00000000-0000-4000-8000-000000000001';
    await expect(
      service.allocateSupplierPayment(actor, 'payment', {
        allocations: [
          { scheduleId, amount: '40' },
          { scheduleId, amount: '40' },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

it('redacts nested PI banking details when reading supplier payables without bank permission', async () => {
  const invoice = {
    id: 'pi',
    piNumber: 'PI-1',
    bankReferenceProtected: 'protected-bank-data',
  };
  const prisma = {
    project: { findMany: vi.fn().mockResolvedValue([{ id: 'project' }]) },
    supplierPayable: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'payable', proformaInvoice: invoice }),
    },
  } as unknown as PrismaService;
  const policy = {
    projectWhere: vi.fn().mockReturnValue({}),
  } as unknown as BusinessEntityPolicy;
  const service = new ProcurementService(prisma, policy);
  const reader = { ...actor, permissions: ['supplier_payable.read'] };
  expect(
    (
      await service.getSupplierPayable(
        reader,
        'payable',
        'supplier_payable.read',
      )
    ).proformaInvoice,
  ).not.toHaveProperty('bankReferenceProtected');
  expect(
    (
      await service.getSupplierPayable(
        {
          ...reader,
          permissions: [...reader.permissions, 'bank_information.read'],
        },
        'payable',
        'supplier_payable.read',
      )
    ).proformaInvoice,
  ).toEqual(invoice);
  expect(invoice.bankReferenceProtected).toBe('protected-bank-data');
});
