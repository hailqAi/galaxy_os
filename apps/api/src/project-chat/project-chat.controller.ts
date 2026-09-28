import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ValidationPipe,
  Type,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  CanActivate,
  ExecutionContext,
  PreconditionFailedException,
} from '@nestjs/common';
import { Actor, AllowExternal } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  ChatAuthorityDto,
  ChatGrantDto,
  ChatMessageDto,
  ChatMessagesQuery,
  ChatRoomDto,
  ChatHistoryDto,
  ChatLockDto,
  ChatParticipantDto,
  ChatRenewDto,
  ChatUploadDto,
  ChatReleaseDto,
  ChatPublishDto,
} from './project-chat.dto';
import { ProjectChatService } from './project-chat.service';
import { FilesService } from '../files/files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { genericFileUploadLimits } from '../files/files.controller';
import { MultipartAdmissionInterceptor } from '../files/multipart-admission.interceptor';

// Explicit metatype also validates requests in the repository's esbuild test runner.
const input = (expectedType: Type<unknown>) =>
  new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

export class ChatActorPrecondition implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      method: string;
      headers: Record<string, string | undefined>;
      actor: CurrentActor;
    }>();
    if (
      (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
        req.headers['x-chat-actor'] !== undefined) &&
      req.headers['x-chat-actor'] !== req.actor.userId
    )
      throw new PreconditionFailedException(
        'Tài khoản đã thay đổi; bỏ nháp và mở lại phòng',
      );
    return true;
  }
}

@Controller('project-chat')
@AllowExternal()
@UseGuards(ChatActorPrecondition)
export class ProjectChatController {
  constructor(
    @Inject(ProjectChatService) private readonly service: ProjectChatService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}
  @Get('projects/:id/link-options') linkOptions(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.linkOptions(actor, id);
  }
  @Post('rooms/:id/releases') prepareRelease(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatReleaseDto)) value: ChatReleaseDto,
  ) {
    return this.service.prepareRelease(actor, id, value);
  }
  @Get('rooms/:id/releases') releases(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.releases(actor, id);
  }
  @Post('releases/:id/publish') publish(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatPublishDto)) value: ChatPublishDto,
  ) {
    return this.service.publishRelease(actor, id, value.recipientHash);
  }
  @Post('releases/:id/revoke') revokeRelease(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeRelease(actor, id);
  }
  @Get('releases/:id/preview') async preview(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    return this.fileResponse(
      await this.service.previewRelease(actor, id),
      response,
    );
  }
  @Get('releases/:id/review') reviewRelease(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.reviewRelease(actor, id);
  }
  @Get('releases/:id/download') async downloadRelease(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    return this.fileResponse(
      await this.service.downloadRelease(actor, id),
      response,
    );
  }
  @Get('projects') projects(@Actor() actor: CurrentActor) {
    return this.service.projects(actor);
  }
  @Get('projects/:id/management') management(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.management(actor, id);
  }
  @Post('projects/:id/authorities/:grantId/revoke') revokeAuthority(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ) {
    return this.service.revokeAuthority(actor, id, grantId);
  }
  @Get('rooms/:id/release-sources') releaseSources(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.releaseSources(actor, id);
  }
  @Get('projects/:id/rooms') rooms(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.rooms(actor, id);
  }
  @Post('rooms/:id/files')
  @UseInterceptors(
    MultipartAdmissionInterceptor,
    FileInterceptor('file', { limits: genericFileUploadLimits }),
  )
  upload(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatUploadDto)) value: ChatUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.files.upload(
      actor,
      { entityType: 'ChatRoom', entityId: id, category: 'CHAT_ATTACHMENT' },
      file,
      value.clientKey,
    );
  }
  @Get('rooms/:id/files/:fileId/download') async download(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    const result = await this.service.download(actor, id, fileId);
    return this.fileResponse(result, response);
  }
  private fileResponse(
    result: {
      file: { mimeType: string; originalFilename: string };
      data: Buffer | import('node:stream').Readable;
    },
    response: { setHeader(name: string, value: string): void },
  ) {
    response.setHeader('Content-Type', result.file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(result.file.originalFilename).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`,
    );
    response.setHeader('Cache-Control', 'no-store');
    return Buffer.isBuffer(result.data)
      ? new StreamableFile(result.data)
      : new StreamableFile(result.data);
  }
  @Post('projects/:id/participants') participant(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatParticipantDto)) value: ChatParticipantDto,
  ) {
    return this.service.participant(actor, id, value.userId);
  }
  @Post('rooms/:id/grants/:grantId/renew') renew(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Body(input(ChatRenewDto)) value: ChatRenewDto,
  ) {
    return this.service.renew(actor, id, grantId, value.expiresAt);
  }
  @Post('rooms/:id/lock') lock(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatLockDto)) value: ChatLockDto,
  ) {
    return this.service.lock(actor, id, value.locked);
  }
  @Post('rooms/:id/grants/:grantId/history') history(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Body(input(ChatHistoryDto)) value: ChatHistoryDto,
  ) {
    return this.service.grantHistory(actor, id, grantId, value);
  }
  @Post('projects/:id/authorities') authority(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatAuthorityDto)) value: ChatAuthorityDto,
  ) {
    return this.service.authority(actor, id, value);
  }
  @Post('projects/:id/rooms') create(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatRoomDto)) value: ChatRoomDto,
  ) {
    return this.service.createRoom(actor, id, value);
  }
  @Post('rooms/:id/grants') grant(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatGrantDto)) value: ChatGrantDto,
  ) {
    return this.service.grant(actor, id, value);
  }
  @Post('rooms/:id/grants/:grantId/revoke') revoke(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ) {
    return this.service.revoke(actor, id, grantId);
  }
  @Get('rooms/:id/messages') messages(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(input(ChatMessagesQuery)) query: ChatMessagesQuery,
  ) {
    return this.service.messages(actor, id, query);
  }
  @Post('rooms/:id/messages') send(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(input(ChatMessageDto)) value: ChatMessageDto,
  ) {
    return this.service.send(actor, id, value);
  }
}
