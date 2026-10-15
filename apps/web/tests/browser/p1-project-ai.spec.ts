import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test } from './m2-chrome-fixture';
import {
  createM2BrowserFixture,
  PrismaClient,
} from '../../../api/test/m2-browser.fixture';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const db = new PrismaClient();
test.use({ actionTimeout: 15000 });
let fixture: Awaited<ReturnType<typeof createM2BrowserFixture>>,
  projectB: string,
  organizationId: string;
test.beforeAll(async () => {
  expect(process.env.GALAXY_AI_EXECUTION_POLICY).toBe('CHATGPT_PLAN_ONLY');
  expect(process.env.GALAXY_CHATGPT_RUNTIME_PATH).toBe(
    process.env.G00_TEST_ROOT + '/p1-chatgpt-runtime',
  );
  fixture = await createM2BrowserFixture();
  const a = await db.project.findUniqueOrThrow({
    where: { id: fixture.projectId },
  });
  organizationId = a.organizationId;
  const owner = fixture.users.sender!.id;
  const role = await db.role.create({
    data: {
      organizationId,
      code: 'p1-browser-' + randomUUID(),
      name: 'P1 fixture owner',
      maximumScope: 'SYSTEM',
      permissions: {
        create: [
          'ai.invoke',
          'project.read',
          'task.read',
          'chat.publish',
          'system.settings.update',
          'system.settings.read',
          'dashboard.read',
        ].map((code) => ({ permission: { connect: { code } } })),
      },
    },
  });
  await db.userRole.create({
    data: {
      organizationId,
      userId: owner,
      roleId: role.id,
      scopeType: 'SYSTEM',
    },
  });
  projectB = (
    await db.project.create({
      data: {
        organizationId,
        customerId: a.customerId,
        code: randomUUID(),
        name: 'P1 PLANNING no room',
        status: 'PLANNING',
        createdBy: owner,
        updatedBy: owner,
      },
    })
  ).id;
  for (const projectId of [fixture.projectId, projectB])
    await db.chatProjectGrant.create({
      data: {
        organizationId,
        projectId,
        userId: owner,
        grantedBy: fixture.users.authority!.id,
        actions: ['INVOKE', 'PUBLISH'],
        roomCeiling: [],
        effectiveAt: new Date(Date.now() - 60000),
      },
    });
  const member = await db.organizationMembership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId, userId: owner } },
  });
  const session = await db.session.findFirstOrThrow({
    where: { userId: owner },
    orderBy: { createdAt: 'desc' },
  });
  execFileSync(
    process.execPath,
    [
      '-e',
      `
    const {PrismaService}=require('./apps/api/dist/prisma.service.js');
    const {ProjectChatPolicy}=require('./apps/api/dist/access-control/project-chat.policy.js');
    const {AuditService}=require('./apps/api/dist/audit/audit.service.js');
    const {ChatGptConnectionService,CHATGPT_SCOPES}=require('./apps/api/dist/settings/chatgpt-connection.service.js');
    const db=new PrismaService(); const service=new ChatGptConnectionService(db,new ProjectChatPolicy(db),new AuditService(db));
    (async()=>{try {
      await service.onModuleInit(); const owner=JSON.parse(process.argv[1]);
      await db.$transaction(tx=>service.save(owner.organizationId,{
        generation:'p1-browser-generation',owner,identity:{issuer:'https://auth.openai.com',subject:'fixture',label:'fixture'},
        clientId:'oaiapp_fixture',scopes:CHATGPT_SCOPES.split(' '),credentials:{access_token:'p1-browser-synthetic-only',expiresAt:Date.now()+3600000},
        status:'OWNER_READY',models:[{id:'p1-account-model',label:'P1 account model'}],catalogAt:null,verifiedAt:null,revocation:'NOT_RUN'
      },tx));
    } finally {await service.onModuleDestroy();await db.$disconnect();}})().catch(e=>{console.error(e.message);process.exitCode=1});
  `,
      JSON.stringify({
        userId: owner,
        organizationId,
        organizationMembershipId: member.id,
        sessionId: session.id,
      }),
    ],
    {
      cwd: resolve(__dirname, '../../../..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        GALAXY_CHATGPT_CALLBACK_PORT: '0',
      },
      stdio: 'pipe',
    },
  );
});

test('E03 durable DEEP returns its runId, survives reload and retains MAX without another message', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const key =
    'siwc.capabilities.' +
    organizationId +
    '.' +
    createHash('sha256').update('p1-account-model').digest('hex');
  await db.systemSetting.create({
    data: {
      key,
      value: {
        generation: 'p1-browser-generation',
        model: 'p1-account-model',
        reasoningModes: ['default', 'max'],
        effortEvidence: { max: 'REQUEST_ACCEPTED' },
        webSearch: false,
        receipts: [],
        checkedAt: new Date().toISOString(),
      },
    },
  });
  try {
    await open(page, fixture.projectId);
    await page
      .getByRole('combobox', { name: 'Chế độ xử lý', exact: true })
      .selectOption('DEEP');
    await page
      .getByRole('combobox', { name: 'Mức suy luận', exact: true })
      .selectOption('max');
    const ack = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/ai\/answers\/[^/]+\/run$/.test(new URL(r.url()).pathname),
    );
    await page
      .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
      .fill('P1 browser slow-A');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    const response = await ack;
    expect(response.status()).toBe(201);
    const receipt = await response.json();
    expect(receipt.runId).toBe(receipt.id);
    expect(['QUEUED', 'RUNNING']).toContain(receipt.status);
    const saved = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: receipt.runId },
    });
    const usage = saved.usage as {
      request: { reasoning: string };
      workflow: { mode: string; queuedAt: string; deadlineAt: string | null };
    };
    expect(usage.workflow.mode).toBe('DEEP');
    expect(usage.request.reasoning).toBe('max');
    expect(usage.workflow.deadlineAt).toBeNull();
    await page.reload();
    await expect(page.getByText('sentinel-A', { exact: true })).toBeVisible({
      timeout: 60000,
    });
    const done = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(done.status).toBe('COMPLETED');
    expect(done.question).toBe('P1 browser slow-A');
    expect(done.model).toBe('p1-account-model');
    expect((done.usage as typeof usage).workflow.deadlineAt).toBe(
      usage.workflow.deadlineAt,
    );
    expect(
      await db.chatAiAnswer.count({
        where: { conversationId: saved.conversationId },
      }),
    ).toBe(1);
    await expect(
      page.getByRole('combobox', { name: 'Mức suy luận', exact: true }),
    ).toHaveValue('max');
  } finally {
    await db.systemSetting.deleteMany({ where: { key } });
  }
});

test('E03 durable Stop after dispatch fences the late provider result after reload', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await open(page, fixture.projectId);
  const ack = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/ai\/answers\/[^/]+\/run$/.test(new URL(r.url()).pathname),
  );
  await page
    .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
    .fill('E03 browser stop');
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  const receipt = await (await ack).json();
  await expect
    .poll(
      async () =>
        (
          await db.chatAiAnswer.findUniqueOrThrow({
            where: { id: receipt.runId },
          })
        ).providerStartedAt !== null,
      { timeout: 15000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Dừng yêu cầu', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db.chatAiAnswer.findUniqueOrThrow({
            where: { id: receipt.runId },
          })
        ).status,
    )
    .toBe('CANCELLED');
  await page.reload();
  await expect(page.locator('.ai-question')).toContainText('E03 browser stop');
  // The synthetic provider deliberately returns late; poll past its real bounded delay.
  await expect
    .poll(
      async () => {
        const row = await db.chatAiAnswer.findUniqueOrThrow({
          where: { id: receipt.runId },
        });
        expect(row.status).toBe('CANCELLED');
        expect(row.answer).toBeNull();
        return Date.now() - row.providerStartedAt!.getTime();
      },
      { timeout: 15000, intervals: [1000] },
    )
    .toBeGreaterThan(8000);
  await expect(
    page.getByText('E03 forbidden late output', { exact: true }),
  ).toHaveCount(0);
});

