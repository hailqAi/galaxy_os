import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { CreateCommentDto } from './comments.dto';
@Injectable()
export class CommentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly entities: BusinessEntityPolicy,
  ) {}
  private include() {
    return {
      author: { select: { id: true, displayName: true } },
      mentions: {
        include: {
          mentionedUser: { select: { id: true, displayName: true } },
          mentionedDepartment: { select: { id: true, name: true } },
        },
      },
      _count: { select: { replies: true } },
      replies: {
        where: { deletedAt: null },
        include: { author: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'asc' as const },
      },
    } as const;
  }
  async list(
    actor: CurrentActor,
    q: {
      entityType: string;
      entityId: string;
      parentCommentId?: string;
      page: number;
      pageSize: number;
      direction?: 'asc' | 'desc';
    },
  ) {
    await this.entities.assertView(actor, q.entityType, q.entityId);
    const where = {
      organizationId: actor.organizationId,
      entityType: q.entityType,
      entityId: q.entityId,
      parentCommentId: q.parentCommentId ?? null,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        include: this.include(),
        orderBy: { createdAt: q.direction ?? 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.comment.count({ where }),
    ]);
    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }
  async get(actor: CurrentActor, id: string) {
    const item = await this.prisma.comment.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: this.include(),
    });
    if (!item) throw new NotFoundException('Comment not found');
    await this.entities.assertView(actor, item.entityType, item.entityId);
    return item;
  }
  async create(
    actor: CurrentActor,
    data: CreateCommentDto,
    parentCommentId?: string,
  ) {
    await this.entities.assertView(actor, data.entityType, data.entityId);
    if (parentCommentId) {
      const parent = await this.get(actor, parentCommentId);
      if (
        parent.entityType !== data.entityType ||
        parent.entityId !== data.entityId
      )
        throw new ForbiddenException('Reply must use the parent entity');
    }
    const body = this.body(data.body);
    const users = [...new Set(data.mentionedUserIds ?? [])].filter(
      (id) => id !== actor.userId,
    );
    const departments = [...new Set(data.mentionedDepartmentIds ?? [])];
    await this.mentions(actor, users, departments);
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          organizationId: actor.organizationId,
          entityType: data.entityType,
          entityId: data.entityId,
          parentCommentId,
          body,
          authorId: actor.userId,
        },
      });
      if (users.length || departments.length)
        await tx.mention.createMany({
          data: [
            ...users.map((mentionedUserId) => ({
              commentId: comment.id,
              mentionedUserId,
            })),
            ...departments.map((mentionedDepartmentId) => ({
              commentId: comment.id,
              mentionedDepartmentId,
            })),
          ],
          skipDuplicates: true,
        });
      if (users.length)
        await tx.notification.createMany({
          data: users.map((recipientId) => ({
            organizationId: actor.organizationId,
            recipientId,
            type: 'MENTION',
            title: `${actor.displayName} đã nhắc đến bạn`,
            body: body.slice(0, 200),
            entityType: 'Comment',
            entityId: comment.id,
          })),
        });
      if (parentCommentId) {
        const parent = await tx.comment.findUniqueOrThrow({
          where: { id: parentCommentId },
        });
        if (parent.authorId !== actor.userId)
          await tx.notification.create({
            data: {
              organizationId: actor.organizationId,
              recipientId: parent.authorId,
              type: 'COMMENT_REPLIED',
              title: `${actor.displayName} đã trả lời bình luận`,
              body: body.slice(0, 200),
              entityType: 'Comment',
              entityId: comment.id,
            },
          });
      }
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: parentCommentId ? 'COMMENT_REPLIED' : 'COMMENT_CREATED',
          entityType: data.entityType,
          entityId: data.entityId,
          metadata: { commentId: comment.id },
        },
      });
      return tx.comment.findUniqueOrThrow({
        where: { id: comment.id },
        include: this.include(),
      });
    });
  }
  reply(actor: CurrentActor, parentId: string, data: CreateCommentDto) {
    return this.create(actor, data, parentId);
  }
  async update(actor: CurrentActor, id: string, body: string) {
    const before = await this.get(actor, id);
    if (
      before.authorId !== actor.userId &&
      !actor.permissions.includes('comment.update_any')
    )
      throw new ForbiddenException('Only the author can edit this comment');
    const item = await this.prisma.comment.update({
      where: { id },
      data: {
        body: this.body(body),
        editedAt: new Date(),
        version: { increment: 1 },
      },
      include: this.include(),
    });
    await this.prisma.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event: 'COMMENT_EDITED',
        entityType: before.entityType,
        entityId: before.entityId,
        metadata: { commentId: id },
      },
    });
    return item;
  }
  async remove(actor: CurrentActor, id: string) {
    const before = await this.get(actor, id);
    if (
      before.authorId !== actor.userId &&
      !actor.permissions.includes('comment.delete_any')
    )
      throw new ForbiddenException('Only the author can delete this comment');
    await this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date(), body: '', version: { increment: 1 } },
    });
    await this.prisma.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event: 'COMMENT_DELETED',
        entityType: before.entityType,
        entityId: before.entityId,
        metadata: { commentId: id },
      },
    });
    return { deleted: true };
  }
  private body(value: string) {
    const body = value.trim();
    if (
      !body ||
      [...body].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 && ![9, 10, 13].includes(code);
      })
    )
      throw new ForbiddenException('Comment contains unsupported characters');
    return body;
  }
  private async mentions(
    actor: CurrentActor,
    userIds: string[],
    departmentIds: string[],
  ) {
    if (userIds.length) {
      const count = await this.prisma.user.count({
        where: {
          id: { in: userIds },
          status: 'active',
          organizationMembers: {
            some: { organizationId: actor.organizationId, status: 'active' },
          },
        },
      });
      if (count !== userIds.length)
        throw new NotFoundException('Mentioned user not found');
    }
    if (departmentIds.length) {
      const count = await this.prisma.department.count({
        where: {
          id: { in: departmentIds },
          organizationId: actor.organizationId,
          status: 'active',
        },
      });
      if (count !== departmentIds.length)
        throw new NotFoundException('Mentioned department not found');
    }
  }
}
