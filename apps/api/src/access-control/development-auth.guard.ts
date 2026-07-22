import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readEnvironment } from '../config/env';
import { PrismaService } from '../prisma.service';
import { IS_PUBLIC } from './access.decorators';
import { ALLOW_PASSWORD_CHANGE } from './access.decorators';
import { CurrentActor } from './current-actor';
import { createHash } from 'node:crypto';

@Injectable()
export class DevelopmentAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const environment = readEnvironment();
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      method: string;
      ip?: string;
      socket?: { remoteAddress?: string };
      actor?: CurrentActor;
    }>();
    const headers = request.headers ?? {};
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? 'GET')) {
      const origin = headers.origin;
      if (origin && origin !== environment.APP_PUBLIC_ORIGIN)
        throw new ForbiddenException('Invalid request origin');
    }
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const cookies = Object.fromEntries(
      (headers.cookie ?? '')
        .split(';')
        .filter(Boolean)
        .map((part) => {
          const [key, ...value] = part.trim().split('=');
          return [key, value.join('=')];
        }),
    );
    const token = cookies[environment.SESSION_COOKIE_NAME];
    const session = token
      ? await this.prisma.session.findUnique({
          where: {
            tokenHash: createHash('sha256').update(token).digest('hex'),
          },
          include: {
            user: { include: { credential: true } },
            organizationMembership: { include: { organization: true } },
          },
        })
      : null;
    const sessionValid =
      session &&
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      session.lastSeenAt >
        new Date(Date.now() - environment.SESSION_IDLE_MINUTES * 60_000) &&
      session.user.status === 'active' &&
      session.organizationMembership.status === 'active' &&
      session.organizationMembership.organization.status === 'active';
    if (sessionValid && session.lastSeenAt < new Date(Date.now() - 5 * 60_000))
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    let userId = sessionValid ? session.userId : undefined;
    let membershipId = sessionValid
      ? session.organizationMembershipId
      : undefined;
    if (
      !userId &&
      environment.ALLOW_DEV_AUTH &&
      environment.NODE_ENV !== 'production' &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
        request.ip ?? request.socket?.remoteAddress ?? '',
      ) &&
      headers['x-galaxy-dev-auth']?.trim().toLowerCase() ===
        environment.DEV_AUTH_USER_EMAIL
    ) {
      const developmentUser = await this.prisma.user.findUnique({
        where: { normalizedEmail: environment.DEV_AUTH_USER_EMAIL },
        include: {
          organizationMembers: {
            where: { status: 'active', organization: { status: 'active' } },
            take: 2,
          },
        },
      });
      if (
        developmentUser?.status === 'active' &&
        developmentUser.organizationMembers.length === 1
      ) {
        userId = developmentUser.id;
        membershipId = developmentUser.organizationMembers[0]!.id;
      }
    }
    if (!userId || !membershipId)
      throw new UnauthorizedException('Authentication required');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organizationMembers: {
          where: {
            id: membershipId,
            status: 'active',
            organization: { status: 'active' },
          },
          include: {
            organization: true,
            managedDepartments: {
              where: {
                status: 'active',
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                department: { status: 'active' },
              },
            },
          },
          take: 2,
        },
        roles: {
          where: {
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: { status: 'active' },
          },
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    const membership = user?.organizationMembers[0];
    if (
      !user ||
      user.status !== 'active' ||
      !membership ||
      user.organizationMembers.length !== 1
    )
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
    const assignments = user.roles.filter(
      ({ organizationId }) => organizationId === membership.organizationId,
    );
    const managedDepartmentIds = membership.managedDepartments.map(
      ({ departmentId }) => departmentId,
    );
    if (
      membership.managedDepartments.some(
        ({ includeChildren }) => includeChildren,
      )
    ) {
      const units = await this.prisma.department.findMany({
        where: { organizationId: membership.organizationId, status: 'active' },
        select: { id: true, parentId: true },
      });
      for (let changed = true; changed; ) {
        changed = false;
        for (const unit of units)
          if (
            unit.parentId &&
            managedDepartmentIds.includes(unit.parentId) &&
            !managedDepartmentIds.includes(unit.id)
          ) {
            managedDepartmentIds.push(unit.id);
            changed = true;
          }
      }
    }
    const actor: CurrentActor = {
      userId: user.id,
      organizationId: membership.organizationId,
      organizationMembershipId: membership.id,
      sessionId: sessionValid ? session.id : undefined,
      email: user.email,
      displayName: user.displayName,
      mustChangePassword: sessionValid
        ? (session.user.credential?.mustChangePassword ?? false)
        : false,
      permissions: [...permissions].sort(),
      permissionSources: assignments.flatMap((assignment) =>
        assignment.role.permissions.map(({ permission }) => ({
          permission: permission.code,
          roleId: assignment.role.id,
          roleName: assignment.role.name,
          scopeType: assignment.scopeType,
          departmentId: assignment.departmentId,
        })),
      ),
      administrationScope: assignments.some(
        ({ scopeType }) => scopeType === 'SYSTEM',
      )
        ? 'SYSTEM'
        : assignments.some(({ scopeType }) => scopeType === 'ORGANIZATION')
          ? 'ORGANIZATION'
          : assignments.some(({ scopeType }) => scopeType === 'DEPARTMENT') &&
              managedDepartmentIds.length
            ? 'MANAGED_DEPARTMENTS'
            : 'SELF',
      managedDepartmentIds,
      administrationTier: Math.max(
        0,
        ...user.roles
          .filter(
            ({ organizationId }) =>
              organizationId === membership.organizationId,
          )
          .map(({ role }) => role.administrationTier),
      ),
    };
    if (
      actor.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      throw new ForbiddenException('Password change required');
    request.actor = actor;
    return true;
  }
}
