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
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  AddRFQRecipientsDto,
  CreateClarificationDto,
  CreateRFQDto,
  RFQsQuery,
  UpdateRFQDto,
} from './procurement.dto';
import { ProcurementService } from './procurement.service';

@Controller('rfqs')
export class RFQController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
  ) {}

  @Get()
  @RequirePermission('procurement.rfq.read')
  list(@Actor() actor: CurrentActor, @Query() query: RFQsQuery) {
    return this.procurement.listRFQs(actor, query);
  }
  @Post()
  @RequirePermission('procurement.rfq.create')
  create(@Actor() actor: CurrentActor, @Body() data: CreateRFQDto) {
    return this.procurement.createRFQ(actor, data);
  }
  @Get(':id')
  @RequirePermission('procurement.rfq.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.getRFQ(actor, id);
  }
  @Patch(':id')
  @RequirePermission('procurement.rfq.update')
  update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateRFQDto,
  ) {
    return this.procurement.updateRFQ(actor, id, data);
  }
  @Delete(':id')
  @RequirePermission('procurement.rfq.cancel')
  remove(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.removeRFQ(actor, id);
  }
  @Post(':id/recipients')
  @RequirePermission('procurement.rfq.manage_recipients')
  addRecipients(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: AddRFQRecipientsDto,
  ) {
    return this.procurement.addRFQRecipients(actor, id, data.supplierIds);
  }
  @Delete(':id/recipients/:recipientId')
  @RequirePermission('procurement.rfq.manage_recipients')
  removeRecipient(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
  ) {
    return this.procurement.removeRFQRecipient(actor, id, recipientId);
  }
  @Post(':id/submit')
  @RequirePermission('procurement.rfq.update')
  submit(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionRFQ(actor, id, 'READY_TO_SEND');
  }
  @Post(':id/send')
  @RequirePermission('procurement.rfq.send')
  send(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionRFQ(actor, id, 'SENT');
  }
  @Post(':id/clarifications')
  @RequirePermission('procurement.rfq.update')
  clarify(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CreateClarificationDto,
  ) {
    return this.procurement.clarify(actor, id, data);
  }
  @Post(':id/close')
  @RequirePermission('procurement.rfq.close')
  close(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionRFQ(actor, id, 'CLOSED');
  }
  @Post(':id/cancel')
  @RequirePermission('procurement.rfq.cancel')
  cancel(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionRFQ(actor, id, 'CANCELLED');
  }
}
