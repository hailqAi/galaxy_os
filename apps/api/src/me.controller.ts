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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, Length } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, AllowPasswordChange } from './access-control/access.decorators';
import { CurrentActor } from './access-control/current-actor';
import { MeService } from './me.service';
import { readEnvironment } from './config/env';

class ProfileDto {
  @IsString() @Length(2, 120) displayName!: string;
}

@ApiTags('current context')
@Controller('me')
export class MeController {
  constructor(@Inject(MeService) private readonly service: MeService) {}
  @Get()
  @AllowPasswordChange()
  @ApiOperation({ summary: 'Get the current actor' })
  me(@Actor() actor: CurrentActor) {
    return this.service.get(actor);
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Get effective permissions' })
  permissions(@Actor() actor: CurrentActor) {
    return { permissions: actor.permissions };
  }

  @Patch('profile') profile(
    @Actor() actor: CurrentActor,
    @Body() input: ProfileDto,
  ) {
    return this.service.updateProfile(actor, input.displayName);
  }

  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: readEnvironment().AVATAR_MAX_BYTES },
    }),
  )
  upload(
    @Actor() actor: CurrentActor,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.uploadAvatar(actor, file);
  }

  @Delete('avatar') remove(@Actor() actor: CurrentActor) {
    return this.service.removeAvatar(actor);
  }

  @Get('sessions') sessions(@Actor() actor: CurrentActor) {
    return this.service.sessions(actor);
  }

  @Delete('sessions/:id') revokeSession(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeSession(actor, id);
  }

  @Get('avatar/:key') async avatar(
    @Actor() actor: CurrentActor,
    @Param('key') key: string,
    @Res() response: BinaryResponse,
  ) {
    const avatar = await this.service.avatar(actor, key);
    response.type(avatar.contentType).send(avatar.data);
  }
}

type BinaryResponse = {
  type(contentType: string): BinaryResponse;
  send(data: Buffer): void;
};
