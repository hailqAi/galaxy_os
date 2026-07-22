import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { redact } from '../security-redaction';

type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: unknown;
};

const json = (value: unknown) =>
  value === undefined
    ? undefined
    : (redact(JSON.parse(JSON.stringify(value))) as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  write(tx: Prisma.TransactionClient, actor: CurrentActor, input: AuditInput) {
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeData: json(input.beforeData),
        afterData: json(input.afterData),
        metadata: json(input.metadata),
      },
    });
  }

  list(
    actor: CurrentActor,
    query: {
      page: number;
      pageSize: number;
      actor?: string;
      action?: string;
      entityType?: string;
      from?: Date;
      to?: Date;
    },
  ) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: actor.organizationId,
      actorUserId: query.actor,
      action: query.action,
      entityType: query.entityType,
      createdAt:
        query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
    };
    return this.prisma
      .$transaction([
        this.prisma.auditLog.findMany({
          where,
          include: {
            actor: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.auditLog.count({ where }),
      ])
      .then(([items, total]) => ({
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
      }));
  }

  listSystem(query: {
    page: number;
    pageSize: number;
    actor?: string;
    action?: string;
    entityType?: string;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      actorUserId: query.actor,
      action: query.action,
      entityType: query.entityType,
    };
    return this.prisma
      .$transaction([
        this.prisma.auditLog.findMany({
          where,
          include: {
            organization: { select: { id: true, name: true } },
            actor: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.auditLog.count({ where }),
      ])
      .then(([items, total]) => ({
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
      }));
  }
}
