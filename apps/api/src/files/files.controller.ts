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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { FilesQuery, UpdateFileDto, UploadFileDto } from './files.dto';
import { FilesService } from './files.service';
type BinaryResponse = {
  setHeader(name: string, value: string): void;
  send(data: Buffer): void;
};
@Controller('files')
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}
  @Get() @RequirePermission('file.read') list(
    @Actor() a: CurrentActor,
    @Query() q: FilesQuery,
  ) {
    return this.files.list(a, q);
  }
  @Post()
  @RequirePermission('file.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Actor() a: CurrentActor,
    @Body() d: UploadFileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.files.upload(a, d, file);
  }
  @Get(':id') @RequirePermission('file.read') get(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.files.get(a, id);
  }
  @Get(':id/download') @RequirePermission('file.download') async download(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: BinaryResponse,
  ) {
    const result = await this.files.download(a, id);
    response.setHeader('Content-Type', result.file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.file.originalFilename)}`,
    );
    response.setHeader('Content-Length', String(result.data.length));
    response.send(result.data);
  }
  @Patch(':id') @RequirePermission('file.update') update(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateFileDto,
  ) {
    return this.files.update(a, id, d);
  }
  @Delete(':id') @RequirePermission('file.delete') remove(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.files.remove(a, id);
  }
  @Post(':id/restore') @RequirePermission('file.restore') restore(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.files.restore(a, id);
  }
}
