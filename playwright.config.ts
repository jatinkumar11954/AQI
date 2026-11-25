import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx tsx tests/fixtures/mock-server.ts',
    url: 'http://127.0.0.1:4179/api/health',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
