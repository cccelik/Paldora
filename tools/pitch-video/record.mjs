// Records scene frames: node record.mjs <desktop|phone|vertical> [sceneId ...]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { OUT, PROFILES, Recorder, chromium, openSession } from './lib.mjs';
import { cleanupComposerPost, scenes } from './scenes.mjs';
import { FPS, ORIGIN } from './story.mjs';

const [profileName, ...only] = process.argv.slice(2);
const profile = PROFILES[profileName];
if (!profile)
  throw new Error('usage: record.mjs <desktop|phone|vertical> [scene ...]');

const wanted = {
  desktop: [
    'home',
    'boxes',
    'thread',
    'composer',
    'lifeupdate',
    'memories',
    'room',
    'themes',
    'friends',
    'appearance',
  ],
  phone: ['mHome', 'mBox', 'mRoom'],
  vertical: [
    'mHome',
    'mBox',
    'mThread',
    'mRoom',
    'mMemories',
    'mDark',
    'mReact',
    'mBoxGrid',
    'mSplitLight',
    'mSplitDark',
    'mThemeStills',
    'mLife',
  ],
}[profileName];
const list = only.length ? only : wanted;

// Local demo account from the repo docs (fictional, localhost only).
const credentials = {
  email: 'me@example.test',
  password: 'a-local-test-password',
};

// Fake camera feed: a warm animated gradient (no fake person), so the camera
// reaction UI shows something on brand. Chromium reads it as a y4m file.
mkdirSync(path.join(OUT, 'assets'), { recursive: true });
const cam = path.join(OUT, 'assets', 'camera.y4m');
if (!existsSync(cam)) {
  execFileSync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'gradients=s=640x480:c0=0xC39A52:c1=0x2C2621:c2=0xF1E6CF:speed=0.03:d=8:r=30',
    '-pix_fmt',
    'yuv420p',
    cam,
  ]);
}
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${cam}`,
  ],
});
const { context, page } = await openSession(
  browser,
  profile,
  ORIGIN,
  credentials,
);
const r = new Recorder(page, FPS);

// Warm the dev server so no route compiles on camera.
for (const u of [
  '/home',
  '/boxes',
  '/memories',
  '/memories/2026',
  '/friends',
  '/life-updates/new',
  '/rooms/demo_mara',
  '/settings/appearance',
]) {
  await page.goto(ORIGIN + u);
  await page.waitForLoadState('load');
}

for (const id of list.filter((s) => s !== 'cleanup')) {
  r.begin(path.join(OUT, 'frames', profileName, id));
  r.cursor = { x: profile.vw * 0.6, y: profile.vh * 0.5 };
  console.log(`recording ${profileName}/${id}`);
  await scenes[id]({ page, r });
  console.log(`  ${r.n} frames (${(r.n / FPS).toFixed(1)}s)`);
}

if (list.includes('composer') || list.includes('cleanup')) {
  console.log(
    'composer cleanup, deleted attempts:',
    await cleanupComposerPost(page),
  );
}
await context.close();
await browser.close();
