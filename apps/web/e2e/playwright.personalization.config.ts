import { defineConfig, devices } from '@playwright/test';
import fullStack from './playwright.fullstack.config';
/** Same production services and isolated test database; all three browser engines. */
export default defineConfig({
  ...fullStack,
  testMatch: 'room-personalization.spec.ts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    {
      name: 'webkit-390',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
