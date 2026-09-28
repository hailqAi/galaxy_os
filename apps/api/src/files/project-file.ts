import { Prisma } from '@prisma/client';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { stageOneFinancialDocumentWhere } from '../projects/project-stage-one.rules';

export type ProjectFileClient = Pick<
  Prisma.TransactionClient,
  | 'entityAttachment'
  | 'fileAsset'
  | 'project'
  | 'projectRequiredDocument'
  | 'projectStageOneDocument'
>;

const projectFileMetadata = {
  id: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  uploadedById: true,
  createdAt: true,
} as const;

const referencedIds = (
  documents: {
    currentFileAssetId: string | null;
    versions: { fileAssetId: string | null }[];
  }[],
) =>
  documents.flatMap(({ currentFileAssetId, versions }) => [
    ...(currentFileAssetId ? [currentFileAssetId] : []),
    ...versions.flatMap(({ fileAssetId }) =>
      fileAssetId ? [fileAssetId] : [],
    ),
  ]);

const attachedIds = async (
  db: ProjectFileClient,
  projectId: string | undefined,
  requiredIds: string[],
  logicalIds: string[],
) => {
  if (!requiredIds.length && !logicalIds.length) return [];
  return (
    await db.entityAttachment.findMany({
      where: {
        projectId,
        OR: [
          ...(requiredIds.length
            ? [
                {
                  entityType: 'ProjectRequiredDocument',
                  entityId: { in: requiredIds },
                },
              ]
            : []),
          ...(logicalIds.length
            ? [
                {
                  entityType: 'ProjectStageOneDocument',
                  entityId: { in: logicalIds },
                },
              ]
            : []),
        ],
      },
      select: { fileAssetId: true },
    })
  ).map(({ fileAssetId }) => fileAssetId);
};

const visibleProjectIds = async (
  db: ProjectFileClient,
  actor: CurrentActor,
  permission: string,
  projectId?: string,
) => {
  if (!actor.permissions.includes(permission)) return new Set<string>();
  if (actor.permissionSources === undefined) return null;
  return new Set(
    (
      await db.project.findMany({
        where: {
          ...(projectId ? { id: projectId } : {}),
          ...projectWhereForPermissions(actor, permission),
        },
        select: { id: true },
      })
    ).map(({ id }) => id),
  );
};

export async function hiddenProjectFileIds(
  db: ProjectFileClient,
  actor: CurrentActor,
  projectId?: string,
) {
  const hidden = await hiddenStageOneFinanceFileIds(db, actor, projectId);
  const estimateProjects = await visibleProjectIds(
    db,
    actor,
    'estimate.read',
    projectId,
  );
  if (
    estimateProjects !== null &&
    (!projectId || !estimateProjects.has(projectId))
  ) {
    const [allRequired, allLogical] = await Promise.all([
      db.projectRequiredDocument.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          stageKey: 'STAGE_2',
          workstreamKey: 'PLAN',
        },
        select: {
          id: true,
          projectId: true,
          currentFileAssetId: true,
          versions: { select: { fileAssetId: true } },
        },
      }),
      db.projectStageOneDocument.findMany({
        where: {
          projectId,
          project: { organizationId: actor.organizationId },
          stageKey: 'STAGE_2',
          workstreamKey: 'PLAN',
        },
        select: {
          id: true,
          projectId: true,
          currentFileAssetId: true,
          versions: { select: { fileAssetId: true } },
        },
      }),
    ]);
    const required = allRequired.filter(
      ({ projectId: id }) => !estimateProjects.has(id),
    );
    const logical = allLogical.filter(
      ({ projectId: id }) => !estimateProjects.has(id),
    );
    const candidates = [
      ...referencedIds(required),
      ...referencedIds(logical),
      ...(await attachedIds(
        db,
        projectId,
        required.map(({ id }) => id),
        logical.map(({ id }) => id),
      )),
    ];
    if (candidates.length)
      hidden.push(
        ...(
          await db.fileAsset.findMany({
            where: {
              id: { in: [...new Set(candidates)] },
              organizationId: actor.organizationId,
              originalFilename: { endsWith: '.xlsx', mode: 'insensitive' },
              mimeType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
            select: { id: true },
          })
        ).map(({ id }) => id),
      );
  }
  return [...new Set(hidden)];
}

export async function hiddenStageOneFinanceFileIds(
  db: ProjectFileClient,
  actor: CurrentActor,
  projectId?: string,
) {
  const financeProjects = await visibleProjectIds(
    db,
    actor,
    'project.stage1.finance.read',
    projectId,
  );
  if (financeProjects === null || (projectId && financeProjects.has(projectId)))
    return [];
  const [allRequired, allLogical] = await Promise.all([
    db.projectRequiredDocument.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        ...stageOneFinancialDocumentWhere(),
      },
      select: {
        id: true,
        projectId: true,
        currentFileAssetId: true,
        versions: { select: { fileAssetId: true } },
      },
    }),
    db.projectStageOneDocument.findMany({
      where: {
        projectId,
        project: { organizationId: actor.organizationId },
        ...stageOneFinancialDocumentWhere(),
      },
      select: {
        id: true,
        projectId: true,
        currentFileAssetId: true,
        versions: { select: { fileAssetId: true } },
      },
    }),
  ]);
  const required = allRequired.filter(
    ({ projectId: id }) => !financeProjects.has(id),
  );
  const logical = allLogical.filter(
    ({ projectId: id }) => !financeProjects.has(id),
  );
  return [
    ...referencedIds(required),
    ...referencedIds(logical),
    ...(await attachedIds(
      db,
      projectId,
      required.map(({ id }) => id),
      logical.map(({ id }) => id),
    )),
  ];
}

export async function findProjectFiles(
  db: ProjectFileClient,
  actor: CurrentActor,
  projectId: string,
  ids: string[],
) {
  if (!ids.length) return [];
  const [readProjects, downloadProjects] = await Promise.all([
    visibleProjectIds(db, actor, 'file.read', projectId),
    visibleProjectIds(db, actor, 'file.download', projectId),
  ]);
  if (
    readProjects !== null &&
    downloadProjects !== null &&
    !readProjects.has(projectId) &&
    !downloadProjects.has(projectId)
  )
    return [];
  const hidden = await hiddenProjectFileIds(db, actor, projectId);
  return db.fileAsset.findMany({
    where: {
      id: { in: [...new Set(ids)], notIn: hidden },
      organizationId: actor.organizationId,
      deletedAt: null,
      attachments: { some: { projectId } },
      NOT: { attachments: { some: { entityType: 'ChatRoom' } } },
    },
    select: projectFileMetadata,
  });
}

export async function findProjectFile(
  db: ProjectFileClient,
  actor: CurrentActor,
  projectId: string,
  id: string,
) {
  const [readProjects, downloadProjects] = await Promise.all([
    visibleProjectIds(db, actor, 'file.read', projectId),
    visibleProjectIds(db, actor, 'file.download', projectId),
  ]);
  if (
    readProjects !== null &&
    downloadProjects !== null &&
    !readProjects.has(projectId) &&
    !downloadProjects.has(projectId)
  )
    return null;
  const hidden = await hiddenProjectFileIds(db, actor, projectId);
  return db.fileAsset.findFirst({
    where: {
      id: { equals: id, notIn: hidden },
      organizationId: actor.organizationId,
      deletedAt: null,
      attachments: { some: { projectId } },
      NOT: { attachments: { some: { entityType: 'ChatRoom' } } },
    },
    select: projectFileMetadata,
  });
}
