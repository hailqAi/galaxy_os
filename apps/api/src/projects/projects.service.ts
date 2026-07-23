import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ProjectPhase } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto';
const phases: ProjectPhase[] = [
  'SURVEY',
  'REQUIREMENT',
  'DESIGN',
  'PRODUCT_SELECTION',
  'QUOTATION',
  'CONTRACT',
  'PROCUREMENT',
  'PRODUCTION',
  'SHIPPING',
  'INSTALLATION',
  'INSPECTION',
  'HANDOVER',
  'WARRANTY',
  'AFTER_SALES',
];
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private visibleWhere(actor: CurrentActor): Prisma.ProjectWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
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
          }
        : {
            OR: [
              { projectOwnerId: actor.userId },
              { projectManagerId: actor.userId },
              { members: { some: { userId: actor.userId } } },
            ],
          };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
  private include() {
    return {
      customer: { select: { id: true, displayName: true } },
      primaryContact: { select: { id: true, displayName: true } },
      projectManager: { select: { id: true, displayName: true } },
      members: {
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      },
      departments: {
        include: { department: { select: { id: true, name: true } } },
      },
      opportunity: { select: { id: true, name: true } },
    } as const;
  }
  async list(
    actor: CurrentActor,
    q: {
      page: number;
      pageSize: number;
      search?: string;
      customerId?: string;
      phase?: ProjectPhase;
      status?: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
      health?: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
      projectManagerId?: string;
      departmentId?: string;
      from?: Date;
      to?: Date;
      sort?:
        | 'code'
        | 'name'
        | 'updatedAt'
        | 'expectedCompletionDate'
        | 'estimatedValue';
      direction?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.ProjectWhereInput = {
      AND: [
        this.visibleWhere(actor),
        q.search
          ? {
              OR: [
                { code: { contains: q.search, mode: 'insensitive' } },
                { name: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
      customerId: q.customerId,
      phase: q.phase,
      status: q.status,
      healthStatus: q.health,
      projectManagerId: q.projectManagerId,
      departments: q.departmentId
        ? { some: { departmentId: q.departmentId } }
        : undefined,
      expectedCompletionDate:
        q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: this.include(),
        orderBy: { [q.sort ?? 'updatedAt']: q.direction ?? 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.project.count({ where }),
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
    const item = await this.prisma.project.findFirst({
      where: { ...this.visibleWhere(actor), id },
      include: this.include(),
    });
    if (!item) throw new NotFoundException('Project not found');
    return item;
  }
  async timeline(actor: CurrentActor, id: string) {
    await this.get(actor, id);
    return this.prisma.activity.findMany({
      where: {
        organizationId: actor.organizationId,
        entityType: 'Project',
        entityId: id,
      },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async create(actor: CurrentActor, data: CreateProjectDto) {
    await this.references(actor, data);
    return this.prisma
      .$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            ...this.dates(data),
            organizationId: actor.organizationId,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
          include: this.include(),
        });
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'PROJECT_CREATED',
            entityType: 'Project',
            entityId: project.id,
          },
        });
        await this.audit.write(tx, actor, {
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: project.id,
          afterData: project,
        });
        return project;
      })
      .catch((error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ConflictException('Project code already exists');
        throw error;
      });
  }
  async update(actor: CurrentActor, id: string, data: UpdateProjectDto) {
    await this.get(actor, id);
    await this.references(actor, data);
    return this.prisma.project.update({
      where: { id },
      data: {
        ...this.dates(data),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
      include: this.include(),
    });
  }
  async remove(actor: CurrentActor, id: string) {
    await this.get(actor, id);
    return this.prisma.project.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
  }
  members(actor: CurrentActor, id: string) {
    return this.get(actor, id).then((item) => item.members);
  }
  async addMember(
    actor: CurrentActor,
    id: string,
    userId: string,
    role?: string,
  ) {
    await this.get(actor, id);
    if (
      !(await this.prisma.user.findFirst({
        where: {
          id: userId,
          status: 'active',
          organizationMembers: {
            some: { organizationId: actor.organizationId, status: 'active' },
          },
        },
      }))
    )
      throw new NotFoundException('Active project member not found');
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: id, userId } },
        create: {
          organizationId: actor.organizationId,
          projectId: id,
          userId,
          role,
          createdBy: actor.userId,
        },
        update: { role },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_MEMBER_ADDED',
          entityType: 'Project',
          entityId: id,
          metadata: { userId },
        },
      });
      return member;
    });
  }
  async removeMember(actor: CurrentActor, id: string, userId: string) {
    await this.get(actor, id);
    const result = await this.prisma.projectMember.deleteMany({
      where: { organizationId: actor.organizationId, projectId: id, userId },
    });
    if (!result.count) throw new NotFoundException('Project member not found');
    return { deleted: true };
  }
  departments(actor: CurrentActor, id: string) {
    return this.get(actor, id).then((item) => item.departments);
  }
  async addDepartment(actor: CurrentActor, id: string, departmentId: string) {
    await this.get(actor, id);
    if (
      !(await this.prisma.department.findFirst({
        where: {
          id: departmentId,
          organizationId: actor.organizationId,
          status: 'active',
        },
      }))
    )
      throw new NotFoundException('Department not found');
    return this.prisma.projectDepartment.upsert({
      where: { projectId_departmentId: { projectId: id, departmentId } },
      create: {
        organizationId: actor.organizationId,
        projectId: id,
        departmentId,
        createdBy: actor.userId,
      },
      update: {},
    });
  }
  async removeDepartment(
    actor: CurrentActor,
    id: string,
    departmentId: string,
  ) {
    await this.get(actor, id);
    const result = await this.prisma.projectDepartment.deleteMany({
      where: {
        organizationId: actor.organizationId,
        projectId: id,
        departmentId,
      },
    });
    if (!result.count)
      throw new NotFoundException('Project department not found');
    return { deleted: true };
  }
  async changePhase(actor: CurrentActor, id: string, phase: ProjectPhase) {
    const project = await this.get(actor, id);
    if (phases.indexOf(phase) !== phases.indexOf(project.phase) + 1)
      throw new UnprocessableEntityException(
        'Invalid project phase transition',
      );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: { phase, updatedBy: actor.userId, version: { increment: 1 } },
        include: this.include(),
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_PHASE_CHANGED',
          entityType: 'Project',
          entityId: id,
          metadata: { from: project.phase, to: phase },
        },
      });
      return updated;
    });
  }
  private dates<T extends CreateProjectDto | UpdateProjectDto>(data: T) {
    return {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      expectedCompletionDate: data.expectedCompletionDate
        ? new Date(data.expectedCompletionDate)
        : undefined,
    };
  }
  private async references(
    actor: CurrentActor,
    data: {
      customerId?: string;
      primaryContactId?: string;
      projectOwnerId?: string;
      salesOwnerId?: string;
      designOwnerId?: string;
      projectManagerId?: string;
    },
  ) {
    if (
      data.customerId &&
      !(await this.prisma.customer.findFirst({
        where: {
          id: data.customerId,
          organizationId: actor.organizationId,
          deletedAt: null,
        },
      }))
    )
      throw new NotFoundException('Customer not found');
    if (
      data.primaryContactId &&
      !(await this.prisma.contact.findFirst({
        where: {
          id: data.primaryContactId,
          organizationId: actor.organizationId,
          customerId: data.customerId,
        },
      }))
    )
      throw new NotFoundException('Primary contact not found');
    for (const userId of [
      data.projectOwnerId,
      data.salesOwnerId,
      data.designOwnerId,
      data.projectManagerId,
    ].filter((id): id is string => !!id))
      if (
        !(await this.prisma.user.findFirst({
          where: {
            id: userId,
            status: 'active',
            organizationMembers: {
              some: { organizationId: actor.organizationId, status: 'active' },
            },
          },
        }))
      )
        throw new NotFoundException('Project user not found');
  }
}
