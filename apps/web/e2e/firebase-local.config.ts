import { defineConfig } from '@playwright/test';
import {
  productionWebServer,
  repoRoot,
  sharedConfig,
  viewportProjects,
} from './playwright.shared';

const port = Number(process.env.E2E_WEB_PORT ?? 3200);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...sharedConfig,
  testDir: '.',
  testMatch: [
    '**/firebase-local.spec.ts',
    '**/web-hardening.spec.ts',
    '**/web-keyboard.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    permissions: ['camera'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },
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
    PALDORA_TRUST_INTERACTION_INDEX: '1',
  }),
  outputDir: `${repoRoot}test-results/firebase-local`,
});
