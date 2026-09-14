import { expect, test, type Locator, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { captureVisual } from './visual-evidence';

const projectId = '20000000-0000-4000-8000-000000000291';
const projectName = 'Playwright Stage One Acceptance';
const projectCode = 'PW-STAGE-ONE';
const password = 'Playwright-password-1';
const pm = 'playwright.stage-one.pm@example.test';
const outsider = 'playwright.stage-one.outsider@example.test';
const testRoot = process.env.G00_TEST_ROOT;
if (!testRoot) throw new Error('G00_TEST_ROOT is required');
const workbookPath = resolve(testRoot, 'stage-two-valid.xlsx');
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

type StageTwoData = {
  plan: {
    id: string;
    code: string;
    description: string;
    version: number;
  }[];
  documents: {
    id: string;
    currentFileAssetId: string | null;
    currentFileAsset?: { originalFilename: string };
  }[];
  state: { stepOneStatus: string };
  documentDefinitions: { name: string; position: number; active: boolean }[];
};

let importJobId = '';
let stageTwoFileId = '';

test.describe.configure({ mode: 'serial' });

function collectClientErrors(page: Page, allowDeniedResources = false) {
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

async function stageTwo(page: Page) {
  const response = await page.request.get(
    `/api/v1/projects/${projectId}/stage-2?step=1`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as StageTwoData;
}

function plan(page: Page) {
  return page.getByRole('region', {
    name: 'KẾ HOẠCH TIẾN ĐỘ BASELINE & PHÂN BỔ NGUỒN LỰC',
  });
}

function documents(page: Page) {
  return page.getByRole('region', {
    name: 'HỒ SƠ TÀI LIỆU GIAI ĐOẠN 2 — KẾ HOẠCH & KHẢO SÁT',
  });
}

function queue(area: Locator) {
  return area.getByRole('list', { name: 'Hàng chờ tải lên' });
}

async function submitQueue(area: Locator) {
  await area.getByRole('button', { name: 'NỘP HỒ SƠ' }).click();
  await expect
    .poll(
      async () =>
        (await queue(area).getByRole('listitem').allTextContents()).every(
          (text) => text.includes('Hoàn thành'),
        ),
      { timeout: 45_000 },
    )
    .toBe(true);
}

test('Flow H — Stage 2 completes with an empty plan and zero supporting files', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await page.goto(`/projects/${projectId}/stage-2?step=1`);
  const initialize = await page.request.post(
    `/api/v1/projects/${projectId}/stages/STAGE_2/initialize`,
    { data: {}, headers: { origin: new URL(page.url()).origin } },
  );
  expect(initialize.ok()).toBe(true);
  await page.reload();
  const before = await stageTwo(page);
  expect(before.plan).toHaveLength(0);
  expect(before.documents).toHaveLength(0);
  expect(
    before.documentDefinitions
      .filter(({ active }) => active)
      .sort((left, right) => left.position - right.position)
      .map(({ name }) => name),
  ).toEqual([
    'Kế hoạch & khảo sát dự án',
    'Thiết kế, sản phẩm & BOQ',
    'Thẩm định & phê duyệt',
    'Hồ sơ khác',
  ]);
  await expect(
    page.getByRole('heading', {
      name: 'DANH MỤC TÀI LIỆU GĐ 2 ĐÃ TẢI LÊN — BƯỚC 1',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Chưa có tài liệu nào được tải lên cho Bước 1.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'HOÀN TẤT BƯỚC 1' }).click();
  await expect(page.getByText('Đã hoàn tất Bước 1.')).toBeVisible();
  await page.reload();
  const completed = await stageTwo(page);
  expect(completed.state.stepOneStatus).toBe('DONE');
  expect(completed.documents).toHaveLength(0);
  assertClean();
});

test('Flow G — Stage 2 plan saves, reloads, downloads its template, previews and confirms XLSX import', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await page.goto(`/projects/${projectId}/stage-2?step=1`);
  await expect(page).toHaveURL(`/projects/${projectId}/stage-2?step=1`);
  const navigation = page.getByRole('navigation', {
    name: 'Các phân hệ Giai đoạn 2',
  });
  await expect(navigation.getByRole('link')).toHaveCount(3);
  await expect(navigation.getByRole('link').first()).toHaveAttribute(
    'aria-current',
    'page',
  );
  await captureVisual(page, testInfo, '09-stage-two-three-tabs');
  const tabNames = [
    '',
    'KẾ HOẠCH & KHẢO SÁT',
    'THIẾT KẾ, SẢN PHẨM & BOQ',
    'PHÊ DUYỆT',
  ] as const;

  for (const [step, regionName] of [
    [2, 'Chức năng hiện có cho Bước 2'],
    [3, 'Bước 3 Giai đoạn 2'],
  ] as const) {
    await navigation
      .getByRole('link', { name: tabNames[step], exact: true })
      .click();
    await expect(page).toHaveURL(`/projects/${projectId}/stage-2?step=${step}`);
    await expect(page.getByRole('region', { name: regionName })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(`/projects/${projectId}/stage-2?step=${step}`);
    await expect(page.getByRole('region', { name: regionName })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Các phân hệ Giai đoạn 2' })
        .getByRole('link', { name: tabNames[step], exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  }
  await page
    .getByRole('navigation', { name: 'Các phân hệ Giai đoạn 2' })
    .getByRole('link', { name: tabNames[1], exact: true })
    .click();
  await expect(page).toHaveURL(`/projects/${projectId}/stage-2?step=1`);

  const card = plan(page);
  await card
    .getByRole('button', { name: '+ THÊM CÔNG VIỆC TIẾN ĐỘ MỚI' })
    .click();
  await card.getByLabel('Mã công việc mới').fill('PW-MAN-01');
  await card.getByLabel('Nội dung PW-MAN-01').fill('Công việc thủ công');
  await card.getByLabel('Ngày bắt đầu PW-MAN-01').fill('2026-08-15');
  await card.getByLabel('Ngày hoàn thành PW-MAN-01').fill('2026-08-19');
  await card.getByLabel('Ngân sách PW-MAN-01').fill('1250000.50');
  await card.getByRole('button', { name: 'LƯU KẾ HOẠCH' }).click();
  await expect(page.getByText('Đã lưu kế hoạch tiến độ.')).toBeVisible();
  await page.reload();
  await expect(card.getByLabel('Mã công việc PW-MAN-01')).toHaveValue(
    'PW-MAN-01',
  );
  await captureVisual(page, testInfo, '10-baseline-table', card);
  await card.getByLabel('Nội dung PW-MAN-01').fill('Công việc thủ công đã sửa');
  await card.getByRole('button', { name: 'LƯU KẾ HOẠCH' }).click();
  await expect(page.getByText('Đã lưu kế hoạch tiến độ.')).toBeVisible();
  await page.reload();
  await expect(card.getByLabel('Nội dung PW-MAN-01')).toHaveValue(
    'Công việc thủ công đã sửa',
  );

  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'TẢI TEMPLATE KẾ HOẠCH' }).click();
  const template = await download;
  expect(template.suggestedFilename()).toMatch(/\.xlsx$/i);
  expect((await template.createReadStream()) !== null).toBe(true);

  await card
    .getByRole('button', { name: 'NHẬP DỮ LIỆU TỪ FILE EXCEL' })
    .click();
  const importArea = page.getByRole('region', {
    name: 'NHẬP KẾ HOẠCH TỪ XLSX',
  });
  const upload = documents(page).getByRole('region', {
    name: 'TẢI HỒ SƠ BƯỚC 1',
  });
  await upload.locator('input[type="file"]').setInputFiles(workbookPath);
  await submitQueue(upload);
  await expect(documents(page)).toContainText('stage-two-valid.xlsx');
  const previewResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/stage-2/plan-import/preview'),
  );
  await importArea.getByRole('button', { name: 'XEM TRƯỚC FILE XLSX' }).click();
  const preview = await previewResponse;
  expect(preview.ok()).toBe(true);
  importJobId = ((await preview.json()) as { jobId: string }).jobId;
  await expect(
    importArea.getByRole('heading', { name: 'XEM TRƯỚC DỮ LIỆU NHẬP' }),
  ).toBeVisible();
  await expect(importArea).toContainText('PW-IMP-01');
  await expect(importArea).toContainText('Tổng số dòng: 1');
  await expect(importArea).toContainText('Hợp lệ: 1');
  await captureVisual(page, testInfo, '11-excel-preview', importArea);
  await importArea
    .getByRole('button', { name: 'XÁC NHẬN NHẬP 1 DÒNG' })
    .click();
  await expect(page.getByText('Đã nhập 1 dòng; bỏ qua 0 dòng.')).toBeVisible();
  await page.reload();
  await expect(plan(page).getByLabel('Mã công việc PW-IMP-01')).toHaveValue(
    'PW-IMP-01',
  );
  const state = await stageTwo(page);
  expect(state.plan.find(({ code }) => code === 'PW-MAN-01')?.description).toBe(
    'Công việc thủ công đã sửa',
  );
  expect(state.plan.filter(({ code }) => code === 'PW-IMP-01')).toHaveLength(1);
  assertClean();
});

test('Flow H continued — Stage 2 reopens and persists two optional files', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await page.goto(`/projects/${projectId}/stage-2?step=1`);
  expect((await stageTwo(page)).state.stepOneStatus).toBe('DONE');

  const card = documents(page);
  const upload = card.getByRole('region', { name: 'TẢI HỒ SƠ BƯỚC 1' });
  await upload.locator('input[type="file"]').setInputFiles([
    {
      name: 'stage-two-one.pdf',
      mimeType: 'application/pdf',
      buffer: pdf('stage-two-one.pdf'),
    },
    {
      name: 'stage-two-two.pdf',
      mimeType: 'application/pdf',
      buffer: pdf('stage-two-two.pdf'),
    },
  ]);
  await captureVisual(page, testInfo, '12-stage-two-optional-upload', card);
  await submitQueue(upload);
  await expect(card).toContainText('stage-two-one.pdf');
  await expect(card).toContainText('stage-two-two.pdf');
  await page.reload();
  await expect(documents(page)).toContainText('stage-two-one.pdf');
  await expect(documents(page)).toContainText('stage-two-two.pdf');
  const actualList = documents(page).getByRole('region', {
    name: 'DANH MỤC TÀI LIỆU GĐ 2 ĐÃ TẢI LÊN — BƯỚC 1',
  });
  await expect(
    actualList.getByRole('columnheader').allTextContents(),
  ).resolves.toEqual([
    'Tên hồ sơ',
    'Tệp',
    'Người tải lên',
    'Ngày tải',
    'Trạng thái',
    'Thao tác',
  ]);
  const actualRow = actualList.getByRole('row').filter({
    hasText: 'stage-two-one.pdf',
  });
  await expect(actualRow).toContainText('Đã tải lên');
  await expect(actualRow.getByRole('link', { name: 'Xem' })).toBeVisible();
  await expect(
    actualRow.getByRole('link', { name: 'Tải xuống' }),
  ).toBeVisible();
  await expect(actualRow.getByLabel(/Thao tác khác/)).toHaveCount(0);
  await expect(
    actualRow.getByRole('button', { name: 'Tải phiên bản mới' }),
  ).toHaveCount(0);
  const state = await stageTwo(page);
  const uploaded = state.documents.filter(({ currentFileAsset }) =>
    /^stage-two-(one|two)\.pdf$/.test(currentFileAsset?.originalFilename ?? ''),
  );
  expect(uploaded).toHaveLength(2);
  stageTwoFileId = uploaded[0]!.currentFileAssetId!;
  assertClean();
});

test('Flow B — estimate source, quantified risk, contingency and approval persist', async ({
  browser,
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await page.goto(`/projects/${projectId}/estimates`);
  await page.getByPlaceholder('Số dự toán').fill('PW-EST-01');
  await page.getByPlaceholder('Tên dự toán').fill('Dự toán Playwright GĐ2');
  await page.getByPlaceholder('Nhóm hạng mục').fill('Tầng 1');
  await page.getByPlaceholder('Mô tả').fill('Ghế thử nghiệm');
  await page
    .getByRole('spinbutton', { name: 'Khối lượng mua / sản xuất' })
    .fill('11');
  await page.getByLabel('Trạng thái nguồn giá').selectOption('CONFIRMED');
  await page.getByLabel('Giá mua thuần').fill('80');
  await page.getByLabel('Loại nguồn giá').selectOption('SUPPLIER_QUOTATION');
  await page.getByLabel('Ngày nguồn giá').fill('2026-09-10');
  await page.getByLabel('Tài liệu / số báo giá làm căn cứ').fill('SQ-PW-01');
  await page.getByLabel('Đơn giá bán').fill('100');
  await page.getByRole('button', { name: 'Tạo dự toán V1' }).click();
  const estimateLink = page.getByRole('link', { name: 'PW-EST-01' });
  await expect(estimateLink).toBeVisible();
  const estimateHref = await estimateLink.getAttribute('href');
  expect(estimateHref).toBeTruthy();

  await page.goto(`/projects/${projectId}/stage-2?step=2`);
  await expect(page.getByText('Dự toán Playwright GĐ2')).toBeVisible();
  await page.getByRole('link', { name: 'RỦI RO', exact: true }).click();
  await page.getByText('THÊM RỦI RO').click();
  await page.getByLabel('Mã').fill('PW-R-01');
  await page.getByLabel('Tên rủi ro').fill('NCC giao hàng trễ');
  await page.getByLabel('Nguyên nhân').fill('Lead time tăng');
  await page.getByLabel('Sự kiện có thể xảy ra').fill('Không giao đúng mốc');
  await page.getByLabel('Ảnh hưởng').fill('Lùi lịch lắp đặt');
  await page.getByLabel('Nhóm').selectOption('SUPPLIER');
  await page
    .getByLabel('Người phụ trách')
    .selectOption({ label: 'Zed Stage One PM' });
  await page.getByLabel('Khả năng (1–5)').fill('3');
  await page.getByLabel('Tác động (1–5)').fill('4');
  await page.getByLabel('Xác suất định lượng (0–1)').fill('0.3');
  await page.getByLabel('Tổn thất tài chính nếu xảy ra').fill('100000000');
  await page.getByRole('button', { name: 'LƯU RỦI RO' }).click();
  await expect(page.getByText('Đã lưu và cập nhật sổ rủi ro.')).toBeVisible();
  const risk = page.getByRole('article').filter({ hasText: 'PW-R-01' });
  await expect(risk).toContainText('30.000.000');
  await risk.getByText('PHÂN BỔ DỰ PHÒNG').click();
  await risk.getByLabel('Số tiền được duyệt').fill('30000000');
  await risk.getByLabel('Căn cứ').fill('EMV được duyệt');
  await risk.getByRole('button', { name: 'LƯU PHÂN BỔ' }).click();
  await expect(page.getByText('Đã lưu và cập nhật sổ rủi ro.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('PW-R-01 · NCC giao hàng trễ')).toBeVisible();
  await captureVisual(page, testInfo, '13-project-risk-register');

  await page.goto(estimateHref!);
  await expect(page.getByText(/Dự phòng rủi ro: 30\.000\.000/)).toBeVisible();
  await expect(
    page.getByText(/Chi phí có dự phòng: 30\.000\.880/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Gửi duyệt' }).click();
  await expect(page.getByText(/PENDING/)).toBeVisible();

  const approverContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const approverPage = await approverContext.newPage();
  await login(approverPage, 'playwright.stage-one.approver@example.test');
  await approverPage.goto(estimateHref!);
  await approverPage
    .getByRole('button', { name: 'Duyệt', exact: true })
    .click();
  await expect(approverPage.getByText(/APPROVED/)).toBeVisible();
  await approverPage.reload();
  await expect(approverPage.getByText(/APPROVED/)).toBeVisible();
  await approverContext.close();
  assertClean();
});

test('@viewport — risk register stays within the page at desktop and mobile widths', async ({
  page,
}, testInfo) => {
  await login(page, pm);
  await page.goto(`/projects/${projectId}/risks`);
  await expect(
    page.getByRole('heading', { name: 'SỔ RỦI RO DỰ ÁN' }),
  ).toBeVisible();
  const workspace = page.locator('[data-project-risk-workspace]');
  await expect(workspace).toHaveJSProperty(
    'scrollWidth',
    await workspace.evaluate((element) => element.clientWidth),
  );
  await captureVisual(page, testInfo, '14-project-risk-responsive');
});

test('Flow I — non-member Stage 2 route, file, template, preview and confirm reveal no data', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page, true);
  await login(page, outsider);
  const probes = [
    page.request.get(`/api/v1/projects/${projectId}/stage-2?step=1`),
    page.request.get(`/api/v1/projects/${projectId}/stage-2/plan-template`),
    page.request.get(`/api/v1/files/${stageTwoFileId}/download`),
    page.request.get(`/api/v1/projects/${projectId}/risks`),
    page.request.post(
      `/api/v1/projects/${projectId}/stage-2/plan-import/preview`,
      { data: { fileAssetId: stageTwoFileId } },
    ),
    page.request.post(
      `/api/v1/projects/${projectId}/stage-2/plan-import/${importJobId}/confirm`,
      { data: {} },
    ),
  ];
  for (const response of await Promise.all(probes)) {
    expect([403, 404]).toContain(response.status());
    const body = await response.text();
    for (const sensitive of [
      projectId,
      projectCode,
      projectName,
      'PW-MAN-01',
      'PW-IMP-01',
      'stage-two-one.pdf',
      '1250000.50',
      'storageKey',
      'checksum',
    ])
      expect(body).not.toContain(sensitive);
  }
  await page.goto(`/projects/${projectId}/stage-2?step=1`);
  await expect(page.locator('body')).not.toContainText(projectName);
  await expect(page.locator('body')).not.toContainText('PW-MAN-01');
  assertClean();
});
