import {
  Body,
  BadRequestException,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  Req,
} from '@nestjs/common';
import {
  Actor,
  AllowPasswordChange,
  Public,
  RequirePermission,
} from '../access-control/access.decorators';
import { CurrentActor } from '../access-control/current-actor';
import { readEnvironment } from '../config/env';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  CompleteResetPasswordDto,
  ForgotPasswordDto,
  LoginDto,
} from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public() @Post('login') async login(
    @Body() input: LoginDto,
    @Req() request: { ip?: string; query?: Record<string, unknown> },
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    if (Object.keys(request.query ?? {}).length)
      throw new BadRequestException('Login query parameters are not allowed');
    const result = await this.auth.login(
      input.email,
      input.password,
      request.ip,
    );
    const env = readEnvironment();
    response.cookie(env.SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      expires: result.expiresAt,
    });
    return { authenticated: true };
  }

  @AllowPasswordChange() @Post('logout') async logout(
    @Actor() actor: CurrentActor,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.logout(actor);
    const env = readEnvironment();
    response.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    });
    return { authenticated: false };
  }

  @AllowPasswordChange() @Post('change-password') async changePassword(
    @Actor() actor: CurrentActor,
    @Body() input: ChangePasswordDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.changePassword(
      actor,
      input.currentPassword,
      input.newPassword,
      input.confirmNewPassword,
    );
    const env = readEnvironment();
    response.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    });
    return { changed: true, loginRequired: true };
  }

  @Post('users/:id/reset-password')
  @RequirePermission('user.password.temporary')
  reset(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.issueTemporaryPassword(actor, id);
  }

  @Post('users/:id/send-reset-email')
  @RequirePermission('user.password.reset')
  sendReset(
    @Actor() actor: CurrentActor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.sendResetForUser(actor, id);
  }

  @Public() @Post('forgot-password') forgot(
    @Body() input: ForgotPasswordDto,
    @Req() request: { ip?: string },
  ) {
    return this.auth.forgotPassword(input.email, request.ip);
  }

  @Public() @Post('reset-password') completeReset(
    @Body() input: CompleteResetPasswordDto,
  ) {
    return this.auth.completePasswordReset(
      input.token,
      input.newPassword,
      input.confirmNewPassword,
    );
  }

  @Post('users/:id/revoke-sessions')
  @RequirePermission('user.session.revoke')
  revoke(@Actor() actor: CurrentActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.revokeSessions(actor, id);
  }
}

type CookieOptions = {
  httpOnly?: boolean;
  sameSite?: 'lax';
  secure?: boolean;
  path?: string;
  expires?: Date;
};
type CookieResponse = {
  cookie(name: string, value: string, options: CookieOptions): void;
  clearCookie(name: string, options: CookieOptions): void;
};