test('E03 durable expired DEEP queue becomes PARTIAL through the actual worker and survives reload', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const prefix = `/api/v1/project-chat/projects/${fixture.projectId}/ai`;
  const headers = {
    'X-Chat-Actor': fixture.users.sender!.id,
    Origin: process.env.APP_PUBLIC_ORIGIN!,
  };
  const c = await context.request.post(prefix + '/conversations', {
    headers,
    data: { scope: 'ALL', clientKey: randomUUID() },
  });
  expect(c.status()).toBe(201);
  const conversation = await c.json();
  const q = await context.request.post(
    prefix + `/conversations/${conversation.id}/answers`,
    {
      headers,
      data: {
        question: 'E03 expired retained question',
        clientKey: randomUUID(),
        model: 'p1-account-model',
        searchMode: 'PROJECT_ONLY',
        runMode: 'DEEP',
      },
    },
  );
  expect(q.status()).toBe(201);
  const queued = await q.json();
  const row = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: queued.id },
    }),
    usage = row.usage as Record<string, object>;
  const deadline = Date.now() - 1;
  await db.chatAiAnswer.update({
    where: { id: row.id },
    data: {
      usage: {
        ...usage,
        workflow: {
          ...usage.workflow,
          queuedAt: new Date(deadline - 1800000).toISOString(),
          deadlineAt: new Date(deadline).toISOString(),
        },
      },
    },
  });
  await expect
    .poll(
      async () =>
        (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: row.id } }))
          .status,
      { timeout: 15000 },
    )
    .toBe('PARTIAL');
  await page.goto(`/projects/${fixture.projectId}/ai?ai=${conversation.id}`);
  await expect(page.locator('.ai-question')).toContainText(
    'E03 expired retained question',
  );
  await expect(
    page.getByText('Kết quả một phần — chưa hoàn tất yêu cầu', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Kết quả một phần — chưa hoàn tất yêu cầu', { exact: true }),
  ).toBeVisible();
  const done = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: row.id },
  });
  expect(done.providerStartedAt).toBeNull();
  expect(done.answer).not.toContain('sentinel');
  expect(
    await db.chatAiAnswer.count({ where: { conversationId: conversation.id } }),
  ).toBe(1);
});

test('E03 rich chat preserves Markdown, authorized inline images, compact citations and downloads after reload', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await open(page, fixture.projectId);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByLabel('Tải tệp từ máy', { exact: true }).setInputFiles({
    name: 'E03-source-preview.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.locator('.ai-file-chips')).toContainText('Đã tải lên');
  const result = await send(page, fixture.projectId, 'P1 browser A');
  const stored = await db.chatAiAnswer.findUniqueOrThrow({
    where: { id: result.id },
  });
  const inputImage = page.locator('.ai-user-attachments img');
  await expect(inputImage).toBeVisible();
  await expect
    .poll(() =>
      inputImage.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const url = (await inputImage.getAttribute('src'))!;
  const handle = 'T_' + 'e'.repeat(24),
    publicUrl = 'https://example.test/official';
  const text = `**Báo giá** &amp; nguồn\n\n| Mã | Tổng |\n| --- | --- |\n| *A* | **25.00** |\n\nThông số [${handle}]\n\n\`\`\`json\n{"text":"**literal** &amp; ..."}\n\`\`\`\n\n![Ảnh nguồn](${url})\n\n<img src="https://example.test/?private=blocked">`;
  // Seed only display evidence here; provider/source execution has separate acceptance tests.
  await db.chatAiAnswer.update({
    where: { id: stored.id },
    data: {
      answer: text,
      citations: [handle],
      usage: {
        ...(stored.usage as object),
        toolSources: [
          {
            handle,
            label: 'Synthetic public source',
            version: 'synthetic-display-v1',
            provenance: 'PUBLIC_WEB',
            permissions: [],
            createdAt: new Date().toISOString(),
            text: 'Synthetic public display evidence.',
            web: {
              url: publicUrl,
              title: 'Nhà sản xuất',
              retrievedAt: new Date().toISOString(),
              provider: 'NATIVE_SIWC',
              kind: 'SNIPPET',
            },
          },
        ],
        nativeWebCitations: [{ url: publicUrl, title: 'Nhà sản xuất' }],
      },
    },
  });
  const externalImages: string[] = [];
  page.on('request', (request) => {
    if (
      request.resourceType() === 'image' &&
      new URL(request.url()).hostname === 'example.test'
    )
      externalImages.push(request.url());
  });
  await page.reload();
  const rendered = page.locator('.chat-text');
  await expect(rendered.locator('strong').first()).toHaveText('Báo giá');
  await expect(rendered.locator('table')).toContainText('25.00');
  await expect(rendered.locator('code')).toContainText('**literal** &amp; ...');
  await expect(rendered.locator('a.chat-source-citation')).toHaveAttribute(
    'href',
    publicUrl,
  );
  await expect(rendered.locator('img')).toHaveAttribute('src', url);
  await expect
    .poll(() =>
      rendered
        .locator('img')
        .evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
    )
    .toBe(true);
  expect(externalImages).toEqual([]);
  expect(
    await page.locator('.ai-answer-details').getAttribute('open'),
  ).toBeNull();
  const html = await rendered.innerHTML();
  await page.reload();
  await expect(rendered.locator('table')).toContainText('25.00');
  expect(await rendered.innerHTML()).toBe(html);
  const download = await context.request.get(url);
  expect(download.status()).toBe(200);
  expect(
    createHash('sha256')
      .update(await download.body())
      .digest('hex'),
  ).toBe(createHash('sha256').update(png).digest('hex'));
  const markdown = await context.request.get(
    (await page
      .getByRole('link', { name: 'Tải Markdown', exact: true })
      .getAttribute('href'))!,
  );
  expect(markdown.status()).toBe(200);
  expect(await markdown.text()).toContain(text);
  const wrongProject = await context.request.get(
    url.replace(fixture.projectId, projectB),
  );
  expect(wrongProject.status()).toBe(404);
  const grant = await db.chatProjectGrant.findFirstOrThrow({
    where: {
      projectId: fixture.projectId,
      userId: fixture.users.sender!.id,
      revokedAt: null,
    },
  });
  try {
    await db.chatProjectGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
    expect([403, 404]).toContain((await context.request.get(url)).status());
    await page.reload();
    await expect(
      page.locator('.ai-user-attachments img, .chat-text img'),
    ).toHaveCount(0);
  } finally {
    await db.chatProjectGrant.update({
      where: { id: grant.id },
      data: { revokedAt: grant.revokedAt },
    });
  }
});

test('P1 chat preserves the original question bytes and clears only the submitted draft', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await open(page, fixture.projectId);
  const question = ' \nP1 browser A\t ';
  const request = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      /\/ai\/conversations\/[^/]+\/answers$/.test(new URL(r.url()).pathname),
  );
  const [submitted, answer] = await Promise.all([
    request,
    send(page, fixture.projectId, question),
  ]);
  expect(submitted.postDataJSON().question).toBe(question);
  expect(
    (await db.chatAiAnswer.findUniqueOrThrow({ where: { id: answer.id } }))
      .question,
  ).toBe(question);
  await expect(
    page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true }),
  ).toHaveValue('');
  await page.reload();
  const conversationId = new URL(page.url()).searchParams.get('ai');
  const markdown = page.getByRole('link', {
    name: 'Tải Markdown',
    exact: true,
  });
  await expect(markdown).toBeVisible();
  const exported = await context.request.get(
    (await markdown.getAttribute('href'))!,
  );
  expect(exported.status()).toBe(200);
  expect(exported.headers()['content-type']).toContain('text/markdown');
  expect(await exported.text()).toContain(question);
  const response = await context.request.get(
    `/api/v1/project-chat/projects/${fixture.projectId}/ai/conversations/${conversationId}`,
    { headers: { 'X-Chat-Actor': fixture.users.sender!.id } },
  );
  expect(response.ok()).toBeTruthy();
  expect(
    (await response.json()).answers.some(
      (row: { question: string }) => row.question === question,
    ),
  ).toBe(true);
});

test('E03 saves the user question and original attachment before full indexing and keeps both after reload', async ({
  page,
  context,
}) => {
  const observed: { path: string; status: number; question?: string }[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/'))
      observed.push({
        path: url.pathname,
        status: response.status(),
        ...(url.pathname.endsWith('/answers') &&
        response.request().method() === 'POST'
          ? { question: response.request().postDataJSON().question }
          : {}),
      });
  });
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  let releaseIndex!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseIndex = resolve;
  });
  await page.route('**/ai/index', async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await open(page, fixture.projectId);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'E03-order.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('E03 bounded attachment order evidence'),
    });
    const question = 'E03 save before index ' + randomUUID();
    await page
      .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
      .fill(question);
    await expect(
      page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true }),
    ).toHaveValue(question);
    const started = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/ai\/answers\/[^/]+\/run$/.test(new URL(response.url()).pathname),
      { timeout: 10000 },
    );
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect
      .poll(
        () =>
          db.chatAiAnswer.count({
            where: { projectId: fixture.projectId, question },
          }),
        { timeout: 5000 },
      )
      .toBe(1);
    await expect(page.locator('.ai-user-attachments')).toContainText(
      'E03-order.txt',
    );
    await expect(
      page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true }),
    ).toHaveValue('');
    expect((await started).status()).toBe(201);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: question, exact: true }),
    ).toBeVisible();
    await expect(page.locator('.ai-user-attachments')).toContainText(
      'E03-order.txt',
    );
    expect(
      await db.chatAiAnswer.count({
        where: { projectId: fixture.projectId, question },
      }),
    ).toBe(1);
  } catch (error) {
    console.log(
      JSON.stringify({
        e03OrderDiagnostic: observed,
        alerts: await page.getByRole('alert').allTextContents(),
        chips: await page.locator('.ai-file-chips').allTextContents(),
        draft: await page
          .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
          .inputValue(),
      }),
    );
    throw error;
  } finally {
    releaseIndex();
  }
});

