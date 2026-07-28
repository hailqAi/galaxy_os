import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
export class CreateProjectDto {
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 200) name!: string;
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() primaryContactId?: string;
  @IsOptional() @IsString() @Length(1, 100) projectType?: string;
  @IsOptional() @IsString() @Length(1, 100) propertyType?: string;
  @IsOptional() @IsString() @Length(1, 300) location?: string;
  @IsOptional() @IsString() @Length(1, 500) address?: string;
  @IsOptional() @IsUUID() projectOwnerId?: string;
  @IsOptional() @IsUUID() salesOwnerId?: string;
  @IsOptional() @IsUUID() designOwnerId?: string;
  @IsOptional() @IsUUID() projectManagerId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() expectedCompletionDate?: string;
  @IsOptional()
  @IsIn(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])
  status?: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  @IsOptional() @IsIn(['SURVEY', 'REQUIREMENT', 'DESIGN']) phase?:
    | 'SURVEY'
    | 'REQUIREMENT'
    | 'DESIGN';
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?:
    | 'LOW'
    | 'NORMAL'
    | 'HIGH'
    | 'URGENT';
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractedValue?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsString() @Length(1, 5000) description?: string;
  @IsOptional()
  @IsIn(['INTERNAL', 'RESTRICTED', 'CONFIDENTIAL'])
  confidentiality?: 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';
  @IsOptional() @IsIn(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']) healthStatus?:
    | 'ON_TRACK'
    | 'AT_RISK'
    | 'OFF_TRACK';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercentage?: number;
}
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
export class ProjectMemberDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsString() @Length(1, 100) role?: string;
}
export class ProjectDepartmentDto {
  @IsUUID() departmentId!: string;
}
export class ChangeProjectPhaseDto {
  @IsIn([
    'SURVEY',
    'REQUIREMENT',
    'DESIGN',
    'PRODUCT_SELECTION',
    'QUOTATION',
    'CONTRACT',
    'PROCUREMENT',
    'PRODUCTION',
    'SHIPPING',
    'INSTALLATION',
    'INSPECTION',
    'HANDOVER',
    'WARRANTY',
    'AFTER_SALES',
  ])
  phase!:
    | 'SURVEY'
    | 'REQUIREMENT'
    | 'DESIGN'
    | 'PRODUCT_SELECTION'
    | 'QUOTATION'
    | 'CONTRACT'
    | 'PROCUREMENT'
    | 'PRODUCTION'
    | 'SHIPPING'
    | 'INSTALLATION'
    | 'INSPECTION'
    | 'HANDOVER'
    | 'WARRANTY'
    | 'AFTER_SALES';
}
