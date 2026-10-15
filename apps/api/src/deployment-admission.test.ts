import 'reflect-metadata';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  deploymentAdmission,
  DeploymentRequests,
  deploymentInFlight,
} from './deployment-admission';
import { ExecutionContext } from '@nestjs/common';
import { Subject } from 'rxjs';
import { ProjectAiService } from './project-chat/project-ai.service';
import { HealthController } from './health.controller';
const folder = mkdtempSync(join(tmpdir(), 'galaxy-admission-'));
it('readiness counts a native claim waiting on a transaction and releases it after completion', async () => {
  let release!: () => void;
  const blocked = new Promise<{ started: false; view: { status: string } }>(
    (resolve) => {
      release = () => resolve({ started: false, view: { status: 'QUEUED' } });
    },
  );
  const worker = Object.assign(Object.create(ProjectAiService.prototype), {
    authorized: vi.fn(() => blocked),
  }) as ProjectAiService;
  const ready = new HealthController({
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as never);
  const claim = ProjectAiService.prototype['runChatGpt'].call(
    worker,
    {} as never,
    'project',
    'answer',
  );
  try {
    expect(await ready.ready()).toMatchObject({ nativeInFlight: 1 });
  } finally {
    release();
    await claim;
  }
  expect(await ready.ready()).toMatchObject({ nativeInFlight: 0 });
});
it.each(['before poll', 'after candidate read'] as const)(
  'does not claim durable work when deployment begins draining %s',
  async (stage) => {
    const gate = join(folder, 'gate');
    vi.stubEnv('GALAXY_DEPLOYMENT_GATE', gate);
    vi.stubEnv('GALAXY_AI_EXECUTION_POLICY', 'CHATGPT_PLAN_ONLY');
    if (stage === 'before poll') writeFileSync(gate, 'drain');
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => {
        writeFileSync(gate, 'drain');
        return [{ id: 'candidate', conversationId: 'thread', usage: null }];
      });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const worker = Object.assign(Object.create(ProjectAiService.prototype), {
      workerBusy: false,
      stopping: false,
      workerJobs: new Map(),
      db: { chatAiAnswer: { findMany, updateMany } },
    }) as ProjectAiService;
    await ProjectAiService.prototype.tickRuns.call(worker);
    expect(findMany).toHaveBeenCalledTimes(stage === 'before poll' ? 0 : 2);
    expect(updateMany).not.toHaveBeenCalled();
  },
);
it('keeps a controller counted until its work finishes even when the client connection has gone', () => {
  const work = new Subject();
  new DeploymentRequests()
    .intercept({} as ExecutionContext, { handle: () => work })
    .subscribe();
  expect(deploymentInFlight()).toBe(1);
  work.complete();
  expect(deploymentInFlight()).toBe(0);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(join(folder, 'gate'), { force: true });
});
it('blocks new server writes while existing file and MCP checkpoints drain, then closes them before cutover', () => {
  const gate = join(folder, 'gate');
  vi.stubEnv('GALAXY_DEPLOYMENT_GATE', gate);
  const call = (method: string, url: string) => {
    const next = vi.fn(),
      res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
    deploymentAdmission({ method, url }, res, next);
    return { next, res };
  };
  expect(call('POST', '/api/v1/uploads/initiate').next).toHaveBeenCalled();
  writeFileSync(gate, 'drain');
  expect(
    call('POST', '/api/v1/project-chat/projects/p/ai/conversations/c/mcp-jobs')
      .res.status,
  ).toHaveBeenCalledWith(503);
  expect(call('POST', '/api/v1/uploads/id/parts').next).toHaveBeenCalled();
  expect(call('POST', '/mcp').next).toHaveBeenCalled();
  for (const path of [
    '/mcp/oauth/token',
    '/api/v1/project-chat/projects/p/ai/answers/a/mcp/cancel',
  ])
    expect(call('POST', path).next).toHaveBeenCalled();
  for (const path of [
    '/mcp/oauth/authorize',
    '/api/v1/project-chat/projects/p/ai/answers/a/mcp/retry',
  ])
    expect(call('POST', path).res.status).toHaveBeenCalledWith(503);
  writeFileSync(gate, 'closed');
  expect(call('POST', '/mcp').res.status).toHaveBeenCalledWith(503);
  expect(call('POST', '/mcp/oauth/token').res.status).toHaveBeenCalledWith(503);
  expect(call('GET', '/api/v1/ready').next).toHaveBeenCalled();
});
