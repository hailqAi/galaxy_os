import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const money = /^\d{1,18}(?:\.\d{1,2})?$/;
const probability = /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/;

export class CreateProjectRiskDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 300) title!: string;
  @IsString() @Length(1, 2000) cause!: string;
  @IsString() @Length(1, 2000) event!: string;
  @IsString() @Length(1, 2000) impact!: string;
  @IsIn([
    'DESIGN',
    'CUSTOMER',
    'SUPPLIER',
    'PRODUCTION',
    'QUALITY_SAFETY',
    'LOGISTICS',
    'SITE',
    'INSTALLATION',
    'FINANCIAL',
    'CONTRACT',
    'WARRANTY',
    'SCHEDULE',
  ])
  category!: string;
  @IsIn(['STAGE_ONE', 'STAGE_TWO', 'STAGE_THREE', 'STAGE_FOUR', 'STAGE_FIVE'])
  stage!: string;
  @IsUUID() ownerId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) likelihood!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) impactScore!: number;
  @IsOptional() @Matches(probability) probability?: string;
  @IsOptional() @Matches(money) financialImpact?: string;
  @IsOptional() @IsString() @Length(1, 1000) trigger?: string;
  @IsOptional() @IsString() @Length(1, 4000) treatment?: string;
  @IsOptional() @IsString() @Length(1, 4000) response?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class AllocateProjectRiskDto {
  @IsUUID() estimateVersionId!: string;
  @Matches(money) approvedAmount!: string;
  @IsString() @Length(1, 2000) basis!: string;
}
