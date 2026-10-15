import { McpBusinessTools } from './mcp.business';
import { McpExecutionService } from './mcp.execution';
import { Actor, Public } from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import {
  All,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { McpOAuth } from './mcp.oauth';
import { McpJobsService } from './mcp.jobs.service';
import { McpServerService, McpRequest, McpResponse } from './mcp.server';
import { ChatActorPrecondition } from '../project-chat/project-chat.controller';
import { McpConnectionService } from './mcp.connection';

const oauthError = (error: unknown, fallback: string) => ({
  error:
    error instanceof Error &&
    [
      'invalid_request',
      'invalid_client',
      'invalid_client_metadata',
      'invalid_redirect_uri',
      'invalid_grant',
      'invalid_scope',
      'invalid_target',
      'unsupported_grant_type',
    ].includes(error.message)
      ? error.message
      : fallback,
});

@Controller()
export class McpController {
  constructor(
    @Inject(McpOAuth) private readonly oauth: McpOAuth,
    @Inject(McpJobsService) private readonly jobs: McpJobsService,
    @Inject(McpServerService) private readonly server: McpServerService,
    @Inject(McpBusinessTools) private readonly business: McpBusinessTools,
  ) {}
  @All('mcp') @Public() call(@Req() req: McpRequest, @Res() res: McpResponse) {
    return this.server.handle(req, res);
  }
  @Get('.well-known/oauth-protected-resource/mcp') @Public() resource() {
    return this.oauth.protectedResource();
  }
  @Get('.well-known/oauth-protected-resource') @Public() resourceRoot() {
    return this.oauth.protectedResource();
  }
  @Get('.well-known/oauth-authorization-server') @Public() metadata() {
    return this.oauth.metadata();
  }
  @Post('mcp/oauth/register') @Public() async register(
    @Body() body: unknown,
    @Res() res: McpResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.status(201).json(await this.oauth.register(body));
    } catch (error) {
      res.status(400).json(oauthError(error, 'invalid_client_metadata'));
    }
  }
  @Get('mcp/oauth/authorize') @Public() async authorize(
    @Query() query: unknown,
    @Res() res: McpResponse,
  ) {
    try {
      res.redirect(302, await this.oauth.authorize(query));
    } catch (error) {
      res.status(400).json({
        ...oauthError(error, 'invalid_request'),
        iss: this.oauth.origin(),
      });
    }
  }
  @Post('mcp/oauth/token') @HttpCode(200) @Public() async token(
    @Body() body: unknown,
    @Req() req: McpRequest,
    @Res() res: McpResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(await this.oauth.exchange(body, req.headers));
    } catch (error) {
      res.status(400).json(oauthError(error, 'invalid_grant'));
    }
  }
  @Post('mcp/oauth/revoke') @HttpCode(200) @Public() revoke(
    @Body() body: unknown,
  ) {
    return this.oauth.revoke(body);
  }
  @Get('mcp/file') @Public() async file(
    @Query('ticket') ticket: string,
    @Res({ passthrough: true }) res: McpResponse,
  ) {
    const { file, data } = await this.business.download(ticket);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.sizeBytes.toString());
    res.setHeader(
      'Content-Disposition',
      "attachment; filename*=UTF-8''" +
        encodeURIComponent(file.originalFilename),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(data);
  }
  @Get('mcp/input-file') @Public() async input(
    @Query('ticket') ticket: string,
    @Res({ passthrough: true }) res: McpResponse,
  ) {
    const original = await this.jobs.download(ticket);
    res.setHeader('Content-Type', original.mime);
    res.setHeader('Content-Length', original.bytes);
    res.setHeader(
      'Content-Disposition',
      "attachment; filename*=UTF-8''" + encodeURIComponent(original.name),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return new StreamableFile(original.stream);
  }
}
@Controller('mcp-connection')
export class McpConnectionController {
  constructor(
    @Inject(McpConnectionService)
    private readonly connection: McpConnectionService,
  ) {}
  @Get() status(@Actor() actor: CurrentActor) {
    return this.connection.status(actor);
  }
  @Post('check') @HttpCode(200) check(@Actor() actor: CurrentActor) {
    return this.connection.check(actor);
  }
  @Post('revoke') @HttpCode(200) revoke(@Actor() actor: CurrentActor) {
    return this.connection.revoke(actor);
  }
}
@Controller('mcp-auth')
export class McpConsentController {
  constructor(@Inject(McpOAuth) private readonly oauth: McpOAuth) {}
  @Post('requests/:id/decline') decline(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.oauth.consent(actor, id, false);
  }
  @Get('requests/:id') preview(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.oauth.preview(actor, id);
  }
  @Post('requests/:id/consent') consent(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.oauth.consent(actor, id);
  }
}
@Controller('project-chat/projects/:projectId/ai')
@UseGuards(ChatActorPrecondition)
export class McpJobsController {
  constructor(
    @Inject(McpJobsService) private readonly jobs: McpJobsService,
    @Inject(McpExecutionService)
    private readonly execution: McpExecutionService,
  ) {}
  @Post('conversations/:conversationId/executions') execute(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: unknown,
    @Req() request: McpRequest,
  ) {
    return this.execution.create(
      actor,
      projectId,
      conversationId,
      body,
      request.runtimeIdentity?.requestId,
    );
  }
  @Post('conversations/:conversationId/mcp-jobs') create(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() body: unknown,
    @Req() request: McpRequest,
  ) {
    return this.jobs.create(
      actor,
      projectId,
      conversationId,
      body,
      undefined,
      request.runtimeIdentity?.requestId,
    );
  }
  @Post('answers/:answerId/mcp/cancel') cancel(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('answerId', ParseUUIDPipe) answerId: string,
  ) {
    return this.jobs.change(actor, projectId, answerId, 'cancel');
  }
  @Post('answers/:answerId/mcp/retry') retry(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('answerId', ParseUUIDPipe) answerId: string,
  ) {
    return this.jobs.change(actor, projectId, answerId, 'retry');
  }
  @Post('answers/:answerId/mcp/clarify') clarify(
    @Actor() actor: CurrentActor,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Body() body: unknown,
  ) {
    return this.jobs.clarify(actor, projectId, answerId, body);
  }
}
