import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';
const publicHost = new URL(baseURL).hostname;

export default defineConfig({
  testDir: './tests/browser',
  testMatch:
    /project-(stage-one|stage-two|pms-dashboard|pms-stage-access)\.spec\.ts/,
  outputDir: 'stage-one-test-results/run',
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  globalSetup: './tests/browser/stage-one-global-setup.mjs',
  globalTeardown: './tests/browser/stage-one-global-teardown.mjs',
  projects: [
    {
      name: '1536x864',
      use: { viewport: { width: 1536, height: 864 } },
    },
    {
      name: '1440x900',
      grep: /@viewport/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: '1280x800',
      grep: /@viewport/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: '390x844',
      grep: /@viewport/,
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  use: {
    actionTimeout: 10_000,
    baseURL,
    navigationTimeout: 10_000,
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @galaxy/api dev',
      env: {
        API_PORT: '3101',
        APP_PUBLIC_ORIGIN: baseURL,
      },
      url: 'http://127.0.0.1:3101/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec next dev --hostname 0.0.0.0 --port 3100 --webpack',
      env: {
        INTERNAL_API_URL: 'http://127.0.0.1:3101/api/v1',
        DEV_ALLOWED_ORIGINS: publicHost,
      },
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
