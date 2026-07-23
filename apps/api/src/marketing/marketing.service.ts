import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import {
  CampaignDto,
  ContentDto,
  MarketingQuery,
  ScheduleDto,
  VariantDto,
} from './marketing.dto';

@Injectable()
export class MarketingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listCampaigns(actor: CurrentActor) {
    return this.prisma.campaign.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
  createCampaign(actor: CurrentActor, dto: CampaignDto) {
    return this.prisma.campaign.create({
      data: {
        organizationId: actor.organizationId,
        ownerId: actor.userId,
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }
  async listContent(actor: CurrentActor, query: MarketingQuery) {
    const where = {
      organizationId: actor.organizationId,
      status: query.status,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentItem.findMany({
        where,
        include: {
          campaign: true,
          author: { select: { displayName: true } },
          variants: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contentItem.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
  createContent(actor: CurrentActor, dto: ContentDto) {
    return this.prisma.contentItem.create({
      data: {
        organizationId: actor.organizationId,
        authorId: actor.userId,
        ...dto,
      },
    });
  }
  async getContent(actor: CurrentActor, id: string) {
    const item = await this.prisma.contentItem.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        campaign: true,
        variants: true,
        publishingJobs: {
          include: { attempts: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Content not found');
    return item;
  }
  async updateContent(actor: CurrentActor, id: string, dto: ContentDto) {
    const item = await this.getContent(actor, id);
    if (!['DRAFT', 'REJECTED'].includes(item.status))
      throw new ConflictException(
        'Only draft or rejected content can be edited',
      );
    return this.prisma.contentItem.update({ where: { id }, data: dto });
  }
  async variant(actor: CurrentActor, id: string, dto: VariantDto) {
    await this.getContent(actor, id);
    return this.prisma.contentVariant.upsert({
      where: {
        contentItemId_channel: { contentItemId: id, channel: dto.channel },
      },
      create: { contentItemId: id, ...dto },
      update: dto,
    });
  }
  transition(
    actor: CurrentActor,
    id: string,
    action: 'submit-review' | 'approve' | 'reject',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.contentItem.findFirst({
        where: { id, organizationId: actor.organizationId },
      });
      if (!item) throw new NotFoundException('Content not found');
      const next =
        action === 'submit-review'
          ? item.status === 'DRAFT'
            ? 'IN_REVIEW'
            : null
          : action === 'approve'
            ? item.status === 'IN_REVIEW'
              ? 'APPROVED'
              : null
            : item.status === 'IN_REVIEW'
              ? 'REJECTED'
              : null;
      if (!next) throw new ConflictException('Invalid content transition');
      if (action === 'approve' && item.authorId === actor.userId)
        throw new ForbiddenException('Author cannot approve own content');
      const updated = await tx.contentItem.update({
        where: { id },
        data: {
          status: next,
          approverId: action === 'approve' ? actor.userId : undefined,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `CONTENT_${next}`,
          entityType: 'MarketingContent',
          entityId: id,
        },
      });
      if (item.authorId !== actor.userId)
        await tx.notification.create({
          data: {
            organizationId: actor.organizationId,
            recipientId: item.authorId,
            actorId: actor.userId,
            type: `CONTENT_${next}`,
            title: `${item.title}: ${next}`,
            entityType: 'MarketingContent',
            entityId: id,
            href: `/marketing/content/${id}`,
            idempotencyKey: `content:${id}:${next}`,
          },
        });
      return updated;
    });
  }
  async schedule(actor: CurrentActor, id: string, dto: ScheduleDto) {
    const item = await this.getContent(actor, id);
    if (item.status !== 'APPROVED')
      throw new ConflictException('Content must be approved');
    if (!item.variants.length)
      throw new BadRequestException('At least one channel variant is required');
    const scheduledAt = new Date(dto.scheduledAt);
    return this.prisma.$transaction(async (tx) => {
      await tx.contentItem.update({
        where: { id },
        data: { status: 'SCHEDULED', scheduledAt },
      });
      for (const variant of item.variants)
        await tx.publishingJob.upsert({
          where: {
            idempotencyKey: createHash('sha256')
              .update(`${id}:${variant.id}:${scheduledAt.toISOString()}`)
              .digest('hex'),
          },
          create: {
            organizationId: actor.organizationId,
            contentItemId: id,
            contentVariantId: variant.id,
            channel: variant.channel,
            scheduledAt,
            idempotencyKey: createHash('sha256')
              .update(`${id}:${variant.id}:${scheduledAt.toISOString()}`)
              .digest('hex'),
          },
          update: {},
        });
      return tx.contentItem.findUniqueOrThrow({ where: { id } });
    });
  }
  async cancelSchedule(actor: CurrentActor, id: string) {
    const item = await this.getContent(actor, id);
    if (item.status !== 'SCHEDULED')
      throw new ConflictException('Content is not scheduled');
    return this.prisma.$transaction([
      this.prisma.publishingJob.updateMany({
        where: {
          organizationId: actor.organizationId,
          contentItemId: id,
          status: 'SCHEDULED',
        },
        data: { status: 'CANCELLED' },
      }),
      this.prisma.contentItem.update({
        where: { id },
        data: { status: 'APPROVED', scheduledAt: null },
      }),
    ]);
  }
}
