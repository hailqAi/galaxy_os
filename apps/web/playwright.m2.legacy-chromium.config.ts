import { defineConfig } from '@playwright/test';
import chromeConfig from './playwright.m2.config';

// Explicit supplemental run for old bundled Chromium behavior, not M2 acceptance.
export default defineConfig(chromeConfig, {
  outputDir: 'test-results/m2-a-legacy-chromium',
  use: { channel: 'chromium', headless: true },
});
