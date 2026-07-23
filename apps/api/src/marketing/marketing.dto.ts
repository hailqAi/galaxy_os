import {
  IsDateString,
  IsIn,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ContentStatus, PublishingStatus } from '@prisma/client';
import { PageQuery } from '../common.dto';

export class CampaignDto {
  @IsString() @Length(2, 200) name!: string;
  @IsIn(['Galaxycentre.vn', 'Galaxylink.vn']) brandEcosystem!: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() utmSource?: string;
  @IsOptional() @IsString() utmMedium?: string;
  @IsOptional() @IsString() utmCampaign?: string;
}
export class ContentDto {
  @IsString() @Length(2, 250) title!: string;
  @IsString() @Length(1, 50000) originalContent!: string;
  @IsOptional() @IsUUID() campaignId?: string;
  @IsIn(['Galaxycentre.vn', 'Galaxylink.vn']) brandEcosystem!: string;
  @IsOptional() @IsUUID() reviewerId?: string;
  @IsOptional() @IsUUID() approverId?: string;
}
export class VariantDto {
  @IsIn(['WEBSITE', 'FACEBOOK', 'YOUTUBE', 'TIKTOK']) channel!: string;
  @IsOptional() @IsString() title?: string;
  @IsString() @Length(1, 50000) body!: string;
}
export class ScheduleDto {
  @IsDateString() scheduledAt!: string;
}
export class MarketingQuery extends PageQuery {
  @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @IsOptional() @IsString() channel?: string;
}
export class ProcessDueDto {
  @IsOptional() @IsInt() @Min(1) @Max(20) limit = 10;
}
export class PublishingQuery extends PageQuery {
  @IsOptional() @IsEnum(PublishingStatus) status?: PublishingStatus;
  @IsOptional()
  @IsIn(['WEBSITE', 'FACEBOOK', 'YOUTUBE', 'TIKTOK'])
  channel?: string;
}
