import { defineConfig } from '@playwright/test';
import {
  productionWebServer,
  sharedConfig,
  viewportProjects,
} from './playwright.shared';
const port = Number(process.env.E2E_WEB_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...sharedConfig,
  testDir: '.',
  // Signed-in flows need the API, worker, and a local auth issuer; they run
  // through playwright.fullstack.config.ts.
  testIgnore: '**/full-stack/**',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: viewportProjects(),
  webServer: productionWebServer(port, 240_000),
});
