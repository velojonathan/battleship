import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      // Run all specs except the mobile-specific smoke test.
      testIgnore: /mobile\.spec\.ts$/,
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
      // Mobile project runs only the mobile smoke test, to keep the suite fast.
      testMatch: /mobile\.spec\.ts$/,
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port ' + PORT + ' --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
