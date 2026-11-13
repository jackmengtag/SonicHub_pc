import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 1_500_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://119.91.65.225:5173',
    viewport: { width: 1440, height: 900 },
    headless: true,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
});
