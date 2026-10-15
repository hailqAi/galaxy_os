import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  ProjectAiMemoryService,
  MemoryScope,
  type MemorySourceProof,
  memoryDigest,
} from './project-ai-memory.service';
import {
  memoryChangeSchema,
  memoryQuerySchema,
  memorySourceSchema,
  memoryWriteSchema,
} from './project-chat.dto';

const valid = {
  clientKey: randomUUID(),
  visibility: 'PRIVATE',
  content: 'Cửa chính cao 2,4 m; chưa xác minh.',
  category: 'TECHNICAL',
  verification: 'UNVERIFIED',
  sourceRefs: [],
};
describe('memory boundary and provenance', () => {
  it('preserves Unicode and units, rejects blank/NUL/oversized text and scope/approval overrides', () => {
    expect(memoryWriteSchema.parse(valid).content).toBe(valid.content);
    for (const change of [
      { content: ' ' },
      { content: '\0' },
      { content: 'x'.repeat(8001) },
      { visibility: 'PUBLIC' },
      { projectId: randomUUID() },
      { ownerId: randomUUID() },
      { verification: 'SOURCE_CONFIRMED' },
      { category: 'SUMMARY' },
      { publishFrom: { memoryId: randomUUID(), version: 1 } },
    ])
      expect(memoryWriteSchema.safeParse({ ...valid, ...change }).success).toBe(
        false,
      );
    expect(
      memoryChangeSchema.safeParse({ ...valid, expectedVersion: 1 }).success,
    ).toBe(false);
    expect(
      memoryQuerySchema.safeParse({ query: 'x'.repeat(201) }).success,
    ).toBe(false);
    expect(memoryQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
  it('validates source-kind locators and rejects client content/permissions/network targets', () => {
    const ref = { kind: 'TASK', id: randomUUID(), version: '1', locator: {} };
    expect(memorySourceSchema.safeParse(ref).success).toBe(true);
    for (const change of [
      { permissions: ['task.read'] },
      { content: 'forged' },
      { locator: { url: 'http://localhost' } },
      { version: 'x'.repeat(201) },
      { id: '../other' },
    ])
      expect(memorySourceSchema.safeParse({ ...ref, ...change }).success).toBe(
        false,
      );
    expect(
      memorySourceSchema.safeParse({
        ...ref,
        kind: 'FILE_INDEX',
        locator: { startLine: 4, endLine: 2 },
      }).success,
    ).toBe(false);
  });
  it('hashes nested locators consistently and distinguishes content/version/scope changes', () => {
    expect(memoryDigest(new Date('2026-10-09T00:00:00Z'))).not.toBe(
      memoryDigest(new Date('2026-10-09T01:00:00Z')),
    );
    expect(memoryDigest({ a: 1, b: { page: 2, line: 3 } })).toBe(
      memoryDigest({ b: { line: 3, page: 2 }, a: 1 }),
    );
    expect(memoryDigest({ ...valid, content: '2.5 m' })).not.toBe(
      memoryDigest(valid),
    );
    expect(memoryDigest({ expectedVersion: 1 })).not.toBe(
      memoryDigest({ expectedVersion: 2 }),
    );
    expect(memoryDigest({ projectId: randomUUID() })).not.toBe(
      memoryDigest({ projectId: randomUUID() }),
    );
  });
  it('reuses a complete source graph only in the same transaction and authority scope', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never);
    const scope = {
      actor: {
        userId: randomUUID(),
        organizationId: randomUUID(),
        sessionId: randomUUID(),
      },
      projectId: randomUUID(),
      conversationId: randomUUID(),
      invokeGrantId: randomUUID(),
      policyVersion: 'fixture-policy',
    } as unknown as MemoryScope;
    const tx = {} as Prisma.TransactionClient;
    const cache = new WeakMap<
      Prisma.TransactionClient,
      Map<string, MemorySourceProof>
    >();
    const leaf = memorySourceSchema.parse({
      kind: 'TASK',
      id: randomUUID(),
      version: '1',
      locator: {},
    });
    const root = memorySourceSchema.parse({
      kind: 'AI_ANSWER',
      id: randomUUID(),
      version: '1',
      locator: {},
    });
    const resolve = vi.fn(
      async (
        _tx: Prisma.TransactionClient,
        ref: typeof leaf,
      ): Promise<MemorySourceProof> => ({
        ref,
        ownerId: null,
        conversationId: null,
        permissions: [],
        sourceConfirmed: false,
        cacheable: ref.kind === 'AI_ANSWER' ? true : undefined,
        dependencies: ref.id === root.id ? [leaf] : [],
      }),
    );
    const first = await service.proofs(tx, scope, [root], resolve, cache);
    expect(await service.proofs(tx, scope, [root], resolve, cache)).toEqual(
      first,
    );
    expect(
      (await service.proofs(tx, scope, [leaf], resolve, cache)).map(
        (p) => p.ref,
      ),
    ).toEqual([leaf]);
    expect(
      resolve.mock.calls.filter(([, ref]) => ref.id === root.id),
    ).toHaveLength(1);
    expect(resolve).toHaveBeenCalledTimes(4);
    for (const changed of [
      { ...scope, projectId: randomUUID() },
      { ...scope, conversationId: randomUUID() },
      { ...scope, invokeGrantId: randomUUID() },
      { ...scope, actor: { ...scope.actor, userId: randomUUID() } },
      { ...scope, actor: { ...scope.actor, organizationId: randomUUID() } },
      { ...scope, actor: { ...scope.actor, sessionId: randomUUID() } },
    ]) {
      resolve.mockClear();
      await service.proofs(tx, changed, [root], resolve, cache);
      expect(resolve).toHaveBeenCalledTimes(2);
    }
    resolve.mockClear();
    await service.proofs(
      {} as Prisma.TransactionClient,
      scope,
      [root],
      resolve,
      cache,
    );
    expect(resolve).toHaveBeenCalledTimes(2);
    resolve.mockClear();
    await service.proofs(
      tx,
      scope,
      [{ ...root, version: '2' }],
      resolve,
      cache,
    );
    expect(resolve).toHaveBeenCalledTimes(2);
  });
  it('rechecks current permissions when reusing a source proof', async () => {
    const scope = {
      actor: {
        userId: randomUUID(),
        permissions: ['project.read'],
        administrationScope: 'SYSTEM',
      },
    } as MemoryScope;
    const access = { freshActor: vi.fn().mockResolvedValue(scope.actor) };
    const service = new ProjectAiMemoryService(access as never, null as never);
    const project = {
      findFirst: vi.fn().mockResolvedValue({ id: randomUUID() }),
    };
    const tx = { project } as unknown as Prisma.TransactionClient;
    const cache = new WeakMap<
      Prisma.TransactionClient,
      Map<string, MemorySourceProof>
    >();
    const ref = memorySourceSchema.parse({
      kind: 'AI_ANSWER',
      id: randomUUID(),
      version: '1',
      locator: {},
    });
    const resolve = vi.fn(
      async (): Promise<MemorySourceProof> => ({
        ref,
        ownerId: null,
        conversationId: null,
        permissions: ['project.read'],
        sourceConfirmed: false,
        cacheable: true,
        dependencies: [],
      }),
    );
    await service.proofs(tx, scope, [ref], resolve, cache);
    project.findFirst.mockResolvedValue(null);
    await expect(
      service.proofs(tx, scope, [ref], resolve, cache),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(access.freshActor).toHaveBeenCalledTimes(2);
  });
  it.each([null, 'project.read', 'task.read'])(
    'checks all graph permissions together after fresh source reads (revoke=%s)',
    async (revoke) => {
      const scope = {
        actor: {
          userId: randomUUID(),
          permissions: ['project.read', 'task.read'],
          administrationScope: 'SYSTEM',
        },
      } as MemoryScope;
      let revoked: string | null = null;
      const access = {
        freshActor: vi.fn(async () => ({
          ...scope.actor,
          permissions: scope.actor.permissions.filter((p) => p !== revoked),
        })),
      };
      const project = {
        findFirst: vi.fn(
          async (query: { where: { AND: { id?: { in?: string[] } }[] } }) =>
            query.where.AND.some((clause) => clause.id?.in?.length === 0)
              ? null
              : { id: randomUUID() },
        ),
      };
      const tx = { project } as unknown as Prisma.TransactionClient;
      const service = new ProjectAiMemoryService(
        access as never,
        null as never,
      );
      const root = memorySourceSchema.parse({
        kind: 'AI_ANSWER',
        id: randomUUID(),
        version: '1',
        locator: {},
      });
      const leaf = memorySourceSchema.parse({
        kind: 'TASK',
        id: randomUUID(),
        version: '1',
        locator: {},
      });
      const resolve = vi.fn(
        async (
          _tx: Prisma.TransactionClient,
          ref: typeof leaf,
        ): Promise<MemorySourceProof> => {
          if (ref.kind === 'TASK') revoked = revoke;
          return {
            ref,
            ownerId: null,
            conversationId: null,
            sourceConfirmed: false,
            permissions: ref.kind === 'TASK' ? ['task.read'] : ['project.read'],
            dependencies: ref.kind === 'AI_ANSWER' ? [leaf] : [],
          };
        },
      );
      const result = service.proofs(tx, scope, [root], resolve);
      if (revoke)
        await expect(result).rejects.toBeInstanceOf(NotFoundException);
      else expect(await result).toHaveLength(2);
      expect(resolve).toHaveBeenCalledTimes(2);
      expect(access.freshActor).toHaveBeenCalledTimes(1);
      expect(project.findFirst).toHaveBeenCalledTimes(1);
    },
  );
  it('revalidates mutable leaves even when their owning answer graph is reused', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never);
    const scope = { actor: { userId: randomUUID() } } as MemoryScope;
    const tx = {} as Prisma.TransactionClient;
    const cache = new WeakMap<
      Prisma.TransactionClient,
      Map<string, MemorySourceProof>
    >();
    const leaf = memorySourceSchema.parse({
      kind: 'TASK',
      id: randomUUID(),
      version: '1',
      locator: {},
    });
    const root = memorySourceSchema.parse({
      kind: 'AI_ANSWER',
      id: randomUUID(),
      version: '1',
      locator: {},
    });
    let version = '1';
    const resolve = vi.fn(
      async (
        _tx: Prisma.TransactionClient,
        ref: typeof leaf,
      ): Promise<MemorySourceProof> => {
        if (ref.kind === 'TASK' && ref.version !== version)
          throw new ConflictException('MEMORY_SOURCE_CHANGED');
        return {
          ref,
          ownerId: null,
          conversationId: null,
          permissions: [],
          sourceConfirmed: false,
          cacheable: ref.kind === 'AI_ANSWER' ? true : undefined,
          dependencies: ref.id === root.id ? [leaf] : [],
        };
      },
    );
    await service.proofs(tx, scope, [root], resolve, cache);
    version = '2';
    await expect(
      service.proofs(tx, scope, [root], resolve, cache),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      resolve.mock.calls.filter(([, ref]) => ref.id === root.id),
    ).toHaveLength(1);
    expect(
      resolve.mock.calls.filter(([, ref]) => ref.id === leaf.id),
    ).toHaveLength(2);
  });
  it('fails closed on cyclic and excessive dependency graphs', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never),
      scope = { actor: { userId: randomUUID() } } as MemoryScope;
    const root = memorySourceSchema.parse({
      kind: 'TASK',
      id: randomUUID(),
      version: '1',
      locator: {},
    });
    await expect(
      service.proofs(null as never, scope, [root], async (_tx, ref) => ({
        ref,
        ownerId: null,
        conversationId: null,
        permissions: [],
        sourceConfirmed: false,
        dependencies: [ref],
      })),
    ).rejects.toBeInstanceOf(NotFoundException);
    const leaves = Array.from({ length: 129 }, () => ({
      ...root,
      id: randomUUID(),
    }));
    await expect(
      service.proofs(null as never, scope, [root], async (_tx, ref) => ({
        ref,
        ownerId: null,
        conversationId: null,
        permissions: [],
        sourceConfirmed: false,
        dependencies: ref.id === root.id ? leaves : [],
      })),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('permits obsolete source-free notes only during refresh and keeps source-backed revision guards', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never);
    const scope = {
      actor: { userId: randomUUID(), organizationId: randomUUID() },
      projectId: randomUUID(),
    } as MemoryScope;
    const ref = memorySourceSchema.parse({
      kind: 'MEMORY_REVISION',
      id: randomUUID(),
      version: '1',
      locator: {},
    });
    const dependencies = vi.fn().mockResolvedValue([]);
    const tx = {
      chatAiMemoryRevision: {
        findFirst: vi.fn().mockResolvedValue({
          id: ref.id,
          memoryId: randomUUID(),
          version: 1,
        }),
      },
      chatAiMemory: {
        findFirst: vi.fn().mockResolvedValue({
          kind: 'NOTE',
          visibility: 'PRIVATE',
          ownerId: scope.actor.userId,
          currentVersion: 2,
          inactiveAt: null,
        }),
      },
      chatAiMemoryDependency: { findMany: dependencies },
    } as unknown as Prisma.TransactionClient;
    const resolve = vi.fn();
    await expect(service.proofs(tx, scope, [ref], resolve)).rejects.toThrow(
      'MEMORY_SOURCE_CHANGED',
    );
    expect(
      await service.proofs(tx, scope, [ref], resolve, undefined, {
        allowHistoricalSourceFreeNotes: true,
      }),
    ).toHaveLength(1);
    dependencies.mockResolvedValue([
      {
        sourceKind: 'TASK',
        sourceId: randomUUID(),
        sourceVersion: '1',
        locator: {},
      },
    ]);
    await expect(
      service.proofs(tx, scope, [ref], resolve, undefined, {
        allowHistoricalSourceFreeNotes: true,
      }),
    ).rejects.toThrow('MEMORY_SOURCE_CHANGED');
  });
  it('checks more than 128 independent sources without treating their breadth as one lineage', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never),
      scope = { actor: { userId: randomUUID() } } as MemoryScope;
    const refs = Array.from({ length: 129 }, () =>
      memorySourceSchema.parse({
        kind: 'TASK',
        id: randomUUID(),
        version: '1',
        locator: {},
      }),
    );
    const resolve = async (_tx: unknown, ref: (typeof refs)[number]) => ({
      ref,
      ownerId: null,
      conversationId: null,
      permissions: [],
      sourceConfirmed: false,
      dependencies: [],
    });
    expect(
      await service.proofs(null as never, scope, refs, resolve),
    ).toHaveLength(129);
    const root = { ...refs[0]!, id: randomUUID() };
    await expect(
      service.proofs(
        null as never,
        scope,
        [...refs, root],
        async (tx, ref) => ({
          ...(await resolve(tx, ref)),
          dependencies: ref.id === root.id ? refs : [],
        }),
      ),
    ).rejects.toThrow('MEMORY_SOURCE_LIMIT');
  });
  it('checks shared ancestry once per proof call without losing the separate root limits', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never),
      scope = { actor: { userId: randomUUID() } } as MemoryScope;
    const refs = Array.from({ length: 129 }, () =>
      memorySourceSchema.parse({
        kind: 'TASK',
        id: randomUUID(),
        version: '1',
        locator: {},
      }),
    );
    const leaf = { ...refs[0]!, id: randomUUID() };
    const resolve = vi.fn(async (_tx: unknown, ref: (typeof refs)[number]) => ({
      ref,
      ownerId: null,
      conversationId: null,
      permissions: [],
      sourceConfirmed: false,
      dependencies: ref.id === leaf.id ? [] : [leaf],
    }));
    expect(
      await service.proofs(null as never, scope, refs, resolve),
    ).toHaveLength(130);
    expect(resolve).toHaveBeenCalledTimes(130);
  });
  it('rejects a deep path even when its final source was already checked on a short path', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never),
      scope = { actor: { userId: randomUUID() } } as MemoryScope;
    const root = memorySourceSchema.parse({
      kind: 'TASK',
      id: randomUUID(),
      version: '1',
      locator: {},
    });
    const shared = { ...root, id: randomUUID() },
      chain = Array.from({ length: 15 }, () => ({ ...root, id: randomUUID() }));
    await expect(
      service.proofs(null as never, scope, [root], async (_tx, ref) => {
        const index = chain.findIndex((item) => item.id === ref.id);
        return {
          ref,
          ownerId: null,
          conversationId: null,
          permissions: [],
          sourceConfirmed: false,
          dependencies:
            ref.id === root.id
              ? [shared, chain[0]!]
              : index < 0
                ? []
                : [chain[index + 1] ?? shared],
        };
      }),
    ).rejects.toThrow('MEMORY_SOURCE_LIMIT');
  });
  it.each(['raw', 'persisted', 'missing ancestor'] as const)(
    'checks private summary authority for %s flattened roots',
    async (kind) => {
      const scope = {
        actor: {
          userId: randomUUID(),
          organizationId: randomUUID(),
        } as MemoryScope['actor'],
        projectId: randomUUID(),
        conversationId: randomUUID(),
        invokeGrantId: randomUUID(),
        policyVersion: 'project-ai-p1-v1',
      } satisfies MemoryScope;
      const other = randomUUID(),
        summary = memorySourceSchema.parse({
          kind: 'MEMORY_REVISION',
          id: randomUUID(),
          version: '1',
          locator: {},
        }),
        answer = memorySourceSchema.parse({
          kind: 'AI_ANSWER',
          id: randomUUID(),
          version: '1',
          locator: {},
        });
      const tx = {
        chatAiMemoryRevision: {
          findFirst: vi.fn().mockResolvedValue({
            memoryId: randomUUID(),
            version: 1,
            summaryStatus: 'READY',
            policyVersion: scope.policyVersion,
          }),
        },
        chatAiMemory: {
          findFirst: vi.fn(
            async ({
              where,
            }: {
              where: { OR: { conversationId?: string }[] };
            }) =>
              where.OR.some((clause) => clause.conversationId === other)
                ? {
                    kind: 'CONVERSATION_SUMMARY',
                    visibility: 'PRIVATE',
                    ownerId: scope.actor.userId,
                    conversationId: other,
                    currentVersion: 1,
                    inactiveAt: null,
                  }
                : null,
          ),
        },
        chatAiMemoryDependency: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as Prisma.TransactionClient;
      const service = new ProjectAiMemoryService(null as never, null as never);
      const proof = service.proofs(
        tx,
        scope,
        kind === 'missing ancestor' ? [summary] : [answer, summary],
        async (_tx, ref) => ({
          ref,
          ownerId: scope.actor.userId,
          conversationId: other,
          permissions: [],
          sourceConfirmed: false,
          dependencies: [summary],
        }),
        undefined,
        kind === 'raw'
          ? undefined
          : { persistedExpandedRoots: [answer, summary] },
      );
      if (kind === 'persisted') await expect(proof).resolves.toHaveLength(2);
      else await expect(proof).rejects.toBeInstanceOf(NotFoundException);
    },
  );
  it('reuses already validated native answer ancestry for consecutive history without a depth ceiling on turns', async () => {
    const service = new ProjectAiMemoryService(null as never, null as never),
      scope = { actor: { userId: randomUUID() } } as MemoryScope;
    const refs = Array.from({ length: 24 }, () =>
      memorySourceSchema.parse({
        kind: 'AI_ANSWER',
        id: randomUUID(),
        version: '1',
        locator: {},
      }),
    );
    const resolve = vi.fn(async (_tx: unknown, ref: (typeof refs)[number]) => ({
      ref,
      ownerId: null,
      conversationId: null,
      permissions: [],
      sourceConfirmed: false,
      cacheable: true as const,
      dependencies: refs.slice(
        0,
        refs.findIndex((item) => item.id === ref.id),
      ),
    }));
    expect(
      await service.proofs(null as never, scope, refs, resolve),
    ).toHaveLength(24);
    expect(resolve).toHaveBeenCalledTimes(24);
  });
});
