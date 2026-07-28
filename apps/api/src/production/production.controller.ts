import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  ApprovalDecisionDto,
  CreateProductionOrderDto,
  PackingRecordDto,
  ProductionMilestoneDto,
  ProductionQuery,
  ProductionStatusDto,
  ProductionUpdateDto,
  QualityReportDto,
  SampleApprovalDto,
  TechnicalApprovalDto,
  TechnicalRevisionDto,
  UpdateProductionOrderDto,
} from './production.dto';
import { ProductionService } from './production.service';

@Controller('production-orders')
export class ProductionController {
  constructor(
    @Inject(ProductionService) private readonly production: ProductionService,
  ) {}
  @Get()
  @RequirePermission('production.read')
  list(@Actor() actor: CurrentActor, @Query() query: ProductionQuery) {
    return this.production.list(actor, query);
  }
  @Post()
  @RequirePermission('production.create')
  create(@Actor() actor: CurrentActor, @Body() data: CreateProductionOrderDto) {
    return this.production.create(actor, data);
  }
  @Get(':id')
  @RequirePermission('production.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.production.get(actor, id);
  }
  @Patch(':id')
  @RequirePermission('production.update')
  update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateProductionOrderDto,
  ) {
    return this.production.update(actor, id, data);
  }
  @Post(':id/change-status')
  @RequirePermission('production.update')
  status(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProductionStatusDto,
  ) {
    return this.production.changeStatus(actor, id, data);
  }
  @Post(':id/milestones')
  @RequirePermission('production.update')
  milestone(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProductionMilestoneDto,
  ) {
    return this.production.milestone(actor, id, data);
  }
  @Post(':id/updates')
  @RequirePermission('production.update')
  addUpdate(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProductionUpdateDto,
  ) {
    return this.production.addUpdate(actor, id, data);
  }
  @Post(':id/technical-approvals')
  @RequirePermission('production.technical.submit')
  technical(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: TechnicalApprovalDto,
  ) {
    return this.production.technicalApproval(actor, id, data);
  }
  @Post('technical-approvals/:id/revisions')
  @RequirePermission('production.technical.submit')
  revision(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: TechnicalRevisionDto,
  ) {
    return this.production.technicalRevision(actor, id, data);
  }
  @Post('technical-approvals/:id/decision')
  @RequirePermission('production.technical.approve')
  decision(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ApprovalDecisionDto,
  ) {
    return this.production.decideTechnical(actor, id, data);
  }
  @Post(':id/sample-approvals')
  @RequirePermission('production.technical.submit')
  sample(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SampleApprovalDto,
  ) {
    return this.production.sample(actor, id, data);
  }
  @Post('sample-approvals/:id/decision')
  @RequirePermission('production.technical.approve')
  sampleDecision(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ApprovalDecisionDto,
  ) {
    return this.production.decideSample(actor, id, data);
  }
  @Post(':id/quality-reports')
  @RequirePermission('production.quality.create')
  quality(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: QualityReportDto,
  ) {
    return this.production.quality(actor, id, data);
  }
  @Post(':id/packing-records')
  @RequirePermission('production.packing.create')
  packing(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: PackingRecordDto,
  ) {
    return this.production.packing(actor, id, data);
  }
}
