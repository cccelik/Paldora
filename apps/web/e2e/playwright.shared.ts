import {
  devices,
  type PlaywrightTestConfig,
  type Project,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
/**
 * The repository root. Web servers start there (their commands use root
 * paths), and artifacts land in its `test-results/`, which CI uploads.
 */
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** Settings both suites share. */
export const sharedConfig = {
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: `${repoRoot}test-results`,
} satisfies PlaywrightTestConfig;

/** Every suite runs at desktop width and at 390px. */
export function viewportProjects(use: Project['use'] = {}): Project[] {
  return [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...use } },
    {
      name: 'mobile-390',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        ...use,
      },
    },
  ];
}

/**
 * Always test a production build: the CSP and caching behavior differ from
 * development, and production is what users get.
 */
export function productionWebServer(
  port: number,
  timeout: number,
  env?: Record<string, string>,
) {
  return {
    command: `cd apps/web && node_modules/.bin/next build && node_modules/.bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout,
    ...(env ? { env } : {}),
  };
}
