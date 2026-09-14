import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { REQUIRED_PERMISSIONS } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { CommentsController } from './comments.controller';
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

  it('allows delete-any through the controller and service, but no permissionless deletion', async () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS,
        CommentsController.prototype.remove,
      ),
    ).toBeUndefined();
    const remove = vi.fn().mockResolvedValue({ deleted: true });
    await expect(
      new CommentsController({ remove } as unknown as CommentsService).remove(
        { ...actor, permissions: ['comment.delete_any'] },
        'comment',
      ),
    ).resolves.toEqual({ deleted: true });
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ['comment.delete_any'] }),
      'comment',
    );

    const prisma = {
      comment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'comment',
          entityType: 'Project',
          entityId: 'project',
          authorId: 'actor',
        }),
      },
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({}),
    } as unknown as BusinessEntityPolicy;
    await expect(
      new CommentsService(prisma, entities).remove(
        { ...actor, permissions: [] },
        'comment',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps delete-own author-only while allowing delete-any for another author', async () => {
    const prisma = {
      comment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'comment',
          entityType: 'Project',
          entityId: 'project',
          authorId: 'other',
        }),
        update: vi.fn(),
      },
      activity: { create: vi.fn() },
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockResolvedValue({}),
    } as unknown as BusinessEntityPolicy;
    const service = new CommentsService(prisma, entities);

    await expect(service.remove(actor, 'comment')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.remove(
        { ...actor, permissions: ['comment.delete_any'] },
        'comment',
      ),
    ).resolves.toEqual({ deleted: true });
  });
});
