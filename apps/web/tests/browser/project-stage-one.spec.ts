import { open, unlink } from 'node:fs/promises';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import { captureVisual } from './visual-evidence';

const projectId = '20000000-0000-4000-8000-000000000291';
const customerId = '20000000-0000-4000-8000-000000000295';
const projectName = 'Playwright Stage One Acceptance';
const projectCode = 'PW-STAGE-ONE';
const password = 'Playwright-password-1';
const pm = 'playwright.stage-one.pm@example.test';
const uploader = 'playwright.stage-one.uploader@example.test';
const outsider = 'playwright.stage-one.outsider@example.test';
const createdProjectName = 'Playwright P0 Created Project';
const creationIdempotencyKey = 'p0-stage-one-create-browser';
const customType = 'Hồ sơ tùy chỉnh Playwright';
const customMilestoneCode = 'PW-HS-CONTRACT';
const customMilestoneName = 'Căn cứ hợp đồng';
const initialNames = [
  'Văn bản chủ trương / Quyết định giao nhiệm vụ',
  'Báo cáo khảo sát & Phương án nhân sự',
  'Hồ sơ Báo cáo Kinh tế - Kỹ thuật',
  'Văn bản xác nhận / Cân đối nguồn vốn',
  'Quyết định phê duyệt Báo cáo Kinh tế - Kỹ thuật',
] as const;
const headers = [
  'TÊN HỒ SƠ',
  'BƯỚC THAM CHIẾU',
  'TRẠNG THÁI',
  'TỆP ĐÍNH KÈM',
  'THAO TÁC',
] as const;
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

type SimpleDefinition = {
  id: string;
  name: string;
  workstreamKey: string;
  description?: string;
  position: number;
  initialMatrix: boolean;
  active: boolean;
  files: { id: string; currentFileAssetId: string | null }[];
};
type SimpleDocument = {
  id: string;
  contextType: 'STAGE_MATRIX_DOCUMENT' | 'STAGE_WORKFLOW_STEP_DOCUMENT';
  legacyRequirementId?: string | null;
  currentFileAssetId: string | null;
  currentFileAsset?: { originalFilename: string };
};
type SimpleStageOne = {
  project: { id: string; code: string; name: string };
  keyDossier: {
    milestones: { id: string; code: string; name: string }[];
    items: SimpleDefinition[];
    attachments: SimpleDocument[];
  };
  workflow: {
    definitions: SimpleDefinition[];
    documents: SimpleDocument[];
  };
};

let firstFileId = '';
let createdProjectId = '';
let createdProjectCode = '';

test.describe.configure({ mode: 'serial' });

function collectClientErrors(
  page: Page,
  allowDeniedResources = false,
  allowInterceptedFailure = false,
) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500)
      errors.push(
        `${response.request().method()} ${response.url()} -> ${response.status()}`,
      );
    if (response.status() === 404 && !allowDeniedResources)
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
          !(
            allowDeniedResources &&
            /^Failed to load resource: the server responded with a status of (403|404)/.test(
              error,
            )
          ) &&
          !(
            allowInterceptedFailure &&
            (error === 'Failed to load resource: net::ERR_FAILED' ||
              error ===
                'Failed to load resource: the server responded with a status of 409 (Conflict)')
          ),
      ),
    ).toEqual([]);
}

