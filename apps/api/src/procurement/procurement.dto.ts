import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common.dto';
export class PurchaseRequestsQuery extends PageQuery {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsString() status?: string;
}
export class PurchaseRequestLineDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsString() customDescription?: string;
  @IsNumberString() quantity!: string;
  @IsString() @Length(1, 30) unit!: string;
  @IsOptional() @IsUUID() preferredSupplierId?: string;
  @IsOptional() @IsNumberString() targetPrice?: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsOptional() @Type(() => Date) @IsDate() requiredDate?: Date;
  @IsOptional() @IsString() projectArea?: string;
  @IsOptional() @IsString() technicalRequirements?: string;
  @IsOptional() @IsString() notes?: string;
}
export class CreatePurchaseRequestDto {
  @IsString() @Length(1, 100) requestNumber!: string;
  @IsUUID() projectId!: string;
  @IsIn([
    'APPROVED_ESTIMATE',
    'ACCEPTED_QUOTATION',
    'SIGNED_CONTRACT',
    'PROJECT_REQUIREMENT',
    'STOCK_REPLENISHMENT',
    'WARRANTY_REPLACEMENT',
    'MANUAL',
  ])
  sourceType!: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @Type(() => Date) @IsDate() requiredDate?: Date;
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority!:
    | 'LOW'
    | 'NORMAL'
    | 'HIGH'
    | 'URGENT';
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines!: PurchaseRequestLineDto[];
}
export class UpdatePurchaseRequestDto {
  @IsOptional() @Type(() => Date) @IsDate() requiredDate?: Date;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?:
    | 'LOW'
    | 'NORMAL'
    | 'HIGH'
    | 'URGENT';
  @IsOptional() @IsString() notes?: string;
}
export class ProcurementDecisionDto {
  @IsOptional() @IsString() @Length(1, 1000) comment?: string;
}
export class RFQsQuery extends PageQuery {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() purchaseRequestId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
}
export class CreateRFQDto {
  @IsString() @Length(1, 100) rfqNumber!: string;
  @IsUUID() purchaseRequestId!: string;
  @Type(() => Date) @IsDate() responseDeadline!: Date;
  @IsString() @Length(3, 3) requestedCurrency!: string;
  @IsOptional() @IsString() requestedIncoterms?: string;
  @IsString() deliveryDestination!: string;
  @IsOptional() @IsString() deliveryCountry?: string;
  @IsOptional() @IsString() technicalRequirements?: string;
  @IsOptional() @IsString() commercialRequirements?: string;
  @IsIn(['VI', 'EN', 'BILINGUAL']) language!: string;
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  supplierIds!: string[];
}
export class UpdateRFQDto {
  @IsOptional() @Type(() => Date) @IsDate() responseDeadline?: Date;
  @IsOptional() @IsString() requestedIncoterms?: string;
  @IsOptional() @IsString() deliveryDestination?: string;
  @IsOptional() @IsString() technicalRequirements?: string;
  @IsOptional() @IsString() commercialRequirements?: string;
}
export class AddRFQRecipientsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  supplierIds!: string[];
}
export class CreateClarificationDto {
  @IsUUID() supplierId!: string;
  @IsString() subject!: string;
  @IsString() question!: string;
}

export class SupplierQuotationsQuery extends PageQuery {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() rfqId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
}

export class SupplierQuotationLineDto {
  @IsUUID() rfqLineId!: string;
  @IsOptional() @IsString() supplierProductCode?: string;
  @IsString() @Length(1, 1000) description!: string;
  @IsNumberString() quantity!: string;
  @IsString() @Length(1, 30) unit!: string;
  @IsNumberString() listPrice!: string;
  @IsOptional() @IsNumberString() discountPercent?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) leadTimeDays?: number;
  @IsOptional()
  @IsIn(['PENDING', 'COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT'])
  technicalCompliance?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) warrantyMonths?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateSupplierQuotationDto {
  @IsUUID() rfqId!: string;
  @IsUUID() supplierId!: string;
  @IsOptional() @IsUUID() supplierContactId?: string;
  @IsString() @Length(1, 100) quotationNumber!: string;
  @Type(() => Date) @IsDate() quotationDate!: Date;
  @IsOptional() @Type(() => Date) @IsDate() receivedDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() validUntil?: Date;
  @IsString() @Length(3, 3) currency!: string;
  @IsNumberString() exchangeRateSnapshot!: string;
  @IsOptional() @IsString() incoterms?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  productionLeadTimeDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shippingLeadTimeDays?: number;
  @IsOptional() @IsString() warrantyTerms?: string;
  @IsOptional() @IsNumberString() shippingCost?: string;
  @IsOptional() @IsNumberString() insuranceCost?: string;
  @IsOptional() @IsNumberString() discountAmount?: string;
  @IsOptional() @IsNumberString() taxAmount?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierQuotationLineDto)
  lines!: SupplierQuotationLineDto[];
}

export class UpdateSupplierQuotationDto {
  @IsOptional() @Type(() => Date) @IsDate() validUntil?: Date;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() warrantyTerms?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateSupplierComparisonDto {
  @IsUUID() rfqId!: string;
  @IsString() @Length(3, 3) baseCurrency!: string;
  @Type(() => Date) @IsDate() exchangeRateDate!: Date;
}

export class SupplierSelectionLineDto {
  @IsUUID() supplierQuotationLineId!: string;
  @IsNumberString() quantity!: string;
}

export class SelectSupplierDto {
  @IsUUID() supplierQuotationId!: string;
  @IsString() @Length(1, 2000) selectionReason!: string;
  @IsOptional() @IsString() commercialAssessment?: string;
  @IsOptional() @IsString() technicalAssessment?: string;
  @IsOptional() @IsString() riskAssessment?: string;
  @IsString() @Length(8, 200) idempotencyKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierSelectionLineDto)
  selectedLines!: SupplierSelectionLineDto[];
}

export class CreatePurchaseOrderDto {
  @IsUUID() supplierSelectionId!: string;
  @IsString() @Length(1, 100) poNumber!: string;
  @IsString() @Length(1, 1000) deliveryAddress!: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @Type(() => Date) @IsDate() expectedProductionStart?: Date;
  @IsOptional() @Type(() => Date) @IsDate() expectedReadyDate?: Date;
  @IsOptional() @IsString() notes?: string;
}
