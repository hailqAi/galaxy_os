import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export class CreateOpportunityDto {
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() primaryContactId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional()
  @IsIn([
    'DISCOVERY',
    'QUALIFICATION',
    'SURVEY',
    'REQUIREMENT',
    'DESIGN_PREPARATION',
    'PROPOSAL',
    'NEGOTIATION',
  ])
  stage?:
    | 'DISCOVERY'
    | 'QUALIFICATION'
    | 'SURVEY'
    | 'REQUIREMENT'
    | 'DESIGN_PREPARATION'
    | 'PROPOSAL'
    | 'NEGOTIATION';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsOptional() @IsDateString() expectedCloseDate?: string;
}
export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}
export class ChangeStageDto {
  @IsIn([
    'DISCOVERY',
    'QUALIFICATION',
    'SURVEY',
    'REQUIREMENT',
    'DESIGN_PREPARATION',
    'PROPOSAL',
    'NEGOTIATION',
    'WON',
    'LOST',
  ])
  stage!:
    | 'DISCOVERY'
    | 'QUALIFICATION'
    | 'SURVEY'
    | 'REQUIREMENT'
    | 'DESIGN_PREPARATION'
    | 'PROPOSAL'
    | 'NEGOTIATION'
    | 'WON'
    | 'LOST';
  @IsOptional() @IsString() @Length(1, 1000) lostReason?: string;
}
export class MarkLostDto {
  @IsString() @Length(1, 1000) lostReason!: string;
}
