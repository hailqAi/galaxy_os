import { Controller, Get, Inject } from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy)
    private readonly entities: BusinessEntityPolicy,
  ) {}

  @Get()
  @RequirePermission('dashboard.read')
  async get(@Actor() actor: CurrentActor) {
    const now = new Date();
    const leadWhere = this.entities.leadWhere(actor);
    const opportunityWhere = this.entities.opportunityWhere(actor);
    const projectWhere = this.entities.projectWhere(actor);
    const taskWhere = this.entities.taskWhere(actor);
    const [
      activeLeads,
      pipeline,
      activeProjects,
      overdueTasks,
      stages,
      health,
      attentionTasks,
    ] = await this.prisma.$transaction([
      this.prisma.lead.count({
        where: {
          ...leadWhere,
          status: { in: ['NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED'] },
        },
      }),
      this.prisma.opportunity.aggregate({
        where: {
          ...opportunityWhere,
          stage: { notIn: ['WON', 'LOST'] },
        },
        _sum: { estimatedValue: true },
      }),
      this.prisma.project.count({
        where: { ...projectWhere, status: { in: ['PLANNING', 'ACTIVE'] } },
      }),
      this.prisma.task.count({
        where: {
          ...taskWhere,
          dueDate: { lt: now },
          status: { notIn: ['DONE', 'CANCELLED'] },
        },
      }),
      this.prisma.opportunity.groupBy({
        by: ['stage'],
        where: opportunityWhere,
        orderBy: { stage: 'asc' },
        _count: true,
        _sum: { estimatedValue: true },
      }),
      this.prisma.project.groupBy({
        by: ['healthStatus'],
        where: projectWhere,
        orderBy: { healthStatus: 'asc' },
        _count: true,
      }),
      this.prisma.task.findMany({
        where: {
          ...taskWhere,
          status: { notIn: ['DONE', 'CANCELLED'] },
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          project: { select: { name: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
        take: 8,
      }),
    ]);
    return {
      kpis: {
        activeLeads,
        pipelineValue: pipeline._sum.estimatedValue ?? 0,
        activeProjects,
        overdueTasks,
      },
      pipeline: stages.map((item) => ({
        stage: item.stage,
        count: item._count,
        value: item._sum?.estimatedValue ?? 0,
      })),
      projectHealth: health.map((item) => ({
        health: item.healthStatus,
        count: item._count,
      })),
      attentionTasks,
    };
  }
}
