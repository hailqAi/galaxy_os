export type ProjectType =
  | 'DESIGN_AND_BUILD'
  | 'DESIGN_ONLY'
  | 'PRODUCT_SUPPLY'
  | 'PRODUCT_SUPPLY_AND_INSTALLATION'
  | 'INSTALLATION_ONLY'
  | 'INTERNAL'
  | 'RENOVATION_WARRANTY'
  | 'CUSTOM';

export type ProjectVisualStage =
  | 'STAGE_1'
  | 'STAGE_2'
  | 'STAGE_3'
  | 'STAGE_4'
  | 'STAGE_5';

export type StageOneStep =
  | 'ASSIGNMENT'
  | 'SURVEY'
  | 'PROPOSAL'
  | 'FINANCIAL_PLANNING'
  | 'KICKOFF_APPROVAL';

export const PROJECT_DOCUMENT_CONTEXTS = [
  'STAGE_MATRIX_DOCUMENT',
  'STAGE_WORKFLOW_STEP_DOCUMENT',
] as const;

export type ProjectDocumentContext = (typeof PROJECT_DOCUMENT_CONTEXTS)[number];

export const STAGE_ONE_FINANCIAL_DOCUMENT_TYPE =
  'PRELIMINARY_FINANCIAL_PLAN' as const;

export const isStageOneFinancialDocument = (document: {
  stageKey?: string | null;
  workstreamKey?: string | null;
  documentType?: string | null;
}) =>
  document.documentType === STAGE_ONE_FINANCIAL_DOCUMENT_TYPE ||
  (document.stageKey === 'STAGE_1' &&
    document.workstreamKey === 'FINANCIAL_PLANNING');

export const stageOneFinancialDocumentWhere = () => ({
  OR: [
    { documentType: STAGE_ONE_FINANCIAL_DOCUMENT_TYPE },
    { stageKey: 'STAGE_1', workstreamKey: 'FINANCIAL_PLANNING' },
  ],
});

export const visibleStageOneDocumentWhere = (canReadFinance: boolean) =>
  canReadFinance ? {} : { NOT: stageOneFinancialDocumentWhere() };

export const projectDocumentContext = (
  initialMatrix: boolean,
): ProjectDocumentContext =>
  initialMatrix ? 'STAGE_MATRIX_DOCUMENT' : 'STAGE_WORKFLOW_STEP_DOCUMENT';

export const STAGE_ONE_FUNDING_SOURCES = [
  'PUBLIC_INVESTMENT_2026',
  'ODA_CONCESSIONAL_LOAN',
  'PPP',
  'MIXED_OTHER',
] as const;

export type StageOneFundingSource = (typeof STAGE_ONE_FUNDING_SOURCES)[number];

export const SIMPLE_STAGE_ONE_STEPS = [
  {
    step: 'ASSIGNMENT',
    label: 'TIẾP NHẬN & PHÂN CÔNG',
    documents: [
      'Phiếu tiếp nhận / Yêu cầu khởi tạo dự án',
      'Quyết định giao nhiệm vụ / Phân công đội dự án',
      'Hồ sơ khác',
    ],
  },
  {
    step: 'SURVEY',
    label: 'KHẢO SÁT & THIẾT LẬP BỘ MÁY',
    documents: [
      'Báo cáo khảo sát hiện trạng',
      'Phương án bố trí nhân sự dự án',
      'Biên bản khảo sát',
      'Bản vẽ / Bản đo hiện trạng',
      'Ảnh / Video hiện trường',
      'Hồ sơ khác',
    ],
  },
  {
    step: 'PROPOSAL',
    label: 'LẬP & THẨM ĐỊNH HỒ SƠ ĐỀ XUẤT',
    documents: [
      'Hồ sơ đề xuất dự án',
      'Báo cáo thẩm định nội bộ',
      'Báo cáo thẩm định chuyên môn',
      'Thuyết minh phương án',
      'Bản vẽ / Tài liệu kỹ thuật',
      'Dự toán / BOQ sơ bộ',
      'Hồ sơ khác',
    ],
  },
  {
    step: 'FINANCIAL_PLANNING',
    label: 'XÁC ĐỊNH NGUỒN VỐN & KẾ HOẠCH',
    documents: [
      'Xác nhận ngân sách / Kế hoạch tài chính',
      'Kế hoạch ngân sách',
      'Xác nhận nguồn tài chính',
      'Hồ sơ khác',
    ],
  },
  {
    step: 'KICKOFF_APPROVAL',
    label: 'PHÊ DUYỆT DỰ ÁN',
    documents: [
      'Phiếu phê duyệt khởi tạo dự án',
      'Quyết định phê duyệt dự án',
      'Biên bản / Tài liệu phê duyệt',
      'Hồ sơ khác',
    ],
  },
] as const satisfies readonly {
  step: StageOneStep;
  label: string;
  documents: readonly string[];
}[];

