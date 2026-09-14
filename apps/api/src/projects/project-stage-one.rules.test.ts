import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SIMPLE_STAGE_ONE_STEPS,
  deriveStageOneReadiness,
  deriveStageOneRedFlags,
  hasProposalLocation,
  requiredDocumentCompletionPolicy,
  routeProject,
  stageOneDocumentDisplayName,
  stageOneDocumentTypes,
  type ProjectType,
  type StageOneReadinessInput,
} from './project-stage-one.rules';

const simplifiedStageOnePolicy = [
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
] as const;

const completeDesignAndBuild = {
  projectId: 'project-1',
  projectName: 'Luna Residence',
  customerId: 'customer-1',
  projectType: 'DESIGN_AND_BUILD',
  plannedHandoverAt: new Date('2026-09-30T00:00:00.000Z'),
  projectManagerId: 'pm-1',
  activeMemberCount: 1,
  principalUserId: 'principal-1',
  activeGovernanceMemberUserIds: ['principal-1', 'coordinator-1'],
  governanceCoordinatorUserIds: ['coordinator-1'],
  responsibilityNotes: 'Principal owns delivery; coordinator owns follow-up.',
  responsibleDepartmentCount: 1,
  surveyScheduledAt: new Date('2026-08-05T00:00:00.000Z'),
  surveyCompletedAt: new Date('2026-08-06T00:00:00.000Z'),
  proposalReady: true,
  preliminaryFinanceReady: true,
  approvalStatus: 'APPROVED',
  requiredDocumentCount: 12,
  approvedDocumentCount: 12,
} satisfies StageOneReadinessInput;

