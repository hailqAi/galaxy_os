import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import type { CurrentActor } from '../access-control/current-actor';
import type { PrismaService } from '../prisma.service';
import type { ProjectApproverResolver } from './project-approver-resolver.service';
import { ProjectStageOneService } from './project-stage-one.service';

const actor = (userId: string, permission: string): CurrentActor => ({
  userId,
  organizationId: 'organization-1',
  organizationMembershipId: `membership-${userId}`,
  sessionId: `session-${userId}`,
  email: `${userId}@example.com`,
  displayName: userId,
  mustChangePassword: false,
  permissions: [permission, 'file.read'],
  permissionSources: [],
  administrationScope: 'SELF',
  managedDepartmentIds: [],
  administrationTier: 0,
});

function approvalPrisma() {
  const documentTypes = [
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
  ];
  const state = {
    project: {
      id: 'project-1',
      organizationId: 'organization-1',
      createdBy: 'creator-1',
      code: 'PRJ-001',
      name: 'Galaxy Centre',
      customerId: 'customer-1',
      projectType: 'DESIGN_AND_BUILD',
      projectManagerId: 'pm-1',
      projectManager: {
        status: 'active',
        organizationMembers: [{ id: 'organization-member-pm' }],
      },
      members: [
        {
          userId: 'member-1',
          user: {
            status: 'active',
            organizationMembers: [{ id: 'organization-member-1' }],
          },
        },
      ],
      departments: [{ id: 'project-department-1' }],
      locations: [{ id: 'location-1' }],
      description: 'Design, supply, and install the fit-out.',
      phase: 'SURVEY',
      stageOnePlan: {
        responsibilityNotes: 'PM owns delivery.',
        siteConstraints: 'Restricted access.',
        scopeNotes: 'Apartment fit-out.',
        proposalBaseline: 'Baseline 1',
        proposalMilestones: [{ name: 'Design' }],
        proposalWbs: [{ code: '1.0' }],
        riskNotes: 'Lift access.',
        resourceNotes: 'Two installers.',
        preliminaryRevenue: 1000,
        preliminaryCost: 800,
        preliminaryMargin: 200,
        preliminaryCurrency: 'THB',
        preliminaryFinancialPlanDate: new Date('2026-08-01T00:00:00Z'),
      },
      surveys: [
        {
          id: 'survey-1',
          scheduledAt: new Date('2026-07-30T00:00:00Z'),
          surveyedAt: new Date('2026-07-31T00:00:00Z'),
        },
      ],
    },
    stageState: {
      id: 'stage-state-1',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      status: 'TODO',
      completedBy: null as string | null,
      completedAt: null as Date | null,
      gateDecisionVersion: 0,
      version: 1,
    },
    steps: [
      'ASSIGNMENT',
      'SURVEY',
      'PROPOSAL',
      'FINANCIAL_PLANNING',
      'KICKOFF_APPROVAL',
    ].map((step) => ({
      id: `step-${step.toLowerCase()}`,
      step,
      status: step === 'KICKOFF_APPROVAL' ? 'TODO' : 'DONE',
      notApplicableReason: null as string | null,
      notApplicableBy: null as string | null,
      notApplicableAt: null as Date | null,
    })),
    documents: documentTypes.map((documentType, index) => ({
      id: `document-${index + 1}`,
      documentType,
      required: true,
      status: 'APPROVED',
      currentFileAssetId: `file-document-${index + 1}` as string | null,
      notApplicableReason: null as string | null,
      markedBy: null as string | null,
      markedAt: null as Date | null,
      supersededAt: null,
    })),
    approvals: [] as Array<Record<string, unknown>>,
    activities: [] as Array<Record<string, unknown>>,
    notifications: [] as Array<Record<string, unknown>>,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'stage-state-1' }]),
    project: {
      findMany: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
      findFirst: vi.fn().mockImplementation(async () => ({
        ...state.project,
        stageStates: [state.stageState],
        stageSteps: state.steps,
        stageApprovals: [...state.approvals].sort(
          (left, right) => Number(right.version) - Number(left.version),
        ),
        requiredDocuments: state.documents.filter(
          (document) => document.required && !document.supersededAt,
        ),
      })),
      updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
        if (
          where.id !== state.project.id ||
          !where.phase.in.includes(state.project.phase)
        )
          return { count: 0 };
        Object.assign(state.project, data, { phase: data.phase });
        return { count: 1 };
      }),
    },
    projectStageApproval: {
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        return (
          state.approvals.find(
            (approval) =>
              (where.id && approval.id === where.id) ||
              (where.projectId_idempotencyKey &&
                approval.projectId ===
                  where.projectId_idempotencyKey.projectId &&
                approval.idempotencyKey ===
                  where.projectId_idempotencyKey.idempotencyKey),
          ) ?? null
        );
      }),
      aggregate: vi.fn().mockImplementation(async () => ({
        _max: {
          version: state.approvals.reduce(
            (max, approval) => Math.max(max, Number(approval.version)),
            0,
          ),
        },
      })),
      findFirst: vi
        .fn()
        .mockImplementation(
          async ({ where }) =>
            state.approvals.find(
              (approval) =>
                approval.projectId === where.projectId &&
                approval.stage === where.stage &&
                approval.status === where.status,
            ) ?? null,
        ),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const approval = {
          id: `approval-${state.approvals.length + 1}`,
          ...data,
          createdAt: new Date(),
        };
        state.approvals.push(approval);
        return approval;
      }),
      updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
        const approval = state.approvals.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.projectId === where.projectId &&
            candidate.version === where.version &&
            candidate.status === where.status &&
            candidate.reviewedBy === where.reviewedBy,
        );
        if (!approval) return { count: 0 };
        Object.assign(approval, data);
        return { count: 1 };
      }),
    },
    projectStageState: {
      updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
        if (
          state.stageState.id !== where.id ||
          state.stageState.version !== where.version ||
          state.stageState.status === 'DONE'
        )
          return { count: 0 };
        state.stageState.status = data.status;
        state.stageState.completedBy = data.completedBy;
        state.stageState.completedAt = data.completedAt;
        state.stageState.gateDecisionVersion +=
          data.gateDecisionVersion.increment;
        state.stageState.version += data.version.increment;
        return { count: 1 };
      }),
    },
    projectStageStep: {
      updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
        const step = state.steps.find(
          (candidate) =>
            candidate.step === where.step &&
            (where.status.in?.includes(candidate.status) ||
              candidate.status === where.status),
        );
        if (!step) return { count: 0 };
        step.status = data.status;
        return { count: 1 };
      }),
    },
    projectStageOnePlan: {
      count: vi.fn().mockImplementation(async () => {
        const plan = state.project.stageOnePlan;
        return plan.preliminaryRevenue != null &&
          plan.preliminaryCost != null &&
          plan.preliminaryCurrency != null &&
          plan.preliminaryFinancialPlanDate != null
          ? 1
          : 0;
      }),
    },
    entityAttachment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi
        .fn()
        .mockImplementation(async ({ where }) =>
          where.fileAssetId === 'file-project-1' &&
          where.projectId === 'project-1'
            ? { id: 'attachment-1' }
            : null,
        ),
    },
    projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
    projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
    fileAsset: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockImplementation(async ({ where }) =>
        where.id.equals === 'file-project-1'
          ? {
              id: 'file-project-1',
              originalFilename: 'evidence.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1n,
              uploadedById: 'submitter-1',
              createdAt: new Date(),
            }
          : null,
      ),
    },
    activity: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => {
        state.activities.push(data);
        return data;
      }),
    },
    notification: {
      createMany: vi.fn().mockImplementation(async ({ data }) => {
        for (const notification of data)
          if (
            !state.notifications.some(
              (item) => item.idempotencyKey === notification.idempotencyKey,
            )
          )
            state.notifications.push(notification);
        return { count: data.length };
      }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn().mockImplementation(async (callback) => {
      const snapshot = structuredClone({
        project: state.project,
        stageState: state.stageState,
        approvals: state.approvals,
        activities: state.activities,
        notifications: state.notifications,
      });
      try {
        return await callback(tx);
      } catch (error) {
        Object.assign(state.project, snapshot.project);
        Object.assign(state.stageState, snapshot.stageState);
        state.approvals = snapshot.approvals;
        state.activities = snapshot.activities;
        state.notifications = snapshot.notifications;
        throw error;
      }
    }),
  } as unknown as PrismaService;
  const approvers = {
    resolve: vi
      .fn()
      .mockResolvedValue([{ id: 'creator-1' }, { id: 'reviewer-1' }]),
  } as unknown as ProjectApproverResolver;
  const service = new ProjectStageOneService(
    prisma,
    new BusinessEntityPolicy(prisma),
    approvers,
    { write: vi.fn() } as never,
  );
  return { approvers, prisma, service, state, tx };
}

