import { describe, expect, it, vi } from 'vitest';
import {
  BusinessEntityPolicy,
  projectWhereForPermissions,
} from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { DashboardController } from './dashboard.controller';
import { TasksService } from '../tasks/tasks.service';

const actor = {
  organizationId: 'organization',
  userId: 'user',
  organizationMembershipId: 'membership',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [
    'crm.lead.read',
    'project.read',
    'task.read',
    'crm.opportunity.read',
    'estimate.read',
  ],
  administrationScope: 'SELF',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

function fixture() {
  const prisma = {
    lead: { count: vi.fn().mockResolvedValue(2) },
    opportunity: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { estimatedValue: 100 } }),
      groupBy: vi.fn().mockImplementation(({ by }: { by: string[] }) =>
        Promise.resolve(
          by.includes('currency')
            ? [
                {
                  currency: 'VND',
                  _sum: {
                    estimatedValue: { toString: () => '9007199254740993.25' },
                  },
                },
                {
                  currency: 'USD',
                  _sum: { estimatedValue: { toString: () => '25.50' } },
                },
              ]
            : [{ stage: 'DISCOVERY', _count: 4 }],
        ),
      ),
    },
    project: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'allowed', name: 'Dự án được đọc' }]),
      count: vi.fn().mockResolvedValue(3),
      groupBy: vi
        .fn()
        .mockResolvedValue([{ healthStatus: 'ON_TRACK', _count: 3 }]),
    },
    task: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([]),
    },
    activity: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((values) => Promise.all(values)),
  };
  const db = prisma as unknown as PrismaService;
  return {
    prisma,
    controller: new DashboardController(
      db,
      new BusinessEntityPolicy(db),
      new TasksService(db),
    ),
  };
}

describe('DashboardController', () => {
  it('giới hạn hoạt động theo giao của quyền dự án và quyền hoạt động', async () => {
    const { controller, prisma } = fixture();
    const scoped = {
      ...actor,
      permissions: ['activity.read', 'project.read'],
      permissionSources: [
        {
          permission: 'project.read',
          roleId: 'reader',
          roleName: 'Đọc',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'activity.read',
          roleId: 'activity',
          roleName: 'Hoạt động',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    };
    await controller.get(scoped);
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: projectWhereForPermissions(scoped, [
        'project.read',
        'activity.read',
      ]),
      select: { id: true, name: true },
    });
    expect(prisma.activity.findMany.mock.calls[0]![0]).toMatchObject({
      where: { entityId: { in: ['allowed'] } },
      select: { id: true, event: true },
    });
    expect(
      prisma.activity.findMany.mock.calls[0]![0].select,
    ).not.toHaveProperty('metadata');
  });
  it('giữ scope, currency và độ chính xác của snapshot, không cộng các đồng tiền', async () => {
    const { controller, prisma } = fixture();
    const result = await controller.get(actor);
    expect(result.kpis).toMatchObject({
      activeLeads: 2,
      activeProjects: 3,
      overdueTasks: 1,
    });
    expect(result).toMatchObject({
      opportunityValues: [
        { currency: 'VND', value: '9007199254740993.25' },
        { currency: 'USD', value: '25.50' },
      ],
    });
    expect(result.kpis).not.toHaveProperty('pipelineValue');
    expect(prisma.project.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'organization',
          deletedAt: null,
        }),
      }),
    );
    expect(prisma.opportunity.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['currency'],
        where: expect.objectContaining({
          organizationId: 'organization',
          ownerId: 'user',
          stage: { notIn: ['WON', 'LOST'] },
        }),
      }),
    );
    expect(result).toHaveProperty('asOf');
  });
  it('không trả hoặc truy vấn giá trị tiền nếu thiếu quyền tài chính', async () => {
    const { controller, prisma } = fixture();
    const result = await controller.get({
      ...actor,
      permissions: actor.permissions.filter((p) => p !== 'estimate.read'),
    });
    expect(result).not.toHaveProperty('opportunityValues');
    expect(result.kpis).not.toHaveProperty('pipelineValue');
    expect(result.pipeline).toEqual([{ stage: 'DISCOVERY', count: 4 }]);
    expect(prisma.opportunity.aggregate).not.toHaveBeenCalled();
    expect(prisma.opportunity.groupBy.mock.calls.every(([q]) => !q._sum)).toBe(
      true,
    );
  });
  it('không dùng dashboard.read để cấp thêm quyền đọc module', async () => {
    const { controller, prisma } = fixture();
    const result = await controller.get({
      ...actor,
      permissions: ['dashboard.read'],
    });
    expect(result.kpis).toEqual({
      activeLeads: null,
      activeProjects: null,
      overdueTasks: null,
    });
    expect(result.pipeline).toEqual([]);
    expect(result.attentionTasks).toEqual([]);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.project.count).not.toHaveBeenCalled();
  });
});
