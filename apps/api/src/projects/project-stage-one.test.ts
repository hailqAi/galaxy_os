import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ParseUUIDPipe,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUIRED_PERMISSIONS } from '../access-control/access.decorators';
import { BusinessEntityPolicy } from '../access-control/business-entity.policy';
import type { CurrentActor } from '../access-control/current-actor';
import { HttpExceptionFilter } from '../http-exception.filter';
import type { PrismaService } from '../prisma.service';
import { ProjectStageDocumentTargetDto } from '../uploads/uploads.dto';
import {
  CompleteStageOneStepDto,
  DecideStageOneApprovalDto,
  DeleteStageOneDocumentQuery,
  InitializeStageOneDto,
  ProjectDocumentDefinitionDto,
  SimpleInitiationDto,
  SimpleStageOneDocumentDto,
  StageOneSummaryBatchQuery,
  SubmitStageOneApprovalDto,
  SurveyNotApplicableDto,
  UpdateStageOnePlanDto,
} from './project-stage-one.dto';
import * as stageOneDto from './project-stage-one.dto';
import { ProjectStageOneController } from './project-stage-one.controller';
import {
  SIMPLE_STAGE_ONE_STEPS,
  type StageOneStep,
} from './project-stage-one.rules';
import {
  documentCapabilities,
  ProjectStageOneService,
} from './project-stage-one.service';
import { ProjectStageTwoService } from './project-stage-two.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validate<T>(metatype: new () => T, value: Record<string, unknown>) {
  return pipe.transform(value, { type: 'body', metatype });
}

