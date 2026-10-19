import { chromium } from '@playwright/test';
import path from 'node:path';

const baseUrl = process.env.PALDORA_WEB_URL ?? 'http://127.0.0.1:3000';
const designRoot = path.resolve(process.cwd(), '../../design');
const themeScreens = [
  ['obsidian-gold', 'obsidian_gold'],
  ['cream-paper', 'cream_paper'],
  ['lavender-dream', 'lavender_dream'],
  ['ocean-glow', 'ocean_glow'],
  ['daisy-day', 'daisy_day'],
  ['neon-night', 'neon_night'],
  ['dark-academia', 'dark_academia'],
  ['frutiger-aero', 'frutiger_aero'],
  ['tumblr-2014', 'tumblr_2014'],
  ['retro-windows', 'retro_windows'],
  ['cyberpunk', 'cyberpunk'],
  ['minimal-editorial', 'minimal_editorial'],
  ['polaroid-scrapbook', 'polaroid_scrapbook'],
] as const;
const screens: readonly (readonly [string, string, number, number])[] = [
  ...themeScreens.map(
    ([file, theme]) =>
      [
        `11-themes/room-${file}-desktop.png`,
        `/design-preview/phase-7?theme=${theme}`,
        1440,
        1024,
      ] as const,
  ),
  [
    '09-friends/top-friends-editor.png',
    '/design-preview/phase-7?screen=top-friends',
    1440,
    1024,
  ],
  [
    '12-theme-editor/top-friends-options.png',
    '/design-preview/phase-7?screen=top-friends-options',
    2048,
    1536,
  ],
  [
    '12-theme-editor/music-widgets.png',
    '/design-preview/phase-7?screen=music',
    2048,
    1536,
  ],
  [
    '23-mobile/room.png',
    '/design-preview/phase-7?theme=polaroid_scrapbook',
    390,
    844,
  ],
];

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
