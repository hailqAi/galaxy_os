import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { DashboardController } from './dashboard.controller';

const actor = {
  organizationId: 'organization',
  userId: 'user',
  organizationMembershipId: 'membership',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'SELF',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

describe('DashboardController', () => {
  it('uses scoped database filters for aggregate data', async () => {
    const queries = [
      Promise.resolve(2),
      Promise.resolve({ _sum: { estimatedValue: 100 } }),
      Promise.resolve(3),
      Promise.resolve(1),
      Promise.resolve([]),
      Promise.resolve([]),
      Promise.resolve([]),
    ];
    const prisma = {
      lead: { count: vi.fn(() => queries[0]) },
      opportunity: {
        aggregate: vi.fn(() => queries[1]),
        groupBy: vi.fn(() => queries[4]),
      },
      project: {
        count: vi.fn(() => queries[2]),
        groupBy: vi.fn(() => queries[5]),
      },
      task: {
        count: vi.fn(() => queries[3]),
        findMany: vi.fn(() => queries[6]),
      },
      $transaction: vi.fn((values) => Promise.all(values)),
    } as unknown as PrismaService;
    const entities = {
      leadWhere: vi.fn().mockReturnValue({ ownerId: actor.userId }),
      opportunityWhere: vi.fn().mockReturnValue({ ownerId: actor.userId }),
      projectWhere: vi.fn().mockReturnValue({
        members: { some: { userId: actor.userId } },
      }),
      taskWhere: vi.fn().mockReturnValue({
        assignees: { some: { userId: actor.userId } },
      }),
    } as unknown as BusinessEntityPolicy;
    const result = await new DashboardController(prisma, entities).get(actor);
    expect(result.kpis).toEqual({
      activeLeads: 2,
      pipelineValue: 100,
      activeProjects: 3,
      overdueTasks: 1,
    });
    expect(entities.taskWhere).toHaveBeenCalledWith(actor);
  });
});
