import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { ChecklistDto, CreateTaskDto, UpdateTaskDto } from './tasks.dto';
import { STAGE_TWO_PLAN_ENTITY } from '../projects/project-stage-two.dto';
@Injectable()
export class TasksService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  visibleWhere(actor: CurrentActor): Prisma.TaskWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { createdBy: actor.userId },
              { departmentId: { in: actor.managedDepartmentIds } },
              { assignees: { some: { userId: actor.userId } } },
              { watchers: { some: { userId: actor.userId } } },
            ],
          }
        : {
            OR: [
              { createdBy: actor.userId },
              { assignees: { some: { userId: actor.userId } } },
              { watchers: { some: { userId: actor.userId } } },
            ],
          };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
  private include() {
    return {
      project: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, displayName: true } },
      department: { select: { id: true, name: true } },
      assignees: {
        include: { user: { select: { id: true, displayName: true } } },
      },
      watchers: {
        include: { user: { select: { id: true, displayName: true } } },
      },
      checklist: { orderBy: { position: 'asc' as const } },
      dependencies: {
        include: {
          requiredTask: { select: { id: true, title: true, status: true } },
        },
      },
    } as const;
  }
  private financialOmit(actor: CurrentActor) {
    return {
      ...(!actor.permissions.includes('estimate.read') && {
        allocatedBudget: true,
      }),
    } as const;
  }
  private requireGenericMutation(task: { relatedEntityType?: string | null }) {
    if (task.relatedEntityType === STAGE_TWO_PLAN_ENTITY)
      throw new ConflictException(
        'Stage 2 plan rows must be changed through the Project Stage 2 plan',
      );
  }
  async list(
    actor: CurrentActor,
    q: {
      page: number;
      pageSize: number;
      search?: string;
      status?: TaskStatus;
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
      projectId?: string;
      departmentId?: string;
      assigneeId?: string;
      overdue?: boolean;
      open?: boolean;
      mine?: boolean;
      sort?: 'title' | 'updatedAt' | 'dueDate' | 'priority';
      direction?: 'asc' | 'desc';
    },
    visibility: Prisma.TaskWhereInput = this.visibleWhere(actor),
    snapshot = false,
  ) {
    const now = new Date();
    const where: Prisma.TaskWhereInput = {
      AND: [
        visibility,
        q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {},
      ],
      status: q.status,
      priority: q.priority,
      projectId: q.projectId,
      departmentId: q.departmentId,
      assignees:
        q.assigneeId || q.mine
          ? { some: { userId: q.mine ? actor.userId : q.assigneeId } }
          : undefined,
      dueDate: q.overdue ? { lt: now } : undefined,
      NOT:
        q.overdue || q.open
          ? { status: { in: ['DONE', 'CANCELLED'] } }
          : undefined,
    };
    const grouped = this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const queries = [
      this.prisma.task.findMany({
        where,
        include: this.include(),
        omit: this.financialOmit(actor),
        orderBy: [
          { [q.sort ?? 'updatedAt']: q.direction ?? 'desc' },
          { id: 'asc' },
        ],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.task.count({ where }),
      grouped,
    ] as const;
    const options = {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    };
    // ponytail: at most1000 contributing IDs per AI snapshot; use a database ACL witness if larger collections become necessary.
    const [items, total, counts, snapshotIds] = await (snapshot
      ? this.prisma.$transaction(
          [
            ...queries,
            this.prisma.task.findMany({
              where,
              select: { id: true },
              orderBy: { id: 'asc' },
              take: 1001,
            }),
          ],
          options,
        )
      : this.prisma.$transaction([...queries], options));
    return {
      items,
      ...(snapshot
        ? { snapshotTaskIds: snapshotIds?.map((item) => item.id) }
        : {}),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
      statusCounts: Object.fromEntries(
        counts.map((row) => [row.status, row._count._all]),
      ),
      computedAt: now.toISOString(),
    };
  }
  async get(
    actor: CurrentActor,
    id: string,
    visibility: Prisma.TaskWhereInput = this.visibleWhere(actor),
    historyPage?: { page: number; pageSize: number },
  ) {
    const read = async (tx: Prisma.TransactionClient) => {
      const item = await tx.task.findFirst({
        where: { ...visibility, id },
        include: this.include(),
        omit: this.financialOmit(actor),
      });
      if (!item) throw new NotFoundException('Task not found');
      const where = {
        organizationId: actor.organizationId,
        entityType: 'Task',
        entityId: id,
      };
      const activity = await tx.activity.findMany({
        where,
        include: { actor: { select: { id: true, displayName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(historyPage
          ? {
              skip: (historyPage.page - 1) * historyPage.pageSize,
              take: historyPage.pageSize,
            }
          : {}),
      });
      return {
        ...item,
        activity,
        ...(historyPage
          ? { activityTotal: await tx.activity.count({ where }) }
          : {}),
      };
    };
    return historyPage
      ? this.prisma.$transaction(read, {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        })
      : read(this.prisma);
  }
  async create(actor: CurrentActor, data: CreateTaskDto) {
    this.requireGenericMutation(data);
    await this.assertProject(actor, data.projectId);
    await this.assertUsers(actor, data.assigneeIds ?? [], data.departmentId);
    return this.prisma.$transaction(async (tx) => {
      const { assigneeIds = [], ...values } = data;
      const task = await tx.task.create({
        data: {
          ...values,
          startDate: values.startDate ? new Date(values.startDate) : undefined,
          dueDate: values.dueDate ? new Date(values.dueDate) : undefined,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (assigneeIds.length)
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((userId) => ({
            organizationId: actor.organizationId,
            taskId: task.id,
            userId,
            assignedBy: actor.userId,
          })),
          skipDuplicates: true,
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'TASK_CREATED',
          entityType: 'Task',
          entityId: task.id,
        },
      });
      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
        include: this.include(),
        omit: this.financialOmit(actor),
      });
    });
  }
  async update(actor: CurrentActor, id: string, data: UpdateTaskDto) {
    const current = await this.get(actor, id);
    this.requireGenericMutation(current);
    this.requireGenericMutation(data);
    await this.assertProject(actor, data.projectId);
    const { assigneeIds, ...values } = data;
    if (assigneeIds) {
      if (!actor.permissions.includes('task.assign'))
        throw new ForbiddenException('Task assignment permission is required');
      await this.assertUsers(
        actor,
        assigneeIds,
        data.departmentId ?? current.departmentId ?? undefined,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id },
        data: {
          ...values,
          startDate: values.startDate ? new Date(values.startDate) : undefined,
          dueDate: values.dueDate ? new Date(values.dueDate) : undefined,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      if (assigneeIds) await this.assignWithin(tx, actor, task, assigneeIds);
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'TASK_UPDATED',
          entityType: 'Task',
          entityId: id,
          metadata: {
            fields: Object.keys(data),
            fromVersion: task.version - 1,
            toVersion: task.version,
          },
        },
      });
      return tx.task.findUniqueOrThrow({
        where: { id },
        include: this.include(),
        omit: this.financialOmit(actor),
      });
    });
  }
  async remove(actor: CurrentActor, id: string) {
    const current = await this.get(actor, id);
    this.requireGenericMutation(current);
    return this.prisma.task.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      omit: this.financialOmit(actor),
    });
  }
  async assign(actor: CurrentActor, id: string, userIds: string[]) {
    const task = await this.get(actor, id);
    await this.assertUsers(actor, userIds, task.departmentId ?? undefined);
    return this.prisma.$transaction(async (tx) => {
      await this.assignWithin(tx, actor, task, userIds);
      return tx.task.findUniqueOrThrow({
        where: { id },
        include: this.include(),
        omit: this.financialOmit(actor),
      });
    });
  }
  private async assignWithin(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    task: { id: string; title: string },
    userIds: string[],
  ) {
    const id = task.id;
    await tx.taskAssignee.deleteMany({
      where: { taskId: id, userId: { notIn: userIds } },
    });
    await tx.taskAssignee.createMany({
      data: userIds.map((userId) => ({
        organizationId: actor.organizationId,
        taskId: id,
        userId,
        assignedBy: actor.userId,
      })),
      skipDuplicates: true,
    });
    await tx.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event: 'TASK_ASSIGNED',
        entityType: 'Task',
        entityId: id,
        metadata: { userIds },
      },
    });
    if (userIds.length)
      await tx.notification.createMany({
        data: userIds.map((recipientId) => ({
          organizationId: actor.organizationId,
          recipientId,
          type: 'TASK_ASSIGNED',
          title: `Bạn được giao công việc ${task.title}`,
          entityType: 'Task',
          entityId: id,
          href: `/tasks/${id}`,
        })),
      });
  }
  async watchers(actor: CurrentActor, id: string, userIds: string[]) {
    await this.get(actor, id);
    await this.assertUsers(actor, userIds);
    return this.prisma.$transaction(async (tx) => {
      await tx.taskWatcher.deleteMany({
        where: { taskId: id, userId: { notIn: userIds } },
      });
      await tx.taskWatcher.createMany({
        data: userIds.map((userId) => ({
          organizationId: actor.organizationId,
          taskId: id,
          userId,
          createdBy: actor.userId,
        })),
        skipDuplicates: true,
      });
      return tx.task.findUniqueOrThrow({
        where: { id },
        include: this.include(),
        omit: this.financialOmit(actor),
      });
    });
  }
  async changeStatus(actor: CurrentActor, id: string, status: TaskStatus) {
    const before = await this.get(actor, id);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id },
        data: {
          status,
          completedAt:
            status === 'DONE'
              ? new Date()
              : before.status === 'DONE'
                ? null
                : undefined,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
        include: this.include(),
        omit: this.financialOmit(actor),
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: status === 'DONE' ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED',
          entityType: 'Task',
          entityId: id,
          metadata: { from: before.status, to: status },
        },
      });
      return task;
    });
  }
  complete(actor: CurrentActor, id: string) {
    return this.changeStatus(actor, id, 'DONE');
  }
  async checklist(actor: CurrentActor, id: string, data: ChecklistDto) {
    await this.get(actor, id);
    if (data.id) {
      const item = await this.prisma.checklistItem.findFirst({
        where: { id: data.id, taskId: id },
      });
      if (!item) throw new NotFoundException('Checklist item not found');
      return this.prisma.checklistItem.update({
        where: { id: data.id },
        data: {
          title: data.title,
          position: data.position,
          completedAt:
            data.completed === true
              ? new Date()
              : data.completed === false
                ? null
                : undefined,
          completedBy:
            data.completed === true
              ? actor.userId
              : data.completed === false
                ? null
                : undefined,
        },
      });
    }
    if (!data.title)
      throw new ForbiddenException('Checklist title is required');
    return this.prisma.checklistItem.create({
      data: { taskId: id, title: data.title, position: data.position ?? 0 },
    });
  }
  private async assertProject(actor: CurrentActor, projectId?: string) {
    if (!projectId) return;
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : {
          OR: [
            { projectOwnerId: actor.userId },
            { projectManagerId: actor.userId },
            { members: { some: { userId: actor.userId } } },
            {
              departments: {
                some: { departmentId: { in: actor.managedDepartmentIds } },
              },
            },
          ],
        };
    if (
      !(await this.prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: actor.organizationId,
          deletedAt: null,
          ...access,
        },
      }))
    )
      throw new NotFoundException('Project not found');
  }
  private async assertUsers(
    actor: CurrentActor,
    userIds: string[],
    departmentId?: string,
  ) {
    if (
      departmentId &&
      !['SYSTEM', 'ORGANIZATION'].includes(actor.administrationScope) &&
      !actor.managedDepartmentIds.includes(departmentId)
    )
      throw new ForbiddenException(
        'Cross-department assignment is not allowed',
      );
    if (!userIds.length) return;
    const count = await this.prisma.user.count({
      where: {
        id: { in: userIds },
        status: 'active',
        organizationMembers: {
          some: { organizationId: actor.organizationId, status: 'active' },
        },
        departmentMembers: departmentId
          ? { some: { organizationId: actor.organizationId, departmentId } }
          : undefined,
      },
    });
    if (count !== new Set(userIds).size)
      throw new NotFoundException('Assignable user not found');
  }
}
