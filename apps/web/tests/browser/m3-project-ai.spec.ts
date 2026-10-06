import { expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from './m2-chrome-fixture';
import {
  createM2BrowserFixture,
  PrismaClient,
} from '../../../api/test/m2-browser.fixture';

let fixture: Awaited<ReturnType<typeof createM2BrowserFixture>>;
const db = new PrismaClient();
test.beforeEach(async ({ page }) => {
  // Ca docked cần đủ vùng nội dung ba cột; màn hẹp dùng nút overlay đã kiểm riêng.
  await page.setViewportSize({ width: 1440, height: 900 });
});
const post = async (path: string, body: object, who = 'authority') => {
  const response = await fetch(
    `${process.env.INTERNAL_API_URL}/project-chat${path}`,
    {
      method: 'POST',
      headers: {
        Cookie: fixture.users[who]!.cookie,
        'X-Chat-Actor': fixture.users[who]!.id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  expect(response.status).toBe(201);
  return response.json();
};
test.beforeAll(async () => {
  fixture = await createM2BrowserFixture();
  const [identity] = await db.$queryRaw<
    { database: string }[]
  >`SELECT current_database() AS database`;
  expect(identity?.database).toBe(
    `galaxy_os_g00_${process.env.G00_TEST_RUN_ID}`,
  );
  const role = await db.userRole.findFirstOrThrow({
    where: { userId: fixture.users.authority!.id },
  });
  const permission = await db.permission.findUniqueOrThrow({
    where: { code: 'ai.invoke' },
  });
  await db.rolePermission.create({
    data: { roleId: role.roleId, permissionId: permission.id },
  });
  const senderRole = await db.userRole.findFirstOrThrow({
    where: { userId: fixture.users.sender!.id },
  });
  await db.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: senderRole.roleId,
        permissionId: permission.id,
      },
    },
    create: { roleId: senderRole.roleId, permissionId: permission.id },
    update: {},
  });
  await post(`/projects/${fixture.projectId}/authorities`, {
    userId: fixture.users.sender!.id,
    actions: ['INVOKE'],
    roomCeiling: [],
  });
  await post(
    `/rooms/${fixture.roomId}/messages`,
    {
      clientKey: randomUUID(),
      body: 'GH-M3-42 nguồn cũ: kích thước 800 mm, chưa xác nhận.',
    },
    'sender',
  );
  await configureProjectPolicy();
});
async function configureProjectPolicy() {
  const project = await db.project.findUniqueOrThrow({
    where: { id: fixture.projectId },
  });
  const envPath = process.env.G00_TEST_ROOT + '/browser-policy-keys.env';
  writeFileSync(envPath, 'OPENROUTER_API_KEY="m3-browser-synthetic-only"\n', {
    mode: 0o600,
  });
  writeFileSync(
    process.env.G00_TEST_ROOT + '/browser-ai.json',
    JSON.stringify({
      credentialSource: { mode: 'env', path: envPath },
      providers: {
        openrouter: {
          revision: 'browser-r1',
          enabled: true,
          replacementConfirmed: true,
          costMode: 'FREE_ONLY',
          dataPolicy: 'PROJECT_AUTHORIZED',
          projectPolicy: {
            organizationId: project.organizationId,
            revision: 'owner-20261006',
            decisionReference: 'Kiểm thử chính sách thống nhất đã duyệt',
            approvedAt: '2026-10-06T00:00:00Z',
          },
        },
      },
    }),
    { mode: 0o600 },
  );
}
test.afterAll(async () => {
  await db.$disconnect();
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    writeFileSync(
      info.outputPath('fixture-state.txt'),
      `${page.url()}\n${await page.locator('body').innerText()}`,
    );
});

async function login(page: Page) {
  const cookie = fixture.users.sender!.cookie,
    separator = cookie.indexOf('=');
  await page.context().addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto(`/projects/${fixture.projectId}/work`);
  await page
    .getByRole('button', { name: '＋ Tạo cuộc trao đổi mới', exact: true })
    .click();
}

