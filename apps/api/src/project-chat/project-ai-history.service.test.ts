import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ChatAiAnswer, Prisma } from '@prisma/client';
import { expect, it, vi } from 'vitest';
import {
  ProjectAiHistoryService,
  type HistoryCallbacks,
  type HistoryScope,
} from './project-ai-history.service';
import {
  type MemorySourceProof,
  ProjectAiMemoryService,
} from './project-ai-memory.service';
import { AI_PROJECT_POLICY_VERSION } from './ai-registry';
import { CurrentActor } from '../access-control/current-actor';
import { AuditService } from '../audit/audit.service';

function fixture() {
  const projectId = randomUUID(),
    conversationId = randomUUID(),
    actor = {
      userId: randomUUID(),
      organizationId: randomUUID(),
    } as CurrentActor;
  const rows = Array.from(
    { length: 14 },
    (_, i) =>
      ({
        id: randomUUID(),
        organizationId: actor.organizationId,
        projectId,
        ownerId: actor.userId,
        conversationId,
        status: 'COMPLETED',
        question: `turn ${i}`,
        answer: `Door ${i} is 2400 mm`,
        createdAt: new Date(i),
        completedAt: new Date(i),
        model: 'model',
      }) as ChatAiAnswer,
  );
  const scope: HistoryScope = {
    actor,
    projectId,
    conversationId,
    invokeGrantId: randomUUID(),
    policyVersion: AI_PROJECT_POLICY_VERSION,
    historyAnswerIds: rows.map((r) => r.id),
  };
  const current = {
    id: randomUUID(),
    organizationId: actor.organizationId,
    projectId,
    ownerId: actor.userId,
    conversationId,
    invokeGrantId: scope.invokeGrantId,
    status: 'RUNNING',
    question: 'current',
    model: 'model',
    leaseUntil: new Date(Date.now() + 60000),
    usage: { summaryJob: { token: randomUUID() } },
  } as unknown as ChatAiAnswer;
  let locked = false;
  const writes: unknown[] = [];
  const tx = {
    chatAiAnswer: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        rows.filter((r) => where.id.in.includes(r.id)),
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          rows.find((r) => r.id === where.id) ?? null,
      ),
    },
    chatAiMemoryRevision: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: object }) => {
        writes.push(data);
        return { id: randomUUID(), ...data };
      }),
    },
    chatAiMemory: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: object }) => ({
        id: randomUUID(),
        ...data,
      })),
    },
    chatAiMemoryDependency: { createMany: vi.fn(async () => ({ count: 1 })) },
  } as unknown as Prisma.TransactionClient;
  const proofs = vi.fn(
    async (_tx: unknown, _scope: unknown, refs: MemorySourceProof['ref'][]) =>
      refs.map((ref) => ({
        ref,
        ownerId: actor.userId,
        conversationId,
        permissions: [],
        sourceConfirmed: false,
        dependencies: [],
      })),
  );
  const memory = {
    proofs,
    storeDependencies: vi.fn(async () => {}),
    list: vi.fn(async () => ({ items: [], nextCursor: null })),
    context: vi.fn(async () => []),
    search: vi.fn(async () => []),
  } as unknown as ProjectAiMemoryService;
  const audit = { write: vi.fn(async () => {}) } as unknown as AuditService;
  const callbacks: HistoryCallbacks = {
    transaction: async (fn) => {
      locked = true;
      try {
        return await fn(tx, current);
      } finally {
        locked = false;
      }
    },
    resolve: async (_tx, ref) => ({
      ref,
      ownerId: actor.userId,
      conversationId,
      permissions: [],
      sourceConfirmed: false,
      dependencies: [],
    }),
    visible: async (_tx, row) => ({ status: row.status, answer: row.answer }),
    respond: vi.fn(async () => {
      expect(locked).toBe(false);
      return {
        text: 'Unverified: main door is 2400 mm',
        model: 'model',
        calls: [],
        requestId: 'fixture-only',
      };
    }),
    instructions: 'assistant',
    tools: ['task_list'],
    context: { role: 'developer', content: 'server scope' },
    jobToken: (current.usage as { summaryJob: { token: string } }).summaryJob
      .token,
  };
  return {
    service: new ProjectAiHistoryService(memory, audit),
    scope,
    current,
    callbacks,
    rows,
    tx,
    writes,
    proofs,
    memory,
  };
}
it('fails clearly before inference when confirmed Project memory cannot fit', async () => {
  const f = fixture();
  f.scope.historyAnswerIds = [];
  vi.mocked(f.memory.context).mockResolvedValue(
    Array.from({ length: 80 }, (_, i) => ({
      id: randomUUID(),
      revisionId: randomUUID(),
      version: 1,
      visibility: 'PRIVATE',
      kind: 'NOTE',
      category: 'DECISION',
      content: 'Confirmed rule ' + i,
      verification: 'USER_CONFIRMED',
      provenance: {
        kind: 'USER_INPUT',
        editorId: f.scope.actor.userId,
        createdAt: new Date(),
      },
      sources: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      canEdit: true,
    })),
  );
  await expect(
    f.service.assemble(
      f.scope,
      f.current,
      new AbortController().signal,
      f.callbacks,
    ),
  ).rejects.toMatchObject({ code: 'PROJECT_MEMORY_CONTEXT_LIMIT' });
  expect(f.callbacks.respond).not.toHaveBeenCalled();
});
it('freezes history candidates, keeps more than eight short turns and excludes later answers', async () => {
  const f = fixture();
  const later = { ...f.rows[0]!, id: randomUUID(), answer: 'LATER SECRET' };
  f.rows.push(later);
  const result = await f.service.assemble(
    f.scope,
    f.current,
    new AbortController().signal,
    f.callbacks,
  );
  expect(result.usedAnswerIds).toHaveLength(14);
  expect(result.usedAnswerIds).not.toContain(later.id);
  expect(JSON.stringify(result.inputItems)).not.toContain('LATER SECRET');
  expect(result.budget.status).toBe('UNVERIFIED');
  expect(f.callbacks.respond).not.toHaveBeenCalled();
});
it('summarizes only a budgeted private batch, preserves real lineage and releases the transaction for inference', async () => {
  const f = fixture();
  f.rows.forEach((row) => {
    row.answer = 'Long technical facts '.repeat(3000);
  });
  const result = await f.service.assemble(
    f.scope,
    f.current,
    new AbortController().signal,
    f.callbacks,
  );
  expect(f.callbacks.respond).toHaveBeenCalledTimes(1);
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]).toMatchObject({
    organizationId: f.scope.actor.organizationId,
    projectId: f.scope.projectId,
    verification: 'UNVERIFIED',
    category: 'SUMMARY',
    summaryStatus: 'READY',
    policyVersion: AI_PROJECT_POLICY_VERSION,
    model: 'model',
    budget: { status: 'UNVERIFIED' },
  });
  expect(result.summaryRevisionIds).toHaveLength(1);
  expect(result.budget.bytes).toBeLessThanOrEqual(256000);
});
it.each([
  'token',
  'lease',
  'project',
  'grant',
  'source',
  'incomplete',
  'model',
])('rejects stale summary worker %s without a revision write', async (kind) => {
  const f = fixture();
  f.rows.forEach((row) => {
    row.answer = 'Long technical facts '.repeat(3000);
  });
  f.callbacks.respond = vi.fn(async () => {
    if (kind === 'token')
      f.current.usage = { summaryJob: { token: randomUUID() } };
    if (kind === 'lease') f.current.leaseUntil = new Date(0);
    if (kind === 'project') f.current.projectId = randomUUID();
    if (kind === 'grant') f.current.invokeGrantId = randomUUID();
    if (kind === 'source')
      f.proofs.mockRejectedValue(new Error('SOURCE_REVOKED'));
    if (kind === 'incomplete') throw new Error('response.incomplete');
    return {
      model: kind === 'model' ? 'different' : 'model',
      text: 'summary',
      calls: [],
      requestId: null,
    };
  });
  await expect(
    f.service.assemble(
      f.scope,
      f.current,
      new AbortController().signal,
      f.callbacks,
    ),
  ).rejects.toThrow();
  expect(f.writes).toHaveLength(0);
});
it('retrieves an older permitted turn by its actual answer ID and refuses cross-conversation scope', async () => {
  const f = fixture();
  f.rows[0]!.answer = 'OLD-SENTINEL-2400';
  const result = await f.service.search(
    f.tx,
    f.scope,
    'OLD-SENTINEL-2400',
    5,
    f.callbacks.resolve,
    f.callbacks.visible,
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    answerId: f.rows[0]!.id,
    answer: 'OLD-SENTINEL-2400',
  });
  const other = { ...f.scope, conversationId: randomUUID() };
  await expect(
    f.service.assemble(
      other,
      f.current,
      new AbortController().signal,
      f.callbacks,
    ),
  ).rejects.toThrow('REQUEST_SCOPE_MISMATCH');
});
it.each([false, true])(
  'deduplicates a summary published during inference and refuses an inactive cached head (%s)',
  async (inactive) => {
    const f = fixture();
    f.rows.forEach((row) => {
      row.answer = 'Long technical facts '.repeat(3000);
    });
    const cached = {
      id: randomUUID(),
      version: 1,
      content: 'cached private summary',
      coveredAnswerIds: [f.rows[0]!.id],
      summaryStatus: 'READY',
      memory: { inactiveAt: inactive ? new Date() : null },
    };
    vi.mocked(f.tx.chatAiMemoryRevision.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cached as never);
    if (inactive)
      await expect(
        f.service.assemble(
          f.scope,
          f.current,
          new AbortController().signal,
          f.callbacks,
        ),
      ).rejects.toThrow('SUMMARY_INACTIVE');
    else {
      const result = await f.service.assemble(
        f.scope,
        f.current,
        new AbortController().signal,
        f.callbacks,
      );
      expect(result.summaryRevisionIds).toContain(cached.id);
      expect(f.proofs).toHaveBeenCalledWith(
        f.tx,
        f.scope,
        [{ kind: 'MEMORY_REVISION', id: cached.id, version: '1', locator: {} }],
        f.callbacks.resolve,
      );
    }
    expect(f.writes).toHaveLength(0);
    expect(f.callbacks.respond).toHaveBeenCalledTimes(1);
  },
);
it('excludes a revoked summary without sending it or changing shared state', async () => {
  const f = fixture();
  const revision = {
    id: randomUUID(),
    version: 1,
    coveredAnswerIds: [f.rows[0]!.id],
    content: 'REVOKED SUMMARY SECRET',
  };
  vi.mocked(f.tx.chatAiMemoryRevision.findMany).mockResolvedValue([
    revision as never,
  ]);
  f.proofs.mockRejectedValue(new NotFoundException());
  const result = await f.service.assemble(
    f.scope,
    f.current,
    new AbortController().signal,
    f.callbacks,
  );
  expect(result.summaryRevisionIds).toEqual([]);
  expect(JSON.stringify(result.inputItems)).not.toContain(revision.content);
  expect(f.writes).toEqual([]);
});
it('retains or reports original turns when large summary candidates cannot all fit', async () => {
  const f = fixture();
  const revisions = f.rows.map((row) => ({
    id: randomUUID(),
    version: 1,
    coveredAnswerIds: [row.id],
    content: '界'.repeat(8000),
  }));
  vi.mocked(f.tx.chatAiMemoryRevision.findMany).mockResolvedValue(
    revisions as never,
  );
  const result = await f.service.assemble(
    f.scope,
    f.current,
    new AbortController().signal,
    f.callbacks,
  );
  expect(result.summaryRevisionIds.length).toBeLessThan(revisions.length);
  const represented = new Set([
    ...result.usedAnswerIds,
    ...result.omittedAnswerIds,
    ...revisions
      .filter((r) => result.summaryRevisionIds.includes(r.id))
      .flatMap((r) => r.coveredAnswerIds),
  ]);
  expect(f.rows.every((r) => represented.has(r.id))).toBe(true);
});