describe('Stage 1 command DTOs', () => {
  it('binds Workflow and Key Dossier contexts to their routes', () => {
    const commands = {
      createDocumentDefinition: vi.fn(),
      updateDocumentDefinition: vi.fn(),
    };
    const controller = new ProjectStageOneController(commands as never);
    const input = {
      name: 'Hồ sơ',
      position: 0,
      initialMatrix: false,
      active: true,
    } as ProjectDocumentDefinitionDto;

    controller.createDocumentDefinition({} as CurrentActor, 'project-1', input);
    controller.createKeyDossierItem({} as CurrentActor, 'project-1', input);
    controller.updateDocumentDefinition(
      {} as CurrentActor,
      'project-1',
      'definition-1',
      input,
    );
    controller.updateKeyDossierItem(
      {} as CurrentActor,
      'project-1',
      'definition-1',
      input,
    );

    expect(commands.createDocumentDefinition.mock.calls).toEqual([
      [{}, 'project-1', input, false],
      [{}, 'project-1', input, true],
    ]);
    expect(commands.updateDocumentDefinition.mock.calls).toEqual([
      [{}, 'project-1', 'definition-1', input, false],
      [{}, 'project-1', 'definition-1', input, true],
    ]);
  });

  it('keeps the logical Stage 1 document target on each upload session', () => {
    const uploadSession = Prisma.dmmf.datamodel.models.find(
      ({ name }) => name === 'UploadSession',
    );
    const stageOneDocument = Prisma.dmmf.datamodel.models.find(
      ({ name }) => name === 'ProjectStageOneDocument',
    );

    expect(uploadSession?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'stageOneDocumentId',
          type: 'String',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'stageOneDocument',
          type: 'ProjectStageOneDocument',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'submittingOfficerId',
          type: 'String',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'verificationClaimId',
          type: 'String',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'verificationStartedAt',
          type: 'DateTime',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'stagingReleasedAt',
          type: 'DateTime',
          isRequired: false,
        }),
        expect.objectContaining({
          name: 'stagingCleanupAttemptedAt',
          type: 'DateTime',
          isRequired: false,
        }),
      ]),
    );
    expect(stageOneDocument?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'contextType',
          type: 'String',
          isRequired: true,
        }),
      ]),
    );
  });

  it('backfills immutable submitting-officer metadata without rewriting upload history', () => {
    const sql = readFileSync(
      'prisma/migrations/20260823003000_upload_session_safety/migration.sql',
      'utf8',
    );

    expect(sql).toMatch(
      /UPDATE "UploadSession" AS upload[\s\S]*"ProjectStageOneDocumentVersion" AS version[\s\S]*upload\."fileAssetId" = version\."fileAssetId"[\s\S]*upload\."submittingOfficerId" IS NULL/,
    );
    expect(sql).toMatch(
      /"stageOneDocumentId" IS NOT NULL[\s\S]*"submittingOfficerId" IS NULL[\s\S]*"status" IN \('INITIATED', 'UPLOADING', 'VERIFYING', 'AVAILABLE', 'FAILED'\)/,
    );
    expect(sql).not.toMatch(/DELETE FROM "(?:UploadSession|FileAsset)"/);
    expect(sql).not.toMatch(
      /SET "storageKey"[\s\S]*WHERE "fileAssetId" IS NULL/,
    );
  });

  it('backfills Key Dossier references before removing Workflow workstream keys', () => {
    const sql = readFileSync(
      'prisma/migrations/20260910130000_project_delete_key_dossier_separation/migration.sql',
      'utf8',
    );
    const reference = sql.indexOf(
      'SET "referenceMilestoneId" = milestone."id"',
    );
    const namespace = sql.indexOf(
      'SET "workstreamKey" = \'KEY_DOSSIER_LEGACY_\' || "workstreamKey"',
    );

    expect(reference).toBeGreaterThan(-1);
    expect(namespace).toBeGreaterThan(reference);
    expect(sql).toContain(
      'SET "workstreamKey" = item."workstreamKey", "step" = NULL',
    );
  });

  it.each([
    'PUBLIC_INVESTMENT_2026',
    'ODA_CONCESSIONAL_LOAN',
    'PPP',
    'MIXED_OTHER',
  ])(
    'accepts the approved Stage 1 funding source %s',
    async (fundingSource) => {
      const customerId = '00000000-0000-4000-8000-000000000001';
      await expect(
        validate(SimpleInitiationDto, {
          name: '  Bệnh viện Galaxy  ',
          estimatedInvestmentAmount: '123456789012345678.90',
          fundingSource,
          customerId,
          idempotencyKey: '  initiate-1  ',
        }),
      ).resolves.toEqual({
        name: 'Bệnh viện Galaxy',
        estimatedInvestmentAmount: '123456789012345678.90',
        fundingSource,
        customerId,
        idempotencyKey: 'initiate-1',
      });
    },
  );

  it('allows Galaxy projects to leave the legacy public funding taxonomy unset', async () => {
    await expect(
      validate(SimpleInitiationDto, {
        name: 'Galaxy Tower',
        estimatedInvestmentAmount: '35000000000',
        customerId: '00000000-0000-4000-8000-000000000001',
        idempotencyKey: 'initiate-1',
      }),
    ).resolves.toEqual({
      name: 'Galaxy Tower',
      estimatedInvestmentAmount: '35000000000',
      customerId: '00000000-0000-4000-8000-000000000001',
      idempotencyKey: 'initiate-1',
    });
  });

  it('rejects a raw funding source code', async () => {
    await expect(
      validate(SimpleInitiationDto, { fundingSource: 'RAW_CODE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['1234567890123456789.00', '1.234', '1e3', '1,000.00', '-1.00', ''])(
    'rejects an inexact investment amount %j',
    async (value) => {
      await expect(
        validate(SimpleInitiationDto, {
          name: 'Project',
          estimatedInvestmentAmount: value,
          fundingSource: 'PPP',
          customerId: '00000000-0000-4000-8000-000000000001',
          idempotencyKey: 'initiate-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('requires a trimmed custom business name only for Hồ sơ khác', async () => {
    await expect(
      validate(SimpleStageOneDocumentDto, {
        step: 'ASSIGNMENT',
        documentType: 'Phiếu tiếp nhận / Yêu cầu khởi tạo dự án',
      }),
    ).resolves.toEqual({
      step: 'ASSIGNMENT',
      documentType: 'Phiếu tiếp nhận / Yêu cầu khởi tạo dự án',
    });
    await expect(
      validate(SimpleStageOneDocumentDto, {
        step: 'ASSIGNMENT',
        documentType: 'Hồ sơ khác',
        customName: '  Hồ sơ pháp lý bổ sung  ',
      }),
    ).resolves.toEqual({
      step: 'ASSIGNMENT',
      documentType: 'Hồ sơ khác',
      customName: 'Hồ sơ pháp lý bổ sung',
    });
    for (const customName of [undefined, '', '   '])
      await expect(
        validate(SimpleStageOneDocumentDto, {
          step: 'ASSIGNMENT',
          documentType: 'Hồ sơ khác',
          customName,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(SimpleStageOneDocumentDto, {
        step: 'ASSIGNMENT',
        documentType: 'Tài liệu không cấu hình',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(SimpleStageOneDocumentDto, {
        step: 'ASSIGNMENT',
        documentType: 'Phiếu tiếp nhận / Yêu cầu khởi tạo dự án',
        customName: 'Tên không được dùng',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the complete optional document definition command', async () => {
    await expect(
      validate(ProjectDocumentDefinitionDto, {
        name: '  Hồ sơ tùy chỉnh  ',
        workstreamKey: 'SURVEY',
        description: '  Tài liệu hỗ trợ.  ',
        position: 3,
        initialMatrix: false,
        active: true,
        confirmDuplicate: false,
      }),
    ).resolves.toEqual({
      name: 'Hồ sơ tùy chỉnh',
      workstreamKey: 'SURVEY',
      description: 'Tài liệu hỗ trợ.',
      position: 3,
      initialMatrix: false,
      active: true,
      confirmDuplicate: false,
    });
    for (const input of [
      { name: ' ', workstreamKey: 'SURVEY', position: 0 },
      { name: 'Hồ sơ', workstreamKey: 'OTHER', position: 0 },
      { name: 'Hồ sơ', workstreamKey: 'SURVEY', position: -1 },
    ])
      await expect(
        validate(ProjectDocumentDefinitionDto, {
          initialMatrix: false,
          active: true,
          ...input,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an independent Key Dossier milestone without a Workflow Step', async () => {
    await expect(
      validate(ProjectDocumentDefinitionDto, {
        name: 'Tài liệu hợp đồng',
        referenceMilestoneId: '00000000-0000-4000-8000-000000000101',
        position: 2,
        initialMatrix: true,
        active: true,
      }),
    ).resolves.toEqual({
      name: 'Tài liệu hợp đồng',
      referenceMilestoneId: '00000000-0000-4000-8000-000000000101',
      position: 2,
      initialMatrix: true,
      active: true,
    });
    await expect(
      validate(ProjectDocumentDefinitionDto, {
        name: 'Biên bản khảo sát',
        position: 0,
        initialMatrix: false,
        active: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(ProjectDocumentDefinitionDto, {
        name: 'Biên bản khảo sát',
        workstreamKey: 'SURVEY',
        referenceMilestoneId: '00000000-0000-4000-8000-000000000101',
        position: 0,
        initialMatrix: false,
        active: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not require or accept a Workflow Step in a Key Dossier upload target', async () => {
    await expect(
      validate(ProjectStageDocumentTargetDto, {
        definitionId: '00000000-0000-4000-8000-000000000101',
        stageKey: 'STAGE_1',
        contextType: 'STAGE_MATRIX_DOCUMENT',
        submittedOfficerId: '00000000-0000-4000-8000-000000000102',
        idempotencyKey: 'key-dossier-upload',
      }),
    ).resolves.toEqual({
      definitionId: '00000000-0000-4000-8000-000000000101',
      stageKey: 'STAGE_1',
      contextType: 'STAGE_MATRIX_DOCUMENT',
      submittedOfficerId: '00000000-0000-4000-8000-000000000102',
      idempotencyKey: 'key-dossier-upload',
    });
    await expect(
      validate(ProjectStageDocumentTargetDto, {
        definitionId: '00000000-0000-4000-8000-000000000101',
        stageKey: 'STAGE_1',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
        submittedOfficerId: '00000000-0000-4000-8000-000000000102',
        idempotencyKey: 'workflow-upload',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('models independent Key Dossier milestones and item tombstones', () => {
    const milestone = Prisma.dmmf.datamodel.models.find(
      ({ name }) => name === 'KeyDossierReferenceMilestone',
    );
    const item = Prisma.dmmf.datamodel.models.find(
      ({ name }) => name === 'ProjectRequiredDocument',
    );

    expect(milestone?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'projectId', type: 'String' }),
        expect.objectContaining({ name: 'code', type: 'String' }),
        expect.objectContaining({ name: 'name', type: 'String' }),
        expect.objectContaining({ name: 'deletedAt', type: 'DateTime' }),
      ]),
    );
    expect(item?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'referenceMilestoneId',
          type: 'String',
          isRequired: false,
        }),
        expect.objectContaining({ name: 'deletedAt', type: 'DateTime' }),
        expect.objectContaining({ name: 'deletedBy', type: 'String' }),
        expect.objectContaining({ name: 'deleteReason', type: 'String' }),
      ]),
    );
  });

  it('accepts only an explicit Stage 1 document context for deletion', async () => {
    await expect(
      validate(DeleteStageOneDocumentQuery, {
        contextType: 'STAGE_MATRIX_DOCUMENT',
        source: 'STAGE_ONE',
      }),
    ).resolves.toEqual({
      contextType: 'STAGE_MATRIX_DOCUMENT',
      source: 'STAGE_ONE',
    });
    await expect(
      validate(DeleteStageOneDocumentQuery, {
        contextType: 'STAGE_DOCUMENT',
        source: 'LEGACY_REQUIRED_DOCUMENT',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(DeleteStageOneDocumentQuery, {
        contextType: 'STAGE_MATRIX_DOCUMENT',
        source: 'OTHER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts only the Stage 1 governance command shape', async () => {
    const GovernanceDto = (
      stageOneDto as typeof stageOneDto & {
        UpdateStageOneGovernanceDto: new () => object;
      }
    ).UpdateStageOneGovernanceDto;
    const principalUserId = '00000000-0000-4000-8000-000000000001';
    const coordinatorUserId = '00000000-0000-4000-8000-000000000002';

    await expect(
      validate(GovernanceDto, {
        principalUserId,
        coordinatorUserIds: [coordinatorUserId],
        responsibilityNotes: 'x'.repeat(1000),
      }),
    ).resolves.toEqual({
      principalUserId,
      coordinatorUserIds: [coordinatorUserId],
      responsibilityNotes: 'x'.repeat(1000),
    });
    await expect(
      validate(GovernanceDto, {
        principalUserId,
        coordinatorUserIds: [coordinatorUserId, coordinatorUserId],
        responsibilityNotes: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(GovernanceDto, {
        principalUserId,
        coordinatorUserIds: [],
        responsibilityNotes: null,
        approverUserId: '00000000-0000-4000-8000-000000000003',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('parses a bounded comma-separated Stage 1 summary batch', async () => {
    const projectId = '00000000-0000-4000-8000-000000000001';

    await expect(
      validate(StageOneSummaryBatchQuery, { projectIds: projectId }),
    ).resolves.toEqual({ projectIds: [projectId] });
    for (const projectIds of [
      '',
      'not-a-uuid',
      Array.from(
        { length: 21 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      ).join(','),
    ])
      await expect(
        validate(StageOneSummaryBatchQuery, { projectIds }),
      ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects client-owned initialization type and status', async () => {
    await expect(
      validate(InitializeStageOneDto, { projectType: 'DESIGN_AND_BUILD' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(InitializeStageOneDto, { status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(CompleteStageOneStepDto, {
        step: 'SURVEY',
        status: 'COMPLETED',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects negative preliminary money values', async () => {
    await expect(
      validate(UpdateStageOnePlanDto, { preliminaryRevenue: -0.01 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects responsibility notes through the generic plan DTO', async () => {
    await expect(
      validate(UpdateStageOnePlanDto, {
        responsibilityNotes: 'Governance must use its dedicated command.',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires scope flags to be a boolean record', async () => {
    await expect(
      validate(UpdateStageOnePlanDto, { scopeFlags: { design: 'yes' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(UpdateStageOnePlanDto, { scopeFlags: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(UpdateStageOnePlanDto, { scopeFlags: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects wrong primitive and container field types', async () => {
    await expect(
      validate(UpdateStageOnePlanDto, { source: ['Referral'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(CompleteStageOneStepDto, { step: { value: 'SURVEY' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(UpdateStageOnePlanDto, {
        proposalMilestones: { name: 'Survey' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves bounded Decimal(20,2) strings, normalizes currency, and accepts null optionals', async () => {
    await expect(
      validate(UpdateStageOnePlanDto, { preliminaryRevenue: '123.45' }),
    ).resolves.toMatchObject({ preliminaryRevenue: '123.45' });
    await expect(
      validate(UpdateStageOnePlanDto, {
        preliminaryRevenue: '9007199254740993.01',
        preliminaryCost: '0.01',
        preliminaryMargin: '9007199254740993.00',
      }),
    ).resolves.toMatchObject({
      preliminaryRevenue: '9007199254740993.01',
      preliminaryCost: '0.01',
      preliminaryMargin: '9007199254740993.00',
    });
    await expect(
      validate(UpdateStageOnePlanDto, {
        preliminaryRevenue: '999999999999999999.99',
      }),
    ).resolves.toMatchObject({
      preliminaryRevenue: '999999999999999999.99',
    });
    await expect(
      validate(UpdateStageOnePlanDto, {
        preliminaryRevenue: '',
        preliminaryCost: null,
        preliminaryCurrency: ' vnd ',
      }),
    ).resolves.toEqual({
      preliminaryRevenue: undefined,
      preliminaryCost: null,
      preliminaryCurrency: 'VND',
    });
  });

  it('rejects non-Decimal(20,2) preliminary money inputs', async () => {
    for (const preliminaryRevenue of [
      {},
      Number.NaN,
      Infinity,
      123.45,
      true,
      false,
      '-0.01',
      '1e2',
      '1.001',
      '1000000000000000000.00',
    ])
      await expect(
        validate(UpdateStageOnePlanDto, { preliminaryRevenue }),
      ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid cost and margin strings', async () => {
    for (const field of ['preliminaryCost', 'preliminaryMargin'] as const)
      for (const value of ['1e2', '1.001', '1000000000000000000.00'])
        await expect(
          validate(UpdateStageOnePlanDto, { [field]: value }),
        ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    'preliminaryRevenue',
    'preliminaryCost',
    'preliminaryMargin',
    'preliminaryCurrency',
  ] as const)('allows JSON null and omitted optional %s', async (field) => {
    await expect(
      validate(UpdateStageOnePlanDto, { [field]: null }),
    ).resolves.toMatchObject({ [field]: null });
    await expect(
      validate(UpdateStageOnePlanDto, { [field]: undefined }),
    ).resolves.toBeDefined();
  });

  it('returns Vietnamese validation messages without regex internals', async () => {
    for (const [field, value, message] of [
      ['preliminaryRevenue', '12x', 'Doanh thu dự kiến không hợp lệ.'],
      ['preliminaryCost', '1.001', 'Chi phí dự kiến không hợp lệ.'],
      [
        'preliminaryCurrency',
        'viet nam dong',
        'Đơn vị tiền tệ phải có 3 ký tự, ví dụ VND.',
      ],
    ] as const) {
      const error = await validate(UpdateStageOnePlanDto, {
        [field]: value,
      }).catch((caught: unknown) => caught as BadRequestException);
      expect(error.getResponse()).toMatchObject({ message: [message] });
      expect(JSON.stringify(error.getResponse())).not.toContain(
        'regular expression',
      );
    }
  });

  it('rejects malformed UUID and ISO date values', async () => {
    await expect(
      validate(CompleteStageOneStepDto, {
        step: 'SURVEY',
        ownerUserId: 'not-a-uuid',
        dueDate: 'not-a-date',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(CompleteStageOneStepDto, {
        step: 'SURVEY',
        ownerUserId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(SubmitStageOneApprovalDto, {
        evidenceFileId: 'not-a-uuid',
        idempotencyKey: 'submit-stage-one',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('trims and rejects a blank not-applicable reason', async () => {
    await expect(
      validate(SurveyNotApplicableDto, { reason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid decisions and non-approved decisions without comments', async () => {
    await expect(
      validate(DecideStageOneApprovalDto, {
        decision: 'PENDING',
        version: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(DecideStageOneApprovalDto, {
        decision: 'REVISION_REQUIRED',
        version: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects boolean and blank optimistic versions', async () => {
    for (const version of [true, false, '', '   '])
      await expect(
        validate(DecideStageOneApprovalDto, {
          decision: 'APPROVED',
          version,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts valid Stage 1 command payloads', async () => {
    await expect(validate(InitializeStageOneDto, {})).resolves.toEqual({});
    await expect(
      validate(UpdateStageOnePlanDto, {
        source: 'Referral',
        legalEntityText: 'Galaxy Centre Co., Ltd.',
        scopeFlags: { design: true },
        scopeNotes: 'Apartment renovation',
        plannedSurveyAt: '2026-08-10T09:00:00.000Z',
        plannedProposalAt: '2026-08-15T09:00:00.000Z',
        plannedFinancialPlanAt: '2026-08-18T09:00:00.000Z',
        plannedKickoffAt: '2026-08-20T09:00:00.000Z',
        siteConstraints: 'Work only after 18:00.',
        proposalBaseline: 'Revision 1',
        proposalMilestones: [{ name: 'Survey' }],
        proposalWbs: [{ code: '1.0' }],
        riskNotes: 'Limited lift access.',
        resourceNotes: 'Two installers.',
        preliminaryRevenue: '1000.00',
        preliminaryCost: '800.00',
        preliminaryMargin: '200.00',
        preliminaryCurrency: 'ABC',
        preliminaryFinancialPlanDate: '2026-08-18T09:00:00.000Z',
      }),
    ).resolves.toMatchObject({ preliminaryCurrency: 'ABC' });
    await expect(
      validate(CompleteStageOneStepDto, {
        step: 'SURVEY',
      }),
    ).resolves.toMatchObject({ step: 'SURVEY' });
    await expect(
      validate(SurveyNotApplicableDto, { reason: ' Client supplied survey. ' }),
    ).resolves.toMatchObject({ reason: 'Client supplied survey.' });
    await expect(
      validate(SubmitStageOneApprovalDto, {
        comments: 'Ready for review.',
        evidenceFileId: '00000000-0000-4000-8000-000000000002',
        idempotencyKey: 'submit-stage-one',
      }),
    ).resolves.toMatchObject({ idempotencyKey: 'submit-stage-one' });
    await expect(
      validate(DecideStageOneApprovalDto, {
        decision: 'APPROVED_WITH_COMMENTS',
        comments: 'Approved with minor site notes.',
        evidenceFileId: '00000000-0000-4000-8000-000000000003',
        version: '1',
      }),
    ).resolves.toMatchObject({
      decision: 'APPROVED_WITH_COMMENTS',
      version: 1,
    });
  });
});

const actor = (userId: string, permissions: string[] = []): CurrentActor => ({
  userId,
  organizationId: 'organization-1',
  organizationMembershipId: `membership-${userId}`,
  sessionId: `session-${userId}`,
  email: `${userId}@example.com`,
  displayName: userId,
  mustChangePassword: false,
  permissions,
  administrationScope: 'SELF',
  managedDepartmentIds: [],
  administrationTier: 0,
});

const initiationProject = {
  id: 'project-1',
  code: 'PRJ-001',
  name: 'Galaxy Centre',
  customerId: 'customer-1',
  customer: { id: 'customer-1', displayName: 'Galaxy Customer' },
  primaryContactId: 'contact-1',
  primaryContact: { id: 'contact-1', displayName: 'Primary Contact' },
  projectType: 'DESIGN_AND_BUILD',
  propertyType: 'Apartment',
  location: 'Bangkok',
  address: '1 Galaxy Road',
  projectOwnerId: 'owner-1',
  projectOwner: { id: 'owner-1', displayName: 'Project Owner' },
  salesOwnerId: 'sales-1',
  salesOwner: { id: 'sales-1', displayName: 'Sales Owner' },
  designOwnerId: 'design-1',
  designOwner: { id: 'design-1', displayName: 'Design Owner' },
  projectManagerId: 'pm-1',
  projectManager: { id: 'pm-1', displayName: 'Project Manager' },
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  expectedCompletionDate: new Date('2026-12-01T00:00:00.000Z'),
  actualCompletionDate: null,
  status: 'PLANNING',
  phase: 'SURVEY',
  priority: 'HIGH',
  currency: 'THB',
  description: 'Stage 1 project',
  confidentiality: 'INTERNAL',
  healthStatus: 'ON_TRACK',
  progressPercentage: 10,
  version: 1,
  updatedAt: new Date('2026-08-01T01:00:00.000Z'),
  members: [
    {
      id: 'project-member-1',
      userId: 'member-1',
      role: 'Designer',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      user: {
        id: 'member-1',
        displayName: 'Project Member',
        email: 'member-1@example.com',
        status: 'active',
      },
    },
  ],
  departments: [
    {
      id: 'project-department-1',
      departmentId: 'department-1',
      department: { id: 'department-1', code: 'DES', name: 'Design' },
    },
  ],
  stageOnePlan: {
    projectId: 'project-1',
    source: 'Referral',
    legalEntityText: 'Galaxy Centre Co., Ltd.',
    scopeFlags: { design: true },
    scopeNotes: 'Apartment renovation',
    plannedSurveyAt: new Date('2026-08-10T09:00:00.000Z'),
    plannedProposalAt: new Date('2026-08-15T09:00:00.000Z'),
    plannedFinancialPlanAt: new Date('2026-08-18T09:00:00.000Z'),
    plannedKickoffAt: new Date('2026-08-20T09:00:00.000Z'),
    responsibilityNotes: 'PM owns customer coordination.',
    siteConstraints: 'Work only after 18:00.',
    proposalBaseline: 'Revision 1',
    proposalMilestones: [{ name: 'Survey' }],
    proposalWbs: [{ code: '1.0' }],
    riskNotes: 'Limited lift access.',
    resourceNotes: 'Two installers.',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T01:00:00.000Z'),
  },
};

const summaryProject = {
  id: initiationProject.id,
  code: initiationProject.code,
  name: initiationProject.name,
  customerId: initiationProject.customerId,
  projectType: initiationProject.projectType,
  projectOwnerId: 'member-1',
  projectManagerId: initiationProject.projectManagerId,
  expectedCompletionDate: initiationProject.expectedCompletionDate,
  stageOnePlan: {
    ...initiationProject.stageOnePlan,
    governanceCoordinatorUserIds: ['member-1'],
  },
  members: [{ userId: 'member-1' }],
  departments: [{ id: 'project-department-1' }],
  stageStates: [{ status: 'IN_PROGRESS' }],
  stageSteps: [
    {
      id: 'step-assignment',
      step: 'ASSIGNMENT',
      ownerUserId: 'pm-1',
      dueDate: new Date('2026-08-05T00:00:00.000Z'),
      status: 'DONE',
      notApplicableReason: null,
      notApplicableAt: null,
      version: 1,
      updatedAt: new Date('2026-08-01T01:00:00.000Z'),
    },
    {
      id: 'step-survey',
      step: 'SURVEY',
      ownerUserId: 'member-1',
      dueDate: new Date('2026-08-10T00:00:00.000Z'),
      status: 'IN_PROGRESS',
      notApplicableReason: null,
      notApplicableAt: null,
      version: 1,
      updatedAt: new Date('2026-08-01T01:00:00.000Z'),
    },
  ],
  stageApprovals: [
    {
      id: 'approval-2',
      version: 2,
      status: 'PENDING',
      submittedBy: 'pm-1',
      submittedAt: new Date('2026-08-01T01:00:00.000Z'),
      reviewedBy: null,
      decidedAt: null,
      comments: 'Ready for review.',
      evidenceFileId: null,
      createdAt: new Date('2026-08-01T01:00:00.000Z'),
    },
  ],
  requiredDocuments: [
    {
      documentType: 'PROJECT_DOSSIER',
      status: 'APPROVED',
      currentFileAssetId: 'file-project-dossier',
      ownerRole: 'PROJECT_MANAGER',
      dueDate: new Date('2026-08-10T00:00:00.000Z'),
    },
    {
      documentType: 'SURVEY_REPORT',
      status: 'MISSING',
      currentFileAssetId: null,
      ownerRole: 'DESIGNER',
      dueDate: new Date('2026-08-20T00:00:00.000Z'),
    },
    {
      documentType: 'KICKOFF_APPROVAL',
      status: 'REJECTED',
      currentFileAssetId: 'file-kickoff-rejected',
      ownerRole: 'PROJECT_MANAGER',
      dueDate: new Date('2026-07-31T00:00:00.000Z'),
    },
  ],
  surveys: [
    {
      id: 'survey-1',
      scheduledAt: new Date('2026-08-10T09:00:00.000Z'),
      surveyedAt: null,
      approvalStatus: 'DRAFT',
      location: 'Galaxy Tower',
      siteCondition: 'Night delivery only',
      measurements: { elevator: true },
      notes: 'Protect lobby flooring',
      updatedAt: new Date('2026-08-01T01:00:00.000Z'),
    },
  ],
  requirements: [
    {
      id: 'requirement-1',
      status: 'APPROVED',
      approvalStatus: 'APPROVED',
      expectedSchedule: '2026-08-15',
      updatedAt: new Date('2026-08-01T01:00:00.000Z'),
    },
  ],
  _count: { members: 1, stageApprovals: 2 },
};

function prismaReturning(project: unknown) {
  return {
    project: { findFirst: vi.fn().mockResolvedValue(project) },
    projectMember: {
      findMany: vi.fn().mockImplementation(async ({ select, where }) => {
        if (!select.userId) return [];
        return (where.userId?.in ?? []).map((userId: string) => ({ userId }));
      }),
    },
  } as unknown as PrismaService;
}

function service(
  prisma: PrismaService,
  audit: { write: ReturnType<typeof vi.fn> } = { write: vi.fn() },
) {
  return new ProjectStageOneService(
    prisma,
    new BusinessEntityPolicy(prisma),
    { resolve: vi.fn().mockResolvedValue([]) } as never,
    audit as never,
  );
}

function documentDefinitionUpdatePrisma({
  hasLogicalDocument = false,
  hasLegacyHistory = false,
  hasCurrentFile = false,
  currentVersion = 0,
}: {
  hasLogicalDocument?: boolean;
  hasLegacyHistory?: boolean;
  hasCurrentFile?: boolean;
  currentVersion?: number;
} = {}) {
  const before = {
    id: 'definition-1',
    documentName: 'Hồ sơ hiện tại',
    documentType: 'Hồ sơ hiện tại',
    workstreamKey: 'ASSIGNMENT',
    notes: null,
    position: 0,
    initialMatrix: false,
    required: false,
    status: 'MISSING',
    currentFileAssetId: hasCurrentFile ? 'file-1' : null,
    currentVersion,
    supersededAt: null,
    supersededBy: null,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
    project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
    projectRequiredDocument: {
      findFirst: vi.fn().mockResolvedValue(before),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        ...before,
        documentName: data.documentName,
        documentType: data.documentType,
        workstreamKey: data.workstreamKey,
        notes: data.notes ?? null,
        position: data.position,
        initialMatrix: data.initialMatrix,
        supersededAt: data.supersededAt,
        supersededBy: data.supersededBy,
      })),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        ...before,
        id: 'definition-2',
        ...data,
      })),
    },
    projectStageOneDocument: {
      findFirst: vi
        .fn()
        .mockResolvedValue(hasLogicalDocument ? { id: 'document-1' } : null),
    },
    projectRequiredDocumentVersion: {
      findFirst: vi
        .fn()
        .mockResolvedValue(hasLegacyHistory ? { id: 'version-1' } : null),
    },
    activity: { create: vi.fn().mockResolvedValue({ id: 'activity-1' }) },
  };
  return {
    prisma: {
      ...tx,
      $transaction: vi
        .fn()
        .mockImplementation((work: (client: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaService,
    tx,
  };
}

describe('Project document definition reassignment', () => {
  const input = {
    name: 'Hồ sơ hiện tại',
    workstreamKey: 'SURVEY' as const,
    position: 1,
    initialMatrix: false,
    active: true,
    confirmDuplicate: false,
  };

  it.each([
    ['a linked logical document', { hasLogicalDocument: true }],
    ['legacy version history', { hasLegacyHistory: true }],
    ['a current file', { hasCurrentFile: true }],
    ['a version counter', { currentVersion: 1 }],
  ])('rejects changing Steps after %s exists', async (_label, state) => {
    const { prisma, tx } = documentDefinitionUpdatePrisma(state);

    await expect(
      service(prisma).updateDocumentDefinition(
        actor('manager-1', ['project.document.manage']),
        'project-1',
        'definition-1',
        input,
      ),
    ).rejects.toThrow(
      'Document definition Step cannot change after files or history exist',
    );
    expect(tx.projectRequiredDocument.update).not.toHaveBeenCalled();
  });

  it.each([
    ['a linked logical document', { hasLogicalDocument: true }],
    ['legacy version history', { hasLegacyHistory: true }],
    ['a current file', { hasCurrentFile: true }],
    ['a version counter', { currentVersion: 1 }],
  ])(
    'rejects changing Matrix/Workflow context after %s exists',
    async (_label, state) => {
      const { prisma, tx } = documentDefinitionUpdatePrisma(state);

      await expect(
        service(prisma).updateDocumentDefinition(
          actor('manager-1', ['project.key_dossier.manage']),
          'project-1',
          'definition-1',
          {
            ...input,
            workstreamKey: 'ASSIGNMENT',
            initialMatrix: true,
          },
        ),
      ).rejects.toThrow(
        'Không thể chuyển mục giữa Hồ sơ chủ chốt và Workflow.',
      );
      expect(tx.projectRequiredDocument.update).not.toHaveBeenCalled();
    },
  );

  it('allows an unused definition to move to another Step', async () => {
    const { prisma, tx } = documentDefinitionUpdatePrisma();

    await expect(
      service(prisma).updateDocumentDefinition(
        actor('manager-1', ['project.document.manage']),
        'project-1',
        'definition-1',
        input,
      ),
    ).resolves.toMatchObject({ workstreamKey: 'SURVEY', position: 1 });
    expect(tx.projectRequiredDocument.update).toHaveBeenCalledOnce();
  });

  it('still allows rename, reorder and archive when the Step is unchanged', async () => {
    const { prisma, tx } = documentDefinitionUpdatePrisma({
      hasLogicalDocument: true,
      hasLegacyHistory: true,
    });

    await expect(
      service(prisma).updateDocumentDefinition(
        actor('manager-1', ['project.document.manage']),
        'project-1',
        'definition-1',
        {
          ...input,
          name: 'Hồ sơ đã đổi tên',
          workstreamKey: 'ASSIGNMENT',
          position: 4,
          active: false,
        },
      ),
    ).resolves.toMatchObject({
      name: 'Hồ sơ đã đổi tên',
      workstreamKey: 'ASSIGNMENT',
      position: 4,
      active: false,
    });
    expect(tx.projectStageOneDocument.findFirst).not.toHaveBeenCalled();
    expect(tx.projectRequiredDocumentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.projectRequiredDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ documentType: expect.anything() }),
      }),
    );
  });

  it.each([
    ['the stable finance type', 'PRELIMINARY_FINANCIAL_PLAN'],
    ['a custom definition in the finance Step', 'Hồ sơ tài chính tùy chỉnh'],
  ])(
    'does not declassify %s through a display-name change',
    async (_label, type) => {
      const { prisma, tx } = documentDefinitionUpdatePrisma({
        hasCurrentFile: true,
      });
      const financial = await tx.projectRequiredDocument.findFirst();
      Object.assign(financial!, {
        stageKey: 'STAGE_1',
        workstreamKey: 'FINANCIAL_PLANNING',
        documentType: type,
        documentName: 'Hồ sơ tài chính',
      });
      tx.projectRequiredDocument.findFirst.mockResolvedValue(financial!);

      await expect(
        service(prisma).updateDocumentDefinition(
          actor('manager-1', ['project.document.manage']),
          'project-1',
          'definition-1',
          {
            ...input,
            name: 'Hồ sơ thông thường',
            workstreamKey: 'FINANCIAL_PLANNING',
          },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.projectRequiredDocument.update).not.toHaveBeenCalled();
    },
  );

  it('allows Matrix and Workflow to use the same name independently', async () => {
    const { prisma, tx } = documentDefinitionUpdatePrisma({
      hasLogicalDocument: true,
    });
    const historical = await tx.projectRequiredDocument.findFirst();
    Object.assign(historical!, {
      initialMatrix: true,
      supersededAt: new Date('2026-08-22T00:00:00.000Z'),
      supersededBy: 'manager-1',
    });
    tx.projectRequiredDocument.findMany.mockImplementation(async ({ where }) =>
      where.initialMatrix === historical!.initialMatrix ? [historical!] : [],
    );

    await expect(
      service(prisma).createDocumentDefinition(
        actor('manager-1', ['project.document.manage']),
        'project-1',
        {
          name: 'Hồ sơ hiện tại',
          workstreamKey: 'ASSIGNMENT',
          position: 0,
          initialMatrix: false,
          active: true,
          confirmDuplicate: false,
        },
      ),
    ).resolves.toMatchObject({ initialMatrix: false });
    expect(tx.projectRequiredDocument.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ initialMatrix: false }),
    });
    expect(tx.projectRequiredDocument.create).toHaveBeenCalledOnce();
  });

  it('uses the route-bound Key Dossier context instead of a client Workflow flag', async () => {
    const { prisma, tx } = documentDefinitionUpdatePrisma();

    await expect(
      service(prisma).createDocumentDefinition(
        actor('manager-1', ['project.key_dossier.manage']),
        'project-1',
        {
          name: 'Hồ sơ chủ chốt',
          workstreamKey: 'FINANCIAL_PLANNING',
          position: 0,
          initialMatrix: false,
          active: true,
        },
        true,
      ),
    ).resolves.toMatchObject({
      initialMatrix: true,
      workstreamKey: 'KEY_DOSSIER',
    });
    expect(tx.projectRequiredDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        initialMatrix: true,
        workstreamKey: 'KEY_DOSSIER',
      }),
    });
  });
});

describe('Project Stage 1 document definition initialization', () => {
  it('preserves custom and history-bearing definitions while adding missing defaults', async () => {
    const custom = {
      id: 'custom-definition',
      organizationId: 'organization-1',
      projectId: 'project-1',
      stageKey: 'STAGE_1',
      workstreamKey: 'ASSIGNMENT',
      documentType: 'Hồ sơ tùy chỉnh',
      documentName: 'Hồ sơ tùy chỉnh',
      notes: null,
      position: 20,
      initialMatrix: false,
      normalizedName: 'hồ sơ tùy chỉnh',
      required: false,
      status: 'UPLOADED',
      currentFileAssetId: 'file-1',
      currentVersion: 1,
      supersededAt: null,
      supersededBy: null,
    };
    const oppositeContext = {
      ...custom,
      id: 'opposite-context-definition',
      documentType: 'Văn bản chủ trương / Quyết định giao nhiệm vụ',
      documentName: 'Văn bản chủ trương / Quyết định giao nhiệm vụ',
      initialMatrix: false,
    };
    const created: (typeof custom)[] = [];
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ projectId: 'project-1' }]),
      projectStageState: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ documentDefinitionsInitializedAt: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      projectRequiredDocument: {
        findMany: vi.fn().mockResolvedValue([custom, oppositeContext]),
        updateMany: vi.fn(),
        update: vi.fn(),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const document = {
            ...custom,
            id: `created-${created.length}`,
            ...data,
          };
          created.push(document);
          return document;
        }),
      },
      activity: { create: vi.fn() },
    };
    const commands = service(tx as unknown as PrismaService);

    await expect(
      (
        commands as unknown as {
          initializeSimpleDocumentDefinitions: (
            client: typeof tx,
            currentActor: CurrentActor,
            projectId: string,
          ) => Promise<boolean>;
        }
      ).initializeSimpleDocumentDefinitions(
        tx,
        actor('manager-1', ['project.document.manage']),
        'project-1',
      ),
    ).resolves.toBe(true);

    expect(tx.projectRequiredDocument.updateMany).not.toHaveBeenCalled();
    expect(tx.projectRequiredDocument.update).not.toHaveBeenCalled();
    expect(custom).toMatchObject({
      workstreamKey: 'ASSIGNMENT',
      initialMatrix: false,
      currentFileAssetId: 'file-1',
      currentVersion: 1,
    });
    expect(created.filter(({ initialMatrix }) => !initialMatrix)).toHaveLength(
      SIMPLE_STAGE_ONE_STEPS.flatMap(({ documents }) => documents).length,
    );
    expect(created).toContainEqual(
      expect.objectContaining({
        documentName: 'Văn bản chủ trương / Quyết định giao nhiệm vụ',
        initialMatrix: true,
      }),
    );
  });
});

describe('Project document capabilities', () => {
  it.each([
    [
      'SYSTEM actor with a live upload role',
      {
        ...actor('system-1', [
          'project.read',
          'file.read',
          'file.upload',
          'project.document.manage',
          'project.update',
          'file.download',
          'file.delete',
          'project.delete',
          'project.key_dossier.manage',
          'project.key_dossier.item.delete',
          'project.manage_members',
          'estimate.read',
          'estimate.update',
        ]),
        administrationScope: 'SYSTEM' as const,
      },
      {
        canSwitchProject: true,
        canManageProjectAccess: true,
        canReadDocuments: true,
        canUploadDocuments: true,
        canSubmitDocuments: true,
        canManageDocumentTypes: true,
        canCompleteStep: true,
        canReopenStep: true,
        canPreviewFiles: true,
        canDownloadFiles: true,
        canDeleteProjectDocuments: true,
        canDeleteProject: true,
        canManageKeyDossier: true,
        canDeleteKeyDossierItem: true,
        canDeleteAttachment: true,
        canUploadWorkflowDocuments: true,
        canUploadKeyDossierAttachments: true,
        canReadFinance: true,
        canManageFinance: true,
      },
    ],
    [
      'ORGANIZATION member without an upload role',
      {
        ...actor('member-1', ['project.read', 'file.read']),
        administrationScope: 'ORGANIZATION' as const,
      },
      {
        canSwitchProject: true,
        canManageProjectAccess: false,
        canReadDocuments: true,
        canUploadDocuments: false,
        canSubmitDocuments: false,
        canManageDocumentTypes: false,
        canCompleteStep: false,
        canReopenStep: false,
        canPreviewFiles: false,
        canDownloadFiles: false,
        canDeleteProjectDocuments: false,
        canDeleteProject: false,
        canManageKeyDossier: false,
        canDeleteKeyDossierItem: false,
        canDeleteAttachment: false,
        canUploadWorkflowDocuments: false,
        canUploadKeyDossierAttachments: false,
        canReadFinance: false,
        canManageFinance: false,
      },
    ],
    [
      'actor after an expired role assignment is removed from CurrentActor',
      actor('expired-role-1'),
      {
        canSwitchProject: false,
        canManageProjectAccess: false,
        canReadDocuments: false,
        canUploadDocuments: false,
        canSubmitDocuments: false,
        canManageDocumentTypes: false,
        canCompleteStep: false,
        canReopenStep: false,
        canPreviewFiles: false,
        canDownloadFiles: false,
        canDeleteProjectDocuments: false,
        canDeleteProject: false,
        canManageKeyDossier: false,
        canDeleteKeyDossierItem: false,
        canDeleteAttachment: false,
        canUploadWorkflowDocuments: false,
        canUploadKeyDossierAttachments: false,
        canReadFinance: false,
        canManageFinance: false,
      },
    ],
  ])('derives document controls for a %s', (_name, currentActor, expected) => {
    expect(documentCapabilities(currentActor)).toEqual(expected);
  });
});

function uploadTargetPrisma(officerExists = true) {
  const existingDocument = {
    id: 'document-1',
    projectId: 'project-1',
    step: 'ASSIGNMENT',
    documentType: 'Văn bản chủ trương đầu tư',
    displayName: 'Văn bản chủ trương đầu tư',
    status: 'UPLOADED',
    submittedOfficerId: 'officer-1',
    actualActorId: 'uploader-1',
    idempotencyKey: 'original-file',
    requiredDocumentId: 'definition-1',
    contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
    stageKey: 'STAGE_1',
    workstreamKey: 'ASSIGNMENT',
  };
  const tx = {
    project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
    projectMember: {
      findFirst: vi
        .fn()
        .mockResolvedValue(officerExists ? { id: 'member-1' } : null),
    },
    projectStageOneDocument: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(existingDocument),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'document-1',
        ...data,
      })),
    },
    projectRequiredDocument: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'definition-1',
        documentType: 'Văn bản chủ trương đầu tư',
        documentName: 'Văn bản chủ trương đầu tư',
        stageKey: 'STAGE_1',
        workstreamKey: 'ASSIGNMENT',
        initialMatrix: false,
      }),
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: vi
        .fn()
        .mockImplementation((work: (client: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaService,
    tx,
    existingDocument,
  };
}

function deleteDocumentPrisma(
  document: Record<string, unknown> | null = {
    id: 'matrix-document-1',
    projectId: 'project-1',
    stageKey: 'STAGE_1',
    workstreamKey: 'ASSIGNMENT',
    documentType: 'PROJECT_BRIEF',
    status: 'UPLOADED',
    currentFileAssetId: 'file-1',
    currentVersion: 1,
    contextType: 'STAGE_MATRIX_DOCUMENT',
    requiredDocument: { initialMatrix: true },
  },
) {
  const tx = {
    project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
    projectStageOneDocument: {
      findFirst: vi.fn().mockResolvedValue(document),
      update: vi.fn().mockResolvedValue({
        ...document,
        status: 'SUPERSEDED',
      }),
    },
    fileAsset: { update: vi.fn(), delete: vi.fn() },
    activity: { create: vi.fn() },
  };
  return {
    prisma: {
      ...tx,
      $transaction: vi
        .fn()
        .mockImplementation((work: (client: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaService,
    tx,
  };
}

describe('ProjectStageOneService logical document deletion', () => {
  it('soft deletes only the exact Matrix document and preserves FileAsset history', async () => {
    const { prisma, tx } = deleteDocumentPrisma();
    const audit = { write: vi.fn() };

    await expect(
      service(prisma, audit).deleteDocument(
        actor('deleter-1', ['file.delete']),
        'project-1',
        'matrix-document-1',
        'STAGE_MATRIX_DOCUMENT',
      ),
    ).resolves.toEqual({ deleted: true });

    expect(tx.projectStageOneDocument.update).toHaveBeenCalledWith({
      where: { id: 'matrix-document-1' },
      data: { status: 'SUPERSEDED' },
    });
    expect(tx.fileAsset.update).not.toHaveBeenCalled();
    expect(tx.fileAsset.delete).not.toHaveBeenCalled();
    expect(tx.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'deleter-1',
        entityId: 'matrix-document-1',
        event: 'PROJECT_STAGE_ONE_DOCUMENT_DELETED',
        metadata: expect.objectContaining({
          projectId: 'project-1',
          contextType: 'STAGE_MATRIX_DOCUMENT',
          fileAssetId: 'file-1',
        }),
      }),
    });
    expect(audit.write).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'deleter-1' }),
      expect.objectContaining({
        action: 'PROJECT_STAGE_ONE_DOCUMENT_DELETED',
        entityId: 'matrix-document-1',
        beforeData: expect.objectContaining({ status: 'UPLOADED' }),
        afterData: expect.objectContaining({ status: 'SUPERSEDED' }),
        metadata: expect.objectContaining({
          projectId: 'project-1',
          contextType: 'STAGE_MATRIX_DOCUMENT',
          fileAssetId: 'file-1',
        }),
      }),
    );
  });

  it('rejects deletion without the explicit file-delete permission', async () => {
    const { prisma, tx } = deleteDocumentPrisma();

    await expect(
      service(prisma).deleteDocument(
        actor('reader-1', ['project.read']),
        'project-1',
        'matrix-document-1',
        'STAGE_MATRIX_DOCUMENT',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.projectStageOneDocument.update).not.toHaveBeenCalled();
  });

  it('does not fall back across Matrix and Workflow contexts', async () => {
    const { prisma, tx } = deleteDocumentPrisma();

    await expect(
      service(prisma).deleteDocument(
        actor('deleter-1', ['file.delete']),
        'project-1',
        'matrix-document-1',
        'STAGE_WORKFLOW_STEP_DOCUMENT',
      ),
    ).rejects.toMatchObject({
      response: { category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND' },
    });
    expect(tx.projectStageOneDocument.update).not.toHaveBeenCalled();
  });

  it('does not reveal or mutate a document outside the scoped Project', async () => {
    const { prisma, tx } = deleteDocumentPrisma(null);

    await expect(
      service(prisma).deleteDocument(
        actor('deleter-1', ['file.delete']),
        'project-1',
        'other-project-document',
        'STAGE_MATRIX_DOCUMENT',
      ),
    ).rejects.toMatchObject({
      response: { category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND' },
    });
    expect(tx.projectStageOneDocument.update).not.toHaveBeenCalled();
  });

  it('soft removes an exact legacy attachment without deleting FileAsset history', async () => {
    const { prisma, tx } = deleteDocumentPrisma(null);
    const legacy = {
      id: 'legacy-definition-1',
      projectId: 'project-1',
      stageKey: 'STAGE_1',
      workstreamKey: 'ASSIGNMENT',
      documentType: 'PROJECT_BRIEF',
      status: 'UPLOADED',
      currentFileAssetId: 'file-legacy',
      currentVersion: 1,
      initialMatrix: true,
    };
    const legacyDefinitions = {
      findFirst: vi.fn().mockResolvedValue(legacy),
      update: vi.fn().mockResolvedValue({
        ...legacy,
        status: 'MISSING',
        currentFileAssetId: null,
      }),
    };
    Object.assign(tx, { projectRequiredDocument: legacyDefinitions });

    await expect(
      service(prisma).deleteDocument(
        actor('deleter-1', ['file.delete']),
        'project-1',
        'legacy-definition-1',
        'STAGE_MATRIX_DOCUMENT',
        'LEGACY_REQUIRED_DOCUMENT',
      ),
    ).resolves.toEqual({ deleted: true });
    expect(legacyDefinitions.update).toHaveBeenCalledWith({
      where: { id: 'legacy-definition-1' },
      data: { currentFileAssetId: null, status: 'MISSING' },
    });
    expect(tx.fileAsset.update).not.toHaveBeenCalled();
    expect(tx.fileAsset.delete).not.toHaveBeenCalled();
  });
});

describe('ProjectStageOneService Key Dossier item deletion', () => {
  it('tombstones one item with all of its attachments while preserving Workflow and FileAsset rows', async () => {
    const item = {
      id: 'key-dossier-item-1',
      projectId: 'project-1',
      organizationId: 'organization-1',
      documentName: 'Tài liệu hợp đồng',
      initialMatrix: true,
      deletedAt: null,
      currentFileAssetId: 'legacy-file-1',
      stageOneDocuments: [
        { id: 'attachment-1', currentFileAssetId: 'file-1' },
        { id: 'attachment-2', currentFileAssetId: null },
      ],
    };
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
      projectRequiredDocument: {
        findFirst: vi.fn().mockResolvedValue(item),
        update: vi.fn().mockResolvedValue({
          ...item,
          deletedAt: new Date('2026-09-10T10:00:00.000Z'),
        }),
      },
      projectStageOneDocument: { updateMany: vi.fn() },
      fileAsset: { updateMany: vi.fn(), deleteMany: vi.fn() },
      activity: { create: vi.fn() },
    };
    const audit = { write: vi.fn() };
    const prisma = {
      ...tx,
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;

    await expect(
      service(prisma, audit).deleteKeyDossierItem(
        actor('deleter-1', ['project.key_dossier.item.delete']),
        'project-1',
        item.id,
        'Không còn sử dụng mục hồ sơ.',
      ),
    ).resolves.toEqual({ deleted: true, attachmentCount: 2 });
    expect(tx.projectRequiredDocument.update).toHaveBeenCalledWith({
      where: { id: item.id },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        deletedBy: 'deleter-1',
        deleteReason: 'Không còn sử dụng mục hồ sơ.',
      }),
    });
    expect(tx.projectStageOneDocument.updateMany).not.toHaveBeenCalled();
    expect(tx.fileAsset.updateMany).not.toHaveBeenCalled();
    expect(tx.fileAsset.deleteMany).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledOnce();
  });

  it('rejects item deletion without the dedicated scoped permission', async () => {
    const prisma = {
      $transaction: vi.fn(),
    } as unknown as PrismaService;

    await expect(
      service(prisma).deleteKeyDossierItem(
        actor('manager-1', ['project.key_dossier.manage']),
        'project-1',
        'key-dossier-item-1',
        'Không còn sử dụng.',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ProjectStageOneService Key Dossier milestones', () => {
  it('creates an independent milestone without mutating Workflow Steps', async () => {
    const milestone = {
      id: 'milestone-1',
      code: 'HS-02',
      name: 'Căn cứ hợp đồng',
      position: 1,
      active: true,
    };
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
      keyDossierReferenceMilestone: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(milestone),
      },
      projectStageStep: { updateMany: vi.fn() },
      activity: { create: vi.fn() },
    };
    const audit = { write: vi.fn() };
    const prisma = {
      ...tx,
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;

    await expect(
      service(prisma, audit).createKeyDossierMilestone(
        actor('manager-1', ['project.key_dossier.manage']),
        'project-1',
        {
          code: ' HS-02 ',
          name: ' Căn cứ hợp đồng ',
          position: 1,
          active: true,
        },
      ),
    ).resolves.toEqual(milestone);
    expect(tx.keyDossierReferenceMilestone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        code: 'HS-02',
        name: 'Căn cứ hợp đồng',
      }),
      select: expect.anything(),
    });
    expect(tx.projectStageStep.updateMany).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledOnce();
  });

  it('deletes a used milestone by moving items to unclassified without deleting them', async () => {
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
      keyDossierReferenceMilestone: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'milestone-1',
          code: 'HS-02',
          name: 'Căn cứ hợp đồng',
          deletedAt: null,
        }),
        update: vi.fn().mockResolvedValue({ id: 'milestone-1' }),
      },
      projectRequiredDocument: {
        count: vi.fn().mockResolvedValue(2),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        deleteMany: vi.fn(),
      },
      projectStageStep: { updateMany: vi.fn() },
      activity: { create: vi.fn() },
    };
    const audit = { write: vi.fn() };
    const prisma = {
      ...tx,
      $transaction: vi.fn((work) => work(tx)),
    } as unknown as PrismaService;

    await expect(
      service(prisma, audit).deleteKeyDossierMilestone(
        actor('manager-1', ['project.key_dossier.manage']),
        'project-1',
        'milestone-1',
        { reason: 'Không còn sử dụng.', replacementMilestoneId: null },
      ),
    ).resolves.toEqual({ deleted: true, affectedItems: 2 });
    expect(tx.projectRequiredDocument.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        initialMatrix: true,
        deletedAt: null,
        referenceMilestoneId: 'milestone-1',
      },
      data: { referenceMilestoneId: null },
    });
    expect(tx.projectRequiredDocument.deleteMany).not.toHaveBeenCalled();
    expect(tx.projectStageStep.updateMany).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledOnce();
  });
});

describe('ProjectStageOneService logical upload authorization', () => {
  const target = (submittedOfficerId: string) => ({
    definitionId: 'definition-1',
    stageKey: 'STAGE_1' as const,
    workstreamKey: 'ASSIGNMENT',
    contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT' as const,
    submittedOfficerId,
    idempotencyKey: 'upload-1',
  });
  const uploader = (permissions: string[] = []) =>
    actor('uploader-1', [
      'file.upload',
      'project.document.manage',
      ...permissions,
    ]);

  it('does not create a logical upload target after membership is removed while waiting for the Project lock', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    let membershipActive = true;
    tx.project.findFirst.mockImplementation(async () =>
      membershipActive ? { id: 'project-1' } : null,
    );
    tx.$queryRaw.mockImplementation(async () => {
      membershipActive = false;
      return [{ id: 'project-1' }];
    });

    await expect(
      service(prisma).createUploadTarget(
        uploader(),
        'project-1',
        target('uploader-1'),
      ),
    ).rejects.toMatchObject({
      response: { category: 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE' },
    });
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.project.findFirst.mock.invocationCallOrder[0]!,
    );
  });

  it('rejects nominating another active Project member without member-management permission', async () => {
    const { prisma, tx } = uploadTargetPrisma();

    await expect(
      service(prisma).createUploadTarget(
        uploader(),
        'project-1',
        target('officer-1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });

  it('does not borrow member-management scope from another Project', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.project.findFirst
      .mockResolvedValueOnce({ id: 'project-1' })
      .mockResolvedValueOnce(null);
    const scopedActor = {
      ...uploader(['project.manage_members']),
      permissionSources: [
        {
          permission: 'file.upload',
          roleId: 'upload-role',
          roleName: 'Upload',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'project.document.manage',
          roleId: 'document-role',
          roleName: 'Documents',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'project.manage_members',
          roleId: 'member-role',
          roleName: 'Members',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    };

    await expect(
      service(prisma).createUploadTarget(
        scopedActor,
        'project-1',
        target('officer-1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.projectMember.findFirst).not.toHaveBeenCalled();
    expect(tx.project.findFirst).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: 'project-1',
        AND: expect.arrayContaining([
          expect.objectContaining({ OR: expect.any(Array) }),
        ]),
      }),
      select: { id: true },
    });
  });

  it('scopes the Project before rejecting on-behalf officer metadata', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.project.findFirst.mockResolvedValue(null);

    await expect(
      service(prisma).createUploadTarget(
        uploader(),
        'project-2',
        target('officer-1'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.projectMember.findFirst).not.toHaveBeenCalled();
  });

  it('classifies a missing scoped Project separately from a missing document target', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.project.findFirst.mockResolvedValue(null);

    await expect(
      service(prisma).createUploadTarget(
        uploader(),
        'project-2',
        target('uploader-1'),
      ),
    ).rejects.toMatchObject({
      response: {
        category: 'PROJECT_NOT_FOUND_OR_NOT_VISIBLE',
      },
    });
  });

  it('allows self-upload and keeps the actual actor as the submitted officer', async () => {
    const { prisma, tx } = uploadTargetPrisma();

    await expect(
      service(prisma).createUploadTarget(
        uploader(),
        'project-1',
        target('uploader-1'),
      ),
    ).resolves.toMatchObject({
      submittedOfficerId: 'uploader-1',
      actualActorId: 'uploader-1',
    });
    expect(tx.projectStageOneDocument.create).toHaveBeenCalledOnce();
    expect(tx.projectStageOneDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requiredDocumentId: 'definition-1',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
        stageKey: 'STAGE_1',
        workstreamKey: 'ASSIGNMENT',
      }),
    });
  });

  it('requires an active nominated Project member with an active organization membership', async () => {
    const { prisma, tx } = uploadTargetPrisma();

    await service(prisma).createUploadTarget(
      uploader(['project.manage_members']),
      'project-1',
      target('officer-1'),
    );

    expect(tx.projectMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        projectId: 'project-1',
        userId: 'officer-1',
        user: {
          status: 'active',
          organizationMembers: {
            some: { organizationId: 'organization-1', status: 'active' },
          },
        },
      },
      select: { id: true },
    });
  });

  it('creates a Stage 2 logical target from the exact scoped definition', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.projectRequiredDocument.findFirst.mockResolvedValue({
      id: 'definition-2',
      documentType: 'Kế hoạch triển khai',
      documentName: 'Kế hoạch triển khai',
      stageKey: 'STAGE_2',
      workstreamKey: 'PLAN',
      initialMatrix: true,
    });

    await service(prisma).createUploadTarget(uploader(), 'project-1', {
      definitionId: 'definition-2',
      stageKey: 'STAGE_2',
      workstreamKey: 'PLAN',
      contextType: 'STAGE_MATRIX_DOCUMENT',
      submittedOfficerId: 'uploader-1',
      idempotencyKey: 'stage-2-file',
    } as never);

    expect(tx.projectRequiredDocument.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'definition-2',
        projectId: 'project-1',
        stageKey: 'STAGE_2',
        workstreamKey: 'PLAN',
        supersededAt: null,
        NOT: {
          OR: [
            { documentType: 'PRELIMINARY_FINANCIAL_PLAN' },
            { stageKey: 'STAGE_1', workstreamKey: 'FINANCIAL_PLANNING' },
          ],
        },
      },
      select: expect.anything(),
    });
    expect(tx.projectStageOneDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requiredDocumentId: 'definition-2',
        stageKey: 'STAGE_2',
        workstreamKey: 'PLAN',
        step: null,
      }),
    });
  });

  it('derives a Key Dossier target from its persisted item without a Workflow Step payload', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.projectRequiredDocument.findFirst.mockResolvedValue({
      id: 'definition-1',
      documentType: 'Tài liệu hợp đồng',
      documentName: 'Tài liệu hợp đồng',
      stageKey: 'STAGE_1',
      workstreamKey: 'LEGACY_SNAPSHOT',
      initialMatrix: true,
      deletedAt: null,
      referenceMilestoneId: 'milestone-1',
    });

    await service(prisma).createUploadTarget(
      actor('uploader-1', ['file.upload', 'project.key_dossier.manage']),
      'project-1',
      {
        definitionId: 'definition-1',
        stageKey: 'STAGE_1',
        contextType: 'STAGE_MATRIX_DOCUMENT',
        submittedOfficerId: 'uploader-1',
        idempotencyKey: 'key-dossier-file',
      },
    );

    expect(tx.projectRequiredDocument.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'definition-1',
        projectId: 'project-1',
        stageKey: 'STAGE_1',
        initialMatrix: true,
        deletedAt: null,
      }),
      select: expect.anything(),
    });
    expect(tx.projectStageOneDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requiredDocumentId: 'definition-1',
        workstreamKey: 'LEGACY_SNAPSHOT',
        step: null,
      }),
    });
  });

  it('rejects a Workflow definition presented as a Matrix target', async () => {
    const { prisma, tx } = uploadTargetPrisma();

    await expect(
      service(prisma).createUploadTarget(uploader(), 'project-1', {
        ...target('uploader-1'),
        contextType: 'STAGE_MATRIX_DOCUMENT',
      }),
    ).rejects.toMatchObject({
      response: { category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND' },
    });
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });

  it('requires a custom name for the authoritative Hồ sơ khác definition', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.projectRequiredDocument.findFirst.mockResolvedValue({
      id: 'definition-1',
      documentType: 'Hồ sơ khác',
      documentName: 'Hồ sơ khác',
      initialMatrix: false,
    });

    await expect(
      service(prisma).createUploadTarget(
        uploader(),
        'project-1',
        target('uploader-1'),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });

  it('rejects a custom name override for an authoritative named definition', async () => {
    const { prisma, tx } = uploadTargetPrisma();

    await expect(
      service(prisma).createUploadTarget(uploader(), 'project-1', {
        ...target('uploader-1'),
        displayName: 'Tên phía trình duyệt tự đặt',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });

  it('hides a financial definition from an uploader without finance-manage permission', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.projectRequiredDocument.findFirst.mockResolvedValue({
      id: 'definition-1',
      documentType: 'PRELIMINARY_FINANCIAL_PLAN',
      documentName: 'Kế hoạch tài chính sơ bộ',
    });

    await expect(
      service(prisma).createUploadTarget(
        uploader(),
        'project-1',
        target('uploader-1'),
      ),
    ).rejects.toMatchObject({
      response: {
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy loại hồ sơ trong dự án.',
      },
    });
    expect(tx.projectRequiredDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: {
            OR: [
              { documentType: 'PRELIMINARY_FINANCIAL_PLAN' },
              {
                stageKey: 'STAGE_1',
                workstreamKey: 'FINANCIAL_PLANNING',
              },
            ],
          },
        }),
      }),
    );
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });

  it('hides a financial definition from an uploader with manage but without finance-read permission', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.projectRequiredDocument.findFirst.mockResolvedValue({
      id: 'definition-1',
      documentType: 'PRELIMINARY_FINANCIAL_PLAN',
      documentName: 'Kế hoạch tài chính sơ bộ',
    });

    await expect(
      service(prisma).createUploadTarget(
        uploader(['project.stage1.finance.manage']),
        'project-1',
        target('uploader-1'),
      ),
    ).rejects.toMatchObject({
      response: {
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy loại hồ sơ trong dự án.',
      },
    });
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });

  it('does not distinguish an inactive financial target from an unknown target', async () => {
    const { prisma, tx, existingDocument } = uploadTargetPrisma();
    tx.projectStageOneDocument.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...existingDocument,
        documentType: 'PRELIMINARY_FINANCIAL_PLAN',
        status: 'SUPERSEDED',
      });

    await expect(
      service(prisma).assertUploadTarget(uploader(), 'project-1', 'document-1'),
    ).rejects.toMatchObject({
      response: {
        category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ tải lên.',
      },
    });
    expect(tx.projectStageOneDocument.findFirst).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        NOT: expect.any(Object),
      }),
      select: {
        status: true,
        stageKey: true,
        workstreamKey: true,
        documentType: true,
      },
    });
  });

  it('rejects an inactive target definition', async () => {
    const { prisma, tx } = uploadTargetPrisma();
    tx.projectRequiredDocument.findFirst.mockResolvedValue(null);

    await expect(
      service(prisma).createUploadTarget(
        uploader(),
        'project-1',
        target('uploader-1'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.projectRequiredDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ supersededAt: null }),
      }),
    );
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });

  it('rejects a logical upload target after its persisted definition is archived', async () => {
    const { prisma, tx, existingDocument } = uploadTargetPrisma();
    tx.projectStageOneDocument.findFirst.mockResolvedValue({
      ...existingDocument,
      requiredDocument: { supersededAt: new Date() },
    });

    await expect(
      service(prisma).assertUploadTarget(
        uploader(['project.manage_members']),
        'project-1',
        'document-1',
      ),
    ).rejects.toMatchObject({
      response: { category: 'PROJECT_DOCUMENT_TARGET_INACTIVE' },
    });
  });

  it('does not reveal that a missing upload target belongs to another Project', async () => {
    const { prisma, tx, existingDocument } = uploadTargetPrisma();
    tx.projectStageOneDocument.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...existingDocument,
        projectId: 'project-2',
      });

    await expect(
      service(prisma).assertUploadTarget(uploader(), 'project-1', 'document-1'),
    ).rejects.toMatchObject({
      response: { category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND' },
    });
    expect(tx.projectStageOneDocument.findFirst).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: 'document-1',
        projectId: 'project-1',
      }),
      select: {
        status: true,
        stageKey: true,
        workstreamKey: true,
        documentType: true,
      },
    });
  });

  it('keeps version status visible without exposing file metadata to a Project-only reader', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'document-1',
      stageKey: 'STAGE_1',
      step: 'ASSIGNMENT',
      documentType: 'Biên bản',
      displayName: 'Biên bản',
      status: 'UPLOADED',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          status: 'UPLOADED',
          createdAt: new Date('2026-08-23T00:00:00.000Z'),
          fileAsset: {
            id: 'secret-asset',
            originalFilename: 'secret.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 8n,
            deletedAt: null,
          },
          submittedOfficer: null,
          actualActor: null,
        },
      ],
    });
    const commands = service({
      projectStageOneDocument: { findFirst },
    } as unknown as PrismaService);

    const history = await commands.documentHistory(
      actor('member-1', ['project.read']),
      'project-1',
      'document-1',
    );

    expect(history.versions).toEqual([
      expect.objectContaining({ version: 1, status: 'UPLOADED' }),
    ]);
    expect(JSON.stringify(history)).not.toMatch(/secret-asset|secret\.pdf/);
    expect(
      findFirst.mock.calls[0]?.[0]?.select?.versions.select.fileAsset,
    ).toBe(false);
  });

  it('does not expose a Stage 2 document through the Stage 1 history route', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'stage-two-document',
      stageKey: 'STAGE_2',
      step: null,
      documentType: 'STAGE_TWO_PLAN',
      displayName: 'Kế hoạch GĐ2.xlsx',
      status: 'UPLOADED',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          status: 'UPLOADED',
          createdAt: new Date(),
          fileAsset: {
            id: 'stage-two-secret',
            originalFilename: 'budget.xlsx',
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: 8n,
            deletedAt: null,
          },
          submittedOfficer: null,
          actualActor: null,
        },
      ],
    });
    const commands = service({
      projectStageOneDocument: { findFirst },
    } as unknown as PrismaService);

    await expect(
      commands.documentHistory(
        actor('member-1', ['project.read', 'file.read', 'file.download']),
        'project-1',
        'stage-two-document',
      ),
    ).rejects.toMatchObject({
      response: {
        category: 'NOT_FOUND',
        message: 'Không tìm thấy lịch sử hồ sơ.',
      },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ stageKey: 'STAGE_1' }),
      }),
    );
  });

  it('does not link a finalized file after the persisted definition is archived', async () => {
    const versionCreate = vi.fn();
    const document = {
      id: 'document-1',
      projectId: 'project-1',
      documentType: 'Văn bản chủ trương đầu tư',
      submittedOfficerId: 'uploader-1',
      currentFileAssetId: null,
      currentVersion: 0,
      status: 'PENDING_UPLOAD',
      requiredDocument: { supersededAt: new Date() },
    };
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document-1' }]),
      projectStageOneDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        update: vi.fn(),
      },
      projectStageOneDocumentVersion: { create: versionCreate },
      projectMember: { findFirst: vi.fn().mockResolvedValue({ id: 'member' }) },
      fileAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'asset' }) },
      activity: { create: vi.fn() },
    };

    await expect(
      service(tx as unknown as PrismaService).linkUploadFileInTransaction(
        uploader(),
        'project-1',
        'document-1',
        'asset',
        'uploader-1',
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toMatchObject({
      response: { category: 'PROJECT_DOCUMENT_TARGET_INACTIVE' },
    });
    expect(versionCreate).not.toHaveBeenCalled();
  });

  it('rejects Phase B when the immutable session officer snapshot is missing', async () => {
    const versionCreate = vi.fn();
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document-1' }]),
      projectStageOneDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document-1',
          projectId: 'project-1',
          documentType: 'Văn bản chủ trương đầu tư',
          submittedOfficerId: 'mutable-current-officer',
          currentFileAssetId: null,
          currentVersion: 0,
          status: 'PENDING_UPLOAD',
          requiredDocument: { supersededAt: null },
        }),
        update: vi.fn(),
      },
      projectStageOneDocumentVersion: { create: versionCreate },
      projectMember: { findFirst: vi.fn().mockResolvedValue({ id: 'member' }) },
      fileAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'asset' }) },
      activity: { create: vi.fn() },
    };

    await expect(
      service(tx as unknown as PrismaService).linkUploadFileInTransaction(
        uploader(),
        'project-1',
        'document-1',
        'asset',
        null,
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toMatchObject({
      response: { category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND' },
    });
    expect(versionCreate).not.toHaveBeenCalled();
  });

  it('records the selected officer on a new version while authorizing the CurrentActor', async () => {
    const versionCreate = vi.fn();
    const update = vi.fn().mockResolvedValue({ id: 'document-1' });
    const activity = vi.fn();
    const audit = { write: vi.fn() };
    const document = {
      id: 'document-1',
      projectId: 'project-1',
      documentType: 'Văn bản chủ trương đầu tư',
      submittedOfficerId: 'officer-1',
      currentFileAssetId: 'asset-old',
      currentVersion: 1,
      status: 'UPLOADED',
      requiredDocument: { supersededAt: null },
    };
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'document-1' }]),
      projectStageOneDocument: {
        findFirst: vi.fn().mockResolvedValue(document),
        update,
      },
      projectStageOneDocumentVersion: { create: versionCreate },
      projectMember: { findFirst: vi.fn().mockResolvedValue({ id: 'member' }) },
      fileAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'asset-new' }) },
      activity: { create: activity },
    };

    await service(
      tx as unknown as PrismaService,
      audit,
    ).linkUploadFileInTransaction(
      uploader(),
      'project-1',
      'document-1',
      'asset-new',
      'uploader-1',
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.projectMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'uploader-1' }),
      }),
    );
    expect(versionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submittedOfficerId: 'uploader-1',
        actualActorId: 'uploader-1',
      }),
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: expect.objectContaining({
        submittedOfficerId: 'uploader-1',
        actualActorId: 'uploader-1',
      }),
    });
    expect(activity).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 'uploader-1' }),
    });
  });

  it('allows a member manager to nominate another active Project member without impersonating them', async () => {
    const { prisma } = uploadTargetPrisma();

    await expect(
      service(prisma).createUploadTarget(
        uploader(['project.manage_members']),
        'project-1',
        target('officer-1'),
      ),
    ).resolves.toMatchObject({
      submittedOfficerId: 'officer-1',
      actualActorId: 'uploader-1',
    });
  });

  it('reauthorizes an existing upload target with CurrentActor, not its prior officer', async () => {
    const { prisma, tx, existingDocument } = uploadTargetPrisma();
    tx.projectStageOneDocument.findFirst.mockResolvedValue({
      ...existingDocument,
      requiredDocument: { supersededAt: null },
    });

    await expect(
      service(prisma).assertUploadTarget(uploader(), 'project-1', 'document-1'),
    ).resolves.toMatchObject({ id: 'document-1' });
    expect(tx.projectMember.findFirst).not.toHaveBeenCalled();
  });

  it('reuses a file key after its definition is renamed without changing the logical display name', async () => {
    const { prisma, tx, existingDocument } = uploadTargetPrisma();
    tx.projectStageOneDocument.findUnique.mockResolvedValue(existingDocument);
    tx.projectRequiredDocument.findFirst.mockResolvedValue({
      id: 'definition-1',
      documentType: 'Tên loại hồ sơ mới',
      documentName: 'Tên loại hồ sơ mới',
    });

    await expect(
      service(prisma).createUploadTarget(
        uploader(['project.manage_members']),
        'project-1',
        target('officer-1'),
      ),
    ).resolves.toEqual(existingDocument);
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });

  it.each(['outsider', 'revoked member'])(
    'rejects an %s nominated officer even for a member manager',
    async () => {
      const { prisma, tx } = uploadTargetPrisma(false);

      await expect(
        service(prisma).createUploadTarget(
          uploader(['project.manage_members']),
          'project-1',
          target('officer-1'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
    },
  );

  it('resolves an explicit existing document without inheriting the prior version officer', async () => {
    const { prisma, tx, existingDocument } = uploadTargetPrisma();

    await expect(
      service(prisma).createUploadTarget(uploader(), 'project-1', {
        definitionId: 'definition-1',
        stageKey: 'STAGE_1',
        workstreamKey: 'ASSIGNMENT',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
        submittedOfficerId: 'uploader-1',
        documentId: 'document-1',
        idempotencyKey: 'new-file',
      } as never),
    ).resolves.toEqual(existingDocument);
    expect(tx.projectStageOneDocument.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
        projectId: 'project-1',
        requiredDocumentId: 'definition-1',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
        stageKey: 'STAGE_1',
        workstreamKey: 'ASSIGNMENT',
        status: { not: 'SUPERSEDED' },
      },
    });
    expect(tx.projectStageOneDocument.create).not.toHaveBeenCalled();
  });
});

