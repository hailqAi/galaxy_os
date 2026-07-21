import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CurrentActor } from './current-actor';

export type UserAction =
  | 'view'
  | 'update'
  | 'disable'
  | 'reactivate'
  | 'resetPassword'
  | 'revokeSessions'
  | 'manageDepartments'
  | 'assignRoles'
  | 'viewAudit';

@Injectable()
export class UserManagementPolicy {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  visibleWhere(actor: CurrentActor): Prisma.UserWhereInput {
    if (actor.administrationScope === 'SYSTEM') return {};
    if (actor.administrationScope === 'ORGANIZATION')
      return {
        organizationMembers: { some: { organizationId: actor.organizationId } },
      };
    if (actor.administrationScope === 'MANAGED_DEPARTMENTS')
      return {
        organizationMembers: { some: { organizationId: actor.organizationId } },
        departmentMembers: {
          some: {
            organizationId: actor.organizationId,
            departmentId: { in: actor.managedDepartmentIds },
          },
        },
        roles: {
          none: {
            organizationId: actor.organizationId,
            role: {
              OR: [
                { isProtected: true },
                { administrationTier: { gte: actor.administrationTier } },
              ],
            },
          },
        },
      };
    return { id: actor.userId };
  }

  requireOrganizationScope(actor: CurrentActor) {
    if (!['SYSTEM', 'ORGANIZATION'].includes(actor.administrationScope))
      throw new ForbiddenException(
        'Organization administration scope required',
      );
  }

  assertDelegableRoles(actor: CurrentActor, roleIds: string[]) {
    return this.assertRoles(actor, roleIds);
  }

  actions(
    actor: CurrentActor,
    target: {
      id: string;
      roles: { role: { isProtected: boolean; administrationTier: number } }[];
    },
  ) {
    const readable = actor.permissions.includes('user.read') ? ['view'] : [];
    const blocked =
      actor.userId === target.id ||
      target.roles.some(({ role }) => role.isProtected) ||
      Math.max(0, ...target.roles.map(({ role }) => role.administrationTier)) >=
        actor.administrationTier;
    if (blocked)
      return actor.permissions.includes('permission.read')
        ? [...readable, 'capabilities']
        : readable;
    const actionPermissions = [
      ['update', 'user.update'],
      ['disable', 'user.disable'],
      ['reactivate', 'user.reactivate'],
      ['resetPassword', 'user.password.temporary'],
      ['revokeSessions', 'user.session.revoke'],
      ['manageDepartments', 'department.member.manage'],
      ['assignRoles', 'role.assign'],
      ['viewAudit', 'user.audit.read'],
    ] as const;
    return [
      ...readable,
      ...(actor.permissions.includes('permission.read')
        ? ['capabilities']
        : []),
      ...actionPermissions.flatMap(([action, permission]) =>
        actor.permissions.includes(permission) ? [action] : [],
      ),
    ];
  }

  async assert(
    actor: CurrentActor,
    userId: string,
    action: UserAction,
    roleIds?: string[],
  ) {
    const target = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationMembers: { some: { organizationId: actor.organizationId } },
      },
      include: {
        departmentMembers: { where: { organizationId: actor.organizationId } },
        roles: {
          where: {
            organizationId: actor.organizationId,
            status: 'active',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { role: true },
        },
      },
    });
    if (!target) throw new NotFoundException('User not found');
    const visible =
      actor.administrationScope === 'SYSTEM' ||
      actor.administrationScope === 'ORGANIZATION' ||
      (actor.administrationScope === 'MANAGED_DEPARTMENTS' &&
        target.departmentMembers.some(({ departmentId }) =>
          actor.managedDepartmentIds.includes(departmentId),
        ) &&
        !target.roles.some(({ role }) => role.isProtected));
    if (!visible) throw new NotFoundException('User not found');
    if (
      action !== 'view' &&
      actor.administrationScope !== 'SYSTEM' &&
      target.roles.some(({ role }) => role.isProtected)
    ) {
      await this.rejected(
        actor,
        userId,
        'authorization.protected-target.rejected',
        action,
      );
      throw new ConflictException('Protected administrator cannot be modified');
    }
    if (action !== 'view' && actor.userId === userId) {
      await this.rejected(
        actor,
        userId,
        'authorization.self-target.rejected',
        action,
      );
      throw new ForbiddenException(
        'Administrative self-mutation is not allowed',
      );
    }
    const targetTier = Math.max(
      0,
      ...target.roles.map(({ role }) => role.administrationTier),
    );
    if (
      action !== 'view' &&
      actor.administrationScope !== 'SYSTEM' &&
      targetTier >= actor.administrationTier
    ) {
      await this.rejected(
        actor,
        userId,
        'authorization.target-tier.rejected',
        action,
      );
      throw new ForbiddenException(
        'Target has equal or greater administrative authority',
      );
    }
    if (action === 'assignRoles') await this.assertRoles(actor, roleIds ?? []);
    return target;
  }

  private async assertRoles(actor: CurrentActor, roleIds: string[]) {
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: roleIds },
        organizationId: actor.organizationId,
        status: 'active',
      },
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== roleIds.length)
      throw new NotFoundException('Role not found');
    if (
      roles.some(
        (role) =>
          (role.isProtected && actor.administrationScope !== 'SYSTEM') ||
          (!role.isDelegable && actor.administrationScope !== 'SYSTEM') ||
          (role.administrationTier >= actor.administrationTier &&
            actor.administrationScope !== 'SYSTEM') ||
          role.permissions.some(
            ({ permission }) => !actor.permissions.includes(permission.code),
          ),
      )
    ) {
      await this.prisma.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'authorization.delegation.rejected',
          entityType: 'User',
          entityId: actor.userId,
          metadata: { roleIds },
        },
      });
      throw new ConflictException('Role exceeds the actor delegation ceiling');
    }
  }

  private rejected(
    actor: CurrentActor,
    entityId: string,
    action: string,
    requestedAction: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action,
        entityType: 'User',
        entityId,
        metadata: { requestedAction },
      },
    });
  }
}
