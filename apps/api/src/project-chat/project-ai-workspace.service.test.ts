import { ProjectsService } from '../projects/projects.service';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  ProjectAiWorkspaceService,
  workspaceResult,
  workspacePart,
  contextPage,
  assertJobActive,
} from './project-ai-workspace.service';
it('preserves long Markdown, code, tables and warnings without accepting fake artifacts or model self-report', () => {
  const answerMarkdown =
    '| Cột | Giá trị |\n|---|---|\n' +
    '```ts\nconst x = 1;\n```\n'.repeat(3000);
  expect(
    workspaceResult.parse({
      contractVersion: 1,
      answerMarkdown,
      sourceRefs: [],
      warnings: ['synthetic warning'],
      artifactRefs: [],
      memoryProposals: [],
    }).answerMarkdown,
  ).toBe(answerMarkdown);
  expect(
    workspaceResult.safeParse({
      contractVersion: 1,
      answerMarkdown,
      sourceRefs: [],
      warnings: [],
      artifactRefs: ['sandbox:/fake.png'],
      memoryProposals: [],
      observedModel: 'claimed',
    }).success,
  ).toBe(false);
  expect(
    workspacePart.safeParse({ sequence: 0, content: 'x'.repeat(12001) })
      .success,
  ).toBe(false);
});
it('returns lossless bounded context pages across Unicode boundaries', () => {
  const text = JSON.stringify({ question: '  Nguyên gốc 😀\n'.repeat(2000) });
  let offset = 0,
    full = '';
  while (offset < text.length) {
    const page = contextPage(text, offset);
    full += page.data;
    offset = page.nextOffset ?? text.length;
    expect(Buffer.byteLength(page.data)).toBeLessThanOrEqual(48000);
  }
  expect(full).toBe(text);
  expect(() => contextPage(text, -1)).toThrow();
});
it('rejects late result after cancel/expiry or another principal, even with a known job ID', () => {
  const principalId = randomUUID(),
    job = {
      id: randomUUID(),
      principalId,
      bindingRevision: randomUUID(),
      state: 'WAITING_RESULT',
      expiresAt: new Date(Date.now() + 60000),
    };
  expect(() =>
    assertJobActive(job, principalId, job.bindingRevision),
  ).not.toThrow();
  for (const state of ['CANCELLED', 'ACCESS_REVOKED', 'COMPLETED', 'TIMED_OUT'])
    expect(() =>
      assertJobActive({ ...job, state }, principalId, job.bindingRevision),
    ).toThrow();
  expect(() =>
    assertJobActive(job, randomUUID(), job.bindingRevision),
  ).toThrow();
  expect(() =>
    assertJobActive(
      { ...job, expiresAt: new Date(0) },
      principalId,
      job.bindingRevision,
    ),
  ).toThrow();
});

it('rejects malformed Unicode parts and offsets that split a code point', () => {
  for (const content of ['\uD800', '\uDC00', 'x\uD800y'])
    expect(workspacePart.safeParse({ sequence: 0, content }).success).toBe(
      false,
    );
  expect(workspacePart.parse({ sequence: 0, content: '😀' }).content).toBe(
    '😀',
  );
  expect(() => contextPage('a😀b', 2)).toThrow('INVALID_CONTEXT_OFFSET');
});

it('validates twelve Workspace ancestors once per traversal and still rejects revoked ancestry', async () => {
  const { ProjectAiService } = await import('./project-ai.service');
  const { ProjectAiMemoryService, memoryDigest } = await import(
    './project-ai-memory.service'
  );
  const actor = {
    userId: randomUUID(),
    organizationId: randomUUID(),
    permissionSources: [],
    permissions: [],
  };
  const projectId = randomUUID(),
    conversationId = randomUUID(),
    grantId = randomUUID();
  const answers: import('@prisma/client').ChatAiAnswer[] = [];
  for (let i = 0; i < 12; i++)
    answers.push({
      id: randomUUID(),
      ownerId: actor.userId,
      organizationId: actor.organizationId,
      projectId,
      conversationId,
      invokeGrantId: grantId,
      status: 'COMPLETED',
      question: 'q' + i,
      answer: 'a' + i,
      model: 'workspace-model',
      completedAt: new Date(),
      createdAt: new Date(),
      citations: [],
      usage: {
        workspace: {},
        workspaceSources: answers.map((a) => ({
          kind: 'AI_ANSWER',
          id: a.id,
          version: memoryDigest([
            a.id,
            a.question,
            a.answer,
            a.model,
            a.completedAt,
          ]),
          locator: {},
        })),
      },
    } as unknown as import('@prisma/client').ChatAiAnswer);
  let reads = 0,
    revoked = false;
  const tx = {
    chatAiAnswer: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        reads++;
        return answers.find((a) => a.id === where.id) ?? null;
      },
    },
    chatAiAnswerDependency: { findMany: async () => [] },
    chatAiAnswerMemoryDependency: { findMany: async () => [] },
    chatAiWorkspaceJob: {
      findFirst: async () => (revoked ? null : { id: randomUUID() }),
    },
  };
  const policy = { freshActor: async () => actor };
  const memory = new ProjectAiMemoryService(policy as never, {} as never);
  const service = new ProjectAiService(
    {} as never,
    {} as never,
    {} as never,
    policy as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    memory,
    {} as never,
    {} as never,
    {} as ProjectsService,
  );
  await service.workspaceCheck(
    tx as never,
    actor as never,
    projectId,
    answers.at(-1)!,
    grantId,
  );
  expect(reads).toBeLessThanOrEqual(24);
  revoked = true;
  await expect(
    service.workspaceCheck(
      tx as never,
      actor as never,
      projectId,
      answers.at(-1)!,
      grantId,
    ),
  ).rejects.toThrow();
});

