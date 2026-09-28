import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
// Native Node loads the existing ESM guard; Playwright 1.51 transforms .mjs as CJS.
execFileSync(process.execPath, [
  resolve(__dirname, '../api/scripts/g00-isolated-environment.mjs'),
]);
if (process.env.APP_PUBLIC_ORIGIN !== 'http://127.0.0.1:33002')
  throw new Error('M2 browser origin mismatch');
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'm2-project-chat.spec.ts',
  workers: 1,
  fullyParallel: false,
  outputDir: 'test-results/m2-a',
  use: {
    baseURL: process.env.APP_PUBLIC_ORIGIN,
    launchOptions: { chromiumSandbox: true },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
