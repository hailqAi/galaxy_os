import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  CurrentActor,
  actorsForPermission,
} from '../access-control/current-actor';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
import { UserManagementPolicy } from '../access-control/user-management.policy';
import {
  activeChatGrant,
  ProjectChatPolicy,
} from '../access-control/project-chat.policy';
import { PrismaService } from '../prisma.service';
import { FileStorage } from '../files/file-storage';
import { TasksService } from '../tasks/tasks.service';
import {
  ChatAuthorityDto,
  ChatGrantDto,
  ChatMessageDto,
  ChatMessagesQuery,
  ChatRoomDto,
  ChatHistoryDto,
  chatCapability,
  ChatReleaseDto,
} from './project-chat.dto';

@Injectable()
export class ProjectChatService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
    @Inject(UserManagementPolicy) private readonly users: UserManagementPolicy,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(TasksService) private readonly tasks: TasksService,
  ) {}

  private event(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    entityId: string,
    action: string,
    details: Prisma.InputJsonObject = {},
  ) {
    // No message/title/filename; generic audit excludes this scoped event type.
    return tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        entityType: 'ChatRoom',
        entityId,
        action,
        metadata: { ...details, projectId },
      },
    });
  }

  async projects(actor: CurrentActor) {
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const member = await this.access.live(actor, tx);
      return tx.project.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          ...(member.kind === 'EXTERNAL'
            ? {
                chatParticipants: {
                  some: { userId: actor.userId, revokedAt: null },
                },
              }
            : {}),
          OR: [
            {
              chatRooms: {
                some: {
                  ...(member.kind === 'EXTERNAL'
                    ? { audience: 'CUSTOMER' }
                    : {}),
                  grants: {
                    some: {
                      userId: actor.userId,
                      actions: { has: 'READ' },
                      ...activeChatGrant(now),
                      issuedUnder: {
                        ...activeChatGrant(now),
                        actions: { has: 'ACCESS_ADMIN' },
                        roomCeiling: { has: 'READ' },
                        membership: {
                          kind: 'INTERNAL',
                          status: 'active',
                          user: { status: 'active' },
                        },
                      },
                    },
                  },
                },
              },
            },
            ...(member.kind === 'INTERNAL'
              ? [
                  {
                    chatAuthorities: {
                      some: { userId: actor.userId, ...activeChatGrant(now) },
                    },
                  },
                ]
              : []),
          ],
        },
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      });
    });
  }

  rooms(actor: CurrentActor, projectId: string) {
    return this.access.project(actor, projectId, async (tx) => {
      const rows = await tx.chatRoom.findMany({
        where: { organizationId: actor.organizationId, projectId },
        orderBy: { createdAt: 'asc' },
      });
      const rooms = [];
      for (const room of rows) {
        try {
          const { grant } = await this.access.assertRoom(
            actor,
            room.id,
            'READ',
            tx,
          );
          const parent = await tx.chatProjectGrant.findUniqueOrThrow({
            where: { id: grant.issuedUnderId },
          });
          rooms.push({
            id: room.id,
            title: room.title,
            group: room.group,
            audience: room.audience,
            locked: room.locked,
            grantId: grant.id,
            actions: grant.actions.filter((a) =>
              parent.roomCeiling.includes(a),
            ),
          });
        } catch (error) {
          if (
            !(
              error instanceof NotFoundException ||
              error instanceof ForbiddenException
            )
          )
            throw error;
        }
      }
      const authorities =
        actor.membershipKind === 'EXTERNAL'
          ? []
          : await tx.chatProjectGrant.findMany({
              where: {
                organizationId: actor.organizationId,
                projectId,
                userId: actor.userId,
                ...activeChatGrant(new Date()),
              },
            });
      if (!rooms.length && !authorities.length) throw new NotFoundException();
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { id: true, name: true },
      });
      return {
        project,
        rooms,
        authorityActions: [...new Set(authorities.flatMap((a) => a.actions))],
      };
    });
  }

  management(actor: CurrentActor, projectId: string) {
    return this.access.project(actor, projectId, async (tx) => {
      const authority = await this.access.authority(
        tx,
        actor,
        projectId,
        'ACCESS_ADMIN',
      );
      const members = await tx.organizationMembership.findMany({
        where: {
          organizationId: actor.organizationId,
          status: 'active',
          user: { status: 'active' },
          OR: [
            { kind: 'INTERNAL' },
            {
              kind: 'EXTERNAL',
              chatProjects: { some: { projectId, revokedAt: null } },
            },
          ],
        },
        select: {
          userId: true,
          kind: true,
          user: { select: { displayName: true } },
        },
        orderBy: { userId: 'asc' },
      });
      const rooms = await tx.chatRoom.findMany({
        where: { projectId, organizationId: actor.organizationId },
        select: {
          id: true,
          group: true,
          audience: true,
          locked: true,
          grants: {
            where: { revokedAt: null },
            select: {
              id: true,
              userId: true,
              actions: true,
              effectiveAt: true,
              expiresAt: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      return {
        ceiling: authority.roomCeiling,
        expiresAt: authority.expiresAt,
        candidates: members.map((m) => ({
          id: m.userId,
          name: m.user.displayName,
          kind: m.kind,
        })),
        rooms,
      };
    });
  }

  revokeAuthority(actor: CurrentActor, projectId: string, id: string) {
    return this.access.project(actor, projectId, async (tx) => {
      const grant = await tx.chatProjectGrant.findFirst({
        where: { id, projectId, organizationId: actor.organizationId },
      });
      if (!grant) throw new NotFoundException();
      await this.delegate(tx, actor, projectId, grant.userId, [
        ...grant.actions,
        ...grant.roomCeiling,
      ]);
      await tx.chatProjectGrant.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.event(tx, actor, projectId, id, 'chat.authority.revoke');
      return { revoked: true };
    });
  }

  async releaseSources(actor: CurrentActor, roomId: string) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const { room } = await this.access.assertRoom(
        actor,
        roomId,
        'UPLOAD',
        tx,
      );
      if (actor.membershipKind === 'EXTERNAL' || room.audience !== 'CUSTOMER')
        throw new ForbiddenException();
      const rows = await tx.projectRequiredDocument.findMany({
        where: {
          projectId,
          organizationId: actor.organizationId,
          stageKey: 'STAGE_1',
          workstreamKey: 'PROPOSAL',
          documentType: 'PROPOSAL',
          status: 'APPROVED',
          deletedAt: null,
          supersededAt: null,
        },
        select: {
          id: true,
          currentVersion: true,
          currentFileAssetId: true,
          documentName: true,
        },
      });
      const result = [];
      for (const row of rows) {
        if (!row.currentFileAssetId) continue;
        const input = {
          sourceId: row.id,
          version: row.currentVersion,
          fileId: row.currentFileAssetId,
        };
        try {
          await this.releaseSource(tx, actor, projectId, input);
          result.push({ ...input, name: row.documentName });
        } catch (e) {
          if (
            !(
              e instanceof ForbiddenException ||
              e instanceof NotFoundException ||
              e instanceof ConflictException
            )
          )
            throw e;
        }
      }
      return result;
    });
  }

  async download(actor: CurrentActor, roomId: string, chatFileId: string) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const { grant } = await this.access.assertRoom(
        actor,
        roomId,
        'DOWNLOAD',
        tx,
      );
      const link = await this.visibleFile(
        tx,
        actor,
        roomId,
        chatFileId,
        grant,
        'DOWNLOAD',
      );
      const data = await this.storage.stream(link.file.storageKey);
      try {
        await this.access.assertRoom(actor, roomId, 'DOWNLOAD', tx);
        await this.visibleFile(
          tx,
          actor,
          roomId,
          chatFileId,
          grant,
          'DOWNLOAD',
        );
      } catch (error) {
        data.destroy();
        throw error;
      }
      return { file: link.file, data };
    });
  }

  private async visibleFile(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    roomId: string,
    id: string,
    grant: import('@prisma/client').ChatRoomGrant,
    action: string,
  ) {
    const ranges = await this.access.history(tx, grant, action);
    const time = {
      AND: [
        { OR: ranges.map(({ gte, lt }) => ({ createdAt: { gte, lt } })) },
        {
          OR: (await this.access.history(tx, grant, 'READ')).map(
            ({ gte, lt }) => ({ createdAt: { gte, lt } }),
          ),
        },
      ],
    };
    const link = await tx.chatFile.findFirst({
      where: {
        id,
        roomId,
        organizationId: actor.organizationId,
        file: { deletedAt: null },
        OR: [
          { actorId: actor.userId, ...time },
          { messages: { some: { message: { roomId, ...time } } } },
        ],
      },
      include: { file: true },
    });
    if (!link || link.file.version !== link.version)
      throw new NotFoundException('Không tìm thấy file trong phạm vi');
    return link;
  }

  private async freshActor(tx: Prisma.TransactionClient, actor: CurrentActor) {
    if ((await this.access.live(actor, tx)).kind !== 'INTERNAL')
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

  private async delegate(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    userId: string,
    actions: string[],
  ) {
    const fresh = await this.freshActor(tx, actor);
    const candidates = actorsForPermission(fresh, 'role.assign');
    let permitted = false;
    for (const candidate of candidates) {
      if (
        actions.some(
          (action) => !candidate.permissions.includes(chatCapability[action]!),
        )
      )
        continue;
      if (
        !(await tx.project.findFirst({
          where: {
            id: projectId,
            ...projectWhereForPermissions(candidate, 'role.assign'),
          },
        }))
      )
        continue;
      try {
        await this.users.assert(candidate, userId, 'assignRoles');
        permitted = true;
        break;
      } catch (error) {
        if (
          !(
            error instanceof ForbiddenException ||
            error instanceof NotFoundException ||
            error instanceof ConflictException
          )
        )
          throw error;
      }
    }
    if (!permitted)
      throw new ForbiddenException('Không có thẩm quyền cấp quyền dự án');
  }

  async authority(
    actor: CurrentActor,
    projectId: string,
    input: ChatAuthorityDto,
  ) {
    return this.access.project(actor, projectId, async (tx) => {
      if (input.expiresAt && input.expiresAt <= new Date())
        throw new BadRequestException('Thời hạn không hợp lệ');
      await this.delegate(tx, actor, projectId, input.userId, [
        ...input.actions,
        ...input.roomCeiling,
      ]);
      const target = await tx.organizationMembership.findFirst({
        where: {
          organizationId: actor.organizationId,
          userId: input.userId,
          status: 'active',
          kind: 'INTERNAL',
          user: { status: 'active' },
        },
      });
      if (!target) throw new NotFoundException();
      const grant = await tx.chatProjectGrant.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          userId: input.userId,
          actions: input.actions,
          roomCeiling: input.roomCeiling,
          grantedBy: actor.userId,
          expiresAt: input.expiresAt,
        },
      });
      await this.event(tx, actor, projectId, grant.id, 'chat.authority.grant');
      return grant;
    });
  }

  private async linkedWork(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    ids: { taskId?: string | null; productLineId?: string | null },
  ) {
    if (actor.membershipKind === 'EXTERNAL')
      return { task: null, productLine: null };
    const fresh = await this.freshActor(tx, actor);
    const taskScopes = actorsForPermission(fresh, 'task.read');
    const task =
      ids.taskId && taskScopes.length
        ? await tx.task.findFirst({
            where: {
              id: ids.taskId,
              projectId,
              OR: taskScopes.map((a) => this.tasks.visibleWhere(a)),
            },
            select: {
              id: true,
              title: true,
              status: true,
              dueDate: true,
              assignees: {
                select: { user: { select: { displayName: true } } },
              },
            },
          })
        : null;
    const productLine =
      ids.productLineId &&
      actorsForPermission(fresh, 'project.product.view').length
        ? await tx.projectProductLine.findFirst({
            where: {
              id: ids.productLineId,
              organizationId: actor.organizationId,
              projectId,
              deletedAt: null,
              project: projectWhereForPermissions(
                fresh,
                'project.product.view',
              ),
            },
            select: {
              id: true,
              code: true,
              lifecycleStatus: true,
              blocker: true,
              nextAction: true,
            },
          })
        : null;
    return { task, productLine };
  }

  linkOptions(actor: CurrentActor, projectId: string) {
    return this.access.project(actor, projectId, async (tx) => {
      await this.access.authority(tx, actor, projectId, 'CREATE');
      const fresh = await this.freshActor(tx, actor);
      const scopes = actorsForPermission(fresh, 'task.read');
      return {
        tasks: scopes.length
          ? await tx.task.findMany({
              where: {
                projectId,
                OR: scopes.map((a) => this.tasks.visibleWhere(a)),
              },
              select: { id: true, title: true },
              orderBy: { id: 'asc' },
              take: 100,
            })
          : [],
        products: actorsForPermission(fresh, 'project.product.view').length
          ? await tx.projectProductLine.findMany({
              where: {
                organizationId: actor.organizationId,
                projectId,
                deletedAt: null,
                project: projectWhereForPermissions(
                  fresh,
                  'project.product.view',
                ),
              },
              select: { id: true, code: true },
              orderBy: { id: 'asc' },
              take: 100,
            })
          : [],
        limit: 100,
      };
    });
  }

  createRoom(actor: CurrentActor, projectId: string, input: ChatRoomDto) {
    return this.access.project(actor, projectId, async (tx) => {
      await this.access.authority(tx, actor, projectId, 'CREATE');
      if (!input.title.trim()) throw new BadRequestException('Cần tiêu đề');
      const links = await this.linkedWork(tx, actor, projectId, input);
      if (
        (input.taskId && !links.task) ||
        (input.productLineId && !links.productLine)
      )
        throw new NotFoundException();
      const room = await tx.chatRoom.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          title: input.title.trim(),
          group: input.group,
          audience: input.audience,
          taskId: input.taskId,
          productLineId: input.productLineId,
          createdBy: actor.userId,
        },
      });
      await this.event(tx, actor, projectId, room.id, 'chat.room.create');
      return {
        id: room.id,
        title: room.title,
        group: room.group,
        audience: room.audience,
      };
    });
  }

  async grant(actor: CurrentActor, roomId: string, input: ChatGrantDto) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const authority = await this.access.authority(
        tx,
        actor,
        projectId,
        'ACCESS_ADMIN',
      );
      if (
        input.actions.some((action) => !authority.roomCeiling.includes(action))
      )
        throw new ForbiddenException('Vượt trần quyền');
      if (input.expiresAt && input.expiresAt <= new Date())
        throw new BadRequestException('Thời hạn không hợp lệ');
      if (
        authority.expiresAt &&
        (!input.expiresAt || input.expiresAt > authority.expiresAt)
      )
        throw new ForbiddenException('Vượt thời hạn quyền');
      await this.grantTarget(
        tx,
        actor,
        projectId,
        roomId,
        input.userId,
        input.expiresAt,
      );
      const now = new Date();
      const replaced = await tx.chatRoomGrant.findMany({
        where: { roomId, userId: input.userId, revokedAt: null },
        select: { actions: true },
      });
      if (
        replaced.some((g) =>
          g.actions.some((a) => !authority.roomCeiling.includes(a)),
        )
      )
        throw new ForbiddenException(
          'Không được thu hồi quyền vượt trần khi cấp lại',
        );
      await tx.chatRoomGrant.updateMany({
        where: { roomId, userId: input.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      const grant = await tx.chatRoomGrant.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          roomId,
          userId: input.userId,
          issuedUnderId: authority.id,
          actions: input.actions,
          grantedBy: actor.userId,
          effectiveAt: now,
          expiresAt: input.expiresAt,
        },
      });
      await this.event(tx, actor, projectId, roomId, 'chat.room.grant', {
        grantId: grant.id,
        userId: input.userId,
        actions: input.actions,
      });
      return {
        id: grant.id,
        effectiveAt: grant.effectiveAt,
        expiresAt: grant.expiresAt,
        actions: grant.actions,
      };
    });
  }

  async revoke(actor: CurrentActor, roomId: string, grantId: string) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const authority = await this.access.authority(
        tx,
        actor,
        projectId,
        'ACCESS_ADMIN',
      );
      const target = await tx.chatRoomGrant.findFirst({
        where: { id: grantId, roomId, organizationId: actor.organizationId },
      });
      if (!target) throw new NotFoundException();
      if (
        target.actions.some((action) => !authority.roomCeiling.includes(action))
      )
        throw new ForbiddenException();
      await tx.chatRoomGrant.updateMany({
        where: { id: grantId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.event(tx, actor, projectId, roomId, 'chat.room.revoke', {
        grantId,
      });
      return { revoked: true };
    });
  }

  private async grantTarget(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    roomId: string,
    userId: string,
    expiresAt?: Date,
  ) {
    const member = await tx.organizationMembership.findFirst({
      where: {
        organizationId: actor.organizationId,
        userId,
        status: 'active',
        user: { status: 'active' },
      },
    });
    if (!member) throw new NotFoundException();
    if (member.kind === 'EXTERNAL') {
      if (!expiresAt || expiresAt.getTime() > Date.now() + 30 * 86400000)
        throw new BadRequestException('Khách cần thời hạn tối đa 30 ngày');
      const room = await tx.chatRoom.findUniqueOrThrow({
        where: { id: roomId },
      });
      if (room.audience !== 'CUSTOMER')
        throw new ForbiddenException('Không thêm khách vào phòng nội bộ');
      if (
        !(await tx.chatProjectParticipant.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId,
            userId,
            revokedAt: null,
          },
        }))
      )
        throw new NotFoundException();
    }
  }

  participant(actor: CurrentActor, projectId: string, userId: string) {
    return this.access.project(actor, projectId, async (tx) => {
      await this.delegate(tx, actor, projectId, userId, ['ACCESS_ADMIN']);
      if (
        !(await tx.organizationMembership.findFirst({
          where: {
            organizationId: actor.organizationId,
            userId,
            kind: 'EXTERNAL',
            status: 'active',
            user: { status: 'active' },
          },
        }))
      )
        throw new NotFoundException();
      const result = await tx.chatProjectParticipant.upsert({
        where: {
          organizationId_projectId_userId: {
            organizationId: actor.organizationId,
            projectId,
            userId,
          },
        },
        create: {
          organizationId: actor.organizationId,
          projectId,
          userId,
          linkedBy: actor.userId,
        },
        update: {},
      });
      if (result.revokedAt)
        throw new ConflictException('Liên kết đã thu hồi cần xét duyệt mới');
      await this.event(
        tx,
        actor,
        projectId,
        projectId,
        'chat.participant.link',
      );
      return { id: result.id, userId };
    });
  }

  async renew(
    actor: CurrentActor,
    roomId: string,
    grantId: string,
    expiresAt: Date,
  ) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const authority = await this.access.authority(
        tx,
        actor,
        projectId,
        'ACCESS_ADMIN',
      );
      const old = await tx.chatRoomGrant.findFirst({
        where: { id: grantId, roomId, revokedAt: null },
      });
      if (!old) throw new NotFoundException();
      const now = new Date();
      if (expiresAt <= now)
        throw new BadRequestException('Thời hạn không hợp lệ');
      if (
        old.actions.some((a) => !authority.roomCeiling.includes(a)) ||
        (authority.expiresAt && expiresAt > authority.expiresAt)
      )
        throw new ForbiddenException('Vượt trần quyền');
      await this.grantTarget(
        tx,
        actor,
        projectId,
        roomId,
        old.userId,
        expiresAt,
      );
      const parent = await tx.chatProjectGrant.findFirst({
        where: {
          id: old.issuedUnderId,
          ...activeChatGrant(now),
          actions: { has: 'ACCESS_ADMIN' },
          roomCeiling: { hasEvery: old.actions },
          membership: {
            kind: 'INTERNAL',
            status: 'active',
            user: { status: 'active' },
          },
        },
      });
      const active = Boolean(parent && (!old.expiresAt || old.expiresAt > now));
      if (active && parent?.expiresAt && expiresAt > parent.expiresAt)
        throw new ForbiddenException('Gia hạn vượt thời hạn của quyền cấp gốc');
      const next = active
        ? await tx.chatRoomGrant.update({
            where: { id: old.id },
            data: { expiresAt },
          })
        : await tx.chatRoomGrant.create({
            data: {
              organizationId: actor.organizationId,
              projectId,
              roomId,
              userId: old.userId,
              actions: old.actions,
              issuedUnderId: authority.id,
              grantedBy: actor.userId,
              effectiveAt: now,
              expiresAt,
            },
          });
      if (!active)
        await tx.chatRoomGrant.update({
          where: { id: old.id },
          data: { revokedAt: now },
        });
      await this.event(tx, actor, projectId, roomId, 'chat.grant.renew', {
        previousGrantId: old.id,
        grantId: next.id,
        previousExpiry: old.expiresAt?.toISOString() ?? null,
        expiresAt: next.expiresAt?.toISOString() ?? null,
      });
      return {
        id: next.id,
        effectiveAt: next.effectiveAt,
        expiresAt: next.expiresAt,
        actions: next.actions,
      };
    });
  }

  async messages(
    actor: CurrentActor,
    roomId: string,
    query: ChatMessagesQuery,
  ) {
    if (query.after !== undefined && query.before !== undefined)
      throw new BadRequestException('Chỉ dùng một chiều cursor');
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const { grant, room } = await this.access.assertRoom(
        actor,
        roomId,
        'READ',
        tx,
      );
      const ranges = await this.access.history(tx, grant, 'READ');
      const downloads = await this.access.history(tx, grant, 'DOWNLOAD');
      const scopeToken = createHash('sha256')
        .update(
          JSON.stringify([
            grant.id,
            grant.actions,
            [...ranges, ...downloads]
              .map((r) => [
                r.gte.toISOString(),
                r.lt?.toISOString(),
                r.historyId,
              ])
              .sort(),
          ]),
        )
        .digest('hex');
      const rows = await tx.chatMessage.findMany({
        where: {
          roomId,
          organizationId: actor.organizationId,
          OR: ranges.map(({ gte, lt }) => ({ createdAt: { gte, lt } })),
          sequence: { gt: query.after, lt: query.before },
        },
        orderBy: { sequence: query.after === undefined ? 'desc' : 'asc' },
        take: query.limit + 1,
        select: {
          id: true,
          sequence: true,
          body: true,
          authorId: true,
          createdAt: true,
          clientKey: true,
          attachments: {
            select: {
              chatFile: {
                select: {
                  id: true,
                  version: true,
                  origin: true,
                  file: {
                    select: {
                      originalFilename: true,
                      mimeType: true,
                      sizeBytes: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      await this.access.assertRoom(actor, roomId, 'READ', tx);
      const items = rows
        .slice(0, query.limit)
        .map(({ attachments, ...row }) => ({
          ...row,
          attachments: attachments.map(({ chatFile: f }) => ({
            id: f.id,
            version: f.version,
            origin: f.origin,
            originalFilename: f.file.originalFilename,
            mimeType: f.file.mimeType,
            sizeBytes: f.file.sizeBytes.toString(),
          })),
        }));
      return {
        items,
        viewerId: actor.userId,
        scopeToken,
        locked: room.locked,
        links: await this.linkedWork(tx, actor, projectId, room),
        grantId: grant.id,
        nextBefore:
          query.after === undefined ? (items.at(-1)?.sequence ?? null) : null,
        nextAfter:
          query.after !== undefined ? (items.at(-1)?.sequence ?? null) : null,
        hasMore: rows.length > query.limit,
      };
    });
  }

  async lock(actor: CurrentActor, roomId: string, locked: boolean) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      if ((await this.access.live(actor, tx)).kind !== 'INTERNAL')
        throw new ForbiddenException();
      try {
        await this.access.authority(tx, actor, projectId, 'LOCK');
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
        await this.access.assertRoom(actor, roomId, 'LOCK', tx);
      }
      await tx.chatRoom.update({ where: { id: roomId }, data: { locked } });
      await this.event(
        tx,
        actor,
        projectId,
        roomId,
        locked ? 'chat.room.lock' : 'chat.room.unlock',
      );
      return { locked };
    });
  }

  async grantHistory(
    actor: CurrentActor,
    roomId: string,
    grantId: string,
    input: ChatHistoryDto,
  ) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const authority = await this.access.authority(
        tx,
        actor,
        projectId,
        'ACCESS_ADMIN',
      );
      await this.access.authority(tx, actor, projectId, 'HISTORY');
      const { grant: source } = await this.access.assertRoom(
        actor,
        roomId,
        'HISTORY',
        tx,
      );
      const target = await tx.chatRoomGrant.findFirst({
        where: { id: grantId, roomId, ...activeChatGrant(new Date()) },
      });
      if (!target) throw new NotFoundException();
      if (target.userId === actor.userId)
        throw new ForbiddenException('Không tự mở lịch sử');
      if (input.from >= input.to || input.to > new Date())
        throw new BadRequestException('Khoảng lịch sử không hợp lệ');
      const ids: string[] = [];
      for (const action of input.actions) {
        if (
          !authority.roomCeiling.includes(action) ||
          !target.actions.includes(action)
        )
          throw new ForbiddenException('Vượt phạm vi lịch sử');
        await this.access.assertRoom(actor, roomId, action, tx);
        const ranges = await this.access.history(tx, source, action);
        const range = ranges.find(
          (range) =>
            input.from >= range.gte && (!range.lt || input.to <= range.lt),
        );
        if (!range)
          throw new ForbiddenException('Không được chia sẻ nguồn ngoài quyền');
        const result = await tx.chatHistoryGrant.create({
          data: {
            grantId,
            sourceGrantId: source.id,
            sourceHistoryId: range.historyId,
            from: input.from,
            to: input.to,
            actions: [action],
            grantedBy: actor.userId,
          },
        });
        ids.push(result.id);
      }
      await this.event(tx, actor, projectId, roomId, 'chat.history.grant', {
        grantId,
        historyIds: ids,
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        actions: input.actions,
      });
      return {
        ids,
        from: input.from,
        to: input.to,
        actions: input.actions,
      };
    });
  }

  private async releaseSource(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    input: ChatReleaseDto,
  ) {
    const fresh = await this.freshActor(tx, actor);
    let visible = false;
    for (const binding of actorsForPermission(fresh, 'file.read')) {
      if (!binding.permissions.includes('file.download')) continue;
      if (
        await tx.project.findFirst({
          where: {
            id: projectId,
            ...projectWhereForPermissions(binding, [
              'file.read',
              'file.download',
            ]),
          },
        })
      ) {
        visible = true;
        break;
      }
    }
    if (!visible) throw new NotFoundException();
    const source = await tx.projectRequiredDocument.findFirst({
      where: {
        id: input.sourceId,
        organizationId: actor.organizationId,
        projectId,
        stageKey: 'STAGE_1',
        workstreamKey: 'PROPOSAL',
        documentType: 'PROPOSAL',
        status: 'APPROVED',
        approvedAt: { not: null },
        approvedBy: { not: null },
        deletedAt: null,
        supersededAt: null,
        currentVersion: input.version,
        currentFileAssetId: input.fileId,
      },
      include: {
        versions: {
          where: { version: input.version, fileAssetId: input.fileId },
        },
      },
    });
    if (!source || source.versions.length !== 1)
      throw new ConflictException(
        'Nguồn/phiên bản chưa đủ điều kiện phát hành hoặc đã đổi',
      );
    const file = await tx.fileAsset.findFirst({
      where: {
        id: input.fileId,
        organizationId: actor.organizationId,
        deletedAt: null,
      },
      include: { attachments: true },
    });
    if (!file?.checksum || !/^[0-9a-f]{64}$/.test(file.checksum))
      throw new ConflictException('Nguồn chưa có checksum hợp lệ');
    if (file.confidentiality !== 'INTERNAL')
      throw new ForbiddenException(
        'Nhãn hạn chế cần chính sách riêng trước khi công bố',
      );
    if (
      file.attachments.some(
        (a) =>
          a.projectId !== projectId ||
          !['Project', 'ProjectRequiredDocument'].includes(a.entityType) ||
          (a.entityType === 'ProjectRequiredDocument' &&
            a.entityId !== source.id),
      )
    )
      throw new ForbiddenException(
        'Nguồn có liên kết nội bộ hoặc phạm vi khác',
      );
    const other = await tx.projectRequiredDocument.count({
      where: {
        id: { not: source.id },
        OR: [
          { currentFileAssetId: file.id },
          { versions: { some: { fileAssetId: file.id } } },
        ],
      },
    });
    const logical = await tx.projectStageOneDocument.count({
      where: {
        OR: [
          { currentFileAssetId: file.id },
          { versions: { some: { fileAssetId: file.id } } },
        ],
      },
    });
    if (other || logical)
      throw new ForbiddenException(
        'Nguồn dùng chung cần tách và kiểm tra nội dung riêng',
      );
    return { source, file };
  }

  async prepareRelease(
    actor: CurrentActor,
    roomId: string,
    input: ChatReleaseDto,
  ) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const { room } = await this.access.assertRoom(
        actor,
        roomId,
        'UPLOAD',
        tx,
      );
      if (
        room.audience !== 'CUSTOMER' ||
        room.locked ||
        actor.membershipKind === 'EXTERNAL'
      )
        throw new ForbiddenException();
      const { source, file } = await this.releaseSource(
        tx,
        actor,
        projectId,
        input,
      );
      const release = await tx.chatDocumentRelease.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          roomId,
          sourceId: source.id,
          sourceVersionId: source.versions[0]!.id,
          fileAssetId: file.id,
          version: input.version,
          checksum: file.checksum!,
          filename: file.originalFilename,
          mimeType: file.mimeType,
          sourceUpdatedAt: source.updatedAt,
          preparedBy: actor.userId,
          preparedAt: new Date(),
        },
      });
      await this.event(
        tx,
        actor,
        projectId,
        release.id,
        'chat.release.prepare',
        { sourceId: source.id, version: input.version, roomId },
      );
      return {
        id: release.id,
        version: release.version,
        filename: release.filename,
        roomId,
      };
    });
  }

  private async releaseProject(actor: CurrentActor, id: string) {
    const item = await this.db.chatDocumentRelease.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { projectId: true },
    });
    if (!item) throw new NotFoundException();
    return item.projectId;
  }

  private async checkedRelease(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    id: string,
  ) {
    const r = await tx.chatDocumentRelease.findFirst({
      where: { id, organizationId: actor.organizationId, revokedAt: null },
    });
    if (!r) throw new NotFoundException();
    const { grant } = await this.access.assertRoom(actor, r.roomId, 'READ', tx);
    const history = await this.access.history(tx, grant, 'READ');
    const at = r.publishedAt ?? r.preparedAt;
    if (
      !history.some((range) => at >= range.gte && (!range.lt || at < range.lt))
    )
      throw new NotFoundException();
    if (r.preparedBy !== actor.userId)
      await this.access.authority(tx, actor, r.projectId, 'PUBLISH');
    const { source, file } = await this.releaseSource(tx, actor, r.projectId, {
      sourceId: r.sourceId,
      fileId: r.fileAssetId,
      version: r.version,
    });
    if (
      source.updatedAt.getTime() !== r.sourceUpdatedAt.getTime() ||
      file.checksum !== r.checksum ||
      file.originalFilename !== r.filename ||
      file.mimeType !== r.mimeType
    )
      throw new ConflictException('Nguồn đã đổi; chuẩn bị và kiểm tra lại');
    return { r, file };
  }

  private async recipients(
    tx: Prisma.TransactionClient,
    roomId: string,
    projectId: string,
  ) {
    const now = new Date();
    const rows = await tx.chatRoomGrant.findMany({
      where: {
        roomId,
        ...activeChatGrant(now),
        actions: { has: 'READ' },
        membership: {
          status: 'active',
          user: { status: 'active' },
          OR: [
            { kind: 'INTERNAL' },
            {
              kind: 'EXTERNAL',
              chatProjects: { some: { projectId, revokedAt: null } },
            },
          ],
        },
        issuedUnder: {
          ...activeChatGrant(now),
          actions: { has: 'ACCESS_ADMIN' },
          roomCeiling: { has: 'READ' },
          membership: {
            kind: 'INTERNAL',
            status: 'active',
            user: { status: 'active' },
          },
        },
      },
      include: {
        membership: {
          select: { kind: true, user: { select: { displayName: true } } },
        },
      },
      orderBy: { id: 'asc' },
    });
    const recipients = rows.map((r) => ({
      grantId: r.id,
      userId: r.userId,
      name: r.membership.user.displayName,
      kind: r.membership.kind,
      actions: [...r.actions].sort(),
      effectiveAt: r.effectiveAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
    }));
    const recipientHash = createHash('sha256')
      .update(JSON.stringify(recipients))
      .digest('hex');
    return { recipients, recipientHash };
  }

  async reviewRelease(actor: CurrentActor, id: string) {
    const projectId = await this.releaseProject(actor, id);
    return this.access.project(actor, projectId, async (tx) => {
      const { r } = await this.checkedRelease(tx, actor, id);
      return {
        id,
        roomId: r.roomId,
        filename: r.filename,
        version: r.version,
        preparedBy: r.preparedBy,
        ...(await this.recipients(tx, r.roomId, projectId)),
      };
    });
  }

  async previewRelease(actor: CurrentActor, id: string) {
    const projectId = await this.releaseProject(actor, id);
    return this.access.project(actor, projectId, async (tx) => {
      const { r, file } = await this.checkedRelease(tx, actor, id);
      const chunks: Buffer[] = [];
      // FileAsset's existing upload ceiling is 10MB; no second file store or public URL.
      for await (const chunk of await this.storage.stream(file.storageKey))
        chunks.push(Buffer.from(chunk));
      const data = Buffer.concat(chunks);
      if (createHash('sha256').update(data).digest('hex') !== r.checksum)
        throw new ConflictException('Nội dung nguồn không khớp checksum');
      await this.checkedRelease(tx, actor, id);
      const { recipientHash } = await this.recipients(tx, r.roomId, projectId);
      if (actor.userId !== r.preparedBy)
        await tx.chatDocumentRelease.update({
          where: { id },
          data: {
            reviewedBy: actor.userId,
            reviewedAt: new Date(),
            reviewedRecipientHash: recipientHash,
          },
        });
      await this.access.assertRoom(actor, r.roomId, 'READ', tx);
      return {
        file: { mimeType: r.mimeType, originalFilename: r.filename },
        data,
      };
    });
  }

  async publishRelease(
    actor: CurrentActor,
    id: string,
    recipientHash?: string,
  ) {
    const projectId = await this.releaseProject(actor, id);
    return this.access.project(actor, projectId, async (tx) => {
      const { r } = await this.checkedRelease(tx, actor, id);
      if (r.preparedBy === actor.userId)
        throw new ForbiddenException('Người chuẩn bị không tự phát hành');
      await this.access.authority(tx, actor, projectId, 'PUBLISH');
      const { room } = await this.access.assertRoom(
        actor,
        r.roomId,
        'READ',
        tx,
      );
      if (room.locked) throw new ConflictException('Phòng đang khóa');
      if (r.reviewedBy !== actor.userId || !r.reviewedAt)
        throw new ConflictException(
          'Cần mở đúng bản nguồn để kiểm tra trước khi xác nhận',
        );
      const scope = await this.recipients(tx, r.roomId, projectId);
      if (
        !recipientHash ||
        scope.recipientHash !== recipientHash ||
        r.reviewedRecipientHash !== recipientHash
      )
        throw new ConflictException(
          'Người nhận/phạm vi đã đổi; xem lại danh sách và nguồn',
        );
      if (!r.publishedAt) {
        await tx.chatDocumentRelease.update({
          where: { id },
          data: {
            publishedBy: actor.userId,
            publishedAt: new Date(),
            publishedRecipients: scope.recipients,
          },
        });
        await this.event(tx, actor, projectId, id, 'chat.release.publish', {
          roomId: r.roomId,
          version: r.version,
          preparedBy: r.preparedBy,
        });
      }
      return { id, published: true };
    });
  }

  async revokeRelease(actor: CurrentActor, id: string) {
    const projectId = await this.releaseProject(actor, id);
    return this.access.project(actor, projectId, async (tx) => {
      await this.access.authority(tx, actor, projectId, 'PUBLISH');
      await tx.chatDocumentRelease.update({
        where: { id },
        data: { revokedBy: actor.userId, revokedAt: new Date() },
      });
      await this.event(tx, actor, projectId, id, 'chat.release.revoke');
      return { revoked: true };
    });
  }

  async releases(actor: CurrentActor, roomId: string) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const { grant } = await this.access.assertRoom(actor, roomId, 'READ', tx);
      const ranges = await this.access.history(tx, grant, 'READ');
      const published = await tx.chatDocumentRelease.findMany({
        where: {
          roomId,
          revokedAt: null,
          OR: ranges.map((r) => ({ publishedAt: { gte: r.gte, lt: r.lt } })),
        },
        select: {
          id: true,
          filename: true,
          version: true,
          publishedAt: true,
          preparedBy: true,
          publishedBy: true,
        },
        orderBy: { publishedAt: 'asc' },
      });
      const pending = [];
      if (actor.membershipKind !== 'EXTERNAL') {
        const rows = await tx.chatDocumentRelease.findMany({
          where: { roomId, revokedAt: null, publishedAt: null },
          select: { id: true, filename: true, version: true, preparedBy: true },
        });
        for (const row of rows) {
          try {
            await this.checkedRelease(tx, actor, row.id);
            pending.push(row);
          } catch (e) {
            if (
              !(
                e instanceof ForbiddenException ||
                e instanceof NotFoundException ||
                e instanceof ConflictException
              )
            )
              throw e;
          }
        }
      }
      return { published, pending };
    });
  }

  async downloadRelease(actor: CurrentActor, id: string) {
    const projectId = await this.releaseProject(actor, id);
    return this.access.project(actor, projectId, async (tx) => {
      const r = await tx.chatDocumentRelease.findFirst({
        where: {
          id,
          organizationId: actor.organizationId,
          revokedAt: null,
          publishedAt: { not: null },
        },
        include: { file: true },
      });
      if (!r || r.file.deletedAt) throw new NotFoundException();
      const { grant } = await this.access.assertRoom(
        actor,
        r.roomId,
        'DOWNLOAD',
        tx,
      );
      for (const action of ['READ', 'DOWNLOAD']) {
        const ranges = await this.access.history(tx, grant, action);
        if (
          !ranges.some(
            (range) =>
              r.publishedAt! >= range.gte &&
              (!range.lt || r.publishedAt! < range.lt),
          )
        )
          throw new NotFoundException();
      }
      const data = await this.storage.stream(r.file.storageKey);
      try {
        await this.access.assertRoom(actor, r.roomId, 'DOWNLOAD', tx);
        for (const action of ['READ', 'DOWNLOAD']) {
          const current = await this.access.history(tx, grant, action);
          if (
            !current.some(
              (range) =>
                r.publishedAt! >= range.gte &&
                (!range.lt || r.publishedAt! < range.lt),
            )
          )
            throw new NotFoundException();
        }
      } catch (e) {
        data.destroy();
        throw e;
      }
      return {
        file: { originalFilename: r.filename, mimeType: r.mimeType },
        data,
      };
    });
  }

  async send(actor: CurrentActor, roomId: string, input: ChatMessageDto) {
    const projectId = await this.access.roomProject(actor, roomId);
    return this.access.project(actor, projectId, async (tx) => {
      const { room, grant } = await this.access.assertRoom(
        actor,
        roomId,
        'SEND',
        tx,
      );
      if (room.locked) throw new ConflictException('Cuộc trao đổi đã khóa gửi');
      if (!input.body.trim()) throw new BadRequestException('Tin nhắn trống');
      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify([input.body, [...(input.attachmentIds ?? [])].sort()]),
        )
        .digest('hex');
      const existing = await tx.chatMessage.findUnique({
        where: {
          roomId_authorId_clientKey: {
            roomId,
            authorId: actor.userId,
            clientKey: input.clientKey,
          },
        },
      });
      if (existing) {
        if (existing.createdAt < grant.effectiveAt)
          throw new NotFoundException();
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException('Khóa gửi đã dùng cho nội dung khác');
        const { payloadHash: omit, ...message } = existing;
        void omit;
        return message;
      }
      const updated = await tx.chatRoom.update({
        where: { id: roomId },
        data: { sequence: { increment: 1 } },
      });
      const attachmentIds = input.attachmentIds ?? [];
      if (attachmentIds.length) {
        await this.access.assertRoom(actor, roomId, 'UPLOAD', tx);
        for (const id of attachmentIds) {
          const file = await this.visibleFile(
            tx,
            actor,
            roomId,
            id,
            grant,
            'READ',
          );
          // Reusing a sent source needs explicit history/publication, not a new message.
          if (
            file.actorId !== actor.userId ||
            file.createdAt < grant.effectiveAt ||
            (await tx.chatMessageAttachment.count({
              where: { chatFileId: id },
            }))
          )
            throw new NotFoundException(
              'File không còn là đính kèm nháp của lần cấp này',
            );
        }
      }
      const message = await tx.chatMessage.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          roomId,
          authorId: actor.userId,
          clientKey: input.clientKey,
          body: input.body,
          payloadHash,
          sequence: updated.sequence,
          createdAt: new Date(),
          attachments: {
            create: attachmentIds.map((chatFileId) => ({ chatFileId })),
          },
        },
      });
      await this.event(tx, actor, projectId, roomId, 'chat.message.send');
      const { payloadHash: omit, ...value } = message;
      void omit;
      return value;
    });
  }
}
