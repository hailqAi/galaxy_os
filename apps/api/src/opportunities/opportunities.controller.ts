import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import {
  ChangeStageDto,
  CreateOpportunityDto,
  MarkLostDto,
  UpdateOpportunityDto,
} from './opportunities.dto';
import { OpportunitiesService } from './opportunities.service';
class OpportunitiesQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional()
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
  stage?:
    | 'DISCOVERY'
    | 'QUALIFICATION'
    | 'SURVEY'
    | 'REQUIREMENT'
    | 'DESIGN_PREPARATION'
    | 'PROPOSAL'
    | 'NEGOTIATION'
    | 'WON'
    | 'LOST';
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @Type(() => Date) @IsDate() closeFrom?: Date;
  @IsOptional() @Type(() => Date) @IsDate() closeTo?: Date;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) valueMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) valueMax?: number;
  @IsOptional()
  @IsIn(['name', 'updatedAt', 'expectedCloseDate', 'estimatedValue'])
  sort?: 'name' | 'updatedAt' | 'expectedCloseDate' | 'estimatedValue';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}
@Controller('opportunities')
export class OpportunitiesController {
  constructor(
    @Inject(OpportunitiesService)
    private readonly opportunities: OpportunitiesService,
  ) {}
  @Get() @RequirePermission('crm.opportunity.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: OpportunitiesQuery,
  ) {
    return this.opportunities.list(actor, query);
  }
  @Post() @RequirePermission('crm.opportunity.create') create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateOpportunityDto,
  ) {
    return this.opportunities.create(actor, data);
  }
  @Get(':id') @RequirePermission('crm.opportunity.read') get(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.opportunities.get(actor, id);
  }
  @Patch(':id') @RequirePermission('crm.opportunity.update') update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateOpportunityDto,
  ) {
    return this.opportunities.update(actor, id, data);
  }
  @Delete(':id') @RequirePermission('crm.opportunity.delete') remove(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.opportunities.remove(actor, id);
  }
  @Post(':id/change-stage')
  @RequirePermission('crm.opportunity.change_stage')
  stage(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ChangeStageDto,
  ) {
    return this.opportunities.changeStage(actor, id, data);
  }
  @Post(':id/mark-won') @RequirePermission('crm.opportunity.change_stage') won(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.opportunities.markWon(actor, id);
  }
  @Post(':id/mark-lost')
  @RequirePermission('crm.opportunity.change_stage')
  lost(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: MarkLostDto,
  ) {
    return this.opportunities.markLost(actor, id, data.lostReason);
  }
  @Post(':id/create-project')
  @RequirePermission('crm.opportunity.convert')
  project(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.opportunities.createProject(actor, id);
  }
}
