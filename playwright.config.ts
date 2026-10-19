import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_WEB_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './apps/web/e2e',
  // Signed-in flows need the API, worker, and a local auth issuer; they run
  // through playwright.fullstack.config.ts.
  testIgnore: '**/full-stack/**',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-390',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  // Always test a production build: the CSP and caching behavior differ from
  // development, and production is what users get.
  webServer: {
    command: `pnpm --filter @paldora/web build && pnpm --filter @paldora/web start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
