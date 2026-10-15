import { expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { test } from './m2-chrome-fixture';
import {
  createM2BrowserFixture,
  PrismaClient,
} from '../../../api/test/m2-browser.fixture';

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());
test('E05 local UI keeps the original job and displays a saved MCP tool result after reload', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const fixture = await createM2BrowserFixture();
  const user = fixture.users.sender!;
  const project = await db.project.findUniqueOrThrow({
    where: { id: fixture.projectId },
  });
  const role = await db.role.create({
    data: {
      organizationId: project.organizationId,
      code: 'e05-browser-' + randomUUID(),
      name: 'E05 browser fixture',
      maximumScope: 'SYSTEM',
      permissions: {
        create: ['ai.invoke', 'project.read', 'dashboard.read'].map((code) => ({
          permission: { connect: { code } },
        })),
      },
    },
  });
  await db.userRole.create({
    data: {
      organizationId: project.organizationId,
      userId: user.id,
      roleId: role.id,
      scopeType: 'SYSTEM',
    },
  });
  await db.chatProjectGrant.create({
    data: {
      organizationId: project.organizationId,
      projectId: project.id,
      userId: user.id,
      grantedBy: fixture.users.authority!.id,
      actions: ['INVOKE'],
      roomCeiling: [],
      effectiveAt: new Date(Date.now() - 60000),
    },
  });
  const index = user.cookie.indexOf('=');
  await context.addCookies([
    {
      name: user.cookie.slice(0, index),
      value: user.cookie.slice(index + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/settings/chatgpt-connection');
  const connection = page.getByRole('region', { name: 'Galaxy OS MCP' });
  await expect(
    connection.getByText('Không nhập thủ công; DCR cấp Client ID'),
  ).toBeVisible();
  await expect(connection.getByText(/Chưa cấp quyền/)).toBeVisible();
  await page.goto(`/projects/${project.id}/ai`);
  const executor = page.getByRole('combobox', {
    name: 'Thực hiện bằng',
    exact: true,
  });
  await expect(executor).toHaveValue('AUTO');
  const beforeTyping = await db.chatAiAnswer.count({
    where: { organizationId: project.organizationId, ownerId: user.id },
  });
  const textbox = page.getByRole('textbox', {
    name: 'Câu hỏi AI',
    exact: true,
  });
  await textbox.fill('chào');
  await page.waitForTimeout(500);
  await textbox.fill('x');
  await page.waitForTimeout(500);
  expect(
    await db.chatAiAnswer.count({
      where: { organizationId: project.organizationId, ownerId: user.id },
    }),
  ).toBe(beforeTyping);
  const countQuestion = 'OS đang có bao nhiêu dự án?';
  await textbox.fill(countQuestion);
  const countResponse = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.endsWith('/executions'),
  );
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  expect((await countResponse).status()).toBe(201);
  const oracle = await db.project.count({
    where: { organizationId: project.organizationId, deletedAt: null },
  });
  await expect(
    page.getByText('Dữ liệu Galaxy', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(new RegExp('Có ' + oracle + ' dự án')),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(countQuestion, { exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Thực hiện bằng', exact: true })
    .selectOption('MCP_EVENTS');
  const question = 'E05 local browser original request ' + randomUUID();
  const created = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.endsWith('/mcp-jobs'),
  );
  await page
    .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
    .fill(question);
  let releaseSubmit!: () => void;
  const heldSubmit = new Promise<void>((resolve) => {
    releaseSubmit = resolve;
  });
  await page.route(
    '**/mcp-jobs',
    async (route) => {
      await heldSubmit;
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  try {
    await expect(
      page.getByRole('heading', { name: question, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Galaxy đang lưu yêu cầu.', { exact: true }),
    ).toBeVisible();
  } finally {
    releaseSubmit();
  }
  const response = await created;
  expect(response.status()).toBe(201);
  const job = await response.json();
  await page.reload();
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Chờ kết nối hoặc đăng ký theo dõi/),
  ).toBeVisible();

  const origin = process.env.APP_PUBLIC_ORIGIN!;
  const registered = await context.request.post('/mcp/oauth/register', {
    data: {
      redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
      client_name: 'E05 synthetic browser client',
      token_endpoint_auth_method: 'none',
    },
  });
  expect(registered.status()).toBe(201);
  const client = await registered.json();
  const verifier = 'e'.repeat(43);
  const authorized = await context.request.get('/mcp/oauth/authorize', {
    maxRedirects: 0,
    params: {
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: 'code',
      resource: origin + '/mcp',
      scope:
        'galaxy.jobs.read galaxy.jobs.write galaxy.events galaxy.data.read galaxy.data.write',
      state: randomUUID(),
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    },
  });
  expect(authorized.status()).toBe(302);
  const request = new URL(authorized.headers().location!).searchParams.get(
    'request',
  );
  const consent = await context.request.post(
    `/api/v1/mcp-auth/requests/${request}/consent`,
    { data: {}, headers: { Origin: origin } },
  );
  expect(consent.status()).toBe(201);
  const redirect = new URL((await consent.json()).redirect);
  const tokens = await context.request.post('/mcp/oauth/token', {
    form: {
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code: redirect.searchParams.get('code')!,
      code_verifier: verifier,
      redirect_uri: client.redirect_uris[0],
      resource: origin + '/mcp',
    },
  });
  expect(tokens.status()).toBe(200);
  const token = (await tokens.json()).access_token;
  const call = (name: string, arguments_: Record<string, unknown>) =>
    context.request.post('/mcp', {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/call',
        'Mcp-Name': name,
      },
      data: {
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'tools/call',
        params: {
          name,
          arguments: arguments_,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
            'io.modelcontextprotocol/clientInfo': {
              name: 'Synthetic acceptance',
              version: '1',
            },
          },
        },
      },
    });
  const read = await call('galaxy_get_job', { job_id: job.id });
  const counter = (await (await call('galaxy_count_projects', {})).json())
    .result;
  expect(counter.structuredContent.count).toBe(oracle);
  const detail = (await read.json()).result.structuredContent;
  expect(detail.question).toBe(question);
  const answer = 'E05 saved text through the actual local MCP endpoint.';
  const partial = await call('galaxy_submit_job_result', {
    job_id: job.id,
    attempt: detail.attempt,
    submission_id: 'browser-result',
    sequence: 0,
    content: answer,
    finalize: false,
  });
  expect((await partial.json()).result.isError).not.toBe(true);
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByText(/ChatGPT Work · Đang xử lý/)).toBeVisible();
  await expect(page.getByText(/Chờ kết nối hoặc đăng ký theo dõi/)).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByText(/ChatGPT Work · Đang xử lý/)).toBeVisible();
  const progressSamples: number[] = [];
  const toolSamples: number[] = [];
  for (let index = 0; index < 20; index++) {
    const message = `E05 observed fixture progress ${index}`;
    const started = Date.now();
    const reported = await call('galaxy_report_job_progress', {
      job_id: job.id,
      attempt: detail.attempt,
      operation_id: `browser-progress-${index}`,
      stage: 'PROCESSING',
      message,
    });
    expect((await reported.json()).result.isError).not.toBe(true);
    toolSamples.push(Date.now() - started);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    progressSamples.push(Date.now() - started);
  }
  const p95 = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;
  writeFileSync(
    process.env.G00_TEST_ROOT! +
      '/e05-ui-progress-' +
      process.env.GALAXY_RELEASE_ID +
      '.json',
    JSON.stringify({
      releaseId: process.env.GALAXY_RELEASE_ID,
      at: new Date().toISOString(),
      samples: 20,
      concurrentUsers: 1,
      mode: 'G00_SYNTHETIC_MCP_PROGRESS_WARM_NOT_CHATGPT',
      metric:
        'MCP HTTP initiation to main chat DOM; includes request/commit/ACK and snapshot refresh',
      progressSamples,
      toolSamples,
      progressP95Ms: p95(progressSamples),
      toolP95Ms: p95(toolSamples),
    }),
    { mode: 0o600 },
  );
  expect(p95(progressSamples)).toBeLessThanOrEqual(2000);
  const input = {
    job_id: job.id,
    attempt: detail.attempt,
    submission_id: 'browser-result',
    sequence: 0,
    content: answer,
    finalize: true,
  };
  const saved = (await (await call('galaxy_submit_job_result', input)).json())
    .result;
  expect(saved.isError).not.toBe(true);
  expect(saved.structuredContent.state).toBe('COMPLETED');
  expect(
    (await (await call('galaxy_submit_job_result', input)).json()).result
      .isError,
  ).not.toBe(true);
  await page.reload();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByText(question, { exact: true })).toHaveCount(1);
  await expect(
    page.getByText('Tiến độ công việc', { exact: true }),
  ).toBeVisible();
  expect(
    await db.chatAiAnswer.count({
      where: {
        conversationId: job.conversationId ?? detail.thread_id,
        question,
      },
    }),
  ).toBe(1);
});