const legacyStageOneDocumentNames: Record<string, string> = {
  'Văn bản chủ trương đầu tư': 'Phiếu tiếp nhận / Yêu cầu khởi tạo dự án',
  'Quyết định giao nhiệm vụ / Phân công Ban QLDA':
    'Quyết định giao nhiệm vụ / Phân công đội dự án',
  'Báo cáo khảo sát hiện trạng mặt bằng': 'Báo cáo khảo sát hiện trạng',
  'Phương án bố trí nhân sự Ban QLDA': 'Phương án bố trí nhân sự dự án',
  'Hồ sơ BCNCTKT / Báo cáo đề xuất chủ trương đầu tư': 'Hồ sơ đề xuất dự án',
  'Báo cáo thẩm định ngành / Bộ': 'Báo cáo thẩm định chuyên môn',
  'Thuyết minh': 'Thuyết minh phương án',
  'Bản vẽ': 'Bản vẽ / Tài liệu kỹ thuật',
  'Dự toán': 'Dự toán / BOQ sơ bộ',
  'Văn bản cam kết / cân đối nguồn vốn':
    'Xác nhận ngân sách / Kế hoạch tài chính',
  'Kế hoạch vốn': 'Kế hoạch ngân sách',
  'Văn bản xác nhận nguồn vốn': 'Xác nhận nguồn tài chính',
  'Quyết định phê duyệt chủ trương đầu tư': 'Phiếu phê duyệt khởi tạo dự án',
  'Quyết định phê duyệt dự án đầu tư xây dựng': 'Quyết định phê duyệt dự án',
  'Biên bản / Văn bản phê duyệt': 'Biên bản / Tài liệu phê duyệt',
};

export const stageOneDocumentDisplayName = (name: string) =>
  legacyStageOneDocumentNames[name] ?? name;

export function stageOneDocumentTypes(step: StageOneStep) {
  return SIMPLE_STAGE_ONE_STEPS.find(
    (item) => item.step === step,
  )!.documents.map((name) => ({
    name,
    customNameRequired: name === 'Hồ sơ khác',
    required: false,
  }));
}

export type StageOneWorkstream =
  | 'PROJECT_MANAGEMENT'
  | 'DESIGN'
  | 'PROCUREMENT'
  | 'INSTALLATION'
  | 'INTERNAL'
  | 'WARRANTY'
  | 'CUSTOM';

export type StageOneDocumentType =
  | 'PROJECT_DOSSIER'
  | 'RESPONSIBILITY_MATRIX'
  | 'SURVEY_REPORT'
  | 'SITE_CONSTRAINTS'
  | 'SCOPE_STATEMENT'
  | 'PROPOSAL'
  | 'PROPOSAL_MILESTONES'
  | 'PROPOSAL_WBS'
  | 'RISK_REGISTER'
  | 'RESOURCE_PLAN'
  | 'PRELIMINARY_FINANCIAL_PLAN'
  | 'KICKOFF_APPROVAL';

export type RequiredDocumentCompletionPolicy = 'FILE_PRESENT' | 'APPROVED';

export function requiredDocumentCompletionPolicy(
  documentType: string,
): RequiredDocumentCompletionPolicy {
  return documentType === 'KICKOFF_APPROVAL' ? 'APPROVED' : 'FILE_PRESENT';
}

type RequiredDocumentState = {
  documentType: string;
  status: string;
  currentFileAssetId?: string | null;
  notApplicableReason?: string | null;
  markedBy?: string | null;
  markedAt?: Date | null;
};

const auditedNotApplicable = (document: RequiredDocumentState) =>
  Boolean(
    document.status === 'NOT_APPLICABLE' &&
      document.notApplicableReason?.trim() &&
      document.markedBy &&
      document.markedAt,
  );

