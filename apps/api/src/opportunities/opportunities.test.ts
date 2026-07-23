import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { OpportunitiesService } from './opportunities.service';
const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;
describe('OpportunitiesService', () => {
  it('rejects skipped stage transitions and lost without reason', async () => {
    const prisma = {
      opportunity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'opportunity', stage: 'DISCOVERY' }),
      },
    } as unknown as PrismaService;
    const service = new OpportunitiesService(prisma, {} as AuditService);
    await expect(
      service.changeStage(actor, 'opportunity', { stage: 'SURVEY' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.changeStage(actor, 'opportunity', { stage: 'LOST' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('marks won and records the transition atomically', async () => {
    const tx = {
      opportunity: {
        update: vi.fn().mockResolvedValue({ id: 'opportunity', stage: 'WON' }),
      },
      activity: { create: vi.fn() },
    };
    const prisma = {
      opportunity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'opportunity', stage: 'NEGOTIATION' }),
      },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await new OpportunitiesService(prisma, {} as AuditService).markWon(
      actor,
      'opportunity',
    );
    expect(tx.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: 'WON', probability: 100 }),
      }),
    );
    expect(tx.activity.create).toHaveBeenCalledOnce();
  });
  it('returns an existing project without creating duplicates', async () => {
    const tx = {
      opportunity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'opportunity',
          customerId: 'customer',
          primaryContactId: null,
          project: { id: 'project' },
        }),
      },
      project: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await expect(
      new OpportunitiesService(prisma, {} as AuditService).createProject(
        actor,
        'opportunity',
      ),
    ).resolves.toEqual({
      opportunityId: 'opportunity',
      customerId: 'customer',
      contactId: undefined,
      projectId: 'project',
      alreadyConverted: true,
    });
    expect(tx.project.create).not.toHaveBeenCalled();
  });
});
