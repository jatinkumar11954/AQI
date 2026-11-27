import { defineConfig, devices } from '@playwright/test';

const live = process.env.SAANS_TEST_URL;
const localUrl = 'http://127.0.0.1:4179';
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  workers: 2,
  use: { baseURL: live || localUrl, trace: 'retain-on-failure' },
  projects: [
    { name: 'Desktop Chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: live ? undefined : {
    command: 'vite build && node --import tsx tests/fixtures/mock-server.ts',
    url: localUrl,
    reuseExistingServer: false,
  },
});
