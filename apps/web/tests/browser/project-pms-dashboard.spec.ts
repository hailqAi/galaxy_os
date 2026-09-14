import { expect, test, type Locator, type Page } from '@playwright/test';

const projectId = '20000000-0000-4000-8000-000000000291';
const projectName = 'Playwright Stage One Acceptance';
const password = 'Playwright-password-1';
const pm = 'playwright.stage-one.pm@example.test';
const outsider = 'playwright.stage-one.outsider@example.test';
const viewports = [
  { name: '1536x864', width: 1536, height: 864 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;

function assertNoClientErrors(page: Page, allowDeniedResources = false) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return () =>
    expect(
      errors.filter(
        (error) =>
          !allowDeniedResources ||
          !/^Failed to load resource: the server responded with a status of (403|404)/.test(
            error,
          ),
      ),
    ).toEqual([]);
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function capture(page: Page, name: string, focus?: Locator) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await focus?.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `stage-one-test-results/pms-dashboard/${viewport.name}/${name}.png`,
      fullPage: false,
    });
  }
}

test('PM views, filters, and opens the real Project dashboard', async ({
  page,
}) => {
  const assertClean = assertNoClientErrors(page);
  await login(page, pm);
  await page.goto('/projects');
  await expect(
    page.getByRole('heading', { name: 'TỔNG QUAN DỰ ÁN' }),
  ).toBeVisible();
  const fixtureRow = page
    .locator('tbody tr')
    .filter({ has: page.getByRole('link', { name: projectName }) });
  await expect(fixtureRow).toContainText('Giai đoạn 1');
  await expect(fixtureRow).not.toContainText('STAGE_1');
  await page.getByLabel('Giai đoạn hiện tại').selectOption('STAGE_1');
  await expect(page.getByRole('link', { name: projectName })).toBeVisible();
  await expect(page.getByText('Tổng dự án', { exact: true })).toBeVisible();
  await expect(page.getByText('Đang thực hiện', { exact: true })).toBeVisible();
  await expect(page.getByText('Cần xử lý', { exact: true })).toBeVisible();
  await expect(page.getByText('Đã hoàn thành', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'TIẾN ĐỘ DANH MỤC DỰ ÁN' }),
  ).toBeVisible();
  await expect(
    page.getByText('Phê duyệt đang chờ', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Bảo hành/bảo trì đến hạn', { exact: true }),
  ).toBeVisible();
  for (const value of [
    'VND 1.250.000',
    'VND 250.000',
    'VND 750.000',
    'VND 800.000',
  ])
    await expect(page.getByText(value, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Bảo hành 0 · Dịch vụ 1', { exact: true }),
  ).toBeVisible();
  await capture(page, 'dashboard');
  await page.getByRole('link', { name: projectName }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/stage-1`);
  await expect(page.getByText('GIAI ĐOẠN 1', { exact: true })).toBeVisible();
  await page.goto('/projects');
  await page.getByLabel('Giai đoạn hiện tại').selectOption('STAGE_5');
  const emptyState = page.getByText('Chưa có dự án phù hợp.');
  await expect(emptyState).toBeVisible();
  await capture(page, 'empty', emptyState);
  assertClean();
});

test('outsider cannot discover the fixture Project from a direct route', async ({
  page,
}) => {
  const assertClean = assertNoClientErrors(page, true);
  await login(page, outsider);
  await page.goto('/projects');
  await expect(page.locator('body')).not.toContainText(projectName);
  for (const label of [
    'Tổng giá trị',
    'Giá trị hợp đồng',
    'Tổng đã thu',
    'Công nợ phải thu',
    'Công nợ phải trả',
  ])
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  await page.goto(`/projects/${projectId}`);
  await expect(page).toHaveURL(`/projects/${projectId}/stage-1`);
  await expect(page.locator('body')).toContainText(
    /Project not found|Required permission is missing|Bạn không có quyền thực hiện thao tác này|Không tìm thấy dự án/i,
  );
  await expect(page.locator('body')).not.toContainText(projectName);
  await page.goto(`/projects/${projectId}/stage-1`);
  await expect(page.locator('body')).toContainText(
    /Project not found|Required permission is missing|Bạn không có quyền thực hiện thao tác này|Không tìm thấy dự án/i,
  );
  await expect(page.locator('body')).not.toContainText(projectName);
  await capture(page, 'forbidden');
  assertClean();
});
