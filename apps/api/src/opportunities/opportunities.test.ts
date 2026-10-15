import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { OpportunitiesService } from './opportunities.service';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
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
  it('drilldown chi tiết giữ scope và không trả tiền cho actor chỉ đọc cơ hội', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'opp',
      estimatedValue: '123.45',
      project: { id: 'project-b' },
    });
    const scoped = { ...actor, permissions: ['crm.opportunity.read'] };
    const db = {
      opportunity: { findFirst },
      activity: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const result = await new OpportunitiesService(db, {} as AuditService).get(
      scoped,
      'opp',
    );
    expect(JSON.stringify(result)).not.toContain('estimatedValue');
    expect(findFirst.mock.lastCall![0].where.AND).toContainEqual({
      OR: [
        { project: null },
        { project: projectWhereForPermissions(scoped, 'crm.opportunity.read') },
      ],
    });
  });
  it('không dùng filter/sort tiền để suy ra giá trị ngoài phạm vi tài chính', async () => {
    const scoped = {
      ...actor,
      permissions: ['crm.opportunity.read', 'estimate.read'],
      permissionSources: [
        {
          permission: 'crm.opportunity.read',
          roleId: 'reader',
          roleName: 'Đọc',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'estimate.read',
          roleId: 'finance',
          roleName: 'Tài chính',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const db = {
      opportunity: { findMany, count: vi.fn().mockResolvedValue(0) },
      project: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((ops) => Promise.all(ops)),
    } as unknown as PrismaService;
    const service = new OpportunitiesService(db, {} as AuditService);
    for (const filter of [
      { valueMin: 100 },
      { valueMax: 100 },
      { sort: 'estimatedValue' as const },
    ]) {
      await service.list(scoped, { page: 1, pageSize: 20, ...filter });
      expect(findMany.mock.lastCall![0].where.AND[1].OR[1].project).toEqual(
        projectWhereForPermissions(scoped, [
          'crm.opportunity.read',
          'estimate.read',
        ]),
      );
    }
  });
  it('không trả giá trị tiền khi chỉ có quyền đọc cơ hội', async () => {
    const db = {
      opportunity: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'opp', estimatedValue: '123.45', project: null },
          ]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn((ops) => Promise.all(ops)),
    } as unknown as PrismaService;
    const result = await new OpportunitiesService(db, {} as AuditService).list(
      actor,
      { page: 1, pageSize: 20 },
    );
    expect(JSON.stringify(result)).not.toContain('estimatedValue');
  });
  it('lọc cơ hội chưa kết thúc trước phân trang cho S01', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = {
      opportunity: { findMany, count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn((ops) => Promise.all(ops)),
    } as unknown as PrismaService;
    await new OpportunitiesService(db, {} as AuditService).list(actor, {
      page: 1,
      pageSize: 20,
      active: true,
    });
    expect(findMany.mock.calls[0]![0].where.stage).toEqual({
      notIn: ['WON', 'LOST'],
    });
  });
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
