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
  CreateSupplierComparisonDto,
  SelectSupplierDto,
} from './procurement.dto';
import { ProcurementService } from './procurement.service';

@Controller('supplier-comparisons')
export class SupplierComparisonController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
  ) {}

  @Get()
  @RequirePermission('procurement.supplier_selection.read')
  list(@Actor() actor: CurrentActor) {
    return this.procurement.listSupplierComparisons(actor);
  }

  @Post()
  @RequirePermission('procurement.supplier_selection.create')
  create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateSupplierComparisonDto,
  ) {
    return this.procurement.createSupplierComparison(actor, data);
  }
  @Get(':id')
  @RequirePermission('procurement.supplier_selection.read')
  get(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.getSupplierComparison(actor, id);
  }
  @Post(':id/select')
  @RequirePermission('procurement.supplier_selection.create')
  select(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: SelectSupplierDto,
  ) {
    return this.procurement.selectSupplier(actor, id, data);
  }
  @Post(':id/submit')
  @RequirePermission('procurement.supplier_selection.create')
  submit(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionSupplierComparison(
      actor,
      id,
      'SUBMITTED',
    );
  }
  @Post(':id/approve')
  @RequirePermission('procurement.supplier_selection.approve')
  approve(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.procurement.transitionSupplierComparison(actor, id, 'APPROVED');
  }
  @Post(':id/reject')
  @RequirePermission('procurement.supplier_selection.approve')
  reject(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.transitionSupplierComparison(actor, id, 'REJECTED');
  }
}
