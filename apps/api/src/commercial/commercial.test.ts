import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CommercialService } from './commercial.service';

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

describe('Quotation workflow', () => {
  it('requires an approved estimate from the same project and organization', async () => {
    const prisma = {
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'project', customerId: 'customer' }),
      },
      estimate: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(
      new CommercialService(prisma, audit).createQuotation(actor, 'project', {
        estimateId: '00000000-0000-4000-8000-000000000004',
        number: 'Q-1',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('prevents the creator from approving their own quotation', async () => {
    const prisma = {
      quotation: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'quotation', currentVersion: 1 }),
      },
      quotationVersion: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'version',
          status: 'INTERNAL_REVIEW',
          createdBy: actor.userId,
        }),
      },
    } as unknown as PrismaService;
    await expect(
      new CommercialService(prisma, audit).transitionQuotation(
        actor,
        'project',
        'quotation',
        'APPROVED',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
