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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { FilesQuery, UpdateFileDto, UploadFileDto } from './files.dto';
import { FilesService } from './files.service';
import { MultipartAdmissionInterceptor } from './multipart-admission.interceptor';
type BinaryResponse = {
  setHeader(name: string, value: string): void;
};
const rfc5987Filename = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
export const genericFileUploadLimits = {
  fileSize: 10 * 1024 * 1024,
  files: 1,
  fields: 4,
  fieldSize: 4 * 1024,
  parts: 5,
  headerPairs: 50,
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
    MultipartAdmissionInterceptor,
    FileInterceptor('file', {
      limits: genericFileUploadLimits,
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
  @Get(':id/preview')
  @RequirePermission('file.read', 'file.download')
  async preview(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: BinaryResponse,
  ): Promise<StreamableFile> {
    const result = await this.files.preview(a, id);
    response.setHeader('Content-Type', result.file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${rfc5987Filename(result.file.originalFilename)}`,
    );
    response.setHeader('Content-Length', String(result.file.sizeBytes));
    return new StreamableFile(result.data);
  }
  @Get(':id/download') @RequirePermission('file.download') async download(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: BinaryResponse,
  ): Promise<StreamableFile> {
    const result = await this.files.download(a, id);
    response.setHeader('Content-Type', result.file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${rfc5987Filename(result.file.originalFilename)}`,
    );
    response.setHeader('Content-Length', String(result.file.sizeBytes));
    return new StreamableFile(result.data);
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
