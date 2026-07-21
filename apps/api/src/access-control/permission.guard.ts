import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS } from './access.decorators';
import { CurrentActor } from './current-actor';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (!required.length) return true;
    const actor = context
      .switchToHttp()
      .getRequest<{ actor?: CurrentActor }>().actor;
    if (
      !actor ||
      required.some((permission) => !actor.permissions.includes(permission))
    ) {
      throw new ForbiddenException('Required permission is missing');
    }
    return true;
  }
}