describe('project Stage 1 rules', () => {
  it('repairs legacy Matrix classification and inserts missing Workflow defaults additively', () => {
    const migration = readFileSync(
      'prisma/migrations/20260824010000_repair_stage_one_document_contexts/migration.sql',
      'utf8',
    );

    expect(migration).toContain('"normalizedName" IS NULL');
    expect(migration).toContain('"initialMatrix" = true');
    expect(migration).toContain(
      'conflict."normalizedName" = lower(defaults."name")',
    );
    expect(migration).toContain('ELSE document."normalizedName"');
    expect(migration).toContain('ON CONFLICT DO NOTHING');
    expect(migration).not.toMatch(/\bDELETE\b/i);
    for (const { documents } of simplifiedStageOnePolicy)
      for (const document of documents) expect(migration).toContain(document);
  });

  it('exposes optional document configuration fields to Stage 1 services', () => {
    const models = new Map(
      Prisma.dmmf.datamodel.models.map((model) => [model.name, model.fields]),
    );

    expect(models.get('ProjectStageState')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'documentDefinitionsInitializedAt',
          type: 'DateTime',
          isRequired: false,
        }),
      ]),
    );
    expect(models.get('ProjectRequiredDocument')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'position',
          type: 'Int',
          isRequired: true,
          default: 0,
        }),
        expect.objectContaining({
          name: 'initialMatrix',
          type: 'Boolean',
          isRequired: true,
          default: false,
        }),
        expect.objectContaining({
          name: 'normalizedName',
          type: 'String',
          isRequired: false,
        }),
      ]),
    );
    expect(models.get('ProjectStageOneDocument')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'stageKey',
          type: 'String',
          isRequired: true,
        }),
        expect.objectContaining({
          name: 'workstreamKey',
          type: 'String',
          isRequired: true,
        }),
        expect.objectContaining({
          name: 'step',
          type: 'ProjectStageOneStep',
          isRequired: false,
        }),
      ]),
    );
  });

  it('defines only the five simplified steps and their approved document options', () => {
    expect(SIMPLE_STAGE_ONE_STEPS).toEqual(simplifiedStageOnePolicy);
    expect(
      simplifiedStageOnePolicy.map(({ step }) =>
        stageOneDocumentTypes(step).map(({ name }) => name),
      ),
    ).toEqual(simplifiedStageOnePolicy.map(({ documents }) => documents));
    expect(JSON.stringify(SIMPLE_STAGE_ONE_STEPS)).not.toMatch(
      /governance|preliminaryFinance|readiness|redFlag|Ban QLDA|BCNCTKT|đầu tư xây dựng|ngành \/ Bộ/i,
    );
  });

  it('presents legacy Workflow document names with neutral Galaxy labels', () => {
    expect(
      stageOneDocumentDisplayName('Phương án bố trí nhân sự Ban QLDA'),
    ).toBe('Phương án bố trí nhân sự dự án');
    expect(stageOneDocumentDisplayName('Tài liệu tùy chỉnh')).toBe(
      'Tài liệu tùy chỉnh',
    );
  });

  it('marks only Hồ sơ khác as requiring a custom business name', () => {
    expect(
      simplifiedStageOnePolicy.flatMap(({ step }) =>
        stageOneDocumentTypes(step)
          .filter(({ customNameRequired }) => customNameRequired)
          .map(({ name }) => name),
      ),
    ).toEqual(Array(5).fill('Hồ sơ khác'));
  });

  it('marks every configured simplified document as optional', () => {
    const documents = simplifiedStageOnePolicy.flatMap(({ step }) =>
      stageOneDocumentTypes(step).map(({ name, required }) => ({
        step,
        name,
        required,
      })),
    );
    expect(documents.every(({ required }) => !required)).toBe(true);
  });

  it('keeps Required Document completion policy with the Stage 1 template', () => {
    expect(requiredDocumentCompletionPolicy('PROPOSAL')).toBe('FILE_PRESENT');
    expect(requiredDocumentCompletionPolicy('KICKOFF_APPROVAL')).toBe(
      'APPROVED',
    );
  });

  it('derives the approved applicable stages from the existing Project type policy', () => {
    expect(
      [
        'DESIGN_AND_BUILD',
        'DESIGN_ONLY',
        'PRODUCT_SUPPLY',
        'PRODUCT_SUPPLY_AND_INSTALLATION',
        'INSTALLATION_ONLY',
        'INTERNAL',
        'RENOVATION_WARRANTY',
        'CUSTOM',
      ].map((projectType) => [
        projectType,
        routeProject({ projectType: projectType as ProjectType })
          .applicableStages,
      ]),
    ).toEqual([
      [
        'DESIGN_AND_BUILD',
        ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'],
      ],
      ['DESIGN_ONLY', ['STAGE_1', 'STAGE_2', 'STAGE_5']],
      [
        'PRODUCT_SUPPLY',
        ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'],
      ],
      [
        'PRODUCT_SUPPLY_AND_INSTALLATION',
        ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'],
      ],
      ['INSTALLATION_ONLY', ['STAGE_1', 'STAGE_3', 'STAGE_4', 'STAGE_5']],
      ['INTERNAL', ['STAGE_1', 'STAGE_3', 'STAGE_4', 'STAGE_5']],
      ['RENOVATION_WARRANTY', ['STAGE_1', 'STAGE_2', 'STAGE_4', 'STAGE_5']],
      ['CUSTOM', ['STAGE_1']],
    ]);
  });
  it('accepts either an active location or an explicit no-location rationale', () => {
    expect(hasProposalLocation(1, '')).toBe(true);
    expect(hasProposalLocation(0, 'No location: remote advisory only.')).toBe(
      true,
    );
    expect(hasProposalLocation(0, 'Remote advisory only.')).toBe(false);
  });
  it('routes every approved project type with its literal Stage 1 policy', () => {
    expect(
      [
        ['DESIGN_AND_BUILD', true, true, 'HIGH', 'DESIGN'],
        ['DESIGN_ONLY', true, true, 'NORMAL', 'DESIGN'],
        ['PRODUCT_SUPPLY', false, true, 'NORMAL', 'PROCUREMENT'],
        ['PRODUCT_SUPPLY_AND_INSTALLATION', true, true, 'HIGH', 'PROCUREMENT'],
        ['INSTALLATION_ONLY', true, true, 'HIGH', 'INSTALLATION'],
        ['INTERNAL', false, false, 'LOW', 'INTERNAL'],
        ['RENOVATION_WARRANTY', true, false, 'NORMAL', 'WARRANTY'],
        ['CUSTOM', true, true, 'HIGH', 'CUSTOM'],
      ].map(([projectType]) => {
        const routing = routeProject({ projectType: projectType as never });
        return [
          routing.projectType,
          routing.requiresSurvey,
          routing.requiresPreliminaryFinance,
          routing.riskLevel,
          routing.workstreams[1],
          routing.steps,
        ];
      }),
    ).toEqual([
      [
        'DESIGN_AND_BUILD',
        true,
        true,
        'HIGH',
        'DESIGN',
        [
          'ASSIGNMENT',
          'SURVEY',
          'PROPOSAL',
          'FINANCIAL_PLANNING',
          'KICKOFF_APPROVAL',
        ],
      ],
      [
        'DESIGN_ONLY',
        true,
        true,
        'NORMAL',
        'DESIGN',
        [
          'ASSIGNMENT',
          'SURVEY',
          'PROPOSAL',
          'FINANCIAL_PLANNING',
          'KICKOFF_APPROVAL',
        ],
      ],
      [
        'PRODUCT_SUPPLY',
        false,
        true,
        'NORMAL',
        'PROCUREMENT',
        ['ASSIGNMENT', 'PROPOSAL', 'FINANCIAL_PLANNING', 'KICKOFF_APPROVAL'],
      ],
      [
        'PRODUCT_SUPPLY_AND_INSTALLATION',
        true,
        true,
        'HIGH',
        'PROCUREMENT',
        [
          'ASSIGNMENT',
          'SURVEY',
          'PROPOSAL',
          'FINANCIAL_PLANNING',
          'KICKOFF_APPROVAL',
        ],
      ],
      [
        'INSTALLATION_ONLY',
        true,
        true,
        'HIGH',
        'INSTALLATION',
        [
          'ASSIGNMENT',
          'SURVEY',
          'PROPOSAL',
          'FINANCIAL_PLANNING',
          'KICKOFF_APPROVAL',
        ],
      ],
      [
        'INTERNAL',
        false,
        false,
        'LOW',
        'INTERNAL',
        ['ASSIGNMENT', 'PROPOSAL', 'KICKOFF_APPROVAL'],
      ],
      [
        'RENOVATION_WARRANTY',
        true,
        false,
        'NORMAL',
        'WARRANTY',
        ['ASSIGNMENT', 'SURVEY', 'PROPOSAL', 'KICKOFF_APPROVAL'],
      ],
      [
        'CUSTOM',
        true,
        true,
        'HIGH',
        'CUSTOM',
        [
          'ASSIGNMENT',
          'SURVEY',
          'PROPOSAL',
          'FINANCIAL_PLANNING',
          'KICKOFF_APPROVAL',
        ],
      ],
    ]);
    expect(
      routeProject({ projectType: 'DESIGN_AND_BUILD' }).documentTypes,
    ).toEqual([
      'PROJECT_DOSSIER',
      'RESPONSIBILITY_MATRIX',
      'SURVEY_REPORT',
      'SITE_CONSTRAINTS',
      'SCOPE_STATEMENT',
      'PROPOSAL',
      'PROPOSAL_MILESTONES',
      'PROPOSAL_WBS',
      'RISK_REGISTER',
      'RESOURCE_PLAN',
      'PRELIMINARY_FINANCIAL_PLAN',
      'KICKOFF_APPROVAL',
    ]);
  });

  it('keeps the full literal workstream and document policy for every project type', () => {
    const types = [
      'DESIGN_AND_BUILD',
      'DESIGN_ONLY',
      'PRODUCT_SUPPLY',
      'PRODUCT_SUPPLY_AND_INSTALLATION',
      'INSTALLATION_ONLY',
      'INTERNAL',
      'RENOVATION_WARRANTY',
      'CUSTOM',
    ] satisfies ProjectType[];

    expect(
      Object.fromEntries(
        types.map((projectType) => {
          const routing = routeProject({ projectType });
          return [
            projectType,
            {
              workstreams: routing.workstreams,
              documentTypes: routing.documentTypes,
            },
          ];
        }),
      ),
    ).toEqual({
      DESIGN_AND_BUILD: {
        workstreams: [
          'PROJECT_MANAGEMENT',
          'DESIGN',
          'PROCUREMENT',
          'INSTALLATION',
        ],
        documentTypes: [
          'PROJECT_DOSSIER',
          'RESPONSIBILITY_MATRIX',
          'SURVEY_REPORT',
          'SITE_CONSTRAINTS',
          'SCOPE_STATEMENT',
          'PROPOSAL',
          'PROPOSAL_MILESTONES',
          'PROPOSAL_WBS',
          'RISK_REGISTER',
          'RESOURCE_PLAN',
          'PRELIMINARY_FINANCIAL_PLAN',
          'KICKOFF_APPROVAL',
        ],
      },
      DESIGN_ONLY: {
        workstreams: ['PROJECT_MANAGEMENT', 'DESIGN'],
        documentTypes: [
          'PROJECT_DOSSIER',
          'RESPONSIBILITY_MATRIX',
          'SURVEY_REPORT',
          'SITE_CONSTRAINTS',
          'SCOPE_STATEMENT',
          'PROPOSAL',
          'PROPOSAL_MILESTONES',
          'PROPOSAL_WBS',
          'RISK_REGISTER',
          'RESOURCE_PLAN',
          'PRELIMINARY_FINANCIAL_PLAN',
          'KICKOFF_APPROVAL',
        ],
      },
      PRODUCT_SUPPLY: {
        workstreams: ['PROJECT_MANAGEMENT', 'PROCUREMENT'],
        documentTypes: [
          'PROJECT_DOSSIER',
          'RESPONSIBILITY_MATRIX',
          'SCOPE_STATEMENT',
          'PROPOSAL',
          'PROPOSAL_MILESTONES',
          'PROPOSAL_WBS',
          'RISK_REGISTER',
          'RESOURCE_PLAN',
          'PRELIMINARY_FINANCIAL_PLAN',
          'KICKOFF_APPROVAL',
        ],
      },
      PRODUCT_SUPPLY_AND_INSTALLATION: {
        workstreams: ['PROJECT_MANAGEMENT', 'PROCUREMENT', 'INSTALLATION'],
        documentTypes: [
          'PROJECT_DOSSIER',
          'RESPONSIBILITY_MATRIX',
          'SURVEY_REPORT',
          'SITE_CONSTRAINTS',
          'SCOPE_STATEMENT',
          'PROPOSAL',
          'PROPOSAL_MILESTONES',
          'PROPOSAL_WBS',
          'RISK_REGISTER',
          'RESOURCE_PLAN',
          'PRELIMINARY_FINANCIAL_PLAN',
          'KICKOFF_APPROVAL',
        ],
      },
      INSTALLATION_ONLY: {
        workstreams: ['PROJECT_MANAGEMENT', 'INSTALLATION'],
        documentTypes: [
          'PROJECT_DOSSIER',
          'RESPONSIBILITY_MATRIX',
          'SURVEY_REPORT',
          'SITE_CONSTRAINTS',
          'SCOPE_STATEMENT',
          'PROPOSAL',
          'PROPOSAL_MILESTONES',
          'PROPOSAL_WBS',
          'RISK_REGISTER',
          'RESOURCE_PLAN',
          'PRELIMINARY_FINANCIAL_PLAN',
          'KICKOFF_APPROVAL',
        ],
      },
      INTERNAL: {
        workstreams: ['PROJECT_MANAGEMENT', 'INTERNAL'],
        documentTypes: [
          'PROJECT_DOSSIER',
          'RESPONSIBILITY_MATRIX',
          'SCOPE_STATEMENT',
          'PROPOSAL',
          'PROPOSAL_MILESTONES',
          'PROPOSAL_WBS',
          'RISK_REGISTER',
          'RESOURCE_PLAN',
          'KICKOFF_APPROVAL',
        ],
      },
      RENOVATION_WARRANTY: {
        workstreams: ['PROJECT_MANAGEMENT', 'WARRANTY'],
        documentTypes: [
          'PROJECT_DOSSIER',
          'RESPONSIBILITY_MATRIX',
          'SURVEY_REPORT',
          'SITE_CONSTRAINTS',
          'SCOPE_STATEMENT',
          'PROPOSAL',
          'PROPOSAL_MILESTONES',
          'PROPOSAL_WBS',
          'RISK_REGISTER',
          'RESOURCE_PLAN',
          'KICKOFF_APPROVAL',
        ],
      },
      CUSTOM: {
        workstreams: ['PROJECT_MANAGEMENT', 'CUSTOM'],
        documentTypes: [
          'PROJECT_DOSSIER',
          'RESPONSIBILITY_MATRIX',
          'SURVEY_REPORT',
          'SITE_CONSTRAINTS',
          'SCOPE_STATEMENT',
          'PROPOSAL',
          'PROPOSAL_MILESTONES',
          'PROPOSAL_WBS',
          'RISK_REGISTER',
          'RESOURCE_PLAN',
          'PRELIMINARY_FINANCIAL_PLAN',
          'KICKOFF_APPROVAL',
        ],
      },
    });
  });

  it('includes server-derived Required Documents in readiness cards and literal progress', () => {
    expect(deriveStageOneReadiness(completeDesignAndBuild)).toEqual({
      cards: [
        {
          key: 'PROJECT_DOSSIER',
          applicable: true,
          satisfied: 4,
          total: 4,
          status: 'COMPLETED',
        },
        {
          key: 'PEOPLE',
          applicable: true,
          satisfied: 6,
          total: 6,
          status: 'COMPLETED',
        },
        {
          key: 'SURVEY',
          applicable: true,
          satisfied: 2,
          total: 2,
          status: 'COMPLETED',
        },
        {
          key: 'PROPOSAL',
          applicable: true,
          satisfied: 1,
          total: 1,
          status: 'COMPLETED',
        },
        {
          key: 'FINANCE',
          applicable: true,
          satisfied: 1,
          total: 1,
          status: 'COMPLETED',
        },
        {
          key: 'DOCUMENTS',
          applicable: true,
          satisfied: 12,
          total: 12,
          status: 'COMPLETED',
        },
        {
          key: 'APPROVAL',
          applicable: true,
          satisfied: 1,
          total: 1,
          status: 'COMPLETED',
        },
      ],
      status: 'COMPLETED',
      satisfied: 27,
      total: 27,
      progress: 100,
    });

    expect(
      deriveStageOneReadiness({
        ...completeDesignAndBuild,
        approvalStatus: 'PENDING',
      }),
    ).toMatchObject({
      status: 'READY_FOR_REVIEW',
      satisfied: 26,
      total: 27,
      progress: 96,
    });
    expect(deriveStageOneReadiness({})).toMatchObject({
      status: 'NOT_STARTED',
      satisfied: 0,
      total: 15,
      progress: 0,
    });
  });

  it('keeps ordinary incomplete documents in progress and reserves blocked for hard document failures', () => {
    const incomplete = deriveStageOneReadiness({
      ...completeDesignAndBuild,
      requiredDocumentCount: 2,
      approvedDocumentCount: 0,
      rejectedDocumentCount: 1,
    });
    expect(incomplete.status).toBe('IN_PROGRESS');
    expect(incomplete.cards.find(({ key }) => key === 'DOCUMENTS')).toEqual({
      key: 'DOCUMENTS',
      applicable: true,
      satisfied: 0,
      total: 2,
      status: 'NOT_STARTED',
    });
    expect(
      deriveStageOneReadiness({
        ...completeDesignAndBuild,
        requiredDocumentCount: 2,
        approvedDocumentCount: 1,
        hardBlockedDocumentCount: 1,
      }).status,
    ).toBe('BLOCKED');
  });

  it('keeps incomplete governance and ordinary document work actionable without blocking readiness', () => {
    const readiness = deriveStageOneReadiness({
      ...completeDesignAndBuild,
      principalUserId: undefined,
      requiredDocumentCount: 2,
      approvedDocumentCount: 1,
    });

    expect(readiness.status).toBe('IN_PROGRESS');
    expect(readiness.cards.find(({ key }) => key === 'PEOPLE')).toEqual(
      expect.objectContaining({ satisfied: 5, total: 6 }),
    );
    expect(
      deriveStageOneRedFlags({
        ...completeDesignAndBuild,
        principalUserId: undefined,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GOVERNANCE_PRINCIPAL_MISSING',
          severity: 'WARNING',
          route: '/projects/project-1/stage-1#governance',
        }),
      ]),
    );
  });

  it.each([
    ['GOVERNANCE_PRINCIPAL_MISSING', { principalUserId: undefined }],
    [
      'GOVERNANCE_PRINCIPAL_INACTIVE',
      { activeGovernanceMemberUserIds: ['coordinator-1'] },
    ],
    [
      'GOVERNANCE_COORDINATOR_INVALID',
      { governanceCoordinatorUserIds: ['inactive-coordinator'] },
    ],
    ['RESPONSIBILITY_NOTES_MISSING', { responsibilityNotes: ' ' }],
    ['PROJECT_DEPARTMENT_MISSING', { responsibleDepartmentCount: 0 }],
  ] as const)('surfaces %s as a Vietnamese governance issue', (code, input) => {
    const flags = deriveStageOneRedFlags({
      ...completeDesignAndBuild,
      ...input,
    });

    expect(flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code,
          severity: 'WARNING',
          route: '/projects/project-1/stage-1#governance',
          title: expect.not.stringMatching(new RegExp(code)),
          remediation: expect.any(String),
        }),
      ]),
    );
  });

  it.each([
    [
      'GOVERNANCE_PRINCIPAL_MISSING',
      { principalUserId: undefined },
      { principalUserId: 'principal-1' },
    ],
    [
      'GOVERNANCE_PRINCIPAL_INACTIVE',
      { activeGovernanceMemberUserIds: ['coordinator-1'] },
      { activeGovernanceMemberUserIds: ['principal-1', 'coordinator-1'] },
    ],
    [
      'GOVERNANCE_COORDINATOR_INVALID',
      { governanceCoordinatorUserIds: ['inactive-coordinator'] },
      { governanceCoordinatorUserIds: ['coordinator-1'] },
    ],
    [
      'RESPONSIBILITY_NOTES_MISSING',
      { responsibilityNotes: ' ' },
      { responsibilityNotes: 'Principal owns delivery.' },
    ],
    [
      'PROJECT_DEPARTMENT_MISSING',
      { responsibleDepartmentCount: 0 },
      { responsibleDepartmentCount: 1 },
    ],
  ] as const)(
    'clears %s from readiness and issues after governance is corrected',
    (code, invalid, corrected) => {
      const before = { ...completeDesignAndBuild, ...invalid };
      const after = { ...before, ...corrected };

      expect(deriveStageOneReadiness(before).cards[1]).toEqual(
        expect.objectContaining({ status: 'IN_PROGRESS' }),
      );
      expect(deriveStageOneRedFlags(before)).toEqual(
        expect.arrayContaining([expect.objectContaining({ code })]),
      );
      expect(deriveStageOneReadiness(after).cards[1]).toEqual(
        expect.objectContaining({ status: 'COMPLETED', satisfied: 6 }),
      );
      expect(deriveStageOneRedFlags(after)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code })]),
      );
    },
  );

  it('treats an approved survey not-applicability decision as fully satisfied', () => {
    const readiness = deriveStageOneReadiness({
      ...completeDesignAndBuild,
      surveyScheduledAt: undefined,
      surveyCompletedAt: undefined,
      surveyNotApplicable: true,
      approvalStatus: 'PENDING',
    });

    expect(readiness.cards[2]).toEqual({
      key: 'SURVEY',
      applicable: false,
      satisfied: 2,
      total: 2,
      status: 'COMPLETED',
    });
    expect(readiness.status).toBe('READY_FOR_REVIEW');
  });

  it('keeps invalid runtime types incomplete and emits only the canonical type flag', () => {
    const invalid = {
      ...completeDesignAndBuild,
      projectType: 'UNAPPROVED' as never,
      approvalStatus: 'PENDING' as const,
    };

    expect(() => deriveStageOneReadiness(invalid)).not.toThrow();
    expect(deriveStageOneReadiness(invalid)).toMatchObject({
      status: 'IN_PROGRESS',
      satisfied: 25,
      total: 27,
    });
    expect(deriveStageOneReadiness(invalid).cards[0]).toMatchObject({
      satisfied: 3,
      total: 4,
    });
    expect(deriveStageOneRedFlags(invalid).map((flag) => flag.code)).toEqual([
      'PROJECT_TYPE_MISSING',
    ]);
  });

  it('flags zero and negative active member counts as missing', () => {
    expect(
      deriveStageOneRedFlags({
        ...completeDesignAndBuild,
        activeMemberCount: -1,
      }).map((flag) => flag.code),
    ).toEqual(['PROJECT_MEMBER_MISSING']);
  });

  it('flags a required survey that has neither a record nor a not-applicable decision', () => {
    expect(
      deriveStageOneRedFlags({
        ...completeDesignAndBuild,
        surveyScheduledAt: undefined,
        surveyCompletedAt: undefined,
      }).map((flag) => flag.code),
    ).toEqual(['SURVEY_REQUIRED_BUT_MISSING']);
  });

  it('surfaces every unresolved Stage 1 red-flag condition with direct remediation', () => {
    const flags = deriveStageOneRedFlags({
      projectId: 'project-1',
      projectType: 'DESIGN_AND_BUILD',
      principalUserId: 'principal-1',
      activeGovernanceMemberUserIds: ['principal-1'],
      governanceCoordinatorUserIds: [],
      responsibilityNotes: 'Principal owns delivery.',
      responsibleDepartmentCount: 1,
      requiredDocumentCount: 2,
      approvedDocumentCount: 0,
      rejectedDocumentCount: 1,
      overdueDocumentCount: 1,
      requirementOverdueCount: 1,
      requirementDueDate: new Date('2026-07-02T00:00:00.000Z'),
      surveyScheduledAt: new Date('2026-07-01T00:00:00.000Z'),
      approvalStatus: 'REJECTED',
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(
      flags.map(({ code, severity, owner, dueDate, route, remediation }) => [
        code,
        severity,
        owner,
        dueDate?.toISOString(),
        route,
        remediation,
      ]),
    ).toEqual([
      [
        'PROJECT_MANAGER_MISSING',
        'CRITICAL',
        'PROJECT_OWNER',
        undefined,
        '/projects/project-1/stage-1/initiation',
        'Assign an active Project Manager.',
      ],
      [
        'PROJECT_MEMBER_MISSING',
        'CRITICAL',
        'PROJECT_MANAGER',
        undefined,
        '/projects/project-1/members',
        'Add an active project member.',
      ],
      [
        'CUSTOMER_MISSING_WHEN_REQUIRED',
        'CRITICAL',
        'PROJECT_MANAGER',
        undefined,
        '/projects/project-1/stage-1/initiation',
        'Select the project customer.',
      ],
      [
        'PLANNED_HANDOVER_MISSING',
        'WARNING',
        'PROJECT_MANAGER',
        undefined,
        '/projects/project-1/stage-1/initiation',
        'Set the planned handover date.',
      ],
      [
        'SURVEY_OVERDUE',
        'WARNING',
        'PROJECT_MANAGER',
        '2026-07-01T00:00:00.000Z',
        '/projects/project-1/stage-1/survey',
        'Record the survey or mark it not applicable.',
      ],
      [
        'REQUIREMENT_OVERDUE',
        'WARNING',
        'PROJECT_MANAGER',
        '2026-07-02T00:00:00.000Z',
        '/projects/project-1/stage-1/requirements',
        'Resolve the overdue project requirement.',
      ],
      [
        'REQUIRED_DOCUMENT_MISSING',
        'WARNING',
        'DOCUMENT_OWNER',
        undefined,
        '/projects/project-1/documents?stageKey=STAGE_1',
        'Submit the missing required document.',
      ],
      [
        'REQUIRED_DOCUMENT_OVERDUE',
        'WARNING',
        'DOCUMENT_OWNER',
        undefined,
        '/projects/project-1/documents?stageKey=STAGE_1',
        'Submit the overdue required document.',
      ],
      [
        'REQUIRED_DOCUMENT_REJECTED',
        'WARNING',
        'DOCUMENT_OWNER',
        undefined,
        '/projects/project-1/documents?stageKey=STAGE_1',
        'Replace the rejected document and resubmit it.',
      ],
      [
        'FINANCIAL_PLAN_MISSING_WHEN_REQUIRED',
        'WARNING',
        'PROJECT_MANAGER',
        undefined,
        '/projects/project-1/stage-1/requirements#finance',
        'Complete the preliminary financial plan.',
      ],
      [
        'STAGE_APPROVAL_REJECTED',
        'CRITICAL',
        'PROJECT_MANAGER',
        undefined,
        '/projects/project-1/stage-1/approval',
        'Address the approval comments and resubmit.',
      ],
    ]);
  });

  it('flags a missing project type until a canonical type is selected', () => {
    expect(
      deriveStageOneRedFlags({
        ...completeDesignAndBuild,
        projectType: undefined,
      }).map((flag) => flag.code),
    ).toEqual(['PROJECT_TYPE_MISSING']);
  });

  it('attributes each document flag to its matching document condition', () => {
    const flags = deriveStageOneRedFlags({
      ...completeDesignAndBuild,
      requiredDocumentCount: 4,
      approvedDocumentCount: 1,
      rejectedDocumentCount: 1,
      overdueDocumentCount: 1,
      missingDocumentOwner: 'MISSING_OWNER',
      missingDocumentDueDate: new Date('2026-08-20T00:00:00.000Z'),
      overdueDocumentOwner: 'OVERDUE_OWNER',
      overdueDocumentDueDate: new Date('2026-07-30T00:00:00.000Z'),
      rejectedDocumentOwner: 'REJECTED_OWNER',
      rejectedDocumentDueDate: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(
      flags
        .filter(({ code }) => code.startsWith('REQUIRED_DOCUMENT_'))
        .map(({ code, owner, dueDate }) => [
          code,
          owner,
          dueDate?.toISOString(),
        ]),
    ).toEqual([
      [
        'REQUIRED_DOCUMENT_MISSING',
        'MISSING_OWNER',
        '2026-08-20T00:00:00.000Z',
      ],
      [
        'REQUIRED_DOCUMENT_OVERDUE',
        'OVERDUE_OWNER',
        '2026-07-30T00:00:00.000Z',
      ],
      [
        'REQUIRED_DOCUMENT_REJECTED',
        'REJECTED_OWNER',
        '2026-08-10T00:00:00.000Z',
      ],
    ]);
  });

  it('removes red flags as their underlying facts are resolved', () => {
    expect(deriveStageOneRedFlags(completeDesignAndBuild)).toEqual([]);
    expect(
      deriveStageOneRedFlags({
        ...completeDesignAndBuild,
        rejectedDocumentCount: 1,
        approvedDocumentCount: 11,
      }).map((flag) => flag.code),
    ).toEqual(['REQUIRED_DOCUMENT_REJECTED']);
  });

  it('preserves revision-required separately from rejection downstream', () => {
    expect(
      deriveStageOneRedFlags({
        ...completeDesignAndBuild,
        approvalStatus: 'DRAFT',
        approvalDecision: 'REVISION_REQUIRED',
      }).map(({ code }) => code),
    ).toEqual(['STAGE_APPROVAL_REVISION_REQUIRED']);
  });
});
