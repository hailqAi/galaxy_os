import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProjectProductApprovalType } from '@prisma/client';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CreateProjectLocationDto,
  CreateProjectProductDto,
  CreateProjectRequiredDocumentDto,
  LinkProjectDocumentFileDto,
  ProjectDocumentDecisionDto,
  ProjectDocumentNotApplicableDto,
  ProjectDocumentsQuery,
  ProjectProductDecisionDto,
  ProjectProductsQuery,
  UpdateProjectProductDto,
  UpdateProjectRequiredDocumentDto,
} from './project-products.dto';
import { ProjectProductsService } from './project-products.service';

@Controller('projects/:projectId')
export class ProjectProductsController {
  constructor(
    @Inject(ProjectProductsService)
    private readonly products: ProjectProductsService,
  ) {}

  @Get('products')
  @RequirePermission('project.product.view')
  list(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ProjectProductsQuery,
  ) {
    return this.products.list(actor, projectId, query);
  }

  @Post('products')
  @RequirePermission('project.product.create')
  create(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: CreateProjectProductDto,
  ) {
    return this.products.create(actor, projectId, data);
  }

  @Get('products/:lineId')
  @RequirePermission('project.product.view')
  get(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.products.get(actor, projectId, lineId);
  }

  @Patch('products/:lineId')
  @RequirePermission('project.product.update')
  update(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() data: UpdateProjectProductDto,
  ) {
    return this.products.update(actor, projectId, lineId, data);
  }

  @Post('products/:lineId/revisions')
  @RequirePermission('project.product.revise')
  revise(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.products.revise(actor, projectId, lineId);
  }

  @Post('products/:lineId/approvals/:type/submit')
  submit(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Param('type', new ParseEnumPipe(ProjectProductApprovalType))
    type: ProjectProductApprovalType,
  ) {
    return this.products.submit(actor, projectId, lineId, type);
  }

  @Post('products/:lineId/approvals/:type/decision')
  decide(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Param('type', new ParseEnumPipe(ProjectProductApprovalType))
    type: ProjectProductApprovalType,
    @Body() data: ProjectProductDecisionDto,
  ) {
    return this.products.decide(actor, projectId, lineId, type, data);
  }

  @Get('locations')
  @RequirePermission('project.product.view')
  locations(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.products.locations(actor, projectId);
  }

  @Post('locations')
  @RequirePermission('project.location.manage')
  createLocation(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: CreateProjectLocationDto,
  ) {
    return this.products.createLocation(actor, projectId, data);
  }

  @Get('required-documents')
  @RequirePermission('project.read')
  documents(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ProjectDocumentsQuery,
  ) {
    return this.products.documents(actor, projectId, query);
  }

  @Post('required-documents')
  @RequirePermission('project.document.manage')
  createDocument(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() data: CreateProjectRequiredDocumentDto,
  ) {
    return this.products.createDocument(actor, projectId, data);
  }

  @Patch('required-documents/:requirementId')
  @RequirePermission('project.document.manage')
  updateDocument(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body() data: UpdateProjectRequiredDocumentDto,
  ) {
    return this.products.updateDocument(actor, projectId, requirementId, data);
  }

  @Post('required-documents/:requirementId/file')
  @RequirePermission('project.document.manage')
  linkDocumentFile(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body() data: LinkProjectDocumentFileDto,
  ) {
    return this.products.linkDocumentFile(
      actor,
      projectId,
      requirementId,
      data.fileAssetId,
    );
  }

  @Post('required-documents/:requirementId/submit')
  @RequirePermission('project.document.manage')
  submitDocument(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    return this.products.submitDocument(actor, projectId, requirementId);
  }

  @Post('required-documents/:requirementId/decision')
  @RequirePermission('project.document.review')
  decideDocument(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body() data: ProjectDocumentDecisionDto,
  ) {
    return this.products.decideDocument(actor, projectId, requirementId, data);
  }

  @Post('required-documents/:requirementId/not-applicable')
  @RequirePermission('project.document.review')
  notApplicable(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
    @Body() data: ProjectDocumentNotApplicableDto,
  ) {
    return this.products.markDocumentNotApplicable(
      actor,
      projectId,
      requirementId,
      data,
    );
  }

  @Post('required-documents/:requirementId/restore-applicability')
  @RequirePermission('project.document.review')
  restoreApplicability(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    return this.products.restoreDocumentApplicability(
      actor,
      projectId,
      requirementId,
    );
  }

  @Post('required-documents/:requirementId/supersede')
  @RequirePermission('project.document.manage')
  supersedeDocument(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    return this.products.supersedeDocument(actor, projectId, requirementId);
  }

  @Get('required-documents/:requirementId/history')
  @RequirePermission('project.read')
  documentHistory(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('requirementId', ParseUUIDPipe) requirementId: string,
  ) {
    return this.products.documentHistory(actor, projectId, requirementId);
  }
}