async function login(page: Page, email: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  const emailInput = page.getByLabel('Email đăng nhập');
  await emailInput.fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await emailInput.fill(email);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function initializeFixedProject(page: Page) {
  const response = await page.request.post(
    `/api/v1/projects/${projectId}/stage-1/initiate-simple`,
    {
      headers: { Origin: new URL(page.url()).origin },
      data: {
        name: projectName,
        estimatedInvestmentAmount: '35000000000',
        fundingSource: 'PUBLIC_INVESTMENT_2026',
        customerId,
        idempotencyKey: 'p0-stage-one-init-fixed',
      },
    },
  );
  const body = await response.text();
  expect(response.ok(), `${response.status()} ${body}`).toBe(true);
}

async function simple(page: Page, targetProjectId = projectId) {
  const response = await page.request.get(
    `/api/v1/projects/${targetProjectId}/stage-1/simple`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as SimpleStageOne;
}

async function activateDisposableDefinition(page: Page, name: string) {
  const response = await page.request.post(
    `/api/v1/projects/${projectId}/stage-1/key-dossier/items`,
    {
      headers: { Origin: new URL(page.url()).origin },
      data: {
        name,
        description: 'Browser upload acceptance',
        position: 99,
        initialMatrix: true,
        active: true,
      },
    },
  );
  const body = (await response.json()) as SimpleDefinition;
  expect(response.ok(), `${response.status()} ${JSON.stringify(body)}`).toBe(
    true,
  );
  return body;
}

async function setDefinitionActive(
  page: Page,
  definition: SimpleDefinition,
  active: boolean,
) {
  const response = await page.request.patch(
    `/api/v1/projects/${projectId}/stage-1/key-dossier/items/${definition.id}`,
    {
      headers: { Origin: new URL(page.url()).origin },
      data: {
        name: definition.name,
        description: definition.description,
        position: definition.position,
        initialMatrix: definition.initialMatrix,
        active,
      },
    },
  );
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBe(
    true,
  );
}

function matrix(page: Page) {
  return page.getByRole('region', {
    name: 'HỒ SƠ CHỦ CHỐT CỦA DỰ ÁN',
  });
}

function matrixRow(page: Page, name: string) {
  return matrix(page)
    .locator('[data-optional-document-row="true"]')
    .filter({ hasText: name });
}

function queueRow(area: Locator, filename: string) {
  return area
    .getByRole('list', { name: 'Hàng chờ tải lên' })
    .getByRole('listitem')
    .filter({
      hasText: new RegExp(
        `^${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ),
    });
}

async function openUpload(page: Page, name: string) {
  const row = matrixRow(page, name);
  await row
    .getByRole('button', { name: new RegExp(`^(Tải lên|Thêm tệp) ${name}$`) })
    .click();
  const area = page.getByRole('complementary', { name: `Tải lên ${name}` });
  await expect(area).toBeVisible();
  return area;
}

async function addFiles(
  area: Locator,
  files: { name: string; mimeType?: string; buffer?: Buffer }[],
) {
  await area.locator('input[type="file"]').setInputFiles(
    files.map(({ name, mimeType = 'application/pdf', buffer = pdf(name) }) => ({
      name,
      mimeType,
      buffer,
    })),
  );
}

async function submitQueue(area: Locator, filenames: string[]) {
  for (const filename of filenames)
    await expect(queueRow(area, filename)).toContainText(
      'Đã tải tạm — Chờ nộp',
      { timeout: 120_000 },
    );
  await area.getByRole('button', { name: 'NỘP HỒ SƠ' }).click();
  for (const filename of filenames)
    await expect(queueRow(area, filename)).toHaveCount(0);
}

test('opening a Matrix uploader leaves exactly one live upload worker', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await initializeFixedProject(page);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  await expect(page.locator('[data-upload-scope]')).toHaveCount(0);

  await openUpload(page, initialNames[0]);

  await expect(page.locator('[data-upload-scope]')).toHaveCount(1);
  assertClean();
});

test('selection uploads a real 48-byte PDF and submit sends only the Phase B command', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await initializeFixedProject(page);
  const definition = await activateDisposableDefinition(
    page,
    'Upload route acceptance 48 byte',
  );
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const requests: { path: string; body: string | null }[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname.includes('/uploads/'))
      requests.push({
        path: `${url.pathname}${url.search}`,
        body: request.postData(),
      });
  });
  const area = await openUpload(page, definition.name);
  const bytes = Buffer.from(`%PDF-1.4\n${'x'.repeat(33)}\n%%EOF`);
  expect(bytes).toHaveLength(48);
  const initiated = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/uploads/initiate',
  );
  const firstChunk = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/v1\/uploads\/[^/]+\/parts$/.test(
        new URL(response.url()).pathname,
      ),
  );
  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/v1\/uploads\/[^/]+\/complete$/.test(
        new URL(response.url()).pathname,
      ),
  );

  try {
    await addFiles(area, [{ name: 'network-48.pdf', buffer: bytes }]);
    const row = queueRow(area, 'network-48.pdf');
    await expect(row).toContainText('Đã tải tạm — Chờ nộp');
    expect(await (await initiated).json()).toMatchObject({
      id: expect.any(String),
      status: 'INITIATED',
    });
    expect(Number((await (await firstChunk).json()).uploadedBytes)).toBe(48);
    expect(await (await completed).json()).toMatchObject({
      status: 'AVAILABLE',
      fileAssetId: expect.any(String),
      uploadedBytes: '48',
    });
    expect(requests.map(({ path }) => path)).toEqual([
      '/api/v1/uploads/initiate',
      expect.stringMatching(
        /^\/api\/v1\/uploads\/[^/]+\/parts\?partNumber=1&checksum=/,
      ),
      expect.stringMatching(/^\/api\/v1\/uploads\/[^/]+\/complete$/),
    ]);

    await area.getByRole('button', { name: 'NỘP HỒ SƠ' }).click();
    await expect(row).toHaveCount(0);
    expect(requests.slice(3).map(({ path }) => path)).toEqual([
      '/api/v1/uploads/submit',
    ]);
    expect(JSON.parse(requests[3]!.body!)).toEqual({
      projectId,
      sessionIds: [expect.any(String)],
      idempotencyKey: expect.any(String),
    });
    await expect(matrixRow(page, definition.name)).toContainText(
      'network-48.pdf',
    );
    assertClean();
  } finally {
    await setDefinitionActive(page, definition, false);
  }
});

test('a stale document row refreshes the Matrix without reporting a permission error', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page, true);
  await login(page, pm);
  await initializeFixedProject(page);
  const definition = await activateDisposableDefinition(
    page,
    'Upload stale target acceptance',
  );
  let simpleReads = 0;
  page.on('response', (response) => {
    if (
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname ===
        `/api/v1/projects/${projectId}/stage-1/simple`
    )
      simpleReads += 1;
  });
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const area = await openUpload(page, definition.name);
  try {
    await setDefinitionActive(page, definition, false);
    const readsBeforeUpload = simpleReads;
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/uploads/initiate',
    );

    await addFiles(area, [{ name: 'stale-target.pdf' }]);

    const response = await rejected;
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({
      category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND',
    });
    await expect(area).toHaveCount(0);
    await expect.poll(() => simpleReads).toBeGreaterThan(readsBeforeUpload);
    await expect(
      page.getByText(
        'Dự án hoặc mục/loại hồ sơ đã bị xóa hoặc không còn khả dụng. Danh sách đã được cập nhật; vui lòng mở lại và thử lại.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Bạn không có quyền tải hồ sơ cho dự án này.',
    );
    assertClean();
  } finally {
    await setDefinitionActive(page, definition, false);
  }
});

test('reload hydrates a missing recovery member and auto-retries the original batch and officer', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page, false, true);
  await login(page, pm);
  await initializeFixedProject(page);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  let area = await openUpload(page, initialNames[3]);
  const officer = area.getByLabel('Cán bộ thực hiện nộp');
  await officer.selectOption({ index: 1 });
  const originalOfficer = await officer.inputValue();
  await addFiles(area, [
    { name: 'reload-key-retry.pdf' },
    { name: 'reload-missing-member.pdf' },
  ]);
  await expect(queueRow(area, 'reload-key-retry.pdf')).toContainText(
    'Đã tải tạm — Chờ nộp',
  );
  await expect(queueRow(area, 'reload-missing-member.pdf')).toContainText(
    'Đã tải tạm — Chờ nộp',
  );
  let firstSubmit: Record<string, unknown> | undefined;
  const failSubmit = async (route: Route) => {
    firstSubmit = route.request().postDataJSON() as Record<string, unknown>;
    await route.abort('failed');
  };
  await page.route(/\/api\/v1\/uploads\/submit$/, failSubmit);
  await area.getByRole('button', { name: 'NỘP HỒ SƠ' }).click();
  await expect(queueRow(area, 'reload-key-retry.pdf')).toContainText(
    'Đã tải tạm — Chờ nộp',
  );
  await page.unroute(/\/api\/v1\/uploads\/submit$/, failSubmit);

  const returnOneRecoveredSession = async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { items: unknown[] };
    await route.fulfill({ response, json: { items: body.items.slice(0, 1) } });
  };
  await page.route(
    /\/api\/v1\/uploads\/recovery\?projectId=/,
    returnOneRecoveredSession,
  );
  let retrySubmit: Record<string, unknown> | undefined;
  let releaseSubmit!: () => void;
  const heldSubmit = new Promise<void>((resolve) => (releaseSubmit = resolve));
  const holdRetry = async (route: Route) => {
    retrySubmit = route.request().postDataJSON() as Record<string, unknown>;
    await heldSubmit;
    await route.continue();
  };
  await page.route(/\/api\/v1\/uploads\/submit$/, holdRetry);

  await page.reload();
  await expect.poll(() => retrySubmit).toBeTruthy();
  await expect(matrixRow(page, initialNames[3])).toContainText(
    'Đang nộp hồ sơ',
  );
  area = await openUpload(page, initialNames[3]);
  await expect(queueRow(area, 'reload-key-retry.pdf')).toContainText(
    'Đang nộp hồ sơ',
  );
  await expect(queueRow(area, 'reload-missing-member.pdf')).toContainText(
    'Đang nộp hồ sơ',
  );
  await expect(area.locator('input[type=file]')).toBeDisabled();
  await expect(area.getByLabel('Cán bộ thực hiện nộp')).toBeDisabled();
  await expect(area.getByLabel('Cán bộ thực hiện nộp')).toHaveValue(
    originalOfficer,
  );
  expect(retrySubmit).toEqual(firstSubmit);
  releaseSubmit();
  await expect(queueRow(area, 'reload-key-retry.pdf')).toHaveCount(0);
  await expect(queueRow(area, 'reload-missing-member.pdf')).toHaveCount(0);
  await page.unroute(/\/api\/v1\/uploads\/submit$/, holdRetry);
  await page.unroute(
    /\/api\/v1\/uploads\/recovery\?projectId=/,
    returnOneRecoveredSession,
  );
  assertClean();
});

test('refresh failure restores READY and reuses the submitted batch identity', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page, false, true);
  await login(page, pm);
  await initializeFixedProject(page);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const area = await openUpload(page, initialNames[2]);
  await addFiles(area, [{ name: 'refresh-retry.pdf' }]);
  const row = queueRow(area, 'refresh-retry.pdf');
  await expect(row).toContainText('Đã tải tạm — Chờ nộp');
  const keys: unknown[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/uploads/submit')
    )
      keys.push(
        (request.postDataJSON() as Record<string, unknown>).idempotencyKey,
      );
  });
  let failRefresh = true;
  const failOneRefresh = async (route: Route) => {
    if (!failRefresh) return route.continue();
    failRefresh = false;
    await route.abort('failed');
  };
  await page.route(
    new RegExp(`/api/v1/projects/${projectId}/stage-1/simple$`),
    failOneRefresh,
  );

  await area.getByRole('button', { name: 'NỘP HỒ SƠ' }).click();
  await expect(row).toContainText('Đã tải tạm — Chờ nộp');
  await expect(row.getByRole('alert')).toContainText(
    'Đã liên kết hồ sơ nhưng không thể làm mới dữ liệu',
  );
  await page.unroute(
    new RegExp(`/api/v1/projects/${projectId}/stage-1/simple$`),
    failOneRefresh,
  );
  const retryRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname.endsWith('/uploads/submit'),
  );
  await page.reload();
  const retrySubmit = (await retryRequest).postDataJSON() as Record<
    string,
    unknown
  >;
  expect(retrySubmit.idempotencyKey).toBe(keys[0]);
  await expect(matrixRow(page, initialNames[2])).toContainText(
    'refresh-retry.pdf',
  );
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  assertClean();
});

test('a transient Project recovery failure is retried on reopen', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page, false, true);
  await login(page, pm);
  await initializeFixedProject(page);
  let recoveries = 0;
  const failOnce = async (route: Route) => {
    recoveries += 1;
    if (recoveries === 1) await route.abort('failed');
    else await route.continue();
  };
  await page.route(/\/api\/v1\/uploads\/recovery\?projectId=/, failOnce);

  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Không thể khôi phục các tệp tải tạm' }),
  ).toBeVisible();
  await page.reload();
  await expect.poll(() => recoveries).toBe(2);
  await page.unroute(/\/api\/v1\/uploads\/recovery\?projectId=/, failOnce);
  assertClean();
});

test('mixed and submitting queues expose no close path', async ({ page }) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await initializeFixedProject(page);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const area = await openUpload(page, initialNames[1]);
  await addFiles(area, [{ name: 'mixed-ready.pdf' }]);
  await expect(queueRow(area, 'mixed-ready.pdf')).toContainText(
    'Đã tải tạm — Chờ nộp',
  );
  let releasePart!: () => void;
  const heldPart = new Promise<void>((resolve) => (releasePart = resolve));
  const holdPart = async (route: Route) => {
    await heldPart;
    await route.continue();
  };
  await page.route(/\/api\/v1\/uploads\/[^/]+\/parts\?/, holdPart);
  await addFiles(area, [{ name: 'mixed-uploading.pdf' }]);
  await expect(
    queueRow(area, 'mixed-uploading.pdf').getByRole('button', { name: 'Hủy' }),
  ).toBeVisible();
  await expect(
    area.getByRole('group', { name: 'Đóng bản tải tạm' }),
  ).toHaveCount(0);
  await expect(
    area.getByRole('button', { name: 'Đóng', exact: true }),
  ).toHaveCount(0);
  releasePart();
  await page.unroute(/\/api\/v1\/uploads\/[^/]+\/parts\?/, holdPart);
  await expect(queueRow(area, 'mixed-uploading.pdf')).toContainText(
    'Đã tải tạm — Chờ nộp',
  );

  let releaseSubmit!: () => void;
  const heldSubmit = new Promise<void>((resolve) => (releaseSubmit = resolve));
  const holdSubmit = async (route: Route) => {
    await heldSubmit;
    await route.continue();
  };
  await page.route(/\/api\/v1\/uploads\/submit$/, holdSubmit);
  await area.getByRole('button', { name: 'NỘP HỒ SƠ' }).click();
  await expect(area).toContainText('Đang nộp hồ sơ');
  await expect(
    area.getByRole('group', { name: 'Đóng bản tải tạm' }),
  ).toHaveCount(0);
  await expect(
    area.getByRole('button', { name: 'Đóng', exact: true }),
  ).toHaveCount(0);
  releaseSubmit();
  await page.unroute(/\/api\/v1\/uploads\/submit$/, holdSubmit);
  await expect(queueRow(area, 'mixed-ready.pdf')).toHaveCount(0);
  assertClean();
});

test('double abort click sends one command and cannot resurrect the draft', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await initializeFixedProject(page);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const area = await openUpload(page, initialNames[4]);
  await addFiles(area, [{ name: 'double-abort.pdf' }]);
  await expect(queueRow(area, 'double-abort.pdf')).toContainText(
    'Đã tải tạm — Chờ nộp',
  );
  let abortCalls = 0;
  let releaseAbort!: () => void;
  const heldAbort = new Promise<void>((resolve) => (releaseAbort = resolve));
  const holdAbort = async (route: Route) => {
    abortCalls += 1;
    await heldAbort;
    await route.continue();
  };
  await page.route(/\/api\/v1\/uploads\/[^/]+\/abort$/, holdAbort);
  const abort = area.getByRole('button', { name: 'Hủy bản tải tạm' });
  await abort.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => abortCalls).toBe(1);
  await expect(abort).toBeDisabled();
  await expect(
    area.getByRole('button', { name: 'Đóng', exact: true }),
  ).toHaveCount(0);
  releaseAbort();
  await expect(area).toHaveCount(0);
  await page.unroute(/\/api\/v1\/uploads\/[^/]+\/abort$/, holdAbort);
  await page.reload();
  await expect(matrixRow(page, initialNames[4])).not.toContainText(
    'double-abort.pdf',
  );
  assertClean();
});

test('/projects/new creates exactly once and an idempotent retry returns the same Stage 1 URL', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  let createCalls = 0;
  let createBody: Record<string, unknown> | undefined;
  await page.route(/\/api\/v1\/projects$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    createCalls += 1;
    createBody = {
      ...(route.request().postDataJSON() as Record<string, unknown>),
      idempotencyKey: creationIdempotencyKey,
    };
    const headers = { ...route.request().headers() };
    delete headers['content-length'];
    await route.continue({ headers, postData: JSON.stringify(createBody) });
  });
  await page.goto('/projects/new');
  await page.getByLabel('TÊN DỰ ÁN *').fill(createdProjectName);
  await page.getByLabel('GIÁ TRỊ DỰ KIẾN (VND) *').fill('35.000.000.000 ₫');
  await page
    .getByLabel('KHÁCH HÀNG / ĐẠI DIỆN KHÁCH HÀNG *')
    .selectOption(customerId);
  await captureVisual(
    page,
    testInfo,
    '00-new-project-form',
    page.locator('form').filter({
      has: page.getByLabel('TÊN DỰ ÁN *'),
    }),
  );
  await page.getByRole('button', { name: 'KHỞI TẠO DỰ ÁN' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/stage-1\?step=1$/);
  const createdId = new URL(page.url()).pathname.split('/')[2]!;
  createdProjectId = createdId;
  expect(createCalls).toBe(1);
  expect(createdId).not.toBe(projectId);
  const retry = await page.request.post('/api/v1/projects', {
    headers: { Origin: new URL(page.url()).origin },
    data: createBody,
  });
  const retryBody = (await retry.json()) as Record<string, unknown>;
  expect(retry.ok(), `${retry.status()} ${JSON.stringify(retryBody)}`).toBe(
    true,
  );
  expect(retryBody).toMatchObject({
    id: createdId,
    stageOneUrl: `/projects/${createdId}/stage-1?step=1`,
  });
  const createdProject = (await (
    await page.request.get(`/api/v1/projects/${createdId}`)
  ).json()) as { code: string };
  createdProjectCode = createdProject.code;
  await expect(
    matrix(page).locator('[data-optional-document-row="true"]'),
  ).toHaveCount(5);
  await captureVisual(
    page,
    testInfo,
    '01-created-project-stage-one',
    matrix(page),
  );
  assertClean();
});

test('Workflow remains usable when the isolated TEST Project has no Key Dossier items', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  const state = await simple(page, createdProjectId);
  for (const item of state.keyDossier.items) {
    const response = await page.request.delete(
      `/api/v1/projects/${createdProjectId}/stage-1/key-dossier/items/${item.id}`,
      {
        headers: { Origin: new URL(page.url()).origin },
        data: { reason: 'Chuẩn bị luồng TEST Workflow rỗng.' },
      },
    );
    expect(response.ok(), `${response.status()} ${await response.text()}`).toBe(
      true,
    );
  }

  await page.goto(`/projects/${createdProjectId}/stage-1?step=1`);
  await expect(
    matrix(page).locator('[data-optional-document-row="true"]'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '+ THÊM HỒ SƠ' }).click();
  const workflowUpload = page.locator('#step-documents section').filter({
    has: page.getByRole('heading', { name: 'THÊM HỒ SƠ' }),
  });
  await addFiles(workflowUpload, [{ name: 'workflow-empty-key-dossier.pdf' }]);
  await submitQueue(workflowUpload, ['workflow-empty-key-dossier.pdf']);
  const workflowList = page.locator('[data-document-list="ASSIGNMENT"]');
  await expect(workflowList).toContainText('workflow-empty-key-dossier.pdf');
  await expect(matrix(page)).not.toContainText(
    'workflow-empty-key-dossier.pdf',
  );
  await captureVisual(
    page,
    testInfo,
    '02-workflow-with-empty-key-dossier',
    page.locator('#step-documents'),
  );
  assertClean();
});

test('legacy routes select the canonical Stage 1 steps', async ({
  context,
  page,
}) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await initializeFixedProject(page);
  for (const [legacy, step] of [
    ['initiation', 1],
    ['survey', 2],
    ['requirements', 3],
    ['approval', 5],
  ] as const) {
    const direct = await context.newPage();
    await direct.goto(`/projects/${projectId}/stage-1/${legacy}`);
    await expect(direct).toHaveURL(
      `/projects/${projectId}/stage-1?step=${step}`,
    );
    await expect(direct.getByText(`CHI TIẾT BƯỚC ${step}`)).toBeVisible();
    await direct.close();
  }
  assertClean();
});

test('desktop matrix is the exact five-column, five-default P0 representation', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  await page
    .getByRole('button', { name: 'Chỉnh sửa thông tin khởi tạo dự án' })
    .click();
  const editForm = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'THÔNG TIN KHỞI TẠO DỰ ÁN' }),
  });
  await captureVisual(
    page,
    testInfo,
    '02-existing-project-edit-mode',
    editForm,
  );
  await editForm.getByRole('button', { name: 'Hủy', exact: true }).click();
  const scope = matrix(page);
  await expect(scope).toContainText('Danh mục hồ sơ cần lưu theo dự án.');
  await expect(scope.locator('thead th')).toHaveCount(5);
  await expect(scope.locator('thead th').allTextContents()).resolves.toEqual(
    headers,
  );
  await expect(
    scope.locator('[data-optional-document-row="true"]'),
  ).toHaveCount(5);
  await expect(
    scope
      .locator('[data-optional-document-row="true"] td:first-child')
      .allTextContents(),
  ).resolves.toEqual(initialNames);
  for (const name of initialNames)
    await expect(scope.getByText(name, { exact: true })).toHaveCount(1);
  await expect(
    scope.locator('[data-optional-document-row="true"] td:nth-child(4)'),
  ).toHaveCount(5);
  const rowActions = scope.locator('[data-row-upload-action="true"]');
  await expect(rowActions).toHaveCount(5);
  for (const label of await rowActions.allTextContents())
    expect(['TẢI LÊN', 'THÊM TỆP']).toContain(label);
  await expect(page.locator('#step-documents')).toBeVisible();
  await expect(page.locator('[data-upload-scope]')).toHaveCount(0);
  await expect(
    scope.locator('[data-optional-document-matrix="true"]'),
  ).toHaveCount(1);
  await expect(scope).not.toContainText(
    /⋯|2048|ASSIGNMENT|SURVEY|PROPOSAL|FINANCIAL_PLANNING|KICKOFF_APPROVAL|PENDING_UPLOAD/,
  );
  await captureVisual(page, testInfo, '02-exact-five-column-matrix', scope);
  assertClean();
});

test('server-derived 20 GB dialog uploads multiple files, retries, aborts, reloads, and exposes two chips plus overflow', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page, false, true);
  await login(page, pm);
  await initializeFixedProject(page);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const constraints = await page.request.get('/api/v1/uploads/constraints');
  expect(constraints.ok()).toBe(true);
  expect(await constraints.json()).toMatchObject({ maxBytes: 21_474_836_480 });

  let area = await openUpload(page, initialNames[0]);
  await expect(area).toContainText('DUNG LƯỢNG TỐI ĐA MỖI TỆP: 20 GB');
  await addFiles(area, [
    { name: 'matrix-one.pdf' },
    { name: 'matrix-two.pdf' },
  ]);
  await captureVisual(page, testInfo, '03-two-file-upload-queue', area);
  await submitQueue(area, ['matrix-one.pdf', 'matrix-two.pdf']);
  await page.reload();
  await expect(matrixRow(page, initialNames[0])).toContainText('Đã lưu');

  area = await openUpload(page, initialNames[1]);
  let failOnePart = true;
  const failHandler = async (route: Route) => {
    if (!failOnePart) return route.continue();
    failOnePart = false;
    await route.abort('failed');
  };
  await page.route(/\/api\/v1\/uploads\/[^/]+\/parts\?/, failHandler);
  await addFiles(area, [{ name: 'retry.pdf' }]);
  await expect(
    queueRow(area, 'retry.pdf').getByRole('button', { name: 'Thử lại' }),
  ).toBeVisible();
  await captureVisual(
    page,
    testInfo,
    '04-retry-failed',
    queueRow(area, 'retry.pdf'),
  );
  await page.unroute(/\/api\/v1\/uploads\/[^/]+\/parts\?/, failHandler);
  await queueRow(area, 'retry.pdf')
    .getByRole('button', { name: 'Thử lại' })
    .click();
  await submitQueue(area, ['retry.pdf']);

  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  area = await openUpload(page, initialNames[2]);
  let releasePart!: () => void;
  const heldPart = new Promise<void>((resolve) => {
    releasePart = resolve;
  });
  const holdHandler = async (route: Route) => {
    await heldPart;
    await route.continue().catch(() => undefined);
  };
  await page.route(/\/api\/v1\/uploads\/[^/]+\/parts\?/, holdHandler);
  await addFiles(area, [{ name: 'abort.pdf' }]);
  await queueRow(area, 'abort.pdf')
    .getByRole('button', { name: 'Hủy' })
    .click();
  releasePart();
  await page.unroute(/\/api\/v1\/uploads\/[^/]+\/parts\?/, holdHandler);
  await expect(queueRow(area, 'abort.pdf')).toContainText('Đã hủy');

  const largePath = '/tmp/galaxy-os-p0-multi-chunk.pdf';
  const streamLength = 64 * 1024 * 1024;
  const handle = await open(largePath, 'w');
  try {
    let offset = 0;
    const offsets = [0];
    const write = async (value: string) => {
      const bytes = Buffer.from(value);
      await handle.write(bytes, 0, bytes.length, offset);
      offset += bytes.length;
    };
    await write('%PDF-1.4\n');
    offsets.push(offset);
    await write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offsets.push(offset);
    await write('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    offsets.push(offset);
    await write(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n',
    );
    offsets.push(offset);
    await write('4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n');
    offsets.push(offset);
    await write(`5 0 obj\n<< /Length ${streamLength} >>\nstream\n`);
    await handle.truncate(offset + streamLength);
    offset += streamLength;
    await write('\nendstream\nendobj\n');
    const xrefOffset = offset;
    await write(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((entry) => `${String(entry).padStart(10, '0')} 00000 n `)
        .join(
          '\n',
        )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    );
  } finally {
    await handle.close();
  }
  try {
    await page.goto(`/projects/${projectId}/stage-1?step=1`);
    area = await openUpload(page, initialNames[0]);
    let releaseSecondPart!: () => void;
    let secondPartHeld = false;
    const secondPart = new Promise<void>((resolve) => {
      releaseSecondPart = resolve;
    });
    const holdSecondPart = async (route: Route) => {
      if (new URL(route.request().url()).searchParams.get('partNumber') !== '2')
        return route.continue();
      secondPartHeld = true;
      await secondPart;
      await route.continue().catch(() => undefined);
    };
    await page.route(/\/api\/v1\/uploads\/[^/]+\/parts\?/, holdSecondPart);
    await area.locator('input[type="file"]').setInputFiles(largePath);
    await expect.poll(() => secondPartHeld, { timeout: 120_000 }).toBe(true);
    const largeRow = queueRow(area, 'galaxy-os-p0-multi-chunk.pdf');
    await expect
      .poll(async () =>
        Number(await largeRow.locator('progress').getAttribute('value')),
      )
      .toBeGreaterThan(0);
    await captureVisual(page, testInfo, '05-multi-chunk-progress', largeRow);
    releaseSecondPart();
    await page.unroute(/\/api\/v1\/uploads\/[^/]+\/parts\?/, holdSecondPart);
    await submitQueue(area, ['galaxy-os-p0-multi-chunk.pdf']);
  } finally {
    await unlink(largePath).catch(() => undefined);
  }

  await page.reload();
  const state = await simple(page);
  const definition = state.keyDossier.items.find(
    ({ name }) => name === initialNames[0],
  )!;
  const uploaded = state.keyDossier.attachments.filter(
    ({ legacyRequirementId }) => legacyRequirementId === definition.id,
  );
  expect(
    uploaded.map(({ currentFileAsset }) => currentFileAsset?.originalFilename),
  ).toEqual(
    expect.arrayContaining([
      'matrix-one.pdf',
      'matrix-two.pdf',
      'galaxy-os-p0-multi-chunk.pdf',
    ]),
  );
  firstFileId = uploaded[0]!.currentFileAssetId!;
  const download = await page.request.get(
    `/api/v1/files/${firstFileId}/download`,
  );
  expect(download.ok()).toBe(true);
  expect((await download.body()).byteLength).toBeGreaterThan(0);
  const row = matrixRow(page, initialNames[0]);
  await expect(row.locator('[data-attachment-chip="true"]')).toHaveCount(2);
  await expect(row.getByText('+ 1 tệp', { exact: true })).toBeVisible();
  await row.getByText('+ 1 tệp', { exact: true }).click();
  await expect(row).toContainText('galaxy-os-p0-multi-chunk.pdf');
  await captureVisual(page, testInfo, '04-uploaded-two-chips-overflow', row);
  assertClean();
});

test('matrix-level customization persists without row-management actions', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page, false, true);
  await login(page, pm);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  await matrix(page)
    .getByRole('button', { name: 'QUẢN LÝ LOẠI HỒ SƠ' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'CẤU HÌNH LOẠI HỒ SƠ' });
  const workflowStepsBefore = await page
    .getByRole('link', { name: /^BƯỚC [1-5]/ })
    .allTextContents();
  const milestoneRegion = dialog.getByRole('region', {
    name: 'Mốc Hồ sơ chủ chốt',
  });
  const milestoneForm = milestoneRegion.locator('form').first();
  await milestoneForm.getByLabel('Mã mốc').fill(customMilestoneCode);
  await milestoneForm.getByLabel('Tên mốc').fill(customMilestoneName);
  await milestoneForm
    .getByRole('button', { name: 'Thêm mốc', exact: true })
    .click();
  const milestoneArticles = milestoneRegion.locator('article');
  let milestoneArticle: Locator | undefined;
  await expect.poll(() => milestoneArticles.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await milestoneArticles.count()); index++) {
    const candidate = milestoneArticles.nth(index);
    if (
      (await candidate.getByLabel('Mã mốc').inputValue()) ===
      customMilestoneCode
    ) {
      milestoneArticle = candidate;
      break;
    }
  }
  expect(milestoneArticle).toBeDefined();
  const selectedMilestoneArticle = milestoneArticle!;
  const milestoneEditForm = selectedMilestoneArticle.locator('form');
  await expect(milestoneEditForm.getByLabel('Tên mốc')).toHaveValue(
    customMilestoneName,
  );
  const addForm = dialog
    .getByRole('button', { name: 'Thêm', exact: true })
    .locator('xpath=ancestor::form');
  await addForm.getByLabel('Tên loại hồ sơ').fill(customType);
  await addForm.getByLabel('Bước tham chiếu').selectOption({
    label: `${customMilestoneCode} — ${customMilestoneName}`,
  });
  await addForm.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(matrixRow(page, customType)).toBeVisible();
  await milestoneEditForm
    .getByLabel('Tên mốc')
    .fill(`${customMilestoneName} đã sửa`);
  await milestoneEditForm
    .getByRole('button', { name: 'Lưu mốc', exact: true })
    .click();
  await expect(milestoneEditForm.getByLabel('Tên mốc')).toHaveValue(
    `${customMilestoneName} đã sửa`,
  );
  expect(
    await page.getByRole('link', { name: /^BƯỚC [1-5]/ }).allTextContents(),
  ).toEqual(workflowStepsBefore);
  await captureVisual(
    page,
    testInfo,
    '05-independent-reference-milestones',
    milestoneRegion,
  );
  const managedForms = dialog.locator(
    '[data-definition-management-item="true"] form',
  );
  let duplicateForm: Locator | undefined;
  for (let index = 0; index < (await managedForms.count()); index++) {
    const candidate = managedForms.nth(index);
    if (
      (await candidate.getByLabel('Tên loại hồ sơ').inputValue()) === customType
    ) {
      duplicateForm = candidate;
      break;
    }
  }
  expect(duplicateForm).toBeDefined();
  const selectedForm = duplicateForm!;
  await selectedForm.getByLabel('Tên loại hồ sơ').fill(initialNames[0]);
  await selectedForm
    .getByRole('button', { name: 'Lưu thay đổi', exact: true })
    .click();
  await expect(dialog.locator('[role="alert"]')).toContainText(
    'Tên mục Hồ sơ chủ chốt đã tồn tại.',
  );
  const milestoneDeleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.includes(
        '/stage-1/key-dossier/milestones/',
      ),
  );
  await selectedMilestoneArticle
    .getByRole('button', { name: 'Xóa mốc', exact: true })
    .click();
  const deleteMilestoneDialog = page.getByRole('dialog', {
    name: new RegExp(`^Xóa mốc ${customMilestoneCode}`),
  });
  await expect(deleteMilestoneDialog).toContainText(
    '1 mục hồ sơ đang dùng mốc này.',
  );
  await deleteMilestoneDialog
    .getByLabel('Lý do xóa')
    .fill('Hoàn tất kiểm thử mốc độc lập.');
  await deleteMilestoneDialog
    .getByRole('button', { name: 'Xóa mốc', exact: true })
    .click();
  expect((await milestoneDeleted).status()).toBe(200);
  await expect(matrixRow(page, customType)).toContainText('Không phân loại');
  await page.reload();
  await expect(matrixRow(page, customType)).toBeVisible();
  await expect(matrixRow(page, customType)).toContainText('Không phân loại');
  expect(
    await page.getByRole('link', { name: /^BƯỚC [1-5]/ }).allTextContents(),
  ).toEqual(workflowStepsBefore);
  await expect(matrix(page)).not.toContainText('⋯');
  await captureVisual(
    page,
    testInfo,
    '05-persisted-matrix-customization',
    matrix(page),
  );
  assertClean();
});

test('workflow upload stays separate, survives reload, and remains available after step completion', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await initializeFixedProject(page);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const workflowUpload = () =>
    page.locator('#step-documents section').filter({
      has: page.getByRole('heading', { name: 'THÊM HỒ SƠ' }),
    });
  const openWorkflowUpload = async () => {
    await page.getByRole('button', { name: '+ THÊM HỒ SƠ' }).click();
    const area = workflowUpload();
    await expect(area).toBeVisible();
    return area;
  };
  const workflowList = () => page.locator('[data-document-list="ASSIGNMENT"]');

  let area = await openWorkflowUpload();
  await addFiles(area, [{ name: 'workflow-step-one.pdf' }]);
  await submitQueue(area, ['workflow-step-one.pdf']);
  await expect(workflowList()).toContainText('workflow-step-one.pdf');
  await expect(matrix(page)).not.toContainText('workflow-step-one.pdf');

  const matrixArea = await openUpload(page, initialNames[4]);
  await addFiles(matrixArea, [{ name: 'matrix-after-workflow.pdf' }]);
  await submitQueue(matrixArea, ['matrix-after-workflow.pdf']);
  await expect(matrixRow(page, initialNames[4])).toContainText(
    'matrix-after-workflow.pdf',
  );
  await expect(workflowList()).toContainText('workflow-step-one.pdf');
  await captureVisual(
    page,
    testInfo,
    '06-workflow-submitted',
    page.locator('#step-documents'),
  );

  await page.reload();
  await expect(workflowList()).toContainText('workflow-step-one.pdf');
  await expect(matrix(page)).not.toContainText('workflow-step-one.pdf');
  const downloadPath = await workflowList()
    .getByRole('link', { name: 'Tải xuống' })
    .first()
    .getAttribute('href');
  expect(downloadPath).toBeTruthy();
  const download = await page.request.get(downloadPath!);
  expect(download.ok()).toBe(true);
  expect((await download.body()).byteLength).toBeGreaterThan(0);

  const completionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/stage-1/steps/ASSIGNMENT/complete'),
  );
  await page
    .getByRole('button', { name: 'HOÀN TẤT & CHUYỂN SANG BƯỚC 2' })
    .click();
  const completed = await completionResponse;
  expect(completed.status(), await completed.text()).toBe(201);
  await expect(page).toHaveURL(`/projects/${projectId}/stage-1?step=2`);
  await expect(page.getByRole('link', { name: /BƯỚC 1/ })).toContainText(
    'Hoàn thành',
  );
  await expect(page.getByRole('link', { name: /BƯỚC 2/ })).not.toContainText(
    'Hoàn thành',
  );

  await page.getByRole('link', { name: /BƯỚC 1/ }).click();
  await expect(page).toHaveURL(`/projects/${projectId}/stage-1?step=1`);
  area = await openWorkflowUpload();
  await addFiles(area, [{ name: 'workflow-after-completion.pdf' }]);
  await submitQueue(area, ['workflow-after-completion.pdf']);
  await expect(workflowList()).toContainText('workflow-after-completion.pdf');
  await expect(matrix(page)).not.toContainText('workflow-after-completion.pdf');
  assertClean();
});

test('delete capability is hidden and the API rejects an uploader without file.delete', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page, true);
  await login(page, uploader);
  const state = await simple(page);
  const document = state.keyDossier.attachments.find(
    ({ contextType }) => contextType === 'STAGE_MATRIX_DOCUMENT',
  );
  expect(document).toBeDefined();
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  await expect(matrix(page)).toBeVisible();
  await expect(matrix(page).getByRole('button', { name: 'Xóa' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Xóa dự án' })).toHaveCount(0);
  await captureVisual(page, testInfo, '06-no-delete-permission');

  const response = await page.request.delete(
    `/api/v1/projects/${projectId}/stage-1/documents/${document!.id}?contextType=STAGE_MATRIX_DOCUMENT`,
    { headers: { Origin: new URL(page.url()).origin } },
  );
  expect(response.status()).toBe(403);
  assertClean();
});

test('an authorized delete soft-removes only the selected Matrix document', async ({
  page,
}) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  const before = await simple(page);
  const document = before.keyDossier.attachments.find(
    ({ contextType, currentFileAsset }) =>
      contextType === 'STAGE_MATRIX_DOCUMENT' &&
      currentFileAsset?.originalFilename === 'matrix-after-workflow.pdf',
  );
  expect(document).toBeDefined();
  const workflowCount = before.workflow.documents.length;
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.endsWith(
        `/stage-1/documents/${document!.id}`,
      ),
  );
  await page
    .locator(`#document-${document!.id}`)
    .getByRole('button', { name: 'Xóa' })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'XÓA TỆP ĐÍNH KÈM?',
  });
  await expect(dialog).toContainText('matrix-after-workflow.pdf');
  await dialog.getByRole('button', { name: 'XÓA', exact: true }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page.locator(`#document-${document!.id}`)).toHaveCount(0);

  const after = await simple(page);
  expect(
    after.keyDossier.attachments.some(({ id }) => id === document!.id),
  ).toBe(false);
  expect(after.workflow.documents).toHaveLength(workflowCount);
  const physicalFile = await page.request.get(
    `/api/v1/files/${document!.currentFileAssetId}/download`,
  );
  expect(physicalFile.ok()).toBe(true);
  assertClean();
});

test('an authorized item delete hides only that Key Dossier item and its files', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  const definition = await activateDisposableDefinition(
    page,
    'Playwright item to delete',
  );
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const area = await openUpload(page, definition.name);
  await addFiles(area, [
    { name: 'item-delete-one.pdf' },
    { name: 'item-delete-two.pdf' },
  ]);
  await submitQueue(area, ['item-delete-one.pdf', 'item-delete-two.pdf']);
  const before = await simple(page);
  const workflowIds = before.workflow.documents.map(({ id }) => id);

  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.endsWith(
        `/stage-1/key-dossier/items/${definition.id}`,
      ),
  );
  await matrixRow(page, definition.name)
    .getByRole('button', { name: 'Xóa mục', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Xóa mục Hồ sơ chủ chốt',
  });
  await expect(dialog).toContainText(`${definition.name} · 2 tệp`);
  await dialog.getByLabel('Lý do xóa').fill('Dữ liệu TEST đã kiểm tra xong.');
  await captureVisual(page, testInfo, '07-delete-key-dossier-item', dialog);
  await dialog.getByRole('button', { name: 'Xóa mục', exact: true }).click();
  expect((await deleted).status()).toBe(200);
  await expect(matrixRow(page, definition.name)).toHaveCount(0);

  const after = await simple(page);
  expect(after.keyDossier.items.some(({ id }) => id === definition.id)).toBe(
    false,
  );
  expect(
    after.keyDossier.attachments.some(
      ({ legacyRequirementId }) => legacyRequirementId === definition.id,
    ),
  ).toBe(false);
  expect(after.workflow.documents.map(({ id }) => id)).toEqual(workflowIds);
  await page.reload();
  await expect(matrixRow(page, definition.name)).toHaveCount(0);
  assertClean();
});

