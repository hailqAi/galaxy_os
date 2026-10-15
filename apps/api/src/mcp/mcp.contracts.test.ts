import { describe, expect, it } from 'vitest';
import {
  resultInput,
  progressInput,
  subscriptionInput,
  mcpJob,
} from './mcp.schemas';

const job = '4ca5e701-23c6-4b2d-84ee-9cf40270dcd1';

describe('Galaxy MCP trust boundaries', () => {
  it('accepts native file references with optional MIME and name', () => {
    expect(
      resultInput.parse({
        job_id: job,
        attempt: 1,
        submission_id: 'result-1',
        files: [
          {
            file_id: 'file-1',
            download_url: 'https://files.example.com/result.xlsx?sig=temporary',
          },
        ],
        finalize: false,
      }).files,
    ).toHaveLength(1);
  });
  it('rejects a result that chooses another destination or a sandbox path', () => {
    expect(
      resultInput.safeParse({
        job_id: job,
        attempt: 1,
        submission_id: 'result-1',
        project_id: job,
        finalize: true,
      }).success,
    ).toBe(false);
    expect(
      resultInput.safeParse({
        job_id: job,
        attempt: 1,
        submission_id: 'result-1',
        files: [
          { file_id: 'file-1', download_url: 'sandbox:/mnt/data/result.xlsx' },
        ],
        finalize: false,
      }).success,
    ).toBe(false);
  });
  it('requires an operation identity and observed progress, never percentage or reasoning', () => {
    expect(
      progressInput.safeParse({
        job_id: job,
        attempt: 1,
        operation_id: 'received-1',
        stage: 'PROCESSING',
      }).success,
    ).toBe(true);
    expect(
      progressInput.safeParse({
        job_id: job,
        attempt: 1,
        operation_id: 'received-1',
        stage: 'PROCESSING',
        percentage: 73,
      }).success,
    ).toBe(false);
  });
  it('requires the attempt from galaxy_get_job for every progress and result write', () => {
    expect(
      progressInput.safeParse({
        job_id: job,
        operation_id: 'late',
        stage: 'PROCESSING',
      }).success,
    ).toBe(false);
    expect(
      resultInput.safeParse({
        job_id: job,
        submission_id: 'late',
        finalize: false,
      }).success,
    ).toBe(false);
    expect(
      resultInput.safeParse({
        job_id: job,
        attempt: 0,
        submission_id: 'late',
        finalize: false,
      }).success,
    ).toBe(false);
  });
  it('requires HTTPS callbacks and a valid Standard Webhooks secret', () => {
    const data = {
      name: 'galaxy.ai_job.created',
      arguments: { project_id: job },
      delivery: {
        mode: 'webhook',
        url: 'https://chatgpt.com/events/real-callback',
        secret: 'whsec_' + Buffer.alloc(32, 7).toString('base64'),
      },
    };
    expect(subscriptionInput.safeParse(data).success).toBe(true);
    expect(
      subscriptionInput.safeParse({
        ...data,
        delivery: { ...data.delivery, url: 'http://localhost/callback' },
      }).success,
    ).toBe(false);
    expect(
      subscriptionInput.safeParse({
        ...data,
        delivery: { ...data.delivery, secret: 'whsec_bad' },
      }).success,
    ).toBe(false);
  });
  it('keeps an original job without a total workflow deadline', () => {
    const parsed = mcpJob.parse({
      version: 1,
      state: 'WAITING_NOTIFICATION',
      originalMessageId: job,
      actor: {
        userId: job,
        organizationId: job,
        organizationMembershipId: job,
      },
      context: {},
      sourceIds: [],
      requestedOutputs: ['xlsx'],
      createdAt: '2026-10-12T07:00:00.000Z',
    });
    expect(parsed.requestedOutputs).toEqual(['xlsx']);
    expect('deadlineAt' in parsed).toBe(false);
  });
});