export function requiredDocumentSatisfied(document: RequiredDocumentState) {
  if (auditedNotApplicable(document)) return true;
  if (requiredDocumentCompletionPolicy(document.documentType) === 'APPROVED')
    return document.status === 'APPROVED';
  return (
    Boolean(document.currentFileAssetId) &&
    [
      'DRAFT',
      'UPLOADED',
      'PENDING_REVIEW',
      'UNDER_REVIEW',
      'APPROVED',
    ].includes(document.status)
  );
}

export function requiredDocumentHardBlocked(
  document: Pick<RequiredDocumentState, 'documentType' | 'status'>,
) {
  return (
    document.status === 'REJECTED' &&
    requiredDocumentCompletionPolicy(document.documentType) === 'APPROVED'
  );
}

export interface ProjectRouting {
  projectType: ProjectType;
  workstreams: readonly StageOneWorkstream[];
  steps: readonly StageOneStep[];
  requiresSurvey: boolean;
  requiresPreliminaryFinance: boolean;
  documentTypes: readonly StageOneDocumentType[];
  riskLevel: 'LOW' | 'NORMAL' | 'HIGH';
  nextActionBasis: StageOneStep;
  applicableStages: readonly ProjectVisualStage[];
}

export interface StageOneReadinessInput {
  projectId?: string;
  projectName?: string;
  customerId?: string;
  projectType?: string;
  plannedHandoverAt?: Date;
  projectManagerId?: string;
  activeMemberCount?: number;
  principalUserId?: string;
  activeGovernanceMemberUserIds?: readonly string[];
  governanceCoordinatorUserIds?: readonly string[];
  responsibilityNotes?: string | null;
  responsibleDepartmentCount?: number;
  surveyScheduledAt?: Date;
  surveyCompletedAt?: Date;
  surveyNotApplicable?: boolean;
  proposalReady?: boolean;
  preliminaryFinanceReady?: boolean;
  approvalStatus?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  approvalDecision?:
    | 'APPROVED'
    | 'APPROVED_WITH_COMMENTS'
    | 'REVISION_REQUIRED'
    | 'REJECTED';
  requiredDocumentCount?: number;
  approvedDocumentCount?: number;
  rejectedDocumentCount?: number;
  hardBlockedDocumentCount?: number;
  overdueDocumentCount?: number;
  missingDocumentOwner?: string;
  missingDocumentDueDate?: Date;
  overdueDocumentOwner?: string;
  overdueDocumentDueDate?: Date;
  rejectedDocumentOwner?: string;
  rejectedDocumentDueDate?: Date;
  requirementOverdueCount?: number;
  requirementDueDate?: Date;
  includeFinance?: boolean;
  now?: Date;
}

export interface StageOneRedFlagInput extends StageOneReadinessInput {
  projectId: string;
}

export interface StageOneReadinessCard {
  key:
    | 'PROJECT_DOSSIER'
    | 'PEOPLE'
    | 'SURVEY'
    | 'PROPOSAL'
    | 'FINANCE'
    | 'DOCUMENTS'
    | 'APPROVAL';
  applicable: boolean;
  satisfied: number;
  total: number;
  status: StageOneReadinessStatus;
}

export type StageOneReadinessStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'BLOCKED'
  | 'COMPLETED';

export interface StageOneReadiness {
  cards: readonly StageOneReadinessCard[];
  status: StageOneReadinessStatus;
  satisfied: number;
  total: number;
  progress: number;
}

export type ProjectRedFlagCode =
  | 'PROJECT_MANAGER_MISSING'
  | 'PROJECT_MEMBER_MISSING'
  | StageOneGovernanceCheckCode
  | 'CUSTOMER_MISSING_WHEN_REQUIRED'
  | 'PROJECT_TYPE_MISSING'
  | 'SURVEY_OVERDUE'
  | 'SURVEY_REQUIRED_BUT_MISSING'
  | 'REQUIREMENT_OVERDUE'
  | 'REQUIRED_DOCUMENT_MISSING'
  | 'REQUIRED_DOCUMENT_OVERDUE'
  | 'REQUIRED_DOCUMENT_REJECTED'
  | 'STAGE_APPROVAL_REJECTED'
  | 'STAGE_APPROVAL_REVISION_REQUIRED'
  | 'PLANNED_HANDOVER_MISSING'
  | 'FINANCIAL_PLAN_MISSING_WHEN_REQUIRED';

