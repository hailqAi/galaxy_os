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
  AppendixTransitionDto,
  ContractTransitionDto,
  CreateAppendixDto,
  CreateContractDto,
  CreateGuaranteeDto,
  CreatePaymentSchedulesDto,
  RecordPaymentDto,
} from './contracts.dto';
import { ContractsService } from './contracts.service';

@Controller('projects/:projectId')
export class ContractsController {
  constructor(
    @Inject(ContractsService) private readonly contracts: ContractsService,
  ) {}
  @Get('contracts')
  @RequirePermission('contract.read')
  list(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.contracts.list(a, projectId);
  }
  @Post('contracts')
  @RequirePermission('contract.create')
  create(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() d: CreateContractDto,
  ) {
    return this.contracts.create(a, projectId, d);
  }
  @Get('contracts/:id')
  @RequirePermission('contract.read')
  get(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contracts.get(a, projectId, id);
  }
  @Post('contracts/:id/transition')
  @RequirePermission('contract.update')
  transition(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ContractTransitionDto,
  ) {
    return this.contracts.transition(a, projectId, id, d);
  }
  @Post('contracts/:id/appendices')
  @RequirePermission('appendix.create')
  appendix(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CreateAppendixDto,
  ) {
    return this.contracts.createAppendix(a, projectId, id, d);
  }
  @Post('contracts/:id/appendices/:appendixId/transition')
  @RequirePermission('appendix.approve')
  appendixTransition(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('appendixId', ParseUUIDPipe) appendixId: string,
    @Body() d: AppendixTransitionDto,
  ) {
    return this.contracts.transitionAppendix(a, projectId, id, appendixId, d);
  }
  @Post('contracts/:id/payment-schedules')
  @RequirePermission('receivable.create')
  schedules(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CreatePaymentSchedulesDto,
  ) {
    return this.contracts.schedules(a, projectId, id, d);
  }
  @Post('payments')
  @RequirePermission('receivable.payment.record')
  payment(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() d: RecordPaymentDto,
  ) {
    return this.contracts.payment(a, projectId, d);
  }
  @Get('receivables')
  @RequirePermission('receivable.read')
  receivables(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.contracts.receivables(a, projectId);
  }
  @Post('contracts/:id/guarantees')
  @RequirePermission('contract.update')
  guarantee(
    @Actor() a: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CreateGuaranteeDto,
  ) {
    return this.contracts.guarantee(a, projectId, id, d);
  }
}
