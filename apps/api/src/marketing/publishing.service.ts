import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { PublishingQuery } from './marketing.dto';

export type PublishingInput = {
  jobId: string;
  channel: string;
  title: string | null;
  body: string;
};
export type PublishingResult = { publishedUrl: string };
export interface PublishingProvider {
  publish(input: PublishingInput): Promise<PublishingResult>;
  validateConfiguration(): Promise<{ valid: boolean }>;
}

@Injectable()
export class FakePublishingProvider implements PublishingProvider {
  async publish(input: PublishingInput) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('PROVIDER_NOT_CONFIGURED');
    return {
      publishedUrl: `https://example.test/published/${input.channel.toLowerCase()}/${input.jobId}`,
    };
  }
  async validateConfiguration() {
    return { valid: process.env.NODE_ENV !== 'production' };
  }
}

@Injectable()
export class PublishingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FakePublishingProvider)
    private readonly provider: PublishingProvider,
  ) {}
  async list(actor: CurrentActor, query: PublishingQuery) {
    const where = {
      organizationId: actor.organizationId,
      status: query.status,
      channel: query.channel,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.publishingJob.findMany({
        where,
        include: {
          contentItem: { select: { title: true, brandEcosystem: true } },
          attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        },
        orderBy: { scheduledAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.publishingJob.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.publishingJob.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { attempts: true, contentItem: true, contentVariant: true },
    });
    if (!item) throw new NotFoundException('Publishing job not found');
    return item;
  }
  async retry(actor: CurrentActor, id: string) {
    const item = await this.get(actor, id);
    if (item.status !== 'FAILED')
      throw new ConflictException('Only failed jobs can be retried');
    return this.prisma.publishingJob.update({
      where: { id },
      data: {
        status: 'QUEUED',
        lockedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }
  async cancel(actor: CurrentActor, id: string) {
    const item = await this.get(actor, id);
    if (!['SCHEDULED', 'QUEUED', 'RETRY_SCHEDULED'].includes(item.status))
      throw new ConflictException('Job can no longer be cancelled');
    return this.prisma.publishingJob.update({
      where: { id },
      data: { status: 'CANCELLED', lockedAt: null },
    });
  }
  async processDue(actor: CurrentActor, limit: number) {
    const due = await this.prisma.publishingJob.findMany({
      where: {
        organizationId: actor.organizationId,
        status: { in: ['SCHEDULED', 'QUEUED', 'RETRY_SCHEDULED'] },
        scheduledAt: { lte: new Date() },
        lockedAt: null,
      },
      select: { id: true },
      take: limit,
      orderBy: { scheduledAt: 'asc' },
    });
    const results = [];
    for (const candidate of due) {
      const locked = await this.prisma.publishingJob.updateMany({
        where: {
          id: candidate.id,
          organizationId: actor.organizationId,
          status: { in: ['SCHEDULED', 'QUEUED', 'RETRY_SCHEDULED'] },
          lockedAt: null,
        },
        data: { status: 'PUBLISHING', lockedAt: new Date() },
      });
      if (!locked.count) continue;
      results.push(await this.processOne(actor, candidate.id));
    }
    return { processed: results.length, results };
  }
  private async processOne(actor: CurrentActor, id: string) {
    const job = await this.get(actor, id);
    const attemptNumber = job.attemptCount + 1;
    const attempt = await this.prisma.publishingAttempt.create({
      data: {
        publishingJobId: id,
        attemptNumber,
        startedAt: new Date(),
        status: 'PUBLISHING',
      },
    });
    try {
      const result = await this.provider.publish({
        jobId: id,
        channel: job.channel,
        title: job.contentVariant.title,
        body: job.contentVariant.body,
      });
      return await this.prisma.$transaction(async (tx) => {
        await tx.publishingAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'PUBLISHED',
            finishedAt: new Date(),
            providerResponseSummary: { publishedUrl: result.publishedUrl },
          },
        });
        const updated = await tx.publishingJob.update({
          where: { id },
          data: {
            status: 'PUBLISHED',
            publishedUrl: result.publishedUrl,
            completedAt: new Date(),
            lockedAt: null,
            attemptCount: attemptNumber,
          },
        });
        await tx.contentItem.update({
          where: { id: job.contentItemId },
          data: { status: 'PUBLISHED' },
        });
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'CONTENT_PUBLISHED',
            entityType: 'MarketingContent',
            entityId: job.contentItemId,
          },
        });
        return updated;
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message.slice(0, 500) : 'PUBLISH_FAILED';
      const retry =
        attemptNumber < job.maxAttempts &&
        message !== 'PROVIDER_NOT_CONFIGURED';
      await this.prisma.$transaction([
        this.prisma.publishingAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorCode: message,
            errorMessage: message,
          },
        }),
        this.prisma.publishingJob.update({
          where: { id },
          data: {
            status: retry ? 'RETRY_SCHEDULED' : 'FAILED',
            scheduledAt: retry
              ? new Date(Date.now() + 2 ** attemptNumber * 60_000)
              : job.scheduledAt,
            attemptCount: attemptNumber,
            lastErrorCode: message,
            lastErrorMessage: message,
            lockedAt: null,
          },
        }),
      ]);
      return { id, status: retry ? 'RETRY_SCHEDULED' : 'FAILED' };
    }
  }
}
