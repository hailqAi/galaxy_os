import { expect, test, type Page } from '@playwright/test';
import { createM2BrowserFixture } from '../../../api/test/m2-browser.fixture';

let fixture: Awaited<ReturnType<typeof createM2BrowserFixture>>;
test.beforeAll(async () => {
  fixture = await createM2BrowserFixture();
});
async function login(page: Page, actor: string) {
  await page.goto('/login?returnTo=/work');
  await page.getByLabel('Email đăng nhập').fill(fixture.users[actor]!.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/work$/);
  await page.getByRole('link', { name: 'Project browser M2-A' }).click();
}
test('sender persists text/file across reload; viewer cannot send; revoke clears open content', async ({
  browser,
}) => {
  const sender = await browser.newContext(),
    viewer = await browser.newContext();
  const page = await sender.newPage(),
    readOnly = await viewer.newPage();
  try {
    await login(page, 'sender');
    await page.getByRole('button', { name: /Nội bộ thử nghiệm/ }).click();
    await expect(page.getByLabel('Tin nhắn', { exact: true })).toBeEnabled();
    await page
      .getByLabel('Tin nhắn', { exact: true })
      .fill('Tin lưu thật từ trình duyệt');
    await page.getByRole('button', { name: 'Gửi tin', exact: true }).click();
    await expect(
      page.getByText('Tin lưu thật từ trình duyệt', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Nội bộ thử nghiệm/ }).click();
    await expect(
      page.getByText('Tin lưu thật từ trình duyệt', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('File đính kèm').setInputFiles({
      name: 'browser.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('File từ browser'),
    });
    await page.getByRole('button', { name: 'Gửi file', exact: true }).click();
    await expect(page.getByText(/Đã lưu file: browser.txt/)).toBeVisible();
    await page
      .getByLabel('Tin nhắn', { exact: true })
      .fill('Gửi file kiểm thử');
    await page.getByRole('button', { name: 'Gửi tin', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'browser.txt', exact: true }),
    ).toBeVisible();
    const download = await page.request.get(
      (await page
        .getByRole('link', { name: 'browser.txt', exact: true })
        .getAttribute('href')) ?? '',
    );
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe('File từ browser');
    await login(readOnly, 'viewer');
    await readOnly.getByRole('button', { name: /Nội bộ thử nghiệm/ }).click();
    await expect(readOnly.getByText('Bạn chỉ có quyền xem')).toBeVisible();
    await expect(
      readOnly.getByLabel('Tin nhắn', { exact: true }),
    ).toBeDisabled();
    const revoke = await fetch(
      `${process.env.INTERNAL_API_URL}/project-chat/rooms/${fixture.roomId}/grants/${fixture.senderGrantId}/revoke`,
      {
        method: 'POST',
        headers: {
          Cookie: fixture.users.manager!.cookie,
          'X-Chat-Actor': fixture.users.manager!.id,
        },
      },
    );
    expect(revoke.status).toBe(201);
    await expect(
      page.getByText('Tin lưu thật từ trình duyệt', { exact: true }),
    ).toHaveCount(0);
  } finally {
    await sender.close();
    await viewer.close();
  }
});
test('mobile guest has only its room, sends real text and uploads external source without AI', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'guest');
  await expect(
    page.getByRole('button', { name: /Nội bộ thử nghiệm/ }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
  await expect(page.getByLabel('Tin nhắn', { exact: true })).toBeEnabled();
  await page
    .getByLabel('Tin nhắn', { exact: true })
    .fill('<script>window.m2Injected=1</script>');
  await page.getByRole('button', { name: 'Gửi tin', exact: true }).click();
  await expect(
    page.getByText('<script>window.m2Injected=1</script>', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Reflect.get(window, 'm2Injected')),
  ).toBeUndefined();
  await page.getByLabel('File đính kèm').setInputFiles({
    name: 'khach.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('File khách'),
  });
  await page.getByRole('button', { name: 'Gửi file', exact: true }).click();
  await expect(page.getByText(/Đã lưu file: khach.txt/)).toBeVisible();
  await page
    .getByLabel('Tin nhắn', { exact: true })
    .fill('Nguồn do khách cung cấp');
  await page.getByRole('button', { name: 'Gửi tin', exact: true }).click();
  await expect(
    page.getByText(/Nguồn khách, chưa được Galaxy xác nhận/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /GPT|AI/ })).toHaveCount(0);
});
test('explicit Project admin manages access without receiving conversation content', async ({
  page,
}) => {
  await login(page, 'manager');
  await page.getByText('Quản trị cuộc trao đổi', { exact: true }).click();
  await expect(page.getByLabel('Người được cấp')).toBeVisible();
  await expect(page.getByLabel('Tin nhắn', { exact: true })).toHaveCount(0);
  await page.getByLabel('Tên cuộc trao đổi mới').fill('Phòng tạo từ UI');
  await page
    .getByRole('button', { name: 'Tạo cuộc trao đổi', exact: true })
    .click();
  await expect(
    page.getByText('Đã tạo phòng; chưa tự cấp quyền đọc.', { exact: true }),
  ).toBeVisible();
});

test('management without an open room clears identities after a cross-tab account change', async ({
  page,
}) => {
  await login(page, 'manager');
  await page.getByText('Quản trị cuộc trao đổi', { exact: true }).click();
  await expect(page.getByLabel('Người được cấp')).toBeVisible();
  const other = await page.context().newPage();
  await other.goto('/work');
  await other.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await login(other, 'guest');
  await expect(page.getByLabel('Người được cấp')).toHaveCount(0);
  await other.close();
});

