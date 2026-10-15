import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatAiMemory,
  ChatAiMemoryDependency,
  ChatAiMemoryRevision,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CurrentActor } from '../access-control/current-actor';
import { projectWhereForPermissions } from '../access-control/business-entity.policy';
import { ProjectChatPolicy } from '../access-control/project-chat.policy';
import { AuditService } from '../audit/audit.service';
import { AI_PROJECT_POLICY_VERSION } from './ai-registry';
import { sourceTokens } from './ai-source';
import {
  MemoryChangeInput,
  MemoryInactiveInput,
  MemoryQuery,
  MemorySourceRef,
  MemoryWriteInput,
  memorySourceSchema,
} from './project-chat.dto';

export type MemoryScope = Readonly<{
  actor: CurrentActor;
  projectId: string;
  invokeGrantId: string;
  policyVersion: typeof AI_PROJECT_POLICY_VERSION;
  conversationId?: string;
}>;
export type MemorySourceProof = {
  ref: MemorySourceRef;
  ownerId: string | null;
  conversationId: string | null;
  permissions: string[];
  sourceConfirmed: boolean;
  cacheable?: true;
  dependencies: MemorySourceRef[];
};
export type MemoryProofCache = WeakMap<
  Prisma.TransactionClient,
  Map<string, MemorySourceProof>
>;
export type ResolveMemorySource = (
  tx: Prisma.TransactionClient,
  ref: MemorySourceRef,
) => Promise<MemorySourceProof>;
export type MemoryView = {
  id: string;
  revisionId: string;
  version: number;
  visibility: string;
  kind: string;
  content: string;
  category: string;
  verification: string;
  provenance: {
    kind: 'USER_INPUT' | 'SOURCED';
    editorId: string;
    createdAt: Date;
  };
  sources: MemorySourceRef[];
  createdAt: Date;
  updatedAt: Date;
  canEdit: boolean;
};
type UnavailableMemory = Pick<
  MemoryView,
  | 'id'
  | 'revisionId'
  | 'version'
  | 'visibility'
  | 'kind'
  | 'createdAt'
  | 'updatedAt'
  | 'canEdit'
> & {
  content: null;
  category: null;
  verification: null;
  provenance: null;
  sources: [];
  sourceStatus: 'SOURCE_UNAVAILABLE';
};
export type MemoryPage<T = MemoryView> = {
  items: T[];
  nextCursor: string | null;
};

// Hash canonical JSON, including nested locator keys, rather than client serialization order.
export const memoryDigest = (value: unknown): string => {
  const canonical = (v: unknown): unknown =>
    v instanceof Date
      ? v.toISOString()
      : Array.isArray(v)
        ? v.map(canonical)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v)
                .filter(([, x]) => x !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, x]) => [k, canonical(x)]),
            )
          : v;
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
};
const sourceKey = (ref: MemorySourceRef) =>
  memoryDigest([ref.kind, ref.id, ref.locator]);
const answerFirst = (refs: MemorySourceRef[]) =>
  [...refs].sort(
    (a, b) => Number(b.kind === 'AI_ANSWER') - Number(a.kind === 'AI_ANSWER'),
  );
export const memoryDependencyRef = (
  row: ChatAiMemoryDependency,
): MemorySourceRef => {
  const parsed = memorySourceSchema.safeParse({
    kind: row.sourceKind,
    id: row.sourceId,
    version: row.sourceVersion,
    locator: row.locator,
  });
  if (!parsed.success) throw new NotFoundException();
  return parsed.data;
};
const unavailable = (error: unknown) =>
  error instanceof NotFoundException ||
  error instanceof ForbiddenException ||
  error instanceof ConflictException;
const cursorSchema = z
  .object({
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    id: z.string().uuid(),
    version: z.number().int().positive(),
    updatedAt: z.string().datetime(),
  })
  .strict();

