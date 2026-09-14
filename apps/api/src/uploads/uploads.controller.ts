import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import { Actor, RequirePermission } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  CompleteUploadDto,
  InitiateUploadDto,
  RecoverUploadsQuery,
  SubmitUploadsDto,
  UploadPartQuery,
} from './uploads.dto';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}
  @Post('initiate')
  @RequirePermission('file.upload')
  initiate(@Actor() a: CurrentActor, @Body() d: InitiateUploadDto) {
    return this.uploads.initiate(a, d);
  }
  @Get('constraints')
  @RequirePermission('file.upload')
  constraints(@Actor() a: CurrentActor) {
    return this.uploads.constraints(a);
  }
  @Get('recovery')
  @RequirePermission('file.upload')
  recovery(@Actor() a: CurrentActor, @Query() q: RecoverUploadsQuery) {
    return this.uploads.recover(a, q);
  }
  @Post('submit')
  @RequirePermission('file.upload')
  submit(@Actor() a: CurrentActor, @Body() d: SubmitUploadsDto) {
    return this.uploads.submit(a, d);
  }
  @Get(':id')
  @RequirePermission('file.upload')
  get(@Actor() a: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.get(a, id);
  }
  @Post(':id/parts')
  @RequirePermission('file.upload')
  part(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: UploadPartQuery,
    @Req() request: Readable,
  ) {
    return this.uploads.part(a, id, q.partNumber, q.checksum, request);
  }
  @Post(':id/complete')
  @RequirePermission('file.upload')
  complete(
    @Actor() a: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CompleteUploadDto,
  ) {
    return this.uploads.complete(a, id, d.checksum);
  }
  @Post(':id/abort')
  @RequirePermission('file.upload')
  abort(@Actor() a: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.abort(a, id);
  }
  @Post(':id/refresh')
  @RequirePermission('file.upload')
  refresh(@Actor() a: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.refresh(a, id);
  }
}
