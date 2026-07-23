import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
export class CreateTaskDto {
  @IsString() @Length(1, 300) title!: string;
  @IsOptional() @IsString() @Length(1, 10000) description?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @Length(1, 100) relatedEntityType?: string;
  @IsOptional() @IsUUID() relatedEntityId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?:
    | 'LOW'
    | 'NORMAL'
    | 'HIGH'
    | 'URGENT';
  @IsOptional() @IsIn(['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW']) status?:
    | 'TODO'
    | 'IN_PROGRESS'
    | 'BLOCKED'
    | 'IN_REVIEW';
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsUUID('4', { each: true }) assigneeIds?: string[];
}
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
export class TaskUsersDto {
  @IsUUID('4', { each: true }) userIds!: string[];
}
export class ChangeTaskStatusDto {
  @IsIn(['TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'])
  status!:
    | 'TODO'
    | 'IN_PROGRESS'
    | 'BLOCKED'
    | 'IN_REVIEW'
    | 'DONE'
    | 'CANCELLED';
}
export class ChecklistDto {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsString() @Length(1, 300) title?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}