for (const resolution of ['retry', 'retry-legacy', 'discard'])
  test(`E03 keeps an unacknowledged question and attachment across reload (${resolution})`, async ({
    page,
    context,
  }) => {
    const cookie = fixture.users.sender!.cookie,
      separator = cookie.indexOf('=');
    await context.addCookies([
      {
        name: cookie.slice(0, separator),
        value: cookie.slice(separator + 1),
        url: process.env.APP_PUBLIC_ORIGIN!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await open(page, fixture.projectId);
    await page.getByLabel('Tải tệp từ máy', { exact: true }).setInputFiles({
      name: 'E03-retry.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('E03 retry original'),
    });
    await expect(page.locator('.ai-file-chips')).toContainText('Đã tải lên');
    const question = 'E03 pending receipt ' + randomUUID();
    const editor = page.getByRole('textbox', {
      name: 'Câu hỏi AI',
      exact: true,
    });
    await editor.fill(question);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first:
      | { clientKey: string; sourceIds: string[]; runMode?: string }
      | undefined;
    await page.route('**/ai/conversations/*/answers', async (route) => {
      if (route.request().method() !== 'POST' || first) return route.continue();
      first = route.request().postDataJSON();
      if (resolution === 'retry-legacy') delete first!.runMode;
      const response = await route.fetch({ postData: JSON.stringify(first) });
      await held;
      await route.fulfill({ response }).catch(() => {});
    });
    try {
      await page.getByRole('button', { name: 'Gửi', exact: true }).click();
      await expect
        .poll(() =>
          db.chatAiAnswer.count({
            where: { projectId: fixture.projectId, question },
          }),
        )
        .toBe(1);
      await expect(editor).toHaveValue(question);
      if (resolution === 'retry-legacy')
        await page.evaluate((clientKey) => {
          for (const key of Object.keys(sessionStorage)) {
            try {
              const value = JSON.parse(sessionStorage.getItem(key)!);
              if (value?.request?.clientKey === clientKey) {
                delete value.request.runMode;
                sessionStorage.setItem(key, JSON.stringify(value));
              }
            } catch {
              /* Only the matching pending draft is changed. */
            }
          }
        }, first!.clientKey);
      await page.reload();
      await expect(editor).toHaveValue(question);
      await expect(page.locator('.ai-file-chips')).toContainText(
        'E03-retry.txt',
      );
      await expect(
        page.getByRole('button', { name: 'Thử lại lượt đã chốt', exact: true }),
      ).toBeVisible();
      release();
      if (resolution === 'discard') {
        await page
          .getByRole('button', {
            name: 'Tạo lượt mới theo lựa chọn hiện tại',
            exact: true,
          })
          .click();
        await page.reload();
        await expect(editor).toHaveValue(question);
        await expect(page.locator('.ai-file-chips')).toContainText(
          'E03-retry.txt',
        );
        await expect(
          page.getByRole('button', {
            name: 'Thử lại lượt đã chốt',
            exact: true,
          }),
        ).toHaveCount(0);
        expect(
          await db.chatAiAnswer.count({
            where: { projectId: fixture.projectId, question },
          }),
        ).toBe(1);
        return;
      }
      const retried = page.waitForRequest(
        (r) =>
          r.method() === 'POST' &&
          /\/ai\/conversations\/[^/]+\/answers$/.test(
            new URL(r.url()).pathname,
          ),
      );
      await page
        .getByRole('button', { name: 'Thử lại lượt đã chốt', exact: true })
        .click();
      const retryBody = (await retried).postDataJSON();
      expect(retryBody.runMode).toBe(first!.runMode);
      expect(retryBody).toMatchObject({
        clientKey: first!.clientKey,
        sourceIds: first!.sourceIds,
        question,
      });
      await expect(page.locator('.ai-user-attachments')).toContainText(
        'E03-retry.txt',
      );
      await expect(editor).toHaveValue('');
      expect(
        await db.chatAiAnswer.count({
          where: { projectId: fixture.projectId, question },
        }),
      ).toBe(1);
    } finally {
      release();
    }
  });

test('E03 blocks text-only send after reload while the selected upload is unfinished', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await open(page, fixture.projectId);
  let release!: () => void, received!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const uploaded = new Promise<void>((resolve) => {
    received = resolve;
  });
  let partSeen = false;
  await page.route('**/uploads/*/parts?*', async (route) => {
    if (partSeen) return route.continue();
    partSeen = true;
    const response = await route.fetch();
    received();
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  const filename = 'E03-pending-' + randomUUID() + '.csv';
  const file = {
    name: filename,
    mimeType: 'text/csv',
    buffer: Buffer.from('0007392,275001.10,VND\n'),
  };
  const question = 'E03 selected pending upload ' + randomUUID();
  const editor = page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true });
  try {
    await editor.fill(question);
    await page
      .getByLabel('Tải tệp từ máy', { exact: true })
      .setInputFiles(file);
    await uploaded;
    await page.reload();
    await expect(editor).toHaveValue(question);
    await expect(page.locator('.ai-file-chips')).toContainText(filename);
    await expect(
      page.getByRole('button', { name: 'Gửi', exact: true }),
    ).toBeDisabled();
    expect(
      await db.chatAiAnswer.count({
        where: { projectId: fixture.projectId, question },
      }),
    ).toBe(0);
    release();
    await page
      .getByRole('button', { name: 'Chọn lại tệp để tiếp tục', exact: true })
      .click();
    await page
      .getByLabel('Tải tệp từ máy', { exact: true })
      .setInputFiles(file);
    await expect(page.locator('.ai-file-chips')).toContainText('Đã tải lên');
    await expect(
      page.getByRole('button', { name: 'Gửi', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(page.locator('.ai-user-attachments')).toContainText(filename);
    expect(
      await db.uploadSession.count({
        where: { projectId: fixture.projectId, originalFilename: filename },
      }),
    ).toBe(1);
    expect(
      await db.chatAiAnswer.count({
        where: { projectId: fixture.projectId, question },
      }),
    ).toBe(1);
  } finally {
    release();
  }
});

test('E03 preserves the question after rejecting an empty file and reloading', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await open(page, fixture.projectId);
  const editor = page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true });
  const question = 'E03 valid draft ' + randomUUID();
  await editor.fill(question);
  await page.getByLabel('Tải tệp từ máy', { exact: true }).setInputFiles({
    name: 'Empty.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(0),
  });
  await expect(
    page.getByRole('alert').filter({ hasText: 'Tệp phải có dữ liệu.' }),
  ).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue(question);
  await expect(page.locator('.ai-file-chips')).toHaveCount(0);
});

for (const scenario of ['late detail', 'tab visibility'])
  test(`P1 memory: preserves a new draft across ${scenario}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    const cookie = fixture.users.sender!.cookie,
      separator = cookie.indexOf('=');
    await context.addCookies([
      {
        name: cookie.slice(0, separator),
        value: cookie.slice(separator + 1),
        url: process.env.APP_PUBLIC_ORIGIN!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await open(page, fixture.projectId);
    await page
      .getByRole('button', { name: 'Bộ nhớ dự án', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Bộ nhớ dự án',
      exact: true,
    });
    const original = 'Draft-original-' + randomUUID(),
      draft = 'Draft-new-' + randomUUID();
    await dialog.getByRole('button', { name: '＋ Ghi chú riêng mới' }).click();
    await dialog
      .getByRole('textbox', { name: 'Nội dung ghi chú' })
      .fill(original);
    await dialog
      .getByRole('button', { name: 'Lưu riêng', exact: true })
      .click();
    const originalCard = dialog.getByRole('button', {
      name: new RegExp('^' + original),
    });
    await expect(originalCard).toBeEnabled();
    const stored = await db.chatAiMemory.findFirstOrThrow({
      where: {
        projectId: fixture.projectId,
        revisions: { some: { content: original } },
      },
    });
    const pattern = new RegExp(
      `/projects/${fixture.projectId}/ai/memory/${stored.id}$`,
    );
    let release!: () => void, fetched!: () => void;
    const hold = new Promise<void>((r) => {
        release = r;
      }),
      ready = new Promise<void>((r) => {
        fetched = r;
      });
    if (scenario === 'late detail')
      await page.route(pattern, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        fetched();
        await hold;
        await route.fulfill({ response });
      });
    try {
      if (scenario === 'late detail') {
        await originalCard.click();
        await ready;
      }
      await dialog
        .getByRole('button', { name: '＋ Ghi chú riêng mới' })
        .click();
      await dialog
        .getByRole('textbox', { name: 'Nội dung ghi chú' })
        .fill(draft);
      if (scenario === 'late detail') {
        const delivered = page.waitForResponse(
          (r) => r.request().method() === 'GET' && pattern.test(r.url()),
        );
        release();
        await delivered;
        await page.unroute(pattern);
      } else {
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
          });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
          });
          document.dispatchEvent(new Event('visibilitychange'));
        });
      }
      await expect(
        dialog.getByRole('textbox', { name: 'Nội dung ghi chú' }),
      ).toHaveValue(draft);
      const saved = page.waitForResponse(
        (r) =>
          ['POST', 'PATCH'].includes(r.request().method()) &&
          r.url().includes('/ai/memory'),
      );
      await dialog
        .getByRole('button', { name: 'Lưu riêng', exact: true })
        .click();
      const result = await saved;
      expect(result.request().method()).toBe('POST');
      expect(result.status()).toBe(201);
      expect(
        (
          await db.chatAiMemoryRevision.findFirstOrThrow({
            where: { memoryId: stored.id, version: 1 },
          })
        ).content,
      ).toBe(original);
      expect(
        await db.chatAiMemory.count({
          where: {
            projectId: fixture.projectId,
            revisions: { some: { content: draft } },
          },
        }),
      ).toBe(1);
    } finally {
      release();
      await page.unroute(pattern);
    }
  });

test('P1 memory: private ack, explicit publication, conflict, revisions, inactive, mobile and two Projects', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await open(page, fixture.projectId);
  const dialog = page.getByRole('dialog', {
    name: 'Bộ nhớ dự án',
    exact: true,
  });
  const manager = dialog.getByRole('region', { name: 'Quản lý bộ nhớ dự án' });
  await page.getByRole('button', { name: 'Bộ nhớ dự án', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(
    manager.getByRole('button', { name: 'Riêng của tôi', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const posts: { visibility: string }[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/ai/memory')
    )
      posts.push(request.postDataJSON());
  });
  const sentinel = 'Memory-A-' + randomUUID();
  await manager.getByRole('button', { name: '＋ Ghi chú riêng mới' }).click();
  await manager
    .getByRole('textbox', { name: 'Nội dung ghi chú' })
    .fill(sentinel);
  let release!: () => void, committed!: () => void;
  const held = new Promise<void>((r) => {
      release = r;
    }),
    persisted = new Promise<void>((r) => {
      committed = r;
    });
  const routePattern = new RegExp(`/projects/${fixture.projectId}/ai/memory$`);
  await page.route(routePattern, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    committed();
    await held;
    await route.fulfill({ response });
  });
  try {
    await manager
      .getByRole('button', { name: 'Lưu riêng', exact: true })
      .click();
    await persisted;
    await expect(
      manager.getByRole('button', { name: new RegExp('^' + sentinel) }),
    ).toHaveCount(0);
  } finally {
    release();
  }
  await expect(
    manager.getByText('Đã lưu ghi chú.', { exact: true }),
  ).toBeVisible();
  await page.unroute(routePattern);
  expect(posts.filter((p) => p.visibility === 'SHARED')).toHaveLength(0);
  await manager
    .getByRole('button', { name: new RegExp('^' + sentinel) })
    .click();
  await manager
    .getByRole('button', { name: 'Xem trước công bố dùng chung', exact: true })
    .click();
  await expect(
    manager.getByRole('complementary', { name: 'Xem trước công bố' }),
  ).toBeVisible();
  expect(posts.filter((p) => p.visibility === 'SHARED')).toHaveLength(0);
  await manager.getByRole('button', { name: 'Công bố', exact: true }).click();
  await expect(
    manager.getByText('Đã công bố ghi chú dùng chung theo quyền nguồn.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(posts.filter((p) => p.visibility === 'SHARED')).toHaveLength(1);
  await manager
    .getByRole('button', { name: 'Sửa ghi chú', exact: true })
    .click();
  await manager
    .getByRole('textbox', { name: 'Nội dung ghi chú' })
    .fill(sentinel + ' shared updated');
  await manager
    .getByRole('button', { name: /^(?:Lưu|Xem trước) thay đổi dùng chung$/ })
    .click();
  await expect(
    manager.getByRole('complementary', { name: 'Xem trước công bố' }),
  ).toBeVisible();
  await manager.getByRole('button', { name: 'Công bố', exact: true }).click();
  await expect(
    manager.getByText('Đã công bố ghi chú dùng chung theo quyền nguồn.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await db.chatAiMemory.count({
      where: {
        projectId: fixture.projectId,
        visibility: 'SHARED',
        revisions: { some: { content: sentinel } },
      },
    }),
  ).toBe(1);
  const stored = await db.chatAiMemory.findFirstOrThrow({
    where: {
      projectId: fixture.projectId,
      ownerId: fixture.users.sender!.id,
      visibility: 'PRIVATE',
      revisions: { some: { content: sentinel } },
    },
  });
  expect(
    await db.chatAiMemory.count({
      where: {
        projectId: fixture.projectId,
        visibility: 'SHARED',
        revisions: { some: { content: sentinel } },
      },
    }),
  ).toBe(1);
  await manager
    .getByRole('button', { name: new RegExp('^' + sentinel) })
    .click();
  await manager
    .getByRole('button', { name: 'Sửa ghi chú', exact: true })
    .click();
  const draft = sentinel + ' draft';
  await manager.getByRole('textbox', { name: 'Nội dung ghi chú' }).fill(draft);
  const external = await context.request.patch(
    `/api/v1/project-chat/projects/${fixture.projectId}/ai/memory/${stored.id}`,
    {
      headers: {
        'X-Chat-Actor': fixture.users.sender!.id,
        Origin: process.env.APP_PUBLIC_ORIGIN!,
      },
      data: {
        clientKey: randomUUID(),
        expectedVersion: 1,
        content: sentinel + ' external',
        category: 'NOTE',
        verification: 'UNVERIFIED',
      },
    },
  );
  expect(external.status()).toBe(200);
  await manager.getByRole('button', { name: 'Lưu riêng', exact: true }).click();
  await expect(manager.getByRole('alert')).toContainText('Bản nháp vẫn giữ');
  await expect(
    manager.getByRole('textbox', { name: 'Nội dung ghi chú' }),
  ).toHaveValue(draft);
  await manager
    .getByRole('button', { name: 'Tải bản mới, giữ bản nháp' })
    .click();
  await expect(
    manager.getByRole('textbox', { name: 'Nội dung ghi chú' }),
  ).toHaveValue(draft);
  await expect
    .poll(
      async () =>
        (await db.chatAiMemory.findUniqueOrThrow({ where: { id: stored.id } }))
          .currentVersion,
    )
    .toBe(2);
  await manager.getByRole('button', { name: 'Lưu riêng', exact: true }).click();
  await expect(
    manager.getByText('Đã lưu ghi chú.', { exact: true }),
  ).toBeVisible();
  await manager
    .getByRole('button', { name: 'Lịch sử phiên bản', exact: true })
    .click();
  await expect(
    manager.getByRole('region', { name: 'Các phiên bản ghi chú' }),
  ).toContainText('Bản 3');
  await expect(
    manager.getByRole('region', { name: 'Các phiên bản ghi chú' }),
  ).toContainText(sentinel + ' external');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await manager
    .getByRole('button', { name: 'Vô hiệu hóa ghi chú', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await manager
    .getByRole('button', { name: 'Xác nhận vô hiệu hóa', exact: true })
    .click();
  await expect(
    manager.getByText(
      'Đã vô hiệu hóa. Lịch sử phiên bản và audit vẫn được giữ.',
    ),
  ).toBeVisible();
  expect(
    (await db.chatAiMemory.findUniqueOrThrow({ where: { id: stored.id } }))
      .inactiveAt,
  ).not.toBeNull();
  expect(
    await db.chatAiMemoryRevision.count({ where: { memoryId: stored.id } }),
  ).toBe(3);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  const tabB = await context.newPage();
  try {
    await open(tabB, projectB);
    await tabB
      .getByRole('button', { name: 'Bộ nhớ dự án', exact: true })
      .click();
    const b = tabB.getByRole('dialog', { name: 'Bộ nhớ dự án', exact: true });
    await expect(b.getByText(sentinel, { exact: true })).toHaveCount(0);
    await b.getByRole('button', { name: '＋ Ghi chú riêng mới' }).click();
    await b
      .getByRole('textbox', { name: 'Nội dung ghi chú' })
      .fill('Memory-B-' + randomUUID());
    await b.getByRole('button', { name: 'Lưu riêng', exact: true }).click();
    await expect(b.getByText('Đã lưu ghi chú.', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Đóng', exact: true }).click();
    await tabB.reload();
    await tabB
      .getByRole('button', { name: 'Bộ nhớ dự án', exact: true })
      .click();
    await expect(b.getByText(sentinel, { exact: true })).toHaveCount(0);
    await expect(b.getByRole('button', { name: /^Memory-B-/ })).toHaveCount(1);
  } finally {
    await tabB.close();
  }
});
test.afterAll(async () => {
  if (organizationId)
    await db.systemSetting.deleteMany({
      where: { key: 'chatgpt.connection.' + organizationId },
    });
  await db.$disconnect();
});

for (const pinOnly of [false, true])
  test(`E03 keeps the authorized model and draft while history or source verification fails, then retries (pinOnly=${pinOnly})`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: fixture.users.sender!.cookie.split('=')[0]!,
        value: fixture.users.sender!.cookie.slice(
          fixture.users.sender!.cookie.indexOf('=') + 1,
        ),
        url: process.env.APP_PUBLIC_ORIGIN!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const prefix = `/api/v1/project-chat/projects/${fixture.projectId}/ai`;
    const conversation = await context.request.post(prefix + '/conversations', {
      headers: {
        'X-Chat-Actor': fixture.users.sender!.id,
        Origin: process.env.APP_PUBLIC_ORIGIN!,
      },
      data: { scope: 'ALL', clientKey: randomUUID() },
    });
    expect(conversation.status()).toBe(201);
    const id = (await conversation.json()).id;
    const sourceId = randomUUID();
    const key = `galaxy-ai-draft:${fixture.users.sender!.id}:${JSON.stringify([fixture.projectId, 'ALL', null, null, null, null])}`;
    await page.addInitScript(
      ({ key, id, sourceId, pinOnly, clientKey, conversationKey }) =>
        sessionStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            conversationId: id,
            question: 'Retained verification draft',
            sourceIds: pinOnly ? [] : [sourceId],
            ...(pinOnly
              ? {
                  request: {
                    conversationKey,
                    clientKey,
                    conversationId: id,
                    question: 'Retained verification draft',
                    scope: 'ALL',
                    model: 'p1-account-model',
                    reasoning: 'default',
                    searchMode: 'PROJECT_ONLY',
                    sourceIds: [sourceId],
                  },
                }
              : {}),
          }),
        ),
      {
        key,
        id,
        sourceId,
        pinOnly,
        clientKey: randomUUID(),
        conversationKey: randomUUID(),
      },
    );
    let historyReady = pinOnly,
      indexReady = false,
      indexReads = 0,
      writes = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.startsWith(prefix)
      )
        writes++;
    });
    await page.route('**' + prefix + '/conversations/' + id, (route) =>
      historyReady
        ? route.continue()
        : route.fulfill({
            status: 500,
            json: { message: 'Synthetic history unavailable' },
          }),
    );
    await page.route('**' + prefix + '/index?*', (route) => {
      indexReads++;
      return route.fulfill(
        indexReady
          ? {
              status: 200,
              json: {
                sources: [
                  {
                    id: sourceId,
                    label: 'Synthetic selected source',
                    status: 'READY',
                  },
                ],
              },
            }
          : { status: 500, json: { message: 'Synthetic index unavailable' } },
      );
    });
    await page.goto(`/projects/${fixture.projectId}/ai?ai=${id}`);
    const model = page.getByRole('combobox', { name: 'Model AI', exact: true });
    const editor = page.getByRole('textbox', {
      name: 'Câu hỏi AI',
      exact: true,
    });
    const send = page.getByRole('button', {
      name: pinOnly ? 'Thử lại lượt đã chốt' : 'Gửi',
      exact: true,
    });
    await expect(model).toHaveValue('p1-account-model');
    await expect(editor).toHaveValue('Retained verification draft');
    expect(indexReads).toBeGreaterThan(0);
    await expect(send).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Đính kèm tệp', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel('Tải tệp từ máy', { exact: true }),
    ).toBeDisabled();
    historyReady = true;
    const previousReads = indexReads;
    await expect.poll(() => indexReads).toBeGreaterThan(previousReads);
    await expect(send).toBeDisabled();
    expect(writes).toBe(0);
    indexReady = true;
    await expect(send).toBeEnabled();
    await expect(editor).toHaveValue('Retained verification draft');
    await expect(
      page.getByRole('button', { name: 'Đính kèm tệp', exact: true }),
    ).toBeEnabled();
  });

test('E03 retries lightweight conversation metadata and clears the old error', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    split = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const prefix = `/api/v1/project-chat/projects/${fixture.projectId}/ai`;
  const created = await context.request.post(prefix + '/conversations', {
    headers: {
      'X-Chat-Actor': fixture.users.sender!.id,
      Origin: process.env.APP_PUBLIC_ORIGIN!,
    },
    data: { scope: 'ALL', clientKey: randomUUID() },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id;
  let metadataReads = 0,
    metadataReady = false;
  await page.route(
    '**' + prefix + '/conversations/' + id + '/metadata',
    (route) => {
      metadataReads++;
      return !metadataReady
        ? route.fulfill({
            status: 500,
            json: { message: 'Synthetic metadata unavailable' },
          })
        : route.continue();
    },
  );
  await page.route('**' + prefix + '/conversations/' + id, (route) =>
    route.fulfill({
      status: 500,
      json: { message: 'Synthetic history unavailable' },
    }),
  );
  await page.goto(`/projects/${fixture.projectId}/ai?ai=${id}`);
  const retry = page.getByRole('button', {
    name: 'Thử tải lại hội thoại',
    exact: true,
  });
  await expect(retry).toBeVisible();
  const failedReads = metadataReads;
  metadataReady = true;
  await retry.click();
  await expect(
    page.getByRole('combobox', { name: 'Model AI', exact: true }),
  ).toHaveValue('p1-account-model');
  await expect(
    page.getByText('Không mở được hội thoại hoặc quyền đã thay đổi.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Gửi', exact: true }),
  ).toBeDisabled();
  expect(metadataReads).toBeGreaterThan(failedReads);
});

for (const failures of [
  { catalog: 500, history: 403, index: 500 },
  { catalog: 200, history: 500, index: 403 },
])
  test(`E03 prioritizes revocation over unrelated errors ${JSON.stringify(failures)}`, async ({
    page,
    context,
  }) => {
    const cookie = fixture.users.sender!.cookie,
      split = cookie.indexOf('=');
    await context.addCookies([
      {
        name: cookie.slice(0, split),
        value: cookie.slice(split + 1),
        url: process.env.APP_PUBLIC_ORIGIN!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const prefix = `/api/v1/project-chat/projects/${fixture.projectId}/ai`,
      id = randomUUID();
    const key = `galaxy-ai-draft:${fixture.users.sender!.id}:${JSON.stringify([fixture.projectId, 'ALL', null, null, null, null])}`;
    await page.addInitScript(
      ({ key, id }) =>
        sessionStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            conversationId: id,
            question: 'Synthetic draft requiring revoked access',
            sourceIds: [id],
          }),
        ),
      { key, id },
    );
    await page.route('**' + prefix, (route) =>
      failures.catalog === 200
        ? route.continue()
        : route.fulfill({
            status: failures.catalog,
            json: { message: 'Synthetic catalog failure' },
          }),
    );
    await page.route('**' + prefix + '/conversations/' + id, (route) =>
      route.fulfill({
        status: failures.history,
        json: { message: 'Synthetic history failure' },
      }),
    );
    await page.route('**' + prefix + '/index?*', (route) =>
      route.fulfill({
        status: failures.index,
        json: { message: 'Synthetic index failure' },
      }),
    );
    await page.goto(`/projects/${fixture.projectId}/ai`);
    await expect(
      page
        .getByText(
          'Quyền AI đã thay đổi. Tải lại để kiểm tra quyền hiện tại.',
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Model AI', exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate((key) => sessionStorage.getItem(key), key),
    ).toBeNull();
  });

async function open(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/ai`);
  await expect(
    page.getByRole('combobox', { name: 'Model AI', exact: true }),
  ).toHaveValue('p1-account-model');
  await expect(
    page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel('Tải tệp từ máy', { exact: true }),
  ).toBeEnabled();
}
async function send(page: Page, projectId: string, question: string) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.startsWith(
        `/api/v1/project-chat/projects/${projectId}/ai/answers/`,
      ) &&
      r.url().endsWith('/run'),
  );
  await page
    .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
    .fill(question);
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(201);
  let body = await result.json();
  if (body.runId) {
    const runId = body.runId;
    expect(runId).toBe(body.id);
    expect(['QUEUED', 'RUNNING', 'COMPLETED']).toContain(body.status);
    const saved = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(saved.projectId).toBe(projectId);
    expect(saved.ownerId).toBe(fixture.users.sender!.id);
    expect(saved.question).toBe(question);
    await expect
      .poll(
        async () => {
          const history = await page.request.get(
            `/api/v1/project-chat/projects/${projectId}/ai/conversations/${saved.conversationId}`,
            { headers: { 'X-Chat-Actor': fixture.users.sender!.id } },
          );
          expect(history.status()).toBe(200);
          body = (await history.json()).answers.find(
            (answer: { id: string }) => answer.id === runId,
          );
          return body?.status;
        },
        { timeout: 60000, intervals: [500, 1000, 2000] },
      )
      .toBe('COMPLETED');
  }
  expect(body).toMatchObject({
    status: 'COMPLETED',
    model: 'p1-account-model',
  });
  return body;
}
test('P1 memory: stale source stays manageable and a delayed A write cannot enter B', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const owner = fixture.users.sender!.id;
  const task = await db.task.create({
    data: {
      organizationId,
      projectId: fixture.projectId,
      title: 'Memory source fixture',
      createdBy: owner,
      updatedBy: owner,
    },
  });
  const sentinel = 'Memory-source-' + randomUUID();
  const created = await context.request.post(
    `/api/v1/project-chat/projects/${fixture.projectId}/ai/memory`,
    {
      headers: {
        'X-Chat-Actor': owner,
        Origin: process.env.APP_PUBLIC_ORIGIN!,
      },
      data: {
        clientKey: randomUUID(),
        visibility: 'PRIVATE',
        category: 'NOTE',
        verification: 'UNVERIFIED',
        content: sentinel,
        sourceRefs: [{ kind: 'TASK', id: task.id, version: '1', locator: {} }],
      },
    },
  );
  expect(created.status()).toBe(201);
  await db.task.update({ where: { id: task.id }, data: { version: 2 } });
  await open(page, fixture.projectId);
  await page.getByRole('button', { name: 'Bộ nhớ dự án', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Bộ nhớ dự án',
    exact: true,
  });
  await expect(dialog.getByText(sentinel, { exact: true })).toHaveCount(0);
  await dialog
    .getByRole('button', { name: /^Nguồn không còn khả dụng/ })
    .click();
  await expect(
    dialog.getByRole('region', { name: 'Chi tiết ghi chú' }),
  ).not.toContainText(task.id);
  await dialog
    .getByRole('button', { name: 'Vô hiệu hóa ghi chú', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Xác nhận vô hiệu hóa', exact: true })
    .click();
  await expect(
    dialog.getByText(
      'Đã vô hiệu hóa. Lịch sử phiên bản và audit vẫn được giữ.',
    ),
  ).toBeVisible();
  await dialog.getByRole('button', { name: '＋ Ghi chú riêng mới' }).click();
  const late = 'Memory-late-A-' + randomUUID();
  await dialog.getByRole('textbox', { name: 'Nội dung ghi chú' }).fill(late);
  let release!: () => void,
    persisted!: () => void,
    finished!: () => void,
    count = 0;
  const held = new Promise<void>((r) => (release = r)),
    committed = new Promise<void>((r) => (persisted = r)),
    done = new Promise<void>((r) => (finished = r));
  const pattern = new RegExp(`/projects/${fixture.projectId}/ai/memory$`);
  await page.route(pattern, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    ++count;
    const response = await route.fetch();
    persisted();
    await held;
    try {
      await route.fulfill({ response });
    } catch {
    } finally {
      finished();
    }
  });
  try {
    await dialog
      .getByRole('form', { name: 'Soạn ghi chú' })
      .evaluate((form) => {
        (form as HTMLFormElement).requestSubmit();
        (form as HTMLFormElement).requestSubmit();
      });
    await committed;
    expect(count).toBe(1);
    await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page
      .getByRole('complementary', { name: 'Chọn dự án cho AI' })
      .locator(`a[href="/projects/${projectB}/ai"]`)
      .click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectB}/ai`));
    await page
      .getByRole('button', { name: 'Bộ nhớ dự án', exact: true })
      .click();
    release();
    await done;
    await expect(dialog.getByText(late, { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(sentinel, { exact: true })).toHaveCount(0);
    await expect(
      dialog.getByText('Đã lưu ghi chú.', { exact: true }),
    ).toHaveCount(0);
    expect(
      await db.chatAiMemory.count({
        where: {
          projectId: fixture.projectId,
          revisions: { some: { content: late } },
        },
      }),
    ).toBe(1);
    expect(
      await db.chatAiMemory.count({
        where: { projectId: projectB, revisions: { some: { content: late } } },
      }),
    ).toBe(0);
  } finally {
    release();
    await page.unroute(pattern);
  }
});

test('FIXTURE: exact catalog/model, two Projects/tabs/reload and delayed A stay scoped', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      secure: process.env.APP_PUBLIC_ORIGIN!.startsWith('https:'),
      sameSite: 'Lax',
    },
  ]);
  const requests: {
    projectId: string;
    conversationId: string;
    model: string;
  }[] = [];
  page.on('request', (r) => {
    const match =
      /\/project-chat\/projects\/([^/]+)\/ai\/conversations\/([^/]+)\/answers$/.exec(
        new URL(r.url()).pathname,
      );
    if (r.method() === 'POST' && match)
      requests.push({
        projectId: match[1]!,
        conversationId: match[2]!,
        model: r.postDataJSON().model,
      });
  });
  await open(page, fixture.projectId);
  await send(page, fixture.projectId, 'P1 browser A');
  await page.reload();
  await expect(page.getByText('sentinel-A', { exact: true })).toBeVisible();
  const tabB = await context.newPage();
  try {
    await open(tabB, projectB);
    expect(await db.chatRoom.count({ where: { projectId: projectB } })).toBe(0);
    await send(tabB, projectB, 'P1 browser B');
    await expect(tabB.getByText('sentinel-A', { exact: true })).toHaveCount(0);
    await expect(page.getByText('sentinel-B', { exact: true })).toHaveCount(0);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let runs = 0;
    await page.route(
      new RegExp(`/projects/${fixture.projectId}/ai/answers/[^/]+/run$`),
      async (route) => {
        runs++;
        const response = await route.fetch();
        await held;
        await route.fulfill({ response });
      },
    );
    await page.evaluate(() => {
      document.documentElement.dataset.p1Document = 'same-document';
    });
    await page
      .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
      .fill('P1 browser slow-A');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => runs).toBe(1);
    try {
      await page
        .getByRole('complementary', { name: 'Chọn dự án cho AI' })
        .getByRole('link', { name: 'P1 PLANNING no room', exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/projects/${projectB}/ai`));
      expect(
        await page.evaluate(() => document.documentElement.dataset.p1Document),
      ).toBe('same-document');
      const input = page.getByRole('textbox', {
        name: 'Câu hỏi AI',
        exact: true,
      });
      await input.fill('Nháp riêng Project B');
      const delivered = page.waitForResponse(
        new RegExp(`/projects/${fixture.projectId}/ai/answers/[^/]+/run$`),
      );
      release();
      await delivered;
      await expect(input).toHaveValue('Nháp riêng Project B');
      await expect(page.getByText('sentinel-A', { exact: true })).toHaveCount(
        0,
      );
      expect(runs).toBe(1);
    } finally {
      release();
    }
    await page.unroute(
      new RegExp(`/projects/${fixture.projectId}/ai/answers/[^/]+/run$`),
    );
    await page.reload();
    await expect(page.getByText('sentinel-A', { exact: true })).toHaveCount(0);
    await page
      .getByRole('complementary', { name: 'Chọn dự án cho AI' })
      .locator(`a[href="/projects/${fixture.projectId}/ai"]`)
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/projects/${fixture.projectId}/ai`),
    );
    await expect(page.getByText('sentinel-B', { exact: true })).toHaveCount(0);
    expect(requests.length).toBe(2);
    expect(
      requests.every(
        (r) =>
          r.projectId === fixture.projectId && r.model === 'p1-account-model',
      ),
    ).toBe(true);
    expect(new Set(requests.map((r) => r.conversationId)).size).toBe(1);
  } finally {
    await tabB.close();
  }
});

test('E02: Workspace OFF keeps SIWC and a working Create draft action after reload', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  let workspaceRequests = 0;
  await page.route(
    '**/api/v1/project-chat/projects/*/ai/workspace-models',
    (route) => {
      workspaceRequests++;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'WORKSPACE_KEY_UNAVAILABLE' }),
      });
    },
  );
  for (let n = 0; n < 2; n++) {
    await open(page, fixture.projectId);
    await expect(page.getByRole('combobox', { name: 'Đường AI' })).toHaveCount(
      0,
    );
    const editor = page.getByRole('textbox', {
      name: 'Câu hỏi AI',
      exact: true,
    });
    await editor.fill('Synthetic optional catalog regression');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Tạo ảnh', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText(
        'Tạo ảnh chưa sẵn sàng: cần engine, model, workflow và tài nguyên được kiểm chứng.',
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Excel (XLSX)', exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true }),
    ).toHaveValue('Synthetic optional catalog regression');
    await expect(
      page.getByText('Đầu ra: XLSX', { exact: false }),
    ).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
      .fill('Synthetic optional catalog regression');
    await expect(
      page.getByRole('button', { name: 'Gửi', exact: true }),
    ).toBeEnabled();
    await page.reload();
  }
  expect(workspaceRequests).toBe(0);
  await page.goto('/settings/workspace-agents');
  await expect(page.getByRole('status')).toContainText(
    'WORKSPACE_DEFERRED_BY_USER',
  );
  await expect(page.getByRole('textbox', { name: 'Workspace ID' })).toHaveCount(
    0,
  );
});

test('E02 keeps the selected MAX effort after completion, follow-up and reload', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const key =
    'siwc.capabilities.' +
    organizationId +
    '.' +
    createHash('sha256').update('p1-account-model').digest('hex');
  const value = {
    generation: 'p1-browser-generation',
    model: 'p1-account-model',
    reasoningModes: ['default', 'max'],
    effortEvidence: { max: 'REQUEST_ACCEPTED' },
    webSearch: false,
    receipts: [],
    checkedAt: new Date().toISOString(),
  };
  await db.systemSetting.create({ data: { key, value } });
  try {
    await open(page, fixture.projectId);
    const effort = page.getByRole('combobox', {
      name: 'Mức suy luận',
      exact: true,
    });
    await effort.selectOption('max');
    await send(page, fixture.projectId, 'P1 browser A');
    await expect(page.getByText('sentinel-A', { exact: true })).toBeVisible();
    await expect(effort).toHaveValue('max');
    await page.reload();
    await expect(effort).toHaveValue('max');
    const request = page.waitForRequest(
      (r) =>
        r.method() === 'POST' &&
        /\/ai\/conversations\/[^/]+\/answers$/.test(new URL(r.url()).pathname),
    );
    const [sent] = await Promise.all([
      request,
      send(page, fixture.projectId, 'P1 browser B'),
    ]);
    expect(sent.postDataJSON()).toMatchObject({
      model: 'p1-account-model',
      reasoning: 'max',
    });
    await expect(page.getByText('sentinel-B', { exact: true })).toBeVisible();
    await expect(effort).toHaveValue('max');
  } finally {
    await db.systemSetting.delete({ where: { key } });
  }
});

test('E02 receives a completed run after the inference deadline without aborting transport', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.addInitScript(() => {
    const durations = new WeakMap<AbortSignal, number>();
    const timeout = AbortSignal.timeout.bind(AbortSignal),
      any = AbortSignal.any.bind(AbortSignal),
      fetchOriginal = window.fetch.bind(window);
    AbortSignal.timeout = (milliseconds) => {
      const signal = timeout(milliseconds);
      durations.set(signal, milliseconds);
      return signal;
    };
    AbortSignal.any = (signals) => {
      const combined = any(signals);
      for (const signal of signals) {
        const duration = durations.get(signal);
        if (duration !== undefined) durations.set(combined, duration);
      }
      return combined;
    };
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.origin,
      );
      if (!url.pathname.endsWith('/run')) return fetchOriginal(input, init);
      const milliseconds = init?.signal && durations.get(init.signal);
      if (!milliseconds) throw new Error('Run timeout was not tracked');
      // Scale the actual selected transport allowance, leaving admission and polling unchanged.
      const controller = new AbortController();
      const timer = setTimeout(
        () =>
          controller.abort(
            new DOMException('Scaled run timeout', 'TimeoutError'),
          ),
        milliseconds / 100,
      );
      try {
        return await fetchOriginal(input, {
          ...init,
          signal: any([init.signal!, controller.signal]),
        });
      } finally {
        clearTimeout(timer);
      }
    };
  });
  await open(page, fixture.projectId);
  let runs = 0;
  const failures: string[] = [];
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname.endsWith('/run'))
      failures.push(request.failure()?.errorText ?? 'failed');
  });
  await page.route('**/ai/answers/*/run', async (route) => {
    runs++;
    await new Promise((resolve) => setTimeout(resolve, 3050));
    try {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
    } catch (error) {
      if (!failures.length) throw error;
    }
  });
  await page.route('**/ai/conversations/*/answers', async (route) => {
    const body = route.request().postDataJSON();
    delete body.runMode;
    await route.continue({ postData: JSON.stringify(body) });
  });
  const editor = page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true });
  await editor.fill('E02 bounded run transport fixture');
  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/run'),
  );
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  expect((await completed).status()).toBe(201);
  await expect(editor).toHaveValue('');
  expect(runs).toBe(1);
  expect(failures).toEqual([]);
});

test('E02 uploads and reads a bounded XLSX range when the full derivative is too large', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const { Workbook } = createRequire(
    resolve(__dirname, '../../../api/package.json'),
  )('exceljs') as typeof import('../../../api/node_modules/exceljs');
  const workbook = new Workbook(),
    sheet = workbook.addWorksheet('Large');
  for (let row = 1; row <= 901; row++)
    sheet.getCell('A' + row).value = 'Synthetic ' + row + ' ' + 'x'.repeat(400);
  workbook.addWorksheet('Second').getCell('A1').value = '0007392';
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await open(page, fixture.projectId);
  const uploaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/ai\/conversations\/[^/]+\/files$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await page.getByLabel('Tải tệp từ máy', { exact: true }).setInputFiles({
    name: 'E02-bounded-range.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  const response = await uploaded;
  expect(response.status()).toBe(201);
  const sourceId = (await response.json()).id;
  await expect(
    page
      .locator('.ai-file-chips li')
      .filter({ hasText: 'E02-bounded-range.xlsx' }),
  ).toContainText('Đã tải lên');
  await page
    .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
    .fill('E02 browser range ' + sourceId);
  await page
    .getByRole('combobox', { name: 'Phạm vi tìm kiếm', exact: true })
    .selectOption('PROJECT_ONLY');
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  const answer = page.getByText(
    'Second!A1 is 0007392; only the selected range was read.',
    { exact: true },
  );
  await expect(answer).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(answer).toBeVisible();
  const stored = await db.chatAiAnswer.findFirstOrThrow({
    where: {
      projectId: fixture.projectId,
      question: 'E02 browser range ' + sourceId,
    },
  });
  expect(stored.status).toBe('COMPLETED');
  expect(stored.usage).toMatchObject({
    toolExecutions: expect.arrayContaining([
      expect.objectContaining({
        name: 'analyze_table',
        callId: 'browser-range',
        status: 'OK',
      }),
    ]),
  });
});

test('E02-5 resumes real chat parts after reload, downloads the original and explicitly promotes one draft', async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  expect(process.env.UPLOAD_PART_SIZE_BYTES).toBe('5242880');
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const buffer = Buffer.from('0007392,275001.10,VND\n'.repeat(600000));
  expect(buffer.length).toBeGreaterThan(10_485_760);
  const file = { name: 'E02-browser-resume.csv', mimeType: 'text/csv', buffer };
  const checksum = createHash('sha256').update(buffer).digest('hex');
  let releaseSecond!: () => void, sawSecond!: () => void;
  const waiting = new Promise<void>((resolve) => (releaseSecond = resolve)),
    second = new Promise<void>((resolve) => (sawSecond = resolve));
  let interrupted = false;
  const attemptedParts: number[] = [];
  await page.route('**/uploads/*/parts?*', async (route) => {
    const number = Number(
      new URL(route.request().url()).searchParams.get('partNumber'),
    );
    attemptedParts.push(number);
    if (number === 2 && !interrupted) {
      interrupted = true;
      sawSecond();
      await waiting;
      await route.abort('aborted');
    } else await route.continue();
  });
  await open(page, fixture.projectId);
  const initiation = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/uploads/initiate'),
  );
  await page.getByLabel('Tải tệp từ máy', { exact: true }).setInputFiles(file);
  const session = (await (await initiation).json()) as {
    id: string;
    partSize: number;
    aiConversationId: string;
  };
  expect(session.partSize).toBe(5_242_880);
  await second;
  await page.getByRole('button', { name: 'Tạm dừng tải', exact: true }).click();
  releaseSecond();
  await expect(page.locator('li').filter({ hasText: file.name })).toContainText(
    'Tạm dừng',
  );
  expect(
    (
      await db.uploadSession.findUniqueOrThrow({
        where: { id: session.id },
        include: { parts: true },
      })
    ).parts,
  ).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Chọn lại tệp để tiếp tục', exact: true }),
  ).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: 'Chọn lại tệp để tiếp tục', exact: true })
    .click();
  await (await chooser).setFiles(file);
  await expect(page.locator('li').filter({ hasText: file.name })).toContainText(
    'Đã tải lên',
    { timeout: 60000 },
  );
  const complete = await db.uploadSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { parts: true },
  });
  expect(complete.status).toBe('AVAILABLE');
  expect(complete.parts.map((part) => part.partNumber).sort()).toEqual([
    1, 2, 3,
  ]);
  expect(attemptedParts.filter((number) => number === 1)).toHaveLength(1);
  const source = await db.chatAiSourceIndex.findFirstOrThrow({
    where: {
      fileAssetId: complete.fileAssetId!,
      conversationId: session.aiConversationId,
    },
  });
  await page.reload();
  await page.getByRole('button', { name: 'Đính kèm tệp', exact: true }).click();
  await page
    .getByRole('button', { name: 'Chọn trong hồ sơ dự án', exact: true })
    .click();
  const sourceRow = page
    .getByLabel('Trạng thái nguồn')
    .locator('li')
    .filter({ hasText: file.name });
  const downloadUrl = await sourceRow
    .getByRole('link', { name: 'Tải bản gốc đúng phiên bản', exact: true })
    .getAttribute('href');
  const download = await page.request.get(downloadUrl!);
  expect(download.status()).toBe(200);
  expect(
    createHash('sha256')
      .update(await download.body())
      .digest('hex'),
  ).toBe(checksum);
  expect(
    (
      await page.request.get(
        `/api/v1/project-chat/projects/${projectB}/ai/files/${source.id}/download`,
      )
    ).status(),
  ).toBe(404);
  const owner = fixture.users.sender!.id;
  await db.projectMember.upsert({
    where: {
      projectId_userId: { projectId: fixture.projectId, userId: owner },
    },
    create: {
      organizationId,
      projectId: fixture.projectId,
      userId: owner,
      createdBy: owner,
    },
    update: {},
  });
  const target = await db.projectRequiredDocument.create({
    data: {
      organizationId,
      projectId: fixture.projectId,
      stageKey: 'STAGE_2',
      workstreamKey: 'PLANNING',
      documentType: 'E02_' + randomUUID(),
      documentName: 'E02 browser draft target',
      status: 'MISSING',
    },
  });
  await sourceRow
    .getByRole('button', { name: 'Đưa vào hồ sơ nháp', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Hồ sơ đích', exact: true })
    .selectOption(target.id);
  const promoted = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/files/${source.id}/promote`),
  );
  await page
    .getByRole('button', { name: 'Lưu nháp vào hồ sơ', exact: true })
    .click();
  const result = await (await promoted).json();
  expect(result.status).toBe('DRAFT');
  await expect(
    page
      .getByRole('region', { name: 'Đưa tệp vào hồ sơ nháp' })
      .getByRole('status'),
  ).toContainText('Đã lưu bản nháp v1; chưa phê duyệt.');
  expect(
    (
      await db.projectStageOneDocument.findUniqueOrThrow({
        where: { id: result.documentId },
        include: { versions: true },
      })
    ).versions,
  ).toHaveLength(1);
  expect(
    (
      await db.projectRequiredDocument.findUniqueOrThrow({
        where: { id: target.id },
      })
    ).approvedAt,
  ).toBeNull();
});

