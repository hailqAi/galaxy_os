import { expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from './m2-chrome-fixture';
import {
  createM2BrowserFixture,
  PrismaClient,
} from '../../../api/test/m2-browser.fixture';

const db = new PrismaClient();
let fixture: Awaited<ReturnType<typeof createM2BrowserFixture>>;
let projectId: string;
test.beforeAll(async () => {
  fixture = await createM2BrowserFixture();
  const parent = await db.project.findUniqueOrThrow({
    where: { id: fixture.projectId },
  });
  const userId = fixture.users.sender!.id;
  const role = await db.userRole.findFirstOrThrow({ where: { userId } });
  for (const code of [
    'ai.invoke',
    'file.upload',
    'file.read',
    'file.download',
  ]) {
    const permission = await db.permission.findUniqueOrThrow({
      where: { code },
    });
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.roleId,
          permissionId: permission.id,
        },
      },
      create: { roleId: role.roleId, permissionId: permission.id },
      update: {},
    });
  }
  projectId = (
    await db.project.create({
      data: {
        organizationId: parent.organizationId,
        customerId: parent.customerId,
        code: randomUUID(),
        name: 'Kiểm chứng AI không room',
        projectOwnerId: userId,
        createdBy: userId,
        updatedBy: userId,
      },
    })
  ).id;
  await db.chatProjectGrant.create({
    data: {
      organizationId: parent.organizationId,
      projectId,
      userId,
      grantedBy: fixture.users.authority!.id,
      actions: ['INVOKE'],
      roomCeiling: [],
      effectiveAt: new Date(Date.now() - 1000),
    },
  });
  const envPath = process.env.G00_TEST_ROOT + '/unified-browser-keys.env';
  writeFileSync(envPath, 'OPENROUTER_API_KEY="m3-browser-synthetic-only"\n', {
    mode: 0o600,
  });
  writeFileSync(
    process.env.G00_TEST_ROOT + '/browser-ai.json',
    JSON.stringify({
      credentialSource: { mode: 'env', path: envPath },
      providers: {
        openrouter: {
          revision: 'browser-unified-r1',
          enabled: true,
          replacementConfirmed: true,
          costMode: 'FREE_ONLY',
          dataPolicy: 'PROJECT_AUTHORIZED',
          projectPolicy: {
            organizationId: parent.organizationId,
            revision: 'owner-20261006',
            decisionReference: 'Kiểm thử chính sách thống nhất đã duyệt',
            approvedAt: '2026-10-06T00:00:00Z',
          },
        },
      },
    }),
    { mode: 0o600 },
  );
});
test.afterAll(async () => db.$disconnect());

