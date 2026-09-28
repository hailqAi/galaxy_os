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
    for (const page of [a, b, c])
      await page.setViewportSize({ width: 390, height: 844 });
    await login(a, 'sender');
    await a.getByRole('button', { name: /Khách thử nghiệm/ }).click();
    await a
      .getByLabel('Nguồn tài liệu đủ điều kiện')
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
  await page
    .getByRole('button', { name: 'Hợp đồng & tài chính', exact: true })
    .click();
  await page.getByRole('button', { name: 'Ở lại', exact: true }).click();
  await expect(draft).toHaveValue('Nháp chưa gửi, không được mất');
  await page.getByRole('link', { name: '← Các dự án được cấp' }).click();
  await page.getByRole('button', { name: 'Ở lại', exact: true }).click();
  await expect(draft).toHaveValue('Nháp chưa gửi, không được mất');
  await page
    .getByRole('button', { name: 'Hợp đồng & tài chính', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Rời và bỏ nháp', exact: true })
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

for (const mobile of [false, true]) {
  test(`browser Back and Forward preserve a cancelled draft and discard it only on confirmation (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'guest');
    await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
    const draft = page.getByLabel('Tin nhắn', { exact: true });
    await expect(draft).toBeEnabled();
    await draft.fill('Nháp tiếng Việt chưa gửi');
    const url = page.url();
    await page.goto(`${url}#trong-phong`);
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(url);
    await expect(
      page.getByRole('dialog', { name: 'Bỏ nháp chưa gửi?' }),
    ).not.toBeVisible();
    await expect(draft).toHaveValue('Nháp tiếng Việt chưa gửi');
    const poll = await page.waitForResponse(
      (response) =>
        response.url().includes('/messages') &&
        response.request().method() === 'GET',
    );
    expect(poll.status()).toBe(200);
    await page.evaluate(() => history.back());
    await expect(
      page.getByRole('dialog', { name: 'Bỏ nháp chưa gửi?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ở lại', exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(draft).toHaveValue('Nháp tiếng Việt chưa gửi');
    await page.evaluate(() => history.back());
    await page
      .getByRole('button', { name: 'Rời và bỏ nháp', exact: true })
      .click();
    await expect(page).toHaveURL(`${process.env.APP_PUBLIC_ORIGIN}/work`);
    await page.goForward();
    await expect(page).toHaveURL(url);
    await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
    await expect(draft).toHaveValue('');
    // A real forward entry, without fabricating or replacing history.state.
    await page.getByRole('link', { name: '← Các dự án được cấp' }).click();
    await expect(page).toHaveURL(`${process.env.APP_PUBLIC_ORIGIN}/work`);
    await page.goBack();
    await expect(page).toHaveURL(url);
    await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
    await draft.fill('Nháp trước Forward');
    await page.evaluate(() => history.forward());
    await page.getByRole('button', { name: 'Ở lại', exact: true }).click();
    await expect(draft).toHaveValue('Nháp trước Forward');
    // Use the browser's real Forward entry (same path as its toolbar), with no history mutation.
    const session = await page.context().newCDPSession(page);
    const historyEntry = await session.send('Page.getNavigationHistory');
    await session.send('Page.navigateToHistoryEntry', {
      entryId: historyEntry.entries[historyEntry.currentIndex + 1]!.id,
    });
    await page
      .getByRole('button', { name: 'Rời và bỏ nháp', exact: true })
      .click();
    await session.detach();
    await expect(page).toHaveURL(`${process.env.APP_PUBLIC_ORIGIN}/work`);
  });
}

test('reconnect retries a committed send with the same key and clears a recovered polling error', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'guest');
  await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
  const draft = page.getByLabel('Tin nhắn', { exact: true });
  await expect(draft).toBeEnabled();
  const text = `Mất phản hồi ${Date.now()}`;
  const keys: string[] = [];
  let dropPost = true,
    dropGet = true;
  await page.route('**/project-chat/rooms/*/messages*', async (route) => {
    if (route.request().method() === 'POST') {
      keys.push(route.request().postDataJSON().clientKey);
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      if (dropPost) {
        dropPost = false;
        await route.abort('failed');
      } else await route.fulfill({ response });
    } else if (dropGet) {
      dropGet = false;
      await route.abort('failed');
    } else await route.continue();
  });
  await expect(
    page.getByText('Không tải được tin mới. Đang thử lại…', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Không tải được tin mới. Đang thử lại…', { exact: true }),
  ).toHaveCount(0);
  await draft.fill(text);
  await page.getByRole('button', { name: 'Gửi tin', exact: true }).click();
  await expect(
    page.getByText(
      'Chưa xác nhận gửi. Gửi lại giữ nguyên mã yêu cầu và nội dung.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(draft).toHaveValue(text);
  await context.setOffline(true);
  await expect(draft).toHaveValue(text);
  await context.setOffline(false);
  await page
    .getByRole('button', { name: 'Gửi lại tin chưa xác nhận', exact: true })
    .click();
  await expect(draft).toHaveValue('');
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  await expect(page.getByText(text, { exact: true })).toHaveCount(1);
  const response = await page.request.get(
    `${process.env.APP_PUBLIC_ORIGIN}/api/v1/project-chat/rooms/${fixture.guestRoomId}/messages`,
  );
  expect(response.status()).toBe(200);
  expect(
    (await response.json()).items.filter(
      (m: { body: string }) => m.body === text,
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('mobile upload retains the same request after a lost response and safely downloads a hostile filename', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'guest');
  await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
  const requests: string[] = [],
    files: string[] = [];
  await page.route('**/project-chat/rooms/*/files', async (route) => {
    requests.push(route.request().postData() ?? '');
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    files.push((await response.json()).id);
    if (files.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await page
    .getByLabel('Tin nhắn', { exact: true })
    .fill('Nháp tiếng Việt khi tải lỗi');
  await page.getByLabel('File đính kèm').setInputFiles({
    name: 'ảnh<img onerror=alert(1)>.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Binary tiếng Việt riêng biệt'),
  });
  await page.getByRole('button', { name: 'Gửi file', exact: true }).click();
  await expect(
    page.getByText('Upload chưa được xác nhận. Chọn Gửi file để thử lại.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Đã lưu file:/)).toHaveCount(0);
  await expect(page.getByLabel('Tin nhắn', { exact: true })).toHaveValue(
    'Nháp tiếng Việt khi tải lỗi',
  );
  await page.getByRole('button', { name: 'Gửi file', exact: true }).click();
  await expect(page.getByText(/Đã lưu file:/)).toBeVisible();
  expect(files).toHaveLength(2);
  expect(files[1]).toBe(files[0]);
  const key = (body: string) =>
    body.match(/name="clientKey"\r\n\r\n([^\r]+)/)?.[1];
  expect(key(requests[0]!)).toBeTruthy();
  expect(key(requests[1]!)).toBe(key(requests[0]!));
  await page.getByRole('button', { name: 'Gửi tin', exact: true }).click();
  await expect(
    page.getByText('Nháp tiếng Việt khi tải lỗi', { exact: true }),
  ).toHaveCount(1);
  const link = page.getByRole('link', {
    name: /ảnh_img onerror_alert_1__.txt/,
  });
  await expect(link).toBeVisible();
  const download = await page.request.get((await link.getAttribute('href'))!);
  expect(download.status()).toBe(200);
  expect(await download.text()).toBe('Binary tiếng Việt riêng biệt');
  expect(download.headers()['content-disposition']).not.toMatch(/[\r\n]/);
  await expect(page.locator('article img[onerror]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('offline reconnect starts one bounded polling loop without overlapping requests', async ({
  page,
  context,
}) => {
  await login(page, 'guest');
  await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
  let active = 0,
    maximum = 0,
    reads = 0;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await context.setOffline(true);
  await page.route('**/project-chat/rooms/*/messages*', async (route) => {
    active++;
    maximum = Math.max(maximum, active);
    try {
      const response = await route.fetch();
      reads++;
      if (reads === 1) {
        entered();
        await held;
      }
      await route.fulfill({ response });
    } finally {
      active--;
    }
  });
  try {
    await context.setOffline(false);
    await reached;
    // Repeated real offline/online edges while a response is held must not fork loops.
    await context.setOffline(true);
    await context.setOffline(false);
    release();
    await expect.poll(() => reads).toBeGreaterThanOrEqual(3);
    expect(maximum).toBe(1);
    await expect(page.getByLabel('Tin nhắn', { exact: true })).toHaveValue('');
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('reload warns only for a dirty draft and never restores it from storage', async ({
  page,
}) => {
  await login(page, 'guest');
  await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
  const draft = page.getByLabel('Tin nhắn', { exact: true });
  await draft.fill('Nháp chỉ trong RAM');
  const dialogPromise = page.waitForEvent('dialog');
  void page.evaluate(() => location.reload()).catch(() => undefined);
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  await expect(draft).toHaveValue('Nháp chỉ trong RAM');
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
  await expect(draft).toHaveValue('');
  let cleanDialogs = 0;
  page.on('dialog', async (dialog) => {
    cleanDialogs++;
    await dialog.dismiss();
  });
  await page.reload();
  expect(cleanDialogs).toBe(0);
});

test('restores a real BFCache document and rechecks revoked room access before showing content', async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => {
    Reflect.set(window, 'm2PageShows', []);
    addEventListener('pageshow', (event) =>
      Reflect.get(window, 'm2PageShows').push({
        persisted: event.persisted,
        wall: Date.now(),
        mono: performance.now(),
        visibility: document.querySelector('article')
          ? getComputedStyle(document.querySelector('article')!).visibility
          : 'absent',
      }),
    );
  });
  const cdp = await page.context().newCDPSession(page);
  const reasons: unknown[] = [];
  await cdp.send('Page.enable');
  cdp.on('Page.backForwardCacheNotUsed', (value) => reasons.push(value));
  await login(page, 'viewer');
  await page.getByRole('button', { name: /Nội bộ thử nghiệm/ }).click();
  await expect(page.getByText('Bạn chỉ có quyền xem')).toBeVisible();
  await page.evaluate(() => location.assign('/work'));
  await expect(page).toHaveURL(`${process.env.APP_PUBLIC_ORIGIN}/work`);
  await page.goBack();
  const restored = await page.evaluate(() =>
    Reflect.get(window, 'm2PageShows'),
  );
  console.log(
    JSON.stringify({
      evidence: 'BFCACHE_REAL',
      browser: browser.version(),
      restored,
      reasons,
    }),
  );
  expect(
    restored.some((e: { persisted: boolean }) => e.persisted),
    'Yêu cầu pageshow.persisted từ browser thật',
  ).toBe(true);
  expect(
    restored
      .filter((e: { persisted: boolean }) => e.persisted)
      .every((e: { visibility: string }) =>
        ['hidden', 'absent'].includes(e.visibility),
      ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: /Nội bộ thử nghiệm/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Nội bộ thử nghiệm/ }).click();
  await expect(page.getByText('Bạn chỉ có quyền xem')).toBeVisible();
  await page.evaluate(() => location.assign('/work'));
  await expect(page).toHaveURL(`${process.env.APP_PUBLIC_ORIGIN}/work`);
  const management = await fetch(
    `${process.env.INTERNAL_API_URL}/project-chat/projects/${fixture.projectId}/management`,
    { headers: { Cookie: fixture.users.manager!.cookie } },
  );
  expect(management.status).toBe(200);
  const room = (await management.json()).rooms.find(
    (r: { id: string }) => r.id === fixture.roomId,
  );
  const grant = room.grants.find(
    (g: { userId: string }) => g.userId === fixture.users.viewer!.id,
  );
  const revoked = await fetch(
    `${process.env.INTERNAL_API_URL}/project-chat/rooms/${fixture.roomId}/grants/${grant.id}/revoke`,
    {
      method: 'POST',
      headers: {
        Cookie: fixture.users.manager!.cookie,
        'X-Chat-Actor': fixture.users.manager!.id,
      },
    },
  );
  expect(revoked.status).toBe(201);
  await page.goBack();
  expect(
    (await page.evaluate(() => Reflect.get(window, 'm2PageShows'))).some(
      (e: { persisted: boolean }) => e.persisted,
    ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: /Nội bộ thử nghiệm/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Tin nhắn', { exact: true })).toHaveCount(0);
  await cdp.detach();
});

test('delayed polling cannot restore a departed room and offline revoke clears the draft without sending it', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'guest');
  await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
  const draft = page.getByLabel('Tin nhắn', { exact: true });
  await expect(draft).toBeEnabled();
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false,
    active = 0,
    maximum = 0,
    sent = 0;
  await page.route('**/project-chat/rooms/*/messages*', async (route) => {
    if (route.request().method() !== 'GET') {
      sent++;
      await route.continue();
      return;
    }
    active++;
    maximum = Math.max(maximum, active);
    try {
      const response = await route.fetch();
      if (!held) {
        held = true;
        entered();
        await waiting;
      }
      await route.fulfill({ response });
    } finally {
      active--;
    }
  });
  try {
    await reached;
    await draft.fill('Nháp không được gửi sau thu hồi');
    await page
      .getByRole('button', { name: 'Hợp đồng & tài chính', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Rời và bỏ nháp', exact: true })
      .click();
    release();
    await expect(draft).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Khách thử nghiệm', exact: true }),
    ).toHaveCount(0);
    await page.unrouteAll({ behavior: 'wait' });
    expect(maximum).toBe(1);
    await page
      .getByRole('button', { name: 'Tư vấn & báo giá', exact: true })
      .click();
    await page.getByRole('button', { name: /Khách thử nghiệm/ }).click();
    await expect(draft).toHaveValue('');
    await draft.fill('Nháp RAM bị thu hồi');
    await context.setOffline(true);
    const response = await fetch(
      `${process.env.INTERNAL_API_URL}/project-chat/projects/${fixture.projectId}/management`,
      {
        method: 'GET',
        headers: { Cookie: fixture.users.manager!.cookie },
      },
    );
    expect(response.status).toBe(200);
    const management = (await response.json()) as {
      rooms: { id: string; grants: { id: string; userId: string }[] }[];
    };
    const grant = management.rooms
      .find((r) => r.id === fixture.guestRoomId)!
      .grants.find((g) => g.userId === fixture.users.guest!.id)!;
    const revoked = await fetch(
      `${process.env.INTERNAL_API_URL}/project-chat/rooms/${fixture.guestRoomId}/grants/${grant.id}/revoke`,
      {
        method: 'POST',
        headers: {
          Cookie: fixture.users.manager!.cookie,
          'X-Chat-Actor': fixture.users.manager!.id,
        },
      },
    );
    expect(revoked.status).toBe(201);
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/messages'))
        sent++;
    });
    await context.setOffline(false);
    await expect(draft).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Khách thử nghiệm/ }),
    ).toHaveCount(0);
    expect(sent).toBe(0);
  } finally {
    release();
    await context.setOffline(false);
  }
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
