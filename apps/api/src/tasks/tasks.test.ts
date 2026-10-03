import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { TasksService } from './tasks.service';
const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'MANAGED_DEPARTMENTS',
  managedDepartmentIds: ['sales'],
  administrationTier: 1,
} satisfies CurrentActor;
describe('TasksService', () => {
  it('lọc việc chưa kết thúc trước phân trang để P03 không suy ưu tiên từ top N đã đóng', async () => {
    const findMany = vi.fn().mockResolvedValue([]),
      count = vi.fn().mockResolvedValue(0);
    const prisma = {
      task: { findMany, count },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;
    await new TasksService(prisma).list(actor, {
      page: 1,
      pageSize: 8,
      open: true,
      projectId: 'project',
    });
    expect(findMany.mock.calls[0]![0].where).toMatchObject({
      projectId: 'project',
      NOT: { status: { in: ['DONE', 'CANCELLED'] } },
    });
    expect(count.mock.calls[0]![0].where).toEqual(
      findMany.mock.calls[0]![0].where,
    );
  });
  it('omits allocated budget from generic Task lists without estimate.read', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'task' }]);
    const prisma = {
      task: { findMany, count: vi.fn().mockResolvedValue(1) },
      $transaction: vi.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    } as unknown as PrismaService;

    const result = await new TasksService(prisma).list(actor, {
      page: 1,
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { allocatedBudget: true } }),
    );
    expect(JSON.stringify(result)).not.toContain('allocatedBudget');
  });

  it('rejects cross-department assignees', async () => {
    const prisma = {
      task: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'task', departmentId: 'accounting' }),
      },
      activity: { findMany: vi.fn() },
    } as unknown as PrismaService;
    await expect(
      new TasksService(prisma).assign(actor, 'task', ['user']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['update', 'remove'] as const)(
    'blocks generic %s for a Stage 2 baseline row',
    async (operation) => {
      const prisma = {
        task: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'task',
            relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
          }),
          update: vi.fn(),
        },
        activity: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const service = new TasksService(prisma);

      const result =
        operation === 'update'
          ? service.update(actor, 'task', { title: 'Bypass' })
          : service.remove(actor, 'task');
      await expect(result).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.task.update).not.toHaveBeenCalled();
    },
  );
  it('blocks generic create with the reserved Stage 2 discriminator', async () => {
    const transaction = vi.fn();
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(
      new TasksService(prisma).create(actor, {
        title: 'Bypass',
        relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('blocks assigning the reserved Stage 2 discriminator on generic update', async () => {
    const update = vi.fn();
    const prisma = {
      task: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'task',
          relatedEntityType: null,
        }),
        update,
      },
      activity: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    await expect(
      new TasksService(prisma).update(actor, 'task', {
        relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });
  it('completes and records completedAt atomically', async () => {
    const tx = {
      task: {
        update: vi.fn().mockResolvedValue({ id: 'task', status: 'DONE' }),
      },
      activity: { create: vi.fn() },
    };
    const prisma = {
      task: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'task', status: 'IN_PROGRESS' }),
      },
      activity: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await new TasksService(prisma).complete(actor, 'task');
    expect(tx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        omit: { allocatedBudget: true },
        data: expect.objectContaining({
          status: 'DONE',
          completedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.activity.create).toHaveBeenCalledOnce();
  });
  it('reopens a completed task by clearing completedAt', async () => {
    const tx = {
      task: { update: vi.fn().mockResolvedValue({ id: 'task' }) },
      activity: { create: vi.fn() },
    };
    const prisma = {
      task: {
        findFirst: vi.fn().mockResolvedValue({ id: 'task', status: 'DONE' }),
      },
      activity: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await new TasksService(prisma).changeStatus(actor, 'task', 'TODO');
    expect(tx.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedAt: null }),
      }),
    );
  });
});
