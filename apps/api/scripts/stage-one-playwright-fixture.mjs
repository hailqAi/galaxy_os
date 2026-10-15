import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import process from 'node:process';
import { deleteFixtureFileAssets } from './stage-one-playwright-fixture-storage.mjs';
import { assertG00Isolation } from './g00-isolated-environment.mjs';

const isolated = assertG00Isolation();
const prisma = new PrismaClient();
const ids = {
  pm: '10000000-0000-4000-8000-000000000191',
  approver: '10000000-0000-4000-8000-000000000192',
  outsider: '10000000-0000-4000-8000-000000000193',
  uploader: '10000000-0000-4000-8000-000000000194',
  project: '20000000-0000-4000-8000-000000000291',
  stageFourProject: '20000000-0000-4000-8000-000000000293',
  location: '20000000-0000-4000-8000-000000000292',
  department: '20000000-0000-4000-8000-000000000294',
  customer: '20000000-0000-4000-8000-000000000295',
  managerRole: '20000000-0000-4000-8000-000000000296',
  contract: '30000000-0000-4000-8000-000000000293',
  customerPayment: '30000000-0000-4000-8000-000000000294',
  customerPaymentSchedule: '30000000-0000-4000-8000-000000000295',
  serviceTicket: '30000000-0000-4000-8000-000000000296',
  purchaseRequest: '30000000-0000-4000-8000-000000000297',
  purchaseRequestLine: '30000000-0000-4000-8000-000000000298',
  rfq: '30000000-0000-4000-8000-000000000299',
  rfqLine: '30000000-0000-4000-8000-000000000300',
  supplierQuotation: '30000000-0000-4000-8000-000000000301',
  supplierQuotationLine: '30000000-0000-4000-8000-000000000302',
  comparison: '30000000-0000-4000-8000-000000000303',
  comparisonLine: '30000000-0000-4000-8000-000000000304',
  selection: '30000000-0000-4000-8000-000000000305',
  purchaseOrder: '30000000-0000-4000-8000-000000000306',
  purchaseOrderLine: '30000000-0000-4000-8000-000000000307',
  proformaInvoice: '30000000-0000-4000-8000-000000000308',
  proformaInvoiceLine: '30000000-0000-4000-8000-000000000309',
  supplierPayable: '30000000-0000-4000-8000-000000000310',
  supplier: '30000000-0000-4000-8000-000000000311',
};
const users = [ids.pm, ids.approver, ids.outsider, ids.uploader];
const roleCodes = [
  'playwright_stage_one_manager',
  'playwright_stage_one_outsider',
  'playwright_stage_one_uploader',
];
const createdProject = {
  idempotencyKey: 'p0-stage-one-create-browser',
  name: 'Playwright P0 Created Project',
};
const requiredDocuments = [
  [
    '40000000-0000-4000-8000-000000000391',
    'ASSIGNMENT',
    'PROJECT_DOSSIER',
    'Project dossier',
  ],
  [
    '40000000-0000-4000-8000-000000000392',
    'ASSIGNMENT',
    'RESPONSIBILITY_MATRIX',
    'Responsibility matrix',
  ],
  [
    '40000000-0000-4000-8000-000000000393',
    'SURVEY',
    'SURVEY_REPORT',
    'Survey report',
  ],
  [
    '40000000-0000-4000-8000-000000000394',
    'SURVEY',
    'SITE_CONSTRAINTS',
    'Site constraints',
  ],
  [
    '40000000-0000-4000-8000-000000000395',
    'PROPOSAL',
    'SCOPE_STATEMENT',
    'Scope statement',
  ],
  ['40000000-0000-4000-8000-000000000396', 'PROPOSAL', 'PROPOSAL', 'Proposal'],
  [
    '40000000-0000-4000-8000-000000000397',
    'PROPOSAL',
    'PROPOSAL_MILESTONES',
    'Proposal milestones',
  ],
  [
    '40000000-0000-4000-8000-000000000398',
    'PROPOSAL',
    'PROPOSAL_WBS',
    'Proposal WBS',
  ],
  [
    '40000000-0000-4000-8000-000000000399',
    'PROPOSAL',
    'RISK_REGISTER',
    'Risk register',
  ],
  [
    '40000000-0000-4000-8000-000000000400',
    'PROPOSAL',
    'RESOURCE_PLAN',
    'Resource plan',
  ],
  [
    '40000000-0000-4000-8000-000000000401',
    'FINANCIAL_PLANNING',
    'PRELIMINARY_FINANCIAL_PLAN',
    'Preliminary financial plan',
  ],
  [
    '40000000-0000-4000-8000-000000000402',
    'KICKOFF_APPROVAL',
    'KICKOFF_APPROVAL',
    'Kickoff approval',
  ],
];
const initialMatrixDocuments = [
  [
    '41000000-0000-4000-8000-000000000391',
    'ASSIGNMENT',
    'Văn bản chủ trương / Quyết định giao nhiệm vụ',
  ],
  [
    '41000000-0000-4000-8000-000000000392',
    'SURVEY',
    'Báo cáo khảo sát & Phương án nhân sự',
  ],
  [
    '41000000-0000-4000-8000-000000000393',
    'PROPOSAL',
    'Hồ sơ Báo cáo Kinh tế - Kỹ thuật',
  ],
  [
    '41000000-0000-4000-8000-000000000394',
    'FINANCIAL_PLANNING',
    'Văn bản xác nhận / Cân đối nguồn vốn',
  ],
  [
    '41000000-0000-4000-8000-000000000395',
    'KICKOFF_APPROVAL',
    'Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật',
  ],
];

