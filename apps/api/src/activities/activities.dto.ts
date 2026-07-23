import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { businessEntityTypes } from '../access-control/business-entity.policy';
import { PageQuery } from '../common.dto';

export class ActivitiesQuery extends PageQuery {
  @IsIn(businessEntityTypes) entityType!: string;
  @IsUUID() entityId!: string;
  @IsOptional() @IsString() eventType?: string;
}
