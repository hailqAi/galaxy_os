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
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
  DeleteProjectDto,
  ProjectDepartmentDto,
  ProjectMemberDto,
  ProjectStageDecisionDto,
  UpdateProjectDto,
} from './projects.dto';
import { StageOneSummaryBatchQuery } from './project-stage-one.dto';
import { ProjectStageOneService } from './project-stage-one.service';
import { ProjectStageTwoService } from './project-stage-two.service';
import { ProjectsService } from './projects.service';
class ProjectsQuery extends PageQuery {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
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
  @IsIn(['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5'])
  currentStage?: 'STAGE_1' | 'STAGE_2' | 'STAGE_3' | 'STAGE_4' | 'STAGE_5';
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
    @Inject(ProjectStageOneService)
    private readonly stageOne: ProjectStageOneService,
    @Inject(ProjectStageTwoService)
    private readonly stageTwo: ProjectStageTwoService,
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
  @Get('dashboard') @RequirePermission('project.read') dashboard(
    @Actor() a: CurrentActor,
  ) {
    return this.projects.dashboard(a);
  }
  @Get('stage-1-summaries')
  @RequirePermission('project.read')
  stageOneSummaries(
    @Actor() a: CurrentActor,
    @Query() q: StageOneSummaryBatchQuery,
  ) {
    return this.stageOne.getSummaries(a, q.projectIds);
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
    @Body() d: DeleteProjectDto,
  ) {
    return this.projects.remove(a, id, d);
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
  @Get(':id/operations-summary')
  @RequirePermission('project.read')
  operationsSummary(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.operationsSummary(a, id);
  }
  @Get(':id/workspace-summary')
  @RequirePermission('project.read')
  workspaceSummary(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.workspaceSummary(a, id);
  }
  @Get(':id/stages/:stageKey')
  @RequirePermission('project.read')
  stage(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageKey') stageKey: string,
  ) {
    return this.projects.stage(a, id, stageKey);
  }
  @Post(':id/stages/:stageKey/initialize')
  @RequirePermission('project.update')
  async initializeStage(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageKey') stageKey: string,
  ) {
    const access = await this.projects.stage(a, id, stageKey);
    if (!access.templateApplicability.applicable)
      return this.projects.initializeStage(a, id, stageKey);
    if (
      ['DONE', 'NOT_APPLICABLE', 'BYPASSED_WITH_APPROVAL'].includes(
        access.state.status,
      )
    )
      return {
        initialized: false,
        stageKey,
        status: access.state.status,
        requirements: access.requiredDocuments,
      };
    const result = await this.projects.initializeStage(a, id, stageKey);
    if (stageKey === 'STAGE_1') await this.stageOne.initialize(a, id);
    if (stageKey === 'STAGE_2')
      await this.stageTwo.initializeDocumentDefinitions(a, id);
    return result;
  }
  @Post(':id/stages/:stageKey/decision')
  @RequirePermission('project.stage.bypass')
  decideStage(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageKey') stageKey: string,
    @Body() data: ProjectStageDecisionDto,
  ) {
    return this.projects.decideStage(a, id, stageKey, data);
  }
}
