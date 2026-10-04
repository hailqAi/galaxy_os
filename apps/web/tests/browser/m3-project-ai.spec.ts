import { expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { AI_MODELS } from '../../../api/src/project-chat/ai-registry';
import { randomUUID } from 'node:crypto';
import { test } from './m2-chrome-fixture';
import {
  createM2BrowserFixture,
  PrismaClient,
} from '../../../api/test/m2-browser.fixture';

let fixture: Awaited<ReturnType<typeof createM2BrowserFixture>>;
const db = new PrismaClient();
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
  await approveSyntheticSources();
});
async function approveSyntheticSources() {
  await post(
    `/projects/${fixture.projectId}/ai/index`,
    { scope: 'ALL' },
    'sender',
  );
  const sources = await db.chatAiSourceIndex.findMany({
    where: { projectId: fixture.projectId },
  });
  const providers = Object.fromEntries(
    AI_MODELS.map((m) => [
      m.provider,
      {
        revision: 'browser-r1',
        dataPolicy: 'SYNTHETIC_PUBLIC_APPROVED',
        [m.keyName]: 'm3-browser-synthetic-only',
        enabled: true,
        replacementConfirmed: true,
        approvedProjects: [
          {
            organizationId: sources[0]!.organizationId,
            projectId: fixture.projectId,
          },
        ],
        approvedSources: sources.map((s) => ({ id: s.id, version: s.version })),
      },
    ]),
  );
  writeFileSync(
    process.env.G00_TEST_ROOT + '/browser-ai.json',
    JSON.stringify({ providers }),
    { mode: 0o600 },
  );
}
test.afterAll(async () => {
  await db.$disconnect();
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
}

test('open admin settings follows a later registry revision', async ({
  page,
}) => {
  await post(`/projects/${fixture.projectId}/authorities`, {
    userId: fixture.users.sender!.id,
    actions: ['ACCESS_ADMIN'],
    roomCeiling: [],
  });
  let updated = false;
  await page.route(
    new RegExp(`/api/v1/project-chat/projects/${fixture.projectId}/ai$`),
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (updated)
        body.models = body.models.map((model: { revision: string }) => ({
          ...model,
          revision: 'browser-r2',
        }));
      await route.fulfill({ response, json: body });
    },
  );
  await login(page);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  const settings = panel.locator('details').filter({
    hasText: 'Cấu hình nhà cung cấp và hạn mức',
  });
  await settings.locator('summary').click();
  await expect(settings.getByText(/revision browser-r1/).first()).toBeVisible();
  updated = true;
  await expect(settings.getByText(/revision browser-r2/).first()).toBeVisible({
    timeout: 8000,
  });
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
  await panel.getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ }).check();
  await expect(panel).toBeVisible();
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
  await panel.getByRole('button', { name: 'Hỏi AI', exact: true }).click();
  await expect(
    panel
      .getByRole('alert')
      .filter({ hasText: 'Quản trị chưa bật model' })
      .first(),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Tạo lượt mới theo lựa chọn hiện tại' })
    .click();
  await panel.getByRole('button', { name: 'Hỏi AI', exact: true }).dblclick();
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
  await panel.getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ }).check();
  const conversationId = new URL(page.url()).searchParams.get('ai');
  const sourceCount = await db.chatAiSourceIndex.count({
    where: { projectId: fixture.projectId },
  });
  for (const model of ['kira-3.5-pro', 'mistral-medium-3-5']) {
    await panel.getByLabel('Model AI', { exact: true }).selectOption(model);
    await panel
      .getByLabel('Câu hỏi AI', { exact: true })
      .fill('GH-M3-42 tiếp theo?');
    await panel.getByRole('button', { name: 'Hỏi AI', exact: true }).click();
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
  ).toEqual(['gemini-3.8-flash', 'kira-3.5-pro', 'mistral-medium-3-5']);
  // Lost POST response must retry the pinned model and preserve a different draft.
  await panel
    .getByLabel('Model AI', { exact: true })
    .selectOption('gemini-3.8-flash');
  const pattern = /\/ai\/conversations\/[^/]+\/answers$/;
  await page.route(pattern, async (route) => {
    await route.fetch();
    await route.abort('failed');
    await page.unroute(pattern);
  });
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('GH-M3-42 retry A?');
  await panel.getByRole('button', { name: 'Hỏi AI', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Thử lại lượt đã chốt' }),
  ).toBeVisible();
  await panel
    .getByLabel('Model AI', { exact: true })
    .selectOption('kira-3.5-pro');
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
  ).toBe('gemini-3.8-flash');
  const configPath = process.env.G00_TEST_ROOT + '/browser-ai.json';
  const configText = readFileSync(configPath, 'utf8'),
    config = JSON.parse(configText);
  config.providers.kira.enabled = false;
  writeFileSync(configPath, JSON.stringify(config));
  await page.reload();
  await expect(panel.getByLabel('Model AI', { exact: true })).toHaveValue(
    'kira-3.5-pro',
  );
  await expect(
    panel.getByRole('button', { name: 'Hỏi AI', exact: true }),
  ).toBeDisabled();
  writeFileSync(configPath, configText);
  await panel
    .getByLabel('Model AI', { exact: true })
    .selectOption('gemini-3.8-flash');
  await panel.getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ }).check();
  await panel.getByRole('button', { name: 'Chat AI mới', exact: true }).click();
  await panel.getByLabel('Phạm vi AI', { exact: true }).selectOption('ALL');
  // Scope toàn dự án là phiên riêng trong popup; panel nhóm vẫn giữ đúng scope.
  const projectPopup = page.getByRole('dialog', { name: /Galaxy AI/ });
  await projectPopup
    .getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ })
    .check();
  await projectPopup
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('GH-M3-42 nguồn đã trao đổi?');
  await projectPopup
    .getByRole('button', { name: 'Hỏi AI', exact: true })
    .click();
  await expect(projectPopup.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  expect(
    await db.chatAiSourceIndex.count({
      where: { projectId: fixture.projectId, status: 'READY' },
    }),
  ).toBe(1);
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
  await approveSyntheticSources();
  await login(page);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await panel.getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ }).check();
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('SLOW-M3-42 nội dung?');
  await panel.getByRole('button', { name: 'Hỏi AI', exact: true }).click();
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
  await post(`/projects/${fixture.projectId}/authorities`, {
    userId: fixture.users.viewer!.id,
    actions: ['INVOKE'],
    roomCeiling: [],
  });
  await login(page);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await panel.getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ }).check();
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('SLOW-M3-42 thông tin?');
  await panel.getByRole('button', { name: 'Hỏi AI', exact: true }).click();
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
  await expect(panel.getByLabel('Lịch sử AI', { exact: true })).toHaveValue('');
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue('');
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toHaveCount(0);
});

