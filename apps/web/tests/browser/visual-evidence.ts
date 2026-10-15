import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';

export async function captureVisual(
  page: Page,
  testInfo: TestInfo,
  name: string,
  focus?: Locator,
) {
  await focus?.scrollIntoViewIfNeeded();
  const path = resolve(
    process.cwd(),
    '../../.artifacts/p0-final',
    testInfo.project.name,
    `${name}.png`,
  );
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ animations: 'disabled', fullPage: false, path });
}
