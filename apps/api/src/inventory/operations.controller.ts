import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CreateAdjustmentDto,
  CreateCycleCountDto,
  CreateIssueDto,
  CreateReservationDto,
  CreateReturnDto,
  CreateTransferDto,
  DecisionDto,
  ReceiveTransferDto,
  RecordCountDto,
} from './operations.dto';
import { InventoryOperationsService } from './operations.service';

@Controller('inventory')
export class InventoryOperationsController {
  constructor(
    @Inject(InventoryOperationsService)
    private readonly operations: InventoryOperationsService,
  ) {}

  @Get('reservations')
  @RequirePermission('inventory.reservation.read')
  reservations(
    @Actor() actor: CurrentActor,
    @Query('projectId') projectId?: string,
  ) {
    return this.operations.reservations(actor, projectId);
  }
  @Post('reservations')
  @RequirePermission('inventory.reservation.create')
  createReservation(
    @Actor() actor: CurrentActor,
    @Body() data: CreateReservationDto,
  ) {
    return this.operations.createReservation(actor, data);
  }
  @Post('reservations/:id/approve')
  @RequirePermission('inventory.reservation.approve')
  approveReservation(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: DecisionDto,
  ) {
    return this.operations.approveReservation(actor, id, data.comment);
  }
  @Post('reservations/:id/reserve')
  @RequirePermission('inventory.reservation.reserve')
  reserve(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.reserve(actor, id);
  }
  @Post('reservations/:id/release')
  @RequirePermission('inventory.reservation.release')
  release(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.releaseReservation(actor, id);
  }

  @Get('transfers')
  @RequirePermission('inventory.transfer.read')
  transfers(@Actor() actor: CurrentActor) {
    return this.operations.transfers(actor);
  }
  @Post('transfers')
  @RequirePermission('inventory.transfer.create')
  createTransfer(
    @Actor() actor: CurrentActor,
    @Body() data: CreateTransferDto,
  ) {
    return this.operations.createTransfer(actor, data);
  }
  @Post('transfers/:id/approve')
  @RequirePermission('inventory.transfer.approve')
  approveTransfer(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.approveTransfer(actor, id);
  }
  @Post('transfers/:id/dispatch')
  @RequirePermission('inventory.transfer.post')
  dispatch(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.dispatchTransfer(actor, id);
  }
  @Post('transfers/:id/receive')
  @RequirePermission('inventory.transfer.post')
  receiveTransfer(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ReceiveTransferDto,
  ) {
    return this.operations.receiveTransfer(actor, id, data);
  }

  @Get('issues')
  @RequirePermission('inventory.issue.read')
  issues(@Actor() actor: CurrentActor) {
    return this.operations.issues(actor);
  }
  @Post('issues')
  @RequirePermission('inventory.issue.create')
  createIssue(@Actor() actor: CurrentActor, @Body() data: CreateIssueDto) {
    return this.operations.createIssue(actor, data);
  }
  @Post('issues/:id/approve')
  @RequirePermission('inventory.issue.approve')
  approveIssue(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.approveIssue(actor, id);
  }
  @Post('issues/:id/post')
  @RequirePermission('inventory.issue.post')
  postIssue(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.postIssue(actor, id);
  }

  @Post('returns')
  @RequirePermission('inventory.return.create')
  createReturn(@Actor() actor: CurrentActor, @Body() data: CreateReturnDto) {
    return this.operations.createReturn(actor, data);
  }
  @Get('returns')
  @RequirePermission('inventory.return.create')
  returns(@Actor() actor: CurrentActor) {
    return this.operations.returns(actor);
  }
  @Post('returns/:id/receive')
  @RequirePermission('inventory.return.post')
  receiveReturn(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.receiveReturn(actor, id);
  }

  @Get('adjustments')
  @RequirePermission('inventory.adjustment.read')
  adjustments(@Actor() actor: CurrentActor) {
    return this.operations.adjustments(actor);
  }
  @Post('adjustments')
  @RequirePermission('inventory.adjustment.create')
  createAdjustment(
    @Actor() actor: CurrentActor,
    @Body() data: CreateAdjustmentDto,
  ) {
    return this.operations.createAdjustment(actor, data);
  }
  @Post('adjustments/:id/approve')
  @RequirePermission('inventory.adjustment.approve')
  approveAdjustment(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.approveAdjustment(actor, id);
  }
  @Post('adjustments/:id/post')
  @RequirePermission('inventory.adjustment.post')
  postAdjustment(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.postAdjustment(actor, id);
  }

  @Get('counts')
  @RequirePermission('inventory.count.read')
  counts(@Actor() actor: CurrentActor) {
    return this.operations.counts(actor);
  }
  @Post('counts')
  @RequirePermission('inventory.count.create')
  createCount(@Actor() actor: CurrentActor, @Body() data: CreateCycleCountDto) {
    return this.operations.createCount(actor, data);
  }
  @Post('counts/:id/freeze')
  @RequirePermission('inventory.count.create')
  freeze(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.operations.freezeCount(actor, id);
  }
  @Post('counts/:id/record')
  @RequirePermission('inventory.count.record')
  record(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: RecordCountDto,
  ) {
    return this.operations.recordCount(actor, id, data);
  }
  @Post('counts/:id/approve')
  @RequirePermission('inventory.count.approve')
  approveCount(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.approveCount(actor, id);
  }
  @Post('counts/:id/post')
  @RequirePermission('inventory.count.post')
  postCount(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.postCount(actor, id);
  }
}
