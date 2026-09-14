import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const STAGE_TWO_PLAN_HEADERS = [
  'MÃ CV',
  'NỘI DUNG CÔNG VIỆC CHI TIẾT',
  'ĐƠN VỊ CHỦ TRÌ',
  'NGÀY BẮT ĐẦU',
  'NGÀY HOÀN THÀNH',
  'NGÂN SÁCH PHÂN BỔ (VND)',
] as const;

export const STAGE_TWO_PLAN_ENTITY = 'PROJECT_STAGE_TWO_BASELINE';
export const STAGE_TWO_BASELINE_VERSION = 1;
export const STAGE_TWO_PLAN_WORKSTREAM = 'PLAN';
export const STAGE_TWO_PLAN_MAX_ROWS = 1000;
export const STAGE_TWO_PLAN_MAX_BYTES = 5 * 1024 * 1024;
export const DECIMAL_20_2 = /^\d{1,18}(?:\.\d{1,2})?$/;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const trim = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: TransformFnParams) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const optionalTrim = ({ value }: TransformFnParams) => {
  if (typeof value !== 'string') return value;
  const result = value.trim();
  return result || undefined;
};

export type StageTwoPlanRowInput = {
  id?: string;
  code: string;
  description: string;
  departmentId: string;
  startDate: string;
  finishDate: string;
  allocatedBudget?: string;
  version?: number;
};

export class StageTwoDocumentDefinitionDto {
  @Transform(trim) @IsString() @Length(1, 200) name!: string;
  @IsIn([STAGE_TWO_PLAN_WORKSTREAM])
  workstreamKey!: typeof STAGE_TWO_PLAN_WORKSTREAM;
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @Length(1, 1000)
  description?: string;
  @IsInt() @Min(0) position!: number;
  @IsIn([true]) initialMatrix!: true;
  @IsBoolean() active!: boolean;
}

export class StageTwoPlanRowDto implements StageTwoPlanRowInput {
  @IsOptional() @IsUUID() id?: string;
  @Transform(upper)
  @IsString()
  @Length(1, 100)
  @Matches(/^[\p{L}\p{N}._/-]+$/u)
  code!: string;
  @Transform(trim) @IsString() @Length(1, 300) description!: string;
  @IsUUID() departmentId!: string;
  @Matches(ISO_DATE) startDate!: string;
  @Matches(ISO_DATE) finishDate!: string;
  @Transform(optionalTrim)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(DECIMAL_20_2)
  allocatedBudget?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class StageTwoPlanRemovalDto {
  @IsUUID() id!: string;
  @IsInt() @Min(1) version!: number;
}

export class StageTwoPlanBatchDto {
  @IsArray()
  @ArrayMaxSize(STAGE_TWO_PLAN_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => StageTwoPlanRowDto)
  rows!: StageTwoPlanRowDto[];

  @IsArray()
  @ArrayMaxSize(STAGE_TWO_PLAN_MAX_ROWS)
  @ArrayUnique((row: StageTwoPlanRemovalDto) => row.id)
  @ValidateNested({ each: true })
  @Type(() => StageTwoPlanRemovalDto)
  removedRows!: StageTwoPlanRemovalDto[];
}

export class StageTwoPlanPreviewDto {
  @IsUUID() fileAssetId!: string;
}

export class StageTwoQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @IsIn([1])
  step: number = 1;
}
