import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatAiAnswer, Prisma } from '@prisma/client';
import { ProjectAiService } from './project-ai.service';
import { configuredModel, readAiConfig } from './ai-registry';
import { CurrentActor } from '../access-control/current-actor';

const directory = mkdtempSync(join(tmpdir(), 'galaxy-router-service-'));
const path = join(directory, 'providers.json');
const actor = { userId: 'actor', organizationId: 'org' } as CurrentActor;
const state = {
  revision: 'r1',
  GEMINI_API_KEY: 'synthetic-gemini',
  enabled: true,
  replacementConfirmed: true,
  paused: true,
  dataPolicy: 'SYNTHETIC_PUBLIC_APPROVED',
  approvedInputs: [
    {
      organizationId: 'org',
      projectId: 'project',
      questionHash: createHash('sha256').update('Câu công khai.').digest('hex'),
    },
  ],
};
const service = new ProjectAiService(
  null as never,
  null as never,
  null as never,
  null as never,
  null as never,
  null as never,
  null as never,
);
afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(directory, { recursive: true, force: true }));

it.each(['COMPLETED', 'FAILED'])(
  'paused %s history remains visible under current input policy, revoked policy still hides',
  async (status) => {
    const base = configuredModel(
      { google_gemini: { ...state, paused: false } },
      'gemini-3.8-flash',
    );
    const pin = {
      version: 1,
      mode: 'GENERAL',
      provider: 'google_gemini',
      model: base.model,
      revision: base.revision,
      configDigest: base.configDigest,
      reasoning: 'default',
      dataClassification: base.dataPolicy,
      sourceIds: [],
    };
    writeFileSync(
      path,
      JSON.stringify({ providers: { google_gemini: state } }),
      { mode: 0o600 },
    );
    vi.stubEnv('GALAXY_AI_CONFIG_FILE', path);
    const answer = {
      id: 'a',
      conversationId: 'conversation',
      invokeGrantId: 'grant',
      status,
      question: 'Câu công khai.',
      answer: status === 'COMPLETED' ? 'Câu trả lời.' : null,
      model: base.model,
      citations: [],
      usage: { request: pin },
      createdAt: new Date(),
    } as unknown as ChatAiAnswer;
    const tx = {
      chatAiAnswerDependency: { findMany: async () => [] },
      chatAiAnswer: { findMany: async () => [] },
    } as unknown as Prisma.TransactionClient;
    expect(
      await service['view'](tx, actor, 'project', answer, 'grant'),
    ).toMatchObject({ status, question: 'Câu công khai.' });
    expect(
      await service['view'](tx, actor, 'project', answer, 'other-grant'),
    ).toMatchObject({ status: 'ACCESS_REVOKED', question: null });
    writeFileSync(
      path,
      JSON.stringify({
        providers: { google_gemini: { ...state, approvedInputs: [] } },
      }),
    );
    expect(
      await service['view'](tx, actor, 'project', answer, 'grant'),
    ).toMatchObject({ status: 'INPUT_POLICY_DENIED', question: null });
  },
);
it('durable cost violation blocks later reservation on same revision but not a new revision', async () => {
  const envPath = join(directory, 'keys.env');
  writeFileSync(envPath, 'OPENROUTER_API_KEY="synthetic-router"\n', {
    mode: 0o600,
  });
  writeFileSync(
    path,
    JSON.stringify({
      providers: {
        openrouter: {
          ...state,
          GEMINI_API_KEY: undefined,
          paused: false,
          costMode: 'FREE_ONLY',
        },
      },
      credentialSource: { mode: 'env', path: envPath },
    }),
    { mode: 0o600 },
  );
  const model = configuredModel(
    readAiConfig({ GALAXY_AI_CONFIG_FILE: path }),
    'openrouter/free',
  );
  const updates: unknown[] = [];
  const tx = {
    $queryRaw: async () => [],
    chatAiAnswer: {
      findFirst: async (query: { where: Prisma.ChatAiAnswerWhereInput }) => {
        const where = query.where;
        if (
          where.errorCode === 'FREE_ONLY_COST_VIOLATION' &&
          JSON.stringify(where).includes('r1')
        )
          return { id: 'prior-cost-violation' };
        return null;
      },
      count: async () => 0,
      update: async (query: unknown) => {
        updates.push(query);
      },
    },
  } as unknown as Prisma.TransactionClient;
  expect(
    await service['reserveProvider'](
      tx,
      actor,
      { ...model, daily: null },
      'next',
    ),
  ).toBe(false);
  expect(updates).toContainEqual({
    where: { id: 'next' },
    data: {
      status: 'FAILED',
      errorCode: 'FREE_ONLY_COST_VIOLATION',
      completedAt: expect.any(Date),
    },
  });
  expect(
    await service['reserveProvider'](
      tx,
      actor,
      { ...model, revision: 'r2', daily: null },
      'new-revision',
    ),
  ).toBe(true);
});