async function cleanupCreatedProject(organizationId) {
  const project = await prisma.project.findUnique({
    where: {
      organizationId_creationIdempotencyKey: {
        organizationId,
        creationIdempotencyKey: createdProject.idempotencyKey,
      },
    },
    select: { id: true, name: true, createdBy: true },
  });
  if (!project) return;
  if (project.name !== createdProject.name || project.createdBy !== ids.pm)
    throw new Error('Refusing to delete a non-fixture created Project');
  const definitions = await prisma.projectRequiredDocument.findMany({
    where: { organizationId, projectId: project.id },
    select: {
      id: true,
      currentFileAssetId: true,
      versions: { select: { fileAssetId: true } },
    },
  });
  const [stageOneDocuments, attachments, uploadSessions] = await Promise.all([
    prisma.projectStageOneDocument.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        currentFileAssetId: true,
        versions: { select: { fileAssetId: true } },
      },
    }),
    prisma.entityAttachment.findMany({
      where: { projectId: project.id },
      select: { id: true, fileAssetId: true },
    }),
    prisma.uploadSession.findMany({
      where: { organizationId, projectId: project.id },
      select: { id: true, fileAssetId: true },
    }),
  ]);
  const entityScopes = [
    { entityType: 'Project', entityId: project.id },
    {
      entityType: 'ProjectRequiredDocument',
      entityId: { in: definitions.map(({ id }) => id) },
    },
    {
      entityType: 'ProjectStageOneDocument',
      entityId: { in: stageOneDocuments.map(({ id }) => id) },
    },
  ];
  const fileIds = [
    ...attachments.map(({ fileAssetId }) => fileAssetId),
    ...definitions.flatMap(({ currentFileAssetId, versions }) => [
      ...(currentFileAssetId ? [currentFileAssetId] : []),
      ...versions.flatMap(({ fileAssetId }) => fileAssetId ?? []),
    ]),
    ...stageOneDocuments.flatMap(({ currentFileAssetId, versions }) => [
      ...(currentFileAssetId ? [currentFileAssetId] : []),
      ...versions.map(({ fileAssetId }) => fileAssetId),
    ]),
    ...uploadSessions.flatMap(({ fileAssetId }) => fileAssetId ?? []),
  ];
  const ownedFiles = await prisma.fileAsset.findMany({
    where: { id: { in: [...new Set(fileIds)] }, organizationId },
    select: { id: true, storageKey: true },
  });
  await prisma.notification.deleteMany({
    where: { organizationId, projectId: project.id },
  });
  await prisma.comment.deleteMany({
    where: { organizationId, OR: entityScopes },
  });
  await prisma.activity.deleteMany({
    where: { organizationId, OR: entityScopes },
  });
  await prisma.auditLog.deleteMany({
    where: { organizationId, OR: entityScopes },
  });
  await prisma.projectStageApproval.deleteMany({
    where: { projectId: project.id },
  });
  await prisma.entityAttachment.deleteMany({
    where: {
      id: { in: attachments.map(({ id }) => id) },
      projectId: project.id,
    },
  });
  await prisma.uploadSession.deleteMany({
    where: {
      id: { in: uploadSessions.map(({ id }) => id) },
      organizationId,
      projectId: project.id,
    },
  });
  await prisma.projectStageOneDocumentVersion.deleteMany({
    where: { documentId: { in: stageOneDocuments.map(({ id }) => id) } },
  });
  await prisma.projectStageOneDocument.deleteMany({
    where: {
      id: { in: stageOneDocuments.map(({ id }) => id) },
      projectId: project.id,
    },
  });
  await prisma.projectRequiredDocumentVersion.deleteMany({
    where: { requirementId: { in: definitions.map(({ id }) => id) } },
  });
  await prisma.projectRequiredDocument.deleteMany({
    where: { organizationId, projectId: project.id },
  });
  await prisma.keyDossierReferenceMilestone.deleteMany({
    where: { organizationId, projectId: project.id },
  });
  await prisma.projectStageStep.deleteMany({
    where: { projectId: project.id },
  });
  await prisma.projectStageState.deleteMany({
    where: { projectId: project.id },
  });
  await prisma.projectStageOnePlan.deleteMany({
    where: { projectId: project.id },
  });
  await prisma.projectMember.deleteMany({
    where: { organizationId, projectId: project.id },
  });
  await prisma.project.delete({
    where: { id: project.id, organizationId },
  });
  await deleteFixtureFileAssets(
    () =>
      prisma.fileAsset.deleteMany({
        where: { id: { in: ownedFiles.map(({ id }) => id) }, organizationId },
      }),
    `${isolated.testRoot}/files`,
    ownedFiles.map(({ storageKey }) => storageKey),
  );
}

