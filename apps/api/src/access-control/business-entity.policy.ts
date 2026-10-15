import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { isStageOneFinancialDocument } from '../projects/project-stage-one.rules';
import { CurrentActor } from './current-actor';

export const businessEntityTypes = [
  'Customer',
  'Contact',
  'Lead',
  'Opportunity',
  'Project',
  'Task',
  'Survey',
  'Requirement',
  'ProjectProductLine',
  'ProjectRequiredDocument',
  'Comment',
  'MarketingContent',
] as const;
export type BusinessEntityType = (typeof businessEntityTypes)[number];
export type EntityContext = {
  entityType: BusinessEntityType;
  entityId: string;
  projectId?: string;
  customerId?: string;
};

type ProjectPermissions = string | readonly string[];
type ProjectPermissionTarget = {
  projectOwnerId: string | null;
  projectManagerId: string | null;
  members: { userId: string }[];
  departments: { departmentId: string }[];
};

const selfProjectAccess = (actor: CurrentActor): Prisma.ProjectWhereInput => ({
  OR: [
    { projectOwnerId: actor.userId },
    { projectManagerId: actor.userId },
    { members: { some: { userId: actor.userId } } },
  ],
});

const legacyProjectAccess = (actor: CurrentActor): Prisma.ProjectWhereInput =>
  ['SYSTEM', 'ORGANIZATION'].includes(actor.administrationScope)
    ? {}
    : actor.administrationScope === 'MANAGED_DEPARTMENTS'
      ? {
          OR: [
            ...(selfProjectAccess(actor).OR ?? []),
            {
              departments: {
                some: { departmentId: { in: actor.managedDepartmentIds } },
              },
            },
          ],
        }
      : selfProjectAccess(actor);

export const projectPermissionApplies = (
  actor: CurrentActor,
  permission: string,
  project: ProjectPermissionTarget,
) => {
  if (!actor.permissions.includes(permission)) return false;
  const own =
    project.projectOwnerId === actor.userId ||
    project.projectManagerId === actor.userId ||
    project.members.some(({ userId }) => userId === actor.userId);
  if (actor.permissionSources === undefined)
    return (
      ['SYSTEM', 'ORGANIZATION'].includes(actor.administrationScope) ||
      own ||
      (actor.administrationScope === 'MANAGED_DEPARTMENTS' &&
        project.departments.some(({ departmentId }) =>
          actor.managedDepartmentIds.includes(departmentId),
        ))
    );
  return actor.permissionSources
    .filter((source) => source.permission === permission)
    .some(
      (source) =>
        ['SYSTEM', 'ORGANIZATION'].includes(source.scopeType) ||
        own ||
        (source.scopeType === 'DEPARTMENT' &&
          project.departments.some(({ departmentId }) =>
            (
              source.managedDepartmentIds ??
              (source.departmentId ? [source.departmentId] : [])
            ).includes(departmentId),
          )),
    );
};

export const projectWhereForPermissions = (
  actor: CurrentActor,
  requiredPermissions?: ProjectPermissions,
): Prisma.ProjectWhereInput => {
  const base = {
    organizationId: actor.organizationId,
    deletedAt: null,
  } satisfies Prisma.ProjectWhereInput;
  const required = requiredPermissions
    ? [
        ...new Set(
          Array.isArray(requiredPermissions)
            ? requiredPermissions
            : [requiredPermissions],
        ),
      ]
    : [];
  if (required.some((permission) => !actor.permissions.includes(permission)))
    return { ...base, id: { in: [] } };
  if (!required.length && actor.permissionSources !== undefined)
    return { ...base, ...selfProjectAccess(actor) };
  if (!required.length || actor.permissionSources === undefined)
    return { ...base, ...legacyProjectAccess(actor) };

  const access = required.map((permission): Prisma.ProjectWhereInput => {
    if (!actor.permissions.includes(permission)) return { id: { in: [] } };
    const sources = actor.permissionSources!.filter(
      (source) => source.permission === permission,
    );
    if (!sources.length) return { id: { in: [] } };
    if (
      sources.some(({ scopeType }) =>
        ['SYSTEM', 'ORGANIZATION'].includes(scopeType),
      )
    )
      return {};
    const departmentIds = [
      ...new Set(
        sources.flatMap((source) =>
          source.scopeType === 'DEPARTMENT'
            ? (source.managedDepartmentIds ??
              (source.departmentId &&
              actor.managedDepartmentIds.includes(source.departmentId)
                ? [source.departmentId]
                : []))
            : [],
        ),
      ),
    ];
    return {
      OR: [
        ...(selfProjectAccess(actor).OR ?? []),
        ...(departmentIds.length
          ? [
              {
                departments: {
                  some: { departmentId: { in: departmentIds } },
                },
              },
            ]
          : []),
      ],
    };
  });
  return {
    ...base,
    ...(access.some((where) => Object.keys(where).length)
      ? { AND: access }
      : {}),
  };
};

