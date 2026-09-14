import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';
import { PageQuery } from '../common.dto';

export class ProjectProductsQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional()
  @IsIn([
    'NOT_REQUIRED',
    'DRAFT',
    'PENDING',
    'APPROVED',
    'APPROVED_WITH_COMMENTS',
    'REJECTED',
    'SUPERSEDED',
  ])
  approvalStatus?: string;
  @IsOptional()
  @IsIn([
    'REQUIREMENT',
    'SHORTLISTING',
    'CLIENT_REVIEW',
    'CLIENT_APPROVED',
    'TECHNICAL_REVIEW',
    'COMMERCIAL_REVIEW',
    'READY_FOR_ESTIMATE',
    'ESTIMATED',
    'QUOTED',
    'CONTRACTED',
    'READY_TO_ORDER',
    'ORDERED',
    'IN_PRODUCTION',
    'READY_TO_SHIP',
    'IN_TRANSIT',
    'WAREHOUSE_RECEIVED',
    'READY_FOR_INSTALLATION',
    'INSTALLED',
    'ACCEPTED',
    'HANDED_OVER',
    'UNDER_WARRANTY',
    'CLOSED',
    'CANCELLED',
  ])
  lifecycleStatus?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() blocked?: boolean;
  @IsOptional()
  @IsIn(['code', 'updatedAt', 'lifecycleStatus'])
  sort?: 'code' | 'updatedAt' | 'lifecycleStatus';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}

export class CreateProjectProductDto {
  @IsString() @Length(1, 50) code!: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsString() @Length(1, 200) positionName?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @Length(1, 200) customProductName?: string;
  @IsOptional() @IsString() @Length(1, 4000) customDescription?: string;
  @IsOptional() @IsString() @Length(1, 500) material?: string;
  @IsOptional() @IsString() @Length(1, 500) finish?: string;
  @IsOptional() @IsString() @Length(1, 200) color?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) width?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) depth?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) height?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) length?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) diameter?: number;
  @IsOptional() @IsString() @Length(1, 20) dimensionUnit?: string;
  @IsOptional() @IsString() @Length(1, 500) customDimensionNote?: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity!: number;
  @IsString() @Length(1, 30) unit!: string;
  @IsOptional() @IsString() @Length(1, 100) countryOfOrigin?: string;
  @IsOptional() @IsString() @Length(1, 200) factoryName?: string;
  @IsOptional() @Type(() => Date) @IsDate() customerApprovalDueAt?: Date;
  @IsOptional() @Type(() => Date) @IsDate() technicalApprovalDueAt?: Date;
  @IsOptional() @Type(() => Date) @IsDate() commercialApprovalDueAt?: Date;
}

export class UpdateProjectProductDto extends PartialType(
  CreateProjectProductDto,
) {}

export class ProjectProductDecisionDto {
  @IsIn(['APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED'])
  decision!: 'APPROVED' | 'APPROVED_WITH_COMMENTS' | 'REJECTED';
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
  @IsOptional() @IsString() @Length(1, 200) approvedByExternalName?: string;
  @IsOptional()
  @IsIn([
    'SIGNED_DOCUMENT',
    'EMAIL_CONFIRMATION',
    'MEETING_MINUTES',
    'CUSTOMER_PORTAL',
    'OTHER',
  ])
  approvalMethod?: string;
  @IsOptional() @IsUUID() evidenceFileAssetId?: string;
}

export class CreateProjectLocationDto {
  @IsOptional() @IsUUID() parentId?: string;
  @IsIn(['BUILDING', 'FLOOR', 'ZONE', 'ROOM', 'AREA'])
  type!: 'BUILDING' | 'FLOOR' | 'ZONE' | 'ROOM' | 'AREA';
  @IsString() @Length(1, 50) code!: string;
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class CreateProjectRequiredDocumentDto {
  @IsString() @Length(1, 50) stageKey!: string;
  @IsString() @Length(1, 100) workstreamKey!: string;
  @IsString() @Length(1, 100) documentType!: string;
  @IsString() @Length(1, 300) documentName!: string;
  @IsOptional() @IsIn([false]) required?: false;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @Type(() => Date) @IsDate() dueDate?: Date;
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
}

export class ProjectDocumentsQuery extends PageQuery {
  @IsOptional() @IsUUID() requirementId?: string;
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional() @IsString() @Length(1, 50) stageKey?: string;
  @IsOptional() @IsString() @Length(1, 100) workstreamKey?: string;
  @IsOptional() @IsString() @Length(1, 50) status?: string;
  @IsOptional() @IsIn(['true', 'false']) required?: string;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsIn(['true']) overdue?: string;
  @IsOptional() @IsIn(['true']) missingFile?: string;
  @IsOptional()
  @IsIn(['documentName', 'dueDate', 'status', 'updatedAt'])
  sort?: 'documentName' | 'dueDate' | 'status' | 'updatedAt';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}

export class UpdateProjectRequiredDocumentDto {
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID()
  ownerUserId?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsDateString()
  dueDate?: string | null;
}

export class LinkProjectDocumentFileDto {
  @IsUUID() fileAssetId!: string;
}

export class ProjectDocumentDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
}

export class ProjectDocumentNotApplicableDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  reason!: string;
}
