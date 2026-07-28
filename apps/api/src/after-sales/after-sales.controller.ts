import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CompleteHandoverDto,
  CompleteServiceVisitDto,
  ConfirmTicketDto,
  CreateAcceptanceDto,
  CreateHandoverDto,
  CreateInspectionDto,
  CreateReplacementDto,
  CreateServiceVisitDto,
  CreateTicketDto,
  CreateWarrantyClaimDto,
  DecideWarrantyClaimDto,
  DecideInspectionItemDto,
  HandoverDocumentDto,
  ResolveTicketDto,
  SignDocumentDto,
  TicketStatusDto,
} from './after-sales.dto';
import { AfterSalesService } from './after-sales.service';

@Controller()
export class AfterSalesController {
  constructor(
    @Inject(AfterSalesService)
    private readonly service: AfterSalesService,
  ) {}

  @Get('inspections')
  @RequirePermission('inspection.read')
  inspections(
    @Actor() actor: CurrentActor,
    @Query('projectId') projectId: string,
  ) {
    return this.service.inspections(actor, projectId);
  }
  @Post('inspections')
  @RequirePermission('inspection.manage')
  createInspection(
    @Actor() actor: CurrentActor,
    @Body() data: CreateInspectionDto,
  ) {
    return this.service.createInspection(actor, data);
  }
  @Get('inspections/:id')
  @RequirePermission('inspection.read')
  inspection(@Actor() actor: CurrentActor, @Param('id') id: string) {
    return this.service.inspection(actor, id);
  }
  @Post('inspection-items/:id/decide')
  @RequirePermission('inspection.manage')
  decideInspectionItem(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: DecideInspectionItemDto,
  ) {
    return this.service.decideInspectionItem(actor, id, data);
  }
  @Post('inspections/:id/acceptance')
  @RequirePermission('acceptance.manage')
  createAcceptance(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: CreateAcceptanceDto,
  ) {
    return this.service.createAcceptance(actor, id, data);
  }
  @Post('handovers')
  @RequirePermission('handover.manage')
  createHandover(
    @Actor() actor: CurrentActor,
    @Body() data: CreateHandoverDto,
  ) {
    return this.service.createHandover(actor, data);
  }
  @Get('handovers')
  @RequirePermission('handover.read')
  handovers(
    @Actor() actor: CurrentActor,
    @Query('projectId') projectId: string,
  ) {
    return this.service.handovers(actor, projectId);
  }
  @Get('handovers/:id')
  @RequirePermission('handover.read')
  handover(@Actor() actor: CurrentActor, @Param('id') id: string) {
    return this.service.handover(actor, id);
  }
  @Post('handovers/:id/checklist/:checklistId/complete')
  @RequirePermission('handover.manage')
  completeChecklist(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Param('checklistId') checklistId: string,
  ) {
    return this.service.completeChecklist(actor, id, checklistId);
  }
  @Post('handovers/:id/complete')
  @RequirePermission('handover.complete')
  completeHandover(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: CompleteHandoverDto,
  ) {
    return this.service.completeHandover(actor, id, data);
  }
  @Post('handovers/:id/documents')
  @RequirePermission('handover.manage')
  addHandoverDocument(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: HandoverDocumentDto,
  ) {
    return this.service.addHandoverDocument(actor, id, data);
  }
  @Post('handover-documents/:id/sign')
  @RequirePermission('handover.manage')
  signHandoverDocument(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: SignDocumentDto,
  ) {
    return this.service.signHandoverDocument(actor, id, data);
  }
  @Get('warranty/assets')
  @RequirePermission('warranty.read')
  warrantyAssets(
    @Actor() actor: CurrentActor,
    @Query('projectId') projectId: string,
  ) {
    return this.service.warrantyAssets(actor, projectId);
  }
  @Post('service-tickets')
  @RequirePermission('service_ticket.create')
  createTicket(@Actor() actor: CurrentActor, @Body() data: CreateTicketDto) {
    return this.service.createTicket(actor, data);
  }
  @Get('service-tickets')
  @RequirePermission('service_ticket.read')
  tickets(@Actor() actor: CurrentActor, @Query('projectId') projectId: string) {
    return this.service.tickets(actor, projectId);
  }
  @Get('service-tickets/:id')
  @RequirePermission('service_ticket.read')
  ticket(@Actor() actor: CurrentActor, @Param('id') id: string) {
    return this.service.ticket(actor, id);
  }
  @Post('service-tickets/:id/status')
  @RequirePermission('service_ticket.manage')
  changeTicketStatus(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: TicketStatusDto,
  ) {
    return this.service.changeTicketStatus(actor, id, data);
  }
  @Post('service-tickets/:id/resolve')
  @RequirePermission('service_ticket.manage')
  resolveTicket(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: ResolveTicketDto,
  ) {
    return this.service.resolveTicket(actor, id, data);
  }
  @Post('service-tickets/:id/confirm')
  @RequirePermission('service_ticket.manage')
  confirmTicket(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: ConfirmTicketDto,
  ) {
    return this.service.confirmTicket(actor, id, data);
  }
  @Post('service-tickets/:id/close')
  @RequirePermission('service_ticket.manage')
  closeTicket(@Actor() actor: CurrentActor, @Param('id') id: string) {
    return this.service.closeTicket(actor, id);
  }
  @Post('service-tickets/:id/visits')
  @RequirePermission('service_visit.manage')
  createServiceVisit(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: CreateServiceVisitDto,
  ) {
    return this.service.createServiceVisit(actor, id, data);
  }
  @Post('service-visits/:id/start')
  @RequirePermission('service_visit.execute')
  startServiceVisit(@Actor() actor: CurrentActor, @Param('id') id: string) {
    return this.service.startServiceVisit(actor, id);
  }
  @Post('service-visits/:id/complete')
  @RequirePermission('service_visit.execute')
  completeServiceVisit(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: CompleteServiceVisitDto,
  ) {
    return this.service.completeServiceVisit(actor, id, data);
  }
  @Post('service-tickets/:id/claims')
  @RequirePermission('warranty.claim.manage')
  createWarrantyClaim(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: CreateWarrantyClaimDto,
  ) {
    return this.service.createWarrantyClaim(actor, id, data);
  }
  @Post('warranty-claims/:id/decide')
  @RequirePermission('warranty.claim.decide')
  decideWarrantyClaim(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: DecideWarrantyClaimDto,
  ) {
    return this.service.decideWarrantyClaim(actor, id, data);
  }
  @Post('warranty-claims/:id/replacement')
  @RequirePermission('warranty.replacement.manage')
  createReplacement(
    @Actor() actor: CurrentActor,
    @Param('id') id: string,
    @Body() data: CreateReplacementDto,
  ) {
    return this.service.createReplacement(actor, id, data);
  }
}
