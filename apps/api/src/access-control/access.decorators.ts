import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { CurrentActor } from './current-actor';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSIONS = 'requiredPermissions';
export const ALLOW_PASSWORD_CHANGE = 'allowPasswordChange';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const AllowPasswordChange = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE, true);
export const Actor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentActor =>
    context.switchToHttp().getRequest<{ actor: CurrentActor }>().actor,
);
