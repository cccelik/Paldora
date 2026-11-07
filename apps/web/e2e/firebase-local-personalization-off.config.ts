import { defineConfig } from '@playwright/test';
import {
  productionWebServer,
  repoRoot,
  sharedConfig,
  viewportProjects,
} from './playwright.shared';

/**
 * The same local Firebase web server with both Room personalization kill
 * switches OFF (their default). Playwright cannot vary a web server's
 * environment per project, so the off matrix runs as its own config.
 */
const port = Number(process.env.E2E_WEB_OFF_PORT ?? 3201);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...sharedConfig,
  testDir: '.',
  testMatch: ['**/room-personalization-off.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: viewportProjects(),
  webServer: productionWebServer(port, 240_000, {
    PALDORA_ENV: 'local',
    NEXT_PUBLIC_WEB_URL: baseURL,
    FIREBASE_PROJECT_ID: 'demo-paldora',
    FIREBASE_WEB_API_KEY: 'demo-api-key',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    FIREBASE_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001',
  }),
  outputDir: `${repoRoot}test-results/firebase-local-personalization-off`,
});
