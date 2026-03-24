import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5200',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev:frontend -- --host 127.0.0.1 --port 5200 --strictPort',
    url: 'http://127.0.0.1:5200',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
