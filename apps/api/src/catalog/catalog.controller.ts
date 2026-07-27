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
  BankReferenceDto,
  BrandDto,
  CatalogQuery,
  ProductDto,
  SupplierContactDto,
  SupplierDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  @Get('brands')
  @RequirePermission('catalog.read')
  brands(@Actor() a: CurrentActor, @Query() q: CatalogQuery) {
    return this.catalog.brands(a, q.page, q.pageSize, q.search);
  }
  @Post('brands')
  @RequirePermission('catalog.create')
  createBrand(@Actor() a: CurrentActor, @Body() d: BrandDto) {
    return this.catalog.createBrand(a, d);
  }
  @Get('products')
  @RequirePermission('catalog.read')
  products(@Actor() a: CurrentActor, @Query() q: CatalogQuery) {
    return this.catalog.products(a, q.page, q.pageSize, q.search);
  }
  @Post('products')
  @RequirePermission('catalog.create')
  createProduct(@Actor() a: CurrentActor, @Body() d: ProductDto) {
    return this.catalog.createProduct(a, d);
  }
  @Get('suppliers')
  @RequirePermission('supplier.read')
  suppliers(@Actor() a: CurrentActor, @Query() q: CatalogQuery) {
    return this.catalog.suppliers(a, q.page, q.pageSize, q.search);
  }
  @Post('suppliers')
  @RequirePermission('supplier.create')
  createSupplier(@Actor() a: CurrentActor, @Body() d: SupplierDto) {
    return this.catalog.createSupplier(a, d);
  }
  @Post('suppliers/:id/contacts')
  @RequirePermission('supplier.update')
  addContact(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SupplierContactDto,
  ) {
    return this.catalog.addContact(a, id, d);
  }
  @Get('suppliers/:id/bank-reference')
  @RequirePermission('bank_information.read')
  bank(@Actor() a: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.bankReference(a, id);
  }
  @Patch('suppliers/:id/bank-reference')
  @RequirePermission('bank_information.update')
  setBank(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: BankReferenceDto,
  ) {
    return this.catalog.setBankReference(a, id, d.bankInformationReference);
  }
}
