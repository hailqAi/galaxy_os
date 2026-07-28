import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PageQuery } from '../common.dto';

export class CatalogQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
}

export class BrandDto {
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() @Length(2, 100) country?: string;
  @IsOptional() @IsUrl() website?: string;
  @IsOptional() @IsString() @Length(1, 100) brandType?: string;
  @IsOptional() @IsString() @Length(1, 200) ecosystem?: string;
  @IsString() @Length(3, 3) defaultCurrency!: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  defaultLeadTimeDays?: number;
  @IsOptional() @IsString() warrantyPolicy?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ProductDto {
  @IsUUID() brandId!: string;
  @IsString() @Length(1, 100) productCode!: string;
  @IsString() @Length(1, 300) name!: string;
  @IsOptional() @IsString() collection?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;
  @IsString() @Length(1, 30) unit!: string;
  @IsOptional() @IsObject() dimensions?: Record<string, unknown>;
  @IsOptional() @IsString() materials?: string;
  @IsOptional() @IsString() finishes?: string;
  @IsOptional() @IsObject() technicalData?: Record<string, unknown>;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1200)
  warrantyMonths?: number;
  @IsBoolean() installationRequired!: boolean;
  @IsBoolean() serialTrackingRequired!: boolean;
  @IsBoolean() lotTrackingRequired!: boolean;
}

export class SupplierDto {
  @IsString() @Length(1, 300) legalName!: string;
  @IsOptional() @IsString() tradingName?: string;
  @IsString() @Length(2, 100) country!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxVatNumber?: string;
  @IsOptional() @IsUrl() website?: string;
  @IsArray() @IsString({ each: true }) languages!: string[];
  @IsString() @Length(3, 3) currency!: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() incoterms?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  typicalLeadTimeDays?: number;
  @IsOptional() @IsString() discountAgreement?: string;
  @IsOptional() @IsString() territory?: string;
  @IsBoolean() authorizedDistributorStatus!: boolean;
  @IsOptional() @IsString() riskNotes?: string;
}

export class SupplierContactDto {
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() messagingReference?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() preferredCommunicationChannel?: string;
}

export class BankReferenceDto {
  @IsString() @Length(1, 500) bankInformationReference!: string;
}
