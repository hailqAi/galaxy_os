import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { findProjectFile, hiddenProjectFileIds } from '../files/project-file';
import { PrismaService } from '../prisma.service';
import type { ProjectStageDocumentTargetDto } from '../uploads/uploads.dto';
import type {
  DecideStageOneApprovalDto,
  DeleteKeyDossierMilestoneDto,
  KeyDossierMilestoneDto,
  ProjectDocumentDefinitionDto,
  SimpleInitiationDto,
  SubmitStageOneApprovalDto,
  UpdateStageOneGovernanceDto,
  UpdateStageOnePlanDto,
} from './project-stage-one.dto';
import { ProjectApproverResolver } from './project-approver-resolver.service';
import {
  SIMPLE_STAGE_ONE_STEPS,
  deriveStageOneReadiness,
  deriveStageOneRedFlags,
  deriveStageOneGovernanceChecks,
  hasProposalLocation,
  isProjectType,
  isStageOneFinancialDocument,
  projectDocumentContext,
  requiredDocumentHardBlocked,
  requiredDocumentSatisfied,
  routeProject,
  stageOneDocumentDisplayName,
  visibleStageOneDocumentWhere,
  type StageOneDocumentType,
  type StageOneFundingSource,
  type StageOneStep,
  type ProjectDocumentContext,
} from './project-stage-one.rules';

const permissions = {
  estimatedValue: 'estimate.read',
  contractedValue: 'contract.read',
  stageOneFinanceRead: 'project.stage1.finance.read',
  stageOneFinanceManage: 'project.stage1.finance.manage',
  stageOneSubmit: 'project.stage1.submit',
  stageOneReview: 'project.stage1.review',
  stageOneCompleteGate: 'project.stage1.complete_gate',
  surveyNotApplicable: 'project.survey.not_applicable',
} as const;

export const canReadProjectFileMetadata = (actor: CurrentActor) =>
  actor.permissions.includes('file.read') ||
  actor.permissions.includes('file.download');

export const documentCapabilities = (actor: CurrentActor) => {
  const can = (permission: string) => actor.permissions.includes(permission);
  const canUploadDocuments =
    can('file.upload') && can('project.document.manage');
  const canUploadKeyDossierAttachments =
    can('file.upload') && can('project.key_dossier.manage');
  return {
    canSwitchProject: can('project.read'),
    canManageProjectAccess: can('project.manage_members'),
    canReadDocuments: can('project.read'),
    canUploadDocuments,
    canSubmitDocuments: canUploadDocuments,
    canManageDocumentTypes: can('project.document.manage'),
    canCompleteStep: can('project.update'),
    canReopenStep: can('project.update'),
    canPreviewFiles: can('file.read') && can('file.download'),
    canDownloadFiles: can('file.download'),
    canDeleteProjectDocuments: can('file.delete'),
    canDeleteProject: can('project.delete'),
    canManageKeyDossier: can('project.key_dossier.manage'),
    canDeleteKeyDossierItem: can('project.key_dossier.item.delete'),
    canDeleteAttachment: can('file.delete'),
    canUploadWorkflowDocuments: canUploadDocuments,
    canUploadKeyDossierAttachments,
    canReadFinance: can('estimate.read'),
    canManageFinance: can('estimate.read') && can('estimate.update'),
  };
};

const stageOneSteps: readonly StageOneStep[] = [
  'ASSIGNMENT',
  'SURVEY',
  'PROPOSAL',
  'FINANCIAL_PLANNING',
  'KICKOFF_APPROVAL',
];
const initialDocumentMatrix = [
  {
    name: 'Văn bản chủ trương / Quyết định giao nhiệm vụ',
  },
  {
    name: 'Báo cáo khảo sát & Phương án nhân sự',
  },
  {
    name: 'Hồ sơ Báo cáo Kinh tế - Kỹ thuật',
  },
  {
    name: 'Văn bản xác nhận / Cân đối nguồn vốn',
  },
  {
    name: 'Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật',
  },
] as const;
const stageOneDefinitionDefaults = [
  ...initialDocumentMatrix.map((definition, position) => ({
    ...definition,
    workstreamKey: 'KEY_DOSSIER',
    position,
    initialMatrix: true,
  })),
  ...SIMPLE_STAGE_ONE_STEPS.flatMap(({ step, documents }) =>
    documents.map((name, position) => ({
      name,
      workstreamKey: step,
      position,
      initialMatrix: false,
    })),
  ),
];
const normalizeDocumentName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const visibleDefinitionName = (name: string, initialMatrix: boolean) =>
  initialMatrix ? name : stageOneDocumentDisplayName(name);

export async function initializeNewProjectStageOne(
  tx: Prisma.TransactionClient,
  actor: CurrentActor,
  projectId: string,
  fundingSource?: StageOneFundingSource,
) {
  await tx.projectStageStep.createMany({
    data: stageOneSteps.map((step) => ({
      projectId,
      stage: 'STAGE_ONE',
      step,
      status: 'TODO',
    })),
  });
  await tx.projectStageOnePlan.create({
    data: { projectId, fundingSource },
  });
  await tx.projectRequiredDocument.createMany({
    data: stageOneDefinitionDefaults.map((definition) => ({
      organizationId: actor.organizationId,
      projectId,
      stageKey: 'STAGE_1',
      workstreamKey: definition.workstreamKey,
      documentType: definition.name,
      documentName: definition.name,
      required: false,
      position: definition.position,
      initialMatrix: definition.initialMatrix,
      normalizedName: normalizeDocumentName(definition.name),
      status: 'MISSING',
      ownerRole: 'PROJECT_MANAGER',
    })),
  });
  await tx.projectStageState.update({
    where: { projectId_stage: { projectId, stage: 'STAGE_ONE' } },
    data: { documentDefinitionsInitializedAt: new Date() },
  });
}
const routingNotApplicable = 'ROUTING_NOT_APPLICABLE';
const activeSimpleDocumentStatuses = new Set([
  'DRAFT',
  'UPLOADED',
  'PENDING_REVIEW',
  'UNDER_REVIEW',
  'APPROVED',
]);
const metadataRecord = (metadata: Prisma.JsonValue | null | undefined) =>
  metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata
    : {};
const approvalDecisionLabels = {
  APPROVED: 'Phê duyệt',
  APPROVED_WITH_COMMENTS: 'Phê duyệt kèm ý kiến',
  REVISION_REQUIRED: 'Yêu cầu chỉnh sửa',
  REJECTED: 'Từ chối',
} as const;

type StageOneBlocker = {
  code: string;
  title: string;
  entityType: string;
  entityId: string;
  route: string;
  remediation: string;
};

const documentDefaults: Record<
  StageOneDocumentType,
  { workstreamKey: string; documentName: string; ownerRole: string }
> = {
  PROJECT_DOSSIER: {
    workstreamKey: 'ASSIGNMENT',
    documentName: 'Project dossier',
    ownerRole: 'PROJECT_MANAGER',
  },
  RESPONSIBILITY_MATRIX: {
    workstreamKey: 'ASSIGNMENT',
    documentName: 'Responsibility matrix',
    ownerRole: 'PROJECT_MANAGER',
  },
  SURVEY_REPORT: {
    workstreamKey: 'SURVEY',
    documentName: 'Survey report',
    ownerRole: 'PROJECT_MANAGER',
  },
  SITE_CONSTRAINTS: {
    workstreamKey: 'SURVEY',
    documentName: 'Site constraints',
    ownerRole: 'PROJECT_MANAGER',
  },
  SCOPE_STATEMENT: {
    workstreamKey: 'PROPOSAL',
    documentName: 'Scope statement',
    ownerRole: 'PROJECT_MANAGER',
  },
  PROPOSAL: {
    workstreamKey: 'PROPOSAL',
    documentName: 'Proposal',
    ownerRole: 'PROJECT_MANAGER',
  },
  PROPOSAL_MILESTONES: {
    workstreamKey: 'PROPOSAL',
    documentName: 'Proposal milestones',
    ownerRole: 'PROJECT_MANAGER',
  },
  PROPOSAL_WBS: {
    workstreamKey: 'PROPOSAL',
    documentName: 'Proposal WBS',
    ownerRole: 'PROJECT_MANAGER',
  },
  RISK_REGISTER: {
    workstreamKey: 'PROPOSAL',
    documentName: 'Risk register',
    ownerRole: 'PROJECT_MANAGER',
  },
  RESOURCE_PLAN: {
    workstreamKey: 'PROPOSAL',
    documentName: 'Resource plan',
    ownerRole: 'PROJECT_MANAGER',
  },
  PRELIMINARY_FINANCIAL_PLAN: {
    workstreamKey: 'FINANCIAL_PLANNING',
    documentName: 'Preliminary financial plan',
    ownerRole: 'PROJECT_MANAGER',
  },
  KICKOFF_APPROVAL: {
    workstreamKey: 'KICKOFF_APPROVAL',
    documentName: 'Kickoff approval',
    ownerRole: 'PROJECT_MANAGER',
  },
};

const planSelect = (actor: CurrentActor) => {
  const finance = actor.permissions.includes(permissions.stageOneFinanceRead);
  return {
    projectId: true,
    source: true,
    legalEntityText: true,
    scopeFlags: true,
    scopeNotes: true,
    plannedSurveyAt: true,
    plannedProposalAt: true,
    plannedKickoffAt: true,
    responsibilityNotes: true,
    governanceCoordinatorUserIds: true,
    siteConstraints: true,
    proposalBaseline: true,
    proposalMilestones: true,
    proposalWbs: true,
    riskNotes: true,
    resourceNotes: true,
    createdAt: true,
    updatedAt: true,
    ...(finance && {
      plannedFinancialPlanAt: true,
      preliminaryRevenue: true,
      preliminaryCost: true,
      preliminaryMargin: true,
      preliminaryCurrency: true,
      preliminaryFinancialPlanDate: true,
    }),
  } as const;
};

const projectFinancialSelect = (actor: CurrentActor) =>
  ({
    ...(actor.permissions.includes(permissions.estimatedValue) && {
      estimatedValue: true,
    }),
    ...(actor.permissions.includes(permissions.contractedValue) && {
      contractedValue: true,
    }),
  }) as const;

const stageOneSummarySelect = (actor: CurrentActor) => {
  return {
    id: true,
    code: true,
    name: true,
    customerId: true,
    projectType: true,
    projectManagerId: true,
    projectOwnerId: true,
    description: true,
    expectedCompletionDate: true,
    projectManager: {
      select: {
        status: true,
        organizationMembers: {
          where: { organizationId: actor.organizationId, status: 'active' },
          select: { id: true },
          take: 1,
        },
      },
    },
    locations: { where: { active: true }, select: { id: true }, take: 1 },
    departments: {
      where: { organizationId: actor.organizationId },
      select: { id: true },
      take: 1,
    },
    ...projectFinancialSelect(actor),
    stageOnePlan: { select: planSelect(actor) },
    stageStates: {
      where: { stage: 'STAGE_ONE' },
      select: { status: true },
      take: 1,
    },
    stageSteps: {
      where: { stage: 'STAGE_ONE' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        step: true,
        ownerUserId: true,
        dueDate: true,
        status: true,
        notApplicableReason: true,
        notApplicableAt: true,
        version: true,
        updatedAt: true,
      },
    },
    stageApprovals: {
      where: { stage: 'STAGE_ONE' },
      orderBy: { version: 'desc' },
      take: 1,
      select: {
        id: true,
        version: true,
        status: true,
        decision: true,
        submittedBy: true,
        submittedAt: true,
        reviewedBy: true,
        decidedAt: true,
        comments: true,
        createdAt: true,
      },
    },
    requiredDocuments: {
      where: {
        stageKey: 'STAGE_1',
        required: true,
      },
      select: {
        stageKey: true,
        workstreamKey: true,
        documentType: true,
        status: true,
        ownerRole: true,
        dueDate: true,
        notApplicableReason: true,
        markedBy: true,
        markedAt: true,
        currentFileAssetId: true,
      },
    },
    surveys: {
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 1,
      select: {
        id: true,
        scheduledAt: true,
        surveyedAt: true,
        approvalStatus: true,
        location: true,
        siteCondition: true,
        measurements: true,
        notes: true,
        updatedAt: true,
      },
    },
    requirements: {
      where: { deletedAt: null },
      select: { id: true, status: true, approvalStatus: true, updatedAt: true },
    },
    _count: {
      select: {
        members: {
          where: {
            user: {
              status: 'active',
              organizationMembers: {
                some: {
                  organizationId: actor.organizationId,
                  status: 'active',
                },
              },
            },
          },
        },
        stageApprovals: { where: { stage: 'STAGE_ONE' } },
      },
    },
  } as const;
};

type StageOneSummaryProject = Prisma.ProjectGetPayload<{
  select: ReturnType<typeof stageOneSummarySelect>;
}>;

