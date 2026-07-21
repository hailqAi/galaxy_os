import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';

const systemKeys = new Set([
  'authentication.passwordPolicy',
  'authentication.sessionLifetimeHours',
  'features.organizationProvisioning',
  'uploads.maximumBytes',
  'audit.retentionDays',
]);
const organizationKeys = new Set([
  'profile.logoUrl',
  'profile.contact',
  'structure.defaultDepartmentId',
  'users.display',
  'notifications.local',
]);

@Injectable()
export class SettingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  system(actor: CurrentActor) {
    this.systemOnly(actor);
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  setSystem(actor: CurrentActor, key: string, value: unknown) {
    this.systemOnly(actor);
    if (!systemKeys.has(key))
      throw new BadRequestException('Unknown system setting');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.systemSetting.findUnique({ where: { key } });
      const after = await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: value as never, updatedByUserId: actor.userId },
        update: { value: value as never, updatedByUserId: actor.userId },
      });
      await this.audit.write(tx, actor, {
        action: 'system.setting.update',
        entityType: 'SystemSetting',
        entityId: after.id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }

  organization(actor: CurrentActor) {
    return this.prisma.organizationSetting.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { key: 'asc' },
    });
  }

  setOrganization(actor: CurrentActor, key: string, value: unknown) {
    if (!organizationKeys.has(key))
      throw new BadRequestException('Unknown organization setting');
    return this.prisma.$transaction(async (tx) => {
      const where = {
        organizationId_key: { organizationId: actor.organizationId, key },
      };
      const before = await tx.organizationSetting.findUnique({ where });
      const after = await tx.organizationSetting.upsert({
        where,
        create: {
          organizationId: actor.organizationId,
          key,
          value: value as never,
        },
        update: { value: value as never },
      });
      await this.audit.write(tx, actor, {
        action: 'organization.setting.update',
        entityType: 'OrganizationSetting',
        entityId: after.id,
        beforeData: before,
        afterData: after,
      });
      return after;
    });
  }

  private systemOnly(actor: CurrentActor) {
    if (actor.administrationScope !== 'SYSTEM')
      throw new ForbiddenException('System Administrator required');
  }
}
