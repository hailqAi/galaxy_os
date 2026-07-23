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
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import {
  AssignLeadDto,
  ChangeLeadStatusDto,
  CreateLeadDto,
  UpdateLeadDto,
} from './leads.dto';
import { LeadsService } from './leads.service';

class LeadsQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional()
  @IsIn([
    'NEW',
    'ASSIGNED',
    'CONTACTED',
    'QUALIFIED',
    'UNQUALIFIED',
    'CONVERTED',
    'ARCHIVED',
  ])
  status?:
    | 'NEW'
    | 'ASSIGNED'
    | 'CONTACTED'
    | 'QUALIFIED'
    | 'UNQUALIFIED'
    | 'CONVERTED'
    | 'ARCHIVED';
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?:
    | 'LOW'
    | 'NORMAL'
    | 'HIGH'
    | 'URGENT';
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional() @Type(() => Date) @IsDate() expectedFrom?: Date;
  @IsOptional() @Type(() => Date) @IsDate() expectedTo?: Date;
  @IsOptional()
  @IsIn([
    'name',
    'updatedAt',
    'createdAt',
    'expectedCloseDate',
    'estimatedValue',
  ])
  sort?:
    | 'name'
    | 'updatedAt'
    | 'createdAt'
    | 'expectedCloseDate'
    | 'estimatedValue';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}

@Controller('leads')
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}
  @Get() @RequirePermission('crm.lead.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: LeadsQuery,
  ) {
    return this.leads.list(actor, query);
  }
  @Post() @RequirePermission('crm.lead.create') create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateLeadDto,
  ) {
    return this.leads.create(actor, data);
  }
  @Get(':id') @RequirePermission('crm.lead.read') get(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leads.get(actor, id);
  }
  @Patch(':id') @RequirePermission('crm.lead.update') update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateLeadDto,
  ) {
    return this.leads.update(actor, id, data);
  }
  @Delete(':id') @RequirePermission('crm.lead.delete') remove(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leads.remove(actor, id);
  }
  @Post(':id/assign') @RequirePermission('crm.lead.assign') assign(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: AssignLeadDto,
  ) {
    return this.leads.assign(actor, id, data);
  }
  @Post(':id/change-status')
  @RequirePermission('crm.lead.change_status')
  changeStatus(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ChangeLeadStatusDto,
  ) {
    return this.leads.changeStatus(actor, id, data);
  }
  @Post(':id/qualify') @RequirePermission('crm.lead.change_status') qualify(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leads.qualify(actor, id);
  }
  @Post(':id/disqualify')
  @RequirePermission('crm.lead.change_status')
  disqualify(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leads.disqualify(actor, id);
  }
  @Post(':id/convert-to-opportunity')
  @RequirePermission('crm.lead.convert')
  convert(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leads.convert(actor, id);
  }
}

@Controller('lead-sources')
export class LeadSourcesController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}
  @Get() @RequirePermission('crm.lead.read') list(
    @Actor() actor: CurrentActor,
  ) {
    return this.leads.sources(actor);
  }
}
