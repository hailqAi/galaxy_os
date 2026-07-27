import { expect, test } from '@playwright/test';

test('renders user pages and ignores a stale access-preview response', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });

  const login = await page.request.post('/api/v1/auth/login', {
    headers: { origin: 'http://127.0.0.1:3000' },
    data: {
      email: 'valid@example.test',
      password: 'fixture-password',
    },
  });
  expect(login.ok()).toBe(true);

  await page.goto('/settings/users');
  await expect(page.locator('body')).toContainText('User Detail Test');
  await page.goto('/settings/users/cf9b5f15-5fa2-4910-b0a6-671f54d345e6');
  await expect(
    page.getByRole('heading', { name: 'User Detail Test' }),
  ).toBeVisible();

  const stalePreview = page.waitForResponse((response) =>
    response.url().includes('/access-preview'),
  );
  await page.getByRole('button', { name: 'Xem trước truy cập' }).click();
  await page.getByRole('button', { name: 'Trường tùy chỉnh' }).click();
  await expect(
    page.getByText('Không có trường dữ liệu tùy chỉnh'),
  ).toBeVisible();
  await stalePreview;
  await expect(
    page.getByText('Không có trường dữ liệu tùy chỉnh'),
  ).toBeVisible();

  for (const tab of ['Quyền hạn', 'Phiên', 'Hoạt động']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect(
      page.getByText('Đang tải dữ liệu riêng cho tab này…'),
    ).toBeHidden();
  }
  expect(failures).toEqual([]);
});