test('nút native file, binary riêng, chờ đọc một lần và chat mới tìm lại nguồn không room', async ({
  page,
}) => {
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
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(`/projects/${projectId}/work?group=COMMERCIAL`);
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Chế độ hỏi', { exact: true })).toHaveCount(0);
  await expect(
    panel.getByRole('checkbox', { name: /Câu hỏi chỉ chứa/ }),
  ).toHaveCount(0);
  await expect(
    panel.getByText('Cấu hình nhà cung cấp và hạn mức', { exact: true }),
  ).toHaveCount(0);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/ai\/index$/, async (route) => {
    await held;
    await route.continue();
  });
  let dispatches = 0;
  page.on('request', (request) => {
    if (/\/ai\/answers\/[^/]+\/run$/.test(request.url())) dispatches++;
  });
  await expect(
    panel.getByRole('button', {
      name: '＋ Tạo cuộc trao đổi mới',
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      panel
        .locator('.ai-workspace-empty img')
        .evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts).some(
        (font) => font.status === 'loaded' && font.family.includes('Vietnam'),
      );
    }),
  ).toBe(true);
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-empty.png',
    fullPage: true,
  });
  await panel
    .getByRole('button', { name: '＋ Tạo cuộc trao đổi mới', exact: true })
    .click();
  await expect(page.locator('form.ai-composer')).toHaveCount(1);
  const rail = panel.getByRole('complementary', {
    name: 'Nguồn và lịch sử AI',
  });
  await expect(rail).toBeVisible();
  const input = panel.getByLabel('Câu hỏi AI', { exact: true });
  await input.fill('Mã vật liệu trong tệp là gì?');
  await panel
    .getByRole('button', { name: 'Đính kèm tệp', exact: true })
    .click();
  const chooser = page.waitForEvent('filechooser');
  await panel
    .getByRole('button', { name: 'Tải tệp từ máy', exact: true })
    .click();
  const native = await chooser;
  expect(await native.element().getAttribute('type')).toBe('file');
  await native.setFiles({
    name: 'Kiem-chung-AI.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      'Vật liệu trong tệp: LAN-6827. Không có trong tên file.',
    ),
  });
  await expect(panel.getByText('Đang đọc', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  expect(dispatches).toBe(0);
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-loading.png',
    fullPage: true,
  });
  release();
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  expect(dispatches).toBe(1);
  expect(await db.chatRoom.count({ where: { projectId } })).toBe(0);
  expect(
    await db.fileAsset.count({
      where: {
        attachments: { some: { projectId, entityType: 'ChatAiConversation' } },
      },
    }),
  ).toBe(1);
  await panel
    .getByRole('button', { name: '＋ Chat AI mới', exact: true })
    .click();
  await input.fill('Vật liệu LAN-6827 đã lưu là gì?');
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  expect(dispatches).toBe(2);
  await expect(panel.getByText(/LAN-6827/).first()).toBeVisible();
  await panel.locator('.ai-scroll-body').evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-selected.png',
    fullPage: true,
  });
  const center = await panel.locator('.ai-session-content').boundingBox();
  const right = await rail.boundingBox();
  expect(right!.x).toBeGreaterThan(center!.x + center!.width - 2);
  const conversation = new URL(page.url()).searchParams.get('ai');
  await input.fill('Nháp riêng của phiên đang mở');
  await page.locator('.room-list .room-choice').last().click();
  await expect(page).not.toHaveURL(new RegExp(`ai=${conversation}`));
  await expect(input).toHaveValue('');
  await page.locator('.room-list .room-choice').first().click();
  await expect(input).toHaveValue('Nháp riêng của phiên đang mở');
  await input.fill('');
  await panel
    .getByRole('button', { name: '＋ Chat AI mới', exact: true })
    .click();
  await expect(page).not.toHaveURL(new RegExp(`ai=${conversation}`));
  await page.locator('.room-list .room-choice').first().click();
  await expect(page).toHaveURL(new RegExp(`ai=${conversation}`));
  await expect(panel.getByText(/^Mô phỏng kiểm thử M3/)).toBeVisible();
  await page.goto(
    `/projects/${projectId}/ai?ai=${conversation}&scope=COMMERCIAL`,
  );
  await expect(
    page.getByRole('region', { name: 'Câu trả lời Galaxy AI' }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-direct.png',
    fullPage: true,
  });
  expect(dispatches).toBe(2);
  await page.setViewportSize({ width: 375, height: 983 });
  await expect(page.getByLabel('Câu hỏi AI', { exact: true })).toBeVisible();
  await page.locator('.ai-scroll-body').evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-mobile.png',
    fullPage: true,
  });
  const sendBounds = await page
    .getByRole('button', { name: 'Gửi', exact: true })
    .boundingBox();
  expect(sendBounds!.y + sendBounds!.height).toBeLessThanOrEqual(983);
  expect(
    await page
      .getByRole('button', { name: 'Gửi', exact: true })
      .evaluate((el) => {
        const box = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ),
        );
      }),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.getByLabel('Câu hỏi AI', { exact: true }).focus();
  await expect(page.getByLabel('Câu hỏi AI', { exact: true })).toBeFocused();
  await page.setViewportSize({ width: 720, height: 512 });
  await expect(input).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(720);
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-reflow-200.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1024 });
  await panel
    .getByRole('button', { name: '＋ Chat AI mới', exact: true })
    .click();
  await input.fill('Giữ lại nội dung khi nhà cung cấp tạm lỗi.');
  await page.route(/\/ai\/conversations\/[^/]+\/answers$/, (route) =>
    route.fulfill({ status: 503, json: { message: 'TEMPORARY_ERROR' } }),
  );
  await panel.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(panel.getByRole('alert').first()).toBeVisible();
  await expect(input).toHaveValue('Giữ lại nội dung khi nhà cung cấp tạm lỗi.');
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-request-error.png',
    fullPage: true,
  });
  await page.route(/\/ai$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), models: [] },
    });
  });
  await expect(
    panel.getByText(
      'Hiện chưa có model có thể nhận yêu cầu. Nội dung của bạn được giữ lại.',
    ),
  ).toBeVisible({ timeout: 8000 });
  await page.screenshot({
    path: '/home/galaxy_os/.runtime/five-pdfs-20261006/ui-capability.png',
    fullPage: true,
  });
});
