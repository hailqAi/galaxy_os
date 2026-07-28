import { ForbiddenException } from '@nestjs/common';
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
