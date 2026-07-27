import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
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
  it('requires an accepted quotation in actor scope', async () => {
    const prisma = {
      quotation: { findFirst: async () => null },
    } as unknown as PrismaService;
    await expect(
      new ContractsService(prisma).create(actor, 'project', {
        quotationId: '00000000-0000-4000-8000-000000000001',
        contractNumber: 'C-1',
        sellerLegalEntity: 'Seller',
        buyerLegalEntity: 'Buyer',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('rejects payment allocation totals that differ from the payment', async () => {
    const service = new ContractsService({} as PrismaService);
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
});
