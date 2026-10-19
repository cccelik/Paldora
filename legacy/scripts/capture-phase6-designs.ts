import { chromium } from '@playwright/test';
import path from 'node:path';

const baseUrl = process.env.PALDORA_WEB_URL ?? 'http://127.0.0.1:3000';
const designRoot = path.resolve(process.cwd(), '../../design');
const screens = [
  [
    '06-posts/life-update-post-detail.png',
    '/design-preview/phase-6?screen=detail',
    1440,
    1024,
  ],
  [
    '07-life-updates/life-update-composer-desktop.png',
    '/design-preview/phase-6?screen=composer',
    1440,
    1024,
  ],
  [
    '07-life-updates/life-update-composer-mobile.png',
    '/design-preview/phase-6?screen=composer',
    390,
    844,
  ],
  [
    '07-life-updates/life-update-feed-card.png',
    '/design-preview/phase-6',
    1440,
    1024,
  ],
  [
    '07-life-updates/life-update-full-page.png',
    '/design-preview/phase-6?screen=detail',
    1440,
    1024,
  ],
  [
    '07-life-updates/life-update-edit.png',
    '/design-preview/phase-6?screen=edit',
    1440,
    1024,
  ],
  [
    '07-life-updates/friend-life-update-history.png',
    '/design-preview/phase-6?screen=history',
    1440,
    1024,
  ],
  [
    '07-life-updates/monthly-life-update-overview.png',
    '/design-preview/phase-6?screen=month',
    1440,
    1024,
  ],
  [
    '08-boxes/box-memories.png',
    '/design-preview/phase-6?screen=memories',
    1440,
    1024,
  ],
  [
    '08-boxes/box-life-updates.png',
    '/design-preview/phase-6?screen=box',
    1440,
    1024,
  ],
  [
    '13-memories/memory-home.png',
    '/design-preview/phase-6?screen=memories',
    1440,
    1024,
  ],
  [
    '13-memories/year-timeline.png',
    '/design-preview/phase-6?screen=memories',
    1440,
    1024,
  ],
  [
    '13-memories/month-timeline.png',
    '/design-preview/phase-6?screen=month',
    1440,
    1024,
  ],
  [
    '13-memories/box-timeline.png',
    '/design-preview/phase-6?screen=month',
    1440,
    1024,
  ],
  [
    '13-memories/memory-detail.png',
    '/design-preview/phase-6?screen=detail',
    1440,
    1024,
  ],
  [
    '23-mobile/memories.png',
    '/design-preview/phase-6?screen=memories',
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
      path: path.join(designRoot, filename),
      fullPage: false,
    });
    await page.close();
  }
  await browser.close();
}

void capture();
