import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PageQuery } from '../common.dto';
const entityTypes = [
  'Customer',
  'Contact',
  'Lead',
  'Opportunity',
  'Project',
  'Task',
  'Survey',
  'Requirement',
  'MarketingContent',
] as const;
export class CreateCommentDto {
  @IsIn(entityTypes) entityType!: (typeof entityTypes)[number];
  @IsUUID() entityId!: string;
  @IsString() @Length(1, 10000) body!: string;
  @IsOptional() @IsUUID('4', { each: true }) mentionedUserIds?: string[];
  @IsOptional() @IsUUID('4', { each: true }) mentionedDepartmentIds?: string[];
}
export class UpdateCommentDto {
  @IsString() @Length(1, 10000) body!: string;
}
export class CommentsQuery extends PageQuery {
  @IsIn(entityTypes) entityType!: (typeof entityTypes)[number];
  @IsUUID() entityId!: string;
  @IsOptional() @IsUUID() parentCommentId?: string;
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}
