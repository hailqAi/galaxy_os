import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentActor } from '../access-control/current-actor';
import { PrismaService } from '../prisma.service';
import {
  CreateRequirementDto,
  CreateSurveyDto,
  UpdateRequirementDto,
  UpdateSurveyDto,
} from './discovery.dto';
@Injectable()
export class DiscoveryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private projectWhere(actor: CurrentActor): Prisma.ProjectWhereInput {
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
  async project(actor: CurrentActor, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { ...this.projectWhere(actor), id },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
  surveys(actor: CurrentActor) {
    return this.prisma.survey.findMany({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        project: this.projectWhere(actor),
      },
      include: { project: { select: { id: true, code: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async survey(actor: CurrentActor, id: string) {
    const item = await this.prisma.survey.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: null,
        project: this.projectWhere(actor),
      },
      include: { project: { select: { id: true, code: true, name: true } } },
    });
    if (!item) throw new NotFoundException('Survey not found');
    return item;
  }
  async createSurvey(actor: CurrentActor, data: CreateSurveyDto) {
    await this.project(actor, data.projectId);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.survey.create({
        data: {
          ...data,
          measurements: this.json(data.measurements),
          requestedAt: data.requestedAt
            ? new Date(data.requestedAt)
            : undefined,
          scheduledAt: data.scheduledAt
            ? new Date(data.scheduledAt)
            : undefined,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'SURVEY_CREATED',
          entityType: 'Survey',
          entityId: item.id,
        },
      });
      return item;
    });
  }
  async updateSurvey(actor: CurrentActor, id: string, data: UpdateSurveyDto) {
    const before = await this.survey(actor, id);
    if (before.approvalStatus === 'APPROVED')
      throw new ConflictException('Approved Survey is immutable');
    return this.prisma.survey.update({
      where: { id },
      data: {
        ...data,
        measurements: this.json(data.measurements),
        requestedAt: data.requestedAt ? new Date(data.requestedAt) : undefined,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
  }
  scheduleSurvey(actor: CurrentActor, id: string, scheduledAt: string) {
    return this.updateSurvey(actor, id, { scheduledAt });
  }
  async completeSurvey(actor: CurrentActor, id: string) {
    await this.survey(actor, id);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.survey.update({
        where: { id },
        data: {
          surveyedAt: new Date(),
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'SURVEY_COMPLETED',
          entityType: 'Survey',
          entityId: id,
        },
      });
      return item;
    });
  }
  async approveSurvey(actor: CurrentActor, id: string) {
    await this.survey(actor, id);
    return this.prisma.survey.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        updatedBy: actor.userId,
        version: { increment: 1 },
      },
    });
  }
  requirements(actor: CurrentActor) {
    return this.prisma.requirement.findMany({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        project: this.projectWhere(actor),
      },
      include: { project: { select: { id: true, code: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async requirement(actor: CurrentActor, id: string) {
    const item = await this.prisma.requirement.findFirst({
      where: {
        id,
        organizationId: actor.organizationId,
        deletedAt: null,
        project: this.projectWhere(actor),
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Requirement not found');
    return item;
  }
  async createRequirement(actor: CurrentActor, data: CreateRequirementDto) {
    await this.project(actor, data.projectId);
    if (
      data.budgetMin !== undefined &&
      data.budgetMax !== undefined &&
      data.budgetMin > data.budgetMax
    )
      throw new UnprocessableEntityException(
        'budgetMin must not exceed budgetMax',
      );
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.requirement.create({
        data: {
          ...data,
          organizationId: actor.organizationId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'REQUIREMENT_CREATED',
          entityType: 'Requirement',
          entityId: item.id,
        },
      });
      return item;
    });
  }
  async updateRequirement(
    actor: CurrentActor,
    id: string,
    data: UpdateRequirementDto,
  ) {
    const before = await this.requirement(actor, id);
    if (before.approvalStatus === 'APPROVED')
      throw new ConflictException(
        'Approved Requirement is immutable; create a new version',
      );
    return this.prisma.requirement.update({
      where: { id },
      data: { ...data, updatedBy: actor.userId },
    });
  }
  async newVersion(actor: CurrentActor, id: string) {
    const before = await this.requirement(actor, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.requirementVersion.create({
        data: {
          requirementId: id,
          version: before.version,
          snapshot: JSON.parse(JSON.stringify(before)),
          createdBy: actor.userId,
        },
      });
      return tx.requirement.update({
        where: { id },
        data: {
          version: { increment: 1 },
          status: 'DRAFT',
          approvalStatus: 'DRAFT',
          updatedBy: actor.userId,
        },
      });
    });
  }
  async approval(
    actor: CurrentActor,
    id: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
  ) {
    const before = await this.requirement(actor, id);
    if (before.approvalStatus === 'APPROVED')
      throw new ConflictException('Approved Requirement is immutable');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.requirement.update({
        where: { id },
        data: { status, approvalStatus: status, updatedBy: actor.userId },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event:
            status === 'APPROVED'
              ? 'REQUIREMENT_APPROVED'
              : 'REQUIREMENT_STATUS_CHANGED',
          entityType: 'Requirement',
          entityId: id,
          metadata: { status },
        },
      });
      return item;
    });
  }

  private json(value: Record<string, unknown> | undefined) {
    return value === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
  }
}