test('a non-member cannot read Stage 1 or uploaded bytes', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page, true);
  await login(page, outsider);
  const simpleResponse = await page.request.get(
    `/api/v1/projects/${projectId}/stage-1/simple`,
  );
  const fileResponse = await page.request.get(
    `/api/v1/files/${firstFileId}/download`,
  );
  expect([403, 404]).toContain(simpleResponse.status());
  expect([403, 404]).toContain(fileResponse.status());
  for (const body of [await simpleResponse.text(), await fileResponse.text()]) {
    expect(body).not.toContain(projectId);
    expect(body).not.toContain(projectCode);
    expect(body).not.toContain(projectName);
    expect(body).not.toContain('matrix-one.pdf');
  }
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  await expect(page.locator('body')).toContainText(
    /Project not found|Required permission is missing|Bạn không có quyền thực hiện thao tác này|Không tìm thấy dự án hoặc bước thực hiện/,
  );
  await expect(page.locator('body')).not.toContainText(projectName);
  await captureVisual(page, testInfo, '06-forbidden');
  assertClean();
});

test('@viewport — one compact responsive matrix has no duplicate visible data or horizontal overflow', async ({
  page,
}, testInfo) => {
  const assertClean = collectClientErrors(page);
  await login(page, pm);
  await initializeFixedProject(page);
  await page.goto(`/projects/${projectId}/stage-1?step=1`);
  const scope = matrix(page);
  await expect(
    scope.locator('[data-optional-document-matrix="true"]'),
  ).toHaveCount(1);
  await expect(
    scope.locator('[data-optional-document-row="true"]').first(),
  ).toBeVisible();
  await expect(scope.getByText(initialNames[0], { exact: true })).toHaveCount(
    1,
  );
  await expect(
    page.locator('[data-optional-document-card="true"]'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  if (testInfo.project.name === '390x844') {
    await expect(scope.locator('thead')).toBeHidden();
  } else {
    await expect(scope.locator('thead')).toBeVisible();
    await expect(scope.locator('thead th')).toHaveCount(5);
  }
  await captureVisual(page, testInfo, '07-responsive-stage-one', scope);
  assertClean();
});

test('a privileged actor soft-deletes only the isolated TEST Project', async ({
  page,
}, testInfo) => {
  expect(createdProjectId).toBeTruthy();
  expect(createdProjectCode).toBeTruthy();

  await login(page, uploader);
  const denied = await page.request.delete(
    `/api/v1/projects/${createdProjectId}`,
    {
      headers: { Origin: new URL(page.url()).origin },
      data: {
        code: createdProjectCode,
        reason: 'Actor không có quyền không được xóa.',
      },
    },
  );
  expect([403, 404]).toContain(denied.status());

  await page.context().clearCookies();
  await login(page, pm);
  await page.goto(`/projects/${createdProjectId}/stage-1?step=1`);
  await page.getByRole('button', { name: 'Xóa dự án' }).click();
  const dialog = page.getByRole('dialog', { name: 'Xóa dự án' });
  await expect(dialog).toContainText(createdProjectName);
  await dialog.getByLabel('Nhập lại mã dự án').fill(createdProjectCode);
  await dialog.getByLabel('Lý do xóa').fill('Kết thúc kiểm thử Playwright.');
  await captureVisual(page, testInfo, '08-delete-test-project', dialog);
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.endsWith(
        `/projects/${createdProjectId}`,
      ),
  );
  await dialog.getByRole('button', { name: 'Xóa dự án', exact: true }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page).toHaveURL('/projects');
  await expect(page.getByText(createdProjectName, { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.locator(`select option[value="${createdProjectId}"]`),
  ).toHaveCount(0);
  const oldRoute = await page.request.get(
    `/api/v1/projects/${createdProjectId}/stage-1/simple`,
  );
  expect([403, 404]).toContain(oldRoute.status());
  await page.reload();
  await expect(page.getByText(createdProjectName, { exact: true })).toHaveCount(
    0,
  );
});
