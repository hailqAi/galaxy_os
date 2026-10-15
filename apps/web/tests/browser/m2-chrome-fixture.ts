import { test as base } from '@playwright/test';

const endpoint = process.env.M2_CHROME_CDP_ENDPOINT;
if (endpoint && endpoint !== 'http://127.0.0.1:33005')
  throw new Error(
    'M2 CDP chỉ dùng bridge loopback 33005; không dùng cổng ứng dụng',
  );

export const test = endpoint
  ? base.extend({
      browser: async ({ playwright }, provideBrowser) => {
        const browser = await playwright.chromium.connectOverCDP(endpoint);
        const existing = new Set(browser.contexts());
        try {
          await provideBrowser(browser);
        } finally {
          // Preserve every pre-existing context, including the user's session.
          for (const context of browser.contexts())
            if (!existing.has(context)) await context.close();
          // Playwright's CDP transport close disconnects; it does not Browser.close Chrome.
          await browser.close();
        }
      },
    })
  : base;