async function cleanup() {
  const organization = await prisma.organization.findUnique({
    where: { slug: 'galaxy-centre' },
  });
  if (!organization) return;
  await cleanupCreatedProject(organization.id);
  const [
    documents,
    stageOneDocuments,
    surveys,
    attachments,
    uploadSessions,
    approvals,
  ] = await Promise.all([
    prisma.projectRequiredDocument.findMany({
      where: {
        organizationId: organization.id,
        projectId: ids.project,
      },
      select: {
        id: true,
        currentFileAssetId: true,
        versions: { select: { fileAssetId: true } },
      },
    }),
    prisma.projectStageOneDocument.findMany({
      where: { projectId: ids.project },
      select: {
        id: true,
        currentFileAssetId: true,
        versions: { select: { fileAssetId: true } },
      },
    }),
    prisma.survey.findMany({
      where: { organizationId: organization.id, projectId: ids.project },
      select: { id: true },
    }),
    prisma.entityAttachment.findMany({
      where: { projectId: ids.project },
      select: { id: true, fileAssetId: true },
    }),
    prisma.uploadSession.findMany({
      where: { organizationId: organization.id, projectId: ids.project },
      select: { id: true, fileAssetId: true },
    }),
    prisma.projectStageApproval.findMany({
      where: { projectId: ids.project },
      select: { id: true },
    }),
  ]);
  const documentIds = documents.map(({ id }) => id);
  const stageOneDocumentIds = stageOneDocuments.map(({ id }) => id);
  const surveyIds = surveys.map(({ id }) => id);
  const approvalIds = approvals.map(({ id }) => id);
  const [risks, estimates] = await Promise.all([
    prisma.projectRisk.findMany({
      where: { organizationId: organization.id, projectId: ids.project },
      select: { id: true, allocations: { select: { id: true } } },
    }),
    prisma.estimate.findMany({
      where: { organizationId: organization.id, projectId: ids.project },
      select: { id: true, versions: { select: { id: true } } },
    }),
  ]);
  const riskIds = risks.map(({ id }) => id);
  const allocationIds = risks.flatMap(({ allocations }) =>
    allocations.map(({ id }) => id),
  );
  const estimateIds = estimates.map(({ id }) => id);
  const estimateVersionIds = estimates.flatMap(({ versions }) =>
    versions.map(({ id }) => id),
  );
  const fixtureEntityScopes = [
    { entityType: 'Project', entityId: ids.project },
    { entityType: 'Project', entityId: ids.stageFourProject },
    {
      entityType: 'ProjectRequiredDocument',
      entityId: { in: documentIds },
    },
    {
      entityType: 'ProjectStageOneDocument',
      entityId: { in: stageOneDocumentIds },
    },
    { entityType: 'Survey', entityId: { in: surveyIds } },
    { entityType: 'ProjectStageApproval', entityId: { in: approvalIds } },
    { entityType: 'ProjectRisk', entityId: { in: riskIds } },
    { entityType: 'EstimateRiskAllocation', entityId: { in: allocationIds } },
    { entityType: 'Estimate', entityId: { in: estimateIds } },
  ];
  const fileIds = [
    ...attachments.map(({ fileAssetId }) => fileAssetId),
    ...documents.flatMap(({ currentFileAssetId, versions }) => [
      ...(currentFileAssetId ? [currentFileAssetId] : []),
      ...versions.flatMap(({ fileAssetId }) => fileAssetId ?? []),
    ]),
    ...stageOneDocuments.flatMap(({ currentFileAssetId, versions }) => [
      ...(currentFileAssetId ? [currentFileAssetId] : []),
      ...versions.map(({ fileAssetId }) => fileAssetId),
    ]),
    ...uploadSessions.flatMap(({ fileAssetId }) => fileAssetId ?? []),
  ];
  const ownedFiles = await prisma.fileAsset.findMany({
    where: {
      id: { in: [...new Set(fileIds)] },
      organizationId: organization.id,
    },
    select: { id: true, storageKey: true },
  });
  await prisma.notification.deleteMany({
    where: {
      organizationId: organization.id,
      OR: [{ projectId: ids.project }, ...fixtureEntityScopes],
    },
  });
  await prisma.comment.deleteMany({
    where: {
      organizationId: organization.id,
      OR: fixtureEntityScopes,
    },
  });
  await prisma.activity.deleteMany({
    where: {
      organizationId: organization.id,
      OR: fixtureEntityScopes,
    },
  });
  await prisma.auditLog.deleteMany({
    where: {
      organizationId: organization.id,
      OR: fixtureEntityScopes,
    },
  });
  const remainingFixtureAuditLogs = await prisma.auditLog.count({
    where: {
      organizationId: organization.id,
      OR: fixtureEntityScopes,
    },
  });
  if (remainingFixtureAuditLogs)
    throw new Error('Stage 1 fixture AuditLog cleanup was incomplete');
  await prisma.estimateRiskAllocation.deleteMany({
    where: {
      OR: [
        { id: { in: allocationIds } },
        { estimateVersionId: { in: estimateVersionIds } },
      ],
    },
  });
  await prisma.projectRisk.deleteMany({
    where: {
      id: { in: riskIds },
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.estimateApproval.deleteMany({
    where: { estimateVersionId: { in: estimateVersionIds } },
  });
  await prisma.estimateLineItem.deleteMany({
    where: { estimateVersionId: { in: estimateVersionIds } },
  });
  await prisma.estimateVersion.deleteMany({
    where: { id: { in: estimateVersionIds }, estimateId: { in: estimateIds } },
  });
  await prisma.estimate.deleteMany({
    where: {
      id: { in: estimateIds },
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.serviceTicket.deleteMany({
    where: {
      id: ids.serviceTicket,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.paymentAllocation.deleteMany({
    where: { paymentId: ids.customerPayment },
  });
  await prisma.customerPayment.deleteMany({
    where: {
      id: ids.customerPayment,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.customerPaymentSchedule.deleteMany({
    where: {
      id: ids.customerPaymentSchedule,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.supplierPayable.deleteMany({
    where: {
      id: ids.supplierPayable,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.proformaInvoiceLine.deleteMany({
    where: { id: ids.proformaInvoiceLine },
  });
  await prisma.proformaInvoice.deleteMany({
    where: { id: ids.proformaInvoice, organizationId: organization.id },
  });
  await prisma.purchaseOrderLine.deleteMany({
    where: { id: ids.purchaseOrderLine },
  });
  await prisma.purchaseOrder.deleteMany({
    where: {
      id: ids.purchaseOrder,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.supplierSelection.deleteMany({ where: { id: ids.selection } });
  await prisma.supplierComparisonLine.deleteMany({
    where: { id: ids.comparisonLine },
  });
  await prisma.supplierComparison.deleteMany({
    where: {
      id: ids.comparison,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.supplierQuotationLine.deleteMany({
    where: { id: ids.supplierQuotationLine },
  });
  await prisma.supplierQuotation.deleteMany({
    where: { id: ids.supplierQuotation, organizationId: organization.id },
  });
  await prisma.supplierRFQLine.deleteMany({ where: { id: ids.rfqLine } });
  await prisma.supplierRFQ.deleteMany({
    where: {
      id: ids.rfq,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.purchaseRequestLine.deleteMany({
    where: { id: ids.purchaseRequestLine },
  });
  await prisma.purchaseRequest.deleteMany({
    where: {
      id: ids.purchaseRequest,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.contract.deleteMany({
    where: {
      id: ids.contract,
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.supplier.deleteMany({
    where: { id: ids.supplier, organizationId: organization.id },
  });
  await prisma.entityAttachment.deleteMany({
    where: {
      id: { in: attachments.map(({ id }) => id) },
      projectId: ids.project,
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
    where: { documentId: { in: stageOneDocumentIds } },
  });
  await prisma.projectStageOneDocument.deleteMany({
    where: {
      id: { in: stageOneDocumentIds },
      projectId: ids.project,
    },
  });
  await prisma.projectRequiredDocumentVersion.deleteMany({
    where: { requirementId: { in: documentIds } },
  });
  await prisma.projectRequiredDocument.deleteMany({
    where: {
      id: { in: documentIds },
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.keyDossierReferenceMilestone.deleteMany({
    where: { organizationId: organization.id, projectId: ids.project },
  });
  await prisma.requirement.deleteMany({
    where: { organizationId: organization.id, projectId: ids.project },
  });
  await prisma.survey.deleteMany({
    where: {
      id: { in: surveyIds },
      organizationId: organization.id,
      projectId: ids.project,
    },
  });
  await prisma.projectStageApproval.deleteMany({
    where: { id: { in: approvalIds }, projectId: ids.project },
  });
  await prisma.projectStageStep.deleteMany({
    where: { projectId: ids.project },
  });
  await prisma.projectStageState.deleteMany({
    where: { projectId: ids.project },
  });
  await prisma.projectStageState.deleteMany({
    where: { projectId: ids.stageFourProject },
  });
  await prisma.projectStageOnePlan.deleteMany({
    where: { projectId: ids.project },
  });
  await prisma.projectDepartment.deleteMany({
    where: { organizationId: organization.id, projectId: ids.project },
  });
  await prisma.projectMember.deleteMany({
    where: { organizationId: organization.id, projectId: ids.project },
  });
  await prisma.projectMember.deleteMany({
    where: {
      organizationId: organization.id,
      projectId: ids.stageFourProject,
    },
  });
  await prisma.projectLocation.deleteMany({
    where: { projectId: ids.project },
  });
  await prisma.project.deleteMany({
    where: { id: ids.project, organizationId: organization.id },
  });
  await prisma.project.deleteMany({
    where: { id: ids.stageFourProject, organizationId: organization.id },
  });
  await prisma.customer.deleteMany({
    where: {
      id: ids.customer,
      organizationId: organization.id,
    },
  });
  await prisma.department.deleteMany({
    where: {
      id: ids.department,
      organizationId: organization.id,
    },
  });
  await deleteFixtureFileAssets(
    () =>
      prisma.fileAsset.deleteMany({
        where: {
          id: { in: ownedFiles.map(({ id }) => id) },
          organizationId: organization.id,
        },
      }),
    `${isolated.testRoot}/files`,
    ownedFiles.map(({ storageKey }) => storageKey),
  );
  await prisma.session.deleteMany({ where: { userId: { in: users } } });
  await prisma.passwordCredential.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.userRole.deleteMany({
    where: { organizationId: organization.id, userId: { in: users } },
  });
  const roles = await prisma.role.findMany({
    where: {
      organizationId: organization.id,
      code: { in: roleCodes },
    },
    select: { id: true },
  });
  await prisma.rolePermission.deleteMany({
    where: { roleId: { in: roles.map(({ id }) => id) } },
  });
  await prisma.role.deleteMany({
    where: {
      id: { in: roles.map(({ id }) => id) },
      organizationId: organization.id,
    },
  });
  await prisma.organizationMembership.deleteMany({
    where: { organizationId: organization.id, userId: { in: users } },
  });
}

async function setup() {
  await cleanup();
  const [organization, admin] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { slug: 'galaxy-centre' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'admin@galaxy.local' } }),
  ]);
  const passwordHash = await bcrypt.hash('Playwright-password-1', 4);
  for (const [id, email, displayName] of [
    [ids.pm, 'playwright.stage-one.pm@example.test', 'Zed Stage One PM'],
    [
      ids.approver,
      'playwright.stage-one.approver@example.test',
      'Aardvark Stage One Approver',
    ],
    [
      ids.outsider,
      'playwright.stage-one.outsider@example.test',
      'Stage One Outsider',
    ],
    [
      ids.uploader,
      'playwright.stage-one.uploader@example.test',
      'Stage One Uploader',
    ],
  ]) {
    await prisma.user.upsert({
      where: { id },
      create: {
        id,
        email,
        normalizedEmail: email,
        displayName,
        status: 'active',
      },
      update: {
        email,
        normalizedEmail: email,
        displayName,
        avatarKey: null,
        status: 'active',
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: organization.id, userId: id },
    });
    await prisma.passwordCredential.create({
      data: { userId: id, passwordHash, mustChangePassword: false },
    });
  }
  const managerRole = await prisma.role.create({
    data: {
      id: ids.managerRole,
      organizationId: organization.id,
      code: roleCodes[0],
      name: 'Playwright Stage manager',
      maximumScope: 'SELF',
    },
  });
  const managerPermissions = await prisma.permission.findMany({
    select: { id: true },
  });
  await prisma.rolePermission.createMany({
    data: managerPermissions.map(({ id: permissionId }) => ({
      roleId: managerRole.id,
      permissionId,
    })),
  });
  for (const userId of [ids.pm, ids.approver])
    await prisma.userRole.create({
      data: {
        organizationId: organization.id,
        userId,
        roleId: managerRole.id,
        scopeType: 'SELF',
      },
    });
  const [customer, department] = await Promise.all([
    prisma.customer.create({
      data: {
        id: ids.customer,
        organizationId: organization.id,
        type: 'COMPANY',
        displayName: 'Khách hàng Playwright',
        legalName: 'Khách hàng Playwright',
        status: 'ACTIVE',
        createdBy: admin.id,
        updatedBy: admin.id,
      },
    }),
    prisma.department.create({
      data: {
        id: ids.department,
        organizationId: organization.id,
        code: 'PW-STAGE-TWO-PLAN',
        name: 'Ban Kế hoạch Playwright',
        description: 'Fixture-owned Stage 2 planning department.',
        displayOrder: 999,
      },
    }),
  ]);
  const outsiderRole = await prisma.role.create({
    data: {
      organizationId: organization.id,
      code: roleCodes[1],
      name: 'Playwright Stage 1 outsider',
      maximumScope: 'SELF',
    },
  });
  const outsiderPermissions = await prisma.permission.findMany({
    where: {
      code: {
        in: [
          'project.read',
          'file.read',
          'file.download',
          'comment.read',
          'activity.read',
        ],
      },
    },
  });
  await prisma.rolePermission.createMany({
    data: outsiderPermissions.map(({ id: permissionId }) => ({
      roleId: outsiderRole.id,
      permissionId,
    })),
  });
  await prisma.userRole.create({
    data: {
      organizationId: organization.id,
      userId: ids.outsider,
      roleId: outsiderRole.id,
      scopeType: 'SELF',
    },
  });
  const uploaderRole = await prisma.role.create({
    data: {
      organizationId: organization.id,
      code: roleCodes[2],
      name: 'Playwright Stage 1 uploader',
      maximumScope: 'SELF',
    },
  });
  const uploaderPermissions = await prisma.permission.findMany({
    where: {
      code: {
        in: [
          'project.read',
          'estimate.read',
          'file.read',
          'file.download',
          'file.upload',
          'project.document.manage',
        ],
      },
    },
  });
  await prisma.rolePermission.createMany({
    data: uploaderPermissions.map(({ id: permissionId }) => ({
      roleId: uploaderRole.id,
      permissionId,
    })),
  });
  await prisma.userRole.create({
    data: {
      organizationId: organization.id,
      userId: ids.uploader,
      roleId: uploaderRole.id,
      scopeType: 'SELF',
    },
  });
  await prisma.project.create({
    data: {
      id: ids.project,
      organizationId: organization.id,
      customerId: customer.id,
      code: 'PW-STAGE-ONE',
      name: 'Playwright Stage One Acceptance',
      projectType: 'DESIGN_AND_BUILD',
      phase: 'SURVEY',
      status: 'ACTIVE',
      description: 'Fixture scope for the real Stage 1 acceptance flow.',
      projectOwnerId: ids.pm,
      projectManagerId: ids.pm,
      startDate: new Date('2026-08-01'),
      expectedCompletionDate: new Date('2026-12-31'),
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });
  await prisma.project.create({
    data: {
      id: ids.stageFourProject,
      organizationId: organization.id,
      customerId: customer.id,
      code: 'PW-STAGE-FOUR',
      name: 'Playwright Stage Four Entry',
      projectType: 'DESIGN_AND_BUILD',
      entryStage: 'STAGE_FOUR',
      phase: 'PRODUCTION',
      status: 'ACTIVE',
      description: 'Fixture for reverse Project stage navigation.',
      projectOwnerId: ids.pm,
      projectManagerId: ids.pm,
      startDate: new Date('2026-08-01'),
      expectedCompletionDate: new Date('2026-12-31'),
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });
  await prisma.projectMember.createMany({
    data: [
      ...[ids.pm, ids.approver, ids.uploader].map((userId) => ({
        organizationId: organization.id,
        projectId: ids.project,
        userId,
        createdBy: admin.id,
      })),
      {
        organizationId: organization.id,
        projectId: ids.stageFourProject,
        userId: ids.pm,
        createdBy: admin.id,
      },
    ],
  });
  await prisma.projectRequiredDocument.createMany({
    data: requiredDocuments.map(
      ([id, workstreamKey, documentType, documentName]) => ({
        id,
        organizationId: organization.id,
        projectId: ids.project,
        stageKey: 'STAGE_1',
        workstreamKey,
        documentType,
        documentName,
        ownerUserId: ids.pm,
        ownerRole: 'PROJECT_MANAGER',
      }),
    ),
  });
  await prisma.projectRequiredDocument.createMany({
    data: initialMatrixDocuments.map(([id, , name], position) => ({
      id,
      organizationId: organization.id,
      projectId: ids.project,
      stageKey: 'STAGE_1',
      workstreamKey: 'KEY_DOSSIER',
      documentType: name,
      documentName: name,
      normalizedName: name.toLocaleLowerCase('vi'),
      required: false,
      position,
      initialMatrix: true,
      ownerRole: 'PROJECT_MANAGER',
    })),
  });
  await prisma.projectStageState.createMany({
    data: [
      ['STAGE_ONE', 'NOT_INITIALIZED'],
      ['STAGE_TWO', 'NOT_INITIALIZED'],
      ['STAGE_THREE', 'NOT_INITIALIZED'],
      ['STAGE_FOUR', 'IN_PROGRESS'],
      ['STAGE_FIVE', 'NOT_INITIALIZED'],
    ].map(([stage, status]) => ({
      projectId: ids.stageFourProject,
      stage,
      status,
    })),
  });
  await prisma.projectDepartment.create({
    data: {
      organizationId: organization.id,
      projectId: ids.project,
      departmentId: department.id,
      createdBy: admin.id,
    },
  });
  await prisma.projectLocation.create({
    data: {
      id: ids.location,
      projectId: ids.project,
      type: 'ROOM',
      code: 'PW-STAGE-ONE-ROOM',
      name: 'Playwright Stage One Room',
    },
  });
  await prisma.contract.create({
    data: {
      id: ids.contract,
      organizationId: organization.id,
      projectId: ids.project,
      customerId: customer.id,
      contractNumber: 'PW-STAGE-ONE-CONTRACT',
      sellerLegalEntity: 'Galaxy Centre',
      buyerLegalEntity: customer.displayName,
      signedDate: new Date('2026-08-01'),
      effectiveDate: new Date('2026-08-01'),
      originalValue: 1250000,
      currentValue: 1250000,
      currency: 'VND',
      status: 'ACTIVE',
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });
  await prisma.customerPaymentSchedule.create({
    data: {
      id: ids.customerPaymentSchedule,
      organizationId: organization.id,
      projectId: ids.project,
      contractId: ids.contract,
      milestoneName: 'Stage One receipt',
      sequence: 1,
      dueDate: new Date('2026-09-01'),
      amount: 1000000,
      currency: 'VND',
      paidAmount: 250000,
      outstandingAmount: 750000,
      status: 'PARTIALLY_PAID',
      createdBy: admin.id,
    },
  });
  await prisma.customerPayment.create({
    data: {
      id: ids.customerPayment,
      organizationId: organization.id,
      projectId: ids.project,
      paymentDate: new Date('2026-08-02'),
      amount: 250000,
      currency: 'VND',
      paymentMethod: 'BANK_TRANSFER',
      receiptNumber: 'PW-STAGE-ONE-RECEIPT',
      recordedBy: admin.id,
      idempotencyKey: 'pw-stage-one-receipt-1',
      allocations: {
        create: {
          scheduleId: ids.customerPaymentSchedule,
          amount: 250000,
        },
      },
    },
  });
  await prisma.serviceTicket.create({
    data: {
      id: ids.serviceTicket,
      organizationId: organization.id,
      ticketNumber: 'PW-STAGE-ONE-TICKET',
      customerId: customer.id,
      projectId: ids.project,
      issueCategory: 'INSTALLATION',
      priority: 'HIGH',
      reportedAt: new Date('2026-08-02'),
      description: 'Deterministic Stage One service follow-up.',
      slaDueAt: new Date('2026-08-02T18:00:00.000Z'),
      status: 'OPEN',
      createdBy: admin.id,
    },
  });
  await prisma.supplier.create({
    data: {
      id: ids.supplier,
      organizationId: organization.id,
      legalName: 'Playwright Stage One Supplier',
      country: 'VN',
      languages: ['vi'],
      currency: 'VND',
    },
  });
  await prisma.purchaseRequest.create({
    data: {
      id: ids.purchaseRequest,
      organizationId: organization.id,
      projectId: ids.project,
      requestNumber: 'PW-STAGE-ONE-PR',
      sourceType: 'PROJECT_REQUIREMENT',
      requestedById: ids.pm,
      departmentId: department.id,
      status: 'APPROVED',
      createdBy: admin.id,
      updatedBy: admin.id,
      lines: {
        create: {
          id: ids.purchaseRequestLine,
          customDescription: 'Stage One fixture item',
          quantity: 1,
          unit: 'set',
          preferredSupplierId: ids.supplier,
          currency: 'VND',
          position: 0,
        },
      },
    },
  });
  await prisma.supplierRFQ.create({
    data: {
      id: ids.rfq,
      organizationId: organization.id,
      rfqNumber: 'PW-STAGE-ONE-RFQ',
      purchaseRequestId: ids.purchaseRequest,
      projectId: ids.project,
      responseDeadline: new Date('2026-08-15'),
      requestedCurrency: 'VND',
      deliveryDestination: 'Stage One fixture room',
      status: 'SENT',
      createdBy: admin.id,
      updatedBy: admin.id,
      lines: {
        create: {
          id: ids.rfqLine,
          purchaseRequestLineId: ids.purchaseRequestLine,
          customDescription: 'Stage One fixture item',
          quantity: 1,
          unit: 'set',
          position: 0,
        },
      },
    },
  });
  await prisma.supplierQuotation.create({
    data: {
      id: ids.supplierQuotation,
      organizationId: organization.id,
      rfqId: ids.rfq,
      supplierId: ids.supplier,
      quotationNumber: 'PW-STAGE-ONE-SQ',
      quotationDate: new Date('2026-08-03'),
      currency: 'VND',
      totalAmount: 800000,
      status: 'ACCEPTED',
      createdBy: admin.id,
      updatedBy: admin.id,
      lines: {
        create: {
          id: ids.supplierQuotationLine,
          rfqLineId: ids.rfqLine,
          description: 'Stage One fixture item',
          quantity: 1,
          unit: 'set',
          listPrice: 800000,
          netUnitPrice: 800000,
          netTotal: 800000,
          position: 0,
        },
      },
    },
  });
  await prisma.supplierComparison.create({
    data: {
      id: ids.comparison,
      organizationId: organization.id,
      projectId: ids.project,
      rfqId: ids.rfq,
      purchaseRequestId: ids.purchaseRequest,
      exchangeRateDate: new Date('2026-08-03'),
      status: 'APPROVED',
      createdBy: admin.id,
      updatedBy: admin.id,
      lines: {
        create: {
          id: ids.comparisonLine,
          supplierQuotationId: ids.supplierQuotation,
          supplierQuotationLineId: ids.supplierQuotationLine,
          rfqLineId: ids.rfqLine,
          supplierId: ids.supplier,
          originalCurrency: 'VND',
          exchangeRateSnapshot: 1,
          netProductValue: 800000,
          landedEstimateBase: 800000,
          technicalCompliance: 'PASS',
        },
      },
    },
  });
  await prisma.supplierSelection.create({
    data: {
      id: ids.selection,
      comparisonId: ids.comparison,
      supplierQuotationId: ids.supplierQuotation,
      supplierId: ids.supplier,
      selectedLines: [ids.supplierQuotationLine],
      selectionReason: 'Lowest valid deterministic fixture quotation.',
      selectedBy: admin.id,
      approvedBy: admin.id,
      approvedAt: new Date('2026-08-04'),
      status: 'APPROVED',
      idempotencyKey: 'pw-stage-one-selection-1',
    },
  });
  await prisma.purchaseOrder.create({
    data: {
      id: ids.purchaseOrder,
      organizationId: organization.id,
      projectId: ids.project,
      poNumber: 'PW-STAGE-ONE-PO',
      supplierId: ids.supplier,
      supplierSelectionId: ids.selection,
      supplierQuotationId: ids.supplierQuotation,
      purchaseRequestId: ids.purchaseRequest,
      currency: 'VND',
      deliveryAddress: 'Stage One fixture room',
      subtotal: 800000,
      totalAmount: 800000,
      status: 'ISSUED',
      createdBy: admin.id,
      updatedBy: admin.id,
      lines: {
        create: {
          id: ids.purchaseOrderLine,
          purchaseRequestLineId: ids.purchaseRequestLine,
          quantity: 1,
          unit: 'set',
          unitPrice: 800000,
          netUnitPrice: 800000,
          lineTotal: 800000,
          position: 0,
        },
      },
    },
  });
  await prisma.proformaInvoice.create({
    data: {
      id: ids.proformaInvoice,
      organizationId: organization.id,
      piNumber: 'PW-STAGE-ONE-PI',
      supplierId: ids.supplier,
      purchaseOrderId: ids.purchaseOrder,
      piDate: new Date('2026-08-05'),
      currency: 'VND',
      exchangeRateSnapshot: 1,
      subtotal: 800000,
      totalAmount: 800000,
      status: 'APPROVED',
      createdBy: admin.id,
      updatedBy: admin.id,
      lines: {
        create: {
          id: ids.proformaInvoiceLine,
          purchaseOrderLineId: ids.purchaseOrderLine,
          description: 'Stage One fixture item',
          quantity: 1,
          unit: 'set',
          unitPrice: 800000,
          lineTotal: 800000,
          position: 0,
        },
      },
    },
  });
  await prisma.supplierPayable.create({
    data: {
      id: ids.supplierPayable,
      organizationId: organization.id,
      projectId: ids.project,
      supplierId: ids.supplier,
      purchaseOrderId: ids.purchaseOrder,
      proformaInvoiceId: ids.proformaInvoice,
      amount: 800000,
      outstandingAmount: 800000,
      currency: 'VND',
      status: 'OPEN',
      createdBy: admin.id,
    },
  });
}

try {
  if (process.argv[2] === 'cleanup') await cleanup();
  else await setup();
} finally {
  await prisma.$disconnect();
}
