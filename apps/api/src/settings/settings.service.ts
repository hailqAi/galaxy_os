import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
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
  SIWC_PROJECT_READ_TOOLS,
} from '../project-chat/ai-tools';
import { ChatGptConnectionService } from './chatgpt-connection.service';
import { AiError, AI_MODELS, readAiConfig } from '../project-chat/ai-registry';
import {
  siwcCapabilities,
  siwcPreference,
  siwcPreferenceKey,
  siwcPreferenceSchema,
} from './siwc-capabilities';

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
    @Inject(ChatGptConnectionService)
    private readonly connection: ChatGptConnectionService,
  ) {}

  system(actor: CurrentActor) {
    this.systemOnly(actor);
    return this.prisma.systemSetting.findMany({
      where: { key: { in: [...systemKeys] } },
      orderBy: { key: 'asc' },
    });
  }

  async chatGptConnection(actor: CurrentActor) {
    this.systemOnly(actor);
    const metadata = await this.connection.metadata(actor);
    const config = readAiConfig();
    return {
      ...metadata,
      preferredSelection: await siwcPreference(this.prisma, actor),
      tools: toolDefinitions(Object.keys(toolInputs) as ToolName[]).map(
        ({ function: tool }) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
          ...toolPolicy(tool.name as ToolName),
          implementation: 'LOCAL_IMPLEMENTED',
          status:
            SIWC_PROJECT_READ_TOOLS.includes(tool.name as ToolName) &&
            metadata.canTestOwnerInference
              ? 'AVAILABLE'
              : 'DISABLED',
          reason: SIWC_PROJECT_READ_TOOLS.includes(tool.name as ToolName)
            ? metadata.canTestOwnerInference
              ? 'OWNER_READ_TOOL_AVAILABLE'
              : 'CHATGPT_NOT_READY'
            : 'NOT_ENABLED_ON_SIWC',
        }),
      ),
      executionPolicy:
        process.env.GALAXY_AI_EXECUTION_POLICY ?? 'LEGACY_API_KEY',
      apiRelease: process.env.GALAXY_RELEASE_ID ?? null,
      legacyProviders: AI_MODELS.map(({ provider }) => ({
        provider,
        paused: config[provider]?.paused ?? false,
        configured: Boolean(config[provider]),
      })),
    };
  }

  async checkChatGptConnection(actor: CurrentActor) {
    this.systemOnly(actor);
    try {
      await this.connection.catalog(actor);
    } catch (error) {
      if (error instanceof AiError) throw new ConflictException(error.code);
      throw new ServiceUnavailableException('CHATGPT_CATALOG_UNAVAILABLE');
    }
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

  setChatGptPreference(actor: CurrentActor, value: unknown) {
    this.systemOnly(actor);
    const parsed = siwcPreferenceSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('SIWC_PREFERENCE_INPUT_INVALID');
    return this.prisma.$transaction(async (tx) => {
      const owner = await this.connection.owner(actor, undefined, tx);
      if (!owner.models.some((m) => m.id === parsed.data.model))
        throw new ConflictException('MODEL_NOT_AVAILABLE');
      const capability = await siwcCapabilities(
        tx,
        actor.organizationId,
        owner.generation,
        parsed.data.model,
      );
      if (!capability.reasoningModes.includes(parsed.data.reasoning))
        throw new ConflictException('SIWC_REASONING_UNVERIFIED');
      const key = siwcPreferenceKey(actor);
      const before = await tx.systemSetting.findUnique({ where: { key } });
      const after = await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: parsed.data, updatedByUserId: actor.userId },
        update: { value: parsed.data, updatedByUserId: actor.userId },
      });
      await this.audit.write(tx, actor, {
        action: 'chatgpt.preference.update',
        entityType: 'SystemSetting',
        entityId: after.id,
        beforeData: before?.value,
        afterData: parsed.data,
      });
      return parsed.data;
    });
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
