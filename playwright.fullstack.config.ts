import { defineConfig, devices } from '@playwright/test';

/**
 * Full-stack browser tests: real web (production build), API, worker,
 * PostgreSQL, Redis, and MinIO. Only the identity provider is replaced, by a
 * loopback stand-in that speaks the Supabase Auth API and signs ES256 tokens
 * the real verifier checks. Requires local infrastructure (docs/development.md).
 * Run with `pnpm test:e2e:full`, which builds what the servers start.
 */
const webPort = 3100;
const apiPort = 4100;
const authUrl = 'http://127.0.0.1:54399';
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const storageUrl = process.env.E2E_S3_ENDPOINT ?? 'http://127.0.0.1:9000';

export const fullStackEnvironment = {
  PALDORA_ENV: 'test',
  LOG_LEVEL: 'info',
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://paldora:paldora_dev_only@localhost:5432/paldora',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JOB_QUEUE_NAME: 'paldora-e2e',
  SUPABASE_URL: authUrl,
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-role-key-not-a-secret',
  S3_ENDPOINT: storageUrl,
  S3_REGION: 'us-east-1',
  S3_BUCKET: process.env.S3_BUCKET ?? 'paldora-private',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'paldora_minio',
  S3_SECRET_ACCESS_KEY:
    process.env.S3_SECRET_ACCESS_KEY ?? 'paldora_minio_dev_only',
  S3_FORCE_PATH_STYLE: 'true',
  API_HOST: '127.0.0.1',
  API_PORT: String(apiPort),
  WEB_ORIGIN: webUrl,
  OUTBOX_POLL_INTERVAL_MS: '250',
  NEXT_PUBLIC_WEB_URL: webUrl,
  NEXT_PUBLIC_API_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_URL: authUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  NEXT_PUBLIC_MEDIA_ORIGIN: storageUrl,
};

const env = { ...process.env, ...fullStackEnvironment } as Record<
  string,
  string
>;

export default defineConfig({
  testDir: './apps/web/e2e/full-stack',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-390',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: 'node apps/web/e2e/full-stack/fake-auth-server.mjs',
      url: `${authUrl}/health`,
      reuseExistingServer: false,
      env,
    },
    {
      // `pnpm test:e2e:full` builds the API, worker, and web dependencies first.
      command: 'node apps/api/dist/main.js',
      url: `${apiUrl}/health/ready`,
      reuseExistingServer: false,
      timeout: 180_000,
      env,
    },
    {
      command: 'node apps/worker/dist/main.js',
      wait: { stdout: /Paldora worker listening/ },
      stdout: 'pipe',
      reuseExistingServer: false,
      timeout: 180_000,
      env,
    },
    {
      command: `pnpm --filter @paldora/web build && pnpm --filter @paldora/web start --hostname 127.0.0.1 --port ${webPort}`,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 300_000,
      env,
    },
  ],
});
