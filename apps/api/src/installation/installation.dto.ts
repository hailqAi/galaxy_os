import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateInstallationPlanDto {
  @IsUUID() projectId!: string;
  @IsString() planNumber!: string;
  @IsString() name!: string;
  @IsOptional() @Type(() => Date) @IsDate() plannedStartDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() plannedCompletionDate?: Date;
  @IsBoolean() siteReady!: boolean;
  @IsBoolean() customerCoordination!: boolean;
}

export class ChecklistDto {
  @IsString() title!: string;
  @IsOptional() @IsBoolean() required?: boolean;
}

export class CreateWorkOrderDto {
  @IsString() workOrderNumber!: string;
  @IsString() title!: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @Type(() => Date) @IsDate() plannedDate?: Date;
  @IsBoolean() requiredInventory!: boolean;
  @IsBoolean() approvedDrawing!: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChecklistDto)
  checklist!: ChecklistDto[];
}

export class ReleaseWorkOrderDto {
  @IsOptional() @IsString() overrideReason?: string;
}

export class InstallItemDto {
  @IsUUID() stockIssueLineId!: string;
  @IsUUID() inventoryItemId!: string;
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsUUID() lotId?: string;
  @IsOptional() @IsUUID() serialId?: string;
  @IsOptional() @IsString() area?: string;
  @IsOptional() @IsString() room?: string;
  @IsOptional() @IsString() position?: string;
}

export class SiteDailyLogDto {
  @Type(() => Date) @IsDate() logDate!: Date;
  @IsString() siteCondition!: string;
  @IsInt() @Min(0) peopleOnsite!: number;
  @IsString() workCompleted!: string;
  @IsOptional() @IsString() materialUsed?: string;
  @IsOptional() @IsString() issues?: string;
  @IsOptional() @IsString() customerComments?: string;
  @IsOptional() @IsString() nextPlan?: string;
}

export class PunchItemDto {
  @IsString() issue!: string;
  @IsString() location!: string;
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) severity!: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @Type(() => Date) @IsDate() dueDate?: Date;
  @IsOptional() @IsUUID() evidenceFileId?: string;
}

export class ResolvePunchDto {
  @IsString() resolution!: string;
}