test('E02-5 removes a selection after completion without aborting or deleting the saved original', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await open(page, fixture.projectId);
  let release!: () => void, received!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve)),
    completed = new Promise<void>((resolve) => (received = resolve));
  let result: { sourceId: string; status: string } | undefined;
  await page.route('**/uploads/*/complete', async (route) => {
    const response = await route.fetch();
    result = await response.json();
    received();
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  const file = {
    name: 'E02-remove-completed.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('0007392,275001.10,VND\n'),
  };
  await page.getByLabel('Tải tệp từ máy', { exact: true }).setInputFiles(file);
  await completed;
  expect(result?.status).toBe('AVAILABLE');
  try {
    await page
      .getByRole('button', { name: `Bỏ ${file.name}`, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: `Bỏ ${file.name}`, exact: true }),
    ).toBeHidden();
  } finally {
    release();
  }
  const source = await db.chatAiSourceIndex.findUniqueOrThrow({
    where: { id: result!.sourceId },
    include: { file: true },
  });
  expect(source.file?.deletedAt).toBeNull();
  expect(
    (
      await db.uploadSession.findFirstOrThrow({
        where: { fileAssetId: source.fileAssetId },
      })
    ).status,
  ).toBe('AVAILABLE');
  const download = await page.request.get(
    `/api/v1/project-chat/projects/${fixture.projectId}/ai/files/${source.id}/download`,
  );
  expect(download.status()).toBe(200);
  expect(await download.body()).toEqual(file.buffer);
});