export type StageOneGovernanceCheckCode =
  | 'GOVERNANCE_PRINCIPAL_MISSING'
  | 'GOVERNANCE_PRINCIPAL_INACTIVE'
  | 'GOVERNANCE_COORDINATOR_INVALID'
  | 'RESPONSIBILITY_NOTES_MISSING'
  | 'PROJECT_DEPARTMENT_MISSING';

export interface StageOneGovernanceCheck {
  code: StageOneGovernanceCheckCode;
  satisfied: boolean;
}

export function deriveStageOneGovernanceChecks(
  input: Pick<
    StageOneReadinessInput,
    | 'principalUserId'
    | 'activeGovernanceMemberUserIds'
    | 'governanceCoordinatorUserIds'
    | 'responsibilityNotes'
    | 'responsibleDepartmentCount'
  >,
): readonly StageOneGovernanceCheck[] {
  const activeMembers = new Set(input.activeGovernanceMemberUserIds ?? []);
  const hasPrincipal = Boolean(input.principalUserId);
  return [
    { code: 'GOVERNANCE_PRINCIPAL_MISSING', satisfied: hasPrincipal },
    {
      code: 'GOVERNANCE_PRINCIPAL_INACTIVE',
      satisfied: !hasPrincipal || activeMembers.has(input.principalUserId!),
    },
    {
      code: 'GOVERNANCE_COORDINATOR_INVALID',
      satisfied:
        input.governanceCoordinatorUserIds !== undefined &&
        input.governanceCoordinatorUserIds.every((userId) =>
          activeMembers.has(userId),
        ),
    },
    {
      code: 'RESPONSIBILITY_NOTES_MISSING',
      satisfied: Boolean(input.responsibilityNotes?.trim()),
    },
    {
      code: 'PROJECT_DEPARTMENT_MISSING',
      satisfied: (input.responsibleDepartmentCount ?? 0) > 0,
    },
  ];
}

export interface ProjectRedFlag {
  code: ProjectRedFlagCode;
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  owner: string;
  dueDate?: Date;
  route: string;
  remediation: string;
}

const baseDocuments: readonly StageOneDocumentType[] = [
  'PROJECT_DOSSIER',
  'RESPONSIBILITY_MATRIX',
];
const proposalDocuments: readonly StageOneDocumentType[] = [
  'SCOPE_STATEMENT',
  'PROPOSAL',
  'PROPOSAL_MILESTONES',
  'PROPOSAL_WBS',
  'RISK_REGISTER',
  'RESOURCE_PLAN',
];
const surveyDocuments: readonly StageOneDocumentType[] = [
  'SURVEY_REPORT',
  'SITE_CONSTRAINTS',
];

