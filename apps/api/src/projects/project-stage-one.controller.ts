import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CompleteStageOneStepDto,
  DecideStageOneApprovalDto,
  DeleteKeyDossierItemDto,
  DeleteKeyDossierMilestoneDto,
  DeleteStageOneDocumentQuery,
  InitializeStageOneDto,
  KeyDossierMilestoneDto,
  ProjectDocumentDefinitionDto,
  SimpleInitiationDto,
  SubmitStageOneApprovalDto,
  SurveyNotApplicableDto,
  UpdateStageOneGovernanceDto,
  UpdateStageOnePlanDto,
} from './project-stage-one.dto';
import {
  SIMPLE_STAGE_ONE_STEPS,
  type StageOneStep,
} from './project-stage-one.rules';
import { ProjectStageOneService } from './project-stage-one.service';

const simpleStageOneStepParams = Object.fromEntries(
  SIMPLE_STAGE_ONE_STEPS.map(({ step }) => [step, step]),
);

@Controller('projects/:projectId')
export class ProjectStageOneController {
  constructor(
    @Inject(ProjectStageOneService)
    private readonly stageOne: ProjectStageOneService,
  ) {}

  @Get('stage-1/simple')
  @RequirePermission('project.read')
  simple(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.stageOne.getSimple(actor, projectId);
  }

  @Post('stage-1/initiate-simple')
  @RequirePermission('project.update', 'estimate.update', 'estimate.read')
  initiateSimple(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: SimpleInitiationDto,
  ) {
    return this.stageOne.initiateSimple(actor, projectId, data);
  }

  @Patch('stage-1/initiate-simple')
  @RequirePermission('project.update', 'estimate.update', 'estimate.read')
  updateSimple(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: SimpleInitiationDto,
  ) {
    return this.stageOne.updateSimple(actor, projectId, data);
  }

  @Post('stage-1/document-definitions')
  @RequirePermission('project.document.manage')
  createDocumentDefinition(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: ProjectDocumentDefinitionDto,
  ) {
    return this.stageOne.createDocumentDefinition(
      actor,
      projectId,
      data,
      false,
    );
  }

  @Patch('stage-1/document-definitions/:id')
  @RequirePermission('project.document.manage')
  updateDocumentDefinition(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProjectDocumentDefinitionDto,
  ) {
    return this.stageOne.updateDocumentDefinition(
      actor,
      projectId,
      id,
      data,
      false,
    );
  }

  @Post('stage-1/key-dossier/items')
  @RequirePermission('project.key_dossier.manage')
  createKeyDossierItem(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: ProjectDocumentDefinitionDto,
  ) {
    return this.stageOne.createDocumentDefinition(actor, projectId, data, true);
  }

  @Patch('stage-1/key-dossier/items/:id')
  @RequirePermission('project.key_dossier.manage')
  updateKeyDossierItem(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProjectDocumentDefinitionDto,
  ) {
    return this.stageOne.updateDocumentDefinition(
      actor,
      projectId,
      id,
      data,
      true,
    );
  }

  @Post('stage-1/steps/:step/complete')
  @RequirePermission('project.update')
  completeSimpleStep(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('step', new ParseEnumPipe(simpleStageOneStepParams))
    step: StageOneStep,
  ) {
    return this.stageOne.completeSimpleStep(actor, projectId, step);
  }

  @Get('stage-1/documents/:documentId/history')
  @RequirePermission('project.read')
  documentHistory(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.stageOne.documentHistory(actor, projectId, documentId);
  }

  @Delete('stage-1/documents/:documentId')
  @RequirePermission('file.delete')
  deleteDocument(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query() query: DeleteStageOneDocumentQuery,
  ) {
    return this.stageOne.deleteDocument(
      actor,
      projectId,
      documentId,
      query.contextType,
      query.source,
    );
  }

  @Delete('stage-1/key-dossier/items/:itemId')
  @RequirePermission('project.key_dossier.item.delete')
  deleteKeyDossierItem(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() data: DeleteKeyDossierItemDto,
  ) {
    return this.stageOne.deleteKeyDossierItem(
      actor,
      projectId,
      itemId,
      data.reason,
    );
  }

  @Post('stage-1/key-dossier/milestones')
  @RequirePermission('project.key_dossier.manage')
  createKeyDossierMilestone(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: KeyDossierMilestoneDto,
  ) {
    return this.stageOne.createKeyDossierMilestone(actor, projectId, data);
  }

  @Patch('stage-1/key-dossier/milestones/:milestoneId')
  @RequirePermission('project.key_dossier.manage')
  updateKeyDossierMilestone(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body() data: KeyDossierMilestoneDto,
  ) {
    return this.stageOne.updateKeyDossierMilestone(
      actor,
      projectId,
      milestoneId,
      data,
    );
  }

  @Delete('stage-1/key-dossier/milestones/:milestoneId')
  @RequirePermission('project.key_dossier.manage')
  deleteKeyDossierMilestone(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
    @Body() data: DeleteKeyDossierMilestoneDto,
  ) {
    return this.stageOne.deleteKeyDossierMilestone(
      actor,
      projectId,
      milestoneId,
      data,
    );
  }

  @Get('stage-1/summary')
  @RequirePermission('project.read')
  summary(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.stageOne.getSummary(actor, projectId, query);
  }

  @Get('stage-1/initiation')
  @RequirePermission('project.read')
  initiation(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.stageOne.getInitiation(actor, projectId, query);
  }

  @Get('stage-1/routing')
  @RequirePermission('project.read')
  async routing(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return (await this.stageOne.getInitiation(actor, projectId, query)).routing;
  }

  @Post('stage-1/initialize')
  @RequirePermission('project.update')
  initialize(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() _data: InitializeStageOneDto,
  ) {
    void _data;
    return this.stageOne.initialize(actor, projectId);
  }

  @Patch('stage-1/plan')
  @RequirePermission('project.update')
  plan(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: UpdateStageOnePlanDto,
  ) {
    return this.stageOne.updatePlan(actor, projectId, data);
  }

  @Patch('stage-1/governance')
  @RequirePermission('project.update')
  governance(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: UpdateStageOneGovernanceDto,
  ) {
    return this.stageOne.updateGovernance(actor, projectId, data);
  }

  @Post('stage-1/step')
  @RequirePermission('project.update')
  step(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: CompleteStageOneStepDto,
  ) {
    return this.stageOne.completeStep(actor, projectId, data.step);
  }

  @Post('stage-1/survey/not-applicable')
  @RequirePermission('project.survey.not_applicable')
  surveyNotApplicable(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: SurveyNotApplicableDto,
  ) {
    return this.stageOne.markSurveyNotApplicable(actor, projectId, data.reason);
  }

  @Post('stage-1/approval/submit')
  @RequirePermission('project.stage1.submit')
  submitApproval(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: SubmitStageOneApprovalDto,
  ) {
    return this.stageOne.submitApproval(actor, projectId, data);
  }

  @Post('stage-1/approval/:approvalId/decision')
  @RequirePermission('project.stage1.review')
  decideApproval(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('approvalId', ParseUUIDPipe) approvalId: string,
    @Body() data: DecideStageOneApprovalDto,
  ) {
    return this.stageOne.decideApproval(actor, projectId, approvalId, data);
  }

  @Post('stage-1/gate')
  @RequirePermission('project.stage1.complete_gate')
  async gate(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Res({ passthrough: true })
    response: { status(statusCode: number): unknown },
  ) {
    const result = await this.stageOne.completeGate(actor, projectId);
    if (!result.completed) {
      response.status(422);
      return { blockers: result.blockers };
    }
    return result;
  }
}
