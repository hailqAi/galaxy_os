import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  AllocateProjectRiskDto,
  CreateProjectRiskDto,
} from './project-risks.dto';
import { ProjectRisksService } from './project-risks.service';

@Controller('projects/:projectId/risks')
export class ProjectRisksController {
  constructor(
    @Inject(ProjectRisksService) private readonly risks: ProjectRisksService,
  ) {}

  @Get()
  @RequirePermission('project.read')
  list(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.risks.list(actor, projectId);
  }

  @Post()
  @RequirePermission('project.update')
  create(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: CreateProjectRiskDto,
  ) {
    return this.risks.create(actor, projectId, input);
  }

  @Post(':riskId/estimate-allocation')
  @RequirePermission(
    'estimate.read',
    'estimate.update',
    'financial_margin.read',
  )
  allocate(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('riskId', ParseUUIDPipe) riskId: string,
    @Body() input: AllocateProjectRiskDto,
  ) {
    return this.risks.allocate(actor, projectId, riskId, input);
  }
}