const routingPolicies = {
  DESIGN_AND_BUILD: {
    applicableStages: ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'],
    workstreams: [
      'PROJECT_MANAGEMENT',
      'DESIGN',
      'PROCUREMENT',
      'INSTALLATION',
    ],
    requiresSurvey: true,
    requiresPreliminaryFinance: true,
    riskLevel: 'HIGH',
  },
  DESIGN_ONLY: {
    applicableStages: ['STAGE_1', 'STAGE_2', 'STAGE_5'],
    workstreams: ['PROJECT_MANAGEMENT', 'DESIGN'],
    requiresSurvey: true,
    requiresPreliminaryFinance: true,
    riskLevel: 'NORMAL',
  },
  PRODUCT_SUPPLY: {
    applicableStages: ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'],
    workstreams: ['PROJECT_MANAGEMENT', 'PROCUREMENT'],
    requiresSurvey: false,
    requiresPreliminaryFinance: true,
    riskLevel: 'NORMAL',
  },
  PRODUCT_SUPPLY_AND_INSTALLATION: {
    applicableStages: ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'],
    workstreams: ['PROJECT_MANAGEMENT', 'PROCUREMENT', 'INSTALLATION'],
    requiresSurvey: true,
    requiresPreliminaryFinance: true,
    riskLevel: 'HIGH',
  },
  INSTALLATION_ONLY: {
    applicableStages: ['STAGE_1', 'STAGE_3', 'STAGE_4', 'STAGE_5'],
    workstreams: ['PROJECT_MANAGEMENT', 'INSTALLATION'],
    requiresSurvey: true,
    requiresPreliminaryFinance: true,
    riskLevel: 'HIGH',
  },
  INTERNAL: {
    applicableStages: ['STAGE_1', 'STAGE_3', 'STAGE_4', 'STAGE_5'],
    workstreams: ['PROJECT_MANAGEMENT', 'INTERNAL'],
    requiresSurvey: false,
    requiresPreliminaryFinance: false,
    riskLevel: 'LOW',
  },
  RENOVATION_WARRANTY: {
    applicableStages: ['STAGE_1', 'STAGE_2', 'STAGE_4', 'STAGE_5'],
    workstreams: ['PROJECT_MANAGEMENT', 'WARRANTY'],
    requiresSurvey: true,
    requiresPreliminaryFinance: false,
    riskLevel: 'NORMAL',
  },
  CUSTOM: {
    // ponytail: custom routing fails closed beyond Stage 1 until Task 5 stores explicit configuration.
    applicableStages: ['STAGE_1'],
    workstreams: ['PROJECT_MANAGEMENT', 'CUSTOM'],
    requiresSurvey: true,
    requiresPreliminaryFinance: true,
    riskLevel: 'HIGH',
  },
} as const satisfies Record<
  ProjectType,
  {
    workstreams: readonly StageOneWorkstream[];
    requiresSurvey: boolean;
    requiresPreliminaryFinance: boolean;
    riskLevel: ProjectRouting['riskLevel'];
    applicableStages: readonly ProjectVisualStage[];
  }
>;

const projectTypes = Object.keys(routingPolicies) as ProjectType[];

export function isProjectType(value: string | undefined): value is ProjectType {
  return projectTypes.includes(value as ProjectType);
}

export function hasProposalLocation(
  activeLocationCount: number,
  scopeNotes?: string | null,
) {
  return (
    activeLocationCount > 0 ||
    /\bno location\s*:\s*\S/i.test(scopeNotes?.trim() ?? '')
  );
}

function status(satisfied: number, total: number): StageOneReadinessStatus {
  if (total === 0 || satisfied === total) return 'COMPLETED';
  return satisfied === 0 ? 'NOT_STARTED' : 'IN_PROGRESS';
}

function card(
  key: StageOneReadinessCard['key'],
  applicable: boolean,
  satisfied: number,
  total: number,
): StageOneReadinessCard {
  return {
    key,
    applicable,
    satisfied,
    total,
    status: status(satisfied, total),
  };
}

export function routeProject(project: {
  projectType: ProjectType;
}): ProjectRouting {
  const policy = routingPolicies[project.projectType];
  const steps: StageOneStep[] = ['ASSIGNMENT'];
  if (policy.requiresSurvey) steps.push('SURVEY');
  steps.push('PROPOSAL');
  if (policy.requiresPreliminaryFinance) steps.push('FINANCIAL_PLANNING');
  steps.push('KICKOFF_APPROVAL');
  return {
    projectType: project.projectType,
    workstreams: policy.workstreams,
    steps,
    requiresSurvey: policy.requiresSurvey,
    requiresPreliminaryFinance: policy.requiresPreliminaryFinance,
    documentTypes: [
      ...baseDocuments,
      ...(policy.requiresSurvey ? surveyDocuments : []),
      ...proposalDocuments,
      ...(policy.requiresPreliminaryFinance
        ? ['PRELIMINARY_FINANCIAL_PLAN' as const]
        : []),
      'KICKOFF_APPROVAL',
    ],
    riskLevel: policy.riskLevel,
    nextActionBasis: 'ASSIGNMENT',
    applicableStages: policy.applicableStages,
  };
}

