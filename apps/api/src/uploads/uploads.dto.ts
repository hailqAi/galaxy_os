import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  isUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateBy,
  ValidateNested,
} from 'class-validator';
import {
  PROJECT_DOCUMENT_CONTEXTS,
  type ProjectDocumentContext,
} from '../projects/project-stage-one.rules';
export class ProjectStageDocumentTargetDto {
  @IsUUID()
  definitionId!: string;
  @IsIn(['STAGE_1', 'STAGE_2'])
  stageKey!: 'STAGE_1' | 'STAGE_2';
  @IsIn(PROJECT_DOCUMENT_CONTEXTS)
  contextType!: ProjectDocumentContext;
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateBy({
    name: 'hasWorkflowStepOnlyOutsideKeyDossier',
    validator: {
      validate: (value, args) => {
        const dto = args?.object as ProjectStageDocumentTargetDto | undefined;
        const keyDossier =
          dto?.stageKey === 'STAGE_1' &&
          dto.contextType === 'STAGE_MATRIX_DOCUMENT';
        return keyDossier
          ? value === undefined
          : typeof value === 'string' &&
              value.length >= 1 &&
              value.length <= 100;
      },
    },
  })
  workstreamKey?: string;
  @IsOptional()
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  displayName?: string;
  @IsUUID()
  submittedOfficerId!: string;
  @IsOptional() @IsUUID() documentId?: string;
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  idempotencyKey!: string;
}

export class InitiateUploadDto {
  @IsUUID()
  @ValidateBy({
    name: 'hasExactlyOneUploadTarget',
    validator: {
      validate: (_value, args) => {
        const dto = args?.object as InitiateUploadDto | undefined;
        if (!dto) return false;
        if (
          [
            dto.requiredDocumentId,
            dto.stageOneDocument,
            dto.aiConversationId,
          ].filter(Boolean).length !== 1
        )
          return false;
        if (dto.aiConversationId && !isUUID(dto.idempotencyKey ?? ''))
          return false;
        return Boolean(
          dto.idempotencyKey ?? dto.stageOneDocument?.idempotencyKey,
        );
      },
      defaultMessage: () => 'Chỉ được chọn một hồ sơ đích.',
    },
  })
  projectId!: string;
  @IsOptional() @IsUUID() aiConversationId?: string;
  @IsOptional() @IsUUID() requiredDocumentId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectStageDocumentTargetDto)
  stageOneDocument?: ProjectStageDocumentTargetDto;
  @IsOptional()
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  idempotencyKey?: string;
  @IsString() @Length(1, 255) originalFilename!: string;
  @IsInt() @Min(1) declaredSize!: number;
  @IsString() @Length(1, 200) mimeType!: string;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) checksum?: string;
}
export class UploadPartQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(10_000) partNumber!: number;
  @Matches(/^[a-f0-9]{64}$/) checksum!: string;
}
export class UploadConstraintsQuery {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional()
  @IsUUID()
  @ValidateBy({
    name: 'hasChatProject',
    validator: {
      validate: (_value, args) =>
        Boolean(
          (args?.object as UploadConstraintsQuery | undefined)?.projectId,
        ),
    },
  })
  aiConversationId?: string;
}
export class RecoverUploadsQuery {
  @IsUUID()
  @ValidateBy({
    name: 'hasAtMostOneRecoveryTarget',
    validator: {
      validate: (_value, args) => {
        const dto = args?.object as RecoverUploadsQuery | undefined;
        if (!dto) return false;
        return (
          [
            dto.requiredDocumentId,
            dto.stageOneDocumentId,
            dto.aiConversationId,
          ].filter(Boolean).length <= 1
        );
      },
      defaultMessage: () => 'Chỉ được chọn một hồ sơ đích.',
    },
  })
  projectId!: string;
  @IsOptional() @IsUUID() aiConversationId?: string;
  @IsOptional()
  @IsIn(PROJECT_DOCUMENT_CONTEXTS)
  contextType?: ProjectDocumentContext;
  @IsOptional() @IsUUID() requiredDocumentId?: string;
  @IsOptional() @IsUUID() stageOneDocumentId?: string;
}
export class SubmitUploadsDto {
  @IsUUID()
  projectId!: string;
  @Transform(({ value }: TransformFnParams) =>
    Array.isArray(value)
      ? value.map((id) => (typeof id === 'string' ? id.toLowerCase() : id))
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  sessionIds!: string[];
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  idempotencyKey!: string;
}
export class CompleteUploadDto {
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) checksum?: string;
}
