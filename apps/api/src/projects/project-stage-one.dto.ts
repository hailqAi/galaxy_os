import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import {
  PROJECT_DOCUMENT_CONTEXTS,
  STAGE_ONE_FUNDING_SOURCES,
  stageOneDocumentTypes,
  type ProjectDocumentContext,
  type StageOneFundingSource,
  type StageOneStep,
} from './project-stage-one.rules';

const STAGE_ONE_STEPS = [
  'ASSIGNMENT',
  'SURVEY',
  'PROPOSAL',
  'FINANCIAL_PLANNING',
  'KICKOFF_APPROVAL',
] as const satisfies readonly StageOneStep[];
const DECIMAL_20_2 = /^\d{1,18}(?:\.\d{1,2})?$/;
const RESPONSIBILITY_NOTE_MAX_LENGTH = 1000;

function trim({ value }: TransformFnParams) {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalTrim({ value }: TransformFnParams) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalCurrency({ value }: TransformFnParams) {
  const trimmed = optionalTrim({ value } as TransformFnParams);
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
}

function numberString({ value }: TransformFnParams) {
  if (typeof value !== 'string' || value.trim() === '') return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function IsBooleanRecord() {
  return ValidateBy({
    name: 'isBooleanRecord',
    validator: {
      validate: (value) =>
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.values(value).every((flag) => typeof flag === 'boolean'),
    },
  });
}

export class InitializeStageOneDto {}

export class SimpleInitiationDto {
  @Transform(trim) @IsString() @Length(1, 200) name!: string;
  @Transform(trim)
  @IsString({ message: 'Giá trị dự kiến không hợp lệ.' })
  @Matches(DECIMAL_20_2, {
    message: 'Giá trị dự kiến không hợp lệ.',
  })
  estimatedInvestmentAmount!: string;
  @IsOptional()
  @IsIn(STAGE_ONE_FUNDING_SOURCES)
  fundingSource?: StageOneFundingSource;
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() primaryContactId?: string;
  @Transform(trim) @IsString() @Length(1, 200) idempotencyKey!: string;
}

export class ProjectDocumentDefinitionDto {
  @Transform(trim) @IsString() @Length(1, 200) name!: string;
  @ValidateBy({
    name: 'hasWorkflowStepOnlyForWorkflowDefinition',
    validator: {
      validate: (value, args) => {
        const dto = args?.object as ProjectDocumentDefinitionDto | undefined;
        return dto?.initialMatrix
          ? value === undefined
          : STAGE_ONE_STEPS.includes(value as StageOneStep);
      },
    },
  })
  workstreamKey?: StageOneStep;
  @ValidateBy({
    name: 'hasReferenceMilestoneOnlyForKeyDossier',
    validator: {
      validate: (value, args) =>
        Boolean(
          (args?.object as ProjectDocumentDefinitionDto | undefined)
            ?.initialMatrix,
        ) || value === undefined,
    },
  })
  @IsOptional()
  @IsUUID()
  referenceMilestoneId?: string;
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 1000)
  description?: string;
  @IsInt() @Min(0) position!: number;
  @IsBoolean() initialMatrix!: boolean;
  @IsBoolean() active!: boolean;
  @IsOptional() @IsBoolean() confirmDuplicate?: boolean;
}

export class DeleteStageOneDocumentQuery {
  @IsIn(PROJECT_DOCUMENT_CONTEXTS)
  contextType!: ProjectDocumentContext;
  @IsIn(['STAGE_ONE', 'LEGACY_REQUIRED_DOCUMENT'])
  source!: 'STAGE_ONE' | 'LEGACY_REQUIRED_DOCUMENT';
}

export class DeleteKeyDossierItemDto {
  @Transform(trim) @IsString() @Length(1, 1000) reason!: string;
}

export class KeyDossierMilestoneDto {
  @Transform(trim) @IsString() @Length(1, 50) code!: string;
  @Transform(trim) @IsString() @Length(1, 200) name!: string;
  @IsInt() @Min(0) position!: number;
  @IsBoolean() active!: boolean;
}

export class DeleteKeyDossierMilestoneDto {
  @Transform(trim) @IsString() @Length(1, 1000) reason!: string;
  @IsOptional() @IsUUID() replacementMilestoneId?: string | null;
}

export class SimpleStageOneDocumentDto {
  @IsIn(STAGE_ONE_STEPS) step!: StageOneStep;
  @Transform(trim)
  @IsString()
  @ValidateBy({
    name: 'isConfiguredStageOneDocumentType',
    validator: {
      validate: (value, args) => {
        const step = (args?.object as SimpleStageOneDocumentDto | undefined)
          ?.step;
        return (
          typeof value === 'string' &&
          STAGE_ONE_STEPS.includes(step as StageOneStep) &&
          stageOneDocumentTypes(step as StageOneStep).some(
            ({ name }) => name === value,
          )
        );
      },
    },
  })
  documentType!: string;
  @ValidateIf(
    ({ documentType }, value) =>
      documentType === 'Hồ sơ khác' || value !== undefined,
  )
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  @ValidateBy({
    name: 'isCustomStageOneDocumentName',
    validator: {
      validate: (_value, args) =>
        (args?.object as SimpleStageOneDocumentDto | undefined)
          ?.documentType === 'Hồ sơ khác',
    },
  })
  customName?: string;
}

export class StageOneSummaryBatchQuery {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  projectIds!: string[];
}

export class UpdateStageOnePlanDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 200) source?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  legalEntityText?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @IsBooleanRecord()
  scopeFlags?: Record<string, boolean>;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  scopeNotes?: string;
  @IsOptional() @IsDateString() plannedSurveyAt?: string;
  @IsOptional() @IsDateString() plannedProposalAt?: string;
  @IsOptional() @IsDateString() plannedFinancialPlanAt?: string;
  @IsOptional() @IsDateString() plannedKickoffAt?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  siteConstraints?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  proposalBaseline?: string;
  @IsOptional() @IsArray() proposalMilestones?: Record<string, unknown>[];
  @IsOptional() @IsArray() proposalWbs?: Record<string, unknown>[];
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  riskNotes?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  resourceNotes?: string;
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(optionalTrim)
  @IsString({ message: 'Doanh thu dự kiến không hợp lệ.' })
  @Matches(DECIMAL_20_2, { message: 'Doanh thu dự kiến không hợp lệ.' })
  preliminaryRevenue?: string | null;
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(optionalTrim)
  @IsString({ message: 'Chi phí dự kiến không hợp lệ.' })
  @Matches(DECIMAL_20_2, { message: 'Chi phí dự kiến không hợp lệ.' })
  preliminaryCost?: string | null;
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(optionalTrim)
  @IsString({ message: 'Lợi nhuận dự kiến không hợp lệ.' })
  @Matches(DECIMAL_20_2, { message: 'Lợi nhuận dự kiến không hợp lệ.' })
  preliminaryMargin?: string | null;
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Transform(optionalCurrency)
  @IsString({
    message: 'Đơn vị tiền tệ phải có 3 ký tự, ví dụ VND.',
  })
  @Matches(/^[A-Z]{3}$/, {
    message: 'Đơn vị tiền tệ phải có 3 ký tự, ví dụ VND.',
  })
  preliminaryCurrency?: string | null;
  @IsOptional() @IsDateString() preliminaryFinancialPlanDate?: string;
}

