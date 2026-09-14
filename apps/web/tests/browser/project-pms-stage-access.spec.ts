import { expect, test, type Page } from '@playwright/test';
import { captureVisual } from './visual-evidence';

const stageOneProject = '20000000-0000-4000-8000-000000000291';
const stageFourProject = '20000000-0000-4000-8000-000000000293';
const password = 'Playwright-password-1';
const pm = 'playwright.stage-one.pm@example.test';
const outsider = 'playwright.stage-one.outsider@example.test';

function assertNoClientErrors(page: Page, allowDeniedResources = false) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500)
      errors.push(
        `${response.request().method()} ${response.url()} -> ${response.status()}`,
      );
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return () =>
    expect(
      errors.filter(
        (error) =>
          !/Failed to execute 'measure'.*ProjectPage.*negative time stamp/.test(
            error,
          ) &&
          (!allowDeniedResources ||
            !/^Failed to load resource: the server responded with a status of (403|404)/.test(
              error,
            )),
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

test('Flow F — incomplete Stage 1 does not redirect or add inherited warnings to Stages 2–5', async ({
  page,
}, testInfo) => {
  const assertClean = assertNoClientErrors(page);
  await login(page, pm);

  await page.goto(`/projects/${stageOneProject}/stage-1?step=1`);
  await expect(page.getByText('CHI TIẾT BƯỚC 1')).toBeVisible();
  await expect(page.getByRole('link', { name: /BƯỚC 1/ })).not.toContainText(
    'Hoàn thành',
  );

  for (const stage of [2, 3, 4, 5]) {
    const suffix = stage === 2 ? '?step=1' : '';
    await page.goto(`/projects/${stageOneProject}/stage-${stage}${suffix}`);
    await expect(page).toHaveURL(
      `/projects/${stageOneProject}/stage-${stage}${suffix}`,
    );
    if (stage === 2)
      await expect(
        page.getByRole('heading', {
          name: 'THIẾT KẾ, SẢN PHẨM & DỰ TOÁN',
        }),
      ).toBeVisible();
    else
      await expect(
        page.locator(`[data-project-stage-header="STAGE_${stage}"]`),
      ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('DỮ LIỆU KẾ THỪA');
    await expect(page.locator('body')).not.toContainText(
      /Dữ liệu STAGE .*chưa hoàn tất|giai đoạn trước chưa hoàn tất/i,
    );
    if (stage === 4)
      await captureVisual(page, testInfo, '13-stage-four-no-inherited');
  }

  assertClean();
});

test('base Project opens Stage 1 and stage navigation remains reversible without mutating the current stage', async ({
  page,
}) => {
  const assertClean = assertNoClientErrors(page);
  await login(page, pm);
  await page.goto(`/projects/${stageFourProject}`);
  await expect(page).toHaveURL(`/projects/${stageFourProject}/stage-1`);
  await page.locator('[data-stage-control="STAGE_4"]').click();
  await expect(page).toHaveURL(`/projects/${stageFourProject}/stage-4`);
  await page.locator('[data-stage-control="STAGE_1"]').click();
  await expect(page).toHaveURL(`/projects/${stageFourProject}/stage-1`);
  const navigation = page.getByRole('navigation', {
    name: 'Giai đoạn dự án',
  });
  await expect(navigation.getByRole('link')).toHaveCount(5);
  await expect(navigation.getByRole('link', { name: 'GĐ1' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const workspace = await page.request.get(
    `/api/v1/projects/${stageFourProject}/workspace-summary`,
  );
  expect(workspace.ok()).toBe(true);
  expect((await workspace.json()).project.currentStage).toBe('STAGE_4');
  assertClean();
});

test('Flow I — outsider remains blocked from every direct later-stage route', async ({
  page,
}) => {
  const assertClean = assertNoClientErrors(page, true);
  await login(page, outsider);
  for (const stage of [2, 3, 4, 5]) {
    await page.goto(`/projects/${stageOneProject}/stage-${stage}`);
    await expect(page.locator('body')).toContainText(
      /Project not found|Required permission is missing|Bạn không có quyền thực hiện thao tác này|Không tìm thấy dự án/i,
    );
    await expect(page.locator('body')).not.toContainText(
      'Playwright Stage One Acceptance',
    );
  }
  assertClean();
});
