import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export class EstimateLineDto {
  @IsString() @Length(1, 200) section!: string;
  @IsString() @Length(1, 50) itemType!: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() customDescription?: string;
  @IsNumberString() quantity!: string;
  @IsOptional() @IsNumberString() purchaseQuantity?: string;
  @IsString() @Length(1, 30) unit!: string;
  @IsOptional() @IsNumberString() netPurchasePrice?: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsNumberString() exchangeRateSnapshot!: string;
  @IsOptional() @IsNumberString() freightEstimate?: string;
  @IsOptional() @IsNumberString() taxEstimate?: string;
  @IsOptional() @IsNumberString() installationCost?: string;
  @IsOptional() @IsNumberString() otherCost?: string;
  @IsNumberString() sellingPrice!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsIn(['CONFIRMED', 'PROVISIONAL', 'MISSING'])
  priceStatus?: 'CONFIRMED' | 'PROVISIONAL' | 'MISSING';
  @IsOptional()
  @IsIn(['SUPPLIER_QUOTATION', 'HISTORICAL', 'STANDARD', 'MANUAL'])
  priceSourceType?: 'SUPPLIER_QUOTATION' | 'HISTORICAL' | 'STANDARD' | 'MANUAL';
  @IsOptional() @IsDateString() priceQuotedAt?: string;
  @IsOptional() @IsDateString() priceValidUntil?: string;
  @IsOptional() @IsString() @Length(1, 500) sourceDocument?: string;
  @IsOptional() @IsBoolean() contributesToTotal?: boolean;
}

export class CreateEstimateDto {
  @IsString() @Length(1, 100) number!: string;
  @IsString() @Length(1, 300) title!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EstimateLineDto)
  lines!: EstimateLineDto[];
}

export class DecisionDto {
  @IsOptional() @IsString() @Length(1, 1000) comment?: string;
}

export class CreateQuotationDto {
  @IsUUID() estimateId!: string;
  @IsString() @Length(1, 100) number!: string;
  @IsOptional() @Type(() => Date) @IsDate() validityDate?: Date;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() deliveryTerms?: string;
  @IsOptional() @IsString() warrantyTerms?: string;
  @IsOptional() @IsNumberString() discount?: string;
  @IsOptional() @IsNumberString() tax?: string;
  @IsOptional() @IsNumberString() shipping?: string;
  @IsOptional() @IsNumberString() installation?: string;
  @IsOptional() @IsNumberString() warranty?: string;
  @IsOptional() @IsString() installationTerms?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ReviseQuotationDto {
  @IsOptional() @Type(() => Date) @IsDate() validityDate?: Date;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() deliveryTerms?: string;
  @IsOptional() @IsString() installationTerms?: string;
  @IsOptional() @IsString() warrantyTerms?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumberString() discount?: string;
  @IsOptional() @IsNumberString() tax?: string;
  @IsOptional() @IsNumberString() shipping?: string;
  @IsOptional() @IsNumberString() installation?: string;
  @IsOptional() @IsNumberString() warranty?: string;
}

export class GenerateQuotationDocumentDto {
  @IsIn(['PDF', 'XLSX']) format!: 'PDF' | 'XLSX';
  @IsIn(['VI', 'EN', 'BILINGUAL']) language!: 'VI' | 'EN' | 'BILINGUAL';
}
