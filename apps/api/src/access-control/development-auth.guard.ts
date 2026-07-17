import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readEnvironment } from '../config/env';
import { PrismaService } from '../prisma.service';
import { IS_PUBLIC } from './access.decorators';
import { CurrentActor } from './current-actor';

@Injectable()
export class DevelopmentAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const environment = readEnvironment();
    if (!environment.ALLOW_DEV_AUTH || environment.NODE_ENV === 'production') {
      throw new UnauthorizedException('Development authentication is disabled');
    }
    const user = await this.prisma.user.findUnique({
      where: { email: environment.DEV_AUTH_USER_EMAIL.trim().toLowerCase() },
      include: {
        organizationMembers: {
          where: { status: 'active', organization: { status: 'active' } },
          include: {
            organization: true,
          },
          take: 1,
        },
        roles: {
          where: { role: { status: 'active' } },
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    const membership = user?.organizationMembers[0];
    if (!user || user.status !== 'active' || !membership)
      throw new UnauthorizedException('Active user membership required');
    const permissions = new Set(
      user.roles
        .filter(
          (assignment) =>
            assignment.organizationId === membership.organizationId,
        )
        .flatMap((assignment) =>
          assignment.role.permissions.map(({ permission }) => permission.code),
        ),
    );
    const actor: CurrentActor = {
      userId: user.id,
      organizationId: membership.organizationId,
      email: user.email,
      displayName: user.displayName,
      permissions: [...permissions].sort(),
    };
    context.switchToHttp().getRequest<{ actor?: CurrentActor }>().actor = actor;
    return true;
  }
}