export function deriveStageOneReadiness(
  input: StageOneReadinessInput,
): StageOneReadiness {
  const routing = isProjectType(input.projectType)
    ? routeProject({ projectType: input.projectType })
    : undefined;
  const requiresSurvey = routing?.requiresSurvey ?? true;
  const requiresPreliminaryFinance =
    routing?.requiresPreliminaryFinance ?? true;
  const surveyComplete = Boolean(
    input.surveyCompletedAt || input.surveyNotApplicable,
  );
  const governance = deriveStageOneGovernanceChecks(input);
  const governanceSatisfied = new Map(
    governance.map((check) => [check.code, check.satisfied]),
  );
  const principalReady = Boolean(
    governanceSatisfied.get('GOVERNANCE_PRINCIPAL_MISSING') &&
      governanceSatisfied.get('GOVERNANCE_PRINCIPAL_INACTIVE'),
  );
  const requiredDocumentCount = input.requiredDocumentCount ?? 0;
  const satisfiedDocumentCount = Math.min(
    requiredDocumentCount,
    input.approvedDocumentCount ?? 0,
  );
  const documentsComplete = requiredDocumentCount <= satisfiedDocumentCount;
  const cards = [
    card(
      'PROJECT_DOSSIER',
      true,
      [
        input.projectName,
        input.customerId,
        isProjectType(input.projectType),
        input.plannedHandoverAt,
      ].filter(Boolean).length,
      4,
    ),
    card(
      'PEOPLE',
      true,
      [
        input.projectManagerId,
        (input.activeMemberCount ?? 0) > 0,
        principalReady,
        governanceSatisfied.get('GOVERNANCE_COORDINATOR_INVALID'),
        governanceSatisfied.get('RESPONSIBILITY_NOTES_MISSING'),
        governanceSatisfied.get('PROJECT_DEPARTMENT_MISSING'),
      ].filter(Boolean).length,
      6,
    ),
    card(
      'SURVEY',
      Boolean(requiresSurvey && !input.surveyNotApplicable),
      requiresSurvey
        ? input.surveyNotApplicable
          ? 2
          : [input.surveyScheduledAt, surveyComplete].filter(Boolean).length
        : 0,
      requiresSurvey ? 2 : 0,
    ),
    card('PROPOSAL', true, Number(Boolean(input.proposalReady)), 1),
    ...(input.includeFinance === false
      ? []
      : [
          card(
            'FINANCE',
            requiresPreliminaryFinance,
            Number(Boolean(input.preliminaryFinanceReady)),
            requiresPreliminaryFinance ? 1 : 0,
          ),
        ]),
    card(
      'DOCUMENTS',
      requiredDocumentCount > 0,
      satisfiedDocumentCount,
      requiredDocumentCount,
    ),
    card(
      'APPROVAL',
      true,
      Number(
        input.approvalDecision
          ? ['APPROVED', 'APPROVED_WITH_COMMENTS'].includes(
              input.approvalDecision,
            )
          : input.approvalStatus === 'APPROVED',
      ),
      1,
    ),
  ];
  const satisfied = cards.reduce((total, item) => total + item.satisfied, 0);
  const total = cards.reduce((sum, item) => sum + item.total, 0);
  const blocked =
    ['REVISION_REQUIRED', 'REJECTED'].includes(input.approvalDecision ?? '') ||
    (!input.approvalDecision && input.approvalStatus === 'REJECTED') ||
    (input.hardBlockedDocumentCount ?? 0) > 0;
  const readyForReview =
    cards.slice(0, -1).every((item) => item.satisfied === item.total) &&
    documentsComplete;
  return {
    cards,
    status: blocked
      ? 'BLOCKED'
      : total === 0 || satisfied === 0
        ? 'NOT_STARTED'
        : satisfied === total && documentsComplete
          ? 'COMPLETED'
          : readyForReview
            ? 'READY_FOR_REVIEW'
            : 'IN_PROGRESS',
    satisfied,
    total,
    progress: total ? Math.round((satisfied / total) * 100) : 0,
  };
}

