import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'product-acceptance.spec.ts',
  fullyParallel: false,
  workers: 1,
  globalSetup: './tests/browser/product-global-setup.mjs',
  globalTeardown: './tests/browser/product-global-teardown.mjs',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @galaxy/api dev',
      port: 3001,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3000 --webpack',
      env: {
        INTERNAL_API_URL: 'http://127.0.0.1:3001/api/v1',
        DEV_ALLOWED_ORIGINS: '127.0.0.1',
      },
      port: 3000,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
