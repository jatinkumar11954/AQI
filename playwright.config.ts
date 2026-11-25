import { defineConfig, devices } from '@playwright/test';

const live = process.env.SAANS_TEST_URL;
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  workers: 2,
  use: { baseURL: live || 'http://127.0.0.1:4179', trace: 'retain-on-failure' },
  projects: [
    { name: 'Desktop Chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: live ? undefined : { command: 'node --import tsx tests/fixtures/mock-server.ts', url: 'http://127.0.0.1:4179/api/health', reuseExistingServer: false },
});
