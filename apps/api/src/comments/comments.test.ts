import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { CommentsService } from './comments.service';
const actor = {
  organizationId: 'organization',
  userId: 'actor',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: ['comment.update_own', 'comment.delete_own'],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;
describe('CommentsService', () => {
  it('creates comment, mention, notification and activity atomically', async () => {
    const tx = {
      comment: {
        create: vi.fn().mockResolvedValue({ id: 'comment' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'comment' }),
      },
      mention: { createMany: vi.fn() },
      notification: { createMany: vi.fn() },
      activity: { create: vi.fn() },
    };
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(1) },
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({}),
    } as unknown as BusinessEntityPolicy;
    await new CommentsService(prisma, entities).create(actor, {
      entityType: 'Project',
      entityId: 'project',
      body: '<script>alert(1)</script>',
      mentionedUserIds: ['user'],
    });
    expect(tx.mention.createMany).toHaveBeenCalledOnce();
    expect(tx.notification.createMany).toHaveBeenCalledOnce();
    expect(tx.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'COMMENT_CREATED' }),
      }),
    );
  });
  it('keeps replies on the parent entity', async () => {
    const prisma = {
      comment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'parent',
          entityType: 'Task',
          entityId: 'task',
          authorId: 'other',
        }),
      },
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({}),
    } as unknown as BusinessEntityPolicy;
    await expect(
      new CommentsService(prisma, entities).reply(actor, 'parent', {
        entityType: 'Project',
        entityId: 'project',
        body: 'Sai object',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('denies editing another author without update-any permission', async () => {
    const prisma = {
      comment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'comment',
          entityType: 'Project',
          entityId: 'project',
          authorId: 'other',
        }),
      },
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({}),
    } as unknown as BusinessEntityPolicy;
    await expect(
      new CommentsService(prisma, entities).update(actor, 'comment', 'edit'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects inactive or cross-organization mentions', async () => {
    const prisma = {
      user: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({}),
    } as unknown as BusinessEntityPolicy;
    await expect(
      new CommentsService(prisma, entities).create(actor, {
        entityType: 'Project',
        entityId: 'project',
        body: 'mention',
        mentionedUserIds: ['outside'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
