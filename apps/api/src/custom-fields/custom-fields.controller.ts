import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CustomFieldEntityType } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { CreateCustomFieldDto, SetCustomValuesDto } from './custom-fields.dto';
import { CustomFieldsService } from './custom-fields.service';

class CustomFieldQuery {
  @IsOptional()
  @IsIn(['USER', 'ORGANIZATION_MEMBER', 'DEPARTMENT', 'ROLE'])
  entityType?: CustomFieldEntityType;
}

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(
    @Inject(CustomFieldsService) private readonly fields: CustomFieldsService,
  ) {}
  @Get() @RequirePermission('custom_fields.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: CustomFieldQuery,
  ) {
    return this.fields.list(actor, query.entityType);
  }
  @Post() @RequirePermission('custom_fields.create') create(
    @Actor() actor: CurrentActor,
    @Body() input: CreateCustomFieldDto,
  ) {
    return this.fields.create(actor, input);
  }
  @Post(':id/archive') @RequirePermission('custom_fields.archive') archive(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fields.archive(actor, id);
  }
  @Put(':entityType/:entityId/values')
  @RequirePermission('custom_fields.update')
  values(
    @Actor() actor: CurrentActor,
    @Param('entityType') entityType: CustomFieldEntityType,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body() input: SetCustomValuesDto,
  ) {
    return this.fields.setValues(actor, entityType, entityId, input.values);
  }
}
