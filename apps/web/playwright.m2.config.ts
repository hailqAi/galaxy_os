import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
// Native Node loads the existing ESM guard; Playwright 1.51 transforms .mjs as CJS.
execFileSync(process.execPath, [
  resolve(__dirname, '../api/scripts/g00-isolated-environment.mjs'),
]);
if (
  !['http://127.0.0.1:33002', 'https://localhost:33003'].includes(
    process.env.APP_PUBLIC_ORIGIN ?? '',
  )
)
  throw new Error('M2 browser origin mismatch');
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'm2-project-chat.spec.ts',
  workers: 1,
  fullyParallel: false,
  outputDir: 'test-results/m2-a',
  use: {
    channel: 'chromium',
    // Trust only this isolated context's self-signed test endpoint; app TLS/headers stay intact.
    ignoreHTTPSErrors:
      process.env.APP_PUBLIC_ORIGIN === 'https://localhost:33003',
    baseURL: process.env.APP_PUBLIC_ORIGIN,
    launchOptions: {
      chromiumSandbox: true,
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
