import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class InspectionItemDto {
  @IsOptional() @IsUUID() installationItemId?: string;
  @IsString() scope!: string;
}
export class CreateInspectionDto {
  @IsUUID() projectId!: string;
  @IsString() inspectionNumber!: string;
  @IsIn(['INTERNAL', 'CUSTOMER', 'CONSULTANT', 'SUPPLIER']) type!: string;
  @IsOptional() @Type(() => Date) @IsDate() scheduledAt?: Date;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items!: InspectionItemDto[];
}
export class DecideInspectionItemDto {
  @IsIn(['PASSED', 'FAILED']) result!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() evidenceFileId?: string;
  @IsOptional() @IsBoolean() createPunch?: boolean;
}
export class ParticipantDto {
  @IsString() name!: string;
  @IsString() role!: string;
  @IsIn(['PENDING', 'SIGNED', 'DECLINED']) signingStatus!: string;
}
export class CreateAcceptanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants!: ParticipantDto[];
  @IsOptional() @IsUUID() signedDocumentId?: string;
}
export class HandoverItemDto {
  @IsUUID() installationItemId!: string;
  @IsString() description!: string;
}
export class ChecklistDto {
  @IsString() title!: string;
  @IsOptional() @IsBoolean() required?: boolean;
}
export class CreateHandoverDto {
  @IsUUID() projectId!: string;
  @IsString() handoverNumber!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HandoverItemDto)
  items!: HandoverItemDto[];
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChecklistDto)
  checklist!: ChecklistDto[];
}
export class CompleteHandoverDto {
  @IsOptional() @IsString() overrideReason?: string;
}
export class CreateTicketDto {
  @IsString() ticketNumber!: string;
  @IsUUID() customerId!: string;
  @IsUUID() projectId!: string;
  @IsOptional() @IsUUID() warrantyAssetId?: string;
  @IsString() issueCategory!: string;
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority!: string;
  @IsString() description!: string;
  @IsOptional() @Type(() => Date) @IsDate() slaDueAt?: Date;
  @IsBoolean() chargeable!: boolean;
  @IsOptional() @IsNumberString() estimatedCost?: string;
}
export class TicketStatusDto {
  @IsIn([
    'TRIAGED',
    'SCHEDULED',
    'IN_PROGRESS',
    'WAITING_PARTS',
    'WAITING_SUPPLIER',
    'CANCELLED',
  ])
  status!: string;
}
export class ResolveTicketDto {
  @IsString() summary!: string;
  @IsUUID() evidenceFileId!: string;
}
export class ConfirmTicketDto {
  @IsString() customerName!: string;
  @IsBoolean() confirmed!: boolean;
  @IsOptional() @IsString() comments?: string;
  @IsOptional() @IsUUID() documentId?: string;
}