test('E03 Auto has no public-query gate and preserves an explicit Project-only preference', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/v1/project-chat/projects/*/ai', async (route) => {
    const response = await route.fetch(),
      data = await response.json();
    for (const model of data.models ?? [])
      model.capabilities.nativeWebSearch = true;
    await route.fulfill({ response, json: data });
  });
  await open(page, fixture.projectId);
  await page
    .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
    .fill('P1 browser A');
  const mode = page.getByRole('combobox', {
    name: 'Phạm vi tìm kiếm',
    exact: true,
  });
  await expect(mode).toHaveValue('AUTO');
  await expect(mode.locator('option[value="AUTO"]')).toHaveText(
    'Tự động — Web + dự án + tài liệu',
  );
  await expect(
    page.getByRole('textbox', { name: 'Truy vấn công khai', exact: true }),
  ).toHaveCount(0);
  await mode.selectOption('WEB');
  const query = page.getByRole('textbox', {
    name: 'Truy vấn công khai',
    exact: true,
  });
  await query.fill('Official SIWC preview limitations');
  const sendButton = page.getByRole('button', { name: 'Gửi', exact: true });
  await expect(sendButton).toBeDisabled();
  await page
    .getByRole('checkbox', {
      name: 'Cho phép công bố đúng truy vấn này',
      exact: true,
    })
    .check();
  await expect(sendButton).toBeEnabled();
  await page.getByRole('button', { name: 'Phiên AI mới', exact: true }).click();
  await expect(mode).toHaveValue('AUTO');
  await expect(query).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
    .fill('P1 browser A');
  await mode.selectOption('WEB');
  await query.fill('Official SIWC preview limitations');
  await expect(sendButton).toBeDisabled();
  await page
    .getByRole('checkbox', {
      name: 'Cho phép công bố đúng truy vấn này',
      exact: true,
    })
    .check();
  await expect(sendButton).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect(mode).toHaveValue('WEB');
  await expect(query).toHaveValue('Official SIWC preview limitations');
  await page
    .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
    .fill('P1 browser A');
  await mode.selectOption('WEB');
  await query.fill('Official SIWC preview limitations');
  await page
    .getByRole('checkbox', {
      name: 'Cho phép công bố đúng truy vấn này',
      exact: true,
    })
    .check();
  await query.fill('Changed query requires new confirmation');
  await expect(sendButton).toBeDisabled();
  await mode.selectOption('PROJECT_ONLY');
  await expect(query).toHaveCount(0);
  const request = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      /\/ai\/conversations\/[^/]+\/answers$/.test(new URL(r.url()).pathname),
  );
  await send(page, fixture.projectId, 'P1 browser A');
  const submitted = (await request).postDataJSON();
  expect(submitted.searchMode).toBe('PROJECT_ONLY');
  expect(submitted.publicQuery).toBeUndefined();
  expect(submitted.webSearch).toBeUndefined();
  expect(submitted.question).toBe('P1 browser A');
  await expect(page.getByText('sentinel-A', { exact: true })).toBeVisible();
  await page.reload();
  await expect(mode).toHaveValue('PROJECT_ONLY');
  await expect(
    page.getByRole('textbox', { name: 'Truy vấn công khai', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Phiên AI mới', exact: true }).click();
  await expect(mode).toHaveValue('PROJECT_ONLY');
  await mode.selectOption('AUTO');
  await page
    .getByRole('textbox', { name: 'Câu hỏi AI', exact: true })
    .fill('P1 browser A');
  await expect(sendButton).toBeEnabled();
  const automatic = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      /\/ai\/conversations\/[^/]+\/answers$/.test(new URL(r.url()).pathname),
  );
  await send(page, fixture.projectId, 'P1 browser A');
  expect((await automatic).postDataJSON()).toMatchObject({
    searchMode: 'AUTO',
    question: 'P1 browser A',
  });
  expect((await automatic).postDataJSON().publicQuery).toBeUndefined();
  await page.unrouteAll({ behavior: 'wait' });
});

test('E02-4 creates a native PPTX and opens a sandboxed real preview after reload', async ({
  page,
  context,
}) => {
  const cookie = fixture.users.sender!.cookie,
    split = cookie.indexOf('=');
  await context.addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await open(page, fixture.projectId);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page
    .getByRole('button', { name: 'PowerPoint (PPTX)', exact: true })
    .click();
  const editor = page.getByRole('textbox', { name: 'Câu hỏi AI', exact: true });
  await expect(editor).toHaveValue('');
  await expect(page.getByText('Đầu ra: PPTX', { exact: false })).toBeVisible();
  await editor.fill('E02 browser create pptx');
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(
    page.getByText('E02 native PPTX preview ready.', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(editor).toHaveValue('');
  await page.reload();
  await page
    .getByRole('button', {
      name: 'Xem trước E02 native preview.pptx',
      exact: true,
    })
    .click();
  const frame = page.frameLocator(
    'iframe[title="Preview E02 native preview.pptx"]',
  );
  await expect(frame.getByText('0007392', { exact: true })).toBeVisible();
  await expect(frame.getByText('275001.10', { exact: true })).toBeVisible();
  expect(
    await frame
      .locator('.slide-container .slide')
      .first()
      .evaluate((el) => el.getBoundingClientRect().left),
  ).toBeGreaterThanOrEqual(0);
  await expect(frame.locator('.sidebar-toggle')).toBeHidden();
  await expect(
    page.locator('iframe[title="Preview E02 native preview.pptx"]'),
  ).toHaveAttribute('sandbox', '');
  const previewResponse = await page.request.get(
    (await page
      .locator('iframe[title="Preview E02 native preview.pptx"]')
      .getAttribute('src')) as string,
  );
  expect(previewResponse.status()).toBe(200);
  expect(previewResponse.headers()['x-frame-options']).toBe('SAMEORIGIN');
  expect(previewResponse.headers()['content-security-policy']).toContain(
    "script-src 'none'",
  );
  const download = await page.request.get(
    (await page
      .getByRole('link', { name: /E02 native preview.pptx/ })
      .getAttribute('href'))!,
  );
  expect(download.status()).toBe(200);
  expect((await download.body()).subarray(0, 2).toString()).toBe('PK');
  const image = await frame.locator('.slide').screenshot();
  expect(image.length).toBeGreaterThan(5000);
});
