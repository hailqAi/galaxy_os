import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from './notifications.service';

const actor = {
  organizationId: 'organization',
  userId: 'recipient',
  organizationMembershipId: 'membership',
  email: 'actor@example.test',
  displayName: 'Actor',
  mustChangePassword: false,
  permissions: ['notification.read'],
  administrationScope: 'SELF',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

describe('NotificationsService', () => {
  it('lists only current recipient and hides unauthorized links', async () => {
    const prisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'notification',
            entityType: 'Project',
            entityId: 'project',
            href: '/projects/project',
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn((queries) => Promise.all(queries)),
    } as unknown as PrismaService;
    const entities = {
      assertView: vi.fn().mockRejectedValue(new NotFoundException()),
    } as unknown as BusinessEntityPolicy;
    const result = await new NotificationsService(prisma, entities).list(
      actor,
      { page: 1, pageSize: 20 },
    );
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientId: actor.userId,
          organizationId: actor.organizationId,
        }),
      }),
    );
    expect(result.items[0]?.href).toBeNull();
  });

  it('marks only an owned notification read', async () => {
    const prisma = {
      notification: {
        findFirst: vi.fn().mockResolvedValue({ id: 'notification' }),
        update: vi.fn().mockResolvedValue({ id: 'notification' }),
      },
    } as unknown as PrismaService;
    const service = new NotificationsService(
      prisma,
      {} as BusinessEntityPolicy,
    );
    await service.markRead(actor, 'notification', true);
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'notification',
        organizationId: actor.organizationId,
        recipientId: actor.userId,
      },
      select: { id: true },
    });
  });

  it('does not expose another user notification', async () => {
    const prisma = {
      notification: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(
      new NotificationsService(prisma, {} as BusinessEntityPolicy).markRead(
        actor,
        'other',
        true,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