export class UpdateStageOneGovernanceDto {
  @IsUUID() principalUserId!: string;
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  coordinatorUserIds!: string[];
  @ValidateIf((_object, value) => value !== null)
  @Transform(trim)
  @IsString()
  @Length(1, RESPONSIBILITY_NOTE_MAX_LENGTH)
  responsibilityNotes!: string | null;
}

export class CompleteStageOneStepDto {
  @IsIn(STAGE_ONE_STEPS) step!: StageOneStep;
}

export class SurveyNotApplicableDto {
  @Transform(trim) @IsString() @Length(1, 1000) reason!: string;
}

export class SubmitStageOneApprovalDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 2000) comments?: string;
  @IsOptional() @IsUUID() evidenceFileId?: string;
  @Transform(trim) @IsString() @Length(1, 200) idempotencyKey!: string;
}

export class DecideStageOneApprovalDto {
  @IsIn(['APPROVED', 'APPROVED_WITH_COMMENTS', 'REVISION_REQUIRED', 'REJECTED'])
  decision!:
    | 'APPROVED'
    | 'APPROVED_WITH_COMMENTS'
    | 'REVISION_REQUIRED'
    | 'REJECTED';
  @Transform(trim)
  @ValidateIf(
    ({ decision, comments }) =>
      decision !== 'APPROVED' || comments !== undefined,
  )
  @IsString()
  @Length(1, 2000)
  comments?: string;
  @IsOptional() @IsUUID() evidenceFileId?: string;
  @Transform(numberString) @IsNumber() @Min(1) version!: number;
}
