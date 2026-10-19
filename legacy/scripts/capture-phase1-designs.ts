import { chromium } from '@playwright/test';
import path from 'node:path';

const baseUrl = process.env.PALDORA_WEB_URL ?? 'http://127.0.0.1:3000';
const outputDirectory = path.resolve(process.cwd(), '../../design/03-auth');
const screens = [
  ['sign-in-desktop-light.png', '/sign-in', 1440, 1024],
  ['forgot-password-desktop-light.png', '/forgot-password', 1440, 1024],
  ['reset-password-desktop-light.png', '/reset-password', 1440, 1024],
  [
    'username-selection-desktop-light.png',
    '/design-preview/phase-1?screen=username',
    1440,
    1024,
  ],
  [
    'profile-setup-desktop-light.png',
    '/design-preview/phase-1?screen=profile',
    1440,
    1024,
  ],
  [
    'avatar-setup-desktop-light.png',
    '/design-preview/phase-1?screen=avatar',
    1440,
    1024,
  ],
  [
    'account-settings-desktop-dark.png',
    '/design-preview/phase-1?screen=settings',
    1440,
    1024,
  ],
  [
    'auth-error-states.png',
    '/design-preview/phase-1?screen=errors',
    2048,
    1536,
  ],
  ['sign-in-mobile-light.png', '/sign-in', 390, 844],
  [
    'username-selection-mobile-light.png',
    '/design-preview/phase-1?screen=username',
    390,
    844,
  ],
  [
    'username-unavailable-mobile.png',
    '/design-preview/phase-1?screen=username-error',
    390,
    844,
  ],
] as const;

async function capture(): Promise<void> {
  const browser = await chromium.launch();
  for (const [filename, route, width, height] of screens) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: path.join(outputDirectory, filename),
      fullPage: false,
    });
    await page.close();
  }
  await browser.close();
}

void capture();