@Injectable()
export class BusinessEntityPolicy {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async assertView(
    actor: CurrentActor,
    entityType: string,
    entityId: string,
    requiredPermissions?: ProjectPermissions,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<EntityContext> {
    if (!businessEntityTypes.includes(entityType as BusinessEntityType))
      throw new NotFoundException('Entity not found');
    const organizationId = actor.organizationId;
    switch (entityType as BusinessEntityType) {
      case 'Customer': {
        const item = await db.customer.findFirst({
          where: { id: entityId, organizationId, deletedAt: null },
          select: { id: true },
        });
        if (item)
          return { entityType: 'Customer', entityId, customerId: item.id };
        break;
      }
      case 'Contact': {
        const item = await db.contact.findFirst({
          where: { id: entityId, organizationId, deletedAt: null },
          select: { id: true, customerId: true },
        });
        if (item)
          return {
            entityType: 'Contact',
            entityId,
            customerId: item.customerId,
          };
        break;
      }
      case 'Lead': {
        const item = await db.lead.findFirst({
          where: { id: entityId, ...this.leadWhere(actor) },
          select: { id: true },
        });
        if (item) return { entityType: 'Lead', entityId };
        break;
      }
      case 'Opportunity': {
        const item = await db.opportunity.findFirst({
          where: {
            id: entityId,
            AND: [
              this.opportunityWhere(actor),
              {
                OR: [
                  { project: null },
                  {
                    project: this.projectWhere(actor, requiredPermissions),
                  },
                ],
              },
            ],
          },
          select: {
            id: true,
            customerId: true,
            project: { select: { id: true } },
          },
        });
        if (item)
          return {
            entityType: 'Opportunity',
            entityId,
            customerId: item.customerId ?? undefined,
            projectId: item.project?.id,
          };
        break;
      }
      case 'Project': {
        const item = await db.project.findFirst({
          where: {
            id: entityId,
            ...this.projectWhere(actor, requiredPermissions),
          },
          select: { id: true, customerId: true },
        });
        if (item)
          return {
            entityType: 'Project',
            entityId,
            projectId: item.id,
            customerId: item.customerId,
          };
        break;
      }
      case 'Task': {
        const item = await db.task.findFirst({
          where: {
            id: entityId,
            AND: [
              this.taskWhere(actor),
              {
                OR: [
                  { projectId: null },
                  {
                    project: this.projectWhere(actor, requiredPermissions),
                  },
                ],
              },
            ],
          },
          select: { id: true, projectId: true, customerId: true },
        });
        if (item)
          return {
            entityType: 'Task',
            entityId,
            projectId: item.projectId ?? undefined,
            customerId: item.customerId ?? undefined,
          };
        break;
      }
      case 'Survey': {
        const item = await db.survey.findFirst({
          where: {
            id: entityId,
            organizationId,
            deletedAt: null,
            project: this.projectWhere(actor, requiredPermissions),
          },
          select: {
            id: true,
            project: { select: { id: true, customerId: true } },
          },
        });
        if (item)
          return {
            entityType: 'Survey',
            entityId,
            projectId: item.project.id,
            customerId: item.project.customerId,
          };
        break;
      }
      case 'Requirement': {
        const item = await db.requirement.findFirst({
          where: {
            id: entityId,
            organizationId,
            deletedAt: null,
            project: this.projectWhere(actor, requiredPermissions),
          },
          select: {
            id: true,
            project: { select: { id: true, customerId: true } },
          },
        });
        if (item)
          return {
            entityType: 'Requirement',
            entityId,
            projectId: item.project.id,
            customerId: item.project.customerId,
          };
        break;
      }
      case 'ProjectProductLine': {
        const item = await db.projectProductLine.findFirst({
          where: {
            id: entityId,
            organizationId,
            deletedAt: null,
            project: this.projectWhere(actor, requiredPermissions),
          },
          select: {
            id: true,
            project: { select: { id: true, customerId: true } },
          },
        });
        if (item)
          return {
            entityType: 'ProjectProductLine',
            entityId,
            projectId: item.project.id,
            customerId: item.project.customerId,
          };
        break;
      }
      case 'ProjectRequiredDocument': {
        const item = await db.projectRequiredDocument.findFirst({
          where: {
            id: entityId,
            organizationId,
            project: this.projectWhere(actor, requiredPermissions),
          },
          select: {
            id: true,
            stageKey: true,
            workstreamKey: true,
            documentType: true,
            project: { select: { id: true, customerId: true } },
          },
        });
        if (
          item &&
          (!isStageOneFinancialDocument(item) ||
            (actor.permissions.includes('project.stage1.finance.read') &&
              (actor.permissionSources === undefined ||
                (await this.hasProjectPermissions(
                  actor,
                  item.project.id,
                  'project.stage1.finance.read',
                  db,
                )))))
        )
          return {
            entityType: 'ProjectRequiredDocument',
            entityId,
            projectId: item.project.id,
            customerId: item.project.customerId,
          };
        break;
      }
      case 'Comment': {
        const item = await db.comment.findFirst({
          where: { id: entityId, organizationId },
          select: { entityType: true, entityId: true },
        });
        if (item) {
          const parent = await this.assertView(
            actor,
            item.entityType,
            item.entityId,
            requiredPermissions,
            db,
          );
          return { ...parent, entityType: 'Comment', entityId };
        }
        break;
      }
      case 'MarketingContent': {
        const item = await db.contentItem.findFirst({
          where: { id: entityId, organizationId },
          select: { id: true },
        });
        if (item) return { entityType: 'MarketingContent', entityId };
        break;
      }
    }
    throw new NotFoundException('Entity not found');
  }

  projectWhere(
    actor: CurrentActor,
    requiredPermissions?: ProjectPermissions,
  ): Prisma.ProjectWhereInput {
    return projectWhereForPermissions(actor, requiredPermissions);
  }
  async hasProjectPermissions(
    actor: CurrentActor,
    projectId: string,
    requiredPermissions: ProjectPermissions,
    db: Pick<Prisma.TransactionClient, 'project'> = this.prisma,
  ) {
    return Boolean(
      await db.project.findFirst({
        where: {
          id: projectId,
          ...this.projectWhere(actor, requiredPermissions),
        },
        select: { id: true },
      }),
    );
  }
  async actorForProject(
    actor: CurrentActor,
    projectId: string,
    db: Pick<Prisma.TransactionClient, 'project'> = this.prisma,
  ): Promise<CurrentActor> {
    if (actor.permissionSources === undefined) return actor;
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organizationId: actor.organizationId,
        deletedAt: null,
      },
      select: {
        projectOwnerId: true,
        projectManagerId: true,
        members: {
          where: { userId: actor.userId },
          select: { userId: true },
        },
        departments: { select: { departmentId: true } },
      },
    });
    return {
      ...actor,
      permissions: project
        ? actor.permissions.filter((permission) =>
            projectPermissionApplies(actor, permission, project),
          )
        : [],
    };
  }
  leadWhere(actor: CurrentActor): Prisma.LeadWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { ownerId: actor.userId },
              { departmentId: { in: actor.managedDepartmentIds } },
            ],
          }
        : { ownerId: actor.userId };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
  opportunityWhere(actor: CurrentActor): Prisma.OpportunityWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { ownerId: actor.userId },
              { departmentId: { in: actor.managedDepartmentIds } },
            ],
          }
        : { ownerId: actor.userId };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
  taskWhere(actor: CurrentActor): Prisma.TaskWhereInput {
    const access = ['SYSTEM', 'ORGANIZATION'].includes(
      actor.administrationScope,
    )
      ? {}
      : actor.administrationScope === 'MANAGED_DEPARTMENTS'
        ? {
            OR: [
              { createdBy: actor.userId },
              { departmentId: { in: actor.managedDepartmentIds } },
              { project: this.projectWhere(actor) },
              { assignees: { some: { userId: actor.userId } } },
              { watchers: { some: { userId: actor.userId } } },
            ],
          }
        : {
            OR: [
              { createdBy: actor.userId },
              { project: this.projectWhere(actor) },
              { assignees: { some: { userId: actor.userId } } },
              { watchers: { some: { userId: actor.userId } } },
            ],
          };
    return { organizationId: actor.organizationId, deletedAt: null, ...access };
  }
}