test('T2 cùng request và hội thoại khi dock, floating, expanded và page', async ({
  page,
}) => {
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
  await panel.getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ }).check();
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('T2 chuyển presentation giữ nguồn SLOW-M3-42?');
  await panel.getByRole('button', { name: 'Hỏi AI', exact: true }).click();
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
    .selectOption('kira-3.5-pro');
  await panel.getByRole('button', { name: 'Thu nhỏ AI' }).click();
  await expect(popup).not.toBeVisible();
  await expect(panel).toHaveCount(1);
  await panel.getByRole('button', { name: 'Mở trang AI' }).click();
  await expect(page).toHaveURL(new RegExp(`/ai\\?.*ai=${id}`));
  release();
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue('');
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  await expect(panel.getByLabel('Model AI', { exact: true })).toHaveValue(
    'kira-3.5-pro',
  );
  const answers = await db.chatAiAnswer.findMany({
    where: { conversationId: id! },
  });
  expect(answers).toHaveLength(1);
  expect(answers[0]!.model).toBe('gemini-3.8-flash');
  expect(runs).toBe(1);
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('Nháp của cùng phiên');
  await panel.getByRole('button', { name: 'Mở rộng AI', exact: true }).click();
  await expect(panel.getByLabel('Lịch sử AI', { exact: true })).toHaveValue(
    id!,
  );
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue(
    'Nháp của cùng phiên',
  );
  expect(runs).toBe(1);
});
