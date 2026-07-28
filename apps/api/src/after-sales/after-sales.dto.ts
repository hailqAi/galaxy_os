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

export class HandoverDocumentDto {
  @IsUUID() fileAssetId!: string;
  @IsIn([
    'HANDOVER_MINUTES',
    'PRODUCT_LIST',
    'SERIAL_NUMBER_LIST',
    'USER_MANUAL',
    'WARRANTY_DOCUMENT',
    'AS_BUILT_DRAWING',
    'CERTIFICATE',
    'OPEN_ISSUE_LIST',
    'AFTER_SALES_CONTACT',
    'CUSTOM_DOCUMENT',
  ])
  type!: string;
  @IsString() checksum!: string;
  @IsIn(['VI', 'EN', 'BILINGUAL']) language!: string;
}

export class SignDocumentDto {
  @IsIn([
    'NOT_REQUIRED',
    'PENDING',
    'SIGNED_MANUALLY',
    'SIGNED_EXTERNALLY',
    'REJECTED',
  ])
  signedStatus!: string;
}

export class CreateServiceVisitDto {
  @Type(() => Date) @IsDate() scheduledAt!: Date;
  @IsOptional() @Type(() => Date) @IsDate() scheduledEnd?: Date;
  @IsOptional() @IsUUID() technicianId?: string;
  @IsIn([
    'INSPECTION',
    'DIAGNOSIS',
    'REPAIR',
    'REPLACEMENT',
    'MAINTENANCE',
    'FOLLOW_UP',
    'OTHER',
  ])
  visitType!: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactPhone?: string;
}

export class CompleteServiceVisitDto {
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @IsString() workPerformed?: string;
  @IsOptional() @IsUUID() evidenceFileId?: string;
  @IsOptional() @IsString() customerNotes?: string;
  @IsOptional() @IsString() technicianNotes?: string;
  @IsOptional() @IsBoolean() followUpRequired?: boolean;
  @IsOptional() @Type(() => Date) @IsDate() followUpDate?: Date;
}

export class CreateWarrantyClaimDto {
  @IsString() claimNumber!: string;
  @IsOptional() @IsUUID() warrantyAssetId?: string;
  @IsIn([
    'CUSTOMER_WARRANTY',
    'SUPPLIER_WARRANTY',
    'TRANSPORT_DAMAGE',
    'INSTALLATION_DEFECT',
    'MANUFACTURING_DEFECT',
    'GOODWILL',
    'OTHER',
  ])
  claimType!: string;
  @IsString() issueDescription!: string;
  @IsOptional() @IsString() diagnosis?: string;
  @IsIn(['MANUAL', 'EMAIL_EXTERNAL', 'PORTAL_EXTERNAL', 'API'])
  submissionMode!: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
}

export class DecideWarrantyClaimDto {
  @IsIn([
    'APPROVED',
    'PARTIALLY_APPROVED',
    'REJECTED',
    'ADDITIONAL_INFO_REQUIRED',
  ])
  status!: string;
  @IsIn([
    'COVERED',
    'PARTIALLY_COVERED',
    'NOT_COVERED',
    'GOODWILL_APPROVED',
    'PENDING',
  ])
  coverageDecision!: string;
  @IsOptional() @IsString() supplierReference?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateReplacementDto {
  @IsUUID() replacementProductId!: string;
  @IsOptional() @IsUUID() replacementVariantId?: string;
  @IsString() warrantyDecision!: string;
  @IsOptional() @IsString() notes?: string;
}
