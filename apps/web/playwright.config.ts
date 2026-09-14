import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: [
    'product-acceptance.spec.ts',
    'project-stage-one.spec.ts',
    'project-stage-two.spec.ts',
    'project-pms-dashboard.spec.ts',
    'project-pms-stage-access.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: [
    {
      command: 'node tests/browser/api-fixture.mjs',
      port: 3101,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm dev',
      env: {
        INTERNAL_API_URL: 'http://127.0.0.1:3101/api/v1',
        DEV_ALLOWED_ORIGINS: '127.0.0.1',
      },
      port: 3000,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
