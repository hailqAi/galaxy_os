import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ChatRoomGrant, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CurrentActor } from './current-actor';
import { readEnvironment } from '../config/env';
import { createHash, randomUUID } from 'node:crypto';

export const activeChatGrant = (now: Date) => ({
  revokedAt: null,
  effectiveAt: { lte: now },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

@Injectable()
export class ProjectChatPolicy {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  private async traceDeniedGrant(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    action: string,
    now: Date,
    roomId?: string,
  ) {
    // Observer only in the isolated test bootstrap. Public denials remain opaque.
    if (process.env.M2_CLOCK_OBSERVE !== 'true') return;
    const grants = roomId
      ? await tx.chatRoomGrant.findMany({
          where: {
            roomId,
            userId: actor.userId,
            organizationId: actor.organizationId,
          },
          include: { issuedUnder: true },
        })
      : await tx.chatProjectGrant.findMany({
          where: {
            projectId,
            userId: actor.userId,
            organizationId: actor.organizationId,
            actions: { has: action },
          },
        });
    const ranges = grants.flatMap((g) => [
      g,
      ...('issuedUnder' in g ? [g.issuedUnder] : []),
    ]);
    process.stderr.write(
      JSON.stringify({
        event: 'chat.authorization.denied',
        correlationId: randomUUID(),
        scopeHash: createHash('sha256')
          .update([actor.userId, projectId, roomId ?? ''].join(':'))
          .digest('hex')
          .slice(0, 16),
        action,
        reason: 'GRANT_DENIED',
        observations: {
          hasFutureGrant: ranges.some((g) => g.effectiveAt > now),
          hasExpiredGrant: ranges.some(
            (g) => g.expiresAt && g.expiresAt <= now,
          ),
        },
        authorizationTime: now.toISOString(),
        ranges: ranges.map((g) => ({
          effectiveAt: g.effectiveAt.toISOString(),
          expiresAt: g.expiresAt?.toISOString() ?? null,
          revoked: Boolean(g.revokedAt),
        })),
      }) + '\n',
    );
  }

  async live(actor: CurrentActor, tx: Prisma.TransactionClient) {
    const now = new Date();
    const member = await tx.organizationMembership.findFirst({
      where: {
        id: actor.organizationMembershipId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        status: 'active',
        user: { status: 'active' },
        organization: { status: 'active' },
      },
    });
    if (
      !member ||
      !actor.sessionId ||
      !(await tx.session.findFirst({
        where: {
          id: actor.sessionId,
          userId: actor.userId,
          organizationMembershipId: member.id,
          revokedAt: null,
          expiresAt: { gt: now },
          lastSeenAt: {
            gt: new Date(
              now.getTime() - readEnvironment().SESSION_IDLE_MINUTES * 60_000,
            ),
          },
        },
      }))
    )
      throw new UnauthorizedException('Phiên đăng nhập không còn hợp lệ');
    return member;
  }

  async freshActor(tx: Prisma.TransactionClient, actor: CurrentActor) {
    if ((await this.live(actor, tx)).kind !== 'INTERNAL')
      throw new ForbiddenException();
    const assignments = await tx.userRole.findMany({
      where: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        role: { status: 'active' },
      },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    const managed = await tx.managedDepartment.findMany({
      where: {
        organizationId: actor.organizationId,
        managerId: actor.organizationMembershipId,
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        department: { status: 'active' },
      },
    });
    const units = managed.some((m) => m.includeChildren)
      ? await tx.department.findMany({
          where: { organizationId: actor.organizationId, status: 'active' },
          select: { id: true, parentId: true },
        })
      : [];
    const scopes = new Map<string, string[]>();
    for (const m of managed) {
      const ids = new Set([m.departmentId]);
      if (m.includeChildren)
        for (let changed = true; changed; ) {
          changed = false;
          for (const d of units)
            if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) {
              ids.add(d.id);
              changed = true;
            }
        }
      scopes.set(m.departmentId, [...ids]);
    }
    const fresh: CurrentActor = {
      ...actor,
      permissions: assignments.flatMap((a) =>
        a.role.permissions.map((p) => p.permission.code),
      ),
      permissionSources: assignments.flatMap((a) =>
        a.role.permissions.map((p) => ({
          permission: p.permission.code,
          assignmentId: a.id,
          roleId: a.role.id,
          roleName: a.role.name,
          administrationTier: a.role.administrationTier,
          scopeType: a.scopeType,
          departmentId: a.departmentId,
          managedDepartmentIds: a.departmentId
            ? (scopes.get(a.departmentId) ?? [])
            : [],
        })),
      ),
    };
    return fresh;
  }

  async project<T>(
    actor: CurrentActor,
    projectId: string,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      // ponytail: serialize a Project's chat writes/reads; use room locks if measured contention warrants it.
      const rows = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "Project" WHERE "id"=${projectId}::uuid AND "organizationId"=${actor.organizationId}::uuid AND "deletedAt" IS NULL FOR UPDATE`,
      );
      if (!rows.length) throw new NotFoundException();
      await this.live(actor, tx);
      const value = await run(tx);
      await this.live(actor, tx);
      return value;
    });
  }

  async roomProject(actor: CurrentActor, roomId: string) {
    const room = await this.db.chatRoom.findFirst({
      where: {
        id: roomId,
        organizationId: actor.organizationId,
        project: { deletedAt: null },
      },
      select: { projectId: true },
    });
    if (!room) throw new NotFoundException();
    return room.projectId;
  }

  authority(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    action: string,
  ) {
    if (actor.membershipKind === 'EXTERNAL') throw new ForbiddenException();
    const now = new Date();
    return tx.chatProjectGrant
      .findFirst({
        where: {
          organizationId: actor.organizationId,
          projectId,
          userId: actor.userId,
          actions: { has: action },
          ...activeChatGrant(now),
          membership: {
            kind: 'INTERNAL',
            status: 'active',
            user: { status: 'active' },
          },
        },
        orderBy: { effectiveAt: 'desc' },
      })
      .then(async (grant) => {
        if (!grant) {
          await this.traceDeniedGrant(tx, actor, projectId, action, now);
          throw new NotFoundException();
        }
        return grant;
      });
  }

  async assertRoom(
    actor: CurrentActor,
    roomId: string,
    action: string,
    tx: Prisma.TransactionClient,
  ) {
    const now = new Date();
    const room = await tx.chatRoom.findFirst({
      where: {
        id: roomId,
        organizationId: actor.organizationId,
        project: { deletedAt: null },
      },
    });
    if (!room) throw new NotFoundException();
    const current = await this.live(actor, tx);
    if (
      current.kind === 'EXTERNAL' &&
      (room.audience !== 'CUSTOMER' ||
        !(await tx.chatProjectParticipant.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: room.projectId,
            userId: actor.userId,
            revokedAt: null,
          },
        })))
    )
      throw new NotFoundException();
    const grant = await tx.chatRoomGrant.findFirst({
      where: {
        roomId,
        userId: actor.userId,
        organizationId: actor.organizationId,
        ...activeChatGrant(now),
        issuedUnder: {
          ...activeChatGrant(now),
          actions: { has: 'ACCESS_ADMIN' },
          membership: {
            kind: 'INTERNAL',
            status: 'active',
            user: { status: 'active' },
          },
        },
      },
      orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }],
    });
    if (!grant || !grant.actions.includes('READ')) {
      await this.traceDeniedGrant(
        tx,
        actor,
        room.projectId,
        action,
        now,
        roomId,
      );
      throw new NotFoundException();
    }
    const parent = await tx.chatProjectGrant.findUniqueOrThrow({
      where: { id: grant.issuedUnderId },
    });
    if (
      !grant.actions.includes(action) ||
      !parent.roomCeiling.includes('READ') ||
      !parent.roomCeiling.includes(action)
    )
      throw new ForbiddenException('Không có quyền thực hiện');
    return { room, grant };
  }

  async history(
    tx: Prisma.TransactionClient,
    grant: ChatRoomGrant,
    action: string,
  ): Promise<{ gte: Date; lt?: Date; historyId?: string }[]> {
    const rows = await tx.chatHistoryGrant.findMany({
      where: {
        grantId: grant.id,
        actions: { has: action },
        sourceGrant: {
          ...activeChatGrant(new Date()),
          actions: { hasEvery: ['READ', action] },
          membership: { status: 'active', user: { status: 'active' } },
          issuedUnder: {
            ...activeChatGrant(new Date()),
            actions: { has: 'ACCESS_ADMIN' },
            roomCeiling: { hasEvery: ['READ', action] },
            membership: {
              kind: 'INTERNAL',
              status: 'active',
              user: { status: 'active' },
            },
          },
        },
      },
    });
    const ranges: { gte: Date; lt?: Date; historyId?: string }[] = [
      { gte: grant.effectiveAt },
    ];
    for (const row of rows)
      if (await this.validHistory(tx, row.id, grant.roomId, action))
        ranges.push({ gte: row.from, lt: row.to, historyId: row.id });
    return ranges;
  }

  private async validHistory(
    tx: Prisma.TransactionClient,
    id: string,
    roomId: string,
    action: string,
  ) {
    const seen = new Set<string>();
    let next: string | null = id;
    let child: { sourceGrantId: string; from: Date; to: Date } | null = null;
    // ponytail: one read per provenance hop; recursive SQL if long chains become measurable.
    while (next) {
      if (seen.has(next)) return false;
      seen.add(next);
      const row: Prisma.ChatHistoryGrantGetPayload<{
        include: {
          sourceGrant: {
            include: {
              membership: { include: { user: true } };
              issuedUnder: {
                include: { membership: { include: { user: true } } };
              };
            };
          };
        };
      }> | null = await tx.chatHistoryGrant.findUnique({
        where: { id: next },
        include: {
          sourceGrant: {
            include: {
              membership: { include: { user: true } },
              issuedUnder: {
                include: { membership: { include: { user: true } } },
              },
            },
          },
        },
      });
      if (
        !row ||
        row.sourceGrant.roomId !== roomId ||
        !row.actions.includes(action)
      )
        return false;
      if (
        child &&
        (row.grantId !== child.sourceGrantId ||
          child.from < row.from ||
          child.to > row.to)
      )
        return false;
      const source = row.sourceGrant;
      const now = new Date();
      if (
        source.revokedAt ||
        source.effectiveAt > now ||
        (source.expiresAt && source.expiresAt <= now) ||
        !source.actions.includes(action) ||
        !source.actions.includes('READ') ||
        source.membership.status !== 'active' ||
        source.membership.user.status !== 'active'
      )
        return false;
      const admin = source.issuedUnder;
      if (
        admin.revokedAt ||
        admin.effectiveAt > now ||
        (admin.expiresAt && admin.expiresAt <= now) ||
        !admin.actions.includes('ACCESS_ADMIN') ||
        !admin.roomCeiling.includes(action) ||
        !admin.roomCeiling.includes('READ') ||
        admin.membership.kind !== 'INTERNAL' ||
        admin.membership.status !== 'active' ||
        admin.membership.user.status !== 'active'
      )
        return false;
      if (!row.sourceHistoryId) return row.from >= source.effectiveAt;
      child = row;
      next = row.sourceHistoryId;
    }
    return false;
  }
}
