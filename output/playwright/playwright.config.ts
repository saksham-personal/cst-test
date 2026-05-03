import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './output/playwright',
  timeout: 30000,
  reporter: 'line',
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1660, height: 520 },
  },
});
