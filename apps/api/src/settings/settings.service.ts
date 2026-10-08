import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import {
  toolDefinitions,
  toolInputs,
  toolPolicy,
  ToolName,
} from '../project-chat/ai-tools';
import { AI_MODELS, readAiConfig } from '../project-chat/ai-registry';

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

  async chatGptConnection(actor: CurrentActor) {
    this.systemOnly(actor);
    const lastCheck = await this.prisma.auditLog.findFirst({
      where: {
        organizationId: actor.organizationId,
        action: 'chatgpt.connection.check',
        entityType: 'ChatGptConnection',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const config = readAiConfig();
    return {
      status: 'NOT_CONFIGURED',
      appEligibility: 'ELIGIBILITY_UNCONFIRMED',
      inferenceGrant: 'NOT_GRANTED',
      providerScope: 'UNCONFIRMED',
      identity: null,
      models: [],
      tools: toolDefinitions(Object.keys(toolInputs) as ToolName[]).map(
        ({ function: tool }) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
          ...toolPolicy(tool.name as ToolName),
          implementation: 'LOCAL_IMPLEMENTED',
          status: 'DISABLED',
          reason: 'CHATGPT_NOT_CONFIGURED',
        }),
      ),
      canConnect: false,
      canDisconnect: false,
      canCheck: actor.permissions.includes('system.settings.update'),
      checkedAt: lastCheck?.createdAt.toISOString() ?? null,
      checkKind: 'LOCAL_CONFIGURATION_ONLY',
      executionPolicy:
        process.env.GALAXY_AI_EXECUTION_POLICY ?? 'LEGACY_API_KEY',
      apiRelease: process.env.GALAXY_RELEASE_ID ?? null,
      legacyProviders: AI_MODELS.map(({ provider }) => ({
        provider,
        paused: config[provider]?.paused ?? false,
        configured: Boolean(config[provider]),
      })),
      missingRequirements: [
        'APP_REGISTRATION',
        'INFERENCE_GRANT',
        'MULTIUSER_PROVIDER_SCOPE',
      ],
      callbackHost: 'NOT_CONFIGURED',
      callbackLan: 'NOT_VERIFIED',
      usage: 'UNKNOWN',
    };
  }

  async checkChatGptConnection(actor: CurrentActor) {
    this.systemOnly(actor);
    const metadata = await this.chatGptConnection(actor);
    const check = await this.prisma.$transaction((tx) =>
      this.audit.write(tx, actor, {
        action: 'chatgpt.connection.check',
        entityType: 'ChatGptConnection',
        entityId: actor.organizationId,
        afterData: {
          status: metadata.status,
          appEligibility: metadata.appEligibility,
          providerScope: metadata.providerScope,
          checkKind: metadata.checkKind,
        },
      }),
    );
    return { ...metadata, checkedAt: check.createdAt.toISOString() };
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
