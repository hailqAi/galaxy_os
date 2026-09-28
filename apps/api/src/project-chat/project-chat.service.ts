import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  customerPublicationSource,
  customerSnapshotTypes,
  CustomerSnapshotType,
} from './customer-publication-source';
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
import { readEnvironment } from '../config/env';
import {
  assertFileCapacity,
  fileStorageReservationExpiry,
  lockOrganizationFileCapacity,
} from '../files/file-quota';
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
      const quotations = await tx.quotationDocument.findMany({
        where: {
          quotationVersion: {
            quotation: { projectId, organizationId: actor.organizationId },
          },
        },
        include: { quotationVersion: { select: { version: true } } },
      });
      for (const document of quotations) {
        const input = {
          sourceType: 'QUOTATION' as const,
          sourceId: document.id,
          version: document.quotationVersion.version,
        };
        try {
          await this.releaseSource(tx, actor, projectId, input);
          result.push({
            ...input,
            name: `Báo giá v${input.version} (${document.format})`,
          });
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
      const [drawings, samples, handovers] = await Promise.all([
        tx.technicalApprovalRevision.findMany({
          where: {
            technicalApproval: {
              productionOrder: {
                projectId,
                organizationId: actor.organizationId,
              },
            },
          },
          include: { technicalApproval: true },
        }),
        tx.sampleApproval.findMany({
          where: {
            productionOrder: {
              projectId,
              organizationId: actor.organizationId,
            },
          },
        }),
        tx.handoverDocument.findMany({
          where: { projectId, organizationId: actor.organizationId },
        }),
      ]);
      const candidates: (ChatReleaseDto & { name: string })[] = drawings.map(
        (r) => ({
          sourceType: 'TECHNICAL',
          sourceId: r.id,
          version: r.revision,
          name: `${r.technicalApproval.title} · bản duyệt`,
        }),
      );
      for (const sample of samples) {
        if (!sample.fileId) continue;
        const file = await tx.fileAsset.findUnique({
          where: { id: sample.fileId },
          select: { version: true },
        });
        if (file)
          candidates.push({
            sourceType: 'SAMPLE',
            sourceId: sample.id,
            version: file.version,
            name: `${sample.name} · phiên bản file`,
          });
      }
      for (const h of handovers)
        candidates.push({
          sourceType: 'HANDOVER',
          sourceId: h.id,
          version: h.version,
          name: `Hồ sơ bàn giao · ${h.type}`,
        });
      for (const input of candidates) {
        try {
          await this.releaseSource(tx, actor, projectId, input);
          result.push(input);
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
      const [contracts, schedules, plans, customerPayments] = await Promise.all(
        [
          tx.contract.findMany({
            where: { projectId, organizationId: actor.organizationId },
            include: { appendices: true },
          }),
          tx.customerPaymentSchedule.findMany({
            where: { projectId, organizationId: actor.organizationId },
          }),
          tx.installationPlan.findMany({
            where: { projectId, organizationId: actor.organizationId },
          }),
          tx.customerPayment.findMany({
            where: { projectId, organizationId: actor.organizationId },
            orderBy: { createdAt: 'desc' },
          }),
        ],
      );
      const snapshots: {
        sourceType: CustomerSnapshotType;
        sourceId: string;
        appendixId?: string;
      }[] = [
        ...contracts.flatMap((c) => [
          { sourceType: 'CONTRACT' as const, sourceId: c.id },
          ...c.appendices.map((a) => ({
            sourceType: 'CONTRACT' as const,
            sourceId: c.id,
            appendixId: a.id,
          })),
        ]),
        ...schedules.map((p) => ({
          sourceType: 'PAYMENT' as const,
          sourceId: p.id,
        })),
        ...plans.map((p) => ({
          sourceType: 'DELIVERY_INSTALL' as const,
          sourceId: p.id,
        })),
        ...customerPayments.map((p) => ({
          sourceType: 'CUSTOMER_PAYMENT_RECORD' as const,
          sourceId: p.id,
        })),
      ];
      for (const input of snapshots) {
        try {
          const source = await customerPublicationSource(
            tx,
            await this.freshActor(tx, actor),
            projectId,
            input,
          );
          result.push({
            ...input,
            sourceFingerprint: source.fingerprint,
            version: 1,
            name: source.title,
          });
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
    register = false,
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
    if (input.sourceType === 'QUOTATION')
      return this.quotationSource(tx, fresh, projectId, input, register);
    if (
      input.sourceType &&
      ['TECHNICAL', 'SAMPLE', 'HANDOVER'].includes(input.sourceType)
    )
      return this.artifactSource(tx, fresh, projectId, input);
    if (!input.fileId)
      throw new BadRequestException('Thiếu file nguồn phương án');
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
    return {
      sourceUpdatedAt: source.updatedAt,
      sourceId: source.id,
      sourceVersionId: source.versions[0]!.id,
      quotationDocumentId: null,
      quotationApprovalId: null,
      file,
    };
  }

  private async quotationSource(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    input: ChatReleaseDto,
    register: boolean,
  ) {
    const scopes = actorsForPermission(actor, 'quotation.read').filter((a) =>
      a.permissions.includes('quotation.export'),
    );
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        OR: scopes.map((a) =>
          projectWhereForPermissions(a, ['quotation.read', 'quotation.export']),
        ),
      },
    });
    if (!project || !scopes.length) throw new NotFoundException();
    const document = await tx.quotationDocument.findFirst({
      where: {
        id: input.sourceId,
        quotationVersion: {
          version: input.version,
          status: { in: ['APPROVED', 'SENT', 'ACCEPTED'] },
          quotation: {
            projectId,
            organizationId: actor.organizationId,
            customerId: project.customerId,
            currentVersion: input.version,
          },
        },
      },
      include: {
        quotationVersion: {
          include: {
            quotation: true,
            approvals: {
              where: { decision: 'APPROVED' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    const approval = document?.quotationVersion.approvals[0];
    if (
      !document ||
      !approval ||
      approval.actorId === document.quotationVersion.createdBy ||
      !['PDF', 'XLSX'].includes(document.format)
    )
      throw new ConflictException(
        'Báo giá chưa đủ nguồn/phiên bản/phê duyệt để phát hành',
      );
    const mimeType =
      document.format === 'PDF'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const filename = `bao-gia-v${input.version}.${document.format.toLowerCase()}`;
    let file = await tx.fileAsset.findUnique({
      where: { storageKey: document.storageKey },
      include: { attachments: true },
    });
    if (!file && register) {
      const data = await this.releaseBytes(
        document.storageKey,
        document.checksum,
      );
      if (
        document.sizeBytes !== null &&
        document.sizeBytes !== BigInt(data.length)
      )
        throw new ConflictException('Kích thước bản xuất đã đổi');
      await lockOrganizationFileCapacity(tx, actor.organizationId);
      const env = readEnvironment();
      await assertFileCapacity(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        incomingBytes: 0n,
        staging: false,
        organizationLimitBytes: BigInt(env.UPLOAD_ORGANIZATION_QUOTA_BYTES),
        globalLimitBytes: BigInt(env.UPLOAD_GLOBAL_QUOTA_BYTES),
        unmeasuredFileBytes: BigInt(env.UPLOAD_MAX_FILE_BYTES),
        actorStagingLimit: env.UPLOAD_ACTOR_STAGING_LIMIT,
      });
      file = await tx.fileAsset.create({
        data: {
          organizationId: actor.organizationId,
          originalFilename: filename,
          storedFilename: document.storageKey.split('/').at(-1)!,
          storageKey: document.storageKey,
          checksum: document.checksum,
          sizeBytes: BigInt(data.length),
          mimeType,
          category: 'CUSTOMER_QUOTATION',
          uploadedById: document.generatedBy,
        },
        include: { attachments: true },
      });
      await this.event(
        tx,
        actor,
        projectId,
        file.id,
        'chat.release.register-export',
        { quotationDocumentId: document.id },
      );
    }
    if (
      file &&
      (file.organizationId !== actor.organizationId ||
        file.deletedAt ||
        file.checksum !== document.checksum ||
        (document.sizeBytes !== null &&
          file.sizeBytes !== document.sizeBytes) ||
        file.mimeType !== mimeType ||
        file.uploadedById !== document.generatedBy ||
        file.confidentiality !== 'INTERNAL' ||
        file.attachments.length ||
        (input.fileId && input.fileId !== file.id))
    )
      throw new ConflictException('Bản xuất không khớp nguồn báo giá');
    return {
      sourceUpdatedAt: document.quotationVersion.quotation.updatedAt,
      sourceId: null,
      sourceVersionId: null,
      quotationDocumentId: document.id,
      quotationApprovalId: approval.id,
      file,
    };
  }

  private async artifactSource(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    input: ChatReleaseDto,
  ) {
    const permission =
      input.sourceType === 'HANDOVER' ? 'handover.read' : 'production.read';
    const scopes = actorsForPermission(actor, permission);
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        OR: scopes.map((a) => projectWhereForPermissions(a, permission)),
      },
    });
    if (!project || !scopes.length) throw new NotFoundException();
    let fileId: string | null = null,
      updatedAt: Date,
      snapshot: Prisma.InputJsonObject;
    let technicalRevisionId: string | null = null,
      sampleApprovalId: string | null = null,
      handoverDocumentId: string | null = null;
    if (input.sourceType === 'TECHNICAL') {
      const revision = await tx.technicalApprovalRevision.findUnique({
        where: { id: input.sourceId },
        include: {
          technicalApproval: {
            include: {
              productionOrder: {
                include: {
                  purchaseOrder: { include: { purchaseRequest: true } },
                },
              },
            },
          },
        },
      });
      const parent = revision?.technicalApproval,
        order = parent?.productionOrder;
      if (
        !revision ||
        !parent ||
        !order ||
        order.organizationId !== actor.organizationId ||
        order.projectId !== projectId ||
        order.purchaseOrder.purchaseRequest.projectId !== projectId ||
        order.purchaseOrder.projectId !== projectId ||
        order.purchaseOrder.organizationId !== actor.organizationId ||
        !['SHOP_DRAWING', 'SAMPLE'].includes(parent.type) ||
        parent.status !== 'APPROVED' ||
        parent.currentRevision !== revision.revision ||
        revision.revision !== input.version ||
        revision.decision !== 'APPROVED' ||
        !revision.decidedBy ||
        !revision.decidedAt ||
        revision.decidedBy === revision.submittedBy
      )
        throw new ConflictException(
          'Bản vẽ/mẫu chưa đủ nguồn/phê duyệt/phiên bản',
        );
      technicalRevisionId = revision.id;
      fileId = revision.fileId;
      updatedAt = parent.updatedAt;
      snapshot = {
        sourceType: 'TECHNICAL',
        sourceId: revision.id,
        parentId: parent.id,
        type: parent.type,
        revision: revision.revision,
        status: parent.status,
        submittedBy: revision.submittedBy,
        decidedBy: revision.decidedBy,
        decidedAt: revision.decidedAt.toISOString(),
      };
    } else if (input.sourceType === 'SAMPLE') {
      const sample = await tx.sampleApproval.findUnique({
        where: { id: input.sourceId },
        include: {
          productionOrder: {
            include: { purchaseOrder: { include: { purchaseRequest: true } } },
          },
        },
      });
      const order = sample?.productionOrder;
      if (
        !sample ||
        !order ||
        order.organizationId !== actor.organizationId ||
        order.projectId !== projectId ||
        order.purchaseOrder.purchaseRequest.projectId !== projectId ||
        order.purchaseOrder.projectId !== projectId ||
        order.purchaseOrder.organizationId !== actor.organizationId ||
        sample.status !== 'APPROVED' ||
        !sample.decidedBy ||
        !sample.decidedAt ||
        sample.decidedBy === sample.submittedBy
      )
        throw new ConflictException('Mẫu chưa đủ nguồn/phê duyệt');
      sampleApprovalId = sample.id;
      fileId = sample.fileId;
      updatedAt = sample.decidedAt;
      snapshot = {
        sourceType: 'SAMPLE',
        sourceId: sample.id,
        type: 'SAMPLE',
        status: sample.status,
        submittedBy: sample.submittedBy,
        decidedBy: sample.decidedBy,
        decidedAt: sample.decidedAt.toISOString(),
      };
    } else {
      const document = await tx.handoverDocument.findUnique({
        where: { id: input.sourceId },
        include: { handover: true },
      });
      if (
        !document ||
        document.organizationId !== actor.organizationId ||
        document.projectId !== projectId ||
        document.handover.organizationId !== actor.organizationId ||
        document.handover.projectId !== projectId ||
        document.version !== input.version ||
        document.supersededBy ||
        ![
          'HANDOVER_MINUTES',
          'PRODUCT_LIST',
          'WARRANTY_DOCUMENT',
          'AS_BUILT_DRAWING',
        ].includes(document.type) ||
        !(
          document.signedStatus === 'NOT_REQUIRED' ||
          (['SIGNED_MANUALLY', 'SIGNED_EXTERNALLY'].includes(
            document.signedStatus,
          ) &&
            document.signedAt)
        )
      )
        throw new ConflictException(
          'Hồ sơ bàn giao chưa đủ nguồn/trạng thái/phiên bản',
        );
      handoverDocumentId = document.id;
      fileId = document.fileAssetId;
      updatedAt = document.uploadedAt;
      snapshot = {
        sourceType: 'HANDOVER',
        sourceId: document.id,
        parentId: document.handoverId,
        type: document.type,
        version: document.version,
        checksum: document.checksum,
        signedStatus: document.signedStatus,
        signedAt: document.signedAt?.toISOString() ?? null,
        handoverStatus: document.handover.status,
      };
    }
    if (!fileId || (input.fileId && input.fileId !== fileId))
      throw new ConflictException('File không khớp nguồn');
    const file = await tx.fileAsset.findFirst({
      where: {
        id: fileId,
        organizationId: actor.organizationId,
        deletedAt: null,
      },
      include: { attachments: true },
    });
    if (
      !file ||
      !file.checksum ||
      !/^[0-9a-f]{64}$/.test(file.checksum) ||
      file.confidentiality !== 'INTERNAL' ||
      !file.attachments.some((a) => a.projectId === projectId) ||
      file.attachments.some(
        (a) => a.projectId !== projectId || a.entityType !== 'Project',
      ) ||
      (input.sourceType === 'SAMPLE' && file.version !== input.version) ||
      (input.sourceType === 'HANDOVER' && snapshot.checksum !== file.checksum)
    )
      throw new ConflictException('File chưa đủ căn cứ phát hành');
    // Existing restricted document references must not be repackaged as customer artifacts.
    const [required, logical] = await Promise.all([
      tx.projectRequiredDocument.count({
        where: {
          OR: [
            { currentFileAssetId: file.id },
            { versions: { some: { fileAssetId: file.id } } },
          ],
        },
      }),
      tx.projectStageOneDocument.count({
        where: {
          OR: [
            { currentFileAssetId: file.id },
            { versions: { some: { fileAssetId: file.id } } },
          ],
        },
      }),
    ]);
    if (required || logical)
      throw new ForbiddenException(
        'Nguồn dùng chung cần kiểm tra nội dung riêng',
      );
    const sourceSnapshot = {
      ...snapshot,
      projectId,
      customerId: project.customerId,
      fileId: file.id,
      fileVersion: file.version,
      checksum: file.checksum,
    };
    return {
      sourceId: null,
      sourceVersionId: null,
      quotationDocumentId: null,
      quotationApprovalId: null,
      technicalRevisionId,
      sampleApprovalId,
      handoverDocumentId,
      sourceUpdatedAt: updatedAt,
      sourceSnapshot,
      sourceFingerprint: createHash('sha256')
        .update(JSON.stringify(sourceSnapshot))
        .digest('hex'),
      file,
    };
  }

  private async prepareCustomerSnapshot(
    actor: CurrentActor,
    roomId: string,
    input: ChatReleaseDto,
  ) {
    if (!input.clientKey || !input.sourceFingerprint || input.fileId)
      throw new BadRequestException(
        'Cần khóa yêu cầu và dấu nguồn; binary do server tạo',
      );
    const projectId = await this.access.roomProject(actor, roomId);
    const sourceInput = {
      sourceType: input.sourceType as CustomerSnapshotType,
      sourceId: input.sourceId,
      appendixId: input.appendixId,
    };
    if (input.appendixId && input.sourceType !== 'CONTRACT')
      throw new BadRequestException('Phụ lục chỉ thuộc hợp đồng');
    const prepareHash = createHash('sha256')
      .update(
        JSON.stringify({
          ...sourceInput,
          sourceFingerprint: input.sourceFingerprint,
        }),
      )
      .digest('hex');
    const reservationId = randomUUID(),
      storageKey = this.storage.createKey(actor.organizationId);
    const projectRead = async (tx: Prisma.TransactionClient) => {
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
      return customerPublicationSource(
        tx,
        await this.freshActor(tx, actor),
        projectId,
        sourceInput,
      );
    };
    const replay = async (tx: Prisma.TransactionClient) => {
      const row = await tx.chatDocumentRelease.findUnique({
        where: {
          roomId_preparedBy_prepareKey: {
            roomId,
            preparedBy: actor.userId,
            prepareKey: input.clientKey!,
          },
        },
      });
      if (row && (row.prepareHash !== prepareHash || row.revokedAt))
        throw new ConflictException(
          'Khóa chuẩn bị đã dùng cho nội dung khác hoặc bản bị thu hồi',
        );
      return row;
    };
    const initial = await this.access.project(actor, projectId, async (tx) => {
      const source = await projectRead(tx);
      const existing = await replay(tx);
      if (existing) return { existing, source };
      if (source.fingerprint !== input.sourceFingerprint)
        throw new ConflictException('Nguồn đã đổi; tải lại danh sách');
      await lockOrganizationFileCapacity(tx, actor.organizationId);
      const env = readEnvironment();
      await assertFileCapacity(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        incomingBytes: BigInt(source.bytes.length),
        staging: false,
        organizationLimitBytes: BigInt(env.UPLOAD_ORGANIZATION_QUOTA_BYTES),
        globalLimitBytes: BigInt(env.UPLOAD_GLOBAL_QUOTA_BYTES),
        unmeasuredFileBytes: BigInt(env.UPLOAD_MAX_FILE_BYTES),
        actorStagingLimit: env.UPLOAD_ACTOR_STAGING_LIMIT,
      });
      await tx.fileStorageReservation.create({
        data: {
          id: reservationId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
          storageKey,
          sizeBytes: BigInt(source.bytes.length),
          expiresAt: fileStorageReservationExpiry(),
        },
      });
      return { source, existing: null };
    });
    const view = (r: { id: string; version: number; filename: string }) => ({
      id: r.id,
      version: r.version,
      filename: r.filename,
      roomId,
    });
    if (initial.existing) return view(initial.existing);
    const cleanup = async () => {
      if (await this.db.fileAsset.findUnique({ where: { storageKey } })) return;
      await this.storage.removePending(storageKey, reservationId);
      await this.storage.remove(storageKey);
      await this.db.fileStorageReservation.deleteMany({
        where: { id: reservationId, storageKey },
      });
    };
    try {
      await this.storage.putStream(
        actor.organizationId,
        Readable.from(initial.source.bytes),
        storageKey,
        reservationId,
      );
      const release = await this.access.project(
        actor,
        projectId,
        async (tx) => {
          const current = await projectRead(tx);
          const existing = await replay(tx);
          if (existing) return existing;
          if (
            current.fingerprint !== initial.source.fingerprint ||
            current.fingerprint !== input.sourceFingerprint
          )
            throw new ConflictException('Nguồn đã đổi trong lúc tạo bản xuất');
          const reservations = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT "id" FROM "FileStorageReservation" WHERE "id"=${reservationId}::uuid AND "expiresAt">clock_timestamp() FOR UPDATE`,
          );
          if (!reservations.length)
            throw new ConflictException('Đặt chỗ file hết hạn');
          const checksum = createHash('sha256')
            .update(initial.source.bytes)
            .digest('hex');
          const filename = `${input.sourceType!.toLowerCase()}-${current.fingerprint.slice(0, 12)}.txt`;
          const file = await tx.fileAsset.create({
            data: {
              organizationId: actor.organizationId,
              originalFilename: filename,
              storedFilename: storageKey.split('/').at(-1)!,
              storageKey,
              checksum,
              sizeBytes: BigInt(current.bytes.length),
              mimeType: 'text/plain',
              category: 'CUSTOMER_SNAPSHOT',
              uploadedById: actor.userId,
            },
          });
          let contractDocumentId: string | null = null,
            version = 1;
          if (current.contractId) {
            const latest = await tx.contractDocument.aggregate({
              where: { contractId: current.contractId },
              _max: { version: true },
            });
            version = (latest._max.version ?? 0) + 1;
            const document = await tx.contractDocument.create({
              data: {
                contractId: current.contractId,
                appendixId: input.appendixId,
                fileAssetId: file.id,
                version,
                language: 'VI',
                format: 'TXT',
                storageKey,
                checksum,
                generatedBy: actor.userId,
                sourceSnapshot: current.snapshot,
                sourceFingerprint: current.fingerprint,
              },
            });
            contractDocumentId = document.id;
          }
          await this.storage.publishPending(storageKey, reservationId);
          const finalSource = await projectRead(tx);
          if (finalSource.fingerprint !== initial.source.fingerprint)
            throw new ConflictException('Nguồn đã đổi trước khi ghi bản xuất');
          const row = await tx.chatDocumentRelease.create({
            data: {
              organizationId: actor.organizationId,
              projectId,
              roomId,
              contractDocumentId,
              customerPaymentId: current.customerPaymentId ?? null,
              paymentScheduleId:
                input.sourceType === 'PAYMENT' ? input.sourceId : null,
              installationPlanId:
                input.sourceType === 'DELIVERY_INSTALL' ? input.sourceId : null,
              sourceSnapshot: current.snapshot,
              sourceFingerprint: current.fingerprint,
              sourceUpdatedAt: current.updatedAt,
              fileAssetId: file.id,
              version,
              checksum,
              filename,
              mimeType: file.mimeType,
              preparedBy: actor.userId,
              prepareKey: input.clientKey,
              prepareHash,
            },
          });
          await tx.fileStorageReservation.delete({
            where: { id: reservationId },
          });
          await this.event(
            tx,
            actor,
            projectId,
            row.id,
            'chat.release.prepare',
            { sourceId: input.sourceId, sourceType: input.sourceType, roomId },
          );
          return row;
        },
      );
      await cleanup();
      return view(release);
    } catch (error) {
      // Only this request's unique object is eligible. On cleanup failure keep the reservation for the existing sweeper.
      await cleanup().catch(() => undefined);
      throw error;
    }
  }

  async prepareRelease(
    actor: CurrentActor,
    roomId: string,
    input: ChatReleaseDto,
  ) {
    if (
      input.sourceType &&
      customerSnapshotTypes.includes(input.sourceType as CustomerSnapshotType)
    )
      return this.prepareCustomerSnapshot(actor, roomId, input);
    if (!input.version) throw new BadRequestException('Thiếu phiên bản nguồn');
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
      const { file, ...source } = await this.releaseSource(
        tx,
        actor,
        projectId,
        input,
        true,
      );
      if (!file) throw new ConflictException('Chưa có bản xuất hợp lệ');
      // Storage/quota waits can outlive a session or source-role grant.
      await this.releaseSource(tx, actor, projectId, {
        ...input,
        fileId: file.id,
      });
      await this.access.assertRoom(actor, roomId, 'UPLOAD', tx);
      const release = await tx.chatDocumentRelease.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          roomId,
          ...source,
          fileAssetId: file.id,
          version: input.version,
          checksum: file.checksum!,
          filename: file.originalFilename,
          mimeType: file.mimeType,
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
        { sourceId: input.sourceId, version: input.version, roomId },
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
    if (
      r.contractDocumentId ||
      r.customerPaymentId ||
      r.paymentScheduleId ||
      r.installationPlanId
    ) {
      const document = r.contractDocumentId
        ? await tx.contractDocument.findUniqueOrThrow({
            where: { id: r.contractDocumentId },
          })
        : null;
      const input = {
        sourceType: (document
          ? 'CONTRACT'
          : r.customerPaymentId
            ? 'CUSTOMER_PAYMENT_RECORD'
            : r.paymentScheduleId
              ? 'PAYMENT'
              : 'DELIVERY_INSTALL') as CustomerSnapshotType,
        sourceId:
          document?.contractId ??
          r.customerPaymentId ??
          r.paymentScheduleId ??
          r.installationPlanId!,
        appendixId: document?.appendixId ?? undefined,
      };
      const source = await customerPublicationSource(
        tx,
        await this.freshActor(tx, actor),
        r.projectId,
        input,
      );
      const file = await tx.fileAsset.findFirst({
        where: {
          id: r.fileAssetId,
          organizationId: actor.organizationId,
          deletedAt: null,
        },
        include: { attachments: true },
      });
      const digest = createHash('sha256').update(source.bytes).digest('hex');
      if (
        !file ||
        file.confidentiality !== 'INTERNAL' ||
        file.attachments.length ||
        source.fingerprint !== r.sourceFingerprint ||
        digest !== r.checksum ||
        file.checksum !== r.checksum ||
        file.mimeType !== r.mimeType ||
        file.originalFilename !== r.filename ||
        (document &&
          (document.fileAssetId !== file.id ||
            document.checksum !== r.checksum ||
            document.sourceFingerprint !== r.sourceFingerprint))
      )
        throw new ConflictException(
          'Nguồn/bản xuất đã đổi; chuẩn bị và kiểm tra lại',
        );
      return { r, file };
    }
    const source = await this.releaseSource(tx, actor, r.projectId, {
      sourceType: r.technicalRevisionId
        ? 'TECHNICAL'
        : r.sampleApprovalId
          ? 'SAMPLE'
          : r.handoverDocumentId
            ? 'HANDOVER'
            : r.quotationDocumentId
              ? 'QUOTATION'
              : 'PROPOSAL',
      sourceId:
        r.technicalRevisionId ??
        r.sampleApprovalId ??
        r.handoverDocumentId ??
        r.quotationDocumentId ??
        r.sourceId!,
      fileId: r.fileAssetId,
      version: r.version,
    });
    const { sourceUpdatedAt, quotationApprovalId, file } = source;
    if (
      ('sourceFingerprint' in source ? source.sourceFingerprint : null) !==
        r.sourceFingerprint ||
      !file ||
      quotationApprovalId !== r.quotationApprovalId ||
      sourceUpdatedAt.getTime() !== r.sourceUpdatedAt.getTime() ||
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
        sourceSnapshot: r.sourceSnapshot,
        ...(await this.recipients(tx, r.roomId, projectId)),
      };
    });
  }

  async previewRelease(actor: CurrentActor, id: string) {
    const projectId = await this.releaseProject(actor, id);
    return this.access.project(actor, projectId, async (tx) => {
      const { r, file } = await this.checkedRelease(tx, actor, id);
      const data = await this.releaseBytes(file.storageKey, r.checksum);
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

  private async releaseBytes(storageKey: string, checksum: string) {
    const chunks: Buffer[] = [];
    let size = 0;
    const ceiling = 10 * 1024 * 1024;
    for await (const chunk of await this.storage.stream(storageKey)) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > ceiling)
        throw new ConflictException('Bản phát hành vượt giới hạn 10 MiB');
      chunks.push(bytes);
    }
    const data = Buffer.concat(chunks);
    if (createHash('sha256').update(data).digest('hex') !== checksum)
      throw new ConflictException('Nội dung nguồn không khớp checksum');
    return data;
  }

  async publishRelease(
    actor: CurrentActor,
    id: string,
    recipientHash?: string,
  ) {
    const projectId = await this.releaseProject(actor, id);
    return this.access.project(actor, projectId, async (tx) => {
      const { r, file } = await this.checkedRelease(tx, actor, id);
      if (r.preparedBy === actor.userId)
        throw new ForbiddenException('Người chuẩn bị không tự phát hành');
      await this.releaseBytes(file.storageKey, r.checksum);
      await this.checkedRelease(tx, actor, id);
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
          publishedRecipients: {
            array_contains: [{ userId: actor.userId, actions: ['READ'] }],
          },
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
          publishedRecipients: {
            array_contains: [
              { userId: actor.userId, actions: ['READ', 'DOWNLOAD'] },
            ],
          },
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
      const data = await this.releaseBytes(r.file.storageKey, r.checksum);
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
