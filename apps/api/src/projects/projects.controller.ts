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
  ChangeProjectPhaseDto,
  CreateProjectDto,
  ProjectDepartmentDto,
  ProjectMemberDto,
  UpdateProjectDto,
} from './projects.dto';
import { ProjectsService } from './projects.service';
class ProjectsQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional()
  @IsIn([
    'SURVEY',
    'REQUIREMENT',
    'DESIGN',
    'PRODUCT_SELECTION',
    'QUOTATION',
    'CONTRACT',
    'PROCUREMENT',
    'PRODUCTION',
    'SHIPPING',
    'INSTALLATION',
    'INSPECTION',
    'HANDOVER',
    'WARRANTY',
    'AFTER_SALES',
  ])
  phase?:
    | 'SURVEY'
    | 'REQUIREMENT'
    | 'DESIGN'
    | 'PRODUCT_SELECTION'
    | 'QUOTATION'
    | 'CONTRACT'
    | 'PROCUREMENT'
    | 'PRODUCTION'
    | 'SHIPPING'
    | 'INSTALLATION'
    | 'INSPECTION'
    | 'HANDOVER'
    | 'WARRANTY'
    | 'AFTER_SALES';
  @IsOptional()
  @IsIn(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])
  status?: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  @IsOptional() @IsIn(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']) health?:
    | 'ON_TRACK'
    | 'AT_RISK'
    | 'OFF_TRACK';
  @IsOptional() @IsUUID() projectManagerId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @IsOptional()
  @IsIn([
    'code',
    'name',
    'updatedAt',
    'expectedCompletionDate',
    'estimatedValue',
  ])
  sort?:
    | 'code'
    | 'name'
    | 'updatedAt'
    | 'expectedCompletionDate'
    | 'estimatedValue';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}
@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
  ) {}
  @Get() @RequirePermission('project.read') list(
    @Actor() a: CurrentActor,
    @Query() q: ProjectsQuery,
  ) {
    return this.projects.list(a, q);
  }
  @Post() @RequirePermission('project.create') create(
    @Actor() a: CurrentActor,
    @Body() d: CreateProjectDto,
  ) {
    return this.projects.create(a, d);
  }
  @Get(':id') @RequirePermission('project.read') get(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.get(a, id);
  }
  @Patch(':id') @RequirePermission('project.update') update(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateProjectDto,
  ) {
    return this.projects.update(a, id, d);
  }
  @Delete(':id') @RequirePermission('project.delete') remove(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.remove(a, id);
  }
  @Get(':id/members') @RequirePermission('project.read') members(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.members(a, id);
  }
  @Post(':id/members') @RequirePermission('project.manage_members') addMember(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ProjectMemberDto,
  ) {
    return this.projects.addMember(a, id, d.userId, d.role);
  }
  @Delete(':id/members/:userId')
  @RequirePermission('project.manage_members')
  removeMember(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.projects.removeMember(a, id, userId);
  }
  @Get(':id/departments') @RequirePermission('project.read') departments(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.departments(a, id);
  }
  @Post(':id/departments')
  @RequirePermission('project.manage_departments')
  addDepartment(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ProjectDepartmentDto,
  ) {
    return this.projects.addDepartment(a, id, d.departmentId);
  }
  @Delete(':id/departments/:departmentId')
  @RequirePermission('project.manage_departments')
  removeDepartment(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('departmentId', ParseUUIDPipe) departmentId: string,
  ) {
    return this.projects.removeDepartment(a, id, departmentId);
  }
  @Post(':id/change-phase') @RequirePermission('project.change_phase') phase(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ChangeProjectPhaseDto,
  ) {
    return this.projects.changePhase(a, id, d.phase);
  }
  @Get(':id/timeline') @RequirePermission('project.read') timeline(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.timeline(a, id);
  }
}