@Injectable()
export class ProjectAiMemoryService {
  constructor(
    @Inject(ProjectChatPolicy) private readonly access: ProjectChatPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private where(scope: MemoryScope): Prisma.ChatAiMemoryWhereInput {
    return {
      organizationId: scope.actor.organizationId,
      projectId: scope.projectId,
      kind: 'NOTE',
      OR: [
        { visibility: 'PRIVATE', ownerId: scope.actor.userId },
        { visibility: 'SHARED' },
      ],
    };
  }
  private async permission(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    permissions: string[],
  ) {
    const fresh = await this.access.freshActor(tx, scope.actor, permissions);
    if (
      !(await tx.project.findFirst({
        where: {
          AND: [
            { id: scope.projectId },
            projectWhereForPermissions(fresh, permissions),
          ],
        },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
  }
  private async sharedRead(tx: Prisma.TransactionClient, scope: MemoryScope) {
    await this.permission(tx, scope, ['project.read']);
  }
  private async publish(tx: Prisma.TransactionClient, scope: MemoryScope) {
    try {
      await this.permission(tx, scope, ['project.read', 'chat.publish']);
      await this.access.authority(tx, scope.actor, scope.projectId, 'PUBLISH');
    } catch (error) {
      if (unavailable(error))
        throw new ForbiddenException('MEMORY_PUBLISH_FORBIDDEN');
      throw error;
    }
  }
  async canPublish(tx: Prisma.TransactionClient, scope: MemoryScope) {
    try {
      await this.publish(tx, scope);
      return true;
    } catch (error) {
      if (!unavailable(error)) throw error;
      return false;
    }
  }
  private async head(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    id: string,
    inactive = false,
  ) {
    const head = await tx.chatAiMemory.findFirst({
      where: {
        ...this.where(scope),
        id,
        ...(!inactive && { inactiveAt: null }),
      },
    });
    if (!head) throw new NotFoundException();
    if (head.visibility === 'SHARED') await this.sharedRead(tx, scope);
    return head;
  }
  private async editable(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    head: ChatAiMemory,
  ) {
    if (head.visibility === 'SHARED') await this.publish(tx, scope);
    else if (head.ownerId !== scope.actor.userId) throw new NotFoundException();
  }

  async proofs(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    refs: MemorySourceRef[],
    resolve: ResolveMemorySource,
    cache?: MemoryProofCache,
    options?: {
      allowHistoricalSourceFreeNotes?: boolean;
      persistedExpandedRoots?: MemorySourceRef[];
    },
  ): Promise<MemorySourceProof[]> {
    const active = new Set<string>(),
      done = new Map<string, MemorySourceProof>(),
      allProofs = new Map<string, MemorySourceProof>(),
      lineage = new Map<string, number>();
    const persistedRoots = new Set(
      options?.persistedExpandedRoots?.map(memoryDigest),
    );
    let verified = cache?.get(tx);
    if (cache && !verified) {
      verified = new Map();
      cache.set(tx, verified);
    }
    const scopeKey = memoryDigest(scope);
    const requiredPermissions = new Set<string>();
    let nodes = 0;
    const visit = async (
      ref: MemorySourceRef,
      conversationId = scope.conversationId,
      persistedRoot = false,
    ): Promise<void> => {
      const key = memoryDigest(ref);
      const cacheKey = memoryDigest([scopeKey, ref, conversationId]);
      if (active.has(key)) throw new NotFoundException('MEMORY_SOURCE_CYCLE');
      // Persisted flattened summary refs still require their owning answer above.
      if (
        persistedRoot &&
        ref.kind === 'MEMORY_REVISION' &&
        allProofs.get(key)?.conversationId
      )
        return;
      // Native history already validated in this call is an immutable ancestry boundary.
      if (ref.kind === 'AI_ANSWER' && done.get(cacheKey)?.cacheable) return;
      if (active.size >= 16) throw new ConflictException('MEMORY_SOURCE_LIMIT');
      const priorDepth = lineage.get(cacheKey);
      if (priorDepth !== undefined && priorDepth >= active.size) return;
      if (priorDepth === undefined && ++nodes > 128)
        throw new ConflictException('MEMORY_SOURCE_LIMIT');
      lineage.set(cacheKey, active.size);
      active.add(key);
      const cached = verified?.get(cacheKey);
      let proof: MemorySourceProof;
      if (done.has(cacheKey)) proof = done.get(cacheKey)!;
      else if (cached) proof = cached;
      else if (ref.kind === 'MEMORY_REVISION') {
        const revision = await tx.chatAiMemoryRevision.findFirst({
          where: {
            id: ref.id,
            organizationId: scope.actor.organizationId,
            projectId: scope.projectId,
          },
        });
        if (!revision) throw new NotFoundException();
        const head = await tx.chatAiMemory.findFirst({
          where: {
            id: revision.memoryId,
            organizationId: scope.actor.organizationId,
            projectId: scope.projectId,
            ...(!options?.allowHistoricalSourceFreeNotes && {
              inactiveAt: null,
            }),
            OR: [
              {
                kind: 'NOTE',
                OR: [
                  { visibility: 'PRIVATE', ownerId: scope.actor.userId },
                  { visibility: 'SHARED' },
                ],
              },
              ...(conversationId
                ? [
                    {
                      kind: 'CONVERSATION_SUMMARY',
                      visibility: 'PRIVATE',
                      ownerId: scope.actor.userId,
                      conversationId,
                    },
                  ]
                : []),
            ],
          },
        });
        if (
          !head ||
          (head.kind === 'CONVERSATION_SUMMARY' &&
            (revision.summaryStatus !== 'READY' ||
              revision.policyVersion !== scope.policyVersion))
        )
          throw new NotFoundException();
        const dependencies = await tx.chatAiMemoryDependency.findMany({
          where: {
            revisionId: revision.id,
            organizationId: scope.actor.organizationId,
            projectId: scope.projectId,
          },
        });
        const historicalUserInput =
          options?.allowHistoricalSourceFreeNotes &&
          head.kind === 'NOTE' &&
          dependencies.length === 0;
        if (head.inactiveAt && !historicalUserInput)
          throw new NotFoundException();
        if (
          String(revision.version) !== ref.version ||
          (head.currentVersion !== revision.version && !historicalUserInput)
        )
          throw new ConflictException('MEMORY_SOURCE_CHANGED');
        proof = {
          ref,
          ownerId: head.visibility === 'PRIVATE' ? head.ownerId : null,
          conversationId:
            head.kind === 'CONVERSATION_SUMMARY' ? head.conversationId : null,
          permissions: head.visibility === 'SHARED' ? ['project.read'] : [],
          sourceConfirmed: false,
          dependencies: dependencies.map(memoryDependencyRef),
        };
      } else proof = await resolve(tx, ref);
      if (memoryDigest(proof.ref) !== memoryDigest(ref))
        throw new NotFoundException();
      if (proof.ownerId && proof.ownerId !== scope.actor.userId)
        throw new NotFoundException();
      for (const permission of proof.permissions)
        requiredPermissions.add(permission);
      // Validate the owning answer before admitting its original private summary lineage.
      for (const child of answerFirst(proof.dependencies))
        await visit(
          child,
          ref.kind === 'AI_ANSWER'
            ? (proof.conversationId ?? undefined)
            : conversationId,
          ref.kind === 'MEMORY_REVISION',
        );
      active.delete(key);
      done.set(cacheKey, proof);
      allProofs.set(key, proof);
      // Reuse immutable native answer ancestry only; mutable leaves remain live reads.
      if (ref.kind === 'AI_ANSWER' && proof.cacheable)
        verified?.set(cacheKey, proof);
    };
    for (const ref of answerFirst(refs)) {
      // Bound each source lineage, rather than the number of independent sources.
      nodes = 0;
      lineage.clear();
      await visit(
        ref,
        scope.conversationId,
        persistedRoots.has(memoryDigest(ref)),
      );
    }
    if (requiredPermissions.size)
      await this.permission(tx, scope, [...requiredPermissions]);
    return [...allProofs.values()];
  }

  private async present(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    head: ChatAiMemory,
    revision: ChatAiMemoryRevision,
    resolve: ResolveMemorySource,
  ): Promise<MemoryView> {
    const rows = await tx.chatAiMemoryDependency.findMany({
      where: {
        revisionId: revision.id,
        organizationId: scope.actor.organizationId,
        projectId: scope.projectId,
      },
    });
    const proofs = await this.proofs(
      tx,
      scope,
      rows.map(memoryDependencyRef),
      resolve,
      undefined,
      { persistedExpandedRoots: rows.map(memoryDependencyRef) },
    );
    const permissions = [...new Set(proofs.flatMap((p) => p.permissions))];
    if (permissions.length) await this.permission(tx, scope, permissions);
    let canEdit = true;
    try {
      await this.editable(tx, scope, head);
    } catch (error) {
      if (!unavailable(error)) throw error;
      canEdit = false;
    }
    if (head.visibility === 'SHARED') await this.sharedRead(tx, scope);
    return {
      id: head.id,
      revisionId: revision.id,
      version: revision.version,
      visibility: head.visibility,
      kind: head.kind,
      content: revision.content,
      category: revision.category,
      verification: revision.verification,
      provenance: {
        kind: rows.length ? 'SOURCED' : 'USER_INPUT',
        editorId: revision.editorId,
        createdAt: revision.createdAt,
      },
      sources: rows.map(memoryDependencyRef),
      createdAt: head.createdAt,
      updatedAt: head.updatedAt,
      canEdit,
    };
  }
  async read(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    id: string,
    version: number | undefined,
    resolve: ResolveMemorySource,
  ): Promise<MemoryView> {
    const head = await this.head(tx, scope, id);
    const revision = await tx.chatAiMemoryRevision.findUnique({
      where: {
        memoryId_version: {
          memoryId: head.id,
          version: version ?? head.currentVersion,
        },
      },
    });
    if (!revision) throw new NotFoundException();
    return this.present(tx, scope, head, revision, resolve);
  }
  private async inherited(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    memoryId: string,
    version: number,
  ) {
    const revision = await tx.chatAiMemoryRevision.findFirst({
      where: {
        memoryId,
        version,
        organizationId: scope.actor.organizationId,
        projectId: scope.projectId,
      },
    });
    if (!revision) throw new NotFoundException();
    return (
      await tx.chatAiMemoryDependency.findMany({
        where: {
          revisionId: revision.id,
          organizationId: scope.actor.organizationId,
          projectId: scope.projectId,
        },
      })
    ).map(memoryDependencyRef);
  }
  private merge(refs: MemorySourceRef[], inherited: MemorySourceRef[]) {
    const combined = new Map(inherited.map((r) => [sourceKey(r), r]));
    for (const ref of refs) combined.set(sourceKey(ref), ref);
    return [...combined.values()];
  }
  private async storeRevision(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    head: ChatAiMemory,
    input: MemoryWriteInput | MemoryChangeInput,
    version: number,
    hash: string,
    proofs: MemorySourceProof[],
  ) {
    const revision = await tx.chatAiMemoryRevision.create({
      data: {
        organizationId: scope.actor.organizationId,
        projectId: scope.projectId,
        memoryId: head.id,
        version,
        previousVersion: version > 1 ? version - 1 : null,
        content: input.content,
        category: input.category,
        verification: input.verification,
        editorId: scope.actor.userId,
        clientKey: input.clientKey,
        payloadHash: hash,
      },
    });
    await this.storeDependencies(tx, scope, revision.id, proofs);
    await this.audit.write(tx, scope.actor, {
      action: version === 1 ? 'ai.memory.create' : 'ai.memory.update',
      entityType: 'ChatAiMemory',
      entityId: head.id,
      metadata: {
        projectId: scope.projectId,
        version,
        payloadHash: hash,
        clientKey: input.clientKey,
        ...('publishFrom' in input && input.publishFrom
          ? { privateOrigin: input.publishFrom }
          : {}),
      },
    });
    return revision;
  }
  async storeDependencies(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    revisionId: string,
    proofs: MemorySourceProof[],
  ) {
    if (proofs.length)
      await tx.chatAiMemoryDependency.createMany({
        data: proofs.map(({ ref, ownerId, conversationId, permissions }) => ({
          revisionId,
          organizationId: scope.actor.organizationId,
          projectId: scope.projectId,
          sourceKind: ref.kind,
          sourceId: ref.id,
          sourceVersion: ref.version,
          locator: ref.locator,
          locatorHash: memoryDigest(ref.locator),
          sourceOwnerId: ownerId,
          sourceConversationId: conversationId,
          permissions,
          answerSourceId: ref.kind === 'AI_ANSWER' ? ref.id : null,
          messageSourceId: ref.kind === 'CHAT_MESSAGE' ? ref.id : null,
          indexSourceId: ref.kind === 'FILE_INDEX' ? ref.id : null,
          memorySourceRevisionId:
            ref.kind === 'MEMORY_REVISION' ? ref.id : null,
        })),
      });
  }
  async create(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    input: MemoryWriteInput,
    resolve: ResolveMemorySource,
  ): Promise<MemoryView> {
    if (input.visibility === 'SHARED') await this.publish(tx, scope);
    const hash = memoryDigest(input);
    const existing = await tx.chatAiMemory.findUnique({
      where: {
        organizationId_projectId_ownerId_clientKey: {
          organizationId: scope.actor.organizationId,
          projectId: scope.projectId,
          ownerId: scope.actor.userId,
          clientKey: input.clientKey,
        },
      },
    });
    if (existing) {
      if (existing.payloadHash !== hash)
        throw new ConflictException('MEMORY_IDEMPOTENCY_CONFLICT');
      return this.read(tx, scope, existing.id, 1, resolve);
    }
    let inherited: MemorySourceRef[] = [];
    if (input.publishFrom) {
      const origin = await this.head(tx, scope, input.publishFrom.memoryId);
      if (
        origin.visibility !== 'PRIVATE' ||
        origin.ownerId !== scope.actor.userId
      )
        throw new NotFoundException();
      if (origin.currentVersion !== input.publishFrom.version)
        throw new ConflictException('MEMORY_VERSION_CONFLICT');
      inherited = await this.inherited(
        tx,
        scope,
        origin.id,
        origin.currentVersion,
      );
    }
    const proofs = await this.proofs(
      tx,
      scope,
      this.merge(input.sourceRefs, inherited),
      resolve,
      undefined,
      { persistedExpandedRoots: inherited },
    );
    const head = await tx.chatAiMemory.create({
      data: {
        organizationId: scope.actor.organizationId,
        projectId: scope.projectId,
        ownerId: scope.actor.userId,
        visibility: input.visibility,
        kind: 'NOTE',
        clientKey: input.clientKey,
        payloadHash: hash,
      },
    });
    const revision = await this.storeRevision(
      tx,
      scope,
      head,
      input,
      1,
      hash,
      proofs,
    );
    const result = await this.present(tx, scope, head, revision, resolve);
    await this.editable(tx, scope, head);
    return result;
  }
  async update(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    id: string,
    input: MemoryChangeInput,
    resolve: ResolveMemorySource,
  ): Promise<MemoryView> {
    const head = await this.head(tx, scope, id);
    await this.editable(tx, scope, head);
    const hash = memoryDigest(input),
      replay = await tx.chatAiMemoryRevision.findUnique({
        where: {
          memoryId_clientKey: { memoryId: head.id, clientKey: input.clientKey },
        },
      });
    if (replay) {
      if (replay.payloadHash !== hash || replay.editorId !== scope.actor.userId)
        throw new ConflictException('MEMORY_IDEMPOTENCY_CONFLICT');
      return this.present(tx, scope, head, replay, resolve);
    }
    if (head.currentVersion !== input.expectedVersion)
      throw new ConflictException('MEMORY_VERSION_CONFLICT');
    const inherited = await this.inherited(
      tx,
      scope,
      head.id,
      head.currentVersion,
    );
    const proofs = await this.proofs(
      tx,
      scope,
      this.merge(input.sourceRefs, inherited),
      resolve,
      undefined,
      { persistedExpandedRoots: inherited },
    );
    const changed = await tx.chatAiMemory.updateMany({
      where: {
        id: head.id,
        organizationId: scope.actor.organizationId,
        projectId: scope.projectId,
        currentVersion: input.expectedVersion,
        inactiveAt: null,
      },
      data: { currentVersion: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new ConflictException('MEMORY_VERSION_CONFLICT');
    const revision = await this.storeRevision(
      tx,
      scope,
      head,
      input,
      head.currentVersion + 1,
      hash,
      proofs,
    );
    const result = await this.present(
      tx,
      scope,
      await this.head(tx, scope, head.id),
      revision,
      resolve,
    );
    await this.editable(tx, scope, head);
    return result;
  }
  async inactivate(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    id: string,
    input: MemoryInactiveInput,
  ): Promise<{ id: string; status: 'INACTIVE'; version: number }> {
    const head = await this.head(tx, scope, id, true);
    await this.editable(tx, scope, head);
    const hash = memoryDigest(input),
      replay = await tx.auditLog.findFirst({
        where: {
          organizationId: scope.actor.organizationId,
          actorUserId: scope.actor.userId,
          entityType: 'ChatAiMemory',
          entityId: head.id,
          action: 'ai.memory.inactive',
          metadata: { path: ['clientKey'], equals: input.clientKey },
        },
      });
    if (replay) {
      if (
        (replay.metadata as { payloadHash?: string } | null)?.payloadHash !==
        hash
      )
        throw new ConflictException('MEMORY_IDEMPOTENCY_CONFLICT');
      return { id: head.id, status: 'INACTIVE', version: head.currentVersion };
    }
    if (head.inactiveAt || head.currentVersion !== input.expectedVersion)
      throw new ConflictException('MEMORY_VERSION_CONFLICT');
    const changed = await tx.chatAiMemory.updateMany({
      where: {
        id: head.id,
        organizationId: scope.actor.organizationId,
        projectId: scope.projectId,
        currentVersion: input.expectedVersion,
        inactiveAt: null,
      },
      data: { inactiveAt: new Date() },
    });
    if (changed.count !== 1)
      throw new ConflictException('MEMORY_VERSION_CONFLICT');
    await this.audit.write(tx, scope.actor, {
      action: 'ai.memory.inactive',
      entityType: 'ChatAiMemory',
      entityId: head.id,
      metadata: {
        projectId: scope.projectId,
        version: head.currentVersion,
        clientKey: input.clientKey,
        payloadHash: hash,
      },
    });
    await this.editable(tx, scope, head);
    return { id: head.id, status: 'INACTIVE', version: head.currentVersion };
  }

  private cursorScope(
    scope: MemoryScope,
    query: MemoryQuery,
    memoryId?: string,
  ) {
    return memoryDigest([
      scope.actor.organizationId,
      scope.projectId,
      scope.actor.userId,
      query.visibility,
      query.query ?? '',
      memoryId ?? null,
    ]);
  }
  private parseCursor(
    scope: MemoryScope,
    query: MemoryQuery,
    memoryId?: string,
  ): { id: string; version: number; updatedAt: string } | undefined {
    if (!query.cursor) return;
    try {
      const parsed = cursorSchema.safeParse(
        JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
      );
      if (!parsed.success)
        throw new BadRequestException('MEMORY_CURSOR_INVALID');
      const raw = parsed.data;
      if (raw.scope !== this.cursorScope(scope, query, memoryId))
        throw new NotFoundException();
      return { id: raw.id, version: raw.version, updatedAt: raw.updatedAt };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      throw new BadRequestException('MEMORY_CURSOR_INVALID');
    }
  }
  private page<T extends MemoryView | UnavailableMemory>(
    scope: MemoryScope,
    query: MemoryQuery,
    visible: T[],
    memoryId?: string,
  ): MemoryPage<T> {
    const items = visible.slice(0, query.limit),
      last = items.at(-1);
    const nextCursor =
      visible.length > query.limit && last
        ? Buffer.from(
            JSON.stringify({
              scope: this.cursorScope(scope, query, memoryId),
              id: last.id,
              version: last.version,
              updatedAt: last.updatedAt.toISOString(),
            }),
          ).toString('base64url')
        : null;
    return { items, nextCursor };
  }
  async list(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    query: MemoryQuery,
    resolve: ResolveMemorySource,
  ): Promise<MemoryPage<MemoryView | UnavailableMemory>> {
    const cursor = this.parseCursor(scope, query);
    if (cursor) {
      const anchor = await this.listItem(
        tx,
        scope,
        cursor.id,
        query.query === undefined,
        resolve,
      );
      if (
        anchor.version !== cursor.version ||
        anchor.updatedAt.toISOString() !== cursor.updatedAt ||
        (query.visibility !== 'ALL' && anchor.visibility !== query.visibility)
      )
        throw new ConflictException('MEMORY_CURSOR_CHANGED');
    }
    const tokens = [...sourceTokens(query.query ?? '')];
    if (query.query !== undefined && tokens.length === 0)
      return { items: [], nextCursor: null };
    const visible: (MemoryView | UnavailableMemory)[] = [];
    let after: { updatedAt: Date; id: string } | undefined = cursor
        ? { updatedAt: new Date(cursor.updatedAt), id: cursor.id }
        : undefined,
      scanned = 0;
    for (;;) {
      const rows = await tx.chatAiMemory.findMany({
        where: {
          AND: [
            this.where(scope),
            { inactiveAt: null },
            ...(query.visibility === 'ALL'
              ? []
              : [{ visibility: query.visibility }]),
            ...(after
              ? [
                  {
                    OR: [
                      { updatedAt: { lt: after.updatedAt } },
                      { updatedAt: after.updatedAt, id: { lt: after.id } },
                    ],
                  },
                ]
              : []),
            ...(tokens.length
              ? [
                  {
                    revisions: {
                      some: {
                        AND: tokens.map((token) => ({
                          content: {
                            contains: token,
                            mode: 'insensitive' as const,
                          },
                        })),
                      },
                    },
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 50,
      });
      for (const head of rows) {
        if (++scanned > 500) throw new ConflictException('MEMORY_LOOKUP_LIMIT');
        after = { updatedAt: head.updatedAt, id: head.id };
        try {
          const item = await this.listItem(
            tx,
            scope,
            head.id,
            query.query === undefined,
            resolve,
          );
          const textTokens = sourceTokens(item.content ?? '');
          if (tokens.every((t) => textTokens.has(t))) visible.push(item);
          if (visible.length > query.limit)
            return this.page(scope, query, visible);
        } catch (error) {
          if (!unavailable(error)) throw error;
        }
      }
      if (rows.length < 50) return this.page(scope, query, visible);
    }
  }
  private async listItem(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    id: string,
    management: boolean,
    resolve: ResolveMemorySource,
  ): Promise<MemoryView | UnavailableMemory> {
    try {
      return await this.read(tx, scope, id, undefined, resolve);
    } catch (error) {
      if (!management || !unavailable(error)) throw error;
      // Source loss must not prevent an authorized owner from inactivating a note.
      const head = await this.head(tx, scope, id);
      await this.editable(tx, scope, head);
      const revision = await tx.chatAiMemoryRevision.findFirstOrThrow({
        where: { memoryId: head.id, version: head.currentVersion },
        select: { id: true },
      });
      return {
        id: head.id,
        revisionId: revision.id,
        version: head.currentVersion,
        visibility: head.visibility,
        kind: head.kind,
        createdAt: head.createdAt,
        updatedAt: head.updatedAt,
        canEdit: true,
        content: null,
        category: null,
        verification: null,
        provenance: null,
        sources: [],
        sourceStatus: 'SOURCE_UNAVAILABLE',
      };
    }
  }
  async revisions(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    id: string,
    query: MemoryQuery,
    resolve: ResolveMemorySource,
  ): Promise<MemoryPage> {
    const head = await this.head(tx, scope, id),
      cursor = this.parseCursor(scope, query, id);
    if (cursor) {
      if (cursor.id !== id || cursor.updatedAt !== head.updatedAt.toISOString())
        throw new ConflictException('MEMORY_CURSOR_CHANGED');
      await this.read(tx, scope, id, cursor.version, resolve);
    }
    const visible: MemoryView[] = [];
    let before = cursor?.version,
      scanned = 0;
    for (;;) {
      const rows = await tx.chatAiMemoryRevision.findMany({
        where: {
          memoryId: head.id,
          organizationId: scope.actor.organizationId,
          projectId: scope.projectId,
          ...(before && { version: { lt: before } }),
        },
        orderBy: { version: 'desc' },
        take: 50,
      });
      for (const revision of rows) {
        if (++scanned > 500) throw new ConflictException('MEMORY_LOOKUP_LIMIT');
        before = revision.version;
        try {
          visible.push(await this.present(tx, scope, head, revision, resolve));
        } catch (error) {
          if (!unavailable(error)) throw error;
        }
        if (visible.length > query.limit)
          return this.page(scope, query, visible, id);
      }
      if (rows.length < 50) return this.page(scope, query, visible, id);
    }
  }
  async context(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    question: string,
    resolve: ResolveMemorySource,
  ): Promise<MemoryView[]> {
    const selected = new Map<string, MemoryView>();
    let cursor: string | undefined;
    do {
      const page = await this.list(
        tx,
        scope,
        { visibility: 'ALL', limit: 50, ...(cursor && { cursor }) },
        resolve,
      );
      for (const note of page.items)
        if (note.content !== null && note.verification === 'USER_CONFIRMED')
          selected.set(note.id, note);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const query = question
      .trim()
      .slice(0, 200)
      .replace(/[\uD800-\uDBFF]$/, '');
    if (query)
      for (const note of await this.search(
        tx,
        scope,
        { query, visibility: 'ALL', limit: 10 },
        resolve,
      ))
        selected.set(note.id, note);
    return [...selected.values()];
  }

  async search(
    tx: Prisma.TransactionClient,
    scope: MemoryScope,
    input: {
      query: string;
      visibility: 'PRIVATE' | 'SHARED' | 'ALL';
      limit: number;
    },
    resolve: ResolveMemorySource,
  ) {
    if (
      !input.query.trim() ||
      input.query.length > 200 ||
      input.limit < 1 ||
      input.limit > 10 ||
      !Number.isInteger(input.limit)
    )
      throw new BadRequestException();
    return (await this.list(tx, scope, input, resolve)).items.filter(
      (n): n is MemoryView => n.content !== null,
    );
  }
}
