import { Controller, Get, Inject } from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import { TasksService } from '../tasks/tasks.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly entities: BusinessEntityPolicy,
    @Inject(TasksService) private readonly tasks: TasksService,
  ) {}

  @Get()
  @RequirePermission('dashboard.read')
  async get(@Actor() actor: CurrentActor) {
    const now = new Date();
    const can = (permission: string) => actor.permissions.includes(permission);
    const leadWhere = this.entities.leadWhere(actor);
    const opportunityWhere = {
      ...this.entities.opportunityWhere(actor),
      AND: [
        {
          OR: [
            { project: null },
            {
              project: this.entities.projectWhere(
                actor,
                'crm.opportunity.read',
              ),
            },
          ],
        },
      ],
    };
    const projectWhere = this.entities.projectWhere(actor, 'project.read');
    const taskWhere = this.tasks.visibleWhere(actor);
    const [
      activeLeads,
      opportunityValues,
      activeProjects,
      overdueTasks,
      stages,
      health,
      attentionTasks,
    ] = await Promise.all([
      can('crm.lead.read')
        ? this.prisma.lead.count({
            where: {
              ...leadWhere,
              status: { in: ['NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED'] },
            },
          })
        : null,
      can('crm.opportunity.read') && can('estimate.read')
        ? this.prisma.opportunity.groupBy({
            by: ['currency'],
            where: {
              ...opportunityWhere,
              AND: [
                ...opportunityWhere.AND,
                {
                  OR: [
                    { project: null },
                    {
                      project: this.entities.projectWhere(actor, [
                        'crm.opportunity.read',
                        'estimate.read',
                      ]),
                    },
                  ],
                },
              ],
              stage: { notIn: ['WON', 'LOST'] },
            },
            _sum: { estimatedValue: true },
          })
        : undefined,
      can('project.read')
        ? this.prisma.project.count({
            where: { ...projectWhere, status: { in: ['PLANNING', 'ACTIVE'] } },
          })
        : null,
      can('task.read')
        ? this.prisma.task.count({
            where: {
              ...taskWhere,
              dueDate: { lt: now },
              status: { notIn: ['DONE', 'CANCELLED'] },
            },
          })
        : null,
      can('crm.opportunity.read')
        ? this.prisma.opportunity.groupBy({
            by: ['stage'],
            where: opportunityWhere,
            orderBy: { stage: 'asc' },
            _count: true,
          })
        : [],
      can('project.read')
        ? this.prisma.project.groupBy({
            by: ['healthStatus'],
            where: projectWhere,
            orderBy: { healthStatus: 'asc' },
            _count: true,
          })
        : [],
      can('task.read')
        ? this.prisma.task.findMany({
            where: { ...taskWhere, status: { notIn: ['DONE', 'CANCELLED'] } },
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              dueDate: true,
              project: { select: { id: true, name: true } },
              assignees: {
                select: { user: { select: { displayName: true } } },
              },
            },
            orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { id: 'asc' }],
            take: 8,
          })
        : [],
    ]);
    const readableProjects =
      can('activity.read') && can('project.read')
        ? await this.prisma.project.findMany({
            where: this.entities.projectWhere(actor, [
              'project.read',
              'activity.read',
            ]),
            select: { id: true, name: true },
          })
        : [];
    const activity = readableProjects.length
      ? await this.prisma.activity.findMany({
          where: {
            organizationId: actor.organizationId,
            entityType: 'Project',
            entityId: { in: readableProjects.map((p) => p.id) },
          },
          select: {
            id: true,
            entityId: true,
            event: true,
            createdAt: true,
            actor: { select: { displayName: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 8,
        })
      : [];
    return {
      activity: activity.map((item) => ({
        ...item,
        projectName: readableProjects.find((p) => p.id === item.entityId)!.name,
      })),
      asOf: now.toISOString(),
      scope: 'AUTHORIZED',
      kpis: { activeLeads, activeProjects, overdueTasks },
      ...(opportunityValues && {
        opportunityValues: opportunityValues.flatMap(({ currency, _sum }) =>
          _sum.estimatedValue === null
            ? []
            : [{ currency, value: _sum.estimatedValue.toString() }],
        ),
      }),
      pipeline: stages.map((item) => ({
        stage: item.stage,
        count: item._count,
      })),
      projectHealth: health.map((item) => ({
        health: item.healthStatus,
        count: item._count,
      })),
      attentionTasks,
    };
  }
}