const stageOneDocumentTypes = {
  DESIGN_AND_BUILD: [
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
  PRODUCT_SUPPLY: [
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
  INTERNAL: [
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
} as const;

function commandPrisma(projectType: string | null = 'DESIGN_AND_BUILD') {
  const state = {
    project: {
      id: 'project-1',
      code: 'PRJ-001',
      name: 'Galaxy Centre',
      description: 'Design, supply, and install the apartment fit-out.',
      customerId: 'customer-1',
      projectType,
      projectOwnerId: 'member-1',
      projectManagerId: 'pm-1',
      projectManager: {
        id: 'pm-1',
        status: 'active',
        organizationMembers: [
          { organizationId: 'organization-1', status: 'active' },
        ],
      },
    },
    members: [
      {
        id: 'project-member-1',
        organizationId: 'organization-1',
        projectId: 'project-1',
        userId: 'member-1',
        user: {
          status: 'active',
          organizationMembers: [
            { organizationId: 'organization-1', status: 'active' },
          ],
        },
      },
    ],
    departments: [
      {
        id: 'project-department-1',
        organizationId: 'organization-1',
        departmentId: 'department-1',
      },
    ],
    stageState: null as null | Record<string, unknown>,
    steps: new Map<string, Record<string, unknown>>(),
    plan: null as null | Record<string, unknown>,
    documents: new Map<string, Record<string, unknown>>(),
    surveys: [
      {
        id: 'survey-1',
        organizationId: 'organization-1',
        projectId: 'project-1',
        scheduledAt: new Date('2026-08-10T09:00:00.000Z'),
        surveyedAt: new Date('2026-08-10T11:00:00.000Z'),
        deletedAt: null,
      },
    ],
    attachments: [
      {
        id: 'attachment-survey-1',
        entityType: 'Project',
        entityId: 'project-1',
        projectId: 'project-1',
        fileAsset: {
          id: 'file-survey-1',
          organizationId: 'organization-1',
          category: 'SURVEY',
          deletedAt: null,
        },
      },
    ],
    locations: [
      {
        id: 'location-1',
        projectId: 'project-1',
        name: 'Apartment',
        active: true,
      },
    ],
    activities: [] as Record<string, unknown>[],
  };
  const upsert = (
    current: Record<string, unknown> | undefined | null,
    args: { create: Record<string, unknown>; update: Record<string, unknown> },
  ) => (current ? Object.assign(current, args.update) : { ...args.create });
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
    project: {
      findFirst: vi.fn().mockImplementation(async (args) => {
        const organizationId = args.where.organizationId as string;
        const manager = state.project.projectManager;
        const surveyWhere = args.select.surveys?.where;
        const attachmentWhere = args.select.attachments?.where;
        const locationWhere = args.select.locations?.where;
        return {
          ...state.project,
          projectManager: manager && {
            ...manager,
            organizationMembers: manager.organizationMembers.filter(
              (membership) =>
                membership.organizationId === organizationId &&
                membership.status === 'active',
            ),
          },
          members: state.members.filter(
            (member) =>
              member.organizationId === organizationId &&
              member.user.status === 'active' &&
              member.user.organizationMembers.some(
                (membership) =>
                  membership.organizationId === organizationId &&
                  membership.status === 'active',
              ),
          ),
          departments: state.departments.filter(
            (department) => department.organizationId === organizationId,
          ),
          stageOnePlan: state.plan,
          stageStates: state.stageState ? [state.stageState] : [],
          stageSteps: [...state.steps.values()].filter(
            (item) => item.step === args.select.stageSteps?.where.step,
          ),
          surveys: state.surveys.filter(
            (survey) =>
              (!surveyWhere?.organizationId ||
                survey.organizationId === surveyWhere.organizationId) &&
              survey.projectId === state.project.id &&
              (surveyWhere?.deletedAt === undefined ||
                survey.deletedAt === surveyWhere.deletedAt),
          ),
          attachments: state.attachments.filter(
            (attachment) =>
              (!attachmentWhere?.entityType ||
                attachment.entityType === attachmentWhere.entityType) &&
              (!attachmentWhere?.entityId ||
                attachment.entityId === attachmentWhere.entityId) &&
              (!attachmentWhere?.projectId ||
                attachment.projectId === attachmentWhere.projectId) &&
              (!attachmentWhere?.fileAsset?.organizationId ||
                attachment.fileAsset.organizationId ===
                  attachmentWhere.fileAsset.organizationId) &&
              (!attachmentWhere?.fileAsset?.category ||
                attachment.fileAsset.category ===
                  attachmentWhere.fileAsset.category) &&
              (attachmentWhere?.fileAsset?.deletedAt === undefined ||
                attachment.fileAsset.deletedAt ===
                  attachmentWhere.fileAsset.deletedAt),
          ),
          locations: state.locations.filter(
            (location) =>
              (!locationWhere?.active || location.active) &&
              location.projectId === state.project.id,
          ),
        };
      }),
    },
    projectMember: {
      findFirst: vi.fn().mockImplementation(async (args) => {
        const membership = args.where.user.organizationMembers.some;
        const member = state.members.find(
          (candidate) =>
            candidate.projectId === args.where.projectId &&
            candidate.organizationId === args.where.organizationId &&
            candidate.userId === args.where.userId &&
            candidate.user.status === args.where.user.status &&
            candidate.user.organizationMembers.some(
              (item) =>
                item.organizationId === membership.organizationId &&
                item.status === membership.status,
            ),
        );
        return member ? { id: member.id } : null;
      }),
    },
    projectStageState: {
      createMany: vi.fn().mockImplementation(async ({ data }) => {
        if (state.stageState) return { count: 0 };
        state.stageState = { ...data[0] };
        return { count: 1 };
      }),
    },
    projectStageStep: {
      upsert: vi.fn().mockImplementation(async (args) => {
        const step = args.create.step as string;
        const value = upsert(state.steps.get(step), args);
        if (value.version === undefined) value.version = 1;
        if (value.id === undefined) value.id = `step-${step.toLowerCase()}`;
        state.steps.set(step, value);
        return value;
      }),
      updateMany: vi.fn().mockImplementation(async (args) => {
        const matches = [...state.steps.values()].filter((current) => {
          const status = args.where.status;
          return (
            (args.where.id === undefined || current.id === args.where.id) &&
            (args.where.projectId === undefined ||
              current.projectId === args.where.projectId) &&
            (args.where.stage === undefined ||
              current.stage === args.where.stage) &&
            (args.where.step === undefined ||
              current.step === args.where.step) &&
            (args.where.version === undefined ||
              current.version === args.where.version) &&
            (args.where.notApplicableReason === undefined ||
              current.notApplicableReason === args.where.notApplicableReason) &&
            (status === undefined ||
              current.status === status ||
              status.in?.includes(current.status as string))
          );
        });
        for (const current of matches) {
          const increment = args.data.version?.increment;
          const version = current.version as number;
          Object.assign(current, args.data);
          if (increment) current.version = version + increment;
        }
        return { count: matches.length };
      }),
    },
    projectStageOnePlan: {
      upsert: vi.fn().mockImplementation(async (args) => {
        state.plan = upsert(state.plan, args);
        return args.select
          ? Object.fromEntries(
              Object.keys(args.select).map((key) => [key, state.plan![key]]),
            )
          : state.plan;
      }),
    },
    projectRequiredDocument: {
      upsert: vi.fn().mockImplementation(async (args) => {
        const documentType = args.create.documentType as string;
        const value = upsert(state.documents.get(documentType), args);
        state.documents.set(documentType, value);
        return value;
      }),
      updateMany: vi.fn().mockImplementation(async (args) => {
        const matches = [...state.documents.values()].filter((document) => {
          const documentType = args.where.documentType;
          const status = args.where.status;
          const file = args.where.currentFileAssetId;
          const pairMatches =
            args.where.OR === undefined ||
            args.where.OR.some(
              (pair: { workstreamKey: string; documentType: string }) =>
                document.workstreamKey === pair.workstreamKey &&
                document.documentType === pair.documentType,
            );
          return (
            pairMatches &&
            (args.where.projectId === undefined ||
              document.projectId === args.where.projectId) &&
            (args.where.stageKey === undefined ||
              document.stageKey === args.where.stageKey) &&
            (args.where.required === undefined ||
              document.required === args.where.required) &&
            (documentType?.in === undefined ||
              documentType.in.includes(document.documentType)) &&
            (documentType?.notIn === undefined ||
              !documentType.notIn.includes(document.documentType)) &&
            (status?.in === undefined || status.in.includes(document.status)) &&
            (status?.notIn === undefined ||
              !status.notIn.includes(document.status)) &&
            (args.where.notApplicableReason === undefined ||
              document.notApplicableReason ===
                args.where.notApplicableReason) &&
            (file === undefined ||
              (file === null
                ? document.currentFileAssetId == null
                : file.not === null && document.currentFileAssetId != null))
          );
        });
        for (const document of matches) Object.assign(document, args.data);
        return { count: matches.length };
      }),
    },
    activity: {
      create: vi.fn().mockImplementation(async ({ data }) => {
        state.activities.push(data);
        return data;
      }),
    },
    estimate: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    projectProductLine: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn().mockImplementation(async (callback) => {
      const snapshot = {
        stageState: state.stageState && { ...state.stageState },
        steps: new Map(
          [...state.steps].map(([key, value]) => [key, { ...value }]),
        ),
        plan: state.plan && { ...state.plan },
        documents: new Map(
          [...state.documents].map(([key, value]) => [key, { ...value }]),
        ),
        activities: state.activities.map((activity) => ({ ...activity })),
      };
      try {
        return await callback(tx);
      } catch (error) {
        state.stageState = snapshot.stageState;
        state.steps = snapshot.steps;
        state.plan = snapshot.plan;
        state.documents = snapshot.documents;
        state.activities = snapshot.activities;
        throw error;
      }
    }),
  } as unknown as PrismaService;
  return { prisma, state, tx };
}

type CommandState = ReturnType<typeof commandPrisma>['state'];

function simpleCompletionPrisma(
  withDocuments: boolean,
  assignmentStatus = 'TODO',
  targetStep: StageOneStep = 'ASSIGNMENT',
  deleted = false,
  stageStatus = 'TODO',
  withPriorEvidence = targetStep === 'KICKOFF_APPROVAL',
) {
  const completedSteps = new Set<string>();
  if (withPriorEvidence)
    for (const step of [
      'ASSIGNMENT',
      'SURVEY',
      'PROPOSAL',
      'FINANCIAL_PLANNING',
    ])
      completedSteps.add(step);
  const statuses = new Map(
    [
      'ASSIGNMENT',
      'SURVEY',
      'PROPOSAL',
      'FINANCIAL_PLANNING',
      'KICKOFF_APPROVAL',
    ].map((step) => [
      step,
      step === targetStep
        ? step === 'ASSIGNMENT'
          ? assignmentStatus
          : 'TODO'
        : targetStep === 'KICKOFF_APPROVAL'
          ? 'DONE'
          : 'TODO',
    ]),
  );
  const documentNames = [
    ...SIMPLE_STAGE_ONE_STEPS.find(({ step }) => step === targetStep)!
      .documents,
  ];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
    project: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'project-1',
        name: 'Project',
        customerId: 'customer-1',
        estimatedValue: new Prisma.Decimal('1000.00'),
        stageOnePlan: { fundingSource: 'PPP' },
      }),
    },
    projectStageStep: {
      findMany: vi
        .fn()
        .mockImplementation(async () =>
          [...statuses].map(([step, status]) => ({ step, status })),
        ),
      updateMany: vi.fn().mockImplementation(async ({ where }) => {
        if (statuses.get(where.step) === 'DONE') return { count: 0 };
        statuses.set(where.step, 'DONE');
        return { count: 1 };
      }),
    },
    projectStageState: {
      findUnique: vi.fn().mockResolvedValue({ status: stageStatus }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    projectRequiredDocument: {
      findMany: vi.fn().mockImplementation(async () =>
        withDocuments
          ? documentNames.map((documentType) => ({
              documentType,
              currentFileAssetId: `file-${documentType}`,
              currentVersion: 1,
              status: 'UPLOADED',
              versions: deleted
                ? [
                    {
                      version: 1,
                      fileAssetId: `older-file-${documentType}`,
                      status: 'UPLOADED',
                    },
                  ]
                : [
                    {
                      version: 1,
                      fileAssetId: `file-${documentType}`,
                      status: 'UPLOADED',
                    },
                  ],
            }))
          : [],
      ),
    },
    projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
    projectStageApproval: { findFirst: vi.fn().mockResolvedValue(null) },
    fileAsset: {
      findMany: vi
        .fn()
        .mockImplementation(async ({ where }) =>
          deleted ? [] : where.id.in.map((id: string) => ({ id })),
        ),
    },
    activity: {
      findFirst: vi.fn().mockImplementation(async ({ where }) =>
        where.event === 'PROJECT_STAGE_ONE_SIMPLE_INITIATED'
          ? { metadata: { approvalId: null } }
          : completedSteps.has(where.metadata.equals)
            ? {
                id: 'activity-1',
                metadata: { step: where.metadata.equals, nextStep: 2 },
              }
            : null,
      ),
      findMany: vi.fn().mockImplementation(async () =>
        [...completedSteps].map((step) => {
          const index = SIMPLE_STAGE_ONE_STEPS.findIndex(
            ({ step: candidate }) => candidate === step,
          );
          return {
            metadata: {
              step,
              stageCompleted:
                completedSteps.size === SIMPLE_STAGE_ONE_STEPS.length,
              nextStep:
                index >= SIMPLE_STAGE_ONE_STEPS.length - 1 ? null : index + 2,
            },
          };
        }),
      ),
      create: vi.fn().mockImplementation(async ({ data }) => {
        completedSteps.add(data.metadata.step);
        return data;
      }),
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: vi
        .fn()
        .mockImplementation((callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService,
    statuses,
    tx,
    completedSteps,
  };
}

describe('ProjectStageOneService simplified completion', () => {
  it('derives disjoint Matrix and Workflow contexts from each persisted definition', async () => {
    const logicalDocument = (
      id: string,
      requiredDocumentId: string,
      filename: string,
      initialMatrix: boolean,
    ) => ({
      id,
      requiredDocumentId,
      requiredDocument: { initialMatrix },
      contextType: initialMatrix
        ? 'STAGE_MATRIX_DOCUMENT'
        : 'STAGE_WORKFLOW_STEP_DOCUMENT',
      step: initialMatrix ? null : 'ASSIGNMENT',
      documentType: filename,
      displayName: filename,
      status: 'UPLOADED',
      currentVersion: 1,
      currentFileAssetId: `${id}-file`,
      versions: [
        {
          version: 1,
          fileAssetId: `${id}-file`,
          status: 'UPLOADED',
          createdAt: new Date('2026-08-22T00:00:00.000Z'),
        },
      ],
      submittedOfficer: {
        id: 'officer-1',
        displayName: 'Officer',
        email: 'officer@example.test',
      },
      currentFileAsset: {
        id: `${id}-file`,
        originalFilename: filename,
        mimeType: 'application/pdf',
        sizeBytes: 8n,
      },
    });
    const definition = (
      id: string,
      documentName: string,
      initialMatrix: boolean,
    ) => ({
      id,
      workstreamKey: 'ASSIGNMENT',
      documentType: documentName,
      documentName,
      notes: null,
      position: 0,
      initialMatrix,
      required: false,
      supersededAt: null,
      status: 'MISSING',
      currentVersion: 0,
      currentFileAssetId: null,
      versions: [],
    });
    const project = {
      id: 'project-1',
      code: 'PRJ-001',
      name: 'Project',
      estimatedValue: new Prisma.Decimal('1000.00'),
      customerId: 'customer-1',
      primaryContactId: null,
      stageOnePlan: { fundingSource: 'PPP' },
      stageSteps: [],
      stageOneDocuments: [
        logicalDocument(
          'matrix-document',
          'matrix-definition',
          'matrix.pdf',
          true,
        ),
        logicalDocument(
          'workflow-document',
          'workflow-definition',
          'workflow.pdf',
          false,
        ),
      ],
      requiredDocuments: [
        definition('matrix-definition', 'Matrix', true),
        definition('workflow-definition', 'Workflow', false),
      ],
      keyDossierMilestones: [
        {
          id: 'milestone-1',
          code: 'HS-01',
          name: 'Hồ sơ khách hàng',
          position: 0,
          active: true,
        },
      ],
    };
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue(project),
        findMany: vi.fn().mockResolvedValue([]),
      },
      projectMember: { findMany: vi.fn().mockResolvedValue([]) },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
      fileAsset: { findMany: vi.fn().mockResolvedValue([]) },
      activity: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const result = await service(prisma).getSimple(
      actor('member-1', ['project.read', 'estimate.read']),
      'project-1',
    );

    expect(result.keyDossier).toMatchObject({
      milestones: [expect.objectContaining({ id: 'milestone-1' })],
      items: [expect.objectContaining({ id: 'matrix-definition' })],
      attachments: [expect.objectContaining({ id: 'matrix-document' })],
    });
    expect(result.workflow).toMatchObject({
      definitions: [expect.objectContaining({ id: 'workflow-definition' })],
      documents: [expect.objectContaining({ id: 'workflow-document' })],
    });
    expect(result).not.toHaveProperty('documentDefinitions');
    expect(result).not.toHaveProperty('documents');
    expect(result.steps[0]?.documentTypes).toEqual([
      expect.objectContaining({ id: 'workflow-definition' }),
    ]);
    expect(result.keyDossier.items[0]?.files).toEqual([
      expect.objectContaining({
        id: 'matrix-document',
        contextType: 'STAGE_MATRIX_DOCUMENT',
      }),
    ]);
    expect(result.workflow.definitions[0]?.files).toEqual([
      expect.objectContaining({
        id: 'workflow-document',
        contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
      }),
    ]);

    const restricted = await service(prisma).getSimple(
      actor('member-1', ['project.read']),
      'project-1',
    );
    expect(restricted.initiation).toMatchObject({
      estimatedInvestmentAmount: null,
      fundingSource: null,
    });
    expect(restricted.capabilities).toMatchObject({
      canReadFinance: false,
      canManageFinance: false,
    });
  });

  it('projects submission dates from each exact current version only', async () => {
    const logicalCurrentAt = new Date('2026-08-12T03:04:05.000Z');
    const legacyCurrentAt = new Date('2026-08-12T06:07:08.000Z');
    const project = {
      id: 'project-1',
      code: 'PRJ-001',
      name: 'Project',
      estimatedValue: new Prisma.Decimal('1000.00'),
      customerId: 'customer-1',
      primaryContactId: null,
      stageOnePlan: { fundingSource: 'PPP' },
      stageSteps: [],
      stageOneDocuments: [
        {
          id: 'logical-document',
          requiredDocumentId: 'legacy-document',
          requiredDocument: { initialMatrix: true },
          contextType: 'STAGE_MATRIX_DOCUMENT',
          step: null,
          documentType: 'Văn bản chủ trương đầu tư',
          displayName: 'Văn bản chủ trương đầu tư',
          status: 'UPLOADED',
          currentVersion: 2,
          currentFileAssetId: 'logical-current',
          versions: [
            {
              version: 1,
              fileAssetId: 'logical-prior',
              status: 'UPLOADED',
              createdAt: new Date('2026-08-01T00:00:00.000Z'),
            },
            {
              version: 2,
              fileAssetId: 'logical-current',
              status: 'UPLOADED',
              createdAt: logicalCurrentAt,
            },
          ],
          submittedOfficer: {
            id: 'officer-1',
            displayName: 'Officer',
            email: 'officer@example.test',
          },
          currentFileAsset: {
            id: 'logical-current',
            originalFilename: 'logical.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 21_474_836_480n,
          },
        },
      ],
      requiredDocuments: [
        {
          id: 'legacy-document',
          workstreamKey: 'ASSIGNMENT',
          documentType: 'Quyết định giao nhiệm vụ / Phân công Ban QLDA',
          documentName: 'Quyết định giao nhiệm vụ / Phân công Ban QLDA',
          notes: 'Hồ sơ phân công.',
          position: 2,
          initialMatrix: true,
          normalizedName: 'quyết định giao nhiệm vụ / phân công ban qlda',
          required: false,
          supersededAt: null,
          status: 'UPLOADED',
          currentVersion: 3,
          currentFileAssetId: 'legacy-current',
          versions: [
            {
              version: 2,
              fileAssetId: 'legacy-prior',
              status: 'UPLOADED',
              createdAt: new Date('2026-08-02T00:00:00.000Z'),
            },
            {
              version: 3,
              fileAssetId: 'legacy-current',
              status: 'UPLOADED',
              createdAt: legacyCurrentAt,
            },
          ],
        },
      ],
    };
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue(project),
        findMany: vi.fn().mockResolvedValue([]),
      },
      projectMember: { findMany: vi.fn().mockResolvedValue([]) },
      projectRequiredDocument: { findMany: vi.fn().mockResolvedValue([]) },
      projectStageOneDocument: { findMany: vi.fn().mockResolvedValue([]) },
      entityAttachment: { findMany: vi.fn().mockResolvedValue([]) },
      fileAsset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'legacy-current',
            originalFilename: 'legacy.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 9_007_199_254_740_993n,
          },
        ]),
      },
      activity: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const result = await service(prisma).getSimple(
      actor('member-1', [
        'project.read',
        'estimate.read',
        'project.document.manage',
        'file.read',
      ]),
      'project-1',
    );

    expect(result.keyDossier.attachments).toEqual([
      expect.objectContaining({
        id: 'logical-document',
        source: 'STAGE_ONE',
        legacyRequirementId: 'legacy-document',
        submittedAt: logicalCurrentAt.toISOString(),
      }),
      expect.objectContaining({
        id: 'legacy-document',
        source: 'LEGACY_REQUIRED_DOCUMENT',
        submittedAt: legacyCurrentAt.toISOString(),
        currentFileAsset: {
          id: 'legacy-current',
          originalFilename: 'legacy.pdf',
          mimeType: 'application/pdf',
          sizeBytes: '9007199254740993',
        },
      }),
    ]);
    expect(JSON.stringify(result.keyDossier.attachments)).not.toContain(
      'versions',
    );
    expect(result.keyDossier.attachments[0]?.currentFileAsset?.sizeBytes).toBe(
      '21474836480',
    );
    expect(result).toMatchObject({
      keyDossier: {
        items: [
          {
            id: 'legacy-document',
            name: 'Quyết định giao nhiệm vụ / Phân công Ban QLDA',
            workstreamKey: 'ASSIGNMENT',
            description: 'Hồ sơ phân công.',
            position: 2,
            initialMatrix: true,
            active: true,
            required: false,
            files: expect.arrayContaining([
              expect.objectContaining({ id: 'logical-document' }),
              expect.objectContaining({ id: 'legacy-document' }),
            ]),
          },
        ],
      },
      permittedCommands: { manageDocumentDefinitions: true },
      capabilities: {
        canSwitchProject: true,
        canManageProjectAccess: false,
        canReadDocuments: true,
        canUploadDocuments: false,
        canSubmitDocuments: false,
        canManageDocumentTypes: true,
        canCompleteStep: false,
        canReopenStep: false,
        canPreviewFiles: false,
        canDownloadFiles: false,
        canReadFinance: true,
        canManageFinance: false,
      },
    });
    expect(result.steps[0]?.documentTypes).toEqual([]);
    const stageOneDocumentsSelect = vi.mocked(prisma.project.findFirst).mock
      .calls[0]?.[0]?.select?.stageOneDocuments as {
      select: { requiredDocumentId: boolean; versions: { select: object } };
    };
    expect(stageOneDocumentsSelect.select.requiredDocumentId).toBe(true);
    expect(stageOneDocumentsSelect.select.versions.select).toEqual({
      version: true,
      fileAssetId: true,
      status: true,
      createdAt: true,
    });
    expect(
      vi.mocked(prisma.fileAsset.findMany).mock.calls[0]?.[0]?.select,
    ).toEqual({
      id: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
    });
    expect(
      vi.mocked(prisma.fileAsset.findMany).mock.calls[0]?.[0]?.where,
    ).toEqual(
      expect.objectContaining({
        attachments: { some: { projectId: 'project-1' } },
      }),
    );
    vi.mocked(prisma.fileAsset.findMany).mockResolvedValueOnce([]);
    const crossProjectPointer = await service(prisma).getSimple(
      actor('member-1', ['project.read', 'estimate.read']),
      'project-1',
    );
    expect(crossProjectPointer.keyDossier.attachments).toEqual([
      expect.objectContaining({ id: 'logical-document' }),
    ]);
    expect(
      JSON.stringify(crossProjectPointer.keyDossier.attachments),
    ).not.toContain('legacy.pdf');
    expect(
      JSON.stringify(crossProjectPointer.keyDossier.attachments),
    ).not.toMatch(/logical\.pdf|logical-current|legacy-current/);
    expect(prisma.fileAsset.findMany).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(prisma.fileAsset.findMany).mock.calls[1]?.[0]?.select,
    ).toEqual({ id: true });
  });

  it('completes one Step without files, matrix, finance, governance, or Red Flag side effects', async () => {
    const { prisma, tx, statuses } = simpleCompletionPrisma(
      false,
      'IN_PROGRESS',
    );
    tx.project.findFirst.mockResolvedValue({ id: 'project-1' });
    const audit = { write: vi.fn() };
    const commands = service(prisma, audit);

    await expect(
      commands.completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'ASSIGNMENT',
      ),
    ).resolves.toEqual({
      completed: true,
      nextStep: 2,
      stageCompleted: false,
    });

    expect(tx.projectStageStep.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.projectStageStep.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        stage: 'STAGE_ONE',
        step: 'ASSIGNMENT',
        status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] },
      },
      data: { status: 'DONE', version: { increment: 1 } },
    });
    expect(statuses.get('ASSIGNMENT')).toBe('DONE');
    expect(statuses.get('SURVEY')).toBe('TODO');
    expect(tx.activity.create).toHaveBeenCalledTimes(1);
    expect(tx.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: 'PROJECT_STAGE_ONE_SIMPLE_STEP_COMPLETED',
        metadata: {
          step: 'ASSIGNMENT',
          nextStep: 2,
          stageCompleted: false,
        },
      }),
    });
    expect(audit.write).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'owner-1' }),
      expect.objectContaining({
        beforeData: { step: 'ASSIGNMENT', status: 'IN_PROGRESS' },
      }),
    );
    expect(JSON.stringify(tx.activity.create.mock.calls)).not.toContain(
      'RED_FLAG',
    );
    expect(tx.projectRequiredDocument.findMany).not.toHaveBeenCalled();
    expect(tx.projectStageOneDocument.findMany).not.toHaveBeenCalled();
    expect(tx.projectStageApproval.findFirst).not.toHaveBeenCalled();
    expect(tx.fileAsset.findMany).not.toHaveBeenCalled();
  });

  it('selects X+1 without completing it when earlier Steps remain incomplete', async () => {
    const { prisma, tx, statuses } = simpleCompletionPrisma(
      false,
      'TODO',
      'PROPOSAL',
      false,
      'IN_PROGRESS',
      false,
    );

    await expect(
      service(prisma).completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'PROPOSAL',
      ),
    ).resolves.toEqual({
      completed: true,
      nextStep: 4,
      stageCompleted: false,
    });
    expect(statuses.get('ASSIGNMENT')).toBe('TODO');
    expect(statuses.get('PROPOSAL')).toBe('DONE');
    expect(statuses.get('FINANCIAL_PLANNING')).toBe('TODO');
    expect(tx.projectStageStep.updateMany).toHaveBeenCalledOnce();
  });

  it.each([
    ['an empty matrix', []],
    [
      'all matrix rows missing',
      [
        {
          documentType: 'Văn bản chủ trương đầu tư',
          status: 'MISSING',
          currentVersion: 0,
          currentFileAssetId: null,
          versions: [],
        },
      ],
    ],
    [
      'missing legacy Required Documents',
      [
        {
          documentType: 'Quyết định giao nhiệm vụ / Phân công Ban QLDA',
          status: 'MISSING',
          currentVersion: 0,
          currentFileAssetId: null,
          versions: [],
        },
      ],
    ],
  ])('ignores %s when completing a Step', async (_label, requirements) => {
    const { prisma, tx } = simpleCompletionPrisma(false);
    tx.projectRequiredDocument.findMany.mockResolvedValue(requirements);

    await expect(
      service(prisma).completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'ASSIGNMENT',
      ),
    ).resolves.toEqual({
      completed: true,
      nextStep: 2,
      stageCompleted: false,
    });
  });

  it('completes all five Steps with zero files and marks Stage 1 DONE', async () => {
    const { prisma, tx } = simpleCompletionPrisma(
      false,
      'TODO',
      'ASSIGNMENT',
      false,
      'IN_PROGRESS',
      false,
    );
    const commands = service(prisma);

    for (const [index, { step }] of SIMPLE_STAGE_ONE_STEPS.entries())
      await expect(
        commands.completeSimpleStep(
          actor('owner-1', ['project.update']),
          'project-1',
          step,
        ),
      ).resolves.toEqual({
        completed: true,
        nextStep:
          index === SIMPLE_STAGE_ONE_STEPS.length - 1 ? null : index + 2,
        stageCompleted: index === SIMPLE_STAGE_ONE_STEPS.length - 1,
      });

    expect(tx.projectStageStep.updateMany).toHaveBeenCalledTimes(5);
    expect(tx.projectStageState.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.projectStageState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: 'project-1' }),
        data: expect.objectContaining({ status: 'DONE' }),
      }),
    );
  });

  it('ignores pending legacy approval when completing the final optional Step', async () => {
    const { prisma, tx } = simpleCompletionPrisma(
      false,
      'TODO',
      'KICKOFF_APPROVAL',
    );
    tx.projectStageApproval.findFirst.mockResolvedValue({
      id: 'legacy-approval',
      status: 'PENDING',
      decision: null,
    });

    await expect(
      service(prisma).completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'KICKOFF_APPROVAL',
      ),
    ).resolves.toEqual({
      completed: true,
      nextStep: null,
      stageCompleted: true,
    });
    expect(tx.projectStageApproval.findFirst).not.toHaveBeenCalled();
  });

  it('re-completes a Step after an allowed reopen without trusting its historical Activity', async () => {
    const { prisma, tx, statuses } = simpleCompletionPrisma(false);
    const commands = service(prisma);
    await expect(
      commands.completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'ASSIGNMENT',
      ),
    ).resolves.toEqual({
      completed: true,
      nextStep: 2,
      stageCompleted: false,
    });
    tx.projectStageState.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
    });
    statuses.set('ASSIGNMENT', 'BLOCKED');

    await expect(
      commands.completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'ASSIGNMENT',
      ),
    ).resolves.toEqual({
      completed: true,
      nextStep: 2,
      stageCompleted: false,
    });
    expect(tx.projectStageStep.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.activity.create).toHaveBeenCalledTimes(2);
  });

  it('does not finish Stage 1 while a historically completed Step is reopened', async () => {
    const { prisma, tx, statuses } = simpleCompletionPrisma(
      false,
      'TODO',
      'KICKOFF_APPROVAL',
    );
    statuses.set('ASSIGNMENT', 'BLOCKED');

    await expect(
      service(prisma).completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'KICKOFF_APPROVAL',
      ),
    ).resolves.toEqual({
      completed: true,
      nextStep: null,
      stageCompleted: false,
    });
    expect(tx.projectStageState.updateMany).not.toHaveBeenCalled();
  });

  it('does not write completion side effects when the Stage transition loses its CAS', async () => {
    const { prisma, tx } = simpleCompletionPrisma(
      true,
      'TODO',
      'KICKOFF_APPROVAL',
    );
    tx.projectStageState.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service(prisma).completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'KICKOFF_APPROVAL',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.activity.create).not.toHaveBeenCalled();
  });

  it('records simplified completion after a legacy approval already completed the step', async () => {
    const { prisma, tx, statuses } = simpleCompletionPrisma(
      true,
      'TODO',
      'KICKOFF_APPROVAL',
    );
    statuses.set('KICKOFF_APPROVAL', 'DONE');
    tx.projectStageApproval.findFirst.mockResolvedValue({
      id: 'legacy-approval',
      status: 'APPROVED',
      decision: 'APPROVED',
    });

    await expect(
      service(prisma).completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'KICKOFF_APPROVAL',
      ),
    ).resolves.toEqual({
      completed: true,
      nextStep: null,
      stageCompleted: true,
    });
    expect(tx.projectStageStep.updateMany).not.toHaveBeenCalled();
    expect(tx.activity.create).toHaveBeenCalledTimes(1);
    expect(tx.projectStageState.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each(SIMPLE_STAGE_ONE_STEPS.slice(0, 4).map(({ step }) => step))(
    'records simplified completion after legacy workflow already completed %s',
    async (step) => {
      const targetIndex = SIMPLE_STAGE_ONE_STEPS.findIndex(
        ({ step: candidate }) => candidate === step,
      );
      const { prisma, tx, statuses, completedSteps } = simpleCompletionPrisma(
        true,
        step === 'ASSIGNMENT' ? 'DONE' : 'TODO',
        step,
      );
      statuses.set(step, 'DONE');
      for (const prior of SIMPLE_STAGE_ONE_STEPS.slice(0, targetIndex)) {
        statuses.set(prior.step, 'DONE');
        completedSteps.add(prior.step);
      }
      const audit = { write: vi.fn() };

      await expect(
        service(prisma, audit).completeSimpleStep(
          actor('owner-1', ['project.update']),
          'project-1',
          step,
        ),
      ).resolves.toEqual({
        completed: true,
        nextStep: (targetIndex + 2) as 2 | 3 | 4 | 5,
        stageCompleted: false,
      });
      expect(tx.projectStageStep.updateMany).not.toHaveBeenCalled();
      expect(tx.activity.create).toHaveBeenCalledTimes(1);
      expect(audit.write).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ userId: 'owner-1' }),
        expect.objectContaining({
          beforeData: { step, status: 'DONE' },
          afterData: { step, status: 'DONE', stageCompleted: false },
        }),
      );
    },
  );

  it('enforces completion permission and scoped Project integrity', async () => {
    const forbidden = simpleCompletionPrisma(false);
    await expect(
      service(forbidden.prisma).completeSimpleStep(
        actor('owner-1', []),
        'project-1',
        'ASSIGNMENT',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const inaccessible = simpleCompletionPrisma(false);
    inaccessible.tx.project.findFirst.mockResolvedValue(null);
    await expect(
      service(inaccessible.prisma).completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'ASSIGNMENT',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const crossProject = simpleCompletionPrisma(false);
    crossProject.tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service(crossProject.prisma).completeSimpleStep(
        actor('owner-1', ['project.update']),
        'project-1',
        'ASSIGNMENT',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(crossProject.tx.projectStageStep.updateMany).not.toHaveBeenCalled();
  });

  it('rejects re-initiation after simplified Stage 1 completion', async () => {
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (callback) =>
        callback({
          project: {
            findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
          },
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
          activity: { findFirst: vi.fn().mockResolvedValue(null) },
          projectStageState: {
            findUnique: vi.fn().mockResolvedValue({ status: 'DONE' }),
          },
        }),
      ),
    } as unknown as PrismaService;

    await expect(
      service(prisma).initiateSimple(
        actor('owner-1', [
          'project.update',
          'estimate.update',
          'estimate.read',
        ]),
        'project-1',
        {
          name: 'Changed',
          estimatedInvestmentAmount: '2.00',
          fundingSource: 'PPP',
          customerId: '00000000-0000-4000-8000-000000000001',
          idempotencyKey: 'new-key',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL', 'CANCELLED'])(
    'preserves terminal Stage 1 status %s during simplified completion',
    async (stageStatus) => {
      const { prisma, tx } = simpleCompletionPrisma(
        true,
        'TODO',
        'ASSIGNMENT',
        false,
        stageStatus,
      );

      await expect(
        service(prisma).completeSimpleStep(
          actor('owner-1', ['project.update', 'estimate.read']),
          'project-1',
          'ASSIGNMENT',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.projectStageStep.updateMany).not.toHaveBeenCalled();
      expect(tx.projectStageState.updateMany).not.toHaveBeenCalled();
    },
  );
});

describe('ProjectStageOneService existing initiation update', () => {
  const command = {
    name: 'Updated Project',
    estimatedInvestmentAmount: '123456789012345678.90',
    fundingSource: 'PPP' as const,
    customerId: '00000000-0000-4000-8000-000000000010',
    primaryContactId: '00000000-0000-4000-8000-000000000011',
    idempotencyKey: 'update-existing-1',
  };
  const receiptHash = (value: typeof command) =>
    createHash('sha256')
      .update(
        JSON.stringify({
          name: value.name,
          estimatedInvestmentAmount: new Prisma.Decimal(
            value.estimatedInvestmentAmount,
          ).toFixed(2),
          fundingSource: value.fundingSource,
          customerId: value.customerId,
          primaryContactId: value.primaryContactId ?? null,
        }),
      )
      .digest('hex');

  function updatePrisma(
    customer: unknown = { id: command.customerId },
    contact: unknown = { id: command.primaryContactId },
  ) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          name: 'Before',
          estimatedValue: new Prisma.Decimal('1.00'),
          currency: 'VND',
          customerId: 'customer-before',
          primaryContactId: null,
          stageOnePlan: { fundingSource: 'MIXED_OTHER' },
        }),
        update: vi.fn(),
        create: vi.fn(),
      },
      customer: { findFirst: vi.fn().mockResolvedValue(customer) },
      contact: { findFirst: vi.fn().mockResolvedValue(contact) },
      projectStageOnePlan: { upsert: vi.fn() },
      projectMember: { create: vi.fn() },
      projectStageState: { createMany: vi.fn(), updateMany: vi.fn() },
      projectStageStep: { upsert: vi.fn() },
      projectRequiredDocument: { create: vi.fn(), createMany: vi.fn() },
      projectStageApproval: { create: vi.fn() },
      uploadSession: { create: vi.fn() },
      activity: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    return {
      tx,
      prisma: {
        $transaction: vi.fn((work) => work(tx)),
      } as unknown as PrismaService,
    };
  }

  it('updates only the selected Project initiation values and returns the simple read', async () => {
    const { prisma, tx } = updatePrisma();
    const audit = { write: vi.fn() };
    const commands = service(prisma, audit);
    const simple = { project: { id: 'project-1' } };
    const simpleRead = vi.fn().mockResolvedValue(simple);
    (commands as unknown as { simpleRead: typeof simpleRead }).simpleRead =
      simpleRead;

    await expect(
      commands.updateSimple(
        actor('owner-1', [
          'project.update',
          'estimate.update',
          'estimate.read',
        ]),
        'project-1',
        command,
      ),
    ).resolves.toBe(simple);

    expect(tx.project.findFirst).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: command.customerId,
        organizationId: 'organization-1',
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(tx.contact.findFirst).toHaveBeenCalledWith({
      where: {
        id: command.primaryContactId,
        organizationId: 'organization-1',
        customerId: command.customerId,
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(tx.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: {
        name: command.name,
        estimatedValue: expect.objectContaining({
          toFixed: expect.any(Function),
        }),
        customerId: command.customerId,
        primaryContactId: command.primaryContactId,
        updatedBy: 'owner-1',
        version: { increment: 1 },
      },
    });
    expect(
      tx.project.update.mock.calls[0]?.[0].data.estimatedValue.toFixed(2),
    ).toBe(command.estimatedInvestmentAmount);
    expect(tx.projectStageOnePlan.upsert).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      create: { projectId: 'project-1', fundingSource: command.fundingSource },
      update: { fundingSource: command.fundingSource },
    });
    expect(tx.activity.create).toHaveBeenCalledOnce();
    expect(tx.activity.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'organization-1',
        actorId: 'owner-1',
        event: 'PROJECT_STAGE_ONE_SIMPLE_UPDATED',
        entityType: 'Project',
        entityId: 'project-1',
        metadata: {
          idempotencyKey: command.idempotencyKey,
          payloadHash: receiptHash(command),
        },
      },
    });
    expect(audit.write).toHaveBeenCalledOnce();
    expect(audit.write).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 'owner-1' }),
      expect.objectContaining({
        action: 'PROJECT_STAGE_ONE_SIMPLE_UPDATED',
        entityType: 'Project',
        entityId: 'project-1',
        beforeData: expect.objectContaining({ name: 'Before' }),
        afterData: expect.objectContaining({
          name: command.name,
          estimatedInvestmentAmount: command.estimatedInvestmentAmount,
        }),
        metadata: { idempotencyKey: command.idempotencyKey },
      }),
    );
    expect(simpleRead).toHaveBeenCalledWith(
      tx,
      expect.any(Object),
      'project-1',
      ['project.update', 'estimate.update', 'estimate.read'],
    );
    expect(tx.project.create).not.toHaveBeenCalled();
    expect(tx.projectMember.create).not.toHaveBeenCalled();
    expect(tx.projectStageState.createMany).not.toHaveBeenCalled();
    expect(tx.projectStageState.updateMany).not.toHaveBeenCalled();
    expect(tx.projectStageStep.upsert).not.toHaveBeenCalled();
    expect(tx.projectRequiredDocument.create).not.toHaveBeenCalled();
    expect(tx.projectRequiredDocument.createMany).not.toHaveBeenCalled();
    expect(tx.projectStageApproval.create).not.toHaveBeenCalled();
    expect(tx.uploadSession.create).not.toHaveBeenCalled();
  });

  it.each([
    [[]],
    [['project.update']],
    [['project.update', 'estimate.update']],
  ] as [string[]][])(
    'requires every existing-initiation permission: %j',
    async (permissions) => {
      const { prisma } = updatePrisma();
      const commands = service(prisma);

      await expect(
        commands.updateSimple(
          actor('owner-1', permissions),
          'project-1',
          command,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects foreign or deleted Customer and Contact references before mutation', async () => {
    const missingCustomer = updatePrisma(null);
    const customerCommands = service(missingCustomer.prisma);
    await expect(
      customerCommands.updateSimple(
        actor('owner-1', [
          'project.update',
          'estimate.update',
          'estimate.read',
        ]),
        'project-1',
        command,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missingCustomer.tx.project.update).not.toHaveBeenCalled();

    const missingContact = updatePrisma({ id: command.customerId }, null);
    const contactCommands = service(missingContact.prisma);
    await expect(
      contactCommands.updateSimple(
        actor('owner-1', [
          'project.update',
          'estimate.update',
          'estimate.read',
        ]),
        'project-1',
        command,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missingContact.tx.project.update).not.toHaveBeenCalled();
  });

  it('returns the selected Project unchanged for an identical locked retry and conflicts on key reuse', async () => {
    const { prisma, tx } = updatePrisma();
    tx.activity.findFirst.mockResolvedValue({
      metadata: {
        idempotencyKey: command.idempotencyKey,
        payloadHash: receiptHash(command),
      },
    });
    const commands = service(prisma);
    const simple = { project: { id: 'project-1' } };
    const simpleRead = vi.fn().mockResolvedValue(simple);
    (commands as unknown as { simpleRead: typeof simpleRead }).simpleRead =
      simpleRead;
    const a = actor('owner-1', [
      'project.update',
      'estimate.update',
      'estimate.read',
    ]);

    await expect(commands.updateSimple(a, 'project-1', command)).resolves.toBe(
      simple,
    );
    await expect(
      commands.updateSimple(a, 'project-1', {
        ...command,
        fundingSource: 'MIXED_OTHER',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
    const receiptOrder = tx.activity.findFirst.mock.invocationCallOrder[0];
    if (lockOrder === undefined || receiptOrder === undefined)
      throw new Error('Expected the lock and receipt lookup to run');
    expect(lockOrder).toBeLessThan(receiptOrder);
    expect(tx.project.update).not.toHaveBeenCalled();
    expect(tx.projectStageOnePlan.upsert).not.toHaveBeenCalled();
    expect(tx.activity.create).not.toHaveBeenCalled();
  });
});

describe('ProjectStageOneService initialization and plan commands', () => {
  const editor = (permissions: string[] = []) =>
    actor('owner-1', ['project.update', ...permissions]);

  it('does not initialize Stage 1 after membership is removed while waiting for the Project lock', async () => {
    const { prisma, tx } = commandPrisma();
    let membershipActive = true;
    tx.project.findFirst.mockImplementation(async () =>
      membershipActive
        ? {
            id: 'project-1',
            projectType: 'DESIGN_AND_BUILD',
            stageOnePlan: null,
            stageStates: [],
          }
        : null,
    );
    tx.$queryRaw.mockImplementation(async () => {
      membershipActive = false;
      return [{ id: 'project-1' }];
    });

    await expect(
      service(prisma).initialize(editor(), 'project-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.projectStageState.createMany).not.toHaveBeenCalled();
  });

  it.each(['NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'])(
    'does not upsert Stage 1 orchestration for terminal %s state',
    async (status) => {
      const { prisma, state, tx } = commandPrisma();
      state.stageState = { stage: 'STAGE_ONE', status };

      await expect(
        service(prisma).initialize(editor(), 'project-1'),
      ).resolves.toMatchObject({ initialized: false });
      expect(tx.projectStageStep.upsert).not.toHaveBeenCalled();
      expect(tx.projectStageOnePlan.upsert).not.toHaveBeenCalled();
      expect(tx.projectRequiredDocument.upsert).not.toHaveBeenCalled();
    },
  );

  it('initializes once and preserves all existing orchestration data on retry', async () => {
    const { prisma, state } = commandPrisma();
    const commands = service(prisma);

    await commands.initialize(editor(), 'project-1');
    state.stageState!.status = 'IN_PROGRESS';
    state.steps.get('SURVEY')!.status = 'DONE';
    state.plan!.source = 'Existing source';
    state.documents.get('PROJECT_DOSSIER')!.status = 'APPROVED';

    await commands.initialize(editor(), 'project-1');

    expect(state.stageState).toMatchObject({
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      status: 'IN_PROGRESS',
    });
    expect([...state.steps]).toEqual([
      ['ASSIGNMENT', expect.objectContaining({ status: 'TODO' })],
      ['SURVEY', expect.objectContaining({ status: 'DONE' })],
      ['PROPOSAL', expect.objectContaining({ status: 'TODO' })],
      ['FINANCIAL_PLANNING', expect.objectContaining({ status: 'TODO' })],
      ['KICKOFF_APPROVAL', expect.objectContaining({ status: 'TODO' })],
    ]);
    expect(state.plan).toMatchObject({
      projectId: 'project-1',
      source: 'Existing source',
    });
    expect(state.documents).toHaveLength(12);
    expect(state.documents.get('PROJECT_DOSSIER')).toMatchObject({
      status: 'APPROVED',
    });
    expect(state.activities).toEqual([
      expect.objectContaining({
        event: 'PROJECT_STAGE_ONE_INITIALIZED',
        entityType: 'Project',
        entityId: 'project-1',
      }),
    ]);
  });

  it.each(Object.entries(stageOneDocumentTypes))(
    'creates the exact applicable document set for %s',
    async (projectType, documentTypes) => {
      const { prisma, state } = commandPrisma(projectType);

      await service(prisma).initialize(editor(), 'project-1');

      expect([...state.documents.keys()]).toEqual(documentTypes);
    },
  );

  it('retires and reactivates routing-owned documents without deleting files or history', async () => {
    const { prisma, state } = commandPrisma('DESIGN_AND_BUILD');
    const commands = service(prisma);
    await commands.initialize(editor(), 'project-1');
    const surveyReport = state.documents.get('SURVEY_REPORT')!;
    const siteConstraints = state.documents.get('SITE_CONSTRAINTS')!;
    const versions = [{ id: 'document-version-1', version: 1 }];
    Object.assign(surveyReport, {
      status: 'UPLOADED',
      currentFileAssetId: 'file-1',
      currentVersion: 1,
      versions,
    });
    Object.assign(siteConstraints, {
      status: 'MISSING',
      currentFileAssetId: null,
      versions: [],
    });

    Object.assign(state.project, { projectType: 'INTERNAL' });
    await commands.initialize(editor(), 'project-1');

    expect(state.documents).toHaveLength(12);
    expect(surveyReport).toMatchObject({
      required: false,
      status: 'NOT_APPLICABLE',
      notApplicableReason: 'ROUTING_NOT_APPLICABLE',
      markedBy: null,
      markedAt: null,
      currentFileAssetId: 'file-1',
      currentVersion: 1,
      versions,
    });
    expect(siteConstraints).toMatchObject({
      required: false,
      status: 'NOT_APPLICABLE',
      notApplicableReason: 'ROUTING_NOT_APPLICABLE',
      currentFileAssetId: null,
    });

    Object.assign(state.project, { projectType: 'DESIGN_AND_BUILD' });
    await commands.initialize(editor(), 'project-1');

    expect(surveyReport).toMatchObject({
      required: false,
      status: 'UPLOADED',
      notApplicableReason: null,
      markedBy: null,
      markedAt: null,
      currentFileAssetId: 'file-1',
      currentVersion: 1,
      versions,
    });
    expect(siteConstraints).toMatchObject({
      required: false,
      status: 'MISSING',
      notApplicableReason: null,
      currentFileAssetId: null,
    });
  });

  it('preserves a user-created same-type document while enforcing optionality', async () => {
    const { prisma, state } = commandPrisma('DESIGN_AND_BUILD');
    const commands = service(prisma);
    await commands.initialize(editor(), 'project-1');
    const userDocument = {
      id: 'document-user-survey-report',
      organizationId: 'organization-1',
      projectId: 'project-1',
      stageKey: 'STAGE_1',
      workstreamKey: 'CUSTOM_DELIVERABLES',
      documentType: 'SURVEY_REPORT',
      documentName: 'Customer survey appendix',
      required: true,
      status: 'UPLOADED',
      currentFileAssetId: 'file-user-survey-report',
      currentVersion: 1,
      notApplicableReason: null,
    };
    state.documents.set('user-survey-report', userDocument);

    Object.assign(state.project, { projectType: 'INTERNAL' });
    await commands.initialize(editor(), 'project-1');
    expect(userDocument).toEqual(
      expect.objectContaining({
        workstreamKey: 'CUSTOM_DELIVERABLES',
        required: false,
        status: 'UPLOADED',
        currentFileAssetId: 'file-user-survey-report',
        notApplicableReason: null,
      }),
    );

    Object.assign(state.project, { projectType: 'DESIGN_AND_BUILD' });
    await commands.initialize(editor(), 'project-1');
    expect(userDocument).toEqual(
      expect.objectContaining({
        workstreamKey: 'CUSTOM_DELIVERABLES',
        required: false,
        status: 'UPLOADED',
        currentFileAssetId: 'file-user-survey-report',
        notApplicableReason: null,
      }),
    );
  });

  it('never overwrites audited document decisions across routing changes', async () => {
    const { prisma, state } = commandPrisma('DESIGN_AND_BUILD');
    const commands = service(prisma);
    await commands.initialize(editor(), 'project-1');
    const decisions = {
      SURVEY_REPORT: {
        status: 'APPROVED',
        approvedBy: 'reviewer-1',
        approvedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
      SITE_CONSTRAINTS: {
        status: 'REJECTED',
        notes: 'Replace the evidence.',
      },
      PRELIMINARY_FINANCIAL_PLAN: {
        status: 'NOT_APPLICABLE',
        notApplicableReason: 'Customer funds this internally.',
        markedBy: 'reviewer-1',
        markedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    } as const;
    for (const [documentType, decision] of Object.entries(decisions))
      Object.assign(state.documents.get(documentType)!, decision);

    Object.assign(state.project, { projectType: 'INTERNAL' });
    await commands.initialize(editor(), 'project-1');
    for (const [documentType, decision] of Object.entries(decisions))
      expect(state.documents.get(documentType)).toMatchObject({
        required: false,
        ...decision,
      });

    Object.assign(state.project, { projectType: 'DESIGN_AND_BUILD' });
    await commands.initialize(editor(), 'project-1');
    for (const [documentType, decision] of Object.entries(decisions))
      expect(state.documents.get(documentType)).toMatchObject({
        required: false,
        ...decision,
      });
  });

  it('initializes a canonically inapplicable survey with an internal marker and no actor/time', async () => {
    const { prisma, state } = commandPrisma('PRODUCT_SUPPLY');

    await service(prisma).initialize(editor(), 'project-1');

    expect(state.steps.get('SURVEY')).toMatchObject({
      status: 'DONE',
      notApplicableReason: 'ROUTING_NOT_APPLICABLE',
      notApplicableBy: null,
      notApplicableAt: null,
    });
  });

  it('reconciles only auto-marked or unfinished SURVEY when canonical routing changes', async () => {
    const { prisma, state } = commandPrisma();
    const commands = service(prisma);

    await commands.initialize(editor(), 'project-1');
    expect(state.steps.get('SURVEY')).toMatchObject({ status: 'TODO' });

    Object.assign(state.project, { projectType: 'PRODUCT_SUPPLY' });
    await commands.initialize(editor(), 'project-1');
    expect(state.steps.get('SURVEY')).toMatchObject({
      status: 'DONE',
      notApplicableReason: 'ROUTING_NOT_APPLICABLE',
      notApplicableBy: null,
      notApplicableAt: null,
    });

    Object.assign(state.project, { projectType: 'DESIGN_AND_BUILD' });
    await commands.initialize(editor(), 'project-1');
    expect(state.steps.get('SURVEY')).toMatchObject({
      status: 'TODO',
      notApplicableReason: null,
      notApplicableBy: null,
      notApplicableAt: null,
    });
  });

  it.each([
    [
      'user-completed',
      {
        status: 'DONE',
        notApplicableReason: null,
        notApplicableBy: null,
        notApplicableAt: null,
      },
      'PRODUCT_SUPPLY',
    ],
    [
      'audited not-applicable',
      {
        status: 'DONE',
        notApplicableReason: 'Customer denied access.',
        notApplicableBy: 'owner-1',
        notApplicableAt: new Date('2026-08-02T00:00:00.000Z'),
      },
      'DESIGN_AND_BUILD',
    ],
  ] as const)(
    'does not overwrite a %s SURVEY when routing changes',
    async (_label, decision, projectType) => {
      const { prisma, state } = commandPrisma('DESIGN_AND_BUILD');
      const commands = service(prisma);
      await commands.initialize(editor(), 'project-1');
      Object.assign(state.steps.get('SURVEY')!, decision);
      Object.assign(state.project, { projectType });

      await commands.initialize(editor(), 'project-1');

      expect(state.steps.get('SURVEY')).toMatchObject(decision);
    },
  );

  it('auto-completes an unfinished blocked SURVEY when routing becomes inapplicable', async () => {
    const { prisma, state } = commandPrisma('DESIGN_AND_BUILD');
    const commands = service(prisma);
    await commands.initialize(editor(), 'project-1');
    Object.assign(state.steps.get('SURVEY')!, { status: 'BLOCKED' });
    Object.assign(state.project, { projectType: 'PRODUCT_SUPPLY' });

    await commands.initialize(editor(), 'project-1');

    expect(state.steps.get('SURVEY')).toMatchObject({
      status: 'DONE',
      notApplicableReason: 'ROUTING_NOT_APPLICABLE',
    });
  });

  it('initializes canonically inapplicable finance as DONE with the internal marker', async () => {
    const { prisma, state } = commandPrisma('INTERNAL');

    await service(prisma).initialize(editor(), 'project-1');

    expect(state.steps.get('FINANCIAL_PLANNING')).toMatchObject({
      status: 'DONE',
      notApplicableReason: 'ROUTING_NOT_APPLICABLE',
      notApplicableBy: null,
      notApplicableAt: null,
    });
  });

  it('reconciles only auto-marked or unfinished finance when canonical routing changes', async () => {
    const { prisma, state } = commandPrisma();
    const commands = service(prisma);
    await commands.initialize(editor(), 'project-1');

    Object.assign(state.project, { projectType: 'INTERNAL' });
    await commands.initialize(editor(), 'project-1');
    expect(state.steps.get('FINANCIAL_PLANNING')).toMatchObject({
      status: 'DONE',
      notApplicableReason: 'ROUTING_NOT_APPLICABLE',
    });

    Object.assign(state.project, { projectType: 'DESIGN_AND_BUILD' });
    await commands.initialize(editor(), 'project-1');
    expect(state.steps.get('FINANCIAL_PLANNING')).toMatchObject({
      status: 'TODO',
      notApplicableReason: null,
      notApplicableBy: null,
      notApplicableAt: null,
    });
  });

  it('preserves user-completed finance when routing becomes inapplicable', async () => {
    const { prisma, state } = commandPrisma();
    const commands = service(prisma);
    await commands.initialize(editor(), 'project-1');
    Object.assign(state.steps.get('FINANCIAL_PLANNING')!, {
      status: 'DONE',
      version: 4,
    });
    Object.assign(state.project, { projectType: 'INTERNAL' });

    await commands.initialize(editor(), 'project-1');

    expect(state.steps.get('FINANCIAL_PLANNING')).toMatchObject({
      status: 'DONE',
      version: 4,
    });
    expect(state.steps.get('FINANCIAL_PLANNING')!.notApplicableReason).not.toBe(
      'ROUTING_NOT_APPLICABLE',
    );
  });

  it('requires a scoped canonical Project and update permission', async () => {
    const invalid = commandPrisma('TURNKEY');
    await expect(
      service(invalid.prisma).initialize(editor(), 'project-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service(invalid.prisma).updatePlan(editor(), 'project-1', {
        source: 'Referral',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const forbidden = commandPrisma();
    await expect(
      service(forbidden.prisma).initialize(actor('owner-1'), 'project-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const missing = commandPrisma();
    missing.tx.project.findFirst.mockResolvedValue(null);
    await expect(
      service(missing.prisma).initialize(editor(), 'project-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'project-1',
          organizationId: 'organization-1',
          deletedAt: null,
          OR: [
            { projectOwnerId: 'owner-1' },
            { projectManagerId: 'owner-1' },
            { members: { some: { userId: 'owner-1' } } },
          ],
        }),
      }),
    );
  });

  it('requires nonblank plan scope notes for a custom Project', async () => {
    const { prisma, state } = commandPrisma('CUSTOM');
    const commands = service(prisma);

    await expect(
      commands.updatePlan(editor(), 'project-1', { source: 'Referral' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      commands.updatePlan(editor(), 'project-1', {
        scopeNotes: 'Custom joinery and lighting scope',
      }),
    ).resolves.toBeDefined();
    expect(state.plan).toMatchObject({
      scopeNotes: 'Custom joinery and lighting scope',
    });
    await expect(
      commands.updatePlan(editor(), 'project-1', {
        scopeNotes: null as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.plan).toMatchObject({
      scopeNotes: 'Custom joinery and lighting scope',
    });
  });

  it('rejects unauthorized financial writes instead of dropping them', async () => {
    const { prisma, state } = commandPrisma();
    const commands = service(prisma);

    await expect(
      commands.updatePlan(editor(), 'project-1', {
        preliminaryRevenue: '1000.00',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      commands.updatePlan(editor(['estimate.read']), 'project-1', {
        preliminaryCost: '800.00',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.plan).toBeNull();

    await commands.updatePlan(
      editor(['project.stage1.finance.read', 'project.stage1.finance.manage']),
      'project-1',
      {
        preliminaryRevenue: '1000.00',
        preliminaryCost: '800.00',
        preliminaryMargin: '200.00',
      },
    );
    expect(String(state.plan!.preliminaryRevenue)).toBe('1000');
    expect(String(state.plan!.preliminaryCost)).toBe('800');
    expect(String(state.plan!.preliminaryMargin)).toBe('200');
  });

  it.each([
    'plannedFinancialPlanAt',
    'preliminaryRevenue',
    'preliminaryCost',
    'preliminaryMargin',
    'preliminaryCurrency',
    'preliminaryFinancialPlanDate',
  ] as const)(
    'requires both finance read and manage to write %s',
    async (field) => {
      const { prisma } = commandPrisma();

      await expect(
        service(prisma).updatePlan(
          editor(['project.stage1.finance.manage']),
          'project-1',
          {
            [field]:
              field.includes('Date') || field.includes('At')
                ? '2026-08-18T09:00:00.000Z'
                : field === 'preliminaryCurrency'
                  ? 'THB'
                  : '1000.00',
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('uses finance read and manage for preliminary writes', async () => {
    const { prisma, state } = commandPrisma();

    await expect(
      service(prisma).updatePlan(
        editor([
          'project.stage1.finance.read',
          'project.stage1.finance.manage',
        ]),
        'project-1',
        {
          preliminaryRevenue: '1000.00',
          preliminaryCost: '800.00',
          preliminaryMargin: '200.00',
          preliminaryCurrency: 'THB',
          preliminaryFinancialPlanDate: '2026-08-18T09:00:00.000Z',
        },
      ),
    ).resolves.toBeDefined();
    expect(state.plan).toMatchObject({ preliminaryCurrency: 'THB' });
  });

  it('constructs StageOnePlan money as exact Prisma Decimal values', async () => {
    const { prisma, state } = commandPrisma();

    await service(prisma).updatePlan(
      editor(['project.stage1.finance.read', 'project.stage1.finance.manage']),
      'project-1',
      {
        preliminaryRevenue: '9007199254740993.01',
        preliminaryCost: '0.01',
        preliminaryMargin: '1.00',
      },
    );

    expect(state.plan!.preliminaryRevenue).toBeInstanceOf(Prisma.Decimal);
    expect(String(state.plan!.preliminaryRevenue)).toBe('9007199254740993.01');
    expect(String(state.plan!.preliminaryCost)).toBe('0.01');
    expect(String(state.plan!.preliminaryMargin)).toBe('9007199254740993');
  });

  it('derives margin with Prisma Decimal and ignores a conflicting client margin', async () => {
    const { prisma, state } = commandPrisma();

    await service(prisma).updatePlan(
      editor(['project.stage1.finance.read', 'project.stage1.finance.manage']),
      'project-1',
      {
        preliminaryRevenue: '35000000000.00',
        preliminaryCost: '35000000000.01',
        preliminaryMargin: '999999999999999999.99',
      },
    );

    expect(state.plan!.preliminaryMargin).toBeInstanceOf(Prisma.Decimal);
    expect(String(state.plan!.preliminaryMargin)).toBe('-0.01');
  });

  it('writes update Activity only for an actual plan change', async () => {
    const { prisma, state } = commandPrisma();
    const commands = service(prisma);

    await commands.updatePlan(editor(), 'project-1', { source: 'Referral' });
    await commands.updatePlan(editor(), 'project-1', { source: 'Referral' });
    await commands.updatePlan(editor(), 'project-1', { source: 'Tender' });

    expect(state.activities).toEqual([
      expect.objectContaining({
        event: 'PROJECT_STAGE_ONE_PLAN_UPDATED',
        metadata: { fields: ['source'] },
      }),
      expect.objectContaining({
        event: 'PROJECT_STAGE_ONE_PLAN_UPDATED',
        metadata: { fields: ['source'] },
      }),
    ]);
  });

  it('permission-filters the updated plan response', async () => {
    const { prisma, state } = commandPrisma();
    state.plan = {
      projectId: 'project-1',
      preliminaryRevenue: new Prisma.Decimal('1000.00'),
      preliminaryCost: new Prisma.Decimal('800.00'),
      preliminaryMargin: new Prisma.Decimal('200.00'),
    };

    const result = await service(prisma).updatePlan(editor(), 'project-1', {
      source: 'Referral',
    });

    expect(result).not.toHaveProperty('preliminaryRevenue');
    expect(result).not.toHaveProperty('preliminaryCost');
    expect(result).not.toHaveProperty('preliminaryMargin');
  });

  it('does not log reordered but equivalent JSON as a plan change', async () => {
    const { prisma, state } = commandPrisma();
    const commands = service(prisma);

    await commands.updatePlan(editor(), 'project-1', {
      scopeFlags: { design: true, procurement: false },
    });
    await commands.updatePlan(editor(), 'project-1', {
      scopeFlags: { procurement: false, design: true },
    });

    expect(state.activities).toHaveLength(1);
  });
});

describe('ProjectStageOneService governance commands', () => {
  const editor = () => actor('owner-1', ['project.update']);

  it('atomically saves active Project members, assignment ownership, Activity, and Audit once', async () => {
    const { prisma, state, tx } = commandPrisma();
    const audit = { write: vi.fn() };
    const commands = service(prisma, audit);
    await commands.initialize(editor(), 'project-1');
    state.activities.length = 0;
    Object.assign(state.project, { projectOwnerId: 'owner-1' });
    state.members.push({
      id: 'project-member-pm',
      organizationId: 'organization-1',
      projectId: 'project-1',
      userId: 'pm-1',
      user: {
        status: 'active',
        organizationMembers: [
          { organizationId: 'organization-1', status: 'active' },
        ],
      },
    });
    state.members.push({
      id: 'project-member-owner',
      organizationId: 'organization-1',
      projectId: 'project-1',
      userId: 'owner-1',
      user: {
        status: 'active',
        organizationMembers: [
          { organizationId: 'organization-1', status: 'active' },
        ],
      },
    });
    Object.assign(tx, {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
    });
    Object.assign(tx.project, {
      update: vi.fn().mockImplementation(async ({ data }) => {
        Object.assign(state.project, data);
        return state.project;
      }),
    });
    Object.assign(tx.projectMember, {
      findMany: vi.fn().mockImplementation(async ({ select }) =>
        select.userId
          ? state.members.map(({ userId }) => ({ userId }))
          : state.members.map(({ user }) => {
              const memberUser = user as { id?: string };
              return {
                user: {
                  id: memberUser.id ?? 'member-1',
                  displayName: memberUser.id ?? 'Project Member',
                  email: `${memberUser.id ?? 'member-1'}@example.com`,
                },
              };
            }),
      ),
    });
    Object.assign(tx.projectStageStep, {
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const step = [...state.steps.values()].find(
          ({ id }) => id === where.id,
        )!;
        Object.assign(step, data);
        return step;
      }),
    });
    const data = {
      principalUserId: 'member-1',
      coordinatorUserIds: ['pm-1', 'owner-1'],
      responsibilityNotes: 'PM and coordinator responsibilities.',
    };

    await expect(
      commands.updateGovernance(editor(), 'project-1', data),
    ).resolves.toMatchObject({
      ...data,
      responsibilityNoteMaxLength: 1000,
    });
    await commands.updateGovernance(editor(), 'project-1', data);

    expect(state.project).toMatchObject({ projectOwnerId: 'member-1' });
    expect(state.plan).toMatchObject({
      governanceCoordinatorUserIds: ['pm-1', 'owner-1'],
      responsibilityNotes: data.responsibilityNotes,
    });
    expect(state.steps.get('ASSIGNMENT')).toMatchObject({
      ownerUserId: 'member-1',
    });
    expect(state.activities).toEqual([
      expect.objectContaining({
        event: 'PROJECT_STAGE_ONE_GOVERNANCE_UPDATED',
      }),
    ]);
    expect(audit.write).toHaveBeenCalledOnce();
  });

  it('rejects a duplicate, inactive, non-member, or cross-Project governance user before mutation', async () => {
    const { prisma, state, tx } = commandPrisma();
    await service(prisma).initialize(editor(), 'project-1');
    Object.assign(tx, {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
    });
    Object.assign(tx.projectMember, {
      findMany: vi.fn().mockResolvedValue([]),
    });
    const commands = service(prisma);

    await expect(
      commands.updateGovernance(actor('owner-1'), 'project-1', {
        principalUserId: 'member-1',
        coordinatorUserIds: [],
        responsibilityNotes: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      commands.updateGovernance(editor(), 'project-1', {
        principalUserId: 'member-1',
        coordinatorUserIds: ['member-1'],
        responsibilityNotes: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    for (const userId of ['inactive-1', 'non-member-1', 'other-project-1'])
      await expect(
        commands.updateGovernance(editor(), 'project-1', {
          principalUserId: userId,
          coordinatorUserIds: [],
          responsibilityNotes: null,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.plan).toMatchObject({ projectId: 'project-1' });
    expect(state.activities).toHaveLength(1);
  });
});

describe('ProjectStageOneService assignment completion', () => {
  const editor = () => actor('owner-1', ['project.update']);
  const assigned = () => {
    const command = commandPrisma();
    command.state.plan = {
      projectId: 'project-1',
      responsibilityNotes: 'PM coordinates customer and department owners.',
      governanceCoordinatorUserIds: ['member-1'],
    };
    command.state.steps.set('ASSIGNMENT', {
      id: 'step-assignment',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      step: 'ASSIGNMENT',
      status: 'IN_PROGRESS',
      version: 3,
    });
    return command;
  };

  it.each([
    [
      'PROJECT_CODE_MISSING',
      (state: CommandState) => Object.assign(state.project, { code: ' ' }),
    ],
    [
      'PROJECT_NAME_MISSING',
      (state: CommandState) => Object.assign(state.project, { name: '' }),
    ],
    [
      'CUSTOMER_MISSING_WHEN_REQUIRED',
      (state: CommandState) =>
        Object.assign(state.project, { customerId: null }),
    ],
    [
      'PROJECT_TYPE_MISSING',
      (state: CommandState) =>
        Object.assign(state.project, { projectType: 'TURNKEY' }),
    ],
    [
      'PROJECT_MANAGER_MISSING',
      (state: CommandState) =>
        Object.assign(state.project, {
          projectManagerId: null,
          projectManager: null,
        }),
    ],
    [
      'PROJECT_MANAGER_MISSING',
      (state: CommandState) =>
        Object.assign(state.project.projectManager, { status: 'invited' }),
    ],
    [
      'PROJECT_MANAGER_MISSING',
      (state: CommandState) =>
        Object.assign(state.project.projectManager, { status: 'disabled' }),
    ],
    [
      'PROJECT_MANAGER_MISSING',
      (state: CommandState) =>
        Object.assign(state.project.projectManager.organizationMembers[0]!, {
          status: 'suspended',
        }),
    ],
    ['PROJECT_MEMBER_MISSING', (state: CommandState) => (state.members = [])],
    [
      'PROJECT_MEMBER_MISSING',
      (state: CommandState) =>
        Object.assign(state.members[0]!.user, { status: 'invited' }),
    ],
    [
      'PROJECT_MEMBER_MISSING',
      (state: CommandState) =>
        Object.assign(state.members[0]!.user, { status: 'disabled' }),
    ],
    [
      'PROJECT_MEMBER_MISSING',
      (state: CommandState) =>
        Object.assign(state.members[0]!.user.organizationMembers[0]!, {
          status: 'suspended',
        }),
    ],
    [
      'PROJECT_MEMBER_MISSING',
      (state: CommandState) =>
        Object.assign(state.members[0]!.user.organizationMembers[0]!, {
          organizationId: 'organization-2',
        }),
    ],
    [
      'RESPONSIBILITY_NOTES_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { responsibilityNotes: ' ' }),
    ],
    [
      'GOVERNANCE_PRINCIPAL_MISSING',
      (state: CommandState) =>
        Object.assign(state.project, { projectOwnerId: null }),
    ],
    [
      'GOVERNANCE_PRINCIPAL_INACTIVE',
      (state: CommandState) => {
        Object.assign(state.members[0]!.user, { status: 'disabled' });
        state.members.push({
          ...state.members[0]!,
          id: 'project-member-2',
          userId: 'active-coordinator',
          user: {
            status: 'active',
            organizationMembers: [
              { organizationId: 'organization-1', status: 'active' },
            ],
          },
        });
        Object.assign(state.plan!, {
          governanceCoordinatorUserIds: ['active-coordinator'],
        });
      },
    ],
    [
      'GOVERNANCE_COORDINATOR_INVALID',
      (state: CommandState) =>
        Object.assign(state.plan!, {
          governanceCoordinatorUserIds: ['not-an-active-member'],
        }),
    ],
    [
      'PROJECT_DEPARTMENT_MISSING',
      (state: CommandState) => (state.departments = []),
    ],
  ] as const)(
    'returns structured %s without partial completion',
    async (code, makeInvalid) => {
      const { prisma, state } = assigned();
      makeInvalid(state);

      const result = await service(prisma).completeStep(
        editor(),
        'project-1',
        'ASSIGNMENT',
      );

      expect(result).toEqual({
        completed: false,
        step: 'ASSIGNMENT',
        checklist: expect.arrayContaining([
          expect.objectContaining({ code, satisfied: false }),
        ]),
        blockers: expect.arrayContaining([
          expect.objectContaining({
            code,
            entityType: 'Project',
            entityId: 'project-1',
            route: expect.stringMatching(
              /^\/projects\/project-1\/stage-1(?:\/(initiation|members)|#(assignment|governance))$/,
            ),
            remediation: expect.any(String),
          }),
        ]),
      });
      expect(state.steps.get('ASSIGNMENT')).toMatchObject({
        status: 'IN_PROGRESS',
        version: 3,
      });
      expect(state.activities).toEqual([]);
    },
  );

  it('returns the complete Vietnamese assignment checklist with an actionable responsibility field', async () => {
    const { prisma, state } = assigned();
    state.plan!.responsibilityNotes = ' ';

    const result = await service(prisma).completeStep(
      editor(),
      'project-1',
      'ASSIGNMENT',
    );

    expect(result).toMatchObject({
      completed: false,
      step: 'ASSIGNMENT',
      checklist: expect.arrayContaining([
        {
          code: 'RESPONSIBILITY_NOTES_MISSING',
          label: 'Mô tả trách nhiệm',
          satisfied: false,
          field: 'responsibilityNotes',
          section: 'governance',
          route: '/projects/project-1/stage-1#governance',
          remediation:
            'Bổ sung nội dung trách nhiệm tại mục Ban điều hành & phân công.',
          actionLabel: 'BỔ SUNG MÔ TẢ TRÁCH NHIỆM',
        },
      ]),
      blockers: [
        expect.objectContaining({
          code: 'RESPONSIBILITY_NOTES_MISSING',
          title:
            'Chưa ghi rõ trách nhiệm và phạm vi công việc của Ban điều hành dự án.',
          field: 'responsibilityNotes',
          section: 'governance',
          route: '/projects/project-1/stage-1#governance',
          remediation:
            'Bổ sung nội dung trách nhiệm tại mục Ban điều hành & phân công.',
          actionLabel: 'BỔ SUNG MÔ TẢ TRÁCH NHIỆM',
        }),
      ],
    });
  });

  it('requires project.update and Project scope', async () => {
    const forbidden = assigned();
    await expect(
      service(forbidden.prisma).completeStep(
        actor('owner-1'),
        'project-1',
        'ASSIGNMENT',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const inaccessible = assigned();
    inaccessible.tx.project.findFirst.mockResolvedValueOnce(null);
    await expect(
      service(inaccessible.prisma).completeStep(
        editor(),
        'project-2',
        'ASSIGNMENT',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(inaccessible.tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'project-2',
          organizationId: 'organization-1',
          deletedAt: null,
          OR: [
            { projectOwnerId: 'owner-1' },
            { projectManagerId: 'owner-1' },
            { members: { some: { userId: 'owner-1' } } },
          ],
        }),
      }),
    );
  });

  it('uses exact active User and organization-membership predicates', async () => {
    const { prisma, tx } = assigned();

    await service(prisma).completeStep(editor(), 'project-1', 'ASSIGNMENT');

    const select = tx.project.findFirst.mock.calls[0]![0].select;
    expect(select.projectManager.select).toEqual(
      expect.objectContaining({
        status: true,
        organizationMembers: {
          where: { organizationId: 'organization-1', status: 'active' },
          select: { id: true },
          take: 1,
        },
      }),
    );
    expect(select.members).toEqual({
      where: {
        organizationId: 'organization-1',
        user: {
          status: 'active',
          organizationMembers: {
            some: { organizationId: 'organization-1', status: 'active' },
          },
        },
      },
      select: { id: true, userId: true },
    });
  });

  it('atomically completes only ASSIGNMENT and writes one direct Project Activity', async () => {
    const { prisma, state } = assigned();
    state.steps.set('SURVEY', {
      id: 'step-survey',
      step: 'SURVEY',
      status: 'IN_PROGRESS',
      version: 8,
    });

    const result = await service(prisma).completeStep(
      editor(),
      'project-1',
      'ASSIGNMENT',
    );

    expect(result).toEqual({
      completed: true,
      alreadyComplete: false,
      step: 'ASSIGNMENT',
      status: 'DONE',
      version: 4,
      checklist: expect.arrayContaining([
        expect.objectContaining({
          code: 'RESPONSIBILITY_NOTES_MISSING',
          satisfied: true,
        }),
      ]),
      blockers: [],
    });
    expect(state.steps.get('ASSIGNMENT')).toMatchObject({
      status: 'DONE',
      version: 4,
    });
    expect(state.steps.get('SURVEY')).toMatchObject({
      status: 'IN_PROGRESS',
      version: 8,
    });
    expect(state.activities).toEqual([
      {
        organizationId: 'organization-1',
        actorId: 'owner-1',
        event: 'PROJECT_STAGE_ONE_ASSIGNMENT_COMPLETED',
        entityType: 'Project',
        entityId: 'project-1',
        metadata: {
          stage: 'STAGE_ONE',
          step: 'ASSIGNMENT',
          route: '/projects/project-1/stage-1/initiation',
        },
      },
    ]);
  });

  it('returns already complete on retry without duplicate Activity', async () => {
    const { prisma, state } = assigned();
    const commands = service(prisma);

    await commands.completeStep(editor(), 'project-1', 'ASSIGNMENT');
    Object.assign(state.project, {
      projectManagerId: null,
      projectManager: null,
    });
    state.members = [];
    state.departments = [];
    state.plan!.responsibilityNotes = null;
    const retried = await commands.completeStep(
      editor(),
      'project-1',
      'ASSIGNMENT',
    );

    expect(retried).toEqual({
      completed: true,
      alreadyComplete: true,
      step: 'ASSIGNMENT',
      status: 'DONE',
      version: 4,
      checklist: [],
      blockers: [],
    });
    expect(state.activities).toHaveLength(1);
  });

  it.each([
    [
      'GOVERNANCE_PRINCIPAL_MISSING',
      (state: CommandState) =>
        Object.assign(state.project, { projectOwnerId: null }),
      (state: CommandState) =>
        Object.assign(state.project, { projectOwnerId: 'member-1' }),
    ],
    [
      'GOVERNANCE_PRINCIPAL_INACTIVE',
      (state: CommandState) => {
        Object.assign(state.members[0]!.user, { status: 'disabled' });
        state.members.push({
          ...state.members[0]!,
          id: 'project-member-2',
          userId: 'active-coordinator',
          user: {
            status: 'active',
            organizationMembers: [
              { organizationId: 'organization-1', status: 'active' },
            ],
          },
        });
        Object.assign(state.plan!, {
          governanceCoordinatorUserIds: ['active-coordinator'],
        });
      },
      (state: CommandState) => {
        Object.assign(state.members[0]!.user, { status: 'active' });
        Object.assign(state.plan!, {
          governanceCoordinatorUserIds: ['member-1'],
        });
      },
    ],
    [
      'GOVERNANCE_COORDINATOR_INVALID',
      (state: CommandState) =>
        Object.assign(state.plan!, {
          governanceCoordinatorUserIds: ['not-an-active-member'],
        }),
      (state: CommandState) =>
        Object.assign(state.plan!, {
          governanceCoordinatorUserIds: ['member-1'],
        }),
    ],
    [
      'RESPONSIBILITY_NOTES_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { responsibilityNotes: ' ' }),
      (state: CommandState) =>
        Object.assign(state.plan!, {
          responsibilityNotes: 'Principal owns delivery.',
        }),
    ],
    [
      'PROJECT_DEPARTMENT_MISSING',
      (state: CommandState) => (state.departments = []),
      (state: CommandState) =>
        state.departments.push({
          id: 'project-department-1',
          organizationId: 'organization-1',
          departmentId: 'department-1',
        }),
    ],
  ] as const)(
    'clears %s from Assignment blockers after persisted governance is corrected',
    async (code, makeInvalid, correct) => {
      const { prisma, state } = assigned();
      makeInvalid(state);

      const blocked = await service(prisma).completeStep(
        editor(),
        'project-1',
        'ASSIGNMENT',
      );
      expect(blocked).toMatchObject({
        completed: false,
        blockers: expect.arrayContaining([expect.objectContaining({ code })]),
      });

      correct(state);
      await expect(
        service(prisma).completeStep(editor(), 'project-1', 'ASSIGNMENT'),
      ).resolves.toMatchObject({ completed: true, blockers: [] });
    },
  );

  it('throws a structured optimistic conflict without mutation', async () => {
    const { prisma, state, tx } = assigned();
    tx.projectStageStep.updateMany.mockResolvedValueOnce({ count: 0 });

    const error = await service(prisma)
      .completeStep(editor(), 'project-1', 'ASSIGNMENT')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      message: 'Assignment step changed',
      code: 'OPTIMISTIC_CONFLICT',
      entityType: 'ProjectStageStep',
      entityId: 'step-assignment',
      route: '/projects/project-1/stage-1/initiation',
      remediation: 'Refresh the Project and try again.',
    });
    expect(state.steps.get('ASSIGNMENT')).toMatchObject({
      status: 'IN_PROGRESS',
      version: 3,
    });
    expect(state.activities).toEqual([]);
  });

  it('rolls back completion when Activity creation fails', async () => {
    const { prisma, state, tx } = assigned();
    tx.activity.create.mockRejectedValueOnce(new Error('activity unavailable'));

    await expect(
      service(prisma).completeStep(editor(), 'project-1', 'ASSIGNMENT'),
    ).rejects.toThrow('activity unavailable');
    expect(state.steps.get('ASSIGNMENT')).toMatchObject({
      status: 'IN_PROGRESS',
      version: 3,
    });
    expect(state.activities).toEqual([]);
  });
});

describe('ProjectStageOneService survey completion', () => {
  const editor = () => actor('owner-1', ['project.update']);
  const surveyReady = () => {
    const command = commandPrisma();
    command.state.plan = {
      projectId: 'project-1',
      siteConstraints:
        'Restricted lift access; delivery after 18:00; protect finished floors.',
    };
    command.state.steps.set('SURVEY', {
      id: 'step-survey',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      step: 'SURVEY',
      ownerUserId: 'member-1',
      status: 'IN_PROGRESS',
      notApplicableReason: null,
      notApplicableBy: null,
      notApplicableAt: null,
      version: 5,
    });
    return command;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it.each([
    [
      'SURVEY_SCHEDULE_MISSING',
      (state: CommandState) =>
        Object.assign(state.surveys[0]!, { scheduledAt: null }),
    ],
    [
      'SURVEY_RECORD_MISSING',
      (state: CommandState) =>
        Object.assign(state.surveys[0]!, { surveyedAt: null }),
    ],
    [
      'SURVEY_OWNER_MISSING',
      (state: CommandState) => {
        Object.assign(state.steps.get('SURVEY')!, { ownerUserId: null });
        Object.assign(state.project, {
          projectManagerId: null,
          projectManager: null,
        });
      },
    ],
    [
      'SURVEY_OWNER_MISSING',
      (state: CommandState) => {
        Object.assign(state.members[0]!.user, { status: 'disabled' });
        Object.assign(state.project, {
          projectManagerId: null,
          projectManager: null,
        });
      },
    ],
    [
      'SURVEY_OWNER_MISSING',
      (state: CommandState) => {
        Object.assign(state.members[0]!, { projectId: 'project-2' });
        Object.assign(state.project, {
          projectManagerId: null,
          projectManager: null,
        });
      },
    ],
    [
      'SURVEY_OWNER_MISSING',
      (state: CommandState) => {
        Object.assign(state.members[0]!.user.organizationMembers[0]!, {
          organizationId: 'organization-2',
        });
        Object.assign(state.project, {
          projectManagerId: null,
          projectManager: null,
        });
      },
    ],
    [
      'SITE_CONSTRAINTS_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { siteConstraints: ' ' }),
    ],
    [
      'SURVEY_EVIDENCE_MISSING',
      (state: CommandState) => (state.attachments = []),
    ],
    [
      'SURVEY_EVIDENCE_MISSING',
      (state: CommandState) =>
        Object.assign(state.attachments[0]!, {
          entityId: 'project-2',
          projectId: 'project-2',
        }),
    ],
    [
      'SURVEY_EVIDENCE_MISSING',
      (state: CommandState) =>
        Object.assign(state.attachments[0]!.fileAsset, {
          organizationId: 'organization-2',
        }),
    ],
    [
      'SURVEY_EVIDENCE_MISSING',
      (state: CommandState) =>
        Object.assign(state.attachments[0]!.fileAsset, { category: 'DRAWING' }),
    ],
    [
      'PROJECT_TYPE_MISSING',
      (state: CommandState) =>
        Object.assign(state.project, { projectType: 'TURNKEY' }),
    ],
    [
      'SURVEY_NOT_REQUIRED',
      (state: CommandState) =>
        Object.assign(state.project, { projectType: 'PRODUCT_SUPPLY' }),
    ],
    [
      'SURVEY_EVIDENCE_MISSING',
      (state: CommandState) =>
        Object.assign(state.attachments[0]!.fileAsset, {
          deletedAt: new Date('2026-08-11T00:00:00.000Z'),
        }),
    ],
  ] as const)(
    'returns structured %s without partial completion',
    async (code, makeInvalid) => {
      const { prisma, state } = surveyReady();
      makeInvalid(state);

      const result = await service(prisma).completeStep(
        editor(),
        'project-1',
        'SURVEY',
      );

      expect(result).toEqual({
        completed: false,
        step: 'SURVEY',
        blockers: expect.arrayContaining([
          expect.objectContaining({
            code,
            entityType: 'Project',
            entityId: 'project-1',
            route: '/projects/project-1/stage-1/survey',
            remediation: expect.any(String),
          }),
        ]),
      });
      expect(state.steps.get('SURVEY')).toMatchObject({
        status: 'IN_PROGRESS',
        version: 5,
      });
      expect(state.activities).toEqual([]);
    },
  );

  it('falls back to an active same-organization Project Manager when the step owner is invalid', async () => {
    const { prisma, state } = surveyReady();
    Object.assign(state.members[0]!.user, { status: 'disabled' });

    const result = await service(prisma).completeStep(
      editor(),
      'project-1',
      'SURVEY',
    );

    expect(result).toMatchObject({
      completed: true,
      step: 'SURVEY',
      status: 'DONE',
    });
  });

  it('requires project.update and Project scope', async () => {
    const forbidden = surveyReady();
    await expect(
      service(forbidden.prisma).completeStep(
        actor('owner-1'),
        'project-1',
        'SURVEY',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const inaccessible = surveyReady();
    inaccessible.tx.project.findFirst.mockResolvedValueOnce(null);
    await expect(
      service(inaccessible.prisma).completeStep(
        editor(),
        'project-2',
        'SURVEY',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atomically completes SURVEY with authorized Project evidence and one direct Activity', async () => {
    const { prisma, state, tx } = surveyReady();

    const result = await service(prisma).completeStep(
      editor(),
      'project-1',
      'SURVEY',
    );

    expect(result).toEqual({
      completed: true,
      alreadyComplete: false,
      step: 'SURVEY',
      status: 'DONE',
      version: 6,
    });
    expect(state.steps.get('SURVEY')).toMatchObject({
      status: 'DONE',
      version: 6,
    });
    expect(tx.project.findFirst.mock.calls[0]![0].select.attachments).toEqual({
      where: {
        entityType: 'Project',
        entityId: 'project-1',
        projectId: 'project-1',
        fileAsset: {
          organizationId: 'organization-1',
          category: 'SURVEY',
          deletedAt: null,
        },
      },
      select: { id: true },
      take: 1,
    });
    expect(state.activities).toEqual([
      {
        organizationId: 'organization-1',
        actorId: 'owner-1',
        event: 'PROJECT_STAGE_ONE_SURVEY_COMPLETED',
        entityType: 'Project',
        entityId: 'project-1',
        metadata: {
          stage: 'STAGE_ONE',
          step: 'SURVEY',
          route: '/projects/project-1/stage-1/survey',
        },
      },
    ]);
  });

  it('returns completed before mutable survey prerequisites on retry', async () => {
    const { prisma, state } = surveyReady();
    const commands = service(prisma);
    await commands.completeStep(editor(), 'project-1', 'SURVEY');
    state.surveys = [];
    state.attachments = [];
    state.plan!.siteConstraints = null;
    Object.assign(state.project, {
      projectManagerId: null,
      projectManager: null,
    });

    const retried = await commands.completeStep(
      editor(),
      'project-1',
      'SURVEY',
    );

    expect(retried).toEqual({
      completed: true,
      alreadyComplete: true,
      step: 'SURVEY',
      status: 'DONE',
      version: 6,
    });
    expect(state.activities).toHaveLength(1);
  });

  it('rolls back survey completion when Activity creation fails', async () => {
    const { prisma, state, tx } = surveyReady();
    tx.activity.create.mockRejectedValueOnce(new Error('activity unavailable'));

    await expect(
      service(prisma).completeStep(editor(), 'project-1', 'SURVEY'),
    ).rejects.toThrow('activity unavailable');
    expect(state.steps.get('SURVEY')).toMatchObject({
      status: 'IN_PROGRESS',
      version: 5,
    });
    expect(state.activities).toEqual([]);
  });

  it('requires the narrow permission and a trimmed not-applicable reason', async () => {
    const forbidden = surveyReady();
    await expect(
      service(forbidden.prisma).markSurveyNotApplicable(
        editor(),
        'project-1',
        'Client supplied drawings.',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const blank = surveyReady();
    await expect(
      service(blank.prisma).markSurveyNotApplicable(
        actor('owner-1', ['project.survey.not_applicable']),
        'project-1',
        '   ',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(blank.tx.project.findFirst).toHaveBeenCalledOnce();

    const inaccessible = surveyReady();
    inaccessible.tx.project.findFirst.mockResolvedValueOnce(null);
    await expect(
      service(inaccessible.prisma).markSurveyNotApplicable(
        actor('owner-1', ['project.survey.not_applicable']),
        'project-2',
        '   ',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('audits a permissioned required-survey not-applicable decision once', async () => {
    const { prisma, state } = surveyReady();
    const commands = service(prisma);
    const approver = actor('owner-1', ['project.survey.not_applicable']);

    const result = await commands.markSurveyNotApplicable(
      approver,
      'project-1',
      '  Site access denied by customer.  ',
    );

    expect(result).toEqual({
      completed: true,
      alreadyComplete: false,
      step: 'SURVEY',
      status: 'DONE',
      notApplicable: true,
      version: 6,
    });
    expect(state.steps.get('SURVEY')).toMatchObject({
      status: 'DONE',
      notApplicableReason: 'Site access denied by customer.',
      notApplicableBy: 'owner-1',
      notApplicableAt: new Date('2026-08-12T12:00:00.000Z'),
      version: 6,
    });
    expect(state.activities).toEqual([
      {
        organizationId: 'organization-1',
        actorId: 'owner-1',
        event: 'PROJECT_STAGE_ONE_SURVEY_NOT_APPLICABLE',
        entityType: 'Project',
        entityId: 'project-1',
        metadata: {
          stage: 'STAGE_ONE',
          step: 'SURVEY',
          route: '/projects/project-1/stage-1/survey',
        },
      },
    ]);

    state.surveys = [];
    state.attachments = [];
    const retried = await commands.markSurveyNotApplicable(
      approver,
      'project-1',
      '   ',
    );
    expect(retried).toEqual({
      completed: true,
      alreadyComplete: true,
      step: 'SURVEY',
      status: 'DONE',
      notApplicable: true,
      version: 6,
    });
    expect(state.activities).toHaveLength(1);
  });
});

describe('ProjectStageOneService proposal completion', () => {
  const editor = () => actor('owner-1', ['project.update']);
  const proposalReady = () => {
    const command = commandPrisma();
    command.state.plan = {
      projectId: 'project-1',
      scopeNotes: 'Apartment fit-out across the active Project location.',
      proposalBaseline: 'Revision 1 approved for planning.',
      proposalMilestones: [{ name: 'Handover', dueDate: '2026-12-01' }],
      proposalWbs: [{ code: '1.0', name: 'Apartment fit-out' }],
      riskNotes: 'Restricted lift access may affect delivery.',
      resourceNotes: 'One PM, one designer, and two installers.',
    };
    command.state.steps.set('PROPOSAL', {
      id: 'step-proposal',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      step: 'PROPOSAL',
      status: 'IN_PROGRESS',
      version: 2,
    });
    return command;
  };

  it.each([
    [
      'PROJECT_SCOPE_MISSING',
      (state: CommandState) =>
        Object.assign(state.project, { description: ' ' }),
    ],
    [
      'PLAN_SCOPE_MISSING',
      (state: CommandState) => Object.assign(state.plan!, { scopeNotes: '' }),
    ],
    [
      'PROPOSAL_BASELINE_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { proposalBaseline: ' ' }),
    ],
    [
      'PROPOSAL_MILESTONES_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { proposalMilestones: [] }),
    ],
    [
      'PROPOSAL_WBS_MISSING',
      (state: CommandState) => Object.assign(state.plan!, { proposalWbs: [] }),
    ],
    [
      'PROPOSAL_RISK_NOTES_MISSING',
      (state: CommandState) => Object.assign(state.plan!, { riskNotes: null }),
    ],
    [
      'PROPOSAL_RESOURCE_NOTES_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { resourceNotes: ' ' }),
    ],
    [
      'PROJECT_LOCATION_MISSING',
      (state: CommandState) => (state.locations = []),
    ],
  ] as const)(
    'returns structured %s without partial completion',
    async (code, makeInvalid) => {
      const { prisma, state } = proposalReady();
      makeInvalid(state);

      const result = await service(prisma).completeStep(
        editor(),
        'project-1',
        'PROPOSAL',
      );

      expect(result).toEqual({
        completed: false,
        step: 'PROPOSAL',
        blockers: expect.arrayContaining([
          expect.objectContaining({
            code,
            entityType: 'Project',
            entityId: 'project-1',
            route: '/projects/project-1/stage-1/requirements',
            remediation: expect.any(String),
          }),
        ]),
      });
      expect(state.steps.get('PROPOSAL')).toMatchObject({
        status: 'IN_PROGRESS',
        version: 2,
      });
      expect(state.activities).toEqual([]);
    },
  );

  it('accepts an explicit no-location rationale when there is no active location', async () => {
    const { prisma, state } = proposalReady();
    state.locations = [];
    state.plan!.scopeNotes =
      'No location: this Project is limited to remote design advisory work.';

    await expect(
      service(prisma).completeStep(editor(), 'project-1', 'PROPOSAL'),
    ).resolves.toMatchObject({ completed: true, status: 'DONE' });
  });

  it('ignores inactive and foreign Project locations', async () => {
    const { prisma, state } = proposalReady();
    Object.assign(state.locations[0]!, { active: false });
    state.locations.push({
      id: 'location-2',
      projectId: 'project-2',
      name: 'Other project',
      active: true,
    });

    const result = await service(prisma).completeStep(
      editor(),
      'project-1',
      'PROPOSAL',
    );

    expect(result).toMatchObject({
      completed: false,
      blockers: [expect.objectContaining({ code: 'PROJECT_LOCATION_MISSING' })],
    });
  });

  it('requires project.update and scoped Project visibility', async () => {
    const forbidden = proposalReady();
    await expect(
      service(forbidden.prisma).completeStep(
        actor('owner-1'),
        'project-1',
        'PROPOSAL',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const inaccessible = proposalReady();
    inaccessible.tx.project.findFirst.mockResolvedValueOnce(null);
    await expect(
      service(inaccessible.prisma).completeStep(
        editor(),
        'project-2',
        'PROPOSAL',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('completes only PROPOSAL with CAS and one direct Activity without domain writes', async () => {
    const { prisma, state, tx } = proposalReady();

    const result = await service(prisma).completeStep(
      editor(),
      'project-1',
      'PROPOSAL',
    );

    expect(result).toEqual({
      completed: true,
      alreadyComplete: false,
      step: 'PROPOSAL',
      status: 'DONE',
      version: 3,
    });
    expect(state.steps.get('PROPOSAL')).toMatchObject({
      status: 'DONE',
      version: 3,
    });
    expect(state.activities).toEqual([
      {
        organizationId: 'organization-1',
        actorId: 'owner-1',
        event: 'PROJECT_STAGE_ONE_PROPOSAL_COMPLETED',
        entityType: 'Project',
        entityId: 'project-1',
        metadata: {
          stage: 'STAGE_ONE',
          step: 'PROPOSAL',
          route: '/projects/project-1/stage-1/requirements',
        },
      },
    ]);
    expect(tx.projectStageOnePlan.upsert).not.toHaveBeenCalled();
    expect(tx.estimate.create).not.toHaveBeenCalled();
    expect(tx.estimate.update).not.toHaveBeenCalled();
    expect(tx.projectProductLine.create).not.toHaveBeenCalled();
    expect(tx.projectProductLine.update).not.toHaveBeenCalled();
  });

  it('returns DONE before mutable proposal validation on retry', async () => {
    const { prisma, state } = proposalReady();
    const commands = service(prisma);
    await commands.completeStep(editor(), 'project-1', 'PROPOSAL');
    Object.assign(state.project, { description: null });
    state.plan = null;
    state.locations = [];

    const retried = await commands.completeStep(
      editor(),
      'project-1',
      'PROPOSAL',
    );

    expect(retried).toEqual({
      completed: true,
      alreadyComplete: true,
      step: 'PROPOSAL',
      status: 'DONE',
      version: 3,
    });
    expect(state.activities).toHaveLength(1);
  });

  it('reports proposal CAS drift without mutation', async () => {
    const { prisma, state, tx } = proposalReady();
    tx.projectStageStep.updateMany.mockResolvedValueOnce({ count: 0 });

    const error = await service(prisma)
      .completeStep(editor(), 'project-1', 'PROPOSAL')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'OPTIMISTIC_CONFLICT',
      entityType: 'ProjectStageStep',
      entityId: 'step-proposal',
      route: '/projects/project-1/stage-1/requirements',
    });
    expect(state.steps.get('PROPOSAL')).toMatchObject({
      status: 'IN_PROGRESS',
      version: 2,
    });
    expect(state.activities).toEqual([]);
  });

  it('rolls back proposal completion when Activity creation fails', async () => {
    const { prisma, state, tx } = proposalReady();
    tx.activity.create.mockRejectedValueOnce(new Error('activity unavailable'));

    await expect(
      service(prisma).completeStep(editor(), 'project-1', 'PROPOSAL'),
    ).rejects.toThrow('activity unavailable');
    expect(state.steps.get('PROPOSAL')).toMatchObject({
      status: 'IN_PROGRESS',
      version: 2,
    });
    expect(state.activities).toEqual([]);
  });
});

describe('ProjectStageOneService preliminary-finance completion', () => {
  const financier = () =>
    actor('owner-1', [
      'project.update',
      'project.stage1.finance.read',
      'project.stage1.finance.manage',
    ]);
  const financeReady = (projectType = 'DESIGN_AND_BUILD') => {
    const command = commandPrisma(projectType);
    command.state.plan = {
      projectId: 'project-1',
      preliminaryRevenue: new Prisma.Decimal('1000.10'),
      preliminaryCost: new Prisma.Decimal('800.05'),
      preliminaryMargin: new Prisma.Decimal('200.05'),
      preliminaryCurrency: 'THB',
      preliminaryFinancialPlanDate: new Date('2026-08-18T09:00:00.000Z'),
    };
    command.state.steps.set('FINANCIAL_PLANNING', {
      id: 'step-finance',
      projectId: 'project-1',
      stage: 'STAGE_ONE',
      step: 'FINANCIAL_PLANNING',
      status: 'IN_PROGRESS',
      version: 7,
    });
    return command;
  };

  it.each([
    [
      'PRELIMINARY_REVENUE_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { preliminaryRevenue: null }),
    ],
    [
      'PRELIMINARY_COST_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { preliminaryCost: null }),
    ],
    [
      'PRELIMINARY_CURRENCY_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, { preliminaryCurrency: 'thb' }),
    ],
    [
      'PRELIMINARY_FINANCIAL_PLAN_DATE_MISSING',
      (state: CommandState) =>
        Object.assign(state.plan!, {
          preliminaryFinancialPlanDate: new Date('invalid'),
        }),
    ],
    [
      'PRELIMINARY_MARGIN_MISMATCH',
      (state: CommandState) =>
        Object.assign(state.plan!, {
          preliminaryMargin: new Prisma.Decimal('200.04'),
        }),
    ],
  ] as const)(
    'returns hidden structured %s without partial completion',
    async (code, makeInvalid) => {
      const { prisma, state } = financeReady();
      makeInvalid(state);

      const result = await service(prisma).completeStep(
        financier(),
        'project-1',
        'FINANCIAL_PLANNING',
      );

      expect(result).toEqual({
        completed: false,
        step: 'FINANCIAL_PLANNING',
        blockers: expect.arrayContaining([
          expect.objectContaining({
            code,
            entityType: 'Project',
            entityId: 'project-1',
            route: '/projects/project-1/stage-1/requirements#finance',
            remediation: expect.any(String),
          }),
        ]),
      });
      expect(JSON.stringify(result)).not.toMatch(
        /preliminary(Revenue|Cost|Margin|Currency|FinancialPlanDate)/,
      );
      expect(state.steps.get('FINANCIAL_PLANNING')).toMatchObject({
        status: 'IN_PROGRESS',
        version: 7,
      });
      expect(state.activities).toEqual([]);
    },
  );

  it.each([
    [[]],
    [['project.update']],
    [['project.stage1.finance.manage']],
    [['project.update', 'project.stage1.finance.manage']],
    [['project.update', 'estimate.read', 'financial_margin.read']],
  ] as const)(
    'requires update and narrow finance permission without revealing values: %j',
    async (permissions) => {
      const { prisma, state } = financeReady();

      const error = await service(prisma)
        .completeStep(
          actor('owner-1', [...permissions]),
          'project-1',
          'FINANCIAL_PLANNING',
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(
        JSON.stringify((error as ForbiddenException).getResponse()),
      ).not.toMatch(/1000|800|200|THB|preliminary/i);
      expect(state.activities).toEqual([]);
    },
  );

  it('requires scoped Project visibility after permission checks', async () => {
    const inaccessible = financeReady();
    inaccessible.tx.project.findFirst.mockResolvedValueOnce(null);

    await expect(
      service(inaccessible.prisma).completeStep(
        financier(),
        'project-2',
        'FINANCIAL_PLANNING',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns persisted DONE for canonically inapplicable finance', async () => {
    const { prisma, state } = commandPrisma('INTERNAL');
    const commands = service(prisma);
    await commands.initialize(financier(), 'project-1');

    const result = await commands.completeStep(
      financier(),
      'project-1',
      'FINANCIAL_PLANNING',
    );

    expect(result).toEqual({
      completed: true,
      alreadyComplete: true,
      step: 'FINANCIAL_PLANNING',
      status: 'DONE',
      version: 1,
    });
    expect(state.activities).toEqual([
      expect.objectContaining({ event: 'PROJECT_STAGE_ONE_INITIALIZED' }),
    ]);
  });

  it.each([
    [
      'PROJECT_TYPE_MISSING',
      'TURNKEY',
      '/projects/project-1/stage-1/initiation',
    ],
    [
      'FINANCIAL_ROUTING_STALE',
      'INTERNAL',
      '/projects/project-1/stage-1/initiation',
    ],
  ] as const)(
    'returns canonical-routing blocker %s',
    async (code, projectType, route) => {
      const { prisma, state } = financeReady(projectType);

      const result = await service(prisma).completeStep(
        financier(),
        'project-1',
        'FINANCIAL_PLANNING',
      );

      expect(result).toMatchObject({
        completed: false,
        step: 'FINANCIAL_PLANNING',
        blockers: [expect.objectContaining({ code, route })],
      });
      expect(state.activities).toEqual([]);
    },
  );

  it('compares margin with Decimal precision and completes without domain writes', async () => {
    const { prisma, state, tx } = financeReady();
    Object.assign(state.plan!, {
      preliminaryRevenue: new Prisma.Decimal('0.30'),
      preliminaryCost: new Prisma.Decimal('0.10'),
      preliminaryMargin: new Prisma.Decimal('0.20'),
    });

    const result = await service(prisma).completeStep(
      financier(),
      'project-1',
      'FINANCIAL_PLANNING',
    );

    expect(result).toEqual({
      completed: true,
      alreadyComplete: false,
      step: 'FINANCIAL_PLANNING',
      status: 'DONE',
      version: 8,
    });
    expect(result).not.toHaveProperty('preliminaryRevenue');
    expect(result).not.toHaveProperty('preliminaryCost');
    expect(result).not.toHaveProperty('preliminaryMargin');
    expect(state.activities).toEqual([
      {
        organizationId: 'organization-1',
        actorId: 'owner-1',
        event: 'PROJECT_STAGE_ONE_FINANCIAL_PLANNING_COMPLETED',
        entityType: 'Project',
        entityId: 'project-1',
        metadata: {
          stage: 'STAGE_ONE',
          step: 'FINANCIAL_PLANNING',
          route: '/projects/project-1/stage-1/requirements#finance',
        },
      },
    ]);
    expect(tx.projectStageOnePlan.upsert).not.toHaveBeenCalled();
    expect(tx.estimate.create).not.toHaveBeenCalled();
    expect(tx.estimate.update).not.toHaveBeenCalled();
    expect(tx.projectProductLine.create).not.toHaveBeenCalled();
    expect(tx.projectProductLine.update).not.toHaveBeenCalled();
  });

  it('completes exact margin math above Number.MAX_SAFE_INTEGER', async () => {
    const { prisma, state } = financeReady();
    const commands = service(prisma);
    await commands.updatePlan(financier(), 'project-1', {
      preliminaryRevenue: '9007199254740993.01',
      preliminaryCost: '0.01',
      preliminaryMargin: '9007199254740993.00',
    });

    const result = await commands.completeStep(
      financier(),
      'project-1',
      'FINANCIAL_PLANNING',
    );

    expect(result).toMatchObject({ completed: true, status: 'DONE' });
    expect(String(state.plan!.preliminaryRevenue)).toBe('9007199254740993.01');
    expect(String(state.plan!.preliminaryMargin)).toBe('9007199254740993');
  });

  it('returns DONE before mutable finance validation on retry', async () => {
    const { prisma, state } = financeReady();
    const commands = service(prisma);
    await commands.completeStep(financier(), 'project-1', 'FINANCIAL_PLANNING');
    state.plan = null;

    const retried = await commands.completeStep(
      financier(),
      'project-1',
      'FINANCIAL_PLANNING',
    );

    expect(retried).toEqual({
      completed: true,
      alreadyComplete: true,
      step: 'FINANCIAL_PLANNING',
      status: 'DONE',
      version: 8,
    });
    expect(state.activities).toHaveLength(1);
  });

  it('reports finance CAS drift without exposing values or mutation', async () => {
    const { prisma, state, tx } = financeReady();
    tx.projectStageStep.updateMany.mockResolvedValueOnce({ count: 0 });

    const error = await service(prisma)
      .completeStep(financier(), 'project-1', 'FINANCIAL_PLANNING')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'OPTIMISTIC_CONFLICT',
      entityType: 'ProjectStageStep',
      entityId: 'step-finance',
      route: '/projects/project-1/stage-1/requirements#finance',
    });
    expect(
      JSON.stringify((error as ConflictException).getResponse()),
    ).not.toMatch(/1000|800|200|THB|preliminary/i);
    expect(state.steps.get('FINANCIAL_PLANNING')).toMatchObject({
      status: 'IN_PROGRESS',
      version: 7,
    });
    expect(state.activities).toEqual([]);
  });

  it('rolls back finance completion when Activity creation fails', async () => {
    const { prisma, state, tx } = financeReady();
    tx.activity.create.mockRejectedValueOnce(new Error('activity unavailable'));

    await expect(
      service(prisma).completeStep(
        financier(),
        'project-1',
        'FINANCIAL_PLANNING',
      ),
    ).rejects.toThrow('activity unavailable');
    expect(state.steps.get('FINANCIAL_PLANNING')).toMatchObject({
      status: 'IN_PROGRESS',
      version: 7,
    });
    expect(state.activities).toEqual([]);
  });
});

describe('ProjectStageOneService reads', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it.each(['owner-1', 'pm-1', 'member-1'])(
    'returns initiation to scoped Project actor %s',
    async (userId) => {
      const prisma = prismaReturning(initiationProject);

      const result = await service(prisma).getInitiation(
        actor(userId, ['project.read', 'project.stage1.finance.read']),
        'project-1',
      );

      expect(result.project).toMatchObject({
        id: 'project-1',
        code: 'PRJ-001',
        projectManagerId: 'pm-1',
        members: [{ userId: 'member-1' }],
        departments: [{ departmentId: 'department-1' }],
      });
      expect(result.routing).toMatchObject({
        projectType: 'DESIGN_AND_BUILD',
        requiresSurvey: true,
        requiresPreliminaryFinance: true,
      });
      expect(prisma.project.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'project-1',
            organizationId: 'organization-1',
            deletedAt: null,
            OR: [
              { projectOwnerId: userId },
              { projectManagerId: userId },
              { members: { some: { userId } } },
            ],
          }),
        }),
      );
    },
  );

  it('returns metadata-free not-found for a non-member and another Project id', async () => {
    const prisma = prismaReturning(null);
    const reads = service(prisma);

    for (const [currentActor, projectId] of [
      [actor('outsider-1'), 'project-1'],
      [actor('member-1'), 'project-2'],
    ] as const) {
      const error = await reads
        .getInitiation(currentActor, projectId)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual({
        message: 'Project not found',
        error: 'Not Found',
        statusCode: 404,
      });
    }
  });

  it('omits unpermitted financial columns from the query and response', async () => {
    const prisma = prismaReturning(initiationProject);

    const result = await service(prisma).getInitiation(
      actor('member-1'),
      'project-1',
    );

    const select = vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]
      ?.select as Record<string, unknown>;
    const planSelect = (select.stageOnePlan as { select: object }).select;
    expect(select).not.toHaveProperty('estimatedValue');
    expect(select).not.toHaveProperty('contractedValue');
    expect(planSelect).not.toHaveProperty('preliminaryRevenue');
    expect(planSelect).not.toHaveProperty('preliminaryCost');
    expect(planSelect).not.toHaveProperty('preliminaryMargin');
    expect(planSelect).not.toHaveProperty('preliminaryCurrency');
    expect(planSelect).not.toHaveProperty('preliminaryFinancialPlanDate');
    expect(result.project).not.toHaveProperty('estimatedValue');
    expect(result.project).not.toHaveProperty('contractedValue');
    for (const key of [
      'plannedFinancialPlanAt',
      'preliminaryRevenue',
      'preliminaryCost',
      'preliminaryMargin',
      'preliminaryCurrency',
      'preliminaryFinancialPlanDate',
    ])
      expect(result.project.stageOnePlan).not.toHaveProperty(key);

    const summaryPrisma = prismaReturning(summaryProject);
    const summary = await service(summaryPrisma).getSummary(
      actor('member-1'),
      'project-1',
    );
    const summarySelect = vi.mocked(summaryPrisma.project.findFirst).mock
      .calls[0]?.[0]?.select as Record<string, unknown>;
    const summaryPlanSelect = (summarySelect.stageOnePlan as { select: object })
      .select;
    expect(
      (summarySelect.requiredDocuments as { where: object }).where,
    ).not.toHaveProperty('documentType');
    for (const key of ['estimatedValue', 'contractedValue']) {
      expect(summarySelect).not.toHaveProperty(key);
      expect(summary.project).not.toHaveProperty(key);
    }
    for (const key of [
      'preliminaryRevenue',
      'preliminaryCost',
      'preliminaryMargin',
      'preliminaryCurrency',
      'preliminaryFinancialPlanDate',
    ]) {
      expect(summaryPlanSelect).not.toHaveProperty(key);
      expect(summary.project.stageOnePlan).not.toHaveProperty(key);
    }
    expect(summary.steps).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: 'FINANCIAL_PLANNING' }),
      ]),
    );
    expect(summary.readiness.cards).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'FINANCE' })]),
    );
    expect(summary.redFlags).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FINANCIAL_PLAN_MISSING_WHEN_REQUIRED',
        }),
      ]),
    );
    expect(JSON.stringify(summary)).not.toContain('FINANCIAL');
  });

  it('does not borrow Stage 1 finance routing visibility from another Project', async () => {
    const scopedActor = {
      ...actor('cross-project-finance', [
        'project.read',
        'project.stage1.finance.read',
      ]),
      permissionSources: [
        {
          permission: 'project.read',
          roleId: 'reader-role',
          roleName: 'Reader',
          scopeType: 'ORGANIZATION' as const,
          departmentId: null,
        },
        {
          permission: 'project.stage1.finance.read',
          roleId: 'finance-role',
          roleName: 'Finance',
          scopeType: 'SELF' as const,
          departmentId: null,
        },
      ],
    };

    for (const [read, project] of [
      ['initiation', initiationProject],
      ['summary', summaryProject],
    ] as const) {
      const prisma = prismaReturning(project);
      const result =
        read === 'initiation'
          ? await service(prisma).getInitiation(scopedActor, 'project-1')
          : await service(prisma).getSummary(scopedActor, 'project-1');

      expect(result.routing).not.toHaveProperty('requiresPreliminaryFinance');
      expect(result.routing?.steps).not.toContain('FINANCIAL_PLANNING');
      expect(result.routing?.documentTypes).not.toContain(
        'PRELIMINARY_FINANCIAL_PLAN',
      );
    }
  });

  it('selects each financial field only with its current narrow permission', async () => {
    const estimatePrisma = prismaReturning({
      ...initiationProject,
      estimatedValue: new Prisma.Decimal('1000.00'),
      stageOnePlan: {
        ...initiationProject.stageOnePlan,
        preliminaryRevenue: new Prisma.Decimal('900.00'),
        preliminaryCurrency: 'THB',
        preliminaryFinancialPlanDate: new Date('2026-08-18T09:00:00.000Z'),
      },
    });
    const estimateResult = await service(estimatePrisma).getInitiation(
      actor('member-1', ['estimate.read']),
      'project-1',
    );
    const estimateSelect = vi.mocked(estimatePrisma.project.findFirst).mock
      .calls[0]?.[0]?.select as Record<string, unknown>;
    const estimatePlanSelect = (
      estimateSelect.stageOnePlan as { select: object }
    ).select;

    expect(estimateSelect).toHaveProperty('estimatedValue', true);
    expect(estimateSelect).not.toHaveProperty('contractedValue');
    expect(estimatePlanSelect).not.toHaveProperty('preliminaryRevenue');
    expect(estimatePlanSelect).not.toHaveProperty('preliminaryCost');
    expect(estimatePlanSelect).not.toHaveProperty('preliminaryMargin');
    expect(estimateResult.project).toMatchObject({
      estimatedValue: new Prisma.Decimal('1000.00'),
    });

    const fullPrisma = prismaReturning({
      ...initiationProject,
      estimatedValue: new Prisma.Decimal('1000.00'),
      contractedValue: new Prisma.Decimal('800.00'),
      stageOnePlan: {
        ...initiationProject.stageOnePlan,
        preliminaryRevenue: new Prisma.Decimal('900.00'),
        preliminaryCost: new Prisma.Decimal('700.00'),
        preliminaryMargin: new Prisma.Decimal('200.00'),
        preliminaryCurrency: 'THB',
        preliminaryFinancialPlanDate: new Date('2026-08-18T09:00:00.000Z'),
      },
    });
    const fullResult = await service(fullPrisma).getInitiation(
      actor('member-1', [
        'estimate.read',
        'contract.read',
        'project.stage1.finance.read',
      ]),
      'project-1',
    );

    expect(fullResult.project).toMatchObject({
      estimatedValue: new Prisma.Decimal('1000.00'),
      contractedValue: new Prisma.Decimal('800.00'),
      stageOnePlan: {
        preliminaryRevenue: new Prisma.Decimal('900.00'),
        preliminaryCost: new Prisma.Decimal('700.00'),
        preliminaryMargin: new Prisma.Decimal('200.00'),
      },
    });
  });

  it('selects preliminary finance only with Stage 1 finance read permission', async () => {
    const prisma = prismaReturning(initiationProject);

    await service(prisma).getInitiation(
      actor('member-1', ['project.stage1.finance.read']),
      'project-1',
    );

    const select = vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]
      ?.select as Record<string, unknown>;
    expect(select.entryStage).toBe(true);
    expect((select.stageOnePlan as { select: object }).select).toEqual(
      expect.objectContaining({
        preliminaryRevenue: true,
        preliminaryCost: true,
        preliminaryMargin: true,
        preliminaryCurrency: true,
        preliminaryFinancialPlanDate: true,
      }),
    );
  });

  it('counts only active users with an active organization membership', async () => {
    const prisma = prismaReturning({
      ...summaryProject,
      _count: { ...summaryProject._count, members: 0 },
    });

    const result = await service(prisma).getSummary(
      actor('member-1', ['project.stage1.finance.read']),
      'project-1',
    );

    const select = vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]
      ?.select;
    expect(select?._count).toEqual({
      select: {
        members: {
          where: {
            user: {
              status: 'active',
              organizationMembers: {
                some: {
                  organizationId: 'organization-1',
                  status: 'active',
                },
              },
            },
          },
        },
        stageApprovals: { where: { stage: 'STAGE_ONE' } },
      },
    });
    expect(select).not.toHaveProperty('members');
    expect(prisma.projectMember.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        projectId: 'project-1',
        userId: { in: ['member-1'] },
        user: {
          status: 'active',
          organizationMembers: {
            some: { organizationId: 'organization-1', status: 'active' },
          },
        },
      },
      select: { userId: true },
    });
    expect(result.redFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PROJECT_MEMBER_MISSING' }),
      ]),
    );
  });

  it('derives requirement overdue from the unfinished proposal step due date', async () => {
    const dueDate = new Date('2026-07-31T12:00:00.000Z');
    const prisma = prismaReturning({
      ...summaryProject,
      stageSteps: [
        ...summaryProject.stageSteps,
        {
          id: 'step-proposal',
          step: 'PROPOSAL',
          ownerUserId: 'pm-1',
          dueDate,
          status: 'IN_PROGRESS',
          notApplicableReason: null,
          notApplicableAt: null,
          version: 1,
          updatedAt: new Date('2026-08-01T01:00:00.000Z'),
        },
      ],
    });

    const result = await service(prisma).getSummary(
      actor('member-1'),
      'project-1',
    );

    expect(result.redFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'REQUIREMENT_OVERDUE',
          dueDate,
        }),
      ]),
    );
    const requirementsSelect = (
      vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]?.select
        ?.requirements as { select: object }
    ).select;
    expect(requirementsSelect).not.toHaveProperty('expectedSchedule');
  });

  it('derives a bounded-query summary without histories or financial aggregates', async () => {
    const prisma = prismaReturning({
      ...summaryProject,
      stageApprovals: [
        {
          ...summaryProject.stageApprovals[0],
          evidenceFileId: 'private-approval-file',
        },
      ],
    });

    const result = await service(prisma).getSummary(
      actor('member-1'),
      'project-1',
    );

    expect(result).toMatchObject({
      project: { id: 'project-1', code: 'PRJ-001' },
      steps: [{ id: 'step-assignment' }, { id: 'step-survey' }],
      approval: { latest: { id: 'approval-2' }, count: 2 },
      requiredDocuments: {
        required: 3,
        approved: 1,
        rejected: 1,
        overdue: 1,
      },
      survey: { id: 'survey-1' },
      requirements: { total: 1, approved: 1 },
      readiness: { status: 'BLOCKED' },
      redFlags: expect.arrayContaining([
        expect.objectContaining({ code: 'REQUIRED_DOCUMENT_REJECTED' }),
      ]),
    });
    expect(result.project).not.toHaveProperty('_count');
    expect(result).not.toHaveProperty('financials');
    expect(JSON.stringify(result)).not.toContain('versions');
    expect(JSON.stringify(result)).not.toContain('private-approval-file');
    expect(result.project).not.toHaveProperty('members');
    expect(result.project).not.toHaveProperty('departments');
    expect(prisma.project.findFirst).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]?.select
        ?.requiredDocuments,
    ).toMatchObject({
      where: { stageKey: 'STAGE_1', required: true },
    });
    expect(
      JSON.stringify(
        vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]?.select
          ?.stageApprovals,
      ),
    ).not.toContain('evidenceFileId');
    expect(
      vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]?.select?.surveys,
    ).toMatchObject({
      select: {
        location: true,
        siteCondition: true,
        measurements: true,
        notes: true,
      },
    });
  });

  it('retains required superseded documents in summary, submission, and gate selections', async () => {
    const summaryPrisma = prismaReturning(summaryProject);
    await service(summaryPrisma).getSummary(actor('member-1'), 'project-1');

    const commandPrisma = (locksProject = false) => {
      const findFirst = locksProject
        ? vi
            .fn()
            .mockResolvedValueOnce({ id: 'project-1' })
            .mockResolvedValueOnce(null)
        : vi.fn().mockResolvedValue(null);
      const tx = {
        project: { findFirst },
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'project-1' }]),
      };
      return {
        findFirst,
        prisma: {
          $transaction: vi.fn((work) => work(tx)),
        } as unknown as PrismaService,
      };
    };
    const submission = commandPrisma(true);
    await expect(
      service(submission.prisma).submitApproval(
        actor('submitter-1', ['project.stage1.submit']),
        'project-1',
        { idempotencyKey: 'required-superseded-selection' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const gate = commandPrisma();
    await expect(
      service(gate.prisma).completeGate(
        actor('gatekeeper-1', ['project.stage1.complete_gate']),
        'project-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const requiredDocumentWhere = (findFirst: ReturnType<typeof vi.fn>) =>
      findFirst.mock.calls.find(
        ([args]) => args.select?.requiredDocuments?.where,
      )?.[0]?.select.requiredDocuments.where;
    expect([
      requiredDocumentWhere(vi.mocked(summaryPrisma.project.findFirst)),
      requiredDocumentWhere(submission.findFirst),
      requiredDocumentWhere(gate.findFirst),
    ]).toEqual(
      Array.from({ length: 3 }, () => ({
        stageKey: 'STAGE_1',
        required: true,
      })),
    );
  });

  it('counts an uploaded FILE_PRESENT document as complete without hard-blocking readiness', async () => {
    const prisma = prismaReturning({
      ...summaryProject,
      requiredDocuments: [
        {
          documentType: 'SURVEY_REPORT',
          status: 'UPLOADED',
          currentFileAssetId: 'file-survey',
          ownerRole: 'PROJECT_MANAGER',
          dueDate: null,
          notApplicableReason: null,
          markedBy: null,
          markedAt: null,
        },
        {
          documentType: 'KICKOFF_APPROVAL',
          status: 'APPROVED',
          currentFileAssetId: 'file-kickoff',
          ownerRole: 'PROJECT_MANAGER',
          dueDate: null,
          notApplicableReason: null,
          markedBy: null,
          markedAt: null,
        },
      ],
    });

    const result = await service(prisma).getSummary(
      actor('member-1'),
      'project-1',
    );

    expect(result.requiredDocuments).toMatchObject({
      required: 2,
      approved: 2,
      rejected: 0,
    });
    expect(result.readiness.status).not.toBe('BLOCKED');
    expect(
      vi.mocked(prisma.project.findFirst).mock.calls[0]?.[0]?.select
        ?.requiredDocuments,
    ).toMatchObject({
      select: expect.objectContaining({ currentFileAssetId: true }),
    });
  });

  it('allows approval submission only from initialized, completed, document-ready server state', async () => {
    const documents = [
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
    ].map((documentType) => ({
      documentType,
      status:
        documentType === 'KICKOFF_APPROVAL' ? 'PENDING_REVIEW' : 'UPLOADED',
      currentFileAssetId: `file-${documentType}`,
      ownerRole: 'PROJECT_MANAGER',
      dueDate: null,
      notApplicableReason: null,
      markedBy: null,
      markedAt: null,
    }));
    const steps = [
      'ASSIGNMENT',
      'SURVEY',
      'PROPOSAL',
      'FINANCIAL_PLANNING',
      'KICKOFF_APPROVAL',
    ].map((step) => ({
      id: `step-${step}`,
      step,
      ownerUserId: 'pm-1',
      dueDate: null,
      status: 'DONE',
      notApplicableReason: null,
      notApplicableAt: null,
      version: 1,
      updatedAt: new Date('2026-08-01T01:00:00.000Z'),
    }));
    const pendingApprovalDocument = {
      ...summaryProject,
      stageApprovals: [],
      stageSteps: steps,
      requiredDocuments: documents,
      _count: { ...summaryProject._count, stageApprovals: 0 },
    };
    const submitter = actor('member-1', [
      'project.stage1.submit',
      'project.stage1.finance.read',
    ]);

    await expect(
      service(prismaReturning(pendingApprovalDocument)).getSummary(
        submitter,
        'project-1',
      ),
    ).resolves.toMatchObject({
      allowedCommands: { submitApproval: false },
    });
    const ready = {
      ...pendingApprovalDocument,
      requiredDocuments: documents.map((document) =>
        document.documentType === 'KICKOFF_APPROVAL'
          ? { ...document, status: 'APPROVED' }
          : document,
      ),
    };
    await expect(
      service(prismaReturning(ready)).getSummary(submitter, 'project-1'),
    ).resolves.toMatchObject({
      allowedCommands: { submitApproval: true },
    });
    const nonFinancialPrisma = prismaReturning(ready);
    await expect(
      service(nonFinancialPrisma).getSummary(
        actor('member-1', ['project.stage1.submit']),
        'project-1',
      ),
    ).resolves.toMatchObject({
      allowedCommands: { submitApproval: true },
    });
    const nonFinancialSelect = vi.mocked(nonFinancialPrisma.project.findFirst)
      .mock.calls[0]?.[0]?.select as
      | {
          stageSteps: { where: object };
          requiredDocuments: { where: object };
        }
      | undefined;
    expect(nonFinancialSelect?.stageSteps.where).toEqual({
      stage: 'STAGE_ONE',
    });
    expect(nonFinancialSelect?.requiredDocuments.where).not.toHaveProperty(
      'documentType',
    );
    await expect(
      service(prismaReturning({ ...ready, stageStates: [] })).getSummary(
        submitter,
        'project-1',
      ),
    ).resolves.toMatchObject({
      allowedCommands: { submitApproval: false },
    });
    await expect(
      service(
        prismaReturning({
          ...ready,
          requiredDocuments: ready.requiredDocuments.slice(0, -1),
        }),
      ).getSummary(submitter, 'project-1'),
    ).resolves.toMatchObject({
      allowedCommands: { submitApproval: false },
    });
    await expect(
      service(
        prismaReturning({
          ...ready,
          requiredDocuments: ready.requiredDocuments.map((document, index) =>
            index ? document : { ...document, status: 'MISSING' },
          ),
        }),
      ).getSummary(submitter, 'project-1'),
    ).resolves.toMatchObject({
      allowedCommands: { submitApproval: false },
    });
  });

  it('does not grant or disclose a submit command without its permission', async () => {
    const result = await service(prismaReturning(summaryProject)).getSummary(
      actor('member-1'),
      'project-1',
    );

    expect(result.allowedCommands).toEqual({ submitApproval: false });
    expect(JSON.stringify(result.allowedCommands)).not.toContain('FINANCIAL');
  });

  it('returns requested accessible Stage 1 summaries in requested order from one scoped batch read', async () => {
    const firstProjectId = '00000000-0000-4000-8000-000000000001';
    const secondProjectId = '00000000-0000-4000-8000-000000000002';
    const inaccessibleProjectId = '00000000-0000-4000-8000-000000000003';
    const requestedActor = actor('member-1', ['project.read']);
    const findMany = vi.fn().mockResolvedValue([
      { ...summaryProject, id: secondProjectId },
      { ...summaryProject, id: firstProjectId },
    ]);
    const prisma = {
      project: { findMany },
      projectMember: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const result = await service(prisma).getSummaries(requestedActor, [
      firstProjectId,
      inaccessibleProjectId,
      secondProjectId,
    ]);

    expect(result).toEqual({
      items: [
        {
          projectId: firstProjectId,
          readiness: expect.objectContaining({ status: expect.any(String) }),
          redFlags: expect.any(Array),
        },
        {
          projectId: secondProjectId,
          readiness: expect.objectContaining({ status: expect.any(String) }),
          redFlags: expect.any(Array),
        },
      ],
    });
    expect(result.items[0]).not.toHaveProperty('project');
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: [firstProjectId, inaccessibleProjectId, secondProjectId],
          },
          organizationId: requestedActor.organizationId,
          deletedAt: null,
          OR: expect.arrayContaining([
            { projectOwnerId: requestedActor.userId },
            { projectManagerId: requestedActor.userId },
            { members: { some: { userId: requestedActor.userId } } },
          ]),
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('Galaxy Centre');
    expect(JSON.stringify(result)).not.toContain('customerId');
    expect(JSON.stringify(result)).not.toContain('requiredDocuments');
    expect(JSON.stringify(result)).not.toContain('preliminaryRevenue');
  });

  it('attributes document flags from independent matching document subsets', async () => {
    const missingDueDate = new Date('2026-08-20T00:00:00.000Z');
    const overdueDueDate = new Date('2026-07-30T00:00:00.000Z');
    const rejectedDueDate = new Date('2026-08-10T00:00:00.000Z');
    const prisma = prismaReturning({
      ...summaryProject,
      requiredDocuments: [
        {
          documentType: 'PROJECT_DOSSIER',
          status: 'APPROVED',
          currentFileAssetId: 'file-approved',
          ownerRole: 'APPROVED_OWNER',
          dueDate: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          documentType: 'SURVEY_REPORT',
          status: 'MISSING',
          currentFileAssetId: null,
          ownerRole: 'MISSING_OWNER',
          dueDate: missingDueDate,
        },
        {
          documentType: 'KICKOFF_APPROVAL',
          status: 'PENDING_REVIEW',
          currentFileAssetId: 'file-overdue',
          ownerRole: 'OVERDUE_OWNER',
          dueDate: overdueDueDate,
        },
        {
          documentType: 'KICKOFF_APPROVAL',
          status: 'REJECTED',
          currentFileAssetId: 'file-rejected',
          ownerRole: 'REJECTED_OWNER',
          dueDate: rejectedDueDate,
        },
      ],
    });

    const result = await service(prisma).getSummary(
      actor('member-1'),
      'project-1',
    );

    expect(
      result.redFlags
        .filter(({ code }) => code.startsWith('REQUIRED_DOCUMENT_'))
        .map(({ code, owner, dueDate }) => [code, owner, dueDate]),
    ).toEqual([
      ['REQUIRED_DOCUMENT_MISSING', 'MISSING_OWNER', missingDueDate],
      ['REQUIRED_DOCUMENT_OVERDUE', 'OVERDUE_OWNER', overdueDueDate],
      ['REQUIRED_DOCUMENT_REJECTED', 'REJECTED_OWNER', rejectedDueDate],
    ]);
  });

  it('does not trust a stale completed finance step when plan values are missing', async () => {
    const prisma = prismaReturning({
      ...summaryProject,
      stageSteps: [
        ...summaryProject.stageSteps,
        {
          id: 'step-finance',
          step: 'FINANCIAL_PLANNING',
          ownerUserId: 'pm-1',
          dueDate: null,
          status: 'DONE',
          notApplicableReason: null,
          notApplicableAt: null,
          version: 1,
          updatedAt: new Date('2026-08-01T01:00:00.000Z'),
        },
      ],
    });

    const result = await service(prisma).getSummary(
      actor('member-1', ['project.stage1.finance.read']),
      'project-1',
    );

    expect(result.readiness.cards.find(({ key }) => key === 'FINANCE')).toEqual(
      expect.objectContaining({
        status: 'NOT_STARTED',
        satisfied: 0,
        total: 1,
      }),
    );
    expect(result.redFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FINANCIAL_PLAN_MISSING_WHEN_REQUIRED',
        }),
      ]),
    );
  });

  it('returns no routing for an invalid stored Project type', async () => {
    const prisma = prismaReturning({
      ...initiationProject,
      projectType: 'LEGACY_TURNKEY',
    });

    const result = await service(prisma).getInitiation(
      actor('member-1'),
      'project-1',
    );

    expect(result.routing).toBeNull();
  });

  it('selects the exact latest approval decision for reloads', async () => {
    const prisma = prismaReturning(summaryProject);

    await service(prisma).getSummary(actor('member-1'), 'project-1');

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          stageApprovals: expect.objectContaining({
            select: expect.objectContaining({ decision: true }),
          }),
        }),
      }),
    );
  });

  it('rejects sorting and filtering instead of accepting hidden query keys', async () => {
    const prisma = prismaReturning(summaryProject);
    const reads = service(prisma);

    await expect(
      reads.getSummary(actor('member-1'), 'project-1', {
        sort: 'estimatedValue',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      reads.getInitiation(actor('member-1'), 'project-1', {
        contractedValue: '800.00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });
});

describe('ProjectStageOneController', () => {
  const projectId = '00000000-0000-4000-8000-000000000001';
  const approvalId = '00000000-0000-4000-8000-000000000002';
  const stageService = {
    getSimple: vi.fn(),
    initiateSimple: vi.fn(),
    updateSimple: vi.fn(),
    createDocumentDefinition: vi.fn(),
    updateDocumentDefinition: vi.fn(),
    completeSimpleStep: vi.fn(),
    documentHistory: vi.fn(),
    deleteDocument: vi.fn(),
    getSummary: vi.fn(),
    getInitiation: vi.fn(),
    initialize: vi.fn(),
    updatePlan: vi.fn(),
    updateGovernance: vi.fn(),
    completeStep: vi.fn(),
    markSurveyNotApplicable: vi.fn(),
    submitApproval: vi.fn(),
    decideApproval: vi.fn(),
    completeGate: vi.fn(),
  } as unknown as ProjectStageOneService;
  const controller = new ProjectStageOneController(stageService);

  it('declares the governed Stage 1 assignment route', () => {
    const handler = (
      ProjectStageOneController.prototype as unknown as Record<string, unknown>
    ).governance;

    expect(Reflect.getMetadata(PATH_METADATA, handler as object)).toBe(
      'stage-1/governance',
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, handler as object),
    ).toEqual(['project.update']);
  });

  it.each([
    ['simple', 'stage-1/simple', 0, ['project.read']],
    [
      'initiateSimple',
      'stage-1/initiate-simple',
      1,
      ['project.update', 'estimate.update', 'estimate.read'],
    ],
    [
      'updateSimple',
      'stage-1/initiate-simple',
      4,
      ['project.update', 'estimate.update', 'estimate.read'],
    ],
    [
      'completeSimpleStep',
      'stage-1/steps/:step/complete',
      1,
      ['project.update'],
    ],
    [
      'createDocumentDefinition',
      'stage-1/document-definitions',
      1,
      'project.document.manage',
    ],
    [
      'updateDocumentDefinition',
      'stage-1/document-definitions/:id',
      4,
      'project.document.manage',
    ],
    [
      'documentHistory',
      'stage-1/documents/:documentId/history',
      0,
      ['project.read'],
    ],
    ['deleteDocument', 'stage-1/documents/:documentId', 3, ['file.delete']],
    ['summary', 'stage-1/summary', 0, 'project.read'],
    ['initiation', 'stage-1/initiation', 0, 'project.read'],
    ['routing', 'stage-1/routing', 0, 'project.read'],
    ['initialize', 'stage-1/initialize', 1, 'project.update'],
    ['plan', 'stage-1/plan', 4, 'project.update'],
    ['governance', 'stage-1/governance', 4, 'project.update'],
    ['step', 'stage-1/step', 1, 'project.update'],
    [
      'surveyNotApplicable',
      'stage-1/survey/not-applicable',
      1,
      'project.survey.not_applicable',
    ],
    ['submitApproval', 'stage-1/approval/submit', 1, 'project.stage1.submit'],
    [
      'decideApproval',
      'stage-1/approval/:approvalId/decision',
      1,
      'project.stage1.review',
    ],
    ['gate', 'stage-1/gate', 1, 'project.stage1.complete_gate'],
  ] as const)(
    'declares %s as %s with its exact permission',
    (method, path, requestMethod, permission) => {
      const handler = (
        ProjectStageOneController.prototype as unknown as Record<string, object>
      )[method]!;
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, handler)).toEqual([
        ...(Array.isArray(permission) ? permission : [permission]),
      ]);
    },
  );

  it('parses every project and approval identifier as UUIDs', () => {
    for (const method of [
      'simple',
      'initiateSimple',
      'updateSimple',
      'createDocumentDefinition',
      'updateDocumentDefinition',
      'completeSimpleStep',
      'documentHistory',
      'deleteDocument',
      'summary',
      'initiation',
      'routing',
      'initialize',
      'plan',
      'governance',
      'step',
      'surveyNotApplicable',
      'submitApproval',
      'decideApproval',
      'gate',
    ] as const) {
      const metadata = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        ProjectStageOneController,
        method,
      ) as Record<string, { data?: string; pipes?: unknown[] }>;
      expect(
        Object.values(metadata).some(
          ({ data, pipes }) =>
            data === 'projectId' &&
            pipes?.some((pipe) => pipe === ParseUUIDPipe),
        ),
      ).toBe(true);
    }
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ProjectStageOneController,
      'decideApproval',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    expect(
      Object.values(metadata).some(
        ({ data, pipes }) =>
          data === 'approvalId' &&
          pipes?.some((pipe) => pipe === ParseUUIDPipe),
      ),
    ).toBe(true);
  });

  it('uses the global DTO validation contract for route bodies', async () => {
    await expect(
      validate(SurveyNotApplicableDto, { reason: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate(SubmitStageOneApprovalDto, { idempotencyKey: 'submit-1' }),
    ).resolves.toMatchObject({ idempotencyKey: 'submit-1' });
  });

  it('returns structured 422 blockers from the Stage 1 gate', async () => {
    const blockers = [
      {
        code: 'PROJECT_TYPE_MISSING',
        title: 'Project type is missing',
        entityType: 'Project',
        entityId: projectId,
        route: `/projects/${projectId}/stage-1/initiation`,
        remediation: 'Select a canonical Project type.',
      },
    ];
    vi.mocked(stageService.completeGate).mockResolvedValueOnce({
      completed: false,
      blockers,
    } as never);

    const response = { status: vi.fn().mockReturnThis() };
    const result = await controller.gate(
      actor('member-1'),
      projectId,
      response,
    );

    expect(response.status).toHaveBeenCalledWith(422);
    expect(result).toEqual({
      blockers,
    });
  });

  it('serializes blocked gate blockers as an HTTP 422 response', async () => {
    const blockers = [
      {
        code: 'PROJECT_TYPE_MISSING',
        title: 'Project type is missing',
        entityType: 'Project',
        entityId: projectId,
        route: `/projects/${projectId}/stage-1/initiation`,
        remediation: 'Select a canonical Project type.',
      },
    ];
    const completeGate = vi.fn().mockResolvedValue({
      completed: false,
      blockers,
    });
    const module = await Test.createTestingModule({
      controllers: [ProjectStageOneController],
      providers: [
        { provide: ProjectStageOneService, useValue: { completeGate } },
      ],
    }).compile();
    const app: INestApplication = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.use(
      (
        request: { actor?: CurrentActor },
        _response: unknown,
        next: () => void,
      ) => {
        request.actor = actor('member-1');
        next();
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    try {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/projects/${projectId}/stage-1/gate`)
        .send({});

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ blockers });
      expect(completeGate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'member-1' }),
        projectId,
      );
    } finally {
      await app.close();
    }
  });

  it('does not turn a non-member denial into a Stage 1 response', async () => {
    vi.mocked(stageService.getSummary).mockRejectedValueOnce(
      new NotFoundException('Project not found'),
    );

    await expect(
      controller.summary(actor('non-member'), projectId, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects routing from the scoped initiation read', async () => {
    vi.mocked(stageService.getInitiation).mockResolvedValueOnce({
      project: { id: projectId },
      routing: { requiresSurvey: true },
    } as never);

    await expect(
      controller.routing(actor('member-1'), projectId, {}),
    ).resolves.toEqual({
      requiresSurvey: true,
    });
  });

  it('routes existing-project PATCH only to updateSimple', async () => {
    const a = actor('member-1');
    const updateData = {
      name: 'Project',
      estimatedInvestmentAmount: '1000.00',
      fundingSource: 'PPP' as const,
      customerId: projectId,
      idempotencyKey: 'update-1',
    };
    vi.mocked(stageService.initiateSimple).mockClear();

    await (
      controller as unknown as {
        updateSimple(
          actor: CurrentActor,
          projectId: string,
          input: typeof updateData,
        ): Promise<unknown>;
      }
    ).updateSimple(a, projectId, updateData);

    expect(stageService.updateSimple).toHaveBeenCalledWith(
      a,
      projectId,
      updateData,
    );
    expect(stageService.initiateSimple).not.toHaveBeenCalled();
  });

  it('forwards command DTOs without duplicating authorization', async () => {
    const a = actor('member-1');
    const plan = { source: 'Referral' };
    const governance = {
      principalUserId: projectId,
      coordinatorUserIds: [],
      responsibilityNotes: null,
    };
    const step = { step: 'ASSIGNMENT' as const };
    const reason = { reason: 'Survey not required' };
    const submission = { idempotencyKey: 'stage-1-submit' };
    const decision = { decision: 'APPROVED' as const, version: 1 };
    const simpleInitiation = {
      name: 'Project',
      estimatedInvestmentAmount: '1000.00',
      fundingSource: 'PPP' as const,
      customerId: projectId,
      idempotencyKey: 'initiate-1',
    };

    await controller.simple(a, projectId);
    await controller.initiateSimple(a, projectId, simpleInitiation);
    await (
      controller as unknown as {
        updateSimple(
          actor: CurrentActor,
          projectId: string,
          data: typeof simpleInitiation,
        ): Promise<unknown>;
      }
    ).updateSimple(a, projectId, simpleInitiation);
    await controller.completeSimpleStep(a, projectId, 'ASSIGNMENT');
    await controller.initialize(a, projectId, {});
    await controller.plan(a, projectId, plan);
    await controller.governance(a, projectId, governance);
    await controller.step(a, projectId, step);
    await controller.surveyNotApplicable(a, projectId, reason);
    await controller.submitApproval(a, projectId, submission);
    await controller.decideApproval(a, projectId, approvalId, decision);

    expect(stageService.getSimple).toHaveBeenCalledWith(a, projectId);
    expect(stageService.initiateSimple).toHaveBeenCalledWith(
      a,
      projectId,
      simpleInitiation,
    );
    expect(stageService.updateSimple).toHaveBeenCalledWith(
      a,
      projectId,
      simpleInitiation,
    );
    expect(stageService.completeSimpleStep).toHaveBeenCalledWith(
      a,
      projectId,
      'ASSIGNMENT',
    );
    expect(stageService.initialize).toHaveBeenCalledWith(a, projectId);
    expect(stageService.updatePlan).toHaveBeenCalledWith(a, projectId, plan);
    expect(stageService.updateGovernance).toHaveBeenCalledWith(
      a,
      projectId,
      governance,
    );
    expect(stageService.completeStep).toHaveBeenCalledWith(
      a,
      projectId,
      'ASSIGNMENT',
    );
    expect(stageService.markSurveyNotApplicable).toHaveBeenCalledWith(
      a,
      projectId,
      'Survey not required',
    );
    expect(stageService.submitApproval).toHaveBeenCalledWith(
      a,
      projectId,
      submission,
    );
    expect(stageService.decideApproval).toHaveBeenCalledWith(
      a,
      projectId,
      approvalId,
      decision,
    );
  });
});

describe('ProjectsController Stage 1 summary batch route', () => {
  it('declares the static batch URL with project.read', () => {
    const handler = ProjectsController.prototype.stageOneSummaries;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'stage-1-summaries',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, handler)).toEqual([
      'project.read',
    ]);
  });

  it('routes the static batch URL to summaries instead of a project ID', async () => {
    const projectIds = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    const getSummaries = vi.fn().mockResolvedValue({ items: [] });
    const get = vi.fn();
    const module = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: { get } },
        { provide: ProjectStageOneService, useValue: { getSummaries } },
        { provide: ProjectStageTwoService, useValue: {} },
      ],
    }).compile();
    const app: INestApplication = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(
      (
        request: { actor?: CurrentActor },
        _response: unknown,
        next: () => void,
      ) => {
        request.actor = actor('member-1');
        next();
      },
    );
    app.useGlobalPipes(pipe);
    await app.init();

    try {
      await request(app.getHttpServer())
        .get(`/api/v1/projects/stage-1-summaries?projectIds=${projectIds}`)
        .expect(200, { items: [] });

      expect(getSummaries).toHaveBeenCalledOnce();
      expect(getSummaries).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'member-1' }),
        expect.anything(),
      );
      expect(get).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
