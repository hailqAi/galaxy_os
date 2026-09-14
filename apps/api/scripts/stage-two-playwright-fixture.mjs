import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { deleteFixtureFileAssets } from './stage-one-playwright-fixture-storage.mjs';

const prisma = new PrismaClient();
const ids = {
  project: '20000000-0000-4000-8000-000000000291',
  department: '20000000-0000-4000-8000-000000000294',
};
const workbookPath = resolve(
  process.cwd(),
  '../../.runtime/playwright/stage-two-valid.xlsx',
);

async function cleanup() {
  const organization = await prisma.organization.findUnique({
    where: { slug: 'galaxy-centre' },
  });
  if (!organization) return;
  const definitions = await prisma.projectRequiredDocument.findMany({
    where: {
      organizationId: organization.id,
      projectId: ids.project,
      stageKey: 'STAGE_2',
    },
    select: { id: true },
  });
  const documents = await prisma.projectStageOneDocument.findMany({
    where: { projectId: ids.project, stageKey: 'STAGE_2' },
    select: {
      id: true,
      currentFileAssetId: true,
      versions: { select: { fileAssetId: true } },
    },
  });
  const documentIds = documents.map(({ id }) => id);
  const scopedDefinitionIds = definitions.map(({ id }) => id);
  const uploadSessions = await prisma.uploadSession.findMany({
    where: {
      organizationId: organization.id,
      projectId: ids.project,
      OR: [
        { requiredDocumentId: { in: scopedDefinitionIds } },
        { stageOneDocumentId: { in: documentIds } },
      ],
    },
    select: { id: true, fileAssetId: true },
  });
  const importJobs = await prisma.importJob.findMany({
    where: {
      organizationId: organization.id,
      projectId: ids.project,
      entityType: 'PROJECT_STAGE_TWO_BASELINE',
    },
    select: { id: true, fileAssetId: true },
  });
  const fileIds = [
    ...documents.flatMap(({ currentFileAssetId, versions }) => [
      ...(currentFileAssetId ? [currentFileAssetId] : []),
      ...versions.map(({ fileAssetId }) => fileAssetId),
    ]),
    ...uploadSessions.flatMap(({ fileAssetId }) => fileAssetId ?? []),
    ...importJobs.flatMap(({ fileAssetId }) => fileAssetId ?? []),
  ];
  const ownedFiles = await prisma.fileAsset.findMany({
    where: {
      id: { in: [...new Set(fileIds)] },
      organizationId: organization.id,
    },
    select: { id: true, storageKey: true },
  });
  const entityScopes = [
    {
      entityType: 'ProjectRequiredDocument',
      entityId: { in: scopedDefinitionIds },
    },
    { entityType: 'ProjectStageOneDocument', entityId: { in: documentIds } },
  ];
  await prisma.activity.deleteMany({
    where: {
      organizationId: organization.id,
      OR: [
        {
          entityType: 'Project',
          entityId: ids.project,
          event: { startsWith: 'PROJECT_STAGE_TWO_' },
        },
        ...entityScopes,
      ],
    },
  });
  await prisma.auditLog.deleteMany({
    where: {
      organizationId: organization.id,
      OR: [
        {
          entityType: 'Project',
          entityId: ids.project,
          action: { startsWith: 'PROJECT_STAGE_TWO_' },
        },
        ...entityScopes,
      ],
    },
  });
  await prisma.importJob.deleteMany({
    where: {
      id: { in: importJobs.map(({ id }) => id) },
      organizationId: organization.id,
      projectId: ids.project,
      entityType: 'PROJECT_STAGE_TWO_BASELINE',
    },
  });
  await prisma.task.deleteMany({
    where: {
      organizationId: organization.id,
      projectId: ids.project,
      relatedEntityType: 'PROJECT_STAGE_TWO_BASELINE',
    },
  });
  await prisma.entityAttachment.deleteMany({
    where: {
      projectId: ids.project,
      fileAssetId: { in: ownedFiles.map(({ id }) => id) },
    },
  });
  await prisma.uploadSession.deleteMany({
    where: {
      id: { in: uploadSessions.map(({ id }) => id) },
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.projectStageOneDocumentVersion.deleteMany({
    where: { documentId: { in: documentIds } },
  });
  await prisma.projectStageOneDocument.deleteMany({
    where: {
      id: { in: documentIds },
      projectId: ids.project,
      stageKey: 'STAGE_2',
    },
  });
  await prisma.projectRequiredDocumentVersion.deleteMany({
    where: { requirementId: { in: scopedDefinitionIds } },
  });
  await prisma.projectRequiredDocument.deleteMany({
    where: {
      id: { in: scopedDefinitionIds },
      organizationId: organization.id,
      projectId: ids.project,
      stageKey: 'STAGE_2',
    },
  });
  await prisma.projectStageStep.deleteMany({
    where: { projectId: ids.project, stage: 'STAGE_TWO' },
  });
  await prisma.projectStageState.deleteMany({
    where: { projectId: ids.project, stage: 'STAGE_TWO' },
  });
  await deleteFixtureFileAssets(
    () =>
      prisma.fileAsset.deleteMany({
        where: {
          id: { in: ownedFiles.map(({ id }) => id) },
          organizationId: organization.id,
        },
      }),
    resolve(
      process.env.FILE_STORAGE_PATH ??
        join(process.cwd(), '../../.runtime/files'),
    ),
    ownedFiles.map(({ storageKey }) => storageKey),
  );
  await rm(workbookPath, { force: true });
}

async function setup() {
  await cleanup();
  const [organization, project, department] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { slug: 'galaxy-centre' },
    }),
    prisma.project.findUniqueOrThrow({ where: { id: ids.project } }),
    prisma.department.findUniqueOrThrow({ where: { id: ids.department } }),
  ]);
  if (
    project.organizationId !== organization.id ||
    department.organizationId !== organization.id
  )
    throw new Error('The Stage 2 fixture requires the Stage 1 fixture scope');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kế hoạch GĐ 2');
  sheet.addRow([
    'MÃ CV',
    'NỘI DUNG CÔNG VIỆC CHI TIẾT',
    'ĐƠN VỊ CHỦ TRÌ',
    'NGÀY BẮT ĐẦU',
    'NGÀY HOÀN THÀNH',
    'NGÂN SÁCH PHÂN BỔ (VND)',
  ]);
  sheet.addRow([
    'PW-IMP-01',
    'Công việc nhập từ Excel',
    department.code,
    '2026-08-20',
    '2026-08-25',
    '2500000.50',
  ]);
  await mkdir(dirname(workbookPath), { recursive: true });
  await workbook.xlsx.writeFile(workbookPath);
}

try {
  if (process.argv[2] === 'cleanup') await cleanup();
  else await setup();
} finally {
  await prisma.$disconnect();
}
