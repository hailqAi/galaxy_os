import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { activationFixture } from '../../../api/src/project-chat/ai-activation';
import { test } from './m2-chrome-fixture';
import {
  createM2BrowserFixture,
  PrismaClient,
} from '../../../api/test/m2-browser.fixture';

let fixture: Awaited<ReturnType<typeof createM2BrowserFixture>>;
let productId: string;
test.beforeAll(async () => {
  fixture = await createM2BrowserFixture();
  const db = new PrismaClient();
  try {
    const project = await db.project.findUniqueOrThrow({
      where: { id: fixture.projectId },
    });
    const role = await db.role.create({
      data: {
        organizationId: project.organizationId,
        code: `pdf-${fixture.projectId}`,
        name: 'Đọc UI fixture',
        permissions: {
          create: [
            'dashboard.read',
            'project.read',
            'project.create',
            'estimate.create',
            'crm.customer.read',
            'task.read',
            'project.product.view',
            'project.product.create',
            'crm.lead.read',
            'crm.opportunity.read',
          ].map((code) => ({ permission: { connect: { code } } })),
        },
      },
    });
    await db.userRole.create({
      data: {
        organizationId: project.organizationId,
        userId: fixture.users.sender!.id,
        roleId: role.id,
        scopeType: 'ORGANIZATION',
      },
    });
    const authorityRole = await db.userRole.findFirstOrThrow({
      where: { userId: fixture.users.authority!.id },
    });
    await db.rolePermission.create({
      data: {
        role: { connect: { id: authorityRole.roleId } },
        permission: { connect: { code: 'ai.invoke' } },
      },
    });
    const granted = await fetch(
      `${process.env.INTERNAL_API_URL}/project-chat/projects/${fixture.projectId}/authorities`,
      {
        method: 'POST',
        headers: {
          Cookie: fixture.users.authority!.cookie,
          'X-Chat-Actor': fixture.users.authority!.id,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: fixture.users.sender!.id,
          actions: ['INVOKE'],
          roomCeiling: [],
        }),
      },
    );
    expect(granted.status).toBe(201);
    const product = await fetch(
      `${process.env.INTERNAL_API_URL}/projects/${fixture.projectId}/products`,
      {
        method: 'POST',
        headers: {
          Cookie: fixture.users.sender!.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'D-01',
          positionName: 'Cửa chính',
          customProductName: 'Cửa fixture tổng hợp',
          quantity: 2,
          unit: 'bộ',
        }),
      },
    );
    expect(product.status).toBe(201);
    productId = ((await product.json()) as { id: string }).id;
    await db.projectProductLine.update({
      where: { id: productId },
      data: { blocker: 'Đối chiếu kích thước fixture' },
    });
    await db.fileAsset.create({
      data: {
        organizationId: project.organizationId,
        originalFilename: 'fixture-missing-binary.txt',
        storedFilename: 'missing.txt',
        mimeType: 'text/plain',
        sizeBytes: BigInt(20),
        storageKey: `${project.organizationId}/2026/10/${randomUUID()}`,
        checksum: '0'.repeat(64),
        category: 'FIXTURE',
        uploadedById: fixture.users.sender!.id,
        attachments: {
          create: {
            entityType: 'Project',
            entityId: fixture.projectId,
            projectId: fixture.projectId,
            createdBy: fixture.users.sender!.id,
          },
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test('P05/P06: cùng ID, drawer, preview/version thật và binary thiếu có thông báo', async ({
  page,
}, info) => {
  const cookie = fixture.users.sender!.cookie,
    split = cookie.indexOf('=');
  await page.context().addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(`/projects/${fixture.projectId}/products`);
  await page.getByRole('button', { name: 'Có vướng mắc', exact: true }).click();
  await expect(
    page.getByText('Đối chiếu kích thước fixture', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /D-01 · Cửa fixture/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Chi tiết hạng mục' });
  await expect(
    drawer.getByRole('link', { name: 'Mở cấu hình, phê duyệt & hồ sơ nguồn' }),
  ).toHaveAttribute(
    'href',
    `/projects/${fixture.projectId}/products/${productId}`,
  );
  await page.screenshot({
    path: info.outputPath('p05-desktop.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await page.goto(`/projects/${fixture.projectId}/files`);
  await page.getByRole('button', { name: /phuong-an-browser.txt/ }).click();
  const source = page.getByRole('dialog', { name: 'Nguồn tài liệu' });
  await expect(source.locator('iframe')).toBeVisible();
  await expect(source.frameLocator('iframe').locator('body')).toContainText(
    'Phương án browser đã duyệt cho khách',
  );
  await page.screenshot({
    path: info.outputPath('p06-source-desktop.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: /fixture-missing-binary.txt/ })
    .click();
  await expect(source.getByRole('alert')).toContainText('MISSING_BINARY');
  await expect(source.locator('iframe')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByText('+ Tải tài liệu lên', { exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'fixture-native-preview.pdf',
    mimeType: 'application/pdf',
    buffer: activationFixture('pdf').media[0]!.bytes,
  });
  await page.getByRole('button', { name: 'Tải tệp', exact: true }).click();
  await page
    .getByRole('button', { name: /fixture-native-preview.pdf/ })
    .click();
  await expect(source.locator('iframe')).toBeVisible();
  await page.screenshot({
    path: info.outputPath('p06-native-pdf.png'),
    fullPage: true,
  });
  const pdfUrl = await source.locator('iframe').getAttribute('src');
  await expect
    .poll(async () => {
      for (const frame of page.frames()) {
        const plugin = frame.locator(
          'embed[type="application/x-google-chrome-pdf"]',
        );
        if (await plugin.count()) return plugin.getAttribute('original-url');
      }
      return null;
    })
    .toBe(pdfUrl);
  await expect
    .poll(async () => {
      for (const frame of page.frames()) {
        const viewer = frame.locator('pdf-viewer');
        if (await viewer.count())
          return viewer.evaluate(
            (el) =>
              (el as HTMLElement & { initialLoadComplete_: boolean })
                .initialLoadComplete_,
          );
      }
      return 0;
    })
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('p06-native-pdf.png'),
    fullPage: true,
  });
  // Version thay đổi khi drawer còn mở phải loại bỏ binary cũ.
  const fileId = (await source
    .getByRole('link', { name: 'Tải đúng phiên bản' })
    .getAttribute('href'))!.match(/files\/([^/]+)\//)![1]!;
  const db = new PrismaClient();
  try {
    await db.fileAsset.update({
      where: { id: fileId },
      data: { version: { increment: 1 } },
    });
  } finally {
    await db.$disconnect();
  }
  await expect(source.getByRole('alert')).toContainText(
    'Quyền tải hoặc phiên bản đã thay đổi',
    { timeout: 10000 },
  );
  await expect(source.locator('iframe')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: info.outputPath('p06-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: info.outputPath('p06-mobile.png'),
    fullPage: true,
  });
});

test('P04/AI01: chat lưu thật, panel thu gọn giữ nháp và dùng cùng lịch sử AI', async ({
  page,
}, info) => {
  const cookie = fixture.users.sender!.cookie,
    split = cookie.indexOf('=');
  await page.context().addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(
    `/projects/${fixture.projectId}/work?group=CONSULTING&room=${fixture.roomId}`,
  );
  await expect(page.getByLabel('Tin nhắn', { exact: true })).toBeEnabled();
  await page
    .getByLabel('Tin nhắn', { exact: true })
    .fill('Tin fixture cho bản PDF — giữ lịch sử');
  const composer = page.getByLabel('Tin nhắn', { exact: true });
  await composer.dispatchEvent('compositionstart');
  await composer.press('Enter');
  await expect(
    page
      .locator('.chat-message')
      .filter({ hasText: 'Tin fixture cho bản PDF — giữ lịch sử' }),
  ).toHaveCount(0);
  await composer.dispatchEvent('compositionend');
  await composer.fill('Tin fixture cho bản PDF — giữ lịch sử');
  await composer.press('Enter');
  await expect(
    page
      .locator('.chat-message')
      .getByText('Tin fixture cho bản PDF — giữ lịch sử', { exact: true }),
  ).toBeVisible();
  const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
  await panel
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('Nháp riêng chưa gửi');
  await panel.getByRole('button', { name: 'Thu gọn panel AI' }).click();
  await expect(
    panel.getByLabel('Câu hỏi AI', { exact: true }),
  ).not.toBeVisible();
  await panel.getByRole('button', { name: 'Mở panel AI' }).click();
  await expect(panel.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue(
    'Nháp riêng chưa gửi',
  );
  await page.screenshot({
    path: info.outputPath('p04-desktop.png'),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByText('Tin fixture cho bản PDF — giữ lịch sử', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.getByLabel('Tin nhắn', { exact: true }).focus();
  await page
    .getByRole('button', { name: 'Gửi tin', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', { name: 'Gửi tin', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('p04-mobile.png'),
    fullPage: true,
  });
  await page.goto(`/projects/${fixture.projectId}/ai`);
  await expect(
    page.getByRole('heading', { name: 'Galaxy AI — Tra cứu toàn dự án' }),
  ).toBeVisible();
  await expect(page.getByLabel('Phạm vi AI', { exact: true })).toHaveValue(
    'ALL',
  );
});

test('S01: dữ liệu thật, quyền tài chính và bố cục desktop/mobile', async ({
  page,
}, info) => {
  const cookie = fixture.users.sender!.cookie;
  const separator = cookie.indexOf('=');
  await page.context().addCookies([
    {
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const responsePromise = page.waitForResponse((r) =>
    r.url().endsWith('/api/v1/dashboard'),
  );
  await page.goto('/');
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).not.toHaveProperty('opportunityValues');
  await expect(
    page.getByRole('heading', { name: 'Tổng quan Galaxy OS' }),
  ).toBeVisible();
  await expect(
    page.getByText('Task fixture nguồn chung', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('s01-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: info.outputPath('s01-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: /Mở điều hướng/ }).click();
  await expect(page.locator('#portal-sidebar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#portal-sidebar')).not.toBeVisible();
});

test('P01/P03: filter trong URL, quay lại và cùng hồ sơ qua các tab', async ({
  page,
}, info) => {
  const cookie = fixture.users.sender!.cookie,
    split = cookie.indexOf('=');
  await page.context().addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1057 });
  await page.goto('/projects?commitment=SIGNED&sort=name&direction=asc');
  await expect(
    page.getByRole('link', { name: 'Project browser M2-A', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Đã ký', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    path: info.outputPath('p01-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Project browser M2-A', exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/${fixture.projectId}/overview`),
  );
  await expect(
    page.getByRole('heading', { name: 'Project browser M2-A', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('button', { name: 'Đã ký', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.goto(`/projects/${fixture.projectId}/overview`);
  await expect(
    page.getByRole('heading', { name: 'Project browser M2-A', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Đã có hợp đồng ký', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Hạng mục', exact: true }),
  ).toHaveAttribute('href', `/projects/${fixture.projectId}/products`);
  await page.screenshot({
    path: info.outputPath('p03-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: info.outputPath('p03-mobile.png'),
    fullPage: true,
  });
  const taskResponse = page.waitForResponse(
    (r) => r.url().includes('/api/v1/tasks?') && r.url().includes('projectId='),
  );
  await page.locator('a[href^="/tasks?tab=all&projectId="]').click();
  const tasksUrl = new URL((await taskResponse).url());
  expect(tasksUrl.searchParams.get('projectId')).toBe(fixture.projectId);
  expect(tasksUrl.searchParams.get('open')).toBe('true');
  await page.goto('/projects');
  await page.getByRole('link', { name: 'TẠO DỰ ÁN', exact: true }).click();
  await page.locator('input[name=name]').fill('Dự án tạo từ P02 fixture');
  await page.locator('input[name=estimatedInvestmentAmount]').fill('1.000.000');
  await page
    .locator('select[name=customerId]')
    .selectOption({ label: 'Khách fixture' });
  await page.screenshot({
    path: info.outputPath('p02-form-mobile.png'),
    fullPage: true,
  });
  const createdResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/projects') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'KHỞI TẠO DỰ ÁN', exact: true })
    .click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const record = (await created.json()) as { id: string; stageOneUrl: string };
  await expect(page).toHaveURL(
    new RegExp(`/projects/${record.id}/stage-1\\?step=1$`),
  );
  await page.goto(`/projects/${record.id}/overview`);
  await expect(
    page.getByRole('heading', {
      name: 'Dự án tạo từ P02 fixture',
      exact: true,
    }),
  ).toBeVisible();
});

test('T2 popup giữ nháp qua presentation và header không điều hướng', async ({
  page,
}, info) => {
  const cookie = fixture.users.sender!.cookie,
    split = cookie.indexOf('=');
  await page.context().addCookies([
    {
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      url: process.env.APP_PUBLIC_ORIGIN!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${fixture.projectId}/overview`);
  const before = page.url();
  await page
    .getByRole('button', { name: 'Hỏi Galaxy AI', exact: true })
    .click({ timeout: 5000 });
  const popup = page.getByRole('dialog', { name: /Galaxy AI/ });
  await expect(popup).toBeVisible();
  expect(page.url()).toBe(before);
  // T3: số đo thật, không suy từ ảnh PDF.
  await expect(popup.locator('.project-ai-panel')).toHaveCSS(
    'font-size',
    '16px',
  );
  await expect(popup.locator('.project-ai-panel')).toHaveCSS(
    'line-height',
    '26px',
  );
  const input = popup.getByLabel('Câu hỏi AI', { exact: true });
  await expect(input).toHaveCSS('font-size', '16px');
  const initialHeight = await input.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(initialHeight).toBeGreaterThanOrEqual(100);
  expect(initialHeight).toBeLessThanOrEqual(120);
  await popup
    .getByLabel('Câu hỏi AI', { exact: true })
    .fill('Nháp RAM riêng toàn dự án');
  const unavailable = popup
    .locator('details')
    .filter({ hasText: 'Model chưa sẵn sàng' });
  await unavailable.locator('summary').click();
  await unavailable.locator('summary').press('Escape');
  await expect(unavailable).not.toHaveAttribute('open', '');
  await expect(popup).toBeVisible();
  await input.press('Escape');
  await expect(popup).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Hỏi Galaxy AI', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Mở Hỏi AI dự án' }).click();
  await expect(input).toHaveValue('Nháp RAM riêng toàn dự án');
  await popup.getByRole('button', { name: 'Thu nhỏ AI' }).click();
  await expect(popup).not.toBeVisible();
  await page.getByRole('button', { name: 'Mở Hỏi AI dự án' }).click();
  await expect(popup.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue(
    'Nháp RAM riêng toàn dự án',
  );
  await popup.getByRole('button', { name: 'Mở rộng AI', exact: true }).click();
  await expect(popup).toHaveClass(/is-expanded/);
  await popup.getByRole('button', { name: 'Đóng AI', exact: true }).click();
  await page.getByRole('link', { name: 'Hạng mục', exact: true }).click();
  await page
    .getByRole('button', { name: 'Hỏi Galaxy AI', exact: true })
    .click();
  await expect(popup.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue(
    'Nháp RAM riêng toàn dự án',
  );
  for (const tab of ['Làm việc', 'Hồ sơ & kiến thức']) {
    await popup.getByRole('button', { name: 'Đóng AI', exact: true }).click();
    await page.getByRole('link', { name: tab, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/projects/${fixture.projectId}/${tab === 'Làm việc' ? 'work' : 'files'}$`,
      ),
    );
    const route = page.url();
    await page
      .getByRole('button', { name: 'Hỏi Galaxy AI', exact: true })
      .click();
    await expect(popup.getByLabel('Câu hỏi AI', { exact: true })).toHaveValue(
      'Nháp RAM riêng toàn dự án',
    );
    expect(page.url()).toBe(route);
  }
  const measurements = [];
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
    { width: 683, height: 384 },
    { width: 390, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(popup).toBeVisible();
    const input = popup.getByLabel('Câu hỏi AI', { exact: true });
    await input.fill('Nháp RAM riêng toàn dự án');
    await expect(input).toHaveCSS('font-size', '16px');
    await expect(input).toHaveCSS('line-height', '26px');
    const geometry = await popup.evaluate((node) => {
      const input = node.querySelector('textarea')!,
        send = node.querySelector('button[type="submit"]')!;
      const rect = node.getBoundingClientRect(),
        field = input.getBoundingClientRect(),
        button = send.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        fieldHeight: field.height,
        sendBottom: button.bottom,
        sendHeight: button.height,
        font: getComputedStyle(input).fontSize,
        lineHeight: getComputedStyle(input).lineHeight,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.sendBottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.sendHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.fieldHeight).toBeGreaterThanOrEqual(100);
    expect(geometry.fieldHeight).toBeLessThanOrEqual(120);
    await input.fill(
      Array.from(
        { length: 24 },
        (_, i) => `Dòng dài ${i} ${'nguồn-tiếng-Việt-'.repeat(6)}`,
      ).join('\n'),
    );
    const expandedHeight = await input.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(expandedHeight).toBeGreaterThanOrEqual(112);
    expect(expandedHeight).toBeLessThanOrEqual(200);
    if (viewport.height >= 600) expect(expandedHeight).toBe(200);
    expect(
      await popup
        .locator('button[type="submit"]')
        .evaluate((element) => element.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(viewport.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await input.fill('Nháp RAM riêng toàn dự án');
    measurements.push({ viewport, ...geometry });
    await page.screenshot({
      path: info.outputPath(
        `ai-popup-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }
  await info.attach('computed-chat-styles', {
    body: JSON.stringify(measurements, null, 2),
    contentType: 'application/json',
  });
  writeFileSync(
    info.outputPath('computed-chat-styles.json'),
    JSON.stringify(measurements, null, 2),
  );
  if (process.env.GALAXY_NATIVE_ZOOM === 'true') {
    // Context không emulation để zoom native thay đổi CSS viewport thật.
    const zoomContext = await page
      .context()
      .browser()!
      .newContext({ viewport: null, ignoreHTTPSErrors: true });
    await zoomContext.addCookies(await page.context().cookies());
    const zoomPage = await zoomContext.newPage();
    await zoomPage.goto(page.url());
    await zoomPage
      .getByRole('button', { name: 'Hỏi Galaxy AI', exact: true })
      .click();
    const zoomPopup = zoomPage.getByRole('dialog', { name: /Galaxy AI/ });
    await zoomPopup
      .getByLabel('Câu hỏi AI', { exact: true })
      .fill('Nghiệm thu chữ tiếng Việt ở zoom 200%');

    const cdp = await zoomPage.context().newCDPSession(zoomPage);
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    expect(targetInfo.url).toContain('localhost:33003');
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget', {
      targetId: targetInfo.targetId,
    });
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal' },
    });
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { width: 1440, height: 1000 },
    });
    await expect
      .poll(() => zoomPage.evaluate(() => innerWidth))
      .toBeGreaterThan(1300);
    await zoomPage.evaluate(() => {
      document.title = 'Galaxy AI fixture zoom 200';
    });
    await zoomPage.bringToFront();
    const activate =
      "Add-Type -AssemblyName System.Windows.Forms; $ws=New-Object -ComObject WScript.Shell; if(-not $ws.AppActivate('Galaxy AI fixture zoom 200')){throw 'Wrong fixture window'}; Start-Sleep -Milliseconds 300; ";
    const keys = (command: string) =>
      spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', activate + command],
        { encoding: 'utf8', timeout: 10000 },
      );
    try {
      expect(
        keys(
          "[System.Windows.Forms.SendKeys]::SendWait('^0'); 1..5 | ForEach-Object {[System.Windows.Forms.SendKeys]::SendWait('^{ADD}'); Start-Sleep -Milliseconds 100}",
        ).status,
      ).toBe(0);
      await expect
        .poll(() => zoomPage.evaluate(() => devicePixelRatio))
        .toBe(2);
      await expect
        .poll(() =>
          zoomPopup.evaluate(
            (node) =>
              node
                .querySelector('button[type="submit"]')!
                .getBoundingClientRect().bottom <= innerHeight,
          ),
        )
        .toBe(true);
      const zoom = await zoomPopup.evaluate((node) => ({
        ratio: devicePixelRatio,
        scale: visualViewport!.scale,
        width: innerWidth,
        height: innerHeight,
        sendBottom: node
          .querySelector('button[type="submit"]')!
          .getBoundingClientRect().bottom,
        font: getComputedStyle(node.querySelector('textarea')!).fontSize,
      }));
      expect(zoom.scale).toBe(1);
      expect(zoom.font).toBe('16px');
      expect(zoom.sendBottom).toBeLessThanOrEqual(zoom.height);
      writeFileSync(
        info.outputPath('chrome-native-zoom-200.json'),
        JSON.stringify(zoom, null, 2),
      );
      await info.attach('chrome-native-zoom-200', {
        body: JSON.stringify(zoom),
        contentType: 'application/json',
      });
      await zoomPage.screenshot({
        path: info.outputPath('ai-popup-native-zoom-200.png'),
      });
    } finally {
      expect(
        keys("[System.Windows.Forms.SendKeys]::SendWait('^0')").status,
      ).toBe(0);
      await expect
        .poll(() => zoomPage.evaluate(() => devicePixelRatio))
        .toBe(1);
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds:
          bounds.windowState === 'normal'
            ? bounds
            : { windowState: bounds.windowState },
      });
      await cdp.detach();
      await zoomContext.close();
    }
  }
});
