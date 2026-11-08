// Records scene frames: node record.mjs <desktop|phone|vertical> [sceneId ...]
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
  vertical: ['mHome', 'mBox', 'mThread', 'mRoom', 'mMemories', 'mDark'],
}[profileName];
const list = only.length ? only : wanted;

// Local demo account from the repo docs (fictional, localhost only).
const credentials = {
  email: 'me@example.test',
  password: 'a-local-test-password',
};

const browser = await chromium.launch();
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
