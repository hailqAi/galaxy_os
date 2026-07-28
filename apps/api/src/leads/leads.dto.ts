import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export class CreateLeadDto {
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() @Length(1, 200) companyName?: string;
  @IsOptional() @IsString() @Length(1, 200) contactName?: string;
  @IsOptional() @IsString() @Length(5, 30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsOptional() @IsUUID() contentItemId?: string;
  @IsOptional()
  @IsIn(['WEBSITE', 'FACEBOOK', 'YOUTUBE', 'TIKTOK'])
  attributionChannel?: string;
  @IsOptional() @IsString() @Length(1, 200) utmSource?: string;
  @IsOptional() @IsString() @Length(1, 200) utmMedium?: string;
  @IsOptional() @IsString() @Length(1, 200) utmCampaign?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional()
  @IsIn(['NEW', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED'])
  status?: 'NEW' | 'ASSIGNED' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED';
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?:
    | 'LOW'
    | 'NORMAL'
    | 'HIGH'
    | 'URGENT';
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
  @IsOptional() @IsString() @Length(1, 5000) notes?: string;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

export class AssignLeadDto {
  @IsUUID() ownerId!: string;
  @IsOptional() @IsUUID() departmentId?: string;
}

export class ChangeLeadStatusDto {
  @IsIn([
    'NEW',
    'ASSIGNED',
    'CONTACTED',
    'QUALIFIED',
    'UNQUALIFIED',
    'ARCHIVED',
  ])
  status!:
    | 'NEW'
    | 'ASSIGNED'
    | 'CONTACTED'
    | 'QUALIFIED'
    | 'UNQUALIFIED'
    | 'ARCHIVED';
}