describe('ProjectStageOneService approval', () => {
  it('submits once to an active non-creator reviewer with direct side effects', async () => {
    const { approvers, service, state } = approvalPrisma();
    const submitter = actor('submitter-1', 'project.stage1.submit');
    const data = {
      comments: 'Ready for review.',
      evidenceFileId: 'file-project-1',
      idempotencyKey: 'stage-one-submit-1',
    };

    const first = await service.submitApproval(submitter, 'project-1', data);
    const retry = await service.submitApproval(submitter, 'project-1', data);

    expect(first).toMatchObject({
      id: 'approval-1',
      version: 1,
      status: 'PENDING',
      submittedBy: 'submitter-1',
      reviewedBy: 'reviewer-1',
    });
    expect(state.steps.at(-1)).toMatchObject({
      step: 'KICKOFF_APPROVAL',
      status: 'IN_REVIEW',
    });
    expect(retry).toEqual(first);
    expect(approvers.resolve).toHaveBeenCalledWith(
      'organization-1',
      'project-1',
      'project.stage1.review',
      'submitter-1',
      expect.anything(),
    );
    expect(state.activities).toHaveLength(1);
    expect(state.notifications).toEqual([
      expect.objectContaining({
        recipientId: 'reviewer-1',
        title: 'Yêu cầu phê duyệt GĐ 1',
        entityType: 'Project',
        entityId: 'project-1',
        href: '/projects/project-1/stage-1/approval',
      }),
    ]);
  });

  it('accepts uploaded FILE_PRESENT documents when submitting Stage 1 approval', async () => {
    const { service, state } = approvalPrisma();
    for (const document of state.documents)
      if (document.documentType !== 'KICKOFF_APPROVAL')
        Object.assign(document, {
          status: 'UPLOADED',
          currentFileAssetId: `file-${document.id}`,
        });
    Object.assign(
      state.documents.find(
        ({ documentType }) => documentType === 'KICKOFF_APPROVAL',
      )!,
      { status: 'APPROVED', currentFileAssetId: 'file-kickoff' },
    );

    await expect(
      service.submitApproval(
        actor('submitter-1', 'project.stage1.submit'),
        'project-1',
        { idempotencyKey: 'file-present-ready' },
      ),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('rejects a pending APPROVED-policy document from Stage 1 approval submission', async () => {
    const { service, state } = approvalPrisma();
    Object.assign(
      state.documents.find(
        ({ documentType }) => documentType === 'KICKOFF_APPROVAL',
      )!,
      { status: 'PENDING_REVIEW', currentFileAssetId: 'file-kickoff' },
    );

    await expect(
      service.submitApproval(
        actor('submitter-1', 'project.stage1.submit'),
        'project-1',
        { idempotencyKey: 'approval-policy-pending' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        blockers: [
          expect.objectContaining({
            code: 'REQUIRED_DOCUMENT_NOT_READY',
            entityId: state.documents.find(
              ({ documentType }) => documentType === 'KICKOFF_APPROVAL',
            )!.id,
          }),
        ],
      }),
    });
  });

  it('blocks any active required Stage 1 document, including custom records', async () => {
    const { service, state } = approvalPrisma();
    state.documents.push({
      id: 'document-custom',
      documentType: 'CUSTOM_SAFETY_PLAN',
      required: true,
      status: 'DRAFT',
      currentFileAssetId: null,
      notApplicableReason: null,
      markedBy: null,
      markedAt: null,
      supersededAt: null,
    });

    await expect(
      service.submitApproval(
        actor('submitter-1', 'project.stage1.submit'),
        'project-1',
        { idempotencyKey: 'custom-document' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        blockers: expect.arrayContaining([
          expect.objectContaining({
            code: 'REQUIRED_DOCUMENT_NOT_READY',
            entityId: 'document-custom',
            title: 'Hồ sơ bắt buộc chưa sẵn sàng để phê duyệt',
            remediation: 'Gửi mọi hồ sơ bắt buộc đang áp dụng để phê duyệt.',
          }),
        ]),
      }),
    });
  });

  it('allows only one pending approval across different idempotency keys', async () => {
    const { service } = approvalPrisma();
    const submitter = actor('submitter-1', 'project.stage1.submit');
    await service.submitApproval(submitter, 'project-1', {
      idempotencyKey: 'first-pending',
    });

    await expect(
      service.submitApproval(submitter, 'project-1', {
        idempotencyKey: 'second-pending',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a concurrent idempotent submission after serializing version allocation', async () => {
    const { service, state, tx } = approvalPrisma();
    tx.$queryRaw.mockImplementationOnce(async () => {
      state.approvals.push({
        id: 'approval-concurrent',
        projectId: 'project-1',
        stage: 'STAGE_ONE',
        version: 1,
        status: 'PENDING',
        submittedBy: 'submitter-1',
        reviewedBy: 'reviewer-1',
        idempotencyKey: 'concurrent',
      });
      return [{ id: 'stage-state-1' }];
    });

    await expect(
      service.submitApproval(
        actor('submitter-1', 'project.stage1.submit'),
        'project-1',
        { idempotencyKey: 'concurrent' },
      ),
    ).resolves.toMatchObject({ id: 'approval-concurrent', version: 1 });
    expect(state.approvals).toHaveLength(1);
    expect(state.activities).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
  });

  it('rejects submission until Steps 1-4 and required documents are ready', async () => {
    const { service, state } = approvalPrisma();
    state.steps[2]!.status = 'IN_PROGRESS';
    state.documents[0]!.status = 'DRAFT';
    state.documents[0]!.currentFileAssetId = null;

    await expect(
      service.submitApproval(
        actor('submitter-1', 'project.stage1.submit'),
        'project-1',
        {
          idempotencyKey: 'blocked',
        },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: 'PROPOSAL_STEP_INCOMPLETE' }),
          expect.objectContaining({ code: 'REQUIRED_DOCUMENT_NOT_READY' }),
        ]),
      }),
    });
  });

  it('rejects evidence outside the authorized Project', async () => {
    const { service } = approvalPrisma();
    await expect(
      service.submitApproval(
        actor('submitter-1', 'project.stage1.submit'),
        'project-1',
        {
          evidenceFileId: 'file-other-project',
          idempotencyKey: 'bad-evidence',
        },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('enforces exact reviewer, self-approval, exact decision, and comments', async () => {
    const { service, state } = approvalPrisma();
    const pending = await service.submitApproval(
      actor('submitter-1', 'project.stage1.submit'),
      'project-1',
      { idempotencyKey: 'decision' },
    );
    await expect(
      service.decideApproval(
        actor('other-reviewer', 'project.stage1.review'),
        'project-1',
        pending.id,
        { decision: 'APPROVED', version: 1 },
      ),
    ).rejects.toThrow(
      'Chỉ người được phân công phê duyệt mới được quyết định.',
    );
    state.approvals[0]!.reviewedBy = 'submitter-1';
    await expect(
      service.decideApproval(
        actor('submitter-1', 'project.stage1.review'),
        'project-1',
        pending.id,
        { decision: 'APPROVED', version: 1 },
      ),
    ).rejects.toThrow('Người gửi không được tự phê duyệt yêu cầu của mình.');
    state.approvals[0]!.reviewedBy = 'reviewer-1';

    const decided = await service.decideApproval(
      actor('reviewer-1', 'project.stage1.review'),
      'project-1',
      pending.id,
      {
        decision: 'APPROVED_WITH_COMMENTS',
        comments: 'Proceed after recording the access plan.',
        evidenceFileId: 'file-project-1',
        version: 1,
      },
    );

    expect(decided).toMatchObject({
      status: 'APPROVED',
      decision: 'APPROVED_WITH_COMMENTS',
      reviewedBy: 'reviewer-1',
      comments: 'Proceed after recording the access plan.',
      evidenceFileId: 'file-project-1',
    });
    expect(state.steps.at(-1)).toMatchObject({
      step: 'KICKOFF_APPROVAL',
      status: 'DONE',
    });
    expect(state.activities).toHaveLength(2);
    expect(state.notifications.at(-1)).toMatchObject({
      recipientId: 'submitter-1',
      title: 'Phê duyệt GĐ 1: Phê duyệt kèm ý kiến',
      entityType: 'Project',
      entityId: 'project-1',
      href: '/projects/project-1/stage-1/approval',
    });
  });

  it.each([
    ['REVISION_REQUIRED', 'DRAFT'],
    ['REJECTED', 'REJECTED'],
  ] as const)(
    'preserves %s without satisfying approval readiness',
    async (decision, status) => {
      const { service } = approvalPrisma();
      const pending = await service.submitApproval(
        actor('submitter-1', 'project.stage1.submit'),
        'project-1',
        { idempotencyKey: decision },
      );

      await expect(
        service.decideApproval(
          actor('reviewer-1', 'project.stage1.review'),
          'project-1',
          pending.id,
          { decision, comments: 'Changes are required.', version: 1 },
        ),
      ).resolves.toMatchObject({ status, decision });
    },
  );

  it('returns an identical decision retry and conflicts on a different decision', async () => {
    const { service, state } = approvalPrisma();
    const pending = await service.submitApproval(
      actor('submitter-1', 'project.stage1.submit'),
      'project-1',
      { idempotencyKey: 'decision-retry' },
    );
    const reviewer = actor('reviewer-1', 'project.stage1.review');
    const approved = await service.decideApproval(
      reviewer,
      'project-1',
      pending.id,
      { decision: 'APPROVED', version: 1 },
    );

    await expect(
      service.decideApproval(reviewer, 'project-1', pending.id, {
        decision: 'APPROVED',
        version: 1,
      }),
    ).resolves.toEqual(approved);
    await expect(
      service.decideApproval(reviewer, 'project-1', pending.id, {
        decision: 'REJECTED',
        comments: 'No.',
        version: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.activities).toHaveLength(2);
    expect(state.notifications).toHaveLength(2);
  });
});

describe('ProjectStageOneService gate', () => {
  it('returns structured blockers for every gate category without values', async () => {
    const { service, state } = approvalPrisma();
    state.project.code = '';
    state.project.projectType = null as unknown as string;
    state.project.customerId = null as unknown as string;
    state.project.projectManagerId = null as unknown as string;
    state.project.members = [];
    state.steps[0]!.status = 'IN_PROGRESS';
    state.project.surveys = [];
    state.project.stageOnePlan.proposalBaseline = '';
    state.project.stageOnePlan.preliminaryFinancialPlanDate =
      null as unknown as Date;
    state.documents[0]!.status = 'REJECTED';

    const result = await service.completeGate(
      actor('gatekeeper-1', 'project.stage1.complete_gate'),
      'project-1',
    );

    expect(result).toMatchObject({ completed: false });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PROJECT_IDENTITY_MISSING' }),
        expect.objectContaining({ code: 'PROJECT_TYPE_MISSING' }),
        expect.objectContaining({ code: 'CUSTOMER_MISSING_WHEN_REQUIRED' }),
        expect.objectContaining({ code: 'PROJECT_MANAGER_MISSING' }),
        expect.objectContaining({ code: 'PROJECT_MEMBER_MISSING' }),
        expect.objectContaining({ code: 'ASSIGNMENT_STEP_INCOMPLETE' }),
        expect.objectContaining({ code: 'KICKOFF_APPROVAL_STEP_INCOMPLETE' }),
        expect.objectContaining({ code: 'PROPOSAL_NOT_READY' }),
        expect.objectContaining({ code: 'STAGE_APPROVAL_MISSING' }),
      ]),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /1000|800|200|revenue|cost|margin/i,
    );

    state.project.projectType = 'DESIGN_AND_BUILD';
    const routed = await service.completeGate(
      actor('gatekeeper-1', 'project.stage1.complete_gate'),
      'project-1',
    );
    expect(routed.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SURVEY_REQUIRED_BUT_MISSING' }),
        expect.objectContaining({ code: 'FINANCIAL_PLAN_NOT_READY' }),
        expect.objectContaining({ code: 'REQUIRED_DOCUMENT_NOT_APPROVED' }),
      ]),
    );
    expect(JSON.stringify(routed)).not.toMatch(
      /1000|800|200|revenue|cost|margin/i,
    );
  });

  it('accepts audited document NA and APPROVED_WITH_COMMENTS, completes once, and deduplicates retry', async () => {
    const { service, state, tx } = approvalPrisma();
    state.documents[0] = {
      ...state.documents[0]!,
      status: 'NOT_APPLICABLE',
      notApplicableReason: 'Customer contract supplies this record.',
      markedBy: 'reviewer-1',
      markedAt: new Date('2026-08-01T00:00:00Z'),
    };
    state.approvals.push({
      id: 'approval-1',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      version: 1,
      status: 'APPROVED',
      decision: 'APPROVED_WITH_COMMENTS',
      submittedBy: 'submitter-1',
      reviewedBy: 'reviewer-1',
      decidedAt: new Date('2026-08-01T00:00:00Z'),
    });
    state.steps.at(-1)!.status = 'DONE';
    const gatekeeper = actor('gatekeeper-1', 'project.stage1.complete_gate');

    const first = await service.completeGate(gatekeeper, 'project-1');
    const retry = await service.completeGate(gatekeeper, 'project-1');

    expect(first).toMatchObject({
      completed: true,
      alreadyComplete: false,
      phase: 'DESIGN',
      gateDecisionVersion: 1,
    });
    expect(retry).toMatchObject({
      completed: true,
      alreadyComplete: true,
      phase: 'DESIGN',
      gateDecisionVersion: 1,
    });
    expect(state.activities).toHaveLength(1);
    expect(state.notifications).toHaveLength(2);
    expect(state.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Đã hoàn tất cổng GĐ 1' }),
      ]),
    );
    expect(JSON.stringify(state.notifications)).not.toMatch(
      /1000|800|200|revenue|cost|margin/i,
    );
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          stageOnePlan: {
            select: expect.objectContaining({
              preliminaryRevenue: true,
              preliminaryCost: true,
              preliminaryMargin: true,
            }),
          },
        }),
      }),
    );
    expect(tx.projectStageOnePlan.count).not.toHaveBeenCalled();
  });

  it('accepts uploaded FILE_PRESENT documents at the completed Stage 1 gate', async () => {
    const { service, state } = approvalPrisma();
    for (const document of state.documents)
      if (document.documentType !== 'KICKOFF_APPROVAL')
        Object.assign(document, {
          status: 'UPLOADED',
          currentFileAssetId: `file-${document.id}`,
        });
    state.approvals.push({
      id: 'approval-file-present',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      version: 1,
      status: 'APPROVED',
      decision: 'APPROVED',
      submittedBy: 'submitter-1',
      reviewedBy: 'reviewer-1',
    });
    state.steps.at(-1)!.status = 'DONE';

    await expect(
      service.completeGate(
        actor('gatekeeper-1', 'project.stage1.complete_gate'),
        'project-1',
      ),
    ).resolves.toMatchObject({ completed: true });
  });

  it('blocks an arbitrary active required document and a shared critical flag', async () => {
    const { service, state } = approvalPrisma();
    state.steps.at(-1)!.status = 'DONE';
    state.documents.push({
      id: 'document-custom-gate',
      documentType: 'CUSTOM_SAFETY_PLAN',
      required: true,
      status: 'PENDING_REVIEW',
      currentFileAssetId: null,
      notApplicableReason: null,
      markedBy: null,
      markedAt: null,
      supersededAt: null,
    });
    state.approvals.push({
      id: 'approval-rejected',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      version: 1,
      status: 'REJECTED',
      decision: 'REJECTED',
      submittedBy: 'submitter-1',
      reviewedBy: 'reviewer-1',
    });

    const result = await service.completeGate(
      actor('gatekeeper-1', 'project.stage1.complete_gate'),
      'project-1',
    );
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'REQUIRED_DOCUMENT_NOT_APPROVED',
          entityId: 'document-custom-gate',
        }),
        expect.objectContaining({ code: 'STAGE_APPROVAL_REJECTED' }),
      ]),
    );
  });

  it('revalidates preliminary margin at the gate after finance completion', async () => {
    const { service, state } = approvalPrisma();
    state.project.stageOnePlan.preliminaryMargin = 100;
    state.steps.at(-1)!.status = 'DONE';
    state.approvals.push({
      id: 'approval-1',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      version: 1,
      status: 'APPROVED',
      decision: 'APPROVED',
      submittedBy: 'submitter-1',
      reviewedBy: 'reviewer-1',
    });

    const result = await service.completeGate(
      actor('gatekeeper-1', 'project.stage1.complete_gate'),
      'project-1',
    );

    expect(result).toMatchObject({ completed: false });
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: 'PRELIMINARY_MARGIN_MISMATCH' }),
    );
  });

  it('rolls back the gate claim and phase when a side effect fails', async () => {
    const { service, state, tx } = approvalPrisma();
    state.approvals.push({
      id: 'approval-1',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      version: 1,
      status: 'APPROVED',
      decision: 'APPROVED',
      submittedBy: 'submitter-1',
      reviewedBy: 'reviewer-1',
    });
    state.steps.at(-1)!.status = 'DONE';
    tx.activity.create.mockRejectedValueOnce(new Error('activity unavailable'));

    await expect(
      service.completeGate(
        actor('gatekeeper-1', 'project.stage1.complete_gate'),
        'project-1',
      ),
    ).rejects.toThrow('activity unavailable');
    expect(state.stageState).toMatchObject({ status: 'TODO', version: 1 });
    expect(state.project.phase).toBe('SURVEY');
  });

  it('reports an optimistic conflict without side effects', async () => {
    const { service, state, tx } = approvalPrisma();
    state.approvals.push({
      id: 'approval-1',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      version: 1,
      status: 'APPROVED',
      decision: 'APPROVED',
      submittedBy: 'submitter-1',
      reviewedBy: 'reviewer-1',
    });
    state.steps.at(-1)!.status = 'DONE';
    tx.projectStageState.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.completeGate(
        actor('gatekeeper-1', 'project.stage1.complete_gate'),
        'project-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.activities).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
  });
});

describe('Stage 1 permission catalog migration', () => {
  it('registers every narrow assignable Stage 1 command permission', () => {
    const sql = readFileSync(
      'prisma/migrations/20260801090000_project_stage_one/migration.sql',
      'utf8',
    );
    for (const code of [
      'project.stage1.submit',
      'project.stage1.review',
      'project.stage1.finance.read',
      'project.stage1.finance.manage',
      'project.stage1.complete_gate',
      'project.survey.not_applicable',
    ])
      expect(sql).toContain(`'${code}'`);
    expect(sql).toContain('INSERT INTO "RolePermission"');
  });
});