test('preparer and distinct publisher release reviewed proposal to the correct customer room', async ({
  browser,
}) => {
  const preparer = await browser.newContext(),
    publisher = await browser.newContext(),
    customer = await browser.newContext();
  try {
    const a = await preparer.newPage(),
      b = await publisher.newPage(),
      c = await customer.newPage();
    await login(a, 'sender');
    await a.getByRole('button', { name: /Khách thử nghiệm/ }).click();
    await a
      .getByLabel('Nguồn phương án đã duyệt')
      .selectOption(fixture.sourceId);
    await a
      .getByRole('button', { name: 'Chuẩn bị phát hành', exact: true })
      .click();
    await expect(
      a.getByText('Chờ kiểm tra: phuong-an-browser.txt · v1'),
    ).toBeVisible();
    await expect(
      a.getByRole('button', { name: 'Xác nhận phát hành', exact: true }),
    ).toHaveCount(0);
    await login(b, 'publisher');
    await b.getByRole('button', { name: /Khách thử nghiệm/ }).click();
    await b
      .getByRole('button', {
        name: 'Kiểm tra nguồn và người nhận',
        exact: true,
      })
      .click();
    await expect(
      b.getByText('Phương án browser đã duyệt cho khách', { exact: true }),
    ).toBeVisible();
    await expect(b.getByText(/M2 guest · Khách\/đối tác/)).toBeVisible();
    await b
      .getByLabel(
        'Tôi đã kiểm tra nội dung, phiên bản và đúng người nhận; không có thông tin nội bộ bị cấm.',
      )
      .check();
    await b
      .getByRole('button', { name: 'Xác nhận phát hành', exact: true })
      .click();
    await login(c, 'guest');
    await c.getByRole('button', { name: /Khách thử nghiệm/ }).click();
    const link = c.getByRole('link', {
      name: 'phuong-an-browser.txt · v1',
      exact: true,
    });
    await expect(link).toBeVisible();
    const downloaded = await c.request.get((await link.getAttribute('href'))!);
    expect(downloaded.status()).toBe(200);
    expect(await downloaded.text()).toBe(
      'Phương án browser đã duyệt cho khách',
    );
    await a
      .getByRole('button', { name: 'Chuẩn bị phát hành', exact: true })
      .click();
    await expect(
      b.getByRole('button', {
        name: 'Kiểm tra nguồn và người nhận',
        exact: true,
      }),
    ).toBeVisible();
    await b
      .getByRole('button', {
        name: 'Kiểm tra nguồn và người nhận',
        exact: true,
      })
      .click();
    await expect(
      b.getByText('Phương án browser đã duyệt cho khách', { exact: true }),
    ).toBeVisible();
    await fixture.revokePublisherSource();
    await expect(
      b.getByText('Phương án browser đã duyệt cho khách', { exact: true }),
    ).toHaveCount(0);
    await expect(
      b.getByRole('link', { name: 'Mở đúng bản cần kiểm tra' }),
    ).toHaveCount(0);
  } finally {
    await preparer.close();
    await publisher.close();
    await customer.close();
  }
});

test('room-only LOCK preserves draft; changing groups warns before discarding it', async ({
  page,
}) => {
  const response = await fetch(
    `${process.env.INTERNAL_API_URL}/project-chat/rooms/${fixture.roomId}/grants`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: fixture.users.manager!.cookie,
        'X-Chat-Actor': fixture.users.manager!.id,
      },
      body: JSON.stringify({
        userId: fixture.users.viewer!.id,
        actions: ['READ', 'SEND', 'LOCK'],
      }),
    },
  );
  expect(response.status).toBe(201);
  await login(page, 'viewer');
  await page.getByRole('button', { name: /Nội bộ thử nghiệm/ }).click();
  const draft = page.getByLabel('Tin nhắn', { exact: true });
  await expect(draft).toBeEnabled();
  await draft.fill('Nháp chưa gửi, không được mất');
  await page.getByRole('button', { name: 'Khóa gửi tin', exact: true }).click();
  await expect(draft).toHaveValue('Nháp chưa gửi, không được mất');
  await expect(draft).toBeDisabled();
  await page
    .getByRole('button', { name: 'Mở lại gửi tin', exact: true })
    .click();
  await expect(draft).toBeEnabled();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('button', { name: 'Hợp đồng & tài chính', exact: true })
    .click();
  await expect(draft).toHaveValue('Nháp chưa gửi, không được mất');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: '← Các dự án được cấp' }).click();
  await expect(draft).toHaveValue('Nháp chưa gửi, không được mất');
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Hợp đồng & tài chính', exact: true })
    .click();
  await expect(draft).toHaveCount(0);
});

test('domain link choices disappear when only domain permission is revoked', async ({
  page,
}) => {
  await login(page, 'manager');
  await page.getByText('Quản trị cuộc trao đổi', { exact: true }).click();
  await expect(
    page.getByRole('option', { name: 'Task fixture nguồn chung' }),
  ).toHaveCount(1);
  await fixture.revokeManagerTask();
  await expect(
    page.getByRole('option', { name: 'Task fixture nguồn chung' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Người được cấp')).toBeVisible();
});

test('revoking Project administration clears the open management roster', async ({
  page,
}) => {
  await login(page, 'manager');
  await page.getByText('Quản trị cuộc trao đổi', { exact: true }).click();
  await expect(page.getByLabel('Người được cấp')).toBeVisible();
  const response = await fetch(
    `${process.env.INTERNAL_API_URL}/project-chat/projects/${fixture.projectId}/authorities/${fixture.managerAuthorityId}/revoke`,
    {
      method: 'POST',
      headers: {
        Cookie: fixture.users.authority!.cookie,
        'X-Chat-Actor': fixture.users.authority!.id,
      },
    },
  );
  expect(response.status).toBe(201);
  await expect(page.getByLabel('Người được cấp')).toHaveCount(0);
});