test('composer không còn control pilot hoặc cấu hình nhà cung cấp', async ({
  page,
}) => {
  await login(page);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await expect(panel).toBeVisible();
  for (const label of [
    'Chế độ hỏi',
    'Cấu hình nhà cung cấp và hạn mức',
    'Phê duyệt nội dung nhập',
    'Thu hồi nội dung nhập',
  ])
    await expect(panel.getByText(label, { exact: true })).toHaveCount(0);
  await expect(
    panel.getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ }),
  ).toHaveCount(0);
});
test('private AI uses old sources, persists history and clears revoked derived content (mock provider only)', async ({
  page,
}) => {
  await page.goto(`/login?returnTo=/projects/${fixture.projectId}/work`);
  await page.getByLabel('Email đăng nhập').fill(fixture.users.sender!.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/${fixture.projectId}/work$`),
  );
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await expect(panel).toBeVisible();
  await panel
    .getByRole('button', { name: '＋ Tạo cuộc trao đổi mới', exact: true })
    .click();
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('GH-M3-42 kích thước?');
  const deniedPattern = /\/ai\/conversations\/[^/]+\/answers$/;
  await page.route(deniedPattern, async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'MODEL_DISABLED' }),
    });
    await page.unroute(deniedPattern);
  });
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(
    panel
      .getByRole('alert')
      .filter({ hasText: 'Quản trị chưa bật model' })
      .first(),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Tạo lượt mới theo lựa chọn hiện tại' })
    .click();
  await panel.getByRole('button', { name: 'Gửi', exact: true }).dblclick();
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  await expect(
    panel.getByText(
      'Dữ liệu giả; không phải kết quả provider thật hoặc quyết định chính thức.',
    ),
  ).toBeVisible();
  const saved = await db.chatAiAnswer.findMany({
    where: { projectId: fixture.projectId, ownerId: fixture.users.sender!.id },
  });
  expect(saved).toHaveLength(1);
  expect(saved[0]!.status).toBe('COMPLETED');
  await panel.getByRole('button', { name: /Tin nhắn.*bản.*dòng/ }).click();
  await expect(
    panel
      .getByLabel('Nguồn câu trả lời')
      .getByText('GH-M3-42 nguồn cũ: kích thước 800 mm, chưa xác nhận.', {
        exact: true,
      }),
  ).toBeVisible();
  await page.reload();
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  await expect(page).toHaveURL(/\?ai=[\da-f-]+/);
  const conversationId = new URL(page.url()).searchParams.get('ai');
  const sourceCount = await db.chatAiSourceIndex.count({
    where: { projectId: fixture.projectId },
  });
  for (const model of ['openrouter/free', 'openrouter/free']) {
    await panel.getByLabel('Model AI', { exact: true }).selectOption(model);
    await panel
      .getByLabel('Câu hỏi AI', { exact: true })
      .fill('GH-M3-42 tiếp theo?');
    await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue(
      '',
    );
    expect(new URL(page.url()).searchParams.get('ai')).toBe(conversationId);
  }
  expect(
    await db.chatAiSourceIndex.count({
      where: { projectId: fixture.projectId },
    }),
  ).toBe(sourceCount);
  expect(
    (
      await db.chatAiAnswer.findMany({
        where: { conversationId: conversationId! },
        orderBy: { createdAt: 'asc' },
      })
    ).map((a) => a.model),
  ).toEqual(['openrouter/free', 'openrouter/free', 'openrouter/free']);
  // Lost POST response must retry the pinned model and preserve a different draft.
  await panel
    .getByLabel('Model AI', { exact: true })
    .selectOption('openrouter/free');
  const pattern = /\/ai\/conversations\/[^/]+\/answers$/;
  await page.route(pattern, async (route) => {
    await route.fetch();
    await route.abort('failed');
    await page.unroute(pattern);
  });
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('GH-M3-42 retry A?');
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Thử lại lượt đã chốt' }),
  ).toBeVisible();
  await panel
    .getByLabel('Model AI', { exact: true })
    .selectOption('openrouter/free');
  await panel.getByLabel('Câu hỏi AI', { exact: true }).fill('Nháp B chưa gửi');
  await panel.getByRole('button', { name: 'Thử lại lượt đã chốt' }).click();
  await expect(
    panel.getByRole('button', { name: 'Thử lại lượt đã chốt' }),
  ).toHaveCount(0);
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toBeEnabled();
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue(
    'Nháp B chưa gửi',
  );
  expect(
    (
      await db.chatAiAnswer.findFirstOrThrow({
        where: {
          conversationId: conversationId!,
          question: 'GH-M3-42 retry A?',
        },
      })
    ).model,
  ).toBe('openrouter/free');
  const configPath = process.env.G00_TEST_ROOT + '/browser-ai.json';
  const configText = readFileSync(configPath, 'utf8'),
    config = JSON.parse(configText);
  config.providers.openrouter.enabled = false;
  writeFileSync(configPath, JSON.stringify(config));
  await page.reload();
  await expect(
    panel
      .getByLabel('Model AI', { exact: true })
      .locator('option[value="openrouter/free"]'),
  ).toHaveCount(0);
  await expect(
    panel.getByRole('button', { name: 'Gửi', exact: true }),
  ).toBeDisabled();
  writeFileSync(configPath, configText);
  await panel
    .getByLabel('Model AI', { exact: true })
    .selectOption('openrouter/free');
  await panel
    .getByRole('button', { name: '＋ Chat AI mới', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Mở Hỏi AI dự án', exact: true })
    .click();
  // Popup toàn dự án giữ pipeline chung, không có selector mode hoặc scope.
  const projectPopup = page.getByRole('dialog', { name: /Galaxy AI/ });
  await projectPopup
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('GH-M3-42 nguồn đã trao đổi?');
  await projectPopup.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(projectPopup.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  expect(
    await db.chatAiSourceIndex.count({
      where: { projectId: fixture.projectId, status: 'READY' },
    }),
  ).toBe(sourceCount);
  await post(
    `/rooms/${fixture.roomId}/grants/${fixture.senderGrantId}/revoke`,
    {},
    'manager',
  );
  await expect(projectPopup.getByText(/^Mô phỏng kiểm thử M3/)).toHaveCount(0);
  await expect(
    projectPopup.getByText('Không còn quyền xem nội dung phụ thuộc nguồn này'),
  ).toBeVisible();
});

test('slow denied polling removes old-account answers and drafts', async ({
  page,
}) => {
  await post(
    `/rooms/${fixture.roomId}/grants`,
    {
      userId: fixture.users.sender!.id,
      actions: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD'],
    },
    'manager',
  );
  await post(
    `/rooms/${fixture.roomId}/messages`,
    { clientKey: randomUUID(), body: 'SLOW-M3-42 nội dung riêng mới 900 mm.' },
    'sender',
  );
  await configureProjectPolicy();
  await login(page);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('SLOW-M3-42 nội dung?');
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('Bản nháp bí mật của tài khoản cũ');
  await page.route(
    /\/api\/v1\/project-chat\/projects\/[^/]+\/ai(?:\/|$)/,
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await route.fulfill({ response });
    },
  );
  const cookie = fixture.users.viewer!.cookie,
    separator = cookie.indexOf('=');
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  // One 3-second polling interval + injected 3.5-second response delay; no retry-until-green.
  await expect(panel).toHaveCount(0, { timeout: 9000 });
  expect(
    await page
      .locator('textarea')
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLTextAreaElement).value),
      ),
  ).not.toContain('Bản nháp bí mật của tài khoản cũ');
});

test('switching between AI-enabled actors discards the old private conversation URL', async ({
  page,
}) => {
  const senderRole = await db.userRole.findFirstOrThrow({
    where: { userId: fixture.users.sender!.id },
  });
  await db.userRole.create({
    data: {
      organizationId: senderRole.organizationId,
      userId: fixture.users.viewer!.id,
      roleId: senderRole.roleId,
      scopeType: 'ORGANIZATION',
    },
  });
  await post(`/projects/${fixture.projectId}/authorities`, {
    userId: fixture.users.viewer!.id,
    actions: ['INVOKE'],
    roomCeiling: [],
  });
  await post(
    `/rooms/${fixture.roomId}/messages`,
    { clientKey: randomUUID(), body: 'ACTOR-M3-42 nguồn riêng 900 mm.' },
    'sender',
  );
  await login(page);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('ACTOR-M3-42 thông tin?');
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  await expect(page).toHaveURL(/\?ai=[\da-f-]+/);
  const cookie = fixture.users.viewer!.cookie,
    separator = cookie.indexOf('=');
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await expect(page).not.toHaveURL(/\?ai=/);
  await expect(panel).toBeVisible();
  await expect(
    panel.locator('.ai-thread-history [aria-current="page"]'),
  ).toHaveCount(0);
  await panel
    .getByRole('button', { name: '＋ Tạo cuộc trao đổi mới', exact: true })
    .click();
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue('');
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toHaveCount(0);
});

test('T2 cùng request và hội thoại khi dock, floating, expanded và page', async ({
  page,
}) => {
  // Nguồn riêng của ca này; không phụ thuộc ca revoke trước đó đã chạy.
  await post(
    `/rooms/${fixture.roomId}/messages`,
    {
      clientKey: randomUUID(),
      body: 'SURFACE-M3-42 nguồn kiểm chuyển màn 900 mm.',
    },
    'sender',
  );
  await login(page);
  let runs = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/ai\/answers\/[^/]+\/run$/, async (route) => {
    runs++;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('SURFACE-M3-42 chuyển presentation giữ nguồn?');
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect.poll(() => runs).toBe(1);
  const id = new URL(page.url()).searchParams.get('ai');
  expect(id).toBeTruthy();
  await panel.getByRole('button', { name: 'Tách AI thành cửa sổ nổi' }).click();
  const popup = page.getByRole('dialog', { name: /Galaxy AI/ });
  await expect(popup).toBeVisible();
  await expect(panel).toHaveCount(1);
  await panel.getByRole('button', { name: 'Mở rộng AI', exact: true }).click();
  await panel
    .getByLabel('Model AI', { exact: true })
    .selectOption('openrouter/free');
  await panel.getByRole('button', { name: 'Thu nhỏ AI' }).click();
  await expect(popup).not.toBeVisible();
  await expect(panel).toHaveCount(1);
  await panel.getByRole('button', { name: 'Mở trang AI' }).click();
  await expect(page).toHaveURL(new RegExp(`/ai\\?.*ai=${id}`));
  release();
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue('');
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  await expect(panel.getByLabel('Model AI', { exact: true })).toHaveValue(
    'openrouter/free',
  );
  const answers = await db.chatAiAnswer.findMany({
    where: { conversationId: id! },
  });
  expect(answers).toHaveLength(1);
  expect(answers[0]!.model).toBe('openrouter/free');
  expect(runs).toBe(1);
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('Nháp của cùng phiên');
  await panel.getByRole('button', { name: 'Mở rộng AI', exact: true }).click();
  await expect(
    panel.locator('.ai-thread-history [aria-current="page"]'),
  ).toHaveAttribute('data-conversation-id', id!);
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue(
    'Nháp của cùng phiên',
  );
  expect(runs).toBe(1);
  // Chỉ fixture: nội dung dài để kiểm renderer, không phải bằng chứng vendor.
  await page.route(new RegExp(`/ai/conversations/${id}$`), async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.answers[0].answer =
      '## Nội dung dài\n\n' +
      Array.from(
        { length: 35 },
        (_, i) => `Đoạn ${i}: ${'Nguồn tổng hợp tiếng Việt. '.repeat(12)}`,
      ).join('\n\n') +
      '\n\n| Mã | Nguồn |\n| --- | --- |\n| NG-42 | ' +
      'a'.repeat(400) +
      ' |\n\n```txt\n' +
      'x'.repeat(600) +
      '\n```';
    await route.fulfill({ response, json: body });
  });
  await expect(
    panel.locator('.chat-text').getByRole('heading', { name: 'Nội dung dài' }),
  ).toBeVisible({ timeout: 8000 });
  await expect(panel.locator('.chat-text').first()).toHaveCSS(
    'font-size',
    '16px',
  );
  await expect(panel.locator('.chat-text').first()).toHaveCSS(
    'line-height',
    '26px',
  );
  const scroll = panel.locator('.ai-scroll-body');
  await scroll.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('T3 câu tiếp theo cùng nguồn?');
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue('');
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0);
  await panel.getByRole('button', { name: /Có cập nhật/ }).click();
  expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(
    100,
  );
  const citation = panel
    .getByRole('button', { name: /Tin nhắn.*bản.*dòng/ })
    .last();
  await citation.click();
  const source = panel.getByRole('dialog', { name: 'Nguồn câu trả lời' });
  await expect(source).toBeVisible();
  const anchor = await scroll.evaluate((element) => element.scrollTop);
  await source.getByRole('button', { name: 'Đóng nguồn' }).press('Escape');
  await expect(source).toHaveCount(0);
  await expect(popup).toBeVisible();
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(anchor);
  await expect(citation).toBeFocused();
});

