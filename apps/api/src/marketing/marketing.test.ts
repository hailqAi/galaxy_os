import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { MarketingService } from './marketing.service';
import {
  FakePublishingProvider,
  PublishingService,
} from './publishing.service';

const actor = {
  organizationId: 'organization',
  userId: 'user',
  organizationMembershipId: 'membership',
  email: 'user@example.test',
  displayName: 'User',
  mustChangePassword: false,
  permissions: [],
  administrationScope: 'ORGANIZATION',
  managedDepartmentIds: [],
  administrationTier: 1,
} satisfies CurrentActor;

describe('Marketing workflows', () => {
  it('prevents an author from approving their own content', async () => {
    const tx = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'content',
          status: 'IN_REVIEW',
          authorId: actor.userId,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;
    await expect(
      new MarketingService(prisma).transition(actor, 'content', 'approve'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('publishes a due job once and stores the fake provider URL', async () => {
    const job = {
      id: 'job',
      organizationId: actor.organizationId,
      contentItemId: 'content',
      channel: 'WEBSITE',
      attemptCount: 0,
      maxAttempts: 3,
      contentVariant: { title: 'Title', body: 'Body' },
    };
    const tx = {
      publishingAttempt: { update: vi.fn() },
      publishingJob: {
        update: vi.fn().mockResolvedValue({ id: 'job', status: 'PUBLISHED' }),
      },
      contentItem: { update: vi.fn() },
      activity: { create: vi.fn() },
    };
    const prisma = {
      publishingJob: {
        findMany: vi.fn().mockResolvedValue([{ id: 'job' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue(job),
      },
      publishingAttempt: {
        create: vi.fn().mockResolvedValue({ id: 'attempt' }),
      },
      $transaction: vi.fn((work) =>
        typeof work === 'function' ? work(tx) : Promise.all(work),
      ),
    } as unknown as PrismaService;
    const result = await new PublishingService(
      prisma,
      new FakePublishingProvider(),
    ).processDue(actor, 10);
    expect(result.processed).toBe(1);
    expect(tx.publishingJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PUBLISHED',
          publishedUrl: expect.stringContaining('/website/job'),
        }),
      }),
    );
  });

  it('prevents duplicate processing when the database lock is held', async () => {
    const prisma = {
      publishingJob: {
        findMany: vi.fn().mockResolvedValue([{ id: 'job' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;
    const result = await new PublishingService(
      prisma,
      new FakePublishingProvider(),
    ).processDue(actor, 10);
    expect(result.processed).toBe(0);
  });
});
