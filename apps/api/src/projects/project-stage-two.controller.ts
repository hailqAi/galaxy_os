import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { ImportsService } from '../imports/imports.service';
import {
  StageTwoDocumentDefinitionDto,
  StageTwoPlanBatchDto,
  StageTwoPlanPreviewDto,
  StageTwoQueryDto,
} from './project-stage-two.dto';
import { ProjectStageTwoService } from './project-stage-two.service';

type BinaryResponse = { setHeader(name: string, value: string): void };

@Controller('projects/:projectId/stage-2')
export class ProjectStageTwoController {
  constructor(
    @Inject(ProjectStageTwoService)
    private readonly stageTwo: ProjectStageTwoService,
    @Inject(ImportsService) private readonly imports: ImportsService,
  ) {}

  @Get()
  @RequirePermission('project.read')
  get(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: StageTwoQueryDto,
  ) {
    return this.stageTwo.get(actor, projectId, query.step);
  }

  @Put('plan')
  @RequirePermission('project.read')
  savePlan(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: StageTwoPlanBatchDto,
  ) {
    return this.stageTwo.savePlan(actor, projectId, input);
  }

  @Post('document-definitions')
  @RequirePermission('project.document.manage')
  createDocumentDefinition(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: StageTwoDocumentDefinitionDto,
  ) {
    return this.stageTwo.createDocumentDefinition(actor, projectId, input);
  }

  @Patch('document-definitions/:definitionId')
  @RequirePermission('project.document.manage')
  updateDocumentDefinition(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Body() input: StageTwoDocumentDefinitionDto,
  ) {
    return this.stageTwo.updateDocumentDefinition(
      actor,
      projectId,
      definitionId,
      input,
    );
  }

  @Get('plan-template')
  @RequirePermission('project.read', 'task.create', 'estimate.read')
  async template(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Res({ passthrough: true }) response: BinaryResponse,
  ) {
    const bytes = await this.stageTwo.template(actor, projectId);
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('ke-hoach-giai-doan-2.xlsx')}`,
    );
    response.setHeader('Content-Length', String(bytes.length));
    return new StreamableFile(bytes);
  }

  @Post('plan-import/preview')
  @RequirePermission(
    'project.read',
    'import.create',
    'file.read',
    'file.download',
  )
  preview(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() input: StageTwoPlanPreviewDto,
  ) {
    return this.imports.previewStageTwoPlan(
      actor,
      projectId,
      input.fileAssetId,
    );
  }

  @Post('plan-import/:jobId/confirm')
  @RequirePermission(
    'project.read',
    'import.confirm',
    'task.create',
    'file.read',
    'file.download',
  )
  confirm(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.imports.confirmStageTwoPlan(actor, projectId, jobId);
  }

  @Post('steps/1/complete')
  @RequirePermission('project.update')
  completeStepOne(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.stageTwo.completeStepOne(actor, projectId);
  }
}