test('sidebar nguồn mở được, huỷ rời room giữ phiên và mobile chỉ đọc vẫn chọn được room', async ({
  page,
}) => {
  await post(
    `/rooms/${fixture.roomId}/messages`,
    { clientKey: randomUUID(), body: 'RAIL-M3-81 nguồn kiểm sidebar.' },
    'sender',
  );
  await login(page);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('RAIL-M3-81 có gì?');
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  const id = new URL(page.url()).searchParams.get('ai');
  await post(
    `/projects/${fixture.projectId}/ai/conversations`,
    { clientKey: randomUUID(), scope: 'CONSULTING' },
    'sender',
  );
  await page.goto(
    `/projects/${fixture.projectId}/work?group=CONSULTING&room=${fixture.roomId}&ai=${id}`,
  );
  await expect(page.locator('form.ai-composer')).toHaveCount(0);
  await panel.locator('.ai-context-sources > button').first().click();
  const drawer = panel.getByRole('dialog', { name: 'Nguồn câu trả lời' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Đóng nguồn' }).click();
  await page.getByLabel('Tin nhắn', { exact: true }).fill('Nháp room chưa gửi');
  await page
    .locator('.room-list .room-choice')
    .filter({ hasText: 'Hội thoại AI' })
    .first()
    .click();
  await page.getByRole('button', { name: 'Ở lại', exact: true }).click();
  await expect(page.getByLabel('Tin nhắn', { exact: true })).toHaveValue(
    'Nháp room chưa gửi',
  );
  await expect(
    panel.locator('.ai-thread-history [aria-current="page"]'),
  ).toHaveAttribute('data-conversation-id', id!);
  await expect(page).toHaveURL(new RegExp(`ai=${id}`));
  await post(
    `/rooms/${fixture.roomId}/grants`,
    { userId: fixture.users.locker!.id, actions: ['READ'] },
    'manager',
  );
  const cookie = fixture.users.locker!.cookie,
    separator = cookie.indexOf('=');
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
  await page.setViewportSize({ width: 375, height: 983 });
  await page.goto(`/projects/${fixture.projectId}/work`);
  await page
    .getByRole('button', { name: 'Mở danh sách cuộc trao đổi', exact: true })
    .click();
  await page.getByRole('button', { name: /Nội bộ thử nghiệm/ }).click();
  await expect(page.getByLabel('Tin nhắn', { exact: true })).toBeDisabled();
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-read-only.png',
    fullPage: true,
  });
});

