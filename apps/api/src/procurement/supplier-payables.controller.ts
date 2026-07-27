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
  AllocateSupplierPaymentDto,
  CreateSupplierPaymentDto,
  CreateSupplierPaymentScheduleDto,
  GenerateSupplierPayableDto,
  ProformaInvoiceDecisionDto,
  SupplierPayablesQuery,
  UpdateSupplierPaymentScheduleDto,
} from './procurement.dto';
import { ProcurementService } from './procurement.service';

@Controller()
export class SupplierPayablesController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
  ) {}

  @Get('supplier-payables')
  @RequirePermission('supplier_payable.read')
  payables(
    @Actor() actor: CurrentActor,
    @Query() query: SupplierPayablesQuery,
  ) {
    return this.procurement.listSupplierPayables(actor, query);
  }

  @Get('supplier-payables/:id')
  @RequirePermission('supplier_payable.read')
  payable(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.getSupplierPayable(actor, id);
  }

  @Post('supplier-payables/generate')
  @RequirePermission('supplier_payable.create')
  generate(
    @Actor() actor: CurrentActor,
    @Body() data: GenerateSupplierPayableDto,
  ) {
    return this.procurement.generateSupplierPayable(actor, data);
  }

  @Get('supplier-payment-schedules')
  @RequirePermission('supplier_payable.read')
  schedules(
    @Actor() actor: CurrentActor,
    @Query() query: SupplierPayablesQuery,
  ) {
    return this.procurement.listSupplierPaymentSchedules(actor, query);
  }

  @Post('supplier-payment-schedules')
  @RequirePermission('supplier_payable.create')
  createSchedule(
    @Actor() actor: CurrentActor,
    @Body() data: CreateSupplierPaymentScheduleDto,
  ) {
    return this.procurement.createSupplierPaymentSchedule(actor, data);
  }

  @Patch('supplier-payment-schedules/:id')
  @RequirePermission('supplier_payable.update')
  updateSchedule(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateSupplierPaymentScheduleDto,
  ) {
    return this.procurement.updateSupplierPaymentSchedule(actor, id, data);
  }

  @Get('supplier-payments')
  @RequirePermission('supplier_payment.read')
  payments(
    @Actor() actor: CurrentActor,
    @Query() query: SupplierPayablesQuery,
  ) {
    return this.procurement.listSupplierPayments(actor, query);
  }

  @Post('supplier-payments')
  @RequirePermission('supplier_payment.record')
  createPayment(
    @Actor() actor: CurrentActor,
    @Body() data: CreateSupplierPaymentDto,
  ) {
    return this.procurement.createSupplierPayment(actor, data);
  }

  @Get('supplier-payments/:id')
  @RequirePermission('supplier_payment.read')
  payment(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.getSupplierPayment(actor, id);
  }

  @Post('supplier-payments/:id/submit')
  @RequirePermission('supplier_payment.record')
  submit(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionSupplierPayment(actor, id, 'SUBMITTED');
  }

  @Post('supplier-payments/:id/approve')
  @RequirePermission('supplier_payment.approve')
  approve(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProformaInvoiceDecisionDto,
  ) {
    return this.procurement.transitionSupplierPayment(
      actor,
      id,
      'APPROVED',
      data.comment,
    );
  }

  @Post('supplier-payments/:id/reject')
  @RequirePermission('supplier_payment.approve')
  reject(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ProformaInvoiceDecisionDto,
  ) {
    return this.procurement.transitionSupplierPayment(
      actor,
      id,
      'REJECTED',
      data.comment,
    );
  }

  @Post('supplier-payments/:id/allocate')
  @RequirePermission('supplier_payment.allocate')
  allocate(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: AllocateSupplierPaymentDto,
  ) {
    return this.procurement.allocateSupplierPayment(actor, id, data);
  }

  @Post('supplier-payments/:id/cancel')
  @RequirePermission('supplier_payment.record')
  cancel(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionSupplierPayment(actor, id, 'CANCELLED');
  }
}
