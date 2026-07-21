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
import { ApiTags } from '@nestjs/swagger';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { PageQuery } from '../common.dto';
import { CreateDepartmentDto, UpdateDepartmentDto } from './departments.dto';
import { DepartmentsService } from './departments.service';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(
    @Inject(DepartmentsService)
    private readonly departments: DepartmentsService,
  ) {}
  @Get() @RequirePermission('department.read') list(
    @Actor() actor: CurrentActor,
    @Query() query: PageQuery,
  ) {
    return this.departments.list(actor, query.page, query.pageSize);
  }
  @Post() @RequirePermission('department.create') create(
    @Actor() actor: CurrentActor,
    @Body() data: CreateDepartmentDto,
  ) {
    return this.departments.create(actor, data);
  }
  @Get(':id') @RequirePermission('department.read') get(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.departments.get(actor, id);
  }
  @Patch(':id') @RequirePermission('department.update') update(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateDepartmentDto,
  ) {
    return this.departments.update(actor, id, data);
  }
  @Post(':id/archive') @RequirePermission('department.archive') archive(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.departments.archive(actor, id);
  }
}
