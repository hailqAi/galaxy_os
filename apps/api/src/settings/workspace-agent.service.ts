import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { CurrentActor } from '../access-control/current-actor';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { PrismaService } from '../prisma.service';
import {
  workspaceBindingInput,
  workspaceConfigInput,
} from './workspace-agent.dto';

const prefix = 'workspace.agents.';
const stored = z
  .object({
    ownerId: z.string().uuid(),
    workspaceId: z.string().min(1).max(200),
    accessToken: z.string().min(16),
    bindings: z.array(workspaceBindingInput),
  })
  .strict();
const encrypted = z
  .object({
    formatVersion: z.literal(1),
    revision: z.string().uuid(),
    iv: z.string(),
    tag: z.string(),
    ciphertext: z.string(),
  })
  .strict();

@Injectable()
export class WorkspaceAgentService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ProjectChatPolicy) private readonly policy: ProjectChatPolicy,
  ) {}
  private async administrator(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    permission: string,
  ) {
    await this.policy.live(actor, tx);
    const fresh = await this.policy.freshActor(tx, actor);
    if (
      fresh.administrationScope !== 'SYSTEM' ||
      !fresh.permissionSources?.some(
        (source) =>
          source.permission === permission && source.scopeType === 'SYSTEM',
      )
    )
      throw new ForbiddenException('WORKSPACE_SYSTEM_PERMISSION_REQUIRED');
    return fresh;
  }
  private async key(tx: Prisma.TransactionClient, create: boolean) {
    try {
      const directory = process.env.GALAXY_WORKSPACE_RUNTIME_DIR;
      if (!directory || !isAbsolute(directory)) throw new Error();
      if (create && !existsSync(directory))
        mkdirSync(directory, { recursive: true, mode: 0o700 });
      const stat = lstatSync(directory);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.mode & 0o077 ||
        stat.uid !== process.getuid?.()
      )
        throw new Error();
      const path = join(directory, 'key.bin');
      if (!existsSync(path) && create) {
        if (
          await tx.systemSetting.findFirst({
            where: { key: { startsWith: prefix } },
          })
        )
          throw new Error();
        try {
          const fd = openSync(
            path,
            constants.O_WRONLY |
              constants.O_CREAT |
              constants.O_EXCL |
              constants.O_NOFOLLOW,
            0o600,
          );
          try {
            writeFileSync(fd, randomBytes(32));
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const file = fstatSync(fd);
        if (
          !file.isFile() ||
          file.mode & 0o077 ||
          file.uid !== process.getuid?.() ||
          file.size !== 32
        )
          throw new Error();
        return readFileSync(fd);
      } finally {
        closeSync(fd);
      }
    } catch {
      throw new ServiceUnavailableException('WORKSPACE_KEY_UNAVAILABLE');
    }
  }
  private aad(org: string, revision: string) {
    return Buffer.from('Galaxy.WorkspaceAgents.v1:' + org + ':' + revision);
  }
  private async read(tx: Prisma.TransactionClient, org: string) {
    const row = await tx.systemSetting.findUnique({
      where: { key: prefix + org },
    });
    if (!row) return null;
    const key = await this.key(tx, false);
    try {
      const envelope = encrypted.parse(row.value);
      const cipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(envelope.iv, 'base64'),
      );
      cipher.setAAD(this.aad(org, envelope.revision));
      cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const plaintext = Buffer.concat([
        cipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        cipher.final(),
      ]);
      return {
        revision: envelope.revision,
        data: stored.parse(JSON.parse(plaintext.toString('utf8'))),
      };
    } catch {
      throw new ServiceUnavailableException('WORKSPACE_CONFIG_UNREADABLE');
    }
  }
  private present(record: Awaited<ReturnType<WorkspaceAgentService['read']>>) {
    const bindings =
      record?.data.bindings.map((binding) => {
        let verification = 'UNVERIFIED';
        try {
          this.publishedProof(record.revision, binding);
          verification = 'CONFIG_VERIFIED';
        } catch {
          /* Missing/stale inspection blocks this binding only. */
        }
        return {
          ...binding,
          actorId: record.data.ownerId,
          visibility: 'PRIVATE',
          verification,
        };
      }) ?? [];
    const verified =
      bindings.length > 0 &&
      bindings.every((binding) => binding.verification === 'CONFIG_VERIFIED');
    return {
      status: 'WORKSPACE_DEFERRED_BY_USER',
      revision: record?.revision ?? null,
      hasCredential: Boolean(record?.data.accessToken),
      workspaceId: record?.data.workspaceId ?? null,
      observedModel: null,
      modelEvidenceLevel: verified ? 'CONFIG_VERIFIED' : 'UNVERIFIED',
      bindings,
      readiness: {
        AUTH_READY: verified ? 'CONFIG_VERIFIED' : 'UNVERIFIED',
        AGENT_PUBLISHED: verified ? 'CONFIG_VERIFIED' : 'UNVERIFIED',
        MODEL_BOUND: verified ? 'CONFIG_VERIFIED' : 'UNVERIFIED',
        TOOLS_READY: verified ? 'CONFIG_VERIFIED' : 'UNVERIFIED',
        RESULT_DESTINATION_READY: verified ? 'CONFIG_VERIFIED' : 'NOT_RUN',
        ROUNDTRIP_VERIFIED: 'NOT_RUN',
      },
    };
  }
  async metadata(actor: CurrentActor) {
    return this.db.$transaction(async (tx) => {
      await this.administrator(tx, actor, 'system.settings.read');
      return this.present(await this.read(tx, actor.organizationId));
    });
  }
  async configure(actor: CurrentActor, value: unknown) {
    const parsed = workspaceConfigInput.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('INVALID_WORKSPACE_CONFIGURATION');
    return this.db.$transaction(async (tx) => {
      const fresh = await this.administrator(
        tx,
        actor,
        'system.settings.update',
      );
      const current = await this.read(tx, actor.organizationId);
      if ((current?.revision ?? null) !== parsed.data.expectedVersion)
        throw new ConflictException('WORKSPACE_CONFIG_CHANGED');
      for (const binding of parsed.data.bindings)
        await this.policy.authority(tx, fresh, binding.projectId, 'INVOKE');
      const accessToken = parsed.data.accessToken ?? current?.data.accessToken;
      if (!accessToken)
        throw new BadRequestException('WORKSPACE_CREDENTIAL_REQUIRED');
      const data = stored.parse({
        ownerId: actor.userId,
        workspaceId: parsed.data.workspaceId,
        accessToken,
        bindings: parsed.data.bindings,
      });
      const revision = randomUUID(),
        iv = randomBytes(12);
      const cipher = createCipheriv(
        'aes-256-gcm',
        await this.key(tx, true),
        iv,
      );
      cipher.setAAD(this.aad(actor.organizationId, revision));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(data), 'utf8'),
        cipher.final(),
      ]);
      const envelope = {
        formatVersion: 1,
        revision,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      };
      const key = prefix + actor.organizationId;
      if (current) {
        const changed = await tx.systemSetting.updateMany({
          where: {
            key,
            value: { path: ['revision'], equals: current.revision },
          },
          data: { value: envelope },
        });
        if (changed.count !== 1)
          throw new ConflictException('WORKSPACE_CONFIG_CHANGED');
      } else {
        try {
          await tx.systemSetting.create({ data: { key, value: envelope } });
        } catch (error) {
          if ((error as { code?: string }).code === 'P2002')
            throw new ConflictException('WORKSPACE_CONFIG_CHANGED');
          throw error;
        }
      }
      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'workspace.agents.configure',
          entityType: 'WorkspaceAgentConfiguration',
          entityId: actor.organizationId,
          metadata: {
            revision,
            bindingCount: data.bindings.length,
            credentialChanged: parsed.data.accessToken !== undefined,
          },
        },
      });
      await this.administrator(tx, actor, 'system.settings.update');
      for (const binding of data.bindings)
        await this.policy.authority(tx, fresh, binding.projectId, 'INVOKE');
      return this.present({ revision, data });
    });
  }
  async configuredPrincipal(
    tx: Prisma.TransactionClient,
    org: string,
    principal: string,
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "key" FROM "SystemSetting" WHERE "key"=${prefix + org} FOR UPDATE`,
    );
    const record = await this.read(tx, org);
    return Boolean(
      record?.data.bindings.some((binding) => binding.id === principal),
    );
  }
  private async scopedInvoke(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    projectId: string,
  ) {
    await this.policy.live(actor, tx);
    const fresh = await this.policy.freshActor(tx, actor);
    if (
      !fresh.permissions.includes('ai.invoke') ||
      !(await tx.project.findFirst({
        where: {
          AND: [
            {
              id: projectId,
              organizationId: actor.organizationId,
              deletedAt: null,
            },
            projectWhereForPermissions(fresh, 'ai.invoke'),
          ],
        },
        select: { id: true },
      }))
    )
      throw new ForbiddenException('WORKSPACE_BINDING_DENIED');
    await this.policy.authority(tx, fresh, projectId, 'INVOKE');
  }
  async connectorBinding(
    tx: Prisma.TransactionClient,
    actor: CurrentActor,
    principalId: string,
  ) {
    await this.policy.live(actor, tx);
    const fresh = await this.policy.freshActor(tx, actor);
    if (!fresh.permissions.includes('ai.invoke'))
      throw new ForbiddenException();
    const record = await this.read(tx, actor.organizationId);
    const binding =
      record?.data.ownerId === actor.userId
        ? record.data.bindings.find((b) => b.id === principalId)
        : undefined;
    if (!record || !binding)
      throw new ForbiddenException('WORKSPACE_BINDING_DENIED');
    await this.scopedInvoke(tx, actor, binding.projectId);
    return { record, binding };
  }
  private publishedProof(
    revision: string,
    binding: z.infer<typeof workspaceBindingInput>,
  ) {
    try {
      const directory = join(
        process.env.GALAXY_WORKSPACE_RUNTIME_DIR!,
        'bindings',
      );
      const stat = lstatSync(directory);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.mode & 0o077 ||
        stat.uid !== process.getuid?.()
      )
        throw new Error();
      const inspectionFile = (name: string) => {
        const fd = openSync(
          join(directory, name),
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          const file = fstatSync(fd);
          if (
            !file.isFile() ||
            file.mode & 0o077 ||
            file.uid !== process.getuid?.() ||
            file.size > 65536
          )
            throw new Error();
          const bytes = readFileSync(fd);
          return {
            bytes,
            value: JSON.parse(bytes.toString('utf8')) as unknown,
          };
        } finally {
          closeSync(fd);
        }
      };
      const value = inspectionFile(binding.id + '.json').value;
      const proof = z
        .object({
          formatVersion: z.literal(1),
          source: z.literal('OFFICIAL_PUBLISHED_CONFIGURATION_INSPECTION'),
          credentialRevision: z.literal(revision),
          bindingId: z.literal(binding.id),
          agentId: z.literal(binding.agentId),
          channelId: z.literal(binding.channelId),
          configuredModel: z.literal(binding.configuredModel),
          effort: z.literal(binding.effort),
          publishedDigest: z.string().regex(/^[a-f0-9]{64}$/),
          officialModelEvidence: z.string().url(),
          evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/),
          entitlementVerified: z.literal(true),
          privatePilotVerified: z.literal(true),
          scopedConnectorVerified: z.literal(true),
          textDestinationVerified: z.literal(true),
          expiresAt: z.string().datetime(),
        })
        .strict()
        .parse(value);
      const evidence = inspectionFile(binding.id + '.evidence.json');
      if (
        createHash('sha256').update(evidence.bytes).digest('hex') !==
        proof.evidenceDigest
      )
        throw new Error();
      const packet = z
        .object({
          publishedConfiguration: z
            .object({
              agentId: z.literal(binding.agentId),
              channelId: z.literal(binding.channelId),
              configuredModel: z.literal(binding.configuredModel),
              effort: z.literal(binding.effort),
              state: z.literal('PUBLISHED'),
              visibility: z.literal('PRIVATE'),
              version: z.string().min(1).max(200),
            })
            .strict(),
          officialModelIdentity: z
            .object({
              modelId: z.literal(binding.configuredModel),
              url: z.literal(proof.officialModelEvidence),
              contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
            })
            .strict(),
        })
        .strict()
        .parse(evidence.value);
      if (
        createHash('sha256')
          .update(JSON.stringify(packet.publishedConfiguration))
          .digest('hex') !== proof.publishedDigest
      )
        throw new Error();
      const modelEvidence = new URL(proof.officialModelEvidence);
      if (
        binding.requestedModel !== binding.configuredModel ||
        /^(auto|default)$/i.test(binding.requestedModel) ||
        !['developers.openai.com', 'help.openai.com'].includes(
          modelEvidence.hostname,
        ) ||
        modelEvidence.protocol !== 'https:' ||
        Date.parse(proof.expiresAt) <= Date.now()
      )
        throw new Error();
      return proof;
    } catch {
      throw new ConflictException('MODEL_BINDING_UNVERIFIED');
    }
  }
  async projectBindings(
    actor: CurrentActor,
    projectId: string,
    transaction?: Prisma.TransactionClient,
  ) {
    const read = async (tx: Prisma.TransactionClient) => {
      await this.scopedInvoke(tx, actor, projectId);
      const record = await this.read(tx, actor.organizationId);
      if (record?.data.ownerId !== actor.userId) return [];
      return this.present(record).bindings.filter(
        (b) => b.projectId === projectId,
      );
    };
    return transaction ? read(transaction) : this.db.$transaction(read);
  }
  async resolveBinding(
    actor: CurrentActor,
    projectId: string,
    requestedModel: string,
    effort: string,
    transaction?: Prisma.TransactionClient,
  ) {
    const resolve = async (tx: Prisma.TransactionClient) => {
      await this.scopedInvoke(tx, actor, projectId);
      const record = await this.read(tx, actor.organizationId);
      const binding =
        record?.data.ownerId === actor.userId
          ? record.data.bindings.find(
              (b) =>
                b.projectId === projectId &&
                b.requestedModel === requestedModel &&
                b.configuredModel === requestedModel &&
                b.effort === effort,
            )
          : undefined;
      if (!binding) throw new ConflictException('MODEL_BINDING_UNSUPPORTED');
      const proof = this.publishedProof(record!.revision, binding);
      return {
        principalId: binding.id,
        bindingId: binding.id,
        bindingRevision: record!.revision,
        organizationId: actor.organizationId,
        projectId,
        actorId: actor.userId,
        visibility: 'PRIVATE' as const,
        workspaceId: record!.data.workspaceId,
        requestedModel,
        configuredModel: binding.configuredModel,
        observedModel: null,
        modelEvidenceLevel: 'CONFIG_VERIFIED' as const,
        effort,
        agentId: binding.agentId,
        channelId: binding.channelId,
        publishedDigest: proof.publishedDigest,
        evidenceDigest: proof.evidenceDigest,
        maxRunsPerDay: binding.maxRunsPerDay,
        accessToken: record!.data.accessToken,
      };
    };
    return transaction ? resolve(transaction) : this.db.$transaction(resolve);
  }
}
export type WorkspaceBindingSnapshot = Omit<
  Awaited<ReturnType<WorkspaceAgentService['resolveBinding']>>,
  'accessToken'
>;
