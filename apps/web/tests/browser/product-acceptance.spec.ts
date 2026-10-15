import {
  expect,
  Page,
  request as playwrightRequest,
  test,
} from '@playwright/test';

const projectId = '20000000-0000-4000-8000-000000000201';
const productId = '30000000-0000-4000-8000-000000000302';
const variantId = '30000000-0000-4000-8000-000000000303';
const supplierId = '30000000-0000-4000-8000-000000000304';
const locationId = '20000000-0000-4000-8000-000000000202';
const documentId = '20000000-0000-4000-8000-000000000203';
const password = 'Playwright-password-1';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
  await page.getByLabel('Email đăng nhập').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function logout(page: Page) {
  await page.evaluate(async () => {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  });
}

async function createProduct(page: Page, code: string) {
  return page.evaluate(
    async (input) => {
      const { projectId: targetProjectId, ...body } = input;
      const response = await fetch(
        `/api/v1/projects/${targetProjectId}/products`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      return (await response.json()) as { id: string };
    },
    {
      projectId,
      code,
      locationId,
      positionName: 'Vị trí kiểm thử',
      productId,
      variantId,
      supplierId,
      material: 'Gỗ sồi',
      finish: 'Sơn mờ',
      width: 1200,
      depth: 600,
      height: 750,
      quantity: 1,
      unit: 'cái',
    },
  );
}

test('Flow 1 — creates a Product draft with file and activity', async ({
  page,
}) => {
  await login(page, 'playwright.creator@example.test');
  await page.goto('/projects/mine');
  await page
    .getByRole('link', { name: 'Playwright Product Acceptance' })
    .click();
  await expect(page).toHaveURL(`/projects/${projectId}/stage-1`);
  await page.goto(`/projects/${projectId}/products`);
  await page.getByRole('link', { name: 'Tạo dòng sản phẩm' }).click();
  await page.getByLabel('Khu vực/phòng').selectOption(locationId);
  await page.getByLabel('Vị trí cụ thể').fill('Cạnh cửa sổ');
  await page.getByLabel('Product Master').selectOption(productId);
  await page.getByLabel('Variant').selectOption(variantId);
  await page.getByLabel('material').fill('Gỗ sồi');
  await page.getByLabel('finish').fill('Sơn mờ');
  await page.getByLabel('width').fill('1200');
  await page.getByLabel('depth').fill('600');
  await page.getByLabel('height').fill('750');
  await page.getByLabel('Số lượng').fill('2');
  await page.getByLabel('Đơn vị', { exact: true }).fill('cái');
  await page.getByLabel('Nhà cung cấp').selectOption(supplierId);
  await page.getByLabel('Tài liệu kỹ thuật').setInputFiles({
    name: 'product-flow-1.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('product acceptance'),
  });
  await page.getByPlaceholder('Mã dòng sản phẩm').fill('PW-LINE-FLOW-1');
  await page.getByRole('button', { name: 'Lưu nháp' }).click();
  await expect(page).toHaveURL(/\/projects\/.+\/products\/.+/);
  await expect(page.getByText('Cạnh cửa sổ')).toBeVisible();
  await expect(page.getByText('2 cái')).toBeVisible();
  await expect(page.getByText('product-flow-1.txt')).toBeVisible();
  await expect(page.getByText('PROJECT_PRODUCT_CREATED')).toBeVisible();
  await expect(page.getByText('FILE_UPLOADED')).toBeVisible();
});

test('Flow 2 — approves Product and creates a revision', async ({ page }) => {
  await login(page, 'playwright.creator@example.test');
  const line = await createProduct(page, 'PW-LINE-FLOW-2');
  await page.goto(`/projects/${projectId}/products/${line.id}`);
  for (const heading of ['Khách hàng', 'Kỹ thuật', 'Thương mại'])
    await page
      .getByRole('heading', { name: heading })
      .locator('..')
      .getByRole('button', { name: 'Gửi phê duyệt' })
      .click();

  await logout(page);
  await login(page, 'playwright.approver@example.test');
  await page.goto('/notifications');
  await page.getByRole('link', { name: 'TECHNICAL: PW-LINE-FLOW-2' }).click();
  const customer = page
    .getByRole('heading', { name: 'Khách hàng' })
    .locator('..');
  await customer.getByLabel('Người xác nhận bên ngoài').fill('Khách hàng Test');
  await customer.getByRole('button', { name: 'Phê duyệt' }).click();
  for (const heading of ['Kỹ thuật', 'Thương mại'])
    await page
      .getByRole('heading', { name: heading })
      .locator('..')
      .getByRole('button', { name: 'Phê duyệt' })
      .click();
  await expect(page.getByText('READY_FOR_ESTIMATE')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chỉnh sửa nháp' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Tạo revision' }).click();
  await expect(page.getByText(/Revision 2 · Có thể chỉnh sửa/)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Chỉnh sửa nháp' }),
  ).toBeVisible();
  await expect(page.getByText(/Revision 1 · Đã khóa/)).toBeVisible();
});

