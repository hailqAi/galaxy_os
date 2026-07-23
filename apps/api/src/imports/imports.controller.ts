import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { CreateImportDto, ImportMappingDto } from './imports.dto';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(
    @Inject(ImportsService) private readonly imports: ImportsService,
  ) {}
  @Get() @RequirePermission('import.read') list(@Actor() actor: CurrentActor) {
    return this.imports.list(actor);
  }
  @Post()
  @RequirePermission('import.create')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  create(
    @Actor() actor: CurrentActor,
    @Body() dto: CreateImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.imports.create(actor, dto, file);
  }
  @Get(':id') @RequirePermission('import.read') get(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.get(actor, id);
  }
  @Post(':id/mapping') @RequirePermission('import.create') map(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportMappingDto,
  ) {
    return this.imports.map(actor, id, dto);
  }
  @Post(':id/validate') @RequirePermission('import.create') validate(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.validate(actor, id);
  }
  @Post(':id/confirm') @RequirePermission('import.confirm') confirm(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.confirm(actor, id);
  }
  @Get(':id/errors') @RequirePermission('import.read') errors(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.imports.errors(actor, id);
  }
}
