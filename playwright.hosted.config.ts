import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.PLAYWRIGHT_API_PORT ?? '4000';
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? '3000';
const webOrigin = `http://127.0.0.1:${webPort}`;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const queueName = `paldora-hosted-${apiPort}`;

export default defineConfig({
  testDir: './apps/web/e2e',
  testMatch: 'hosted-social.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `API_PORT=${apiPort} WEB_ORIGIN=${webOrigin} MEDIA_JOB_QUEUE_NAME=${queueName} pnpm --parallel --filter @paldora/api --filter @paldora/worker dev`,
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `NEXT_DIST_DIR=.next-hosted NEXT_PUBLIC_API_URL=${apiOrigin}/api/v1 pnpm --filter @paldora/web dev --hostname 127.0.0.1 --port ${webPort}`,
      url: webOrigin,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