export function deriveStageOneRedFlags(
  input: StageOneRedFlagInput,
): ProjectRedFlag[] {
  const routing = isProjectType(input.projectType)
    ? routeProject({ projectType: input.projectType })
    : undefined;
  const flags: ProjectRedFlag[] = [];
  const add = (flag: ProjectRedFlag) => flags.push(flag);
  const route = (path: string) =>
    `/projects/${input.projectId}/stage-1/${path}`;
  const documentsRoute = `/projects/${input.projectId}/documents?stageKey=STAGE_1`;
  const governanceRoute = `/projects/${input.projectId}/stage-1#governance`;
  const governance = new Map(
    deriveStageOneGovernanceChecks(input).map((check) => [
      check.code,
      check.satisfied,
    ]),
  );

  if (!governance.get('GOVERNANCE_PRINCIPAL_MISSING'))
    add({
      code: 'GOVERNANCE_PRINCIPAL_MISSING',
      severity: 'WARNING',
      title: 'Chưa phân công chủ trì dự án',
      description: 'Giai đoạn 1 cần một người chủ trì dự án.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: governanceRoute,
      remediation: 'Chọn người chủ trì là thành viên dự án đang hoạt động.',
    });
  if (!governance.get('GOVERNANCE_PRINCIPAL_INACTIVE'))
    add({
      code: 'GOVERNANCE_PRINCIPAL_INACTIVE',
      severity: 'WARNING',
      title: 'Người chủ trì không còn hoạt động trong dự án',
      description: 'Người chủ trì phải là thành viên dự án đang hoạt động.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: governanceRoute,
      remediation: 'Chọn lại người chủ trì là thành viên dự án đang hoạt động.',
    });
  if (!governance.get('GOVERNANCE_COORDINATOR_INVALID'))
    add({
      code: 'GOVERNANCE_COORDINATOR_INVALID',
      severity: 'WARNING',
      title: 'Điều phối viên dự án không hợp lệ',
      description:
        'Mọi điều phối viên phải là thành viên dự án đang hoạt động.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: governanceRoute,
      remediation:
        'Chọn lại điều phối viên là thành viên dự án đang hoạt động.',
    });
  if (!governance.get('RESPONSIBILITY_NOTES_MISSING'))
    add({
      code: 'RESPONSIBILITY_NOTES_MISSING',
      severity: 'WARNING',
      title: 'Chưa mô tả trách nhiệm quản trị dự án',
      description: 'Giai đoạn 1 cần mô tả trách nhiệm của Ban điều hành dự án.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: governanceRoute,
      remediation:
        'Bổ sung mô tả trách nhiệm tại mục Ban điều hành & phân công.',
    });
  if (!governance.get('PROJECT_DEPARTMENT_MISSING'))
    add({
      code: 'PROJECT_DEPARTMENT_MISSING',
      severity: 'WARNING',
      title: 'Chưa phân công phòng ban phụ trách',
      description: 'Giai đoạn 1 cần ít nhất một phòng ban dự án phụ trách.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: governanceRoute,
      remediation: 'Bổ sung phòng ban dự án phụ trách.',
    });

  if (!input.projectManagerId)
    add({
      code: 'PROJECT_MANAGER_MISSING',
      severity: 'CRITICAL',
      title: 'Project Manager is missing',
      description: 'Stage 1 needs an accountable Project Manager.',
      owner: 'PROJECT_OWNER',
      dueDate: input.plannedHandoverAt,
      route: route('initiation'),
      remediation: 'Assign an active Project Manager.',
    });
  if ((input.activeMemberCount ?? 0) <= 0)
    add({
      code: 'PROJECT_MEMBER_MISSING',
      severity: 'CRITICAL',
      title: 'Project member is missing',
      description: 'Stage 1 needs at least one active project member.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: `/projects/${input.projectId}/members`,
      remediation: 'Add an active project member.',
    });
  if (!input.customerId)
    add({
      code: 'CUSTOMER_MISSING_WHEN_REQUIRED',
      severity: 'CRITICAL',
      title: 'Customer is missing',
      description: 'The project dossier needs a customer.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: route('initiation'),
      remediation: 'Select the project customer.',
    });
  if (!isProjectType(input.projectType))
    add({
      code: 'PROJECT_TYPE_MISSING',
      severity: 'CRITICAL',
      title: 'Project type is missing',
      description:
        'Stage 1 routing cannot be determined without a canonical project type.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: route('initiation'),
      remediation: 'Select a canonical project type.',
    });
  if (!input.plannedHandoverAt)
    add({
      code: 'PLANNED_HANDOVER_MISSING',
      severity: 'WARNING',
      title: 'Planned handover date is missing',
      description: 'Stage 1 needs a target handover date.',
      owner: 'PROJECT_MANAGER',
      route: route('initiation'),
      remediation: 'Set the planned handover date.',
    });
  if (
    routing?.requiresSurvey &&
    !input.surveyScheduledAt &&
    !input.surveyCompletedAt &&
    !input.surveyNotApplicable
  )
    add({
      code: 'SURVEY_REQUIRED_BUT_MISSING',
      severity: 'CRITICAL',
      title: 'Required survey is missing',
      description:
        'This project type requires a survey record or a not-applicable decision.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: route('survey'),
      remediation: 'Schedule and record the survey or mark it not applicable.',
    });
  if (
    routing?.requiresSurvey &&
    input.now &&
    input.surveyScheduledAt &&
    input.surveyScheduledAt < input.now &&
    !input.surveyCompletedAt &&
    !input.surveyNotApplicable
  )
    add({
      code: 'SURVEY_OVERDUE',
      severity: 'WARNING',
      title: 'Survey is overdue',
      description: 'The scheduled survey has not been recorded.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.surveyScheduledAt,
      route: route('survey'),
      remediation: 'Record the survey or mark it not applicable.',
    });
  if ((input.requirementOverdueCount ?? 0) > 0)
    add({
      code: 'REQUIREMENT_OVERDUE',
      severity: 'WARNING',
      title: 'Project requirement is overdue',
      description: 'One or more project requirements are overdue.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.requirementDueDate,
      route: route('requirements'),
      remediation: 'Resolve the overdue project requirement.',
    });
  if (
    (input.requiredDocumentCount ?? 0) >
    (input.approvedDocumentCount ?? 0) + (input.rejectedDocumentCount ?? 0)
  )
    add({
      code: 'REQUIRED_DOCUMENT_MISSING',
      severity: 'WARNING',
      title: 'Required document is missing',
      description: 'One or more required documents have not been submitted.',
      owner: input.missingDocumentOwner ?? 'DOCUMENT_OWNER',
      dueDate: input.missingDocumentDueDate,
      route: documentsRoute,
      remediation: 'Submit the missing required document.',
    });
  if ((input.overdueDocumentCount ?? 0) > 0)
    add({
      code: 'REQUIRED_DOCUMENT_OVERDUE',
      severity: 'WARNING',
      title: 'Required document is overdue',
      description: 'One or more required documents are overdue.',
      owner: input.overdueDocumentOwner ?? 'DOCUMENT_OWNER',
      dueDate: input.overdueDocumentDueDate,
      route: documentsRoute,
      remediation: 'Submit the overdue required document.',
    });
  if ((input.rejectedDocumentCount ?? 0) > 0)
    add({
      code: 'REQUIRED_DOCUMENT_REJECTED',
      severity:
        (input.hardBlockedDocumentCount ?? 0) > 0 ? 'CRITICAL' : 'WARNING',
      title: 'Required document was rejected',
      description: 'One or more required documents need a replacement version.',
      owner: input.rejectedDocumentOwner ?? 'DOCUMENT_OWNER',
      dueDate: input.rejectedDocumentDueDate,
      route: documentsRoute,
      remediation: 'Replace the rejected document and resubmit it.',
    });
  if (
    input.includeFinance !== false &&
    routing?.requiresPreliminaryFinance &&
    !input.preliminaryFinanceReady
  )
    add({
      code: 'FINANCIAL_PLAN_MISSING_WHEN_REQUIRED',
      severity: 'WARNING',
      title: 'Preliminary finance is missing',
      description: 'This project type requires a preliminary financial plan.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: route('requirements#finance'),
      remediation: 'Complete the preliminary financial plan.',
    });
  if (input.approvalDecision === 'REVISION_REQUIRED')
    add({
      code: 'STAGE_APPROVAL_REVISION_REQUIRED',
      severity: 'CRITICAL',
      title: 'Kickoff approval requires revision',
      description: 'The latest Stage 1 decision requires revision.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: route('approval'),
      remediation: 'Address the approval comments and resubmit.',
    });
  else if (
    input.approvalDecision === 'REJECTED' ||
    (!input.approvalDecision && input.approvalStatus === 'REJECTED')
  )
    add({
      code: 'STAGE_APPROVAL_REJECTED',
      severity: 'CRITICAL',
      title: 'Kickoff approval was rejected',
      description:
        'The Stage 1 approval must be resubmitted after its comments are addressed.',
      owner: 'PROJECT_MANAGER',
      dueDate: input.plannedHandoverAt,
      route: route('approval'),
      remediation: 'Address the approval comments and resubmit.',
    });

  return flags;
}
