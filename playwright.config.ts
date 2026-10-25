import { defineConfig, devices } from '@playwright/test';

const reuse = !process.env.CI;

export default defineConfig({
  testDir: 'frontend/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'frontend/e2e-report' }]],
  outputDir: 'frontend/e2e-results',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --env-file-if-exists=.env --import tsx backend/src/server.ts',
      url: 'http://127.0.0.1:3000/api/v1/health',
      reuseExistingServer: reuse,
      timeout: 120_000,
    },
    {
      command: 'vite --config frontend/vite.config.ts',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: reuse,
      timeout: 120_000,
    },
  ],
});
