import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PageQuery } from '../common.dto';
const uploadEntityTypes = [
  'Customer',
  'Contact',
  'Lead',
  'Opportunity',
  'Project',
  'Task',
  'Survey',
  'Requirement',
  'ProjectProductLine',
  'Comment',
  'MarketingContent',
] as const;
const entityTypes = [...uploadEntityTypes, 'ProjectRequiredDocument'] as const;
export class UploadFileDto {
  @IsIn(uploadEntityTypes) entityType!: (typeof uploadEntityTypes)[number];
  @IsUUID() entityId!: string;
  @IsString() @Length(1, 100) category!: string;
  @IsOptional()
  @IsIn(['INTERNAL'])
  confidentiality?: 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL';
}
class FileMetadataDto {
  @IsString() @Length(1, 100) category!: string;
  @IsIn(['INTERNAL']) confidentiality!:
    | 'INTERNAL'
    | 'RESTRICTED'
    | 'CONFIDENTIAL';
}
export class UpdateFileDto extends PartialType(FileMetadataDto) {}
export class FilesQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsIn(entityTypes) entityType?: (typeof entityTypes)[number];
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsString() @Length(1, 100) category?: string;
  @IsOptional() @IsString() @Length(1, 200) mimeType?: string;
  @IsOptional() @IsUUID() uploadedById?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional()
  @IsIn(['originalFilename', 'createdAt', 'sizeBytes', 'updatedAt'])
  sort?: 'originalFilename' | 'createdAt' | 'sizeBytes' | 'updatedAt';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}