it.each(['BACKOFF', 'CANCELLED'])(
  'a %s cost race retains evidence and stops later transport',
  async (race) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
    const envPath = join(directory, 'keys.env');
    writeFileSync(envPath, 'OPENROUTER_API_KEY="synthetic-router"\n', {
      mode: 0o600,
    });
    writeFileSync(
      path,
      JSON.stringify({
        providers: {
          openrouter: {
            ...state,
            GEMINI_API_KEY: undefined,
            paused: false,
            costMode: 'FREE_ONLY',
            maxConcurrent: 2,
          },
        },
        credentialSource: { mode: 'env', path: envPath },
      }),
      { mode: 0o600 },
    );
    vi.stubEnv('GALAXY_AI_CONFIG_FILE', path);
    vi.stubEnv('FEATURE_PROJECT_AI', 'true');
    const model = configuredModel(readAiConfig(), 'openrouter/free');
    const row = {
      id: 'retry',
      conversationId: 'conversation',
      invokeGrantId: 'grant',
      status: 'QUEUED',
      question: 'Câu công khai.',
      answer: null,
      model: model.model,
      citations: [],
      usage: {
        request: {
          version: 1,
          mode: 'GENERAL',
          provider: model.provider,
          model: model.model,
          revision: model.revision,
          configDigest: model.configDigest,
          reasoning: 'default',
          dataClassification: model.dataPolicy,
          sourceIds: [],
        },
      },
      createdAt: new Date(),
    };
    let charged = false;
    let posts = 0;
    const tx = {
      $queryRaw: async () => [],
      project: {
        findFirst: async () => ({ id: 'project' }),
        findUniqueOrThrow: async () => ({ name: 'Project fixture' }),
      },
      chatAiConversation: { findFirst: async () => ({ scope: 'ALL' }) },
      chatAiAnswerDependency: { findMany: async () => [] },
      chatAiAnswer: {
        findMany: async () => [],
        count: async () => 0,
        findFirst: async (query: { where: Prisma.ChatAiAnswerWhereInput }) =>
          query.where.id === 'retry'
            ? row
            : query.where.errorCode === 'FREE_ONLY_COST_VIOLATION' &&
                (race === 'BACKOFF'
                  ? charged
                  : 'errorCode' in row &&
                    row.errorCode === 'FREE_ONLY_COST_VIOLATION')
              ? { id: 'another-charge' }
              : null,
        update: async (query: { data: object }) =>
          Object.assign(row, query.data),
        updateMany: async (query: {
          where?: { status?: { in: string[] } };
          data: object;
        }) => {
          if (
            query.where?.status &&
            !query.where.status.in.includes(row.status)
          )
            return { count: 0 };
          Object.assign(row, query.data);
          return { count: 1 };
        },
      },
    };
    Object.assign(tx, {
      $transaction: async (run: (transaction: typeof tx) => Promise<unknown>) =>
        run(tx),
    });
    const access = {
      project: async (
        _actor: unknown,
        _project: unknown,
        run: (tx: unknown) => unknown,
      ) => run(tx),
      freshActor: async () => ({
        ...actor,
        permissions: ['ai.invoke'],
        administrationScope: 'ORGANIZATION',
      }),
      authority: async () => ({ id: 'grant' }),
    };
    const runner = new ProjectAiService(
      tx as never,
      null as never,
      null as never,
      access as never,
      null as never,
      null as never,
      null as never,
    );
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.endsWith('/models'))
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'openrouter/free',
                architecture: {
                  input_modalities: ['text'],
                  output_modalities: ['text'],
                },
                pricing: { prompt: '0', completion: '0' },
              },
            ],
          }),
        );
      posts++;
      charged = true;
      if (race === 'CANCELLED') {
        row.status = 'CANCELLED';
        return new Response(
          JSON.stringify({
            model: 'vendor/actual',
            usage: { cost: 0.1 },
            error: {},
          }),
        );
      }
      return new Response('{}', { status: 503 });
    });
    const running = runner.run(actor, 'project', 'retry');
    await vi.advanceTimersByTimeAsync(3000);
    await running;
    expect(posts).toBe(1);
    expect(row).toMatchObject({
      status: race === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
      errorCode: 'FREE_ONLY_COST_VIOLATION',
    });
    if (race === 'CANCELLED')
      expect(row.usage).toMatchObject({
        returnedModel: 'vendor/actual',
        cost: { status: 'KNOWN', value: 0.1 },
      });
    expect(
      await runner['reserveProvider'](
        {
          ...tx,
          chatAiAnswer: { ...tx.chatAiAnswer, update: async () => ({}) },
        } as unknown as Prisma.TransactionClient,
        actor,
        { ...model, daily: null },
        'next-after-race',
      ),
    ).toBe(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  },
);
