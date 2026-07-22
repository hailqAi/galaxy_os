import { expect, test } from '@playwright/test';

const failures = (messages: string[]) =>
  messages.filter(
    (message) =>
      message.includes('Content Security Policy') ||
      message.includes('self.__next_r') ||
      message.includes('Hydration failed'),
  );

test('hydrates Login and toggles the password without submitting', async ({
  page,
}) => {
  const consoleMessages: string[] = [];
  let requests = 0;
  page.on('console', (message) => consoleMessages.push(message.text()));
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/auth/login')) requests++;
  });
  await page.goto('/login');
  const password = page.getByLabel('Mật khẩu', { exact: true });
  await password.fill('value-stays-present');
  const toggle = page.getByRole('button', { name: 'Hiện mật khẩu' });
  await expect(toggle).toHaveAttribute('type', 'button');
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('value-stays-present');
  const hide = page.getByRole('button', { name: 'Ẩn mật khẩu' });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await hide.press('Enter');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('value-stays-present');
  expect(requests).toBe(0);
  expect(failures(consoleMessages)).toEqual([]);
});

test('submits invalid credentials once to the same origin and shows the safe error', async ({
  page,
}) => {
  const loginRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/auth/login'))
      loginRequests.push(request.url());
  });
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill('invalid@example.test');
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill('invalid-fixture-value');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(
    page.getByText('Email hoặc mật khẩu không đúng.', { exact: true }),
  ).toBeVisible();
  expect(loginRequests).toEqual(['http://127.0.0.1:3000/api/v1/auth/login']);
  expect(page.url()).not.toContain('invalid@example.test');
  expect(page.url()).not.toContain('invalid-fixture-value');
});

test('shows a safe error when the Login request cannot complete', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/login', (route) => route.abort());
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill('person@example.test');
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill('network-fixture-value');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(
    page.getByText('Không thể đăng nhập lúc này. Vui lòng thử lại.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('stores the session, loads CurrentActor, redirects, and logs out', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill('valid@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3000/');
  await expect(page.getByRole('link', { name: 'Browser Test' })).toBeVisible();
  const cookies = await context.cookies();
  expect(
    cookies.find((cookie) => cookie.name === 'galaxy_session'),
  ).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  const oldCookie = cookies.find((cookie) => cookie.name === 'galaxy_session')!;
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'galaxy_session',
    ),
  ).toBe(false);
  const oldSession = await page.request.get('/api/v1/me', {
    headers: { cookie: `${oldCookie.name}=${oldCookie.value}` },
  });
  expect(oldSession.status()).toBe(401);
});

test('redirects a temporary-password actor to password change', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email đăng nhập').fill('temporary@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/account\/change-password$/);
});
