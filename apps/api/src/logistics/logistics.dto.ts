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

export class ShipmentsQuery extends PageQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsOptional() @IsUUID() forwarderId?: string;
  @IsOptional() @IsString() mode?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Date) @IsDate() etdFrom?: Date;
  @IsOptional() @Type(() => Date) @IsDate() etdTo?: Date;
  @IsOptional() @Type(() => Date) @IsDate() etaFrom?: Date;
  @IsOptional() @Type(() => Date) @IsDate() etaTo?: Date;
}
export class ShipmentItemDto {
  @IsUUID() purchaseOrderLineId!: string;
  @IsNumberString() quantity!: string;
  @IsOptional() @IsNumberString() weight?: string;
  @IsOptional() @IsNumberString() volume?: string;
  @IsOptional() @IsUUID() packageId?: string;
}
export class CreateShipmentDto {
  @IsString() @Length(1, 100) shipmentNumber!: string;
  @IsUUID() purchaseOrderId!: string;
  @IsOptional() @IsUUID() productionOrderId?: string;
  @IsOptional() @IsUUID() forwarderId?: string;
  @IsString() @Length(8, 200) idempotencyKey!: string;
  @IsIn(['SEA', 'AIR', 'ROAD', 'RAIL', 'COURIER', 'MULTIMODAL'])
  mode!: string;
  @IsOptional() @IsString() incoterms?: string;
  @IsString() originCountry!: string;
  @IsString() originLocation!: string;
  @IsString() destinationCountry!: string;
  @IsString() destinationLocation!: string;
  @IsOptional() @IsString() portOfLoading?: string;
  @IsOptional() @IsString() portOfDischarge?: string;
  @IsOptional() @Type(() => Date) @IsDate() etd?: Date;
  @IsOptional() @Type(() => Date) @IsDate() eta?: Date;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShipmentItemDto)
  items!: ShipmentItemDto[];
}
export class UpdateShipmentDto {
  @IsOptional() @IsUUID() forwarderId?: string;
  @IsOptional() @Type(() => Date) @IsDate() etd?: Date;
  @IsOptional() @Type(() => Date) @IsDate() eta?: Date;
  @IsOptional() @IsString() containerNumber?: string;
  @IsOptional() @IsString() sealNumber?: string;
  @IsOptional() @IsString() billOfLading?: string;
  @IsOptional() @IsString() airWaybill?: string;
  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
export class ShipmentStatusDto {
  @IsIn([
    'BOOKED',
    'PICKED_UP',
    'DEPARTED',
    'IN_TRANSIT',
    'CUSTOMS_CLEARANCE',
    'ARRIVED',
    'DELIVERED_TO_WAREHOUSE',
    'CLOSED',
    'CANCELLED',
  ])
  status!: string;
  @IsOptional() @IsString() comment?: string;
}
export class ShipmentLegDto {
  @Type(() => Number) @IsInt() @Min(1) sequence!: number;
  @IsIn(['SEA', 'AIR', 'ROAD', 'RAIL', 'COURIER']) mode!: string;
  @IsOptional() @IsString() carrier?: string;
  @IsString() origin!: string;
  @IsString() destination!: string;
  @IsOptional() @Type(() => Date) @IsDate() etd?: Date;
  @IsOptional() @Type(() => Date) @IsDate() eta?: Date;
  @IsOptional() @IsString() trackingReference?: string;
}
export class ShipmentPackageDto {
  @IsString() packageNumber!: string;
  @IsOptional() @IsString() packageType?: string;
  @IsOptional() @IsNumberString() grossWeight?: string;
  @IsOptional() @IsNumberString() netWeight?: string;
  @IsOptional() @IsNumberString() volume?: string;
  @IsOptional() @IsString() marks?: string;
}
export class ShipmentDocumentDto {
  @IsUUID() fileId!: string;
  @IsString() type!: string;
  @IsString() @Length(64, 64) checksum!: string;
}
export class ForwarderDto {
  @IsString() code!: string;
  @IsString() legalName!: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() notes?: string;
}
export class CustomsLineDto {
  @IsUUID() shipmentItemId!: string;
  @IsString() hsCode!: string;
  @IsString() description!: string;
  @IsNumberString() quantity!: string;
  @IsNumberString() customsValue!: string;
  @IsOptional() @IsNumberString() dutyRate?: string;
}
export class CreateCustomsDto {
  @IsUUID() shipmentId!: string;
  @IsString() declarationNumber!: string;
  @Type(() => Date) @IsDate() declarationDate!: Date;
  @IsString() customsOffice!: string;
  @IsString() importerLegalEntity!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsNumberString() exchangeRateSnapshot!: string;
  @IsOptional() @IsNumberString() vatAmount?: string;
  @IsOptional() @IsNumberString() otherTaxAmount?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomsLineDto)
  lines!: CustomsLineDto[];
}
export class CustomsStatusDto {
  @IsIn([
    'SUBMITTED',
    'UNDER_REVIEW',
    'ADDITIONAL_DOCUMENT_REQUIRED',
    'ASSESSED',
    'TAX_DUE',
    'TAX_PAID',
    'CLEARED',
    'REJECTED',
    'CANCELLED',
  ])
  status!: string;
  @IsOptional() @IsString() comment?: string;
}
export class ManualAllocationDto {
  @IsUUID() shipmentItemId!: string;
  @IsNumberString() amount!: string;
}
export class LandedCostLineDto {
  @IsIn([
    'FREIGHT',
    'INSURANCE',
    'CUSTOMS_DUTY',
    'IMPORT_TAX',
    'HANDLING',
    'PORT_CHARGES',
    'WAREHOUSE_DELIVERY',
    'INSPECTION',
    'BANK_CHARGE',
    'OTHER',
  ])
  category!: string;
  @IsString() description!: string;
  @IsString() @Length(3, 3) originalCurrency!: string;
  @IsNumberString() originalAmount!: string;
  @IsNumberString() exchangeRateSnapshot!: string;
  @IsIn(['BY_VALUE', 'BY_WEIGHT', 'BY_VOLUME', 'BY_QUANTITY', 'MANUAL'])
  allocationMethod!: string;
  @IsOptional() @IsString() manualReason?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualAllocationDto)
  allocations?: ManualAllocationDto[];
}
export class CreateLandedCostDto {
  @IsUUID() shipmentId!: string;
  @IsString() number!: string;
  @IsString() @Length(3, 3) baseCurrency!: string;
  @IsString() @Length(8, 200) idempotencyKey!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LandedCostLineDto)
  lines!: LandedCostLineDto[];
}
