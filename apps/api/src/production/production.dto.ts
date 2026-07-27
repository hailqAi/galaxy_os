import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PageQuery } from '../common.dto';

export class ProductionQuery extends PageQuery {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsString() status?: string;
}
export class CreateProductionOrderDto {
  @IsUUID() purchaseOrderId!: string;
  @IsOptional() @Type(() => Date) @IsDate() plannedStartDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() plannedReadyDate?: Date;
  @IsOptional() @IsUUID() supplierContactId?: string;
}
export class UpdateProductionOrderDto {
  @IsOptional() @Type(() => Date) @IsDate() plannedStartDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() plannedReadyDate?: Date;
  @IsOptional() @IsUUID() ownerId?: string;
}
export class ProductionStatusDto {
  @IsIn([
    'ORDER_CONFIRMED',
    'TECHNICAL_APPROVAL',
    'MATERIAL_PREPARATION',
    'IN_PRODUCTION',
    'QUALITY_CHECK',
    'PACKING',
    'READY_FOR_SHIPMENT',
    'DELAYED',
    'CANCELLED',
  ])
  status!: string;
  @IsOptional() @IsString() reason?: string;
}
export class ProductionMilestoneDto {
  @IsString() name!: string;
  @Type(() => Number) @IsInt() @Min(1) sequence!: number;
  @IsOptional() @Type(() => Date) @IsDate() plannedDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() actualDate?: Date;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsUUID() evidenceFileId?: string;
  @IsOptional() @IsString() factoryReport?: string;
  @IsOptional() @IsString() delayReason?: string;
}
export class ProductionUpdateDto {
  @IsNumberString() progressPercentage!: string;
  @IsString() summary!: string;
  @Type(() => Date) @IsDate() reportedAt!: Date;
}
export class TechnicalApprovalDto {
  @IsIn([
    'SHOP_DRAWING',
    'DIMENSION',
    'FINISH',
    'MATERIAL',
    'SAMPLE',
    'ELECTRICAL',
    'INSTALLATION',
    'OTHER',
  ])
  type!: string;
  @IsString() title!: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsString() description!: string;
  @IsOptional() @IsUUID() fileId?: string;
}
export class TechnicalRevisionDto {
  @IsString() description!: string;
  @IsOptional() @IsUUID() fileId?: string;
}
export class ApprovalDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: string;
  @IsOptional() @IsString() comment?: string;
}
export class SampleApprovalDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() fileId?: string;
}
export class QualityReportDto {
  @IsString() reportNumber!: string;
  @Type(() => Date) @IsDate() inspectionDate!: Date;
  @IsIn(['PASSED', 'FAILED', 'CONDITIONAL']) result!: string;
  @IsString() summary!: string;
  @IsOptional() @IsUUID() fileId?: string;
}
export class PackingRecordDto {
  @IsString() packingNumber!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) packageCount!: number;
  @IsOptional() @IsNumberString() grossWeight?: string;
  @IsOptional() @IsNumberString() volume?: string;
  @Type(() => Date) @IsDate() packedAt!: Date;
  @IsOptional() @IsUUID() fileId?: string;
}
