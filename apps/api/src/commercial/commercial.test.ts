import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { AuditService } from '../audit/audit.service';
import { FileStorage } from '../files/file-storage';
import { PrismaService } from '../prisma.service';
import { CommercialService } from './commercial.service';
import { QuotationDocumentsService } from './quotation-documents.service';

const actor = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  organizationMembershipId: '00000000-0000-4000-8000-000000000003',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: ['quotation.create', 'quotation.approve'],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;
const audit = { write: vi.fn() } as unknown as AuditService;
const policy = {
  projectWhere: vi.fn().mockReturnValue({ id: 'visible-project' }),
} as unknown as BusinessEntityPolicy;

describe('Quotation workflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns one contingency total from risk allocations on the estimate revision', async () => {
    const estimate = {
      id: 'estimate',
      versions: [
        {
          id: 'version',
          subtotalCost: '80',
          lines: [],
          approvals: [],
          riskAllocations: [
            {
              approvedAmount: '20',
              status: 'ALLOCATED',
              risk: { code: 'R-01', title: 'Delay' },
            },
          ],
        },
      ],
    };
    const prisma = {
      estimate: { findFirst: vi.fn().mockResolvedValue(estimate) },
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
    } as unknown as PrismaService;
    const service = new CommercialService(prisma, audit, policy);

    const result = await service.getEstimate(
      {
        ...actor,
        permissions: [...actor.permissions, 'financial_margin.read'],
      },
      'project',
      'estimate',
    );

    expect(prisma.estimate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          versions: expect.objectContaining({
            include: expect.objectContaining({
              riskAllocations: expect.any(Object),
            }),
          }),
        }),
      }),
    );
    expect(result.versions[0]).toMatchObject({
      approvedContingency: '20.00',
      totalCostWithContingency: '100.00',
    });
  });

  it('redacts every cost and margin field without financial permission', async () => {
    const prisma = {
      estimate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'estimate',
          versions: [
            {
              id: 'version',
              subtotalCost: '80',
              lines: [
                {
                  id: 'line',
                  listPrice: '90',
                  supplierDiscount: '0.1',
                  netPurchasePrice: '80',
                  baseCostVnd: '80',
                  freightEstimate: '1',
                  taxEstimate: '2',
                  installationCost: '3',
                  otherCost: '4',
                  totalCost: '90',
                  margin: '0.1',
                  markup: '0.2',
                },
              ],
              approvals: [],
              riskAllocations: [],
            },
          ],
        }),
      },
    } as unknown as PrismaService;
    const service = new CommercialService(prisma, audit, policy);

    const result = await service.getEstimate(actor, 'project', 'estimate');

    expect(result.versions[0]!.lines[0]).toEqual({
      id: 'line',
      listPrice: undefined,
      supplierDiscount: undefined,
      netPurchasePrice: undefined,
      baseCostVnd: undefined,
      freightEstimate: undefined,
      taxEstimate: undefined,
      installationCost: undefined,
      otherCost: undefined,
      totalCost: undefined,
      margin: undefined,
      markup: undefined,
    });
  });

  it('does not create an estimate after Project access is revoked while waiting for the lock', async () => {
    let membershipActive = true;
    const create = vi.fn().mockResolvedValue({ id: 'estimate' });
    const tx = {
      $queryRaw: vi.fn(async () => {
        membershipActive = false;
        return [{ id: 'project' }];
      }),
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project', customerId: 'customer' } : null,
        ),
      },
      estimate: { create },
      activity: { create: vi.fn() },
    };
    const prisma = {
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;

    await expect(
      new CommercialService(prisma, audit, policy).createEstimate(
        actor,
        'project',
        {
          number: 'E-1',
          title: 'Estimate',
          currency: 'VND',
          lines: [
            {
              section: 'A',
              itemType: 'PRODUCT',
              quantity: '1',
              unit: 'item',
              netPurchasePrice: '1',
              currency: 'VND',
              exchangeRateSnapshot: '1',
              sellingPrice: '2',
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(policy.projectWhere).toHaveBeenCalledWith(actor, [
      'estimate.create',
      'financial_margin.read',
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it('excludes display-only parent lines from estimate selling totals', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'estimate', ...data }));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      estimate: { create },
      activity: { create: vi.fn() },
    };
    const service = new CommercialService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      audit,
      policy,
    );

    await service.createEstimate(actor, 'project', {
      number: 'E-PARENT',
      title: 'Estimate hierarchy',
      currency: 'VND',
      lines: [
        {
          section: 'Parent',
          itemType: 'GROUP',
          quantity: '1',
          unit: 'group',
          netPurchasePrice: '80',
          currency: 'VND',
          exchangeRateSnapshot: '1',
          sellingPrice: '100',
          contributesToTotal: false,
        },
        {
          section: 'Child',
          itemType: 'PRODUCT',
          quantity: '2',
          unit: 'item',
          netPurchasePrice: '15',
          currency: 'VND',
          exchangeRateSnapshot: '1',
          sellingPrice: '20',
        },
      ],
    });

    expect(
      create.mock.calls[0]![0].data.versions.create.subtotalSelling.toFixed(2),
    ).toBe('40.00');
  });

  it('snapshots purchase quantity, source state, margin, and markup in an estimate line', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'estimate', ...data }));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      estimate: { create },
      activity: { create: vi.fn() },
    };
    const service = new CommercialService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      audit,
      policy,
    );

    await service.createEstimate(actor, 'project', {
      number: 'E-2',
      title: 'Estimate with source',
      currency: 'VND',
      lines: [
        {
          section: 'A',
          itemType: 'PRODUCT',
          quantity: '10',
          purchaseQuantity: '11',
          unit: 'item',
          netPurchasePrice: '8',
          currency: 'VND',
          exchangeRateSnapshot: '1',
          sellingPrice: '10',
          priceStatus: 'CONFIRMED',
          priceSourceType: 'SUPPLIER_QUOTATION',
          priceQuotedAt: '2026-09-10',
          sourceDocument: 'Supplier quote SQ-1',
        },
      ],
    });

    const line = create.mock.calls[0]![0].data.versions.create.lines.create[0];
    expect(line.purchaseQuantity.toFixed(3)).toBe('11.000');
    expect(line.totalCost.toFixed(2)).toBe('88.00');
    expect(line.margin.toFixed(6)).toBe('0.120000');
    expect(line.markup.toFixed(6)).toBe('0.136364');
    expect(line.priceStatus).toBe('CONFIRMED');
    expect(line.priceSourceType).toBe('SUPPLIER_QUOTATION');
  });

  it('allows an explicitly incomplete draft without converting its missing price to zero', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'estimate', ...data }));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      estimate: { create },
      activity: { create: vi.fn() },
    };
    const service = new CommercialService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      audit,
      policy,
    );

    await service.createEstimate(actor, 'project', {
      number: 'E-3',
      title: 'Incomplete estimate',
      currency: 'VND',
      lines: [
        {
          section: 'A',
          itemType: 'PRODUCT',
          quantity: '1',
          unit: 'item',
          priceStatus: 'MISSING',
          currency: 'VND',
          exchangeRateSnapshot: '1',
          sellingPrice: '100',
        },
      ],
    });

    const version = create.mock.calls[0]![0].data.versions.create;
    expect(version.subtotalCost).toBeNull();
    expect(version.lines.create[0].netPurchasePrice).toBeNull();
    expect(version.lines.create[0].totalCost).toBeNull();
  });

  it('rejects a confirmed price without dated source evidence', async () => {
    const service = new CommercialService({} as PrismaService, audit, policy);

    await expect(
      service.createEstimate(actor, 'project', {
        number: 'E-4',
        title: 'Estimate without evidence',
        currency: 'VND',
        lines: [
          {
            section: 'A',
            itemType: 'PRODUCT',
            quantity: '1',
            unit: 'item',
            netPurchasePrice: '100',
            currency: 'VND',
            exchangeRateSnapshot: '1',
            sellingPrice: '120',
            priceStatus: 'CONFIRMED',
          },
        ],
      }),
    ).rejects.toThrow('Confirmed price requires dated source evidence');
  });

  it('rejects a price validity date before its quotation date', async () => {
    const service = new CommercialService({} as PrismaService, audit, policy);

    await expect(
      service.createEstimate(actor, 'project', {
        number: 'E-5',
        title: 'Estimate with invalid validity',
        currency: 'VND',
        lines: [
          {
            section: 'A',
            itemType: 'PRODUCT',
            quantity: '1',
            unit: 'item',
            netPurchasePrice: '100',
            currency: 'VND',
            exchangeRateSnapshot: '1',
            sellingPrice: '120',
            priceStatus: 'CONFIRMED',
            priceSourceType: 'SUPPLIER_QUOTATION',
            priceQuotedAt: '2026-09-10',
            priceValidUntil: '2026-09-09',
            sourceDocument: 'SQ-1',
          },
        ],
      }),
    ).rejects.toThrow('Price validity cannot predate its source');
  });

  it('does not transition a quotation after Project access is revoked while waiting for the lock', async () => {
    let membershipActive = true;
    const update = vi.fn();
    const tx = {
      $queryRaw: vi.fn(async () => {
        membershipActive = false;
        return [{ id: 'project' }];
      }),
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project', customerId: 'customer' } : null,
        ),
      },
      quotation: { findFirst: vi.fn(), update },
      quotationVersion: { findFirst: vi.fn(), update: vi.fn() },
      quotationStatusHistory: { create: vi.fn() },
      quotationApproval: { create: vi.fn() },
      activity: { create: vi.fn() },
    };
    const prisma = {
      quotation: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'quotation', currentVersion: 1 }),
      },
      quotationVersion: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'version',
          status: 'DRAFT',
          createdBy: 'another-user',
        }),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;

    await expect(
      new CommercialService(prisma, audit, policy).transitionQuotation(
        actor,
        'project',
        'quotation',
        'INTERNAL_REVIEW',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(policy.projectWhere).toHaveBeenCalledWith(actor, 'quotation.update');
    expect(update).not.toHaveBeenCalled();
  });

  it('rechecks estimate submission with the exact Project permission', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      estimate: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'estimate', currentVersion: 1 }),
      },
      estimateVersion: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'version', status: 'PENDING' }),
      },
    };
    const service = new CommercialService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      audit,
      policy,
    );

    await expect(
      service.decideEstimate(actor, 'project', 'estimate', 'SUBMIT'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(policy.projectWhere).toHaveBeenCalledWith(actor, 'estimate.update');
  });

  it('does not approve an estimate revision with unconfirmed price sources', async () => {
    const update = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      estimate: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'estimate', currentVersion: 1 }),
      },
      estimateVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'version',
          status: 'PENDING',
          createdBy: 'another-user',
          lines: [{ priceStatus: 'MISSING' }],
        }),
        update,
      },
    };
    const service = new CommercialService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      audit,
      policy,
    );

    await expect(
      service.decideEstimate(actor, 'project', 'estimate', 'APPROVE'),
    ).rejects.toThrow('Confirmed price sources are required');
    expect(update).not.toHaveBeenCalled();
  });

  it('requires an approved estimate from the same project and organization', async () => {
    const discountActor = {
      ...actor,
      permissions: [...actor.permissions, 'quotation.discount.approve'],
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      estimate: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await expect(
      new CommercialService(prisma, audit, policy).createQuotation(
        discountActor,
        'project',
        {
          estimateId: '00000000-0000-4000-8000-000000000004',
          number: 'Q-1',
          discount: '1',
        },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(policy.projectWhere).toHaveBeenCalledWith(discountActor, [
      'quotation.create',
      'quotation.discount.approve',
    ]);
  });

  it('does not copy display-only estimate parents into quotation totals', async () => {
    const create = vi.fn(async ({ data }) => ({
      id: 'quotation',
      ...data,
      versions: [{ id: 'quotation-version' }],
    }));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      estimate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'estimate',
          currency: 'VND',
          versions: [
            {
              lines: [
                {
                  section: 'Parent',
                  customDescription: 'Display group',
                  itemType: 'GROUP',
                  quantity: new Prisma.Decimal(1),
                  unit: 'group',
                  sellingPrice: new Prisma.Decimal(100),
                  position: 0,
                  contributesToTotal: false,
                },
                {
                  section: 'Child',
                  customDescription: 'Chair',
                  itemType: 'PRODUCT',
                  quantity: new Prisma.Decimal(2),
                  unit: 'item',
                  sellingPrice: new Prisma.Decimal(20),
                  position: 1,
                  contributesToTotal: true,
                },
              ],
            },
          ],
        }),
      },
      quotation: { create, update: vi.fn() },
      activity: { create: vi.fn() },
    };
    const service = new CommercialService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      audit,
      policy,
    );

    await service.createQuotation(actor, 'project', {
      estimateId: '00000000-0000-4000-8000-000000000004',
      number: 'Q-PARENT',
    });

    const data = create.mock.calls[0]![0].data;
    expect(data.subtotal.toFixed(2)).toBe('40.00');
    expect(data.versions.create.lines.create).toHaveLength(1);
  });

  it('prevents the creator from approving their own quotation', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      quotation: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'quotation', currentVersion: 1 }),
      },
      quotationVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'version',
          status: 'INTERNAL_REVIEW',
          createdBy: actor.userId,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await expect(
      new CommercialService(prisma, audit, policy).transitionQuotation(
        actor,
        'project',
        'quotation',
        'APPROVED',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(policy.projectWhere).toHaveBeenCalledWith(
      actor,
      'quotation.approve',
    );
  });

  it('rechecks quotation revision with the exact Project permission', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      quotation: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'quotation', currentVersion: 1 }),
      },
      quotationVersion: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new CommercialService(
      { $transaction: vi.fn((work) => work(tx)) } as unknown as PrismaService,
      audit,
      policy,
    );

    await expect(
      service.reviseQuotation(actor, 'project', 'quotation', {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(policy.projectWhere).toHaveBeenCalledWith(actor, 'quotation.update');
  });

  it('admits generated quotation bytes through shared file capacity', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'document',
      format: 'PDF',
      language: 'VI',
      generatedAt: new Date(0),
      generatedBy: actor.userId,
      storageKey: 'storage-key',
      checksum: 'secret-checksum',
      sizeBytes: 10n,
    });
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ id: actor.organizationId }])
        .mockResolvedValueOnce([
          {
            permanentBytes: '0',
            stagedBytes: '0',
            materializedBytes: '0',
            objectRows: '0',
            recentActorOperations: '0',
            globalPermanentBytes: '0',
            globalStagedBytes: '0',
            globalMaterializedBytes: '0',
            globalObjectRows: '0',
          },
        ])
        .mockResolvedValueOnce([
          {
            globalPermanentBytes: '0',
            globalStagedBytes: '0',
            globalMaterializedBytes: '0',
            globalObjectRows: '0',
          },
        ])
        .mockResolvedValueOnce([{ id: 'project' }])
        .mockResolvedValueOnce([{ id: 'reservation' }]),
      uploadSession: { count: vi.fn() },
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) },
      quotation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'quotation' }),
      },
      quotationDocument: { create },
      fileStorageReservation: {
        create: vi.fn().mockResolvedValue({ id: 'reservation' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'reservation' }),
        delete: vi.fn(),
      },
    };
    const transaction = vi.fn((work) => work(tx));
    const findFirst = vi.fn().mockResolvedValue({
      number: 'Q-1',
      currency: 'VND',
      versions: [{ id: 'version', version: 1, grandTotal: 0, lines: [] }],
    });
    const service = new QuotationDocumentsService(
      {
        quotation: { findFirst },
        quotationDocument: { create: vi.fn() },
        fileStorageReservation: { findUnique: vi.fn() },
        $transaction: transaction,
      } as unknown as PrismaService,
      {
        put: vi.fn().mockResolvedValue('storage-key'),
        createKey: vi
          .fn()
          .mockReturnValue(
            `${actor.organizationId}/2026/08/00000000-0000-4000-8000-000000000099`,
          ),
        putStream: vi
          .fn()
          .mockResolvedValue(
            `${actor.organizationId}/2026/08/00000000-0000-4000-8000-000000000099`,
          ),
        publishPending: vi.fn(),
      } as unknown as FileStorage,
      policy,
    );

    const result = await service.generate(
      actor,
      'project',
      'quotation',
      'PDF',
      'VI',
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ project: { id: 'visible-project' } }),
      }),
    );
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sizeBytes: expect.anything() }),
    });
    expect(typeof create.mock.calls[0]?.[0]?.data.sizeBytes).toBe('bigint');
    expect(tx.fileStorageReservation.create).toHaveBeenCalledOnce();
    expect(tx.fileStorageReservation.delete).toHaveBeenCalledOnce();
    expect(policy.projectWhere).toHaveBeenNthCalledWith(
      1,
      actor,
      'quotation.export',
    );
    expect(policy.projectWhere).toHaveBeenNthCalledWith(
      2,
      actor,
      'quotation.export',
    );
    expect(policy.projectWhere).toHaveBeenCalledTimes(2);
    expect(result).not.toHaveProperty('storageKey');
    expect(result).not.toHaveProperty('checksum');
    expect(result).not.toHaveProperty('sizeBytes');
  });

  it('does not publish a generated quotation after Project access is revoked while bytes are stored', async () => {
    let membershipActive = true;
    const quotaTx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ id: actor.organizationId }])
        .mockResolvedValueOnce([
          {
            permanentBytes: '0',
            stagedBytes: '0',
            materializedBytes: '0',
            objectRows: '0',
            recentActorOperations: '0',
            globalPermanentBytes: '0',
            globalStagedBytes: '0',
            globalMaterializedBytes: '0',
            globalObjectRows: '0',
          },
        ])
        .mockResolvedValueOnce([
          {
            globalPermanentBytes: '0',
            globalStagedBytes: '0',
            globalMaterializedBytes: '0',
            globalObjectRows: '0',
          },
        ]),
      uploadSession: { count: vi.fn() },
      fileStorageReservation: { create: vi.fn() },
    };
    const publishPending = vi.fn();
    const create = vi.fn().mockResolvedValue({
      id: 'document',
      format: 'PDF',
      storageKey: 'organization/2026/08/key',
      checksum: 'checksum',
      sizeBytes: 1n,
    });
    const finalTx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project' }]),
      project: {
        findFirst: vi.fn(async () =>
          membershipActive ? { id: 'project' } : null,
        ),
      },
      quotation: { findFirst: vi.fn() },
      quotationDocument: { create },
      fileStorageReservation: { delete: vi.fn() },
    };
    const transaction = vi
      .fn()
      .mockImplementationOnce((work) => work(quotaTx))
      .mockImplementationOnce((work) => work(finalTx));
    const service = new QuotationDocumentsService(
      {
        quotation: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'quotation',
            number: 'Q-1',
            currency: 'VND',
            currentVersion: 1,
            versions: [{ id: 'version', version: 1, grandTotal: 0, lines: [] }],
          }),
        },
        fileStorageReservation: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        $transaction: transaction,
      } as unknown as PrismaService,
      {
        createKey: vi.fn().mockReturnValue('organization/2026/08/key'),
        putStream: vi.fn(async () => {
          membershipActive = false;
        }),
        publishPending,
      } as unknown as FileStorage,
      policy,
    );

    await expect(
      service.generate(actor, 'project', 'quotation', 'PDF', 'VI'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(publishPending).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('scopes quotation reads to visible Projects and strips document storage metadata', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'quotation',
      versions: [
        {
          documents: [
            {
              id: 'document',
              storageKey: 'private-key',
              checksum: 'private-checksum',
              sizeBytes: 42n,
            },
          ],
        },
      ],
    });
    const service = new CommercialService(
      { quotation: { findFirst } } as unknown as PrismaService,
      audit,
      policy,
    );

    const result = await service.getQuotation(actor, 'project', 'quotation');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ project: { id: 'visible-project' } }),
      }),
    );
    expect(result.versions[0]?.documents[0]).toEqual({ id: 'document' });
    expect(policy.projectWhere).toHaveBeenCalledWith(actor, 'quotation.read');
  });
});