@Injectable()
export class ProjectStageOneService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BusinessEntityPolicy) private readonly policy: BusinessEntityPolicy,
    @Inject(ProjectApproverResolver)
    private readonly approvers: ProjectApproverResolver,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private require(actor: CurrentActor, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException('Insufficient permission');
  }

  private async requireSubmittedOfficer(
    actor: CurrentActor,
    projectId: string,
    userId: string,
    db: Pick<Prisma.TransactionClient, 'project'>,
  ) {
    if (userId === actor.userId) return;
    if (
      !actor.permissions.includes('project.manage_members') ||
      (actor.permissionSources !== undefined &&
        !(await this.policy.hasProjectPermissions(
          actor,
          projectId,
          'project.manage_members',
          db,
        )))
    )
      throw new ForbiddenException('Insufficient permission');
  }

  private requireFinancialDocument(
    actor: CurrentActor,
    document: {
      stageKey?: string | null;
      workstreamKey?: string | null;
      documentType?: string | null;
    },
    message = 'Không tìm thấy loại hồ sơ trong dự án.',
  ) {
    if (
      isStageOneFinancialDocument(document) &&
      (!actor.permissions.includes('project.stage1.finance.read') ||
        !actor.permissions.includes('project.stage1.finance.manage'))
    )
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message,
      });
  }

  private visibleUploadDocumentWhere(actor: CurrentActor) {
    return visibleStageOneDocumentWhere(
      actor.permissions.includes('project.stage1.finance.read') &&
        actor.permissions.includes('project.stage1.finance.manage'),
    );
  }

  private async requireScopedFinancialDocument(
    actor: CurrentActor,
    projectId: string,
    document: {
      stageKey?: string | null;
      workstreamKey?: string | null;
      documentType?: string | null;
    },
    db?: Pick<Prisma.TransactionClient, 'project'>,
    message = 'Không tìm thấy loại hồ sơ trong dự án.',
  ) {
    this.requireFinancialDocument(actor, document, message);
    if (
      isStageOneFinancialDocument(document) &&
      actor.permissionSources !== undefined &&
      !(await this.policy.hasProjectPermissions(
        actor,
        projectId,
        ['project.stage1.finance.read', 'project.stage1.finance.manage'],
        db,
      ))
    )
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message,
      });
  }

  async createUploadTarget(
    actor: CurrentActor,
    projectId: string,
    input: ProjectStageDocumentTargetDto,
  ) {
    return this.prisma.$transaction((tx) =>
      this.createUploadTargetInTransaction(tx, actor, projectId, input),
    );
  }

  async createUploadTargetInTransaction(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    input: ProjectStageDocumentTargetDto,
  ) {
    this.require(actor, 'file.upload');
    const { definitionId, stageKey, workstreamKey, submittedOfficerId } = input;
    const keyDossier =
      stageKey === 'STAGE_1' && input.contextType === 'STAGE_MATRIX_DOCUMENT';
    const managePermission = keyDossier
      ? 'project.key_dossier.manage'
      : 'project.document.manage';
    if (
      !actor.permissions.includes('project.document.manage') &&
      !actor.permissions.includes('project.key_dossier.manage')
    )
      throw new ForbiddenException('Insufficient permission');
    if (
      !definitionId ||
      !['STAGE_1', 'STAGE_2'].includes(stageKey) ||
      !submittedOfficerId ||
      (!keyDossier &&
        (!workstreamKey?.trim() ||
          (stageKey === 'STAGE_1' &&
            !stageOneSteps.includes(workstreamKey as StageOneStep))))
    )
      throw new UnprocessableEntityException({
        category: 'INVALID_DOCUMENT',
        message: 'Hồ sơ đích không hợp lệ.',
      });
    await this.lockScopedProject(
      tx,
      actor,
      projectId,
      'PROJECT_NOT_FOUND_OR_NOT_VISIBLE',
      ['file.upload', managePermission],
    );
    await this.requireSubmittedOfficer(
      actor,
      projectId,
      submittedOfficerId,
      tx,
    );
    const [officer, definition] = await Promise.all([
      tx.projectMember.findFirst({
        where: {
          organizationId: actor.organizationId,
          projectId,
          userId: submittedOfficerId,
          user: {
            status: 'active',
            organizationMembers: {
              some: {
                organizationId: actor.organizationId,
                status: 'active',
              },
            },
          },
        },
        select: { id: true },
      }),
      tx.projectRequiredDocument.findFirst({
        where: {
          id: definitionId,
          projectId,
          stageKey,
          supersededAt: null,
          ...(keyDossier
            ? { initialMatrix: true, deletedAt: null }
            : { workstreamKey }),
          ...this.visibleUploadDocumentWhere(actor),
        },
        select: {
          id: true,
          stageKey: true,
          workstreamKey: true,
          documentType: true,
          documentName: true,
          initialMatrix: true,
          deletedAt: true,
          referenceMilestoneId: true,
        },
      }),
    ]);
    if (!officer)
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy cán bộ nộp hồ sơ trong dự án.',
      });
    if (!definition)
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy loại hồ sơ trong dự án.',
      });
    if (input.contextType !== projectDocumentContext(definition.initialMatrix))
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy loại hồ sơ trong dự án.',
      });
    await this.requireScopedFinancialDocument(actor, projectId, definition, tx);
    const customName = input.displayName?.trim();
    if (
      (definition.documentName === 'Hồ sơ khác' && !customName) ||
      (definition.documentName !== 'Hồ sơ khác' &&
        input.displayName !== undefined)
    )
      throw new UnprocessableEntityException({
        category: 'INVALID_DOCUMENT',
        message: 'Tên hồ sơ tải lên không hợp lệ.',
      });
    const displayName =
      customName ??
      visibleDefinitionName(definition.documentName, definition.initialMatrix);
    const persistedWorkstreamKey = definition.workstreamKey ?? workstreamKey!;
    if (input.documentId) {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "ProjectStageOneDocument"
          WHERE "id" = ${input.documentId}::uuid
            AND "projectId" = ${projectId}::uuid
          FOR UPDATE
        `);
      if (!locked.length)
        throw new NotFoundException({
          category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ tải lên.',
        });
      const document = await tx.projectStageOneDocument.findFirst({
        where: {
          id: input.documentId,
          projectId,
          requiredDocumentId: definitionId,
          contextType: input.contextType,
          stageKey,
          workstreamKey: persistedWorkstreamKey,
          status: { not: 'SUPERSEDED' },
        },
      });
      if (
        !document ||
        (input.displayName && document.displayName !== displayName)
      )
        throw new NotFoundException({
          category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ tải lên.',
        });
      return document;
    }
    const existing = await tx.projectStageOneDocument.findUnique({
      where: {
        projectId_idempotencyKey: {
          projectId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (
        existing.requiredDocumentId !== definitionId ||
        existing.contextType !== input.contextType ||
        existing.stageKey !== stageKey ||
        existing.workstreamKey !== persistedWorkstreamKey ||
        (input.displayName !== undefined &&
          existing.displayName !== displayName) ||
        existing.submittedOfficerId !== submittedOfficerId ||
        existing.actualActorId !== actor.userId
      )
        throw new ConflictException({
          category: 'IDEMPOTENCY_CONFLICT',
          message: 'Khóa tải tệp đã được dùng cho hồ sơ khác.',
        });
      return existing;
    }
    return tx.projectStageOneDocument.create({
      data: {
        projectId,
        contextType: projectDocumentContext(definition.initialMatrix),
        stageKey,
        workstreamKey: persistedWorkstreamKey,
        step:
          stageKey === 'STAGE_1' && !definition.initialMatrix
            ? (persistedWorkstreamKey as StageOneStep)
            : null,
        documentType: definition.documentType,
        displayName,
        requiredDocumentId: definition.id,
        submittedOfficerId,
        actualActorId: actor.userId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async assertUploadTarget(
    actor: CurrentActor,
    projectId: string,
    documentId: string,
    db: Pick<
      Prisma.TransactionClient,
      'project' | 'projectStageOneDocument'
    > = this.prisma,
  ) {
    this.require(actor, 'file.upload');
    const uploadScopes = [
      this.policy.projectWhere(actor, [
        'file.upload',
        'project.document.manage',
      ]),
      this.policy.projectWhere(actor, [
        'file.upload',
        'project.key_dossier.manage',
      ]),
    ];
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        OR: uploadScopes,
      },
      select: { id: true },
    });
    if (!project)
      throw new NotFoundException({
        category: 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE',
        message: 'Dự án đã bị xóa hoặc không còn khả dụng.',
      });
    const document = await db.projectStageOneDocument.findFirst({
      where: {
        id: documentId,
        projectId,
        status: { not: 'SUPERSEDED' },
        ...this.visibleUploadDocumentWhere(actor),
        project: { OR: uploadScopes },
        submittedOfficer: {
          status: 'active',
          organizationMembers: {
            some: { organizationId: actor.organizationId, status: 'active' },
          },
        },
      },
      include: {
        requiredDocument: {
          select: { supersededAt: true, deletedAt: true, initialMatrix: true },
        },
      },
    });
    if (!document) {
      const inactiveTarget = await db.projectStageOneDocument.findFirst({
        where: {
          id: documentId,
          projectId,
          ...this.visibleUploadDocumentWhere(actor),
          project: { OR: uploadScopes },
        },
        select: {
          status: true,
          stageKey: true,
          workstreamKey: true,
          documentType: true,
        },
      });
      if (inactiveTarget)
        await this.requireScopedFinancialDocument(
          actor,
          projectId,
          inactiveTarget,
          db,
          'Không tìm thấy hồ sơ tải lên.',
        );
      if (inactiveTarget?.status === 'SUPERSEDED')
        throw new NotFoundException({
          category: 'PROJECT_DOCUMENT_TARGET_INACTIVE',
          message: 'Loại hồ sơ không còn được sử dụng.',
        });
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ tải lên.',
      });
    }
    if (
      !document.requiredDocument ||
      document.contextType !==
        projectDocumentContext(document.requiredDocument.initialMatrix)
    )
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ tải lên.',
      });
    await this.requireScopedFinancialDocument(
      actor,
      projectId,
      document,
      db,
      'Không tìm thấy hồ sơ tải lên.',
    );
    const managePermission =
      document.stageKey === 'STAGE_1' &&
      document.requiredDocument?.initialMatrix
        ? 'project.key_dossier.manage'
        : 'project.document.manage';
    if (
      !actor.permissions.includes(managePermission) ||
      !(await this.policy.hasProjectPermissions(actor, projectId, [
        'file.upload',
        managePermission,
      ]))
    )
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ tải lên.',
      });
    if (document.requiredDocument?.deletedAt)
      throw new NotFoundException({
        category: 'KEY_DOSSIER_ITEM_DELETED',
        message: 'Mục hồ sơ đã bị xóa. Vui lòng chọn mục khác.',
      });
    if (document.requiredDocument?.supersededAt)
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_INACTIVE',
        message: 'Loại hồ sơ không còn được sử dụng.',
      });
    return document;
  }

  async linkUploadFileInTransaction(
    actor: CurrentActor,
    projectId: string,
    documentId: string,
    fileAssetId: string,
    submittingOfficerId: string | null | undefined,
    tx: Prisma.TransactionClient,
  ) {
    this.require(actor, 'file.upload');
    const target = await tx.projectStageOneDocument.findFirst({
      where: { id: documentId, projectId },
      select: {
        stageKey: true,
        requiredDocument: {
          select: { initialMatrix: true, deletedAt: true },
        },
      },
    });
    const managePermission =
      target?.stageKey === 'STAGE_1' && target.requiredDocument?.initialMatrix
        ? 'project.key_dossier.manage'
        : 'project.document.manage';
    this.require(actor, managePermission);
    await this.lockScopedProject(
      tx,
      actor,
      projectId,
      'PROJECT_NOT_FOUND_OR_NOT_VISIBLE',
      ['file.upload', managePermission],
    );
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "ProjectStageOneDocument"
      WHERE "id" = ${documentId}::uuid AND "projectId" = ${projectId}::uuid
      FOR UPDATE
    `);
    if (!locked.length)
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ tải lên.',
      });
    const document = await tx.projectStageOneDocument.findFirst({
      where: {
        id: documentId,
        projectId,
        status: { not: 'SUPERSEDED' },
        ...this.visibleUploadDocumentWhere(actor),
      },
      include: {
        requiredDocument: {
          select: { supersededAt: true, deletedAt: true, initialMatrix: true },
        },
      },
    });
    if (document)
      await this.requireScopedFinancialDocument(
        actor,
        projectId,
        document,
        tx,
        'Không tìm thấy hồ sơ tải lên.',
      );
    if (document?.requiredDocument?.deletedAt)
      throw new NotFoundException({
        category: 'KEY_DOSSIER_ITEM_DELETED',
        message: 'Mục hồ sơ đã bị xóa. Vui lòng chọn mục khác.',
      });
    if (document?.requiredDocument?.supersededAt)
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_INACTIVE',
        message: 'Loại hồ sơ không còn được sử dụng.',
      });
    if (!submittingOfficerId)
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy thông tin cán bộ nộp hồ sơ.',
      });
    const officerId = submittingOfficerId;
    await this.requireSubmittedOfficer(actor, projectId, officerId, tx);
    const [officer, file] =
      document && officerId
        ? await Promise.all([
            tx.projectMember.findFirst({
              where: {
                organizationId: actor.organizationId,
                projectId,
                userId: officerId,
                user: {
                  status: 'active',
                  organizationMembers: {
                    some: {
                      organizationId: actor.organizationId,
                      status: 'active',
                    },
                  },
                },
              },
              select: { id: true },
            }),
            tx.fileAsset.findFirst({
              where: {
                id: fileAssetId,
                organizationId: actor.organizationId,
                deletedAt: null,
              },
              select: { id: true },
            }),
          ])
        : [null, null];
    if (!document || !officer || !file)
      throw new NotFoundException({
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ tải lên.',
      });
    if (document.currentFileAssetId === fileAssetId) return document;
    const version = document.currentVersion + 1;
    await tx.projectStageOneDocumentVersion.create({
      data: {
        documentId,
        version,
        fileAssetId,
        status: 'UPLOADED',
        submittedOfficerId: officerId!,
        actualActorId: actor.userId,
      },
    });
    const updated = await tx.projectStageOneDocument.update({
      where: { id: documentId },
      data: {
        currentFileAssetId: fileAssetId,
        currentVersion: version,
        status: 'UPLOADED',
        submittedOfficerId: officerId!,
        actualActorId: actor.userId,
      },
    });
    await tx.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event: 'PROJECT_STAGE_ONE_DOCUMENT_UPLOADED',
        entityType: 'ProjectStageOneDocument',
        entityId: documentId,
        metadata: {
          projectId,
          fileId: fileAssetId,
          version,
          submittedOfficerId: officerId!,
        },
      },
    });
    await this.audit.write(tx, actor, {
      action: 'PROJECT_STAGE_ONE_DOCUMENT_UPLOADED',
      entityType: 'ProjectStageOneDocument',
      entityId: documentId,
      beforeData: {
        currentFileAssetId: document.currentFileAssetId,
        currentVersion: document.currentVersion,
        status: document.status,
      },
      afterData: {
        currentFileAssetId: fileAssetId,
        currentVersion: version,
        status: updated.status,
        submittedOfficerId: officerId!,
        actualActorId: actor.userId,
      },
    });
    return updated;
  }

  async documentHistory(
    actor: CurrentActor,
    projectId: string,
    documentId: string,
  ) {
    this.require(actor, 'project.read');
    const projectActor =
      actor.permissionSources === undefined
        ? actor
        : await this.policy.actorForProject(actor, projectId);
    const canReadFiles = canReadProjectFileMetadata(projectActor);
    const document = await this.prisma.projectStageOneDocument.findFirst({
      where: {
        id: documentId,
        projectId,
        stageKey: 'STAGE_1',
        project: this.policy.projectWhere(actor, 'project.read'),
        ...visibleStageOneDocumentWhere(
          projectActor.permissions.includes('project.stage1.finance.read'),
        ),
      },
      select: {
        id: true,
        stageKey: true,
        step: true,
        documentType: true,
        displayName: true,
        status: true,
        currentVersion: true,
        versions: {
          orderBy: { version: 'desc' },
          select: {
            version: true,
            status: true,
            createdAt: true,
            fileAsset: canReadFiles
              ? {
                  select: {
                    id: true,
                    originalFilename: true,
                    mimeType: true,
                    sizeBytes: true,
                    deletedAt: true,
                  },
                }
              : false,
            submittedOfficer: {
              select: { id: true, displayName: true, email: true },
            },
            actualActor: {
              select: { id: true, displayName: true, email: true },
            },
          },
        },
      },
    });
    if (!document || document.stageKey !== 'STAGE_1')
      throw new NotFoundException({
        category: 'NOT_FOUND',
        message: 'Không tìm thấy lịch sử hồ sơ.',
      });
    const hiddenFileIds = canReadFiles
      ? new Set(await hiddenProjectFileIds(this.prisma, actor, projectId))
      : new Set<string>();
    return {
      id: document.id,
      step: document.step,
      documentType: document.documentType,
      displayName: document.displayName,
      status: document.status,
      currentVersion: document.currentVersion,
      versions: document.versions.flatMap((version) => {
        const fileAsset = canReadFiles ? version.fileAsset : undefined;
        return fileAsset?.deletedAt ||
          (fileAsset && hiddenFileIds.has(fileAsset.id))
          ? []
          : [
              {
                version: version.version,
                status: version.status,
                createdAt: version.createdAt,
                ...(fileAsset
                  ? {
                      downloadId: fileAsset.id,
                      filename: fileAsset.originalFilename,
                      mimeType: fileAsset.mimeType,
                      sizeBytes: fileAsset.sizeBytes.toString(),
                    }
                  : {}),
                submittedOfficer: version.submittedOfficer,
                actualActor: version.actualActor,
              },
            ];
      }),
    };
  }

  async deleteDocument(
    actor: CurrentActor,
    projectId: string,
    documentId: string,
    contextType: ProjectDocumentContext,
    source: 'STAGE_ONE' | 'LEGACY_REQUIRED_DOCUMENT' = 'STAGE_ONE',
  ) {
    this.require(actor, 'file.delete');
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        'file.delete',
      );
      if (source === 'LEGACY_REQUIRED_DOCUMENT') {
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "ProjectRequiredDocument"
          WHERE "id" = ${documentId}::uuid
            AND "projectId" = ${projectId}::uuid
            AND "stageKey" = 'STAGE_1'
          FOR UPDATE
        `);
        if (!locked.length)
          throw new NotFoundException({
            category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
            message: 'Không tìm thấy hồ sơ trong dự án.',
          });
        const document = await tx.projectRequiredDocument.findFirst({
          where: {
            id: documentId,
            projectId,
            stageKey: 'STAGE_1',
            status: { not: 'SUPERSEDED' },
            currentFileAssetId: { not: null },
            initialMatrix: contextType === 'STAGE_MATRIX_DOCUMENT',
            deletedAt: null,
          },
          select: {
            id: true,
            projectId: true,
            stageKey: true,
            workstreamKey: true,
            documentType: true,
            status: true,
            currentFileAssetId: true,
            currentVersion: true,
          },
        });
        if (!document)
          throw new NotFoundException({
            category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
            message: 'Không tìm thấy hồ sơ trong dự án.',
          });
        await this.requireScopedFinancialDocument(
          actor,
          projectId,
          document,
          tx,
          'Không tìm thấy hồ sơ trong dự án.',
        );
        await tx.projectRequiredDocument.update({
          where: { id: document.id },
          data: { currentFileAssetId: null, status: 'MISSING' },
        });
        const metadata = {
          projectId,
          contextType,
          fileAssetId: document.currentFileAssetId,
        };
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'PROJECT_STAGE_ONE_DOCUMENT_DELETED',
            entityType: 'ProjectRequiredDocument',
            entityId: document.id,
            metadata,
          },
        });
        await this.audit.write(tx, actor, {
          action: 'PROJECT_STAGE_ONE_DOCUMENT_DELETED',
          entityType: 'ProjectRequiredDocument',
          entityId: document.id,
          beforeData: {
            status: document.status,
            currentFileAssetId: document.currentFileAssetId,
            currentVersion: document.currentVersion,
          },
          afterData: {
            status: 'MISSING',
            currentFileAssetId: null,
            currentVersion: document.currentVersion,
          },
          metadata,
        });
        return { deleted: true };
      }
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "ProjectStageOneDocument"
        WHERE "id" = ${documentId}::uuid
          AND "projectId" = ${projectId}::uuid
          AND "stageKey" = 'STAGE_1'
        FOR UPDATE
      `);
      if (!locked.length)
        throw new NotFoundException({
          category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ trong dự án.',
        });
      const document = await tx.projectStageOneDocument.findFirst({
        where: {
          id: documentId,
          projectId,
          stageKey: 'STAGE_1',
          status: { not: 'SUPERSEDED' },
          requiredDocumentId: { not: null },
          ...this.visibleUploadDocumentWhere(actor),
        },
        select: {
          id: true,
          contextType: true,
          projectId: true,
          stageKey: true,
          workstreamKey: true,
          documentType: true,
          status: true,
          currentFileAssetId: true,
          currentVersion: true,
          requiredDocument: {
            select: { initialMatrix: true, deletedAt: true },
          },
        },
      });
      if (
        !document?.requiredDocument ||
        document.requiredDocument.deletedAt ||
        document.contextType !== contextType
      )
        throw new NotFoundException({
          category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ trong dự án.',
        });
      await this.requireScopedFinancialDocument(
        actor,
        projectId,
        document,
        tx,
        'Không tìm thấy hồ sơ trong dự án.',
      );
      await tx.projectStageOneDocument.update({
        where: { id: document.id },
        data: { status: 'SUPERSEDED' },
      });
      const metadata = {
        projectId,
        contextType,
        fileAssetId: document.currentFileAssetId,
      };
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_DOCUMENT_DELETED',
          entityType: 'ProjectStageOneDocument',
          entityId: document.id,
          metadata,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_ONE_DOCUMENT_DELETED',
        entityType: 'ProjectStageOneDocument',
        entityId: document.id,
        beforeData: {
          status: document.status,
          currentFileAssetId: document.currentFileAssetId,
          currentVersion: document.currentVersion,
        },
        afterData: {
          status: 'SUPERSEDED',
          currentFileAssetId: document.currentFileAssetId,
          currentVersion: document.currentVersion,
        },
        metadata,
      });
      return { deleted: true };
    });
  }

  async deleteKeyDossierItem(
    actor: CurrentActor,
    projectId: string,
    itemId: string,
    reason: string,
  ) {
    this.require(actor, 'project.key_dossier.item.delete');
    const deleteReason = reason?.trim();
    if (!deleteReason || deleteReason.length > 1000)
      throw new BadRequestException('Lý do xóa mục hồ sơ là bắt buộc.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        'project.key_dossier.item.delete',
      );
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "ProjectRequiredDocument"
        WHERE "id" = ${itemId}::uuid
          AND "projectId" = ${projectId}::uuid
          AND "stageKey" = 'STAGE_1'
          AND "initialMatrix" = true
        FOR UPDATE
      `);
      if (!locked.length)
        throw new NotFoundException({
          category: 'KEY_DOSSIER_ITEM_NOT_FOUND',
          message: 'Không tìm thấy mục Hồ sơ chủ chốt.',
        });
      const item = await tx.projectRequiredDocument.findFirst({
        where: {
          id: itemId,
          projectId,
          stageKey: 'STAGE_1',
          initialMatrix: true,
          deletedAt: null,
        },
        select: {
          id: true,
          documentName: true,
          currentFileAssetId: true,
          stageOneDocuments: {
            where: { status: { not: 'SUPERSEDED' } },
            select: { id: true, currentFileAssetId: true },
          },
        },
      });
      if (!item)
        throw new NotFoundException({
          category: 'KEY_DOSSIER_ITEM_NOT_FOUND',
          message: 'Mục hồ sơ đã bị xóa hoặc không còn khả dụng.',
        });
      const deletedAt = new Date();
      await tx.projectRequiredDocument.update({
        where: { id: item.id },
        data: {
          deletedAt,
          deletedBy: actor.userId,
          deleteReason,
        },
      });
      const attachmentCount =
        item.stageOneDocuments.filter(({ currentFileAssetId }) =>
          Boolean(currentFileAssetId),
        ).length + (item.currentFileAssetId ? 1 : 0);
      await this.audit.write(tx, actor, {
        action: 'PROJECT_KEY_DOSSIER_ITEM_DELETED',
        entityType: 'ProjectRequiredDocument',
        entityId: item.id,
        beforeData: {
          deletedAt: null,
          documentName: item.documentName,
          attachmentCount,
        },
        afterData: { deletedAt, deletedBy: actor.userId, deleteReason },
        metadata: { projectId },
      });
      return { deleted: true, attachmentCount };
    });
  }

  async createKeyDossierMilestone(
    actor: CurrentActor,
    projectId: string,
    input: KeyDossierMilestoneDto,
  ) {
    this.require(actor, 'project.key_dossier.manage');
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name)
      throw new BadRequestException('Mã và tên mốc là bắt buộc.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'NOT_FOUND',
        'project.key_dossier.manage',
      );
      if (
        await tx.keyDossierReferenceMilestone.findFirst({
          where: { projectId, code },
          select: { id: true },
        })
      )
        throw new ConflictException('Mã mốc Hồ sơ chủ chốt đã tồn tại.');
      const milestone = await tx.keyDossierReferenceMilestone.create({
        data: {
          organizationId: actor.organizationId,
          projectId,
          code,
          name,
          position: input.position,
          active: input.active,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        select: {
          id: true,
          code: true,
          name: true,
          position: true,
          active: true,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_KEY_DOSSIER_MILESTONE_CREATED',
        entityType: 'KeyDossierReferenceMilestone',
        entityId: milestone.id,
        afterData: milestone,
        metadata: { projectId },
      });
      return milestone;
    });
  }

  async updateKeyDossierMilestone(
    actor: CurrentActor,
    projectId: string,
    milestoneId: string,
    input: KeyDossierMilestoneDto,
  ) {
    this.require(actor, 'project.key_dossier.manage');
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name)
      throw new BadRequestException('Mã và tên mốc là bắt buộc.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'NOT_FOUND',
        'project.key_dossier.manage',
      );
      const before = await tx.keyDossierReferenceMilestone.findFirst({
        where: {
          id: milestoneId,
          projectId,
          organizationId: actor.organizationId,
          deletedAt: null,
        },
      });
      if (!before) throw new NotFoundException('Không tìm thấy mốc hồ sơ.');
      if (
        await tx.keyDossierReferenceMilestone.findFirst({
          where: {
            projectId,
            code,
            id: { not: milestoneId },
          },
          select: { id: true },
        })
      )
        throw new ConflictException('Mã mốc Hồ sơ chủ chốt đã tồn tại.');
      const milestone = await tx.keyDossierReferenceMilestone.update({
        where: { id: milestoneId },
        data: {
          code,
          name,
          position: input.position,
          active: input.active,
          updatedBy: actor.userId,
        },
        select: {
          id: true,
          code: true,
          name: true,
          position: true,
          active: true,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_KEY_DOSSIER_MILESTONE_UPDATED',
        entityType: 'KeyDossierReferenceMilestone',
        entityId: milestone.id,
        beforeData: before,
        afterData: milestone,
        metadata: { projectId },
      });
      return milestone;
    });
  }

  async deleteKeyDossierMilestone(
    actor: CurrentActor,
    projectId: string,
    milestoneId: string,
    input: DeleteKeyDossierMilestoneDto,
  ) {
    this.require(actor, 'project.key_dossier.manage');
    const reason = input.reason?.trim();
    if (!reason || reason.length > 1000)
      throw new BadRequestException('Lý do xóa mốc là bắt buộc.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'NOT_FOUND',
        'project.key_dossier.manage',
      );
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "KeyDossierReferenceMilestone"
        WHERE "id" = ${milestoneId}::uuid
          AND "projectId" = ${projectId}::uuid
          AND "deletedAt" IS NULL
        FOR UPDATE
      `);
      if (!locked.length)
        throw new NotFoundException('Không tìm thấy mốc hồ sơ.');
      const milestone = await tx.keyDossierReferenceMilestone.findFirst({
        where: {
          id: milestoneId,
          projectId,
          organizationId: actor.organizationId,
          deletedAt: null,
        },
      });
      if (!milestone) throw new NotFoundException('Không tìm thấy mốc hồ sơ.');
      const replacementId = input.replacementMilestoneId ?? null;
      if (
        replacementId &&
        (replacementId === milestoneId ||
          !(await tx.keyDossierReferenceMilestone.findFirst({
            where: {
              id: replacementId,
              projectId,
              organizationId: actor.organizationId,
              active: true,
              deletedAt: null,
            },
            select: { id: true },
          })))
      )
        throw new NotFoundException('Không tìm thấy mốc thay thế.');
      const itemWhere = {
        projectId,
        initialMatrix: true,
        deletedAt: null,
        referenceMilestoneId: milestoneId,
      } as const;
      const affectedItems = await tx.projectRequiredDocument.count({
        where: itemWhere,
      });
      await tx.projectRequiredDocument.updateMany({
        where: itemWhere,
        data: { referenceMilestoneId: replacementId },
      });
      const deletedAt = new Date();
      await tx.keyDossierReferenceMilestone.update({
        where: { id: milestoneId },
        data: {
          deletedAt,
          deletedBy: actor.userId,
          deleteReason: reason,
          active: false,
          updatedBy: actor.userId,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_KEY_DOSSIER_MILESTONE_DELETED',
        entityType: 'KeyDossierReferenceMilestone',
        entityId: milestoneId,
        beforeData: milestone,
        afterData: {
          deletedAt,
          deletedBy: actor.userId,
          deleteReason: reason,
          replacementMilestoneId: replacementId,
          affectedItems,
        },
        metadata: { projectId },
      });
      return { deleted: true, affectedItems };
    });
  }

  private rejectQuery(query?: Record<string, unknown>) {
    if (query && Object.keys(query).length)
      throw new BadRequestException(
        'Stage 1 reads do not support sorting or filtering',
      );
  }

  private routing(projectType: string | null) {
    const value = projectType ?? undefined;
    return isProjectType(value) ? routeProject({ projectType: value }) : null;
  }

  private visibleRouting(actor: CurrentActor, projectType: string | null) {
    const routing = this.routing(projectType);
    if (!routing || actor.permissions.includes(permissions.stageOneFinanceRead))
      return routing;
    const { requiresPreliminaryFinance, ...visible } = routing;
    void requiresPreliminaryFinance;
    return {
      ...visible,
      steps: visible.steps.filter((step) => step !== 'FINANCIAL_PLANNING'),
      documentTypes: visible.documentTypes.filter(
        (type) => type !== 'PRELIMINARY_FINANCIAL_PLAN',
      ),
    };
  }

  private visiblePlan<T extends Record<string, unknown> | null>(
    actor: CurrentActor,
    plan: T,
  ) {
    if (!plan || actor.permissions.includes(permissions.stageOneFinanceRead))
      return plan;
    const {
      plannedFinancialPlanAt,
      preliminaryRevenue,
      preliminaryCost,
      preliminaryMargin,
      preliminaryCurrency,
      preliminaryFinancialPlanDate,
      ...visible
    } = plan;
    void plannedFinancialPlanAt;
    void preliminaryRevenue;
    void preliminaryCost;
    void preliminaryMargin;
    void preliminaryCurrency;
    void preliminaryFinancialPlanDate;
    return visible;
  }

  private requireUpdate(actor: CurrentActor) {
    if (!actor.permissions.includes('project.update'))
      throw new ForbiddenException('Insufficient permission');
  }

  private requireFinancialWrites(
    actor: CurrentActor,
    data: UpdateStageOnePlanDto,
  ) {
    const finance =
      actor.permissions.includes(permissions.stageOneFinanceRead) &&
      actor.permissions.includes(permissions.stageOneFinanceManage);
    if (
      [
        data.plannedFinancialPlanAt,
        data.preliminaryRevenue,
        data.preliminaryCost,
        data.preliminaryMargin,
        data.preliminaryCurrency,
        data.preliminaryFinancialPlanDate,
      ].some((value) => value !== undefined) &&
      !finance
    )
      throw new ForbiddenException('Stage 1 finance permission is required');
  }

  private async lockScopedProject(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    notFoundCategory = 'NOT_FOUND',
    requiredPermissions?: string | readonly string[],
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id" FROM "Project"
      WHERE "id" = ${projectId}::uuid
        AND "organizationId" = ${actor.organizationId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    if (!locked.length)
      throw new NotFoundException({
        category: notFoundCategory,
        message: 'Dự án đã bị xóa hoặc không còn khả dụng.',
      });
    const scoped = await tx.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, requiredPermissions),
      },
      select: { id: true },
    });
    if (!scoped)
      throw new NotFoundException({
        category: notFoundCategory,
        message: 'Dự án đã bị xóa hoặc không còn khả dụng.',
      });
  }

  private definitionResponse(
    document: {
      id: string;
      documentName: string;
      workstreamKey: string;
      notes: string | null;
      position: number;
      initialMatrix: boolean;
      required: boolean;
      supersededAt: Date | null;
      deletedAt?: Date | null;
      referenceMilestoneId?: string | null;
      referenceMilestone?: {
        id: string;
        code: string;
        name: string;
        position: number;
        active: boolean;
      } | null;
    },
    files: unknown[] = [],
  ) {
    return {
      id: document.id,
      name: visibleDefinitionName(
        document.documentName,
        document.initialMatrix,
      ),
      workstreamKey: document.workstreamKey,
      description: document.notes ?? undefined,
      position: document.position,
      initialMatrix: document.initialMatrix,
      active: document.supersededAt === null && !document.deletedAt,
      required: document.required,
      referenceMilestoneId: document.referenceMilestoneId ?? null,
      referenceMilestone: document.referenceMilestone ?? null,
      files,
    };
  }

  private async initializeSimpleDocumentDefinitions(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
  ) {
    const locked = await tx.$queryRaw<{ projectId: string }[]>(Prisma.sql`
      SELECT "projectId" FROM "ProjectStageState"
      WHERE "projectId" = ${projectId}::uuid
        AND "stage" = 'STAGE_ONE'::"ProjectStage"
      FOR UPDATE
    `);
    if (!locked.length) throw new ConflictException('GĐ 1 chưa được khởi tạo.');
    const state = await tx.projectStageState.findUniqueOrThrow({
      where: { projectId_stage: { projectId, stage: 'STAGE_ONE' } },
      select: { documentDefinitionsInitializedAt: true },
    });
    if (state.documentDefinitionsInitializedAt) return false;

    const existing = await tx.projectRequiredDocument.findMany({
      where: { projectId, stageKey: 'STAGE_1' },
    });
    const supersededDefault = stageOneDefinitionDefaults.find((definition) =>
      existing.some(
        (document) =>
          document.status === 'SUPERSEDED' &&
          document.workstreamKey === definition.workstreamKey &&
          document.initialMatrix === definition.initialMatrix &&
          (document.documentType === definition.name ||
            normalizeDocumentName(
              visibleDefinitionName(
                document.documentName,
                document.initialMatrix,
              ),
            ) === normalizeDocumentName(definition.name)),
      ),
    );
    if (supersededDefault)
      throw new ConflictException(
        'Superseded document history cannot be reinitialized',
      );
    const initialized: { id: string; step: string; position: number }[] = [];
    for (const definition of stageOneDefinitionDefaults) {
      const normalizedName = normalizeDocumentName(definition.name);
      const current = existing.find(
        (document) =>
          document.workstreamKey === definition.workstreamKey &&
          document.initialMatrix === definition.initialMatrix &&
          (document.documentType === definition.name ||
            normalizeDocumentName(
              visibleDefinitionName(
                document.documentName,
                document.initialMatrix,
              ),
            ) === normalizedName),
      );
      const document =
        current ??
        (await tx.projectRequiredDocument.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            stageKey: 'STAGE_1',
            workstreamKey: definition.workstreamKey,
            documentType: definition.name,
            documentName: definition.name,
            ownerRole: 'PROJECT_MANAGER',
            status: 'MISSING',
            required: false,
            position: definition.position,
            initialMatrix: definition.initialMatrix,
            normalizedName,
          },
        }));
      if (!current) existing.push(document);
      initialized.push({
        id: document.id,
        step: document.workstreamKey,
        position: document.position,
      });
    }
    const marked = await tx.projectStageState.updateMany({
      where: {
        projectId,
        stage: 'STAGE_ONE',
        documentDefinitionsInitializedAt: null,
      },
      data: { documentDefinitionsInitializedAt: new Date() },
    });
    if (!marked.count) return false;
    await tx.activity.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        event: 'PROJECT_STAGE_ONE_DOCUMENT_DEFINITIONS_INITIALIZED',
        entityType: 'Project',
        entityId: projectId,
        metadata: { definitions: initialized },
      },
    });
    await this.audit.write(tx, actor, {
      action: 'PROJECT_STAGE_ONE_DOCUMENT_DEFINITIONS_INITIALIZED',
      entityType: 'Project',
      entityId: projectId,
      afterData: { definitions: initialized },
    });
    return true;
  }

  async createDocumentDefinition(
    actor: CurrentActor,
    projectId: string,
    data: ProjectDocumentDefinitionDto,
    initialMatrix = data.initialMatrix,
  ) {
    data = {
      ...data,
      initialMatrix,
      ...(initialMatrix
        ? { workstreamKey: undefined }
        : { referenceMilestoneId: undefined }),
    };
    if (
      !initialMatrix &&
      !stageOneSteps.includes(data.workstreamKey as StageOneStep)
    )
      throw new UnprocessableEntityException('Workflow Step is required.');
    const managePermission = data.initialMatrix
      ? 'project.key_dossier.manage'
      : 'project.document.manage';
    this.require(actor, managePermission);
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'NOT_FOUND',
        managePermission,
      );
      if (!data.initialMatrix)
        await this.requireScopedFinancialDocument(
          actor,
          projectId,
          {
            stageKey: 'STAGE_1',
            workstreamKey: data.workstreamKey,
            documentType: data.name,
          },
          tx,
        );
      if (
        data.referenceMilestoneId &&
        !(await tx.keyDossierReferenceMilestone.findFirst({
          where: {
            id: data.referenceMilestoneId,
            projectId,
            organizationId: actor.organizationId,
            active: true,
            deletedAt: null,
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Không tìm thấy mốc Hồ sơ chủ chốt.');
      const workstreamKey = data.initialMatrix
        ? 'KEY_DOSSIER'
        : data.workstreamKey!;
      const normalizedName = normalizeDocumentName(data.name);
      const candidates = await tx.projectRequiredDocument.findMany({
        where: {
          projectId,
          stageKey: 'STAGE_1',
          workstreamKey,
          initialMatrix: data.initialMatrix,
          deletedAt: null,
        },
      });
      const duplicate = candidates.find(
        (candidate) =>
          candidate.supersededAt === null &&
          (candidate.documentType === data.name ||
            normalizeDocumentName(candidate.documentName) === normalizedName),
      );
      if (duplicate)
        throw new ConflictException('Document definition already exists');
      const historical =
        candidates.find((candidate) => candidate.documentType === data.name) ??
        candidates.find(
          (candidate) =>
            normalizeDocumentName(candidate.documentName) === normalizedName,
        );
      if (historical?.status === 'SUPERSEDED')
        throw new ConflictException(
          'Superseded document history cannot be restored',
        );
      const definitionData = {
        workstreamKey,
        referenceMilestoneId: data.initialMatrix
          ? (data.referenceMilestoneId ?? null)
          : null,
        documentType: data.name,
        documentName: data.name,
        notes: data.description,
        position: data.position,
        initialMatrix: data.initialMatrix,
        normalizedName,
        required: false,
        supersededAt: data.active
          ? null
          : (historical?.supersededAt ?? new Date()),
        supersededBy: data.active
          ? null
          : (historical?.supersededBy ?? actor.userId),
      };
      const document = historical
        ? await tx.projectRequiredDocument.update({
            where: { id: historical.id },
            data: definitionData,
          })
        : await tx.projectRequiredDocument.create({
            data: {
              organizationId: actor.organizationId,
              projectId,
              stageKey: 'STAGE_1',
              status: 'MISSING',
              ownerRole: 'PROJECT_MANAGER',
              ...definitionData,
            },
          });
      const action = historical ? 'UPDATED' : 'CREATED';
      const after = this.definitionResponse(document);
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `PROJECT_STAGE_ONE_DOCUMENT_DEFINITION_${action}`,
          entityType: 'ProjectRequiredDocument',
          entityId: document.id,
          metadata: {
            projectId,
            step: document.workstreamKey,
            position: document.position,
          },
        },
      });
      await this.audit.write(tx, actor, {
        action: `PROJECT_STAGE_ONE_DOCUMENT_DEFINITION_${action}`,
        entityType: 'ProjectRequiredDocument',
        entityId: document.id,
        beforeData: historical
          ? this.definitionResponse(historical)
          : undefined,
        afterData: after,
        metadata: { projectId },
      });
      return after;
    });
  }

  async updateDocumentDefinition(
    actor: CurrentActor,
    projectId: string,
    id: string,
    data: ProjectDocumentDefinitionDto,
    initialMatrix = data.initialMatrix,
  ) {
    data = {
      ...data,
      initialMatrix,
      ...(initialMatrix
        ? { workstreamKey: undefined }
        : { referenceMilestoneId: undefined }),
    };
    if (
      !initialMatrix &&
      !stageOneSteps.includes(data.workstreamKey as StageOneStep)
    )
      throw new UnprocessableEntityException('Workflow Step is required.');
    const managePermission = data.initialMatrix
      ? 'project.key_dossier.manage'
      : 'project.document.manage';
    this.require(actor, managePermission);
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'NOT_FOUND',
        managePermission,
      );
      const before = await tx.projectRequiredDocument.findFirst({
        where: {
          id,
          projectId,
          organizationId: actor.organizationId,
          stageKey: 'STAGE_1',
          deletedAt: null,
        },
      });
      if (!before) throw new NotFoundException('Document definition not found');
      if (before.status === 'SUPERSEDED')
        throw new ConflictException(
          'Superseded document history cannot be changed',
        );
      if (before.initialMatrix !== data.initialMatrix)
        throw new ConflictException(
          'Không thể chuyển mục giữa Hồ sơ chủ chốt và Workflow.',
        );
      if (!before.initialMatrix) {
        await this.requireScopedFinancialDocument(actor, projectId, before, tx);
        await this.requireScopedFinancialDocument(
          actor,
          projectId,
          {
            stageKey: 'STAGE_1',
            workstreamKey: data.workstreamKey,
            documentType: before.documentType,
          },
          tx,
        );
      }
      if (
        data.referenceMilestoneId &&
        !(await tx.keyDossierReferenceMilestone.findFirst({
          where: {
            id: data.referenceMilestoneId,
            projectId,
            organizationId: actor.organizationId,
            active: true,
            deletedAt: null,
          },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Không tìm thấy mốc Hồ sơ chủ chốt.');
      const workstreamKey = before.initialMatrix
        ? before.workstreamKey
        : data.workstreamKey!;
      if (before.workstreamKey !== workstreamKey) {
        const [logicalDocument, legacyVersion] = await Promise.all([
          tx.projectStageOneDocument.findFirst({
            where: { requiredDocumentId: id },
            select: { id: true },
          }),
          tx.projectRequiredDocumentVersion.findFirst({
            where: { requirementId: id },
            select: { id: true },
          }),
        ]);
        if (
          logicalDocument ||
          legacyVersion ||
          before.currentFileAssetId ||
          before.currentVersion > 0
        )
          throw new ConflictException(
            before.workstreamKey !== workstreamKey
              ? 'Document definition Step cannot change after files or history exist'
              : 'Document definition context cannot change after files or history exist',
          );
      }
      const normalizedName = normalizeDocumentName(data.name);
      const candidates = await tx.projectRequiredDocument.findMany({
        where: {
          id: { not: id },
          projectId,
          stageKey: 'STAGE_1',
          workstreamKey,
          initialMatrix: data.initialMatrix,
        },
        select: {
          id: true,
          documentType: true,
          documentName: true,
          supersededAt: true,
        },
      });
      const duplicate = candidates.find(
        (candidate) =>
          candidate.documentType === data.name ||
          (data.active &&
            candidate.supersededAt === null &&
            normalizeDocumentName(candidate.documentName) === normalizedName),
      );
      if (duplicate)
        throw new ConflictException('Document definition already exists');
      const beforeDefinition = this.definitionResponse(before);
      const nextDefinition = {
        ...beforeDefinition,
        name: data.name,
        workstreamKey,
        referenceMilestoneId: data.initialMatrix
          ? (data.referenceMilestoneId ?? null)
          : undefined,
        description: data.description,
        position: data.position,
        initialMatrix: data.initialMatrix,
        active: data.active,
        required: false,
      };
      if (isDeepStrictEqual(beforeDefinition, nextDefinition))
        return beforeDefinition;
      const document = await tx.projectRequiredDocument.update({
        where: { id },
        data: {
          documentName: data.name,
          workstreamKey,
          referenceMilestoneId: data.initialMatrix
            ? (data.referenceMilestoneId ?? null)
            : null,
          notes: data.description,
          position: data.position,
          initialMatrix: data.initialMatrix,
          normalizedName,
          required: false,
          supersededAt: data.active
            ? null
            : (before.supersededAt ?? new Date()),
          supersededBy: data.active
            ? null
            : (before.supersededBy ?? actor.userId),
        },
      });
      const after = this.definitionResponse(document);
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_DOCUMENT_DEFINITION_UPDATED',
          entityType: 'ProjectRequiredDocument',
          entityId: id,
          metadata: {
            projectId,
            step: document.workstreamKey,
            position: document.position,
          },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_ONE_DOCUMENT_DEFINITION_UPDATED',
        entityType: 'ProjectRequiredDocument',
        entityId: id,
        beforeData: beforeDefinition,
        afterData: after,
        metadata: { projectId },
      });
      return after;
    });
  }

  private async simpleRead(
    client: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    requiredPermissions: string | readonly string[] = 'project.read',
  ) {
    const projectActor =
      actor.permissionSources === undefined
        ? actor
        : await this.policy.actorForProject(actor, projectId, client);
    const canReadFinance = projectActor.permissions.includes(
      permissions.estimatedValue,
    );
    const canReadFiles = canReadProjectFileMetadata(projectActor);
    const project = await client.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, requiredPermissions),
      },
      select: {
        id: true,
        code: true,
        name: true,
        estimatedValue: canReadFinance,
        customerId: true,
        primaryContactId: true,
        stageOnePlan: canReadFinance
          ? { select: { fundingSource: true } }
          : false,
        stageSteps: {
          where: { stage: 'STAGE_ONE' },
          select: { step: true, status: true },
        },
        stageOneDocuments: {
          where: {
            requiredDocumentId: { not: null },
            requiredDocument: { is: { deletedAt: null } },
            currentFileAssetId: { not: null },
            currentFileAsset: { deletedAt: null },
            ...visibleStageOneDocumentWhere(
              projectActor.permissions.includes('project.stage1.finance.read'),
            ),
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            contextType: true,
            requiredDocumentId: true,
            requiredDocument: {
              select: {
                initialMatrix: true,
                deletedAt: true,
                referenceMilestoneId: true,
              },
            },
            step: true,
            documentType: true,
            displayName: true,
            status: true,
            currentVersion: true,
            currentFileAssetId: true,
            versions: {
              select: {
                version: true,
                fileAssetId: true,
                status: true,
                createdAt: true,
              },
            },
            submittedOfficer: {
              select: { id: true, displayName: true, email: true },
            },
            currentFileAsset: canReadFiles
              ? {
                  select: {
                    id: true,
                    originalFilename: true,
                    mimeType: true,
                    sizeBytes: true,
                  },
                }
              : false,
          },
        },
        requiredDocuments: {
          where: {
            stageKey: 'STAGE_1',
            deletedAt: null,
            ...visibleStageOneDocumentWhere(
              projectActor.permissions.includes('project.stage1.finance.read'),
            ),
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            workstreamKey: true,
            documentType: true,
            documentName: true,
            notes: true,
            position: true,
            initialMatrix: true,
            required: true,
            supersededAt: true,
            deletedAt: true,
            referenceMilestoneId: true,
            referenceMilestone: {
              select: {
                id: true,
                code: true,
                name: true,
                position: true,
                active: true,
              },
            },
            status: true,
            currentVersion: true,
            currentFileAssetId: true,
            versions: {
              select: {
                version: true,
                fileAssetId: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        keyDossierMilestones: {
          where: { deletedAt: null },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            code: true,
            name: true,
            position: true,
            active: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const hiddenFileIds = new Set(
      await hiddenProjectFileIds(client, actor, projectId),
    );
    const [projects, members, activeLegacyFiles, latestSimpleInitiation] =
      await Promise.all([
        client.project.findMany({
          where: this.policy.projectWhere(actor, 'project.read'),
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: { id: true, code: true, name: true },
        }),
        client.projectMember.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId,
            user: {
              status: 'active',
              organizationMembers: {
                some: {
                  organizationId: actor.organizationId,
                  status: 'active',
                },
              },
            },
          },
          orderBy: { user: { displayName: 'asc' } },
          select: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        }),
        client.fileAsset.findMany({
          where: {
            id: {
              in: project.requiredDocuments.flatMap(({ currentFileAssetId }) =>
                currentFileAssetId ? [currentFileAssetId] : [],
              ),
              notIn: [...hiddenFileIds],
            },
            organizationId: actor.organizationId,
            deletedAt: null,
            attachments: { some: { projectId } },
          },
          select: canReadFiles
            ? {
                id: true,
                originalFilename: true,
                mimeType: true,
                sizeBytes: true,
              }
            : { id: true },
        }),
        client.activity.findFirst({
          where: {
            organizationId: actor.organizationId,
            entityType: 'Project',
            entityId: projectId,
            event: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
          },
          orderBy: { createdAt: 'desc' },
          select: { metadata: true },
        }),
      ]);
    const approvalId = metadataRecord(latestSimpleInitiation?.metadata)[
      'approvalId'
    ];
    const approval =
      typeof approvalId === 'string'
        ? await client.projectStageApproval.findFirst({
            where: { id: approvalId, projectId, stage: 'STAGE_ONE' },
            select: {
              id: true,
              status: true,
              decision: true,
              submittedAt: true,
              decidedAt: true,
              evidenceFileId: true,
            },
          })
        : null;
    const statuses = new Map(
      project.stageSteps.map(({ step, status }) => [step, status]),
    );
    const logicalDocuments = project.stageOneDocuments.filter(
      ({ currentFileAssetId, currentVersion, status, versions }) =>
        !hiddenFileIds.has(String(currentFileAssetId)) &&
        activeSimpleDocumentStatuses.has(status) &&
        versions.some(
          (version) =>
            version.version === currentVersion &&
            version.fileAssetId === currentFileAssetId &&
            activeSimpleDocumentStatuses.has(version.status),
        ),
    );
    const logicalFileIds = new Set(
      logicalDocuments.map(({ currentFileAssetId }) =>
        String(currentFileAssetId),
      ),
    );
    const activeLegacyFileIds = new Set(activeLegacyFiles.map(({ id }) => id));
    const activeLegacyFilesById = new Map<
      string,
      {
        id: string;
        originalFilename: string;
        mimeType: string;
        sizeBytes: string;
      }
    >();
    if (canReadFiles)
      for (const file of activeLegacyFiles)
        if (
          'sizeBytes' in file &&
          typeof file.sizeBytes === 'bigint' &&
          'originalFilename' in file &&
          typeof file.originalFilename === 'string' &&
          'mimeType' in file &&
          typeof file.mimeType === 'string'
        )
          activeLegacyFilesById.set(file.id, {
            id: file.id,
            originalFilename: file.originalFilename,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes.toString(),
          });
    const documents = [
      ...logicalDocuments.map((document) => ({
        id: document.id,
        source: 'STAGE_ONE' as const,
        legacyRequirementId: document.requiredDocumentId,
        contextType: document.contextType as ProjectDocumentContext,
        step: document.step,
        documentType: document.documentType,
        displayName: visibleDefinitionName(
          document.displayName,
          document.requiredDocument!.initialMatrix,
        ),
        status: document.status,
        currentVersion: document.currentVersion,
        ...(canReadFiles && {
          currentFileAssetId: document.currentFileAssetId,
        }),
        submittedAt: document.versions
          .find(
            (version) =>
              version.version === document.currentVersion &&
              version.fileAssetId === document.currentFileAssetId,
          )!
          .createdAt.toISOString(),
        submittedOfficer: document.submittedOfficer,
        ...(canReadFiles && {
          currentFileAsset: document.currentFileAsset
            ? {
                ...document.currentFileAsset,
                sizeBytes: document.currentFileAsset.sizeBytes.toString(),
              }
            : document.currentFileAsset,
        }),
      })),
      ...project.requiredDocuments
        .filter(
          ({ currentFileAssetId, currentVersion, status, versions }) =>
            activeSimpleDocumentStatuses.has(status) &&
            activeLegacyFileIds.has(String(currentFileAssetId)) &&
            versions.some(
              (version) =>
                version.version === currentVersion &&
                version.fileAssetId === currentFileAssetId &&
                activeSimpleDocumentStatuses.has(version.status),
            ) &&
            !logicalFileIds.has(String(currentFileAssetId)),
        )
        .map((document) => ({
          id: document.id,
          source: 'LEGACY_REQUIRED_DOCUMENT' as const,
          contextType: projectDocumentContext(document.initialMatrix),
          step: document.workstreamKey,
          documentType: document.documentType,
          displayName: visibleDefinitionName(
            document.documentName,
            document.initialMatrix,
          ),
          status: document.status,
          currentVersion: document.currentVersion,
          ...(canReadFiles && {
            currentFileAssetId: document.currentFileAssetId,
            currentFileAsset: activeLegacyFilesById.get(
              String(document.currentFileAssetId),
            ),
          }),
          submittedAt: document.versions
            .find(
              (version) =>
                version.version === document.currentVersion &&
                version.fileAssetId === document.currentFileAssetId,
            )!
            .createdAt.toISOString(),
        })),
    ];
    const activeDefinitions = project.requiredDocuments.filter(
      ({ initialMatrix, supersededAt }) =>
        !initialMatrix && supersededAt === null,
    );
    const filesByDefinition = new Map<string, typeof documents>();
    for (const document of documents) {
      const definitionId =
        document.source === 'STAGE_ONE'
          ? document.legacyRequirementId
          : document.id;
      if (!definitionId) continue;
      const files = filesByDefinition.get(definitionId) ?? [];
      files.push(document);
      filesByDefinition.set(definitionId, files);
    }
    const documentDefinitions = project.requiredDocuments.map((document) =>
      this.definitionResponse(
        document,
        filesByDefinition.get(document.id) ?? [],
      ),
    );
    return {
      project: { id: project.id, code: project.code, name: project.name },
      initiation: {
        name: project.name,
        estimatedInvestmentAmount: canReadFinance
          ? (project.estimatedValue?.toFixed(2) ?? null)
          : null,
        fundingSource: canReadFinance
          ? (project.stageOnePlan?.fundingSource ?? null)
          : null,
        customerId: project.customerId,
        primaryContactId: project.primaryContactId,
      },
      steps: SIMPLE_STAGE_ONE_STEPS.map((definition, index) => ({
        number: (index + 1) as 1 | 2 | 3 | 4 | 5,
        step: definition.step,
        label: definition.label,
        status: statuses.get(definition.step) ?? 'NOT_STARTED',
        documentTypes: activeDefinitions
          .filter(({ workstreamKey }) => workstreamKey === definition.step)
          .map((document) => ({
            id: document.id,
            name: stageOneDocumentDisplayName(document.documentName),
            customNameRequired: document.documentName === 'Hồ sơ khác',
            required: false,
          })),
      })),
      options: {
        projects,
        members: members.map(({ user }) => user),
      },
      keyDossier: {
        milestones: project.keyDossierMilestones,
        items: documentDefinitions.filter(({ initialMatrix }) => initialMatrix),
        attachments: documents.filter(
          ({ contextType }) => contextType === 'STAGE_MATRIX_DOCUMENT',
        ),
      },
      workflow: {
        definitions: documentDefinitions.filter(
          ({ initialMatrix }) => !initialMatrix,
        ),
        documents: documents.filter(
          ({ contextType }) => contextType === 'STAGE_WORKFLOW_STEP_DOCUMENT',
        ),
      },
      permittedCommands: {
        manageDocumentDefinitions: projectActor.permissions.includes(
          'project.document.manage',
        ),
      },
      capabilities: documentCapabilities(projectActor),
      approval: approval
        ? {
            ...approval,
            evidenceFileId:
              canReadFiles &&
              approval.evidenceFileId &&
              !hiddenFileIds.has(approval.evidenceFileId)
                ? approval.evidenceFileId
                : null,
          }
        : null,
    };
  }

  async getSimple(actor: CurrentActor, projectId: string) {
    this.require(actor, 'project.read');
    return this.simpleRead(this.prisma, actor, projectId);
  }

  async updateSimple(
    actor: CurrentActor,
    projectId: string,
    data: SimpleInitiationDto,
  ) {
    this.requireUpdate(actor);
    this.require(actor, 'estimate.update');
    this.require(actor, permissions.estimatedValue);
    const investment = new Prisma.Decimal(data.estimatedInvestmentAmount);
    const payload = {
      name: data.name,
      estimatedInvestmentAmount: investment.toFixed(2),
      fundingSource: data.fundingSource,
      customerId: data.customerId,
      primaryContactId: data.primaryContactId ?? null,
    };
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const commandPermissions = [
        'project.update',
        'estimate.update',
        permissions.estimatedValue,
      ];
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'NOT_FOUND',
        commandPermissions,
      );
      const existing = await tx.activity.findFirst({
        where: {
          organizationId: actor.organizationId,
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_UPDATED',
          metadata: { path: ['idempotencyKey'], equals: data.idempotencyKey },
        },
        select: { metadata: true },
      });
      if (existing) {
        if (metadataRecord(existing.metadata)['payloadHash'] !== payloadHash)
          throw new ConflictException(
            'Idempotency key was already used with a different Project payload',
          );
        return this.simpleRead(tx, actor, projectId, commandPermissions);
      }
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          name: true,
          estimatedValue: true,
          currency: true,
          customerId: true,
          primaryContactId: true,
          stageOnePlan: { select: { fundingSource: true } },
        },
      });
      const customer = await tx.customer.findFirst({
        where: {
          id: data.customerId,
          organizationId: actor.organizationId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      if (data.primaryContactId) {
        const contact = await tx.contact.findFirst({
          where: {
            id: data.primaryContactId,
            organizationId: actor.organizationId,
            customerId: data.customerId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!contact) throw new NotFoundException('Primary contact not found');
      }

      await tx.project.update({
        where: { id: projectId },
        data: {
          name: data.name,
          estimatedValue: investment,
          customerId: data.customerId,
          primaryContactId: data.primaryContactId ?? null,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await tx.projectStageOnePlan.upsert({
        where: { projectId },
        create: { projectId, fundingSource: data.fundingSource },
        update: data.fundingSource ? { fundingSource: data.fundingSource } : {},
      });
      const before = {
        name: project.name,
        estimatedInvestmentAmount: project.estimatedValue?.toFixed(2) ?? null,
        currency: project.currency,
        fundingSource: project.stageOnePlan?.fundingSource ?? null,
        customerId: project.customerId,
        primaryContactId: project.primaryContactId,
      };
      const after = {
        ...payload,
        currency: project.currency,
        fundingSource:
          data.fundingSource ?? project.stageOnePlan?.fundingSource ?? null,
      };
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_UPDATED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { idempotencyKey: data.idempotencyKey, payloadHash },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_ONE_SIMPLE_UPDATED',
        entityType: 'Project',
        entityId: projectId,
        beforeData: before,
        afterData: after,
        metadata: { idempotencyKey: data.idempotencyKey },
      });
      return this.simpleRead(tx, actor, projectId, commandPermissions);
    });
  }

  async initiateSimple(
    actor: CurrentActor,
    projectId: string,
    data: SimpleInitiationDto,
  ) {
    this.requireUpdate(actor);
    this.require(actor, 'estimate.update');
    this.require(actor, permissions.estimatedValue);
    return this.prisma.$transaction(async (tx) => {
      const commandPermissions = [
        'project.update',
        'estimate.update',
        permissions.estimatedValue,
      ];
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'NOT_FOUND',
        commandPermissions,
      );
      const existing = await tx.activity.findFirst({
        where: {
          organizationId: actor.organizationId,
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
          metadata: { path: ['idempotencyKey'], equals: data.idempotencyKey },
        },
        select: { id: true },
      });
      if (existing) {
        await this.initializeSimpleDocumentDefinitions(tx, actor, projectId);
        return this.simpleRead(tx, actor, projectId, commandPermissions);
      }

      const stageState = await tx.projectStageState.findUnique({
        where: { projectId_stage: { projectId, stage: 'STAGE_ONE' } },
        select: { status: true },
      });
      if (
        stageState &&
        ['DONE', 'NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'].includes(
          stageState.status,
        )
      )
        throw new ConflictException(
          'Trạng thái GĐ 1 không cho phép khởi tạo lại.',
        );

      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          name: true,
          estimatedValue: true,
          currency: true,
          customerId: true,
          primaryContactId: true,
          createdBy: true,
          stageOnePlan: { select: { fundingSource: true } },
        },
      });
      const customer = await tx.customer.findFirst({
        where: {
          id: data.customerId,
          organizationId: actor.organizationId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      if (data.primaryContactId) {
        const contact = await tx.contact.findFirst({
          where: {
            id: data.primaryContactId,
            organizationId: actor.organizationId,
            customerId: data.customerId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!contact) throw new NotFoundException('Primary contact not found');
      }

      const investment = new Prisma.Decimal(data.estimatedInvestmentAmount);
      await tx.project.update({
        where: { id: projectId },
        data: {
          name: data.name,
          estimatedValue: investment,
          customerId: data.customerId,
          primaryContactId: data.primaryContactId ?? null,
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      await tx.projectStageOnePlan.upsert({
        where: { projectId },
        create: { projectId, fundingSource: data.fundingSource },
        update: data.fundingSource ? { fundingSource: data.fundingSource } : {},
      });
      await tx.projectStageState.createMany({
        data: [{ projectId, stage: 'STAGE_ONE', status: 'TODO' }],
        skipDuplicates: true,
      });
      await tx.projectStageState.updateMany({
        where: { projectId, stage: 'STAGE_ONE', status: 'NOT_INITIALIZED' },
        data: { status: 'TODO', version: { increment: 1 } },
      });
      for (const { step } of SIMPLE_STAGE_ONE_STEPS) {
        await tx.projectStageStep.upsert({
          where: {
            projectId_stage_step: { projectId, stage: 'STAGE_ONE', step },
          },
          create: { projectId, stage: 'STAGE_ONE', step, status: 'TODO' },
          update: {},
        });
      }
      await this.initializeSimpleDocumentDefinitions(tx, actor, projectId);

      const pending = await tx.projectStageApproval.findFirst({
        where: { projectId, stage: 'STAGE_ONE', status: 'PENDING' },
        select: { id: true },
      });
      const markedPending = pending
        ? await tx.activity.findFirst({
            where: {
              organizationId: actor.organizationId,
              entityType: 'Project',
              entityId: projectId,
              event: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
              metadata: { path: ['approvalId'], equals: pending.id },
            },
            select: { id: true },
          })
        : null;
      let simpleApprovalId = pending && markedPending ? pending.id : null;
      if (actor.permissions.includes(permissions.stageOneSubmit)) {
        const reviewer = pending
          ? undefined
          : (
              await this.approvers.resolve(
                actor.organizationId,
                projectId,
                permissions.stageOneReview,
                actor.userId,
                tx,
              )
            ).find(({ id }) => id !== project.createdBy);
        if (reviewer) {
          const latest = await tx.projectStageApproval.aggregate({
            where: { projectId, stage: 'STAGE_ONE' },
            _max: { version: true },
          });
          const reviewStep = await tx.projectStageStep.updateMany({
            where: {
              projectId,
              stage: 'STAGE_ONE',
              step: 'KICKOFF_APPROVAL',
              status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] },
            },
            data: { status: 'IN_REVIEW', version: { increment: 1 } },
          });
          const approval = reviewStep.count
            ? await tx.projectStageApproval.create({
                data: {
                  projectId,
                  stage: 'STAGE_ONE',
                  version: (latest._max.version ?? 0) + 1,
                  status: 'PENDING',
                  submittedBy: actor.userId,
                  submittedAt: new Date(),
                  reviewedBy: reviewer.id,
                  idempotencyKey: `simple-initiation:${data.idempotencyKey}`,
                },
              })
            : null;
          if (approval) {
            simpleApprovalId = approval.id;
            await tx.notification.createMany({
              data: [
                {
                  organizationId: actor.organizationId,
                  recipientId: reviewer.id,
                  actorId: actor.userId,
                  type: 'PROJECT_STAGE_ONE_APPROVAL_REQUESTED',
                  title: 'Yêu cầu phê duyệt GĐ 1',
                  entityType: 'Project',
                  entityId: projectId,
                  projectId,
                  href: `/projects/${projectId}/stage-1?step=5`,
                  idempotencyKey: `simple-stage-one-approval:${approval.id}:${reviewer.id}`,
                },
              ],
              skipDuplicates: true,
            });
          }
        }
      }

      const after = {
        name: data.name,
        estimatedInvestmentAmount: investment.toFixed(2),
        currency: project.currency,
        fundingSource:
          data.fundingSource ?? project.stageOnePlan?.fundingSource ?? null,
        customerId: data.customerId,
        primaryContactId: data.primaryContactId ?? null,
      };
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
          entityType: 'Project',
          entityId: projectId,
          metadata: {
            idempotencyKey: data.idempotencyKey,
            approvalId: simpleApprovalId,
          },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
        entityType: 'Project',
        entityId: projectId,
        beforeData: {
          name: project.name,
          estimatedInvestmentAmount: project.estimatedValue?.toFixed(2) ?? null,
          currency: project.currency,
          fundingSource: project.stageOnePlan?.fundingSource ?? null,
          customerId: project.customerId,
          primaryContactId: project.primaryContactId,
        },
        afterData: after,
        metadata: { idempotencyKey: data.idempotencyKey },
      });
      return this.simpleRead(tx, actor, projectId, commandPermissions);
    });
  }

  async completeSimpleStep(
    actor: CurrentActor,
    projectId: string,
    step: StageOneStep,
  ) {
    this.requireUpdate(actor);
    if (!stageOneSteps.includes(step))
      throw new BadRequestException('Invalid Stage 1 step');
    const stepNumber =
      SIMPLE_STAGE_ONE_STEPS.findIndex(
        ({ step: candidate }) => candidate === step,
      ) + 1;
    const nextStep =
      stepNumber === SIMPLE_STAGE_ONE_STEPS.length
        ? null
        : ((stepNumber + 1) as 2 | 3 | 4 | 5);
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(tx, actor, projectId);
      if (step === 'KICKOFF_APPROVAL') {
        const lockedStage = await tx.$queryRaw<{ projectId: string }[]>(
          Prisma.sql`
            SELECT "projectId" FROM "ProjectStageState"
            WHERE "projectId" = ${projectId}::uuid
              AND "stage" = 'STAGE_ONE'::"ProjectStage"
            FOR UPDATE
          `,
        );
        if (!lockedStage.length)
          throw new ConflictException('GĐ 1 chưa được khởi tạo.');
      }
      const [steps, stageState] = await Promise.all([
        tx.projectStageStep.findMany({
          where: { projectId, stage: 'STAGE_ONE' },
          select: { step: true, status: true },
        }),
        tx.projectStageState.findUnique({
          where: { projectId_stage: { projectId, stage: 'STAGE_ONE' } },
          select: { status: true },
        }),
      ]);
      if (!stageState) throw new ConflictException('GĐ 1 chưa được khởi tạo.');
      if (
        [
          'NOT_INITIALIZED',
          'NOT_APPLICABLE',
          'BYPASSED_WITH_APPROVAL',
          'CANCELLED',
        ].includes(stageState.status)
      )
        throw new ConflictException(
          'Trạng thái GĐ 1 không cho phép hoàn tất bước.',
        );
      const statuses = new Map(steps.map((item) => [item.step, item.status]));
      const completionActivities = await tx.activity.findMany({
        where: {
          organizationId: actor.organizationId,
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_STEP_COMPLETED',
        },
        select: { metadata: true },
        orderBy: { createdAt: 'desc' },
      });
      const completionMetadata = completionActivities.map(({ metadata }) =>
        metadataRecord(metadata),
      );
      const completedSteps = new Set(
        steps
          .filter(({ status }) => status === 'DONE')
          .map(({ step: completedStep }) => completedStep),
      );
      const priorCompletion = completionMetadata.find(
        (metadata) => metadata['step'] === step,
      );
      if (stageState.status === 'DONE' && !priorCompletion)
        throw new ConflictException(
          'Trạng thái GĐ 1 không cho phép hoàn tất bước.',
        );
      if (priorCompletion && statuses.get(step) === 'DONE') {
        return {
          completed: true as const,
          nextStep,
          stageCompleted: priorCompletion['stageCompleted'] === true,
        };
      }

      const beforeStatus = statuses.get(step);
      const completedByLegacyWorkflow = beforeStatus === 'DONE';
      if (!completedByLegacyWorkflow) {
        const completed = await tx.projectStageStep.updateMany({
          where: {
            projectId,
            stage: 'STAGE_ONE',
            step,
            status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
          },
          data: { status: 'DONE', version: { increment: 1 } },
        });
        if (!completed.count)
          throw new ConflictException('Bước GĐ 1 đã thay đổi.');
      }
      completedSteps.add(step);
      const stageCompleted = SIMPLE_STAGE_ONE_STEPS.every(
        ({ step: candidate }) => completedSteps.has(candidate),
      );
      if (stageCompleted) {
        const completedStage = await tx.projectStageState.updateMany({
          where: {
            projectId,
            stage: 'STAGE_ONE',
            status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
          },
          data: {
            status: 'DONE',
            completedBy: actor.userId,
            completedAt: new Date(),
            version: { increment: 1 },
          },
        });
        if (!completedStage.count)
          throw new ConflictException('Trạng thái GĐ 1 đã thay đổi.');
      }
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_STEP_COMPLETED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { step, stageCompleted, nextStep },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'PROJECT_STAGE_ONE_SIMPLE_STEP_COMPLETED',
        entityType: 'Project',
        entityId: projectId,
        beforeData: { step, status: beforeStatus },
        afterData: { step, status: 'DONE', stageCompleted },
      });
      return {
        completed: true as const,
        nextStep,
        stageCompleted,
      };
    });
  }

  private async commandProject(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
  ) {
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, 'project.update'),
      },
      select: {
        id: true,
        projectType: true,
        stageOnePlan: { select: planSelect(actor) },
        stageStates: {
          where: { stage: 'STAGE_ONE' },
          select: { status: true },
          take: 1,
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const projectType = project.projectType ?? undefined;
    if (!isProjectType(projectType))
      throw new BadRequestException('Canonical Project type is required');
    return { ...project, projectType };
  }

  async initialize(actor: CurrentActor, projectId: string) {
    this.requireUpdate(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(
        tx,
        actor,
        projectId,
        'NOT_FOUND',
        'project.update',
      );
      const project = await this.commandProject(tx, actor, projectId);
      const routing = routeProject({ projectType: project.projectType });
      if (
        ['NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'].includes(
          project.stageStates[0]?.status ?? '',
        )
      )
        return { initialized: false, routing };
      const { count: initialized } = await tx.projectStageState.createMany({
        data: [{ projectId, stage: 'STAGE_ONE', status: 'TODO' }],
        skipDuplicates: true,
      });
      for (const step of stageOneSteps)
        await tx.projectStageStep.upsert({
          where: {
            projectId_stage_step: { projectId, stage: 'STAGE_ONE', step },
          },
          create: {
            projectId,
            stage: 'STAGE_ONE',
            step,
            status:
              (step === 'SURVEY' && !routing.requiresSurvey) ||
              (step === 'FINANCIAL_PLANNING' &&
                !routing.requiresPreliminaryFinance)
                ? 'DONE'
                : 'TODO',
            ...(((step === 'SURVEY' && !routing.requiresSurvey) ||
              (step === 'FINANCIAL_PLANNING' &&
                !routing.requiresPreliminaryFinance)) && {
              notApplicableReason: routingNotApplicable,
              notApplicableBy: null,
              notApplicableAt: null,
            }),
          },
          update: {},
        });
      for (const [step, applicable] of [
        ['SURVEY', routing.requiresSurvey],
        ['FINANCIAL_PLANNING', routing.requiresPreliminaryFinance],
      ] as const)
        if (applicable)
          await tx.projectStageStep.updateMany({
            where: {
              projectId,
              stage: 'STAGE_ONE',
              step,
              status: 'DONE',
              notApplicableReason: routingNotApplicable,
            },
            data: {
              status: 'TODO',
              notApplicableReason: null,
              notApplicableBy: null,
              notApplicableAt: null,
              version: { increment: 1 },
            },
          });
        else
          await tx.projectStageStep.updateMany({
            where: {
              projectId,
              stage: 'STAGE_ONE',
              step,
              status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
            },
            data: {
              status: 'DONE',
              notApplicableReason: routingNotApplicable,
              notApplicableBy: null,
              notApplicableAt: null,
              version: { increment: 1 },
            },
          });
      await tx.projectStageOnePlan.upsert({
        where: { projectId },
        create: { projectId },
        update: {},
      });
      const applicableDocumentPairs = routing.documentTypes.map(
        (documentType) => ({
          workstreamKey: documentDefaults[documentType].workstreamKey,
          documentType,
        }),
      );
      for (const documentType of routing.documentTypes) {
        const defaults = documentDefaults[documentType];
        await tx.projectRequiredDocument.upsert({
          where: {
            projectId_stageKey_workstreamKey_documentType_initialMatrix: {
              projectId,
              stageKey: 'STAGE_1',
              workstreamKey: defaults.workstreamKey,
              documentType,
              initialMatrix: false,
            },
          },
          create: {
            organizationId: actor.organizationId,
            projectId,
            stageKey: 'STAGE_1',
            documentType,
            required: false,
            status: 'MISSING',
            ...defaults,
          },
          update: { required: false },
        });
      }
      for (const [currentFileAssetId, status] of [
        [null, 'MISSING'],
        [{ not: null }, 'UPLOADED'],
      ] as const)
        await tx.projectRequiredDocument.updateMany({
          where: {
            projectId,
            stageKey: 'STAGE_1',
            OR: applicableDocumentPairs,
            status: 'NOT_APPLICABLE',
            notApplicableReason: routingNotApplicable,
            currentFileAssetId,
          },
          data: {
            required: false,
            status,
            notApplicableReason: null,
            markedBy: null,
            markedAt: null,
          },
        });
      const obsoleteDocumentPairs = (
        Object.keys(documentDefaults) as StageOneDocumentType[]
      )
        .filter((documentType) => !routing.documentTypes.includes(documentType))
        .map((documentType) => ({
          workstreamKey: documentDefaults[documentType].workstreamKey,
          documentType,
        }));
      if (obsoleteDocumentPairs.length) {
        await tx.projectRequiredDocument.updateMany({
          where: {
            projectId,
            stageKey: 'STAGE_1',
            OR: obsoleteDocumentPairs,
            status: {
              notIn: ['APPROVED', 'REJECTED', 'NOT_APPLICABLE', 'SUPERSEDED'],
            },
          },
          data: {
            required: false,
            status: 'NOT_APPLICABLE',
            notApplicableReason: routingNotApplicable,
            markedBy: null,
            markedAt: null,
          },
        });
        await tx.projectRequiredDocument.updateMany({
          where: {
            projectId,
            stageKey: 'STAGE_1',
            OR: obsoleteDocumentPairs,
          },
          data: { required: false },
        });
      }
      await tx.projectRequiredDocument.updateMany({
        where: { projectId, stageKey: 'STAGE_1', required: true },
        data: { required: false },
      });
      if (initialized)
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'PROJECT_STAGE_ONE_INITIALIZED',
            entityType: 'Project',
            entityId: projectId,
          },
        });
      return { initialized: Boolean(initialized), routing };
    });
  }

  private planData(
    data: UpdateStageOnePlanDto,
    current?: Record<string, unknown> | null,
  ) {
    const moneyChanged =
      data.preliminaryRevenue !== undefined ||
      data.preliminaryCost !== undefined;
    const revenue =
      data.preliminaryRevenue !== undefined
        ? data.preliminaryRevenue
        : current?.preliminaryRevenue;
    const cost =
      data.preliminaryCost !== undefined
        ? data.preliminaryCost
        : current?.preliminaryCost;
    const values = {
      source: data.source,
      legalEntityText: data.legalEntityText,
      scopeFlags: data.scopeFlags as Prisma.InputJsonValue | undefined,
      scopeNotes: data.scopeNotes,
      plannedSurveyAt: data.plannedSurveyAt
        ? new Date(data.plannedSurveyAt)
        : undefined,
      plannedProposalAt: data.plannedProposalAt
        ? new Date(data.plannedProposalAt)
        : undefined,
      plannedFinancialPlanAt: data.plannedFinancialPlanAt
        ? new Date(data.plannedFinancialPlanAt)
        : undefined,
      plannedKickoffAt: data.plannedKickoffAt
        ? new Date(data.plannedKickoffAt)
        : undefined,
      siteConstraints: data.siteConstraints,
      proposalBaseline: data.proposalBaseline,
      proposalMilestones: data.proposalMilestones as
        | Prisma.InputJsonValue
        | undefined,
      proposalWbs: data.proposalWbs as Prisma.InputJsonValue | undefined,
      riskNotes: data.riskNotes,
      resourceNotes: data.resourceNotes,
      preliminaryRevenue:
        data.preliminaryRevenue === undefined
          ? undefined
          : data.preliminaryRevenue === null
            ? null
            : new Prisma.Decimal(data.preliminaryRevenue),
      preliminaryCost:
        data.preliminaryCost === undefined
          ? undefined
          : data.preliminaryCost === null
            ? null
            : new Prisma.Decimal(data.preliminaryCost),
      preliminaryMargin: moneyChanged
        ? revenue == null || cost == null
          ? null
          : new Prisma.Decimal(String(revenue)).minus(
              new Prisma.Decimal(String(cost)),
            )
        : undefined,
      preliminaryCurrency:
        data.preliminaryCurrency === null
          ? null
          : (data.preliminaryCurrency ??
            (moneyChanged && !current?.preliminaryCurrency
              ? 'VND'
              : undefined)),
      preliminaryFinancialPlanDate: data.preliminaryFinancialPlanDate
        ? new Date(data.preliminaryFinancialPlanDate)
        : undefined,
    };
    return Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    ) as typeof values;
  }

  private samePlanValue(current: unknown, value: unknown) {
    if (current instanceof Date && value instanceof Date)
      return current.getTime() === value.getTime();
    if (current instanceof Prisma.Decimal || value instanceof Prisma.Decimal)
      return String(current) === String(value);
    return isDeepStrictEqual(current, value);
  }

  async updatePlan(
    actor: CurrentActor,
    projectId: string,
    data: UpdateStageOnePlanDto,
  ) {
    this.requireUpdate(actor);
    this.requireFinancialWrites(actor, data);
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(tx, actor, projectId);
      const project = await this.commandProject(tx, actor, projectId);
      const scopeNotes =
        data.scopeNotes === undefined
          ? project.stageOnePlan?.scopeNotes
          : data.scopeNotes;
      if (
        project.projectType === 'CUSTOM' &&
        (typeof scopeNotes !== 'string' || !scopeNotes.trim())
      )
        throw new BadRequestException(
          'Custom Project scope description is required',
        );
      const update = this.planData(
        data,
        project.stageOnePlan as Record<string, unknown> | null,
      );
      const fields = Object.keys(update) as (keyof UpdateStageOnePlanDto)[];
      const changedFields = fields.filter(
        (field) =>
          !this.samePlanValue(project.stageOnePlan?.[field], update[field]),
      );
      if (!changedFields.length && project.stageOnePlan)
        return project.stageOnePlan;
      const plan = await tx.projectStageOnePlan.upsert({
        where: { projectId },
        create: { projectId, ...update },
        update,
        select: planSelect(actor),
      });
      if (changedFields.length)
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'PROJECT_STAGE_ONE_PLAN_UPDATED',
            entityType: 'Project',
            entityId: projectId,
            metadata: { fields: changedFields },
          },
        });
      return plan;
    });
  }

  async updateGovernance(
    actor: CurrentActor,
    projectId: string,
    data: UpdateStageOneGovernanceDto,
  ) {
    this.requireUpdate(actor);
    const userIds = [data.principalUserId, ...data.coordinatorUserIds];
    if (new Set(userIds).size !== userIds.length)
      throw new BadRequestException('Governance users must be unique');

    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(tx, actor, projectId);

      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, 'project.update'),
        },
        select: {
          projectOwnerId: true,
          stageOnePlan: {
            select: {
              governanceCoordinatorUserIds: true,
              responsibilityNotes: true,
            },
          },
          stageSteps: {
            where: { stage: 'STAGE_ONE', step: 'ASSIGNMENT' },
            select: { id: true, ownerUserId: true },
            take: 1,
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');
      const assignment = project.stageSteps[0];
      if (!assignment)
        throw new ConflictException('Assignment step is not initialized');

      const members = await tx.projectMember.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          userId: { in: userIds },
          user: {
            status: 'active',
            organizationMembers: {
              some: { organizationId: actor.organizationId, status: 'active' },
            },
          },
        },
        select: { userId: true },
      });
      if (members.length !== userIds.length)
        throw new BadRequestException(
          'Governance users must be active Project members',
        );

      const before = {
        principalUserId: project.projectOwnerId,
        coordinatorUserIds:
          project.stageOnePlan?.governanceCoordinatorUserIds ?? [],
        responsibilityNotes: project.stageOnePlan?.responsibilityNotes ?? null,
      };
      const after = {
        principalUserId: data.principalUserId,
        coordinatorUserIds: data.coordinatorUserIds,
        responsibilityNotes: data.responsibilityNotes,
      };
      const changed =
        !isDeepStrictEqual(before, after) ||
        assignment.ownerUserId !== data.principalUserId;
      if (changed) {
        if (project.projectOwnerId !== data.principalUserId)
          await tx.project.update({
            where: { id: projectId },
            data: { projectOwnerId: data.principalUserId },
          });
        if (
          !isDeepStrictEqual(
            before.coordinatorUserIds,
            after.coordinatorUserIds,
          ) ||
          before.responsibilityNotes !== after.responsibilityNotes ||
          !project.stageOnePlan
        )
          await tx.projectStageOnePlan.upsert({
            where: { projectId },
            create: {
              projectId,
              governanceCoordinatorUserIds: data.coordinatorUserIds,
              responsibilityNotes: data.responsibilityNotes,
            },
            update: {
              governanceCoordinatorUserIds: data.coordinatorUserIds,
              responsibilityNotes: data.responsibilityNotes,
            },
          });
        if (assignment.ownerUserId !== data.principalUserId)
          await tx.projectStageStep.update({
            where: { id: assignment.id },
            data: { ownerUserId: data.principalUserId },
          });
        await tx.activity.create({
          data: {
            organizationId: actor.organizationId,
            actorId: actor.userId,
            event: 'PROJECT_STAGE_ONE_GOVERNANCE_UPDATED',
            entityType: 'Project',
            entityId: projectId,
            metadata: { fields: ['governance'] },
          },
        });
        await this.audit.write(tx, actor, {
          action: 'PROJECT_STAGE_ONE_GOVERNANCE_UPDATED',
          entityType: 'Project',
          entityId: projectId,
          beforeData: before,
          afterData: after,
        });
      }

      const [availableMembers, approvers] = await Promise.all([
        tx.projectMember.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId,
            user: {
              status: 'active',
              organizationMembers: {
                some: {
                  organizationId: actor.organizationId,
                  status: 'active',
                },
              },
            },
          },
          select: {
            user: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { user: { displayName: 'asc' } },
        }),
        this.approvers.resolve(
          actor.organizationId,
          projectId,
          permissions.stageOneReview,
          actor.userId,
          tx,
        ),
      ]);
      return {
        ...after,
        availableMembers: availableMembers.map(({ user }) => user),
        approvers,
        responsibilityNoteMaxLength: 1000,
      };
    });
  }

  async completeStep(
    actor: CurrentActor,
    projectId: string,
    step: StageOneStep,
  ) {
    this.requireUpdate(actor);
    if (step === 'SURVEY') return this.completeSurvey(actor, projectId);
    if (step === 'PROPOSAL') return this.completeProposal(actor, projectId);
    if (step === 'FINANCIAL_PLANNING') {
      if (
        !actor.permissions.includes(permissions.stageOneFinanceRead) ||
        !actor.permissions.includes(permissions.stageOneFinanceManage)
      )
        throw new ForbiddenException('Insufficient permission');
      return this.completeFinance(actor, projectId);
    }
    if (step !== 'ASSIGNMENT')
      throw new BadRequestException('Unsupported Stage 1 step');
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, 'project.update'),
        },
        select: {
          id: true,
          code: true,
          name: true,
          customerId: true,
          projectType: true,
          projectOwnerId: true,
          projectManagerId: true,
          expectedCompletionDate: true,
          projectManager: {
            select: {
              id: true,
              status: true,
              organizationMembers: {
                where: {
                  organizationId: actor.organizationId,
                  status: 'active',
                },
                select: { id: true },
                take: 1,
              },
            },
          },
          members: {
            where: {
              organizationId: actor.organizationId,
              user: {
                status: 'active',
                organizationMembers: {
                  some: {
                    organizationId: actor.organizationId,
                    status: 'active',
                  },
                },
              },
            },
            select: { id: true, userId: true },
          },
          departments: {
            where: { organizationId: actor.organizationId },
            select: { id: true },
            take: 1,
          },
          stageOnePlan: {
            select: {
              governanceCoordinatorUserIds: true,
              responsibilityNotes: true,
            },
          },
          stageSteps: {
            where: { stage: 'STAGE_ONE', step: 'ASSIGNMENT' },
            select: { id: true, status: true, version: true },
            take: 1,
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');

      const route = `/projects/${projectId}/stage-1/initiation`;
      const governanceRoute = `/projects/${projectId}/stage-1#governance`;
      const assignment = project.stageSteps[0];
      if (assignment?.status === 'DONE')
        return {
          completed: true as const,
          alreadyComplete: true,
          step,
          status: 'DONE' as const,
          version: assignment.version,
          checklist: [],
          blockers: [],
        };
      type GovernanceChecklistMetadata = {
        field: string;
        remediation: string;
        actionLabel: string;
      };
      const governanceChecklist: Array<
        [string, string, boolean, GovernanceChecklistMetadata]
      > = deriveStageOneGovernanceChecks({
        principalUserId: project.projectOwnerId ?? undefined,
        activeGovernanceMemberUserIds: project.members.map(
          ({ userId }) => userId,
        ),
        governanceCoordinatorUserIds:
          project.stageOnePlan?.governanceCoordinatorUserIds ?? [],
        responsibilityNotes: project.stageOnePlan?.responsibilityNotes,
        responsibleDepartmentCount: project.departments.length,
      }).map(({ code, satisfied }) => {
        const metadata = {
          GOVERNANCE_PRINCIPAL_MISSING: {
            label: 'Người chủ trì dự án',
            field: 'principalUserId',
            remediation:
              'Chọn người chủ trì là thành viên dự án đang hoạt động.',
            actionLabel: 'CHỌN NGƯỜI CHỦ TRÌ',
          },
          GOVERNANCE_PRINCIPAL_INACTIVE: {
            label: 'Người chủ trì dự án đang hoạt động',
            field: 'principalUserId',
            remediation:
              'Chọn lại người chủ trì là thành viên dự án đang hoạt động.',
            actionLabel: 'CHỌN LẠI NGƯỜI CHỦ TRÌ',
          },
          GOVERNANCE_COORDINATOR_INVALID: {
            label: 'Điều phối viên dự án',
            field: 'coordinatorUserIds',
            remediation:
              'Chọn lại điều phối viên là thành viên dự án đang hoạt động.',
            actionLabel: 'CẬP NHẬT ĐIỀU PHỐI VIÊN',
          },
          RESPONSIBILITY_NOTES_MISSING: {
            label: 'Mô tả trách nhiệm',
            field: 'responsibilityNotes',
            remediation:
              'Bổ sung nội dung trách nhiệm tại mục Ban điều hành & phân công.',
            actionLabel: 'BỔ SUNG MÔ TẢ TRÁCH NHIỆM',
          },
          PROJECT_DEPARTMENT_MISSING: {
            label: 'Phòng ban dự án phụ trách',
            field: 'departmentIds',
            remediation: 'Bổ sung phòng ban dự án phụ trách.',
            actionLabel: 'BỔ SUNG PHÒNG BAN',
          },
        }[code];
        return [code, metadata.label, satisfied, metadata];
      });
      const baseChecklist: Array<[string, string, boolean, undefined]> = [
        [
          'PROJECT_CODE_MISSING',
          'Mã dự án',
          Boolean(project.code.trim()),
          undefined,
        ],
        [
          'PROJECT_NAME_MISSING',
          'Tên dự án',
          Boolean(project.name.trim()),
          undefined,
        ],
        [
          'CUSTOMER_MISSING_WHEN_REQUIRED',
          'Khách hàng',
          Boolean(project.customerId),
          undefined,
        ],
        [
          'PROJECT_TYPE_MISSING',
          'Loại dự án',
          isProjectType(project.projectType ?? undefined),
          undefined,
        ],
        [
          'PROJECT_MANAGER_MISSING',
          'Quản lý dự án đang hoạt động',
          Boolean(
            project.projectManagerId &&
              project.projectManager?.status === 'active' &&
              project.projectManager.organizationMembers.length,
          ),
          undefined,
        ],
        [
          'PROJECT_MEMBER_MISSING',
          'Thành viên dự án đang hoạt động',
          Boolean(project.members.length),
          undefined,
        ],
      ];
      const checklist = [...baseChecklist, ...governanceChecklist].map(
        ([code, label, satisfied, governance]) => {
          if (satisfied) return { code, label, satisfied };
          return {
            code,
            label,
            satisfied,
            ...(governance
              ? {
                  ...governance,
                  section: 'governance',
                  route: governanceRoute,
                }
              : {
                  route,
                  remediation: `Bổ sung ${label.toLowerCase()}.`,
                }),
          };
        },
      );
      const blockers = checklist
        .filter(({ satisfied }) => !satisfied)
        .map(({ code, label, ...item }) => ({
          code,
          title:
            code === 'RESPONSIBILITY_NOTES_MISSING'
              ? 'Chưa ghi rõ trách nhiệm và phạm vi công việc của Ban điều hành dự án.'
              : `Thiếu ${label.toLowerCase()}`,
          entityType: 'Project' as const,
          entityId: projectId,
          ...item,
        }));
      if (blockers.length)
        return { completed: false as const, step, checklist, blockers };

      if (!assignment)
        throw new ConflictException({
          message: 'Assignment step is not initialized',
          code: 'ASSIGNMENT_STEP_MISSING',
          entityType: 'Project',
          entityId: projectId,
          route,
          remediation: 'Initialize Stage 1 and try again.',
        });
      const completedVersion = assignment.version + 1;
      const updated = await tx.projectStageStep.updateMany({
        where: {
          id: assignment.id,
          version: assignment.version,
          status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
        },
        data: { status: 'DONE', version: { increment: 1 } },
      });
      if (!updated.count)
        throw new ConflictException({
          message: 'Assignment step changed',
          code: 'OPTIMISTIC_CONFLICT',
          entityType: 'ProjectStageStep',
          entityId: assignment.id,
          route,
          remediation: 'Refresh the Project and try again.',
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_ASSIGNMENT_COMPLETED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { stage: 'STAGE_ONE', step, route },
        },
      });
      return {
        completed: true as const,
        alreadyComplete: false,
        step,
        status: 'DONE' as const,
        version: completedVersion,
        checklist,
        blockers: [],
      };
    });
  }

  private completeSurvey(actor: CurrentActor, projectId: string) {
    const step = 'SURVEY' as const;
    const route = `/projects/${projectId}/stage-1/survey`;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, 'project.update'),
        },
        select: {
          id: true,
          projectType: true,
          projectManagerId: true,
          projectManager: {
            select: {
              status: true,
              organizationMembers: {
                where: {
                  organizationId: actor.organizationId,
                  status: 'active',
                },
                select: { id: true },
                take: 1,
              },
            },
          },
          stageOnePlan: { select: { siteConstraints: true } },
          stageSteps: {
            where: { stage: 'STAGE_ONE', step },
            select: {
              id: true,
              ownerUserId: true,
              status: true,
              version: true,
            },
            take: 1,
          },
          surveys: {
            where: {
              organizationId: actor.organizationId,
              deletedAt: null,
            },
            orderBy: { updatedAt: 'desc' },
            select: { id: true, scheduledAt: true, surveyedAt: true },
            take: 1,
          },
          attachments: {
            where: {
              entityType: 'Project',
              entityId: projectId,
              projectId,
              fileAsset: {
                organizationId: actor.organizationId,
                category: 'SURVEY',
                deletedAt: null,
              },
            },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');

      const surveyStep = project.stageSteps[0];
      if (surveyStep?.status === 'DONE')
        return {
          completed: true as const,
          alreadyComplete: true,
          step,
          status: 'DONE' as const,
          version: surveyStep.version,
        };

      const blockers: Array<{
        code: string;
        title: string;
        entityType: 'Project';
        entityId: string;
        route: string;
        remediation: string;
      }> = [];
      const add = (code: string, title: string, remediation: string) =>
        blockers.push({
          code,
          title,
          entityType: 'Project',
          entityId: projectId,
          route,
          remediation,
        });
      const projectType = project.projectType ?? undefined;
      if (!isProjectType(projectType))
        add(
          'PROJECT_TYPE_MISSING',
          'Project type is missing',
          'Select a canonical Project type.',
        );
      else if (!routeProject({ projectType }).requiresSurvey)
        add(
          'SURVEY_NOT_REQUIRED',
          'Survey is not required',
          'Reinitialize Stage 1 to apply canonical routing.',
        );
      const survey = project.surveys[0];
      if (!survey?.scheduledAt)
        add(
          'SURVEY_SCHEDULE_MISSING',
          'Survey schedule is missing',
          'Schedule the Project survey.',
        );
      if (!survey?.surveyedAt)
        add(
          'SURVEY_RECORD_MISSING',
          'Survey completion is not recorded',
          'Record the actual surveyed date.',
        );
      const activeStepOwner = surveyStep?.ownerUserId
        ? await tx.projectMember.findFirst({
            where: {
              projectId,
              organizationId: actor.organizationId,
              userId: surveyStep.ownerUserId,
              user: {
                status: 'active',
                organizationMembers: {
                  some: {
                    organizationId: actor.organizationId,
                    status: 'active',
                  },
                },
              },
            },
            select: { id: true },
          })
        : null;
      const activeProjectManager =
        project.projectManagerId &&
        project.projectManager?.status === 'active' &&
        project.projectManager.organizationMembers.length;
      if (!activeStepOwner && !activeProjectManager)
        add(
          'SURVEY_OWNER_MISSING',
          'Survey owner is missing',
          'Assign the Survey step or an active Project Manager.',
        );
      if (!project.stageOnePlan?.siteConstraints?.trim())
        add(
          'SITE_CONSTRAINTS_MISSING',
          'Site constraints are missing',
          'Record site, access, delivery, and installation constraints.',
        );
      if (!project.attachments.length)
        add(
          'SURVEY_EVIDENCE_MISSING',
          'Survey evidence is missing',
          'Attach an available Project file categorized as SURVEY.',
        );
      if (blockers.length) return { completed: false as const, step, blockers };

      if (!surveyStep)
        throw new ConflictException({
          message: 'Survey step is not initialized',
          code: 'SURVEY_STEP_MISSING',
          entityType: 'Project',
          entityId: projectId,
          route,
          remediation: 'Initialize Stage 1 and try again.',
        });
      const completedVersion = surveyStep.version + 1;
      const updated = await tx.projectStageStep.updateMany({
        where: {
          id: surveyStep.id,
          version: surveyStep.version,
          status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
        },
        data: { status: 'DONE', version: { increment: 1 } },
      });
      if (!updated.count)
        throw new ConflictException({
          message: 'Survey step changed',
          code: 'OPTIMISTIC_CONFLICT',
          entityType: 'ProjectStageStep',
          entityId: surveyStep.id,
          route,
          remediation: 'Refresh the Project and try again.',
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_SURVEY_COMPLETED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { stage: 'STAGE_ONE', step, route },
        },
      });
      return {
        completed: true as const,
        alreadyComplete: false,
        step,
        status: 'DONE' as const,
        version: completedVersion,
      };
    });
  }

  private completeProposal(actor: CurrentActor, projectId: string) {
    const step = 'PROPOSAL' as const;
    const route = `/projects/${projectId}/stage-1/requirements`;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, 'project.update'),
        },
        select: {
          id: true,
          description: true,
          stageOnePlan: {
            select: {
              scopeNotes: true,
              proposalBaseline: true,
              proposalMilestones: true,
              proposalWbs: true,
              riskNotes: true,
              resourceNotes: true,
            },
          },
          locations: {
            where: { active: true },
            select: { id: true },
            take: 1,
          },
          stageSteps: {
            where: { stage: 'STAGE_ONE', step },
            select: { id: true, status: true, version: true },
            take: 1,
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');

      const proposalStep = project.stageSteps[0];
      if (proposalStep?.status === 'DONE')
        return {
          completed: true as const,
          alreadyComplete: true,
          step,
          status: 'DONE' as const,
          version: proposalStep.version,
        };

      const blockers: Array<{
        code: string;
        title: string;
        entityType: 'Project';
        entityId: string;
        route: string;
        remediation: string;
      }> = [];
      const add = (code: string, title: string, remediation: string) =>
        blockers.push({
          code,
          title,
          entityType: 'Project',
          entityId: projectId,
          route,
          remediation,
        });
      const plan = project.stageOnePlan;
      const scopeNotes = plan?.scopeNotes?.trim() ?? '';
      if (!project.description?.trim())
        add(
          'PROJECT_SCOPE_MISSING',
          'Project scope is missing',
          'Record the Project scope.',
        );
      if (!scopeNotes)
        add(
          'PLAN_SCOPE_MISSING',
          'Proposal scope is missing',
          'Record the proposal scope notes.',
        );
      if (!plan?.proposalBaseline?.trim())
        add(
          'PROPOSAL_BASELINE_MISSING',
          'Proposal baseline is missing',
          'Record the proposal baseline.',
        );
      if (
        !Array.isArray(plan?.proposalMilestones) ||
        !plan.proposalMilestones.length
      )
        add(
          'PROPOSAL_MILESTONES_MISSING',
          'Proposal milestones are missing',
          'Add at least one proposal milestone.',
        );
      if (!Array.isArray(plan?.proposalWbs) || !plan.proposalWbs.length)
        add(
          'PROPOSAL_WBS_MISSING',
          'Proposal WBS is missing',
          'Add at least one proposal WBS item.',
        );
      if (!plan?.riskNotes?.trim())
        add(
          'PROPOSAL_RISK_NOTES_MISSING',
          'Proposal risk notes are missing',
          'Record proposal risks.',
        );
      if (!plan?.resourceNotes?.trim())
        add(
          'PROPOSAL_RESOURCE_NOTES_MISSING',
          'Proposal resource notes are missing',
          'Record proposal resources.',
        );
      if (!hasProposalLocation(project.locations.length, scopeNotes))
        add(
          'PROJECT_LOCATION_MISSING',
          'Project location is missing',
          'Add an active Project location or state a no-location rationale as "No location: ..." in scope notes.',
        );
      if (blockers.length) return { completed: false as const, step, blockers };

      if (!proposalStep)
        throw new ConflictException({
          message: 'Proposal step is not initialized',
          code: 'PROPOSAL_STEP_MISSING',
          entityType: 'Project',
          entityId: projectId,
          route,
          remediation: 'Initialize Stage 1 and try again.',
        });
      const completedVersion = proposalStep.version + 1;
      const updated = await tx.projectStageStep.updateMany({
        where: {
          id: proposalStep.id,
          version: proposalStep.version,
          status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
        },
        data: { status: 'DONE', version: { increment: 1 } },
      });
      if (!updated.count)
        throw new ConflictException({
          message: 'Proposal step changed',
          code: 'OPTIMISTIC_CONFLICT',
          entityType: 'ProjectStageStep',
          entityId: proposalStep.id,
          route,
          remediation: 'Refresh the Project and try again.',
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_PROPOSAL_COMPLETED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { stage: 'STAGE_ONE', step, route },
        },
      });
      return {
        completed: true as const,
        alreadyComplete: false,
        step,
        status: 'DONE' as const,
        version: completedVersion,
      };
    });
  }

  private completeFinance(actor: CurrentActor, projectId: string) {
    const step = 'FINANCIAL_PLANNING' as const;
    const initiationRoute = `/projects/${projectId}/stage-1/initiation`;
    const route = `/projects/${projectId}/stage-1/requirements#finance`;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, [
            'project.update',
            permissions.stageOneFinanceRead,
            permissions.stageOneFinanceManage,
          ]),
        },
        select: {
          id: true,
          projectType: true,
          stageOnePlan: {
            select: {
              preliminaryRevenue: true,
              preliminaryCost: true,
              preliminaryMargin: true,
              preliminaryCurrency: true,
              preliminaryFinancialPlanDate: true,
            },
          },
          stageSteps: {
            where: { stage: 'STAGE_ONE', step },
            select: { id: true, status: true, version: true },
            take: 1,
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');

      const financeStep = project.stageSteps[0];
      if (financeStep?.status === 'DONE')
        return {
          completed: true as const,
          alreadyComplete: true,
          step,
          status: 'DONE' as const,
          version: financeStep.version,
        };

      const blockers: Array<{
        code: string;
        title: string;
        entityType: 'Project';
        entityId: string;
        route: string;
        remediation: string;
      }> = [];
      const add = (
        code: string,
        title: string,
        remediation: string,
        directRoute = route,
      ) =>
        blockers.push({
          code,
          title,
          entityType: 'Project',
          entityId: projectId,
          route: directRoute,
          remediation,
        });
      const projectType = project.projectType ?? undefined;
      if (!isProjectType(projectType))
        add(
          'PROJECT_TYPE_MISSING',
          'Project type is missing',
          'Select a canonical Project type.',
          initiationRoute,
        );
      else if (!routeProject({ projectType }).requiresPreliminaryFinance)
        add(
          'FINANCIAL_ROUTING_STALE',
          'Financial planning is not required',
          'Reinitialize Stage 1 to apply canonical routing.',
          initiationRoute,
        );
      const decimal = (value: unknown) => {
        if (
          !(value instanceof Prisma.Decimal) &&
          (typeof value !== 'number' || !Number.isFinite(value))
        )
          return null;
        const result = new Prisma.Decimal(value);
        return result.isNegative() ? null : result;
      };
      const plan = project.stageOnePlan;
      const revenue = decimal(plan?.preliminaryRevenue);
      const cost = decimal(plan?.preliminaryCost);
      if (!revenue)
        add(
          'PRELIMINARY_REVENUE_MISSING',
          'Preliminary revenue is missing',
          'Record preliminary revenue.',
        );
      if (!cost)
        add(
          'PRELIMINARY_COST_MISSING',
          'Preliminary cost is missing',
          'Record preliminary cost.',
        );
      if (!/^[A-Z]{3}$/.test(plan?.preliminaryCurrency ?? ''))
        add(
          'PRELIMINARY_CURRENCY_MISSING',
          'Preliminary currency is missing',
          'Record a three-letter uppercase currency.',
        );
      if (
        !(plan?.preliminaryFinancialPlanDate instanceof Date) ||
        Number.isNaN(plan.preliminaryFinancialPlanDate.getTime())
      )
        add(
          'PRELIMINARY_FINANCIAL_PLAN_DATE_MISSING',
          'Preliminary financial plan date is missing',
          'Record the preliminary financial plan date.',
        );
      if (
        plan?.preliminaryMargin !== null &&
        plan?.preliminaryMargin !== undefined
      ) {
        const margin = decimal(plan.preliminaryMargin);
        if (!margin || !revenue || !cost || !revenue.minus(cost).equals(margin))
          add(
            'PRELIMINARY_MARGIN_MISMATCH',
            'Preliminary margin does not match',
            'Set preliminary margin to preliminary revenue minus preliminary cost.',
          );
      }
      if (blockers.length) return { completed: false as const, step, blockers };

      if (!financeStep)
        throw new ConflictException({
          message: 'Financial planning step is not initialized',
          code: 'FINANCIAL_PLANNING_STEP_MISSING',
          entityType: 'Project',
          entityId: projectId,
          route,
          remediation: 'Initialize Stage 1 and try again.',
        });
      const completedVersion = financeStep.version + 1;
      const updated = await tx.projectStageStep.updateMany({
        where: {
          id: financeStep.id,
          version: financeStep.version,
          status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
        },
        data: { status: 'DONE', version: { increment: 1 } },
      });
      if (!updated.count)
        throw new ConflictException({
          message: 'Financial planning step changed',
          code: 'OPTIMISTIC_CONFLICT',
          entityType: 'ProjectStageStep',
          entityId: financeStep.id,
          route,
          remediation: 'Refresh the Project and try again.',
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_FINANCIAL_PLANNING_COMPLETED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { stage: 'STAGE_ONE', step, route },
        },
      });
      return {
        completed: true as const,
        alreadyComplete: false,
        step,
        status: 'DONE' as const,
        version: completedVersion,
      };
    });
  }

  private async assertEvidenceFile(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
    fileAssetId?: string,
  ) {
    if (!fileAssetId) return;
    if (!(await findProjectFile(tx, actor, projectId, fileAssetId)))
      throw new UnprocessableEntityException(
        'Evidence file is not authorized for this Project',
      );
  }

  private blocker(
    projectId: string,
    code: string,
    title: string,
    route: string,
    remediation: string,
    entityType = 'Project',
    entityId = projectId,
  ): StageOneBlocker {
    return { code, title, entityType, entityId, route, remediation };
  }

  async submitApproval(
    actor: CurrentActor,
    projectId: string,
    data: SubmitStageOneApprovalDto,
  ) {
    this.require(actor, permissions.stageOneSubmit);
    const route = `/projects/${projectId}/stage-1/approval`;
    return this.prisma.$transaction(async (tx) => {
      await this.lockScopedProject(tx, actor, projectId);
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, permissions.stageOneSubmit),
        },
        select: {
          id: true,
          createdBy: true,
          projectType: true,
          stageSteps: {
            where: {
              stage: 'STAGE_ONE',
              step: {
                in: [
                  'ASSIGNMENT',
                  'SURVEY',
                  'PROPOSAL',
                  'FINANCIAL_PLANNING',
                  'KICKOFF_APPROVAL',
                ],
              },
            },
            select: { step: true, status: true },
          },
          requiredDocuments: {
            where: {
              stageKey: 'STAGE_1',
              required: true,
            },
            select: {
              id: true,
              documentType: true,
              status: true,
              notApplicableReason: true,
              markedBy: true,
              markedAt: true,
              currentFileAssetId: true,
            },
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');
      const existing = await tx.projectStageApproval.findUnique({
        where: {
          projectId_idempotencyKey: {
            projectId,
            idempotencyKey: data.idempotencyKey,
          },
        },
      });
      if (existing) return existing;
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id"
        FROM "ProjectStageState"
        WHERE "projectId" = ${projectId}::uuid
          AND "stage" = 'STAGE_ONE'::"ProjectStage"
        FOR UPDATE
      `);
      if (!locked.length)
        throw new ConflictException('GĐ 1 chưa được khởi tạo.');
      const concurrent = await tx.projectStageApproval.findUnique({
        where: {
          projectId_idempotencyKey: {
            projectId,
            idempotencyKey: data.idempotencyKey,
          },
        },
      });
      if (concurrent) return concurrent;
      const pending = await tx.projectStageApproval.findFirst({
        where: { projectId, stage: 'STAGE_ONE', status: 'PENDING' },
        select: { id: true },
      });
      if (pending)
        throw new ConflictException('Đã có một phê duyệt GĐ 1 đang chờ xử lý.');

      const blockers: StageOneBlocker[] = [];
      for (const step of [
        'ASSIGNMENT',
        'SURVEY',
        'PROPOSAL',
        'FINANCIAL_PLANNING',
      ] as const)
        if (
          project.stageSteps.find((candidate) => candidate.step === step)
            ?.status !== 'DONE'
        )
          blockers.push(
            this.blocker(
              projectId,
              `${step}_STEP_INCOMPLETE`,
              `Bước ${step.replaceAll('_', ' ')} chưa hoàn tất`,
              route,
              'Hoàn tất bước GĐ 1 đang áp dụng.',
              'ProjectStageStep',
            ),
          );
      const projectType = project.projectType ?? undefined;
      if (!isProjectType(projectType))
        blockers.push(
          this.blocker(
            projectId,
            'PROJECT_TYPE_MISSING',
            'Thiếu loại dự án',
            `/projects/${projectId}/stage-1/initiation`,
            'Chọn một loại dự án hợp lệ.',
          ),
        );
      else {
        for (const document of project.requiredDocuments) {
          if (!requiredDocumentSatisfied(document))
            blockers.push(
              this.blocker(
                projectId,
                'REQUIRED_DOCUMENT_NOT_READY',
                'Hồ sơ bắt buộc chưa sẵn sàng để phê duyệt',
                `/projects/${projectId}/documents`,
                'Gửi mọi hồ sơ bắt buộc đang áp dụng để phê duyệt.',
                'ProjectRequiredDocument',
                document.id,
              ),
            );
        }
        for (const documentType of routeProject({ projectType })
          .documentTypes) {
          const document = project.requiredDocuments.find(
            (candidate) => candidate.documentType === documentType,
          );
          if (!document)
            blockers.push(
              this.blocker(
                projectId,
                'REQUIRED_DOCUMENT_NOT_READY',
                'Hồ sơ bắt buộc chưa sẵn sàng để phê duyệt',
                `/projects/${projectId}/documents`,
                'Gửi mọi hồ sơ bắt buộc theo định tuyến để phê duyệt.',
                'ProjectRequiredDocument',
                projectId,
              ),
            );
        }
      }
      if (blockers.length)
        throw new UnprocessableEntityException({
          message: 'Phê duyệt GĐ 1 chưa sẵn sàng để gửi.',
          blockers,
        });
      await this.assertEvidenceFile(tx, actor, projectId, data.evidenceFileId);
      const reviewer = (
        await this.approvers.resolve(
          actor.organizationId,
          projectId,
          permissions.stageOneReview,
          actor.userId,
          tx,
        )
      ).find(({ id }) => id !== project.createdBy && id !== actor.userId);
      if (!reviewer)
        throw new UnprocessableEntityException(
          'Không tìm thấy người có thẩm quyền phê duyệt GĐ 1.',
        );
      const latest = await tx.projectStageApproval.aggregate({
        where: { projectId, stage: 'STAGE_ONE' },
        _max: { version: true },
      });
      const step = await tx.projectStageStep.updateMany({
        where: {
          projectId,
          stage: 'STAGE_ONE',
          step: 'KICKOFF_APPROVAL',
          status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] },
        },
        data: { status: 'IN_REVIEW', version: { increment: 1 } },
      });
      if (!step.count)
        throw new ConflictException('Bước phê duyệt khởi động đã thay đổi.');
      const approval = await tx.projectStageApproval.create({
        data: {
          projectId,
          stage: 'STAGE_ONE',
          version: (latest._max.version ?? 0) + 1,
          status: 'PENDING',
          submittedBy: actor.userId,
          submittedAt: new Date(),
          reviewedBy: reviewer.id,
          comments: data.comments,
          evidenceFileId: data.evidenceFileId,
          idempotencyKey: data.idempotencyKey,
        },
      });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_APPROVAL_SUBMITTED',
          entityType: 'ProjectStageApproval',
          entityId: approval.id,
          metadata: { projectId, version: approval.version, route },
        },
      });
      await tx.notification.createMany({
        data: [
          {
            organizationId: actor.organizationId,
            recipientId: reviewer.id,
            actorId: actor.userId,
            type: 'PROJECT_STAGE_ONE_APPROVAL_REQUESTED',
            title: 'Yêu cầu phê duyệt GĐ 1',
            entityType: 'Project',
            entityId: projectId,
            projectId,
            href: route,
            idempotencyKey: `project-stage-one-approval:${approval.id}:${reviewer.id}`,
          },
        ],
        skipDuplicates: true,
      });
      return approval;
    });
  }

  async decideApproval(
    actor: CurrentActor,
    projectId: string,
    approvalId: string,
    data: DecideStageOneApprovalDto,
  ) {
    this.require(actor, permissions.stageOneReview);
    const route = `/projects/${projectId}/stage-1/approval`;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, permissions.stageOneReview),
        },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      const approval = await tx.projectStageApproval.findUnique({
        where: { id: approvalId },
      });
      if (
        !approval ||
        approval.projectId !== projectId ||
        approval.stage !== 'STAGE_ONE' ||
        approval.version !== data.version
      )
        throw new NotFoundException('Không tìm thấy phê duyệt GĐ 1.');
      if (approval.reviewedBy !== actor.userId)
        throw new ForbiddenException(
          'Chỉ người được phân công phê duyệt mới được quyết định.',
        );
      if (approval.submittedBy === actor.userId)
        throw new ForbiddenException(
          'Người gửi không được tự phê duyệt yêu cầu của mình.',
        );
      if (approval.status !== 'PENDING') {
        if (approval.decision === data.decision) return approval;
        throw new ConflictException('Phê duyệt GĐ 1 không ở trạng thái chờ.');
      }
      const simpleInitiation = await tx.activity.findFirst({
        where: {
          organizationId: actor.organizationId,
          entityType: 'Project',
          entityId: projectId,
          event: 'PROJECT_STAGE_ONE_SIMPLE_INITIATED',
          metadata: { path: ['approvalId'], equals: approvalId },
        },
        select: { id: true },
      });
      await this.assertEvidenceFile(tx, actor, projectId, data.evidenceFileId);
      const status =
        data.decision === 'REVISION_REQUIRED'
          ? ('DRAFT' as const)
          : ['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(data.decision)
            ? ('APPROVED' as const)
            : ('REJECTED' as const);
      const decidedAt = new Date();
      const claimed = await tx.projectStageApproval.updateMany({
        where: {
          id: approvalId,
          projectId,
          version: data.version,
          status: 'PENDING',
          reviewedBy: actor.userId,
        },
        data: {
          status,
          decision: data.decision,
          comments: data.comments,
          evidenceFileId: data.evidenceFileId,
          decidedAt,
        },
      });
      if (!claimed.count)
        throw new ConflictException('Phê duyệt GĐ 1 đã thay đổi.');
      const stepStatus =
        status === 'APPROVED'
          ? simpleInitiation
            ? 'TODO'
            : 'DONE'
          : 'BLOCKED';
      const step = await tx.projectStageStep.updateMany({
        where: {
          projectId,
          stage: 'STAGE_ONE',
          step: 'KICKOFF_APPROVAL',
          status: 'IN_REVIEW',
        },
        data: { status: stepStatus, version: { increment: 1 } },
      });
      if (!step.count)
        throw new ConflictException('Bước phê duyệt khởi động đã thay đổi.');
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: `PROJECT_STAGE_ONE_APPROVAL_${data.decision}`,
          entityType: 'ProjectStageApproval',
          entityId: approvalId,
          metadata: { projectId, version: data.version, route },
        },
      });
      if (approval.submittedBy)
        await tx.notification.createMany({
          data: [
            {
              organizationId: actor.organizationId,
              recipientId: approval.submittedBy,
              actorId: actor.userId,
              type: 'PROJECT_STAGE_ONE_APPROVAL_DECIDED',
              title: `Phê duyệt GĐ 1: ${approvalDecisionLabels[data.decision]}`,
              entityType: 'Project',
              entityId: projectId,
              projectId,
              href: route,
              idempotencyKey: `project-stage-one-decision:${approvalId}:${approval.submittedBy}`,
            },
          ],
          skipDuplicates: true,
        });
      return {
        ...approval,
        status,
        decision: data.decision,
        comments: data.comments,
        evidenceFileId: data.evidenceFileId,
        decidedAt,
      };
    });
  }

  async completeGate(actor: CurrentActor, projectId: string) {
    this.require(actor, permissions.stageOneCompleteGate);
    const initiationRoute = `/projects/${projectId}/stage-1/initiation`;
    const approvalRoute = `/projects/${projectId}/stage-1/approval`;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, permissions.stageOneCompleteGate),
        },
        select: {
          id: true,
          code: true,
          name: true,
          customerId: true,
          projectType: true,
          projectManagerId: true,
          expectedCompletionDate: true,
          phase: true,
          description: true,
          projectManager: {
            select: {
              status: true,
              organizationMembers: {
                where: {
                  organizationId: actor.organizationId,
                  status: 'active',
                },
                select: { id: true },
                take: 1,
              },
            },
          },
          members: {
            where: {
              organizationId: actor.organizationId,
              user: {
                status: 'active',
                organizationMembers: {
                  some: {
                    organizationId: actor.organizationId,
                    status: 'active',
                  },
                },
              },
            },
            select: { userId: true },
          },
          locations: {
            where: { active: true },
            select: { id: true },
            take: 1,
          },
          stageOnePlan: {
            select: {
              scopeNotes: true,
              proposalBaseline: true,
              proposalMilestones: true,
              proposalWbs: true,
              riskNotes: true,
              resourceNotes: true,
              preliminaryRevenue: true,
              preliminaryCost: true,
              preliminaryMargin: true,
              preliminaryCurrency: true,
              preliminaryFinancialPlanDate: true,
            },
          },
          stageStates: {
            where: { stage: 'STAGE_ONE' },
            select: {
              id: true,
              status: true,
              completedBy: true,
              completedAt: true,
              gateDecisionVersion: true,
              version: true,
            },
            take: 1,
          },
          stageSteps: {
            where: {
              stage: 'STAGE_ONE',
              step: {
                in: [
                  'ASSIGNMENT',
                  'SURVEY',
                  'PROPOSAL',
                  'FINANCIAL_PLANNING',
                  'KICKOFF_APPROVAL',
                ],
              },
            },
            select: {
              step: true,
              status: true,
              notApplicableReason: true,
              notApplicableBy: true,
              notApplicableAt: true,
            },
          },
          stageApprovals: {
            where: { stage: 'STAGE_ONE' },
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              id: true,
              version: true,
              status: true,
              decision: true,
            },
          },
          requiredDocuments: {
            where: {
              stageKey: 'STAGE_1',
              required: true,
            },
            select: {
              id: true,
              documentType: true,
              status: true,
              notApplicableReason: true,
              markedBy: true,
              markedAt: true,
              currentFileAssetId: true,
              ownerRole: true,
              dueDate: true,
            },
          },
          surveys: {
            where: { deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { id: true, scheduledAt: true, surveyedAt: true },
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');
      const stageState = project.stageStates[0];
      if (!stageState) throw new ConflictException('GĐ 1 chưa được khởi tạo.');
      if (stageState.status === 'DONE')
        return {
          completed: true as const,
          alreadyComplete: true,
          completedBy: stageState.completedBy,
          completedAt: stageState.completedAt,
          gateDecisionVersion: stageState.gateDecisionVersion,
          phase: project.phase,
        };

      const blockers = new Map<string, StageOneBlocker>();
      const add = (blocker: StageOneBlocker) => {
        if (!blockers.has(blocker.code)) blockers.set(blocker.code, blocker);
      };
      if (!project.code.trim() || !project.name.trim())
        add(
          this.blocker(
            projectId,
            'PROJECT_IDENTITY_MISSING',
            'Thông tin nhận diện dự án chưa đầy đủ',
            initiationRoute,
            'Nhập mã và tên dự án.',
          ),
        );
      const projectType = project.projectType ?? undefined;
      const routing = isProjectType(projectType)
        ? routeProject({ projectType })
        : null;
      for (const step of [
        'ASSIGNMENT',
        'SURVEY',
        'PROPOSAL',
        'FINANCIAL_PLANNING',
        'KICKOFF_APPROVAL',
      ] as const)
        if (
          project.stageSteps.find((candidate) => candidate.step === step)
            ?.status !== 'DONE'
        )
          add(
            this.blocker(
              projectId,
              `${step}_STEP_INCOMPLETE`,
              `Bước ${step.replaceAll('_', ' ')} chưa hoàn tất`,
              `/projects/${projectId}/stage-1`,
              'Hoàn tất bước GĐ 1 đang áp dụng.',
              'ProjectStageStep',
            ),
          );

      const surveyStep = project.stageSteps.find(
        ({ step }) => step === 'SURVEY',
      );
      const surveyNotApplicable = Boolean(
        surveyStep?.notApplicableAt &&
          surveyStep.notApplicableBy &&
          surveyStep.notApplicableReason?.trim(),
      );
      const survey = project.surveys[0];
      const plan = project.stageOnePlan;
      const proposalReady = Boolean(
        project.description?.trim() &&
          plan?.scopeNotes?.trim() &&
          hasProposalLocation(project.locations.length, plan.scopeNotes) &&
          plan.proposalBaseline?.trim() &&
          Array.isArray(plan.proposalMilestones) &&
          plan.proposalMilestones.length &&
          Array.isArray(plan.proposalWbs) &&
          plan.proposalWbs.length &&
          plan.riskNotes?.trim() &&
          plan.resourceNotes?.trim(),
      );
      if (!proposalReady)
        add(
          this.blocker(
            projectId,
            'PROPOSAL_NOT_READY',
            'Đề xuất chưa sẵn sàng',
            `/projects/${projectId}/stage-1/requirements`,
            'Hoàn tất cơ sở đề xuất GĐ 1.',
          ),
        );
      const revenue = plan?.preliminaryRevenue;
      const cost = plan?.preliminaryCost;
      const margin = plan?.preliminaryMargin;
      const financeFieldsPresent = Boolean(
        revenue !== null &&
          revenue !== undefined &&
          cost !== null &&
          cost !== undefined &&
          /^[A-Z]{3}$/.test(plan?.preliminaryCurrency ?? '') &&
          plan?.preliminaryFinancialPlanDate instanceof Date &&
          !Number.isNaN(plan.preliminaryFinancialPlanDate.getTime()),
      );
      const financeMarginMatches = Boolean(
        margin === null ||
          margin === undefined ||
          (revenue !== null &&
            revenue !== undefined &&
            cost !== null &&
            cost !== undefined &&
            new Prisma.Decimal(revenue)
              .minus(new Prisma.Decimal(cost))
              .equals(new Prisma.Decimal(margin))),
      );
      const financeReady = routing?.requiresPreliminaryFinance
        ? financeFieldsPresent && financeMarginMatches
        : true;
      if (routing?.requiresPreliminaryFinance && !financeReady)
        add(
          this.blocker(
            projectId,
            financeFieldsPresent && !financeMarginMatches
              ? 'PRELIMINARY_MARGIN_MISMATCH'
              : 'FINANCIAL_PLAN_NOT_READY',
            'Kế hoạch tài chính sơ bộ chưa sẵn sàng',
            `/projects/${projectId}/stage-1/requirements#finance`,
            'Hoàn tất kế hoạch tài chính sơ bộ đang áp dụng.',
          ),
        );
      for (const document of project.requiredDocuments)
        if (!requiredDocumentSatisfied(document))
          add(
            this.blocker(
              projectId,
              'REQUIRED_DOCUMENT_NOT_APPROVED',
              'Hồ sơ bắt buộc chưa được phê duyệt',
              `/projects/${projectId}/documents`,
              'Phê duyệt mọi hồ sơ bắt buộc đang áp dụng hoặc ghi nhận quyết định không áp dụng hợp lệ.',
              'ProjectRequiredDocument',
              document.id,
            ),
          );
      if (routing)
        for (const documentType of routing.documentTypes)
          if (
            !project.requiredDocuments.some(
              (document) => document.documentType === documentType,
            )
          )
            add(
              this.blocker(
                projectId,
                'REQUIRED_DOCUMENT_NOT_APPROVED',
                'Hồ sơ bắt buộc chưa được phê duyệt',
                `/projects/${projectId}/documents`,
                'Phê duyệt mọi hồ sơ bắt buộc theo định tuyến hoặc ghi nhận quyết định không áp dụng hợp lệ.',
                'ProjectRequiredDocument',
                projectId,
              ),
            );
      const latestApproval = project.stageApprovals[0];
      const approvalAccepted = Boolean(
        latestApproval?.status === 'APPROVED' &&
          ['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(
            latestApproval.decision ?? '',
          ),
      );
      const activeProjectManagerId =
        project.projectManagerId &&
        project.projectManager?.status === 'active' &&
        project.projectManager.organizationMembers.length
          ? project.projectManagerId
          : undefined;
      const criticalFlags = deriveStageOneRedFlags({
        projectId,
        projectName: project.name,
        customerId: project.customerId,
        projectType,
        plannedHandoverAt: project.expectedCompletionDate ?? undefined,
        projectManagerId: activeProjectManagerId,
        activeMemberCount: project.members.length,
        surveyScheduledAt: survey?.scheduledAt ?? undefined,
        surveyCompletedAt: survey?.surveyedAt ?? undefined,
        surveyNotApplicable,
        proposalReady,
        preliminaryFinanceReady:
          financeReady &&
          project.stageSteps.find(({ step }) => step === 'FINANCIAL_PLANNING')
            ?.status === 'DONE',
        approvalStatus: latestApproval?.status,
        approvalDecision: latestApproval?.decision ?? undefined,
        requiredDocumentCount: project.requiredDocuments.length,
        approvedDocumentCount: project.requiredDocuments.filter(
          requiredDocumentSatisfied,
        ).length,
        rejectedDocumentCount: project.requiredDocuments.filter(
          ({ status }) => status === 'REJECTED',
        ).length,
        hardBlockedDocumentCount: project.requiredDocuments.filter(
          requiredDocumentHardBlocked,
        ).length,
      }).filter(({ severity }) => severity === 'CRITICAL');
      for (const flag of criticalFlags)
        add(
          this.blocker(
            projectId,
            flag.code,
            flag.title,
            flag.route,
            flag.remediation,
          ),
        );
      if (!latestApproval || !latestApproval.decision)
        add(
          this.blocker(
            projectId,
            'STAGE_APPROVAL_MISSING',
            'Phê duyệt GĐ 1 chưa được chấp thuận',
            approvalRoute,
            'Hoàn tất quyết định phê duyệt GĐ 1.',
            'ProjectStageApproval',
            latestApproval?.id ?? projectId,
          ),
        );
      else if (
        !approvalAccepted &&
        !criticalFlags.some(({ code }) => code.startsWith('STAGE_APPROVAL_'))
      )
        add(
          this.blocker(
            projectId,
            'STAGE_APPROVAL_NOT_APPROVED',
            'Phê duyệt GĐ 1 chưa được chấp thuận',
            approvalRoute,
            'Hoàn tất quyết định phê duyệt GĐ 1.',
            'ProjectStageApproval',
            latestApproval.id,
          ),
        );
      if (!['SURVEY', 'REQUIREMENT'].includes(project.phase))
        add(
          this.blocker(
            projectId,
            'PROJECT_PHASE_NOT_STAGE_ONE',
            'Pha dự án không thuộc GĐ 1',
            initiationRoute,
            'Cập nhật pha dự án trước khi hoàn tất cổng.',
          ),
        );
      if (blockers.size)
        return { completed: false as const, blockers: [...blockers.values()] };

      const completedAt = new Date();
      const gateDecisionVersion = stageState.gateDecisionVersion + 1;
      const claimed = await tx.projectStageState.updateMany({
        where: {
          id: stageState.id,
          version: stageState.version,
          status: { not: 'DONE' },
        },
        data: {
          status: 'DONE',
          completedBy: actor.userId,
          completedAt,
          gateDecisionVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (!claimed.count) throw new ConflictException('Cổng GĐ 1 đã thay đổi.');
      const phase = await tx.project.updateMany({
        where: { id: projectId, phase: { in: ['SURVEY', 'REQUIREMENT'] } },
        data: {
          phase: 'DESIGN',
          updatedBy: actor.userId,
          version: { increment: 1 },
        },
      });
      if (!phase.count) throw new ConflictException('Project phase changed');
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_GATE_COMPLETED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { from: project.phase, to: 'DESIGN', gateDecisionVersion },
        },
      });
      const recipientIds = [
        project.projectManagerId,
        ...project.members.map(({ userId }) => userId),
      ].filter((id): id is string => Boolean(id && id !== actor.userId));
      if (recipientIds.length)
        await tx.notification.createMany({
          data: [...new Set(recipientIds)].map((recipientId) => ({
            organizationId: actor.organizationId,
            recipientId,
            actorId: actor.userId,
            type: 'PROJECT_STAGE_ONE_GATE_COMPLETED',
            title: 'Đã hoàn tất cổng GĐ 1',
            entityType: 'Project',
            entityId: projectId,
            projectId,
            href: `/projects/${projectId}`,
            idempotencyKey: `project-stage-one-gate:${projectId}:${gateDecisionVersion}:${recipientId}`,
          })),
          skipDuplicates: true,
        });
      return {
        completed: true as const,
        alreadyComplete: false,
        completedBy: actor.userId,
        completedAt,
        gateDecisionVersion,
        phase: 'DESIGN' as const,
      };
    });
  }

  async markSurveyNotApplicable(
    actor: CurrentActor,
    projectId: string,
    reason: string,
  ) {
    if (!actor.permissions.includes(permissions.surveyNotApplicable))
      throw new ForbiddenException('Insufficient permission');
    const step = 'SURVEY' as const;
    const route = `/projects/${projectId}/stage-1/survey`;
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, permissions.surveyNotApplicable),
        },
        select: {
          id: true,
          stageSteps: {
            where: { stage: 'STAGE_ONE', step },
            select: {
              id: true,
              status: true,
              notApplicableAt: true,
              version: true,
            },
            take: 1,
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found');
      const surveyStep = project.stageSteps[0];
      if (surveyStep?.status === 'DONE')
        return {
          completed: true as const,
          alreadyComplete: true,
          step,
          status: 'DONE' as const,
          notApplicable: Boolean(surveyStep.notApplicableAt),
          version: surveyStep.version,
        };
      const trimmedReason = reason.trim();
      if (!trimmedReason)
        throw new BadRequestException('Not-applicable reason is required');
      if (!surveyStep)
        throw new ConflictException({
          message: 'Survey step is not initialized',
          code: 'SURVEY_STEP_MISSING',
          entityType: 'Project',
          entityId: projectId,
          route,
          remediation: 'Initialize Stage 1 and try again.',
        });
      const completedVersion = surveyStep.version + 1;
      const updated = await tx.projectStageStep.updateMany({
        where: {
          id: surveyStep.id,
          version: surveyStep.version,
          status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
        },
        data: {
          status: 'DONE',
          notApplicableReason: trimmedReason,
          notApplicableBy: actor.userId,
          notApplicableAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new ConflictException({
          message: 'Survey step changed',
          code: 'OPTIMISTIC_CONFLICT',
          entityType: 'ProjectStageStep',
          entityId: surveyStep.id,
          route,
          remediation: 'Refresh the Project and try again.',
        });
      await tx.activity.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          event: 'PROJECT_STAGE_ONE_SURVEY_NOT_APPLICABLE',
          entityType: 'Project',
          entityId: projectId,
          metadata: { stage: 'STAGE_ONE', step, route },
        },
      });
      return {
        completed: true as const,
        alreadyComplete: false,
        step,
        status: 'DONE' as const,
        notApplicable: true,
        version: completedVersion,
      };
    });
  }

  async getInitiation(
    actor: CurrentActor,
    projectId: string,
    query?: Record<string, unknown>,
  ) {
    this.rejectQuery(query);
    const projectActor =
      actor.permissionSources === undefined
        ? actor
        : await this.policy.actorForProject(actor, projectId);
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...this.policy.projectWhere(actor, 'project.read'),
      },
      select: {
        id: true,
        code: true,
        name: true,
        customerId: true,
        customer: { select: { id: true, displayName: true } },
        primaryContactId: true,
        primaryContact: { select: { id: true, displayName: true } },
        projectType: true,
        entryStage: true,
        propertyType: true,
        location: true,
        address: true,
        projectOwnerId: true,
        projectOwner: { select: { id: true, displayName: true } },
        salesOwnerId: true,
        salesOwner: { select: { id: true, displayName: true } },
        designOwnerId: true,
        designOwner: { select: { id: true, displayName: true } },
        projectManagerId: true,
        projectManager: { select: { id: true, displayName: true } },
        startDate: true,
        expectedCompletionDate: true,
        actualCompletionDate: true,
        status: true,
        phase: true,
        priority: true,
        currency: true,
        description: true,
        confidentiality: true,
        healthStatus: true,
        progressPercentage: true,
        version: true,
        updatedAt: true,
        ...projectFinancialSelect(projectActor),
        members: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            userId: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
                status: true,
              },
            },
          },
        },
        departments: {
          select: {
            id: true,
            departmentId: true,
            department: { select: { id: true, code: true, name: true } },
          },
        },
        stageOnePlan: { select: planSelect(projectActor) },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const [availableMembers, approvers] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          user: {
            status: 'active',
            organizationMembers: {
              some: { organizationId: actor.organizationId, status: 'active' },
            },
          },
        },
        select: {
          user: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: { user: { displayName: 'asc' } },
      }),
      this.approvers.resolve(
        actor.organizationId,
        projectId,
        permissions.stageOneReview,
        actor.userId,
      ),
    ]);
    return {
      project: {
        ...project,
        stageOnePlan: this.visiblePlan(projectActor, project.stageOnePlan),
      },
      routing: this.visibleRouting(projectActor, project.projectType),
      governance: {
        principalUserId: project.projectOwnerId,
        coordinatorUserIds:
          project.stageOnePlan?.governanceCoordinatorUserIds ?? [],
        responsibilityNotes: project.stageOnePlan?.responsibilityNotes ?? null,
        availableMembers: availableMembers.map(({ user }) => user),
        approvers,
        responsibilityNoteMaxLength: 1000,
      },
      capabilities: documentCapabilities(projectActor),
    };
  }

  private async summary(
    actor: CurrentActor,
    projectId: string,
    prefetchedProject?: StageOneSummaryProject,
    prefetchedActor?: CurrentActor,
  ) {
    const projectActor =
      prefetchedActor ??
      (actor.permissionSources === undefined
        ? actor
        : await this.policy.actorForProject(actor, projectId));
    const finance = projectActor.permissions.includes(
      permissions.stageOneFinanceRead,
    );
    const project =
      prefetchedProject ??
      (await this.prisma.project.findFirst({
        where: {
          id: projectId,
          ...this.policy.projectWhere(actor, 'project.read'),
        },
        select: stageOneSummarySelect(projectActor),
      }));
    if (!project) throw new NotFoundException('Project not found');
    const { members: ignoredMembers, ...summaryProject } =
      project as typeof project & {
        members?: unknown;
      };
    void ignoredMembers;

    const {
      stageStates,
      stageSteps: allStageSteps,
      stageApprovals,
      requiredDocuments: allDocuments,
      surveys,
      requirements,
      departments,
      _count,
      ...projectDetails
    } = summaryProject;
    const governanceUserIds = [
      project.projectOwnerId,
      ...(project.stageOnePlan?.governanceCoordinatorUserIds ?? []),
    ].filter((userId): userId is string => Boolean(userId));
    const activeGovernanceMembers = governanceUserIds.length
      ? await this.prisma.projectMember.findMany({
          where: {
            organizationId: actor.organizationId,
            projectId,
            userId: { in: [...new Set(governanceUserIds)] },
            user: {
              status: 'active',
              organizationMembers: {
                some: {
                  organizationId: actor.organizationId,
                  status: 'active',
                },
              },
            },
          },
          select: { userId: true },
        })
      : [];
    const stageSteps = finance
      ? allStageSteps
      : allStageSteps.filter(({ step }) => step !== 'FINANCIAL_PLANNING');
    const documents = finance
      ? allDocuments
      : allDocuments.filter(
          (document) => !isStageOneFinancialDocument(document),
        );
    const now = new Date();
    const approvedDocuments = documents.filter(
      requiredDocumentSatisfied,
    ).length;
    const rejectedDocuments = documents.filter(
      ({ status }) => status === 'REJECTED',
    );
    const overdueDocuments = documents.filter(
      (document) =>
        document.dueDate &&
        document.dueDate < now &&
        !requiredDocumentSatisfied(document),
    );
    const firstDue = (items: typeof documents) =>
      items.sort(
        (left, right) =>
          (left.dueDate?.getTime() ?? Infinity) -
          (right.dueDate?.getTime() ?? Infinity),
      )[0];
    const missingDocument = firstDue(
      documents.filter(({ status }) => status === 'MISSING'),
    );
    const overdueDocument = firstDue(overdueDocuments);
    const rejectedDocument = firstDue(rejectedDocuments);
    const survey = surveys[0] ?? null;
    const latestApproval = stageApprovals[0]
      ? ({ ...stageApprovals[0] } as (typeof stageApprovals)[number] & {
          evidenceFileId?: string | null;
        })
      : null;
    if (latestApproval) delete latestApproval.evidenceFileId;
    const routing = this.routing(project.projectType);
    const initialized = Boolean(
      stageStates[0] &&
        ![
          'NOT_INITIALIZED',
          'NOT_APPLICABLE',
          'BYPASSED_WITH_APPROVAL',
        ].includes(stageStates[0].status),
    );
    const applicableStepsDone = Boolean(
      routing &&
        routing.steps
          .filter((step) => step !== 'KICKOFF_APPROVAL')
          .every(
            (step) =>
              allStageSteps.find((candidate) => candidate.step === step)
                ?.status === 'DONE',
          ),
    );
    const requiredDocumentsReady = Boolean(
      routing &&
        allDocuments.every(requiredDocumentSatisfied) &&
        routing.documentTypes.every((documentType) =>
          allDocuments.some(
            (document) =>
              document.documentType === documentType &&
              requiredDocumentSatisfied(document),
          ),
        ),
    );
    const surveyStep = stageSteps.find(({ step }) => step === 'SURVEY');
    const proposalStep = stageSteps.find(({ step }) => step === 'PROPOSAL');
    const proposalOverdue = Boolean(
      proposalStep?.dueDate &&
        proposalStep.dueDate < now &&
        !['DONE', 'CANCELLED'].includes(proposalStep.status),
    );
    const plan = project.stageOnePlan;
    const financeReady = Boolean(
      plan?.preliminaryRevenue !== null &&
        plan?.preliminaryRevenue !== undefined &&
        plan?.preliminaryCost !== null &&
        plan?.preliminaryCost !== undefined &&
        /^[A-Z]{3}$/.test(plan.preliminaryCurrency ?? '') &&
        plan.preliminaryFinancialPlanDate instanceof Date &&
        !Number.isNaN(plan.preliminaryFinancialPlanDate.getTime()) &&
        (plan.preliminaryMargin === null ||
          plan.preliminaryMargin === undefined ||
          new Prisma.Decimal(plan.preliminaryRevenue)
            .minus(new Prisma.Decimal(plan.preliminaryCost))
            .equals(new Prisma.Decimal(plan.preliminaryMargin))),
    );
    const input = {
      projectId: project.id,
      projectName: project.name,
      customerId: project.customerId,
      projectType: project.projectType ?? undefined,
      plannedHandoverAt: project.expectedCompletionDate ?? undefined,
      principalUserId: project.projectOwnerId ?? undefined,
      activeGovernanceMemberUserIds: activeGovernanceMembers.map(
        ({ userId }) => userId,
      ),
      governanceCoordinatorUserIds:
        project.stageOnePlan?.governanceCoordinatorUserIds ?? [],
      responsibilityNotes: project.stageOnePlan?.responsibilityNotes,
      responsibleDepartmentCount: departments.length,
      projectManagerId:
        project.projectManager?.status === 'active' &&
        project.projectManager.organizationMembers.length
          ? (project.projectManagerId ?? undefined)
          : undefined,
      activeMemberCount: _count.members,
      surveyScheduledAt: survey?.scheduledAt ?? undefined,
      surveyCompletedAt: survey?.surveyedAt ?? undefined,
      surveyNotApplicable: Boolean(surveyStep?.notApplicableAt),
      proposalReady: Boolean(
        project.description?.trim() &&
          hasProposalLocation(project.locations.length, plan?.scopeNotes) &&
          plan?.scopeNotes?.trim() &&
          plan.proposalBaseline &&
          Array.isArray(plan.proposalMilestones) &&
          plan.proposalMilestones.length &&
          Array.isArray(plan.proposalWbs) &&
          plan.proposalWbs.length &&
          plan.riskNotes?.trim() &&
          plan.resourceNotes?.trim(),
      ),
      preliminaryFinanceReady: financeReady,
      approvalStatus: latestApproval?.status,
      approvalDecision: latestApproval?.decision ?? undefined,
      requiredDocumentCount: documents.length,
      approvedDocumentCount: approvedDocuments,
      rejectedDocumentCount: rejectedDocuments.length,
      hardBlockedDocumentCount: documents.filter(requiredDocumentHardBlocked)
        .length,
      overdueDocumentCount: overdueDocuments.length,
      missingDocumentOwner: missingDocument?.ownerRole ?? undefined,
      missingDocumentDueDate: missingDocument?.dueDate ?? undefined,
      overdueDocumentOwner: overdueDocument?.ownerRole ?? undefined,
      overdueDocumentDueDate: overdueDocument?.dueDate ?? undefined,
      rejectedDocumentOwner: rejectedDocument?.ownerRole ?? undefined,
      rejectedDocumentDueDate: rejectedDocument?.dueDate ?? undefined,
      requirementOverdueCount: Number(proposalOverdue),
      requirementDueDate: proposalOverdue
        ? (proposalStep?.dueDate ?? undefined)
        : undefined,
      includeFinance: finance,
      now,
    } satisfies Parameters<typeof deriveStageOneReadiness>[0];

    return {
      project: {
        ...projectDetails,
        stageOnePlan: this.visiblePlan(projectActor, project.stageOnePlan),
      },
      steps: stageSteps,
      approval: { latest: latestApproval, count: _count.stageApprovals },
      requiredDocuments: {
        required: documents.length,
        approved: approvedDocuments,
        rejected: rejectedDocuments.length,
        overdue: overdueDocuments.length,
      },
      survey,
      requirements: {
        total: requirements.length,
        approved: requirements.filter(
          ({ approvalStatus }) => approvalStatus === 'APPROVED',
        ).length,
      },
      routing: this.visibleRouting(projectActor, project.projectType),
      allowedCommands: {
        submitApproval: Boolean(
          projectActor.permissions.includes(permissions.stageOneSubmit) &&
            initialized &&
            applicableStepsDone &&
            requiredDocumentsReady &&
            !['PENDING', 'APPROVED'].includes(latestApproval?.status ?? ''),
        ),
      },
      capabilities: documentCapabilities(projectActor),
      readiness: deriveStageOneReadiness(input),
      redFlags: deriveStageOneRedFlags(input),
    };
  }

  async getSummary(
    actor: CurrentActor,
    projectId: string,
    query?: Record<string, unknown>,
  ) {
    this.rejectQuery(query);
    return this.summary(actor, projectId);
  }

  async getSummaries(actor: CurrentActor, projectIds: string[]) {
    if (actor.permissionSources === undefined) {
      const projects = await this.prisma.project.findMany({
        where: {
          id: { in: projectIds },
          ...this.policy.projectWhere(actor, 'project.read'),
        },
        select: stageOneSummarySelect(actor),
      });
      const byId = new Map(projects.map((project) => [project.id, project]));
      const items = await Promise.all(
        projectIds.map(async (projectId) => {
          const project = byId.get(projectId);
          if (!project) return null;
          const { readiness, redFlags } = await this.summary(
            actor,
            projectId,
            project,
            actor,
          );
          return { projectId, readiness, redFlags };
        }),
      );
      return { items: items.filter((item) => item !== null) };
    }
    const projects = await this.prisma.project.findMany({
      where: {
        id: { in: projectIds },
        ...this.policy.projectWhere(actor, 'project.read'),
      },
      select: { id: true },
    });
    const byId = new Map(projects.map((project) => [project.id, project]));
    const items = await Promise.all(
      projectIds.map(async (projectId) => {
        const project = byId.get(projectId);
        if (!project) return null;
        const { readiness, redFlags } = await this.summary(actor, projectId);
        return { projectId, readiness, redFlags };
      }),
    );
    return { items: items.filter((item) => item !== null) };
  }
}