for (const lateStatus of [200, 403]) {
  test(`T5 response A muộn ${lateStatus} không tác động popup Project B`, async ({
    page,
  }) => {
    const a = await db.project.findUniqueOrThrow({
      where: { id: fixture.projectId },
    });
    const b = await db.project.create({
      data: {
        organizationId: a.organizationId,
        customerId: a.customerId,
        code: `isolation-${randomUUID()}`,
        name: `Project B ${lateStatus}`,
        projectOwnerId: fixture.users.sender!.id,
        createdBy: fixture.users.authority!.id,
        updatedBy: fixture.users.authority!.id,
      },
    });
    await post(`/projects/${b.id}/authorities`, {
      userId: fixture.users.sender!.id,
      actions: ['INVOKE'],
      roomCeiling: [],
    });
    await post(
      `/rooms/${fixture.roomId}/messages`,
      {
        clientKey: randomUUID(),
        body: `ISOLATION-M3-${lateStatus} nguồn synthetic riêng 900 mm.`,
      },
      'sender',
    );
    await configureProjectPolicy();
    await login(page);
    await page
      .getByRole('button', { name: 'Mở Hỏi AI dự án', exact: true })
      .click();
    const popup = page.getByRole('dialog', { name: /Galaxy AI/ });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let runs = 0;
    await page.route(/\/ai\/answers\/[^/]+\/run$/, async (route) => {
      runs++;
      const response = await route.fetch();
      await held;
      if (lateStatus === 403)
        await route.fulfill({ status: 403, json: { message: 'FORBIDDEN' } });
      else await route.fulfill({ response });
    });
    const question = `ISOLATION-M3-${lateStatus} kích thước?`;
    await popup.getByLabel('Câu hỏi AI', { exact: true }).fill(question);
    await popup.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect.poll(() => runs).toBe(1);
    try {
      await popup.getByRole('button', { name: 'Đóng AI', exact: true }).click();
      await page.locator('.p04-project-navigation > summary').click();
      await page
        .getByRole('link', { name: '← Các dự án được cấp', exact: true })
        .click();
      await page.getByRole('link', { name: b.name, exact: true }).click();
      await page
        .getByRole('button', { name: 'Mở Hỏi AI dự án', exact: true })
        .click();
      await expect(popup.getByText(b.name, { exact: true })).toBeVisible();
      const input = popup.getByLabel('Câu hỏi AI', { exact: true });
      await input.fill('Nháp riêng Project B');
      const delivered = page.waitForResponse(/\/ai\/answers\/[^/]+\/run$/);
      release();
      await delivered;
      // Một chu kỳ poll: callback A không được đóng/relabel popup B.
      await page.waitForTimeout(3500);
      await expect(popup).toBeVisible();
      await expect(input).toHaveValue('Nháp riêng Project B');
      await expect(input).toBeFocused();
      await expect(popup.getByText(question, { exact: true })).toHaveCount(0);
      await expect(popup.getByText(/^Mô phỏng kiểm thử M3/)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/projects/${b.id}/work$`));
      if (lateStatus === 200) {
        await popup
          .getByRole('button', { name: 'Đóng AI', exact: true })
          .click();
        await page.locator('.p04-project-navigation > summary').click();
        await page
          .getByRole('link', { name: '← Các dự án được cấp', exact: true })
          .click();
        await page.getByRole('link', { name: a.name, exact: true }).click();
        await page
          .getByRole('button', { name: 'Mở Hỏi AI dự án', exact: true })
          .click();
        await expect(
          popup.getByRole('heading', { name: question, exact: true }),
        ).toBeVisible();
        await expect(popup.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
      }
      expect(runs).toBe(1);
    } finally {
      release();
    }
  });
}
