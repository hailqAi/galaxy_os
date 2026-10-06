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
  testMatch:
    process.env.GALAXY_AI_LIVE_FIXTURE === 'confirmed'
      ? 'm3-live-rag.spec.ts'
      : process.env.FEATURE_PROJECT_AI === 'true'
        ? [
            'm2-project-chat.spec.ts',
            'm3-project-ai.spec.ts',
            'm3-unified-ai.spec.ts',
            'm3-pdf-workspace.spec.ts',
          ]
        : 'm2-project-chat.spec.ts',
  workers: 1,
  fullyParallel: false,
  outputDir: 'test-results/m2-a',
  use: {
    channel: 'chrome',
    headless: false,
    // Trust only this isolated context's self-signed test endpoint; app TLS/headers stay intact.
    ignoreHTTPSErrors:
      process.env.APP_PUBLIC_ORIGIN === 'https://localhost:33003',
    baseURL: process.env.APP_PUBLIC_ORIGIN,
    launchOptions: {
      chromiumSandbox: true,
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
    },
    // CDP also exposes the user's existing contexts. Capture only explicit fixture pages.
    trace: process.env.M2_CHROME_CDP_ENDPOINT ? 'off' : 'retain-on-failure',
    screenshot: process.env.M2_CHROME_CDP_ENDPOINT ? 'off' : 'only-on-failure',
  },
});
