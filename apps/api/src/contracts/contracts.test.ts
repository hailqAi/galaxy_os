import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { ContractsService } from './contracts.service';
const actor = {
  organizationId: 'organization',
  userId: 'user',
  organizationMembershipId: 'membership',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;
describe('Contract and receivable workflow', () => {
  it('lọc quyền đọc tài chính theo Project trước khi trả hợp đồng và phải thu', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      contract: { findMany },
      customerPaymentSchedule: { findMany },
    } as unknown as PrismaService;
    const service = new ContractsService(prisma, {} as BusinessEntityPolicy);
    await service.list(actor, 'project');
    await service.receivables(actor, 'project');
    for (const [query] of findMany.mock.calls)
      expect(
        query.where.project ?? query.where.contract?.project,
      ).toMatchObject({
        organizationId: actor.organizationId,
        id: { in: [] },
      });
  });
  const activePolicy = {
    assertView: vi.fn().mockResolvedValue({ projectId: 'project' }),
  } as unknown as BusinessEntityPolicy;

  it('requires an accepted quotation in actor scope', async () => {
    const prisma = {
      quotation: { findFirst: async () => null },
    } as unknown as PrismaService;
    await expect(
      new ContractsService(prisma, activePolicy).create(actor, 'project', {
        quotationId: '00000000-0000-4000-8000-000000000001',
        contractNumber: 'C-1',
        sellerLegalEntity: 'Seller',
        buyerLegalEntity: 'Buyer',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('rejects payment allocation totals that differ from the payment', async () => {
    const service = new ContractsService({} as PrismaService, activePolicy);
    await expect(
      service.payment(actor, 'project', {
        paymentDate: new Date(),
        amount: '100',
        currency: 'VND',
        paymentMethod: 'BANK_TRANSFER',
        idempotencyKey: 'payment-0001',
        allocations: [
          { scheduleId: '00000000-0000-4000-8000-000000000002', amount: '99' },
        ],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('keeps contract history readable but blocks new commands after Project deletion', async () => {
    const quotation = { findFirst: vi.fn() };
    const prisma = {
      contract: { findMany: vi.fn().mockResolvedValue([{ id: 'contract' }]) },
      quotation,
    } as unknown as PrismaService;
    const deletedPolicy = {
      assertView: vi.fn().mockRejectedValue(new NotFoundException()),
    } as unknown as BusinessEntityPolicy;
    const service = new ContractsService(prisma, deletedPolicy);

    await expect(service.list(actor, 'project')).resolves.toEqual([
      { id: 'contract' },
    ]);
    await expect(
      service.create(actor, 'project', {
        quotationId: '00000000-0000-4000-8000-000000000001',
        contractNumber: 'C-1',
        sellerLegalEntity: 'Seller',
        buyerLegalEntity: 'Buyer',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(quotation.findFirst).not.toHaveBeenCalled();
  });
});
