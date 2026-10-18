import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3100',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
  },
  webServer: {
    command: 'pnpm build && pnpm exec next start -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