it('keeps Auto on SIWC with exact model/effort and never falls back to deferred Workspace', async () => {
  const input = {
    question: '  Original 😀\n',
    model: 'exact-model',
    reasoning: 'max',
    clientKey: randomUUID(),
  };
  const actor = { userId: randomUUID(), organizationId: randomUUID() };
  const projectId = randomUUID(),
    conversationId = randomUUID();
  let existing: null | { workspaceJob: object } = null;
  const tx = { chatAiAnswer: { findUnique: async () => existing } };
  const ai = {
    workspaceTransaction: async (
      _a: unknown,
      _p: unknown,
      fn: (tx: unknown, grant: string) => Promise<unknown>,
    ) => fn(tx, 'grant'),
    supportsSiwc: vi.fn().mockResolvedValue(true),
    ask: vi.fn().mockResolvedValue({ id: 'siwc', status: 'QUEUED' }),
  };
  const service = new ProjectAiWorkspaceService(
    {} as never,
    ai as never,
    {} as never,
  );
  const prepare = vi.spyOn(service, 'prepare');
  expect(
    await service.prepareAuto(actor as never, projectId, conversationId, input),
  ).toMatchObject({ id: 'siwc', route: 'SIWC' });
  expect(ai.ask).toHaveBeenCalledWith(actor, projectId, conversationId, input, {
    tx,
    grantId: 'grant',
  });
  ai.supportsSiwc.mockResolvedValue(false);
  await expect(
    service.prepareAuto(actor as never, projectId, conversationId, input),
  ).rejects.toThrow('SIWC_CAPABILITY_UNSUPPORTED');
  existing = { workspaceJob: { id: 'immutable-job' } };
  await expect(
    service.prepareAuto(actor as never, projectId, conversationId, input),
  ).rejects.toThrow('WORKSPACE_DEFERRED_BY_USER');
  existing = null;
  ai.supportsSiwc.mockResolvedValue(true);
  ai.ask.mockRejectedValue(new Error('SIWC_UNAVAILABLE'));
  await expect(
    service.prepareAuto(actor as never, projectId, conversationId, input),
  ).rejects.toThrow('SIWC_UNAVAILABLE');
  expect(prepare).not.toHaveBeenCalled();
});

it('defers Workspace dispatch, polling and retry even when the old feature flag is true', async () => {
  vi.stubEnv('FEATURE_WORKSPACE_AGENTS', 'true');
  vi.useFakeTimers();
  const service = new ProjectAiWorkspaceService(
    {} as never,
    {} as never,
    {} as never,
  );
  try {
    const init = Reflect.get(service, 'onModuleInit');
    if (typeof init === 'function') init.call(service);
    expect(vi.getTimerCount()).toBe(0);
    await expect(
      service.prepare({} as never, 'project', 'conversation', {} as never),
    ).rejects.toThrow('WORKSPACE_DEFERRED_BY_USER');
    await expect(service.tick()).rejects.toThrow('WORKSPACE_DEFERRED_BY_USER');
    await expect(
      service.retry({} as never, 'project', 'answer'),
    ).rejects.toThrow('WORKSPACE_DEFERRED_BY_USER');
  } finally {
    const destroy = Reflect.get(service, 'onModuleDestroy');
    if (typeof destroy === 'function') destroy.call(service);
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});

it('returns no Workspace models while still checking current Project access', async () => {
  vi.stubEnv('FEATURE_WORKSPACE_AGENTS', 'true');
  let revoked = false;
  const ai = {
    workspaceTransaction: async (
      _a: unknown,
      _p: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => {
      if (revoked) throw new Error('ACCESS_REVOKED');
      return fn({});
    },
  };
  const service = new ProjectAiWorkspaceService(
    {} as never,
    ai as never,
    {} as never,
  );
  try {
    expect(await service.models({} as never, 'project')).toEqual([]);
    revoked = true;
    await expect(service.models({} as never, 'project')).rejects.toThrow(
      'ACCESS_REVOKED',
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
