import { expect, type Page } from '@playwright/test';
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
});
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
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('GH-M3-42 kích thước?');
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
  await panel.getByRole('button', { name: 'Chat AI mới', exact: true }).click();
  await panel.getByLabel('Phạm vi AI', { exact: true }).selectOption('ALL');
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('GH-M3-42 nguồn đã trao đổi?');
  await panel.getByRole('button', { name: 'Hỏi AI', exact: true }).click();
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
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
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toHaveCount(0);
  await expect(
    panel.getByText('Không còn quyền xem nội dung phụ thuộc nguồn này'),
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
  await login(page);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
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