test('Flow 3 — hides Project data from a non-member', async ({ page }) => {
  await login(page, 'playwright.creator@example.test');
  const line = await createProduct(page, 'PW-LINE-FLOW-3');
  await logout(page);
  await login(page, 'playwright.outsider@example.test');
  await page.goto(`/projects/${projectId}`);
  await expect(
    page.getByText('Project not found', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Playwright Product Acceptance')).toHaveCount(0);
  await page.goto(`/projects/${projectId}/products/${line.id}`);
  await expect(
    page.getByText('Project not found', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('PW-LINE-FLOW-3')).toHaveCount(0);
  const file = await page.request.get(
    '/api/v1/files/00000000-0000-4000-8000-000000000000/download',
  );
  expect([401, 403, 404]).toContain(file.status());
});

test('Flow 4 — approves a required document and refreshes readiness', async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  const collectErrors = (target: Page) => {
    target.on('pageerror', (error) => errors.push(error.message));
    target.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  };
  collectErrors(page);
  await login(page, 'playwright.creator@example.test');
  const legacyPath = `/projects/${projectId}/documents/${documentId}?stageKey=STAGE_1`;
  const canonicalPath = `/projects/${projectId}/stage-1#document-${documentId}`;
  await page.goto(canonicalPath);
  let row = page.locator(`[id="required-document-${documentId}"]`);
  await expect(row).toBeInViewport();
  await row.getByRole('button', { name: 'Tải hồ sơ', exact: true }).click();
  const upload = page.getByRole('dialog', { name: 'TẢI LÊN HỒ SƠ' });
  const constraintsResponse = await page.request.get(
    '/api/v1/uploads/constraints',
  );
  expect(constraintsResponse.ok()).toBe(true);
  const constraints = (await constraintsResponse.json()) as {
    maxBytes: number;
    allowedExtensions: string[];
  };
  await expect(
    upload.getByText(
      `Tối đa ${constraints.maxBytes} byte; ${constraints.allowedExtensions.join(', ')}.`,
    ),
  ).toBeVisible();
  await upload.getByLabel('Chọn tệp').setInputFiles({
    name: 'required-document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-required document acceptance'),
  });
  const uploadButton = upload.getByRole('button', {
    name: 'Tải tệp',
    exact: true,
  });
  await expect(uploadButton).toBeEnabled();
  await uploadButton.click();
  await expect(upload).not.toBeVisible();
  row = page.locator(`[id="required-document-${documentId}"]`);
  await expect(row).toContainText('Đã tải lên');
  const submit = await page.request.post(
    `/api/v1/projects/${projectId}/required-documents/${documentId}/submit`,
    { data: {}, headers: { origin: 'http://127.0.0.1:3000' } },
  );
  if (!submit.ok())
    throw new Error(`Submit failed ${submit.status()}: ${await submit.text()}`);
  await page.reload();
  row = page.locator(`[id="required-document-${documentId}"]`);
  await expect(row).toContainText('Đang chờ phê duyệt');

  await logout(page);
  await login(page, 'playwright.approver@example.test');
  await page.goto('/notifications');
  await page.getByRole('link', { name: 'Hồ sơ kỹ thuật Playwright' }).click();
  await expect(page).toHaveURL(
    `/projects/${projectId}/stage-1#document-${documentId}`,
  );
  row = page.locator(`[id="required-document-${documentId}"]`);
  await expect(row).toBeInViewport();
  await row.getByText('Thao tác khác', { exact: true }).click();
  await row.getByRole('button', { name: 'Phê duyệt' }).click();
  await expect(row).toContainText('Đã phê duyệt');
  expect(errors).toEqual([]);

  const storageState = await context.storageState();
  await page.close();
  const redirectRequest = await playwrightRequest.newContext({
    baseURL: 'http://127.0.0.1:3000',
    storageState,
  });
  try {
    const redirect = await redirectRequest.get(legacyPath, { maxRedirects: 0 });
    expect(redirect.status()).toBe(200);
    expect(redirect.headers()['content-type']).toContain('text/html');
    const redirectPayload = await redirect.text();
    expect(redirectPayload).toContain('NEXT_REDIRECT');
    expect(redirectPayload).toContain(canonicalPath);
  } finally {
    await redirectRequest.dispose();
  }
});
