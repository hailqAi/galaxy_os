import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { ProductionService } from './production.service';

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

describe('Production tracking', () => {
  it('creates only from a confirmed PO', async () => {
    const service = new ProductionService(
      {
        purchaseOrder: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    await expect(
      service.create(actor, {
        purchaseOrderId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('requires a reason for delayed status', async () => {
    const service = new ProductionService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      status: 'IN_PRODUCTION',
    } as never);
    await expect(
      service.changeStatus(actor, 'production', { status: 'DELAYED' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('blocks ready status while required approval is pending', async () => {
    const service = new ProductionService(
      {} as PrismaService,
      {} as BusinessEntityPolicy,
    );
    vi.spyOn(service, 'get').mockResolvedValue({
      status: 'PACKING',
      technicalApprovals: [{ required: true, status: 'PENDING' }],
      sampleApprovals: [],
      milestones: [],
    } as never);
    await expect(
      service.changeStatus(actor, 'production', {
        status: 'READY_FOR_SHIPMENT',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('prevents technical self approval', async () => {
    const service = new ProductionService(
      {
        technicalApproval: {
          findFirst: vi.fn().mockResolvedValue({
            createdBy: actor.userId,
          }),
        },
      } as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    await expect(
      service.decideTechnical(actor, 'approval', { decision: 'APPROVED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('decides a pending sample without changing the PO workflow', async () => {
    const update = vi.fn().mockResolvedValue({ status: 'APPROVED' });
    const service = new ProductionService(
      {
        sampleApproval: {
          findFirst: vi.fn().mockResolvedValue({
            status: 'PENDING',
            submittedBy: 'other',
          }),
          update,
        },
      } as unknown as PrismaService,
      {
        projectWhere: vi.fn().mockReturnValue({}),
      } as unknown as BusinessEntityPolicy,
    );
    await service.decideSample(actor, 'sample', { decision: 'APPROVED' });
    expect(update).toHaveBeenCalledOnce();
  });
});
