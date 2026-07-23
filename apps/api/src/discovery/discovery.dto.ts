import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
export class CreateSurveyDto {
  @IsUUID() projectId!: string;
  @IsOptional() @IsDateString() requestedAt?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() @Length(1, 500) location?: string;
  @IsOptional() @IsString() @Length(1, 10000) siteCondition?: string;
  @IsOptional() @IsObject() measurements?: Record<string, unknown>;
  @IsOptional() @IsString() @Length(1, 10000) notes?: string;
}
export class UpdateSurveyDto extends PartialType(CreateSurveyDto) {}
export class CreateRequirementDto {
  @IsUUID() projectId!: string;
  @IsOptional() @IsUUID() surveyId?: string;
  @IsString() @Length(1, 300) title!: string;
  @IsOptional() @IsString() @Length(1, 20000) customerRequirements?: string;
  @IsOptional() @IsString() @Length(1, 5000) stylePreferences?: string;
  @IsOptional() @IsString() @Length(1, 5000) brandPreferences?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) budgetMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) budgetMax?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @Length(1, 1000) expectedSchedule?: string;
}
export class UpdateRequirementDto extends PartialType(CreateRequirementDto) {}
