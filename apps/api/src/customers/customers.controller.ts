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
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import {
  CreateContactDto,
  CreateCustomerDto,
  UpdateContactDto,
  UpdateCustomerDto,
} from './customers.dto';
import { CustomersService } from './customers.service';

class CustomersQuery extends PageQuery {
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional() @IsIn(['INDIVIDUAL', 'COMPANY']) type?:
    | 'INDIVIDUAL'
    | 'COMPANY';
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED']) status?:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'ARCHIVED';
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsIn(['displayName', 'updatedAt']) sort?:
    | 'displayName'
    | 'updatedAt';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}

@Controller('customers')
export class CustomersController {
  constructor(
    @Inject(CustomersService) private readonly customers: CustomersService,
  ) {}
  @Get() @RequirePermission('crm.customer.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: CustomersQuery,
  ) {
    return this.customers.list(actor, query);
  }
  @Post() @RequirePermission('crm.customer.create') create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateCustomerDto,
  ) {
    return this.customers.create(actor, data);
  }
  @Get(':id') @RequirePermission('crm.customer.read') get(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.get(actor, id);
  }
  @Patch(':id') @RequirePermission('crm.customer.update') update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateCustomerDto,
  ) {
    return this.customers.update(actor, id, data);
  }
  @Delete(':id') @RequirePermission('crm.customer.delete') remove(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.remove(actor, id);
  }
  @Get(':id/contacts') @RequirePermission('crm.contact.read') contacts(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.contacts(actor, id);
  }
  @Post(':id/contacts') @RequirePermission('crm.contact.create') createContact(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CreateContactDto,
  ) {
    return this.customers.createContact(actor, id, data);
  }
}

@Controller('contacts')
export class ContactsController {
  constructor(
    @Inject(CustomersService) private readonly customers: CustomersService,
  ) {}
  @Patch(':id') @RequirePermission('crm.contact.update') update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateContactDto,
  ) {
    return this.customers.updateContact(actor, id, data);
  }
  @Delete(':id') @RequirePermission('crm.contact.delete') remove(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.removeContact(actor, id);
  }
}
