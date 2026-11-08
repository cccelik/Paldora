import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';
import { ORIGIN, THEMES } from './story.mjs';

const POST_TEXT =
  'Found this brass lamp at the flea market. Look at that glow.';

/** Navigate off camera, wait until the page is settled, then rewind to the top. */
async function prep(page, url) {
  await page.goto(url.startsWith('http') ? url : ORIGIN + url);
  await page.waitForLoadState('load');
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function boxUrl(page, name) {
  await prep(page, '/boxes');
  const href = await page
    .locator('a[href^="/boxes/"]', { hasText: name })
    .first()
    .getAttribute('href');
  return href;
}

function samplePhoto() {
  const dir = path.join(OUT, 'assets');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'brass-lamp.jpg');
  if (!existsSync(file)) {
    // A large (3000x2000) generated warm gradient, so the in-browser resize is real work.
    execFileSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'gradients=s=3000x2000:c0=0x2C2621:c1=0xC39A52:c2=0xF1E6CF:x0=0:y0=2000:x1=3000:y1=0:speed=0:d=1',
      '-frames:v',
      '1',
      '-q:v',
      '3',
      file,
    ]);
  }
  return file;
}

export const scenes = {
  async home({ page, r }) {
    await prep(page, '/home');
    await r.hold(1.0);
    const box = page.getByRole('link', { name: /Page Turners/ }).first();
    const c = await r.center(box).catch(() => ({ x: 1200, y: 480 }));
    await r.moveTo(c.x, c.y, 0.9);
    await r.hold(0.8);
    await r.scrollBy(620, 3.0);
    await r.hold(0.3);
  },

  async boxes({ page, r }) {
    await prep(page, '/boxes');
    await r.hold(0.8);
    await r.click(
      page.locator('a[href^="/boxes/"]', { hasText: 'Close Friends' }).first(),
      0.7,
      true,
    );
    await r.quiet(async () => /\/boxes\/[0-9a-f-]{36}$/.test(page.url()));
    await r.hold(0.9);
    await r.scrollBy(1050, 3.0);
  },

  async thread({ page, r }) {
    const href = await boxUrl(page, 'Close Friends');
    await prep(page, href);
    const link = page
      .locator('a[href$="#comments"]', { hasText: '7 comments' })
      .first();
    await r.scrollToLocator(link, 0.01, 420);
    await r.click(link, 0.6, true);
    await r.quiet(
      async () =>
        /\/posts\//.test(page.url()) &&
        (await page.getByRole('list', { name: 'Comments' }).count()) > 0,
    );
    await r.hold(0.9);
    await r.scrollToLocator(
      page.getByRole('list', { name: 'Comments' }),
      1.2,
      160,
    );
    await r.hold(0.8);
    await r.scrollTo(0, 0.9);
    await r.click(
      page.getByRole('button', { name: 'Post options' }).first(),
      0.6,
    );
    await r.hold(1.3);
  },

  async composer({ page, r }) {
    const href = await boxUrl(page, 'Wren and Me');
    await prep(page, href);
    const area = page.locator('textarea').first();
    await r.click(area, 0.8);
    await r.type(area, POST_TEXT, 2);
    const chooser = page.waitForEvent('filechooser');
    await r.click(page.getByRole('button', { name: 'Add photos' }), 0.6);
    (await chooser).setFiles(samplePhoto());
    const post = page.getByRole('button', { name: 'Post', exact: true });
    await r.hold(0.4);
    await r.until(async () => post.isEnabled(), 20);
    await r.hold(0.8);
    await r.click(post, 0.6);
    await r.until(
      async () =>
        page
          .locator('article', { hasText: POST_TEXT })
          .count()
          .then((n) => n > 0),
      25,
    );
    await r.hold(0.5);
    await r.scrollToLocator(
      page.locator('article', { hasText: POST_TEXT }).first(),
      0.8,
      120,
    );
    await r.hold(1.0);
  },

  async lifeupdate({ page, r }) {
    await prep(page, '/life-updates/new');
    const inputs = page.locator('textarea');
    await r.click(inputs.nth(0), 0.7);
    await r.type(
      inputs.nth(0),
      'Moved into a studio with a window that faces east.',
      3,
    );
    await r.click(inputs.nth(3), 0.5);
    await r.type(inputs.nth(3), 'Glaze chemistry and very small bowls.', 3);
    const who = page.getByText(/who it.s for/i).first();
    await r.scrollToLocator(who, 1.0, 120);
    for (const name of [
      'Close Friends',
      'Page Turners Book Club',
      'Starfall Fandom Circle',
    ]) {
      await r.click(page.getByLabel(name, { exact: false }).first(), 0.5);
    }
    await r.hold(0.6);
    await r.click(page.getByLabel('Only me'), 0.6);
    await r.hold(0.9);
    await r.click(page.getByLabel('Boxes', { exact: true }).first(), 0.5);
    await r.hold(0.5);
  },

  async memories({ page, r }) {
    await prep(page, '/memories');
    await r.hold(0.6);
    await r.click(
      page.getByRole('link', { name: '2026', exact: true }).first(),
      0.7,
      true,
    );
    await r.quiet(async () => /memories\/2026/.test(page.url()));
    await r.hold(0.7);
    await r.scrollBy(900, 3.2);
    await r.hold(0.3);
  },

  async room({ page, r }) {
    await prep(page, '/rooms/demo_mara');
    await r.hold(1.0);
    const top = page.getByText('Top Friends', { exact: false }).first();
    const c = await r.center(top);
    await r.moveTo(c.x + 120, c.y + 60, 0.9);
    await r.scrollBy(520, 2.8);
    await r.hold(0.6);
  },

  async themes({ page, r }) {
    for (const t of THEMES) {
      await page.goto(`${ORIGIN}/design-preview/rooms/${t}`);
      await page.waitForLoadState('load');
      await page.waitForTimeout(500);
      // Skip the fixture's empty banner: start just below it.
      await page.evaluate(() => {
        // Recording only: drop the fixture's empty-state cards ("No photos to show yet.").
        for (const el of document.querySelectorAll('p, div, span')) {
          if (
            el.children.length === 0 &&
            /^No .* yet\.?$/.test(el.textContent.trim())
          ) {
            el.parentElement.style.display = 'none';
          }
        }
        window.scrollTo(0, 248);
      });
      const name = t
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      await page.evaluate((n) => window.__pv?.label(n), name);
      r.cursor = { x: -200, y: -200 };
      await r.hold(0.55);
    }
  },

  async friends({ page, r }) {
    await prep(page, '/friends');
    await r.hold(1.0);
    await r.scrollBy(700, 2.6);
    await r.hold(0.5);
  },

  async appearance({ page, r }) {
    await page.emulateMedia({ colorScheme: 'light' });
    await prep(page, '/settings/appearance');
    await r.hold(1.6);
    await page.emulateMedia({ colorScheme: 'dark' });
    await r.hold(2.6);
    await page.emulateMedia({ colorScheme: 'light' });
  },

  // ---- v2 pitch cut: extra footage ----
  async boxGrid({ page, r }) {
    await prep(page, '/boxes');
    await r.hold(0.4);
    const tiles = page.locator('a[href^="/boxes/"]');
    for (const i of [3, 0, 1, 5]) {
      const c = await r.center(tiles.nth(i));
      await r.moveTo(c.x, c.y, 0.5);
      await r.hold(0.12);
    }
    await r.hold(0.3);
  },

  async react({ page, r }) {
    const href = await boxUrl(page, 'Close Friends');
    await prep(page, href);
    const art = page.locator('article', { hasText: 'Finally glazed' }).first();
    await r.scrollToLocator(art, 0.01, 40);
    await r.hold(0.5);
    await r.click(art.getByRole('button', { name: 'More reactions' }), 0.6);
    await r.hold(1.0);
    await page.keyboard.press('Escape');
    await r.hold(0.4);
    await r.click(art.getByRole('button', { name: 'Camera' }), 0.6, true);
    await r.quiet(() =>
      page.getByRole('button', { name: 'Take photo' }).isVisible(),
    );
    await r.hold(1.6);
    await page.keyboard.press('Escape');
    await r.hold(0.3);
  },

  async splitLight({ page, r }) {
    await page.emulateMedia({ colorScheme: 'light' });
    await splitPath(page, r);
  },

  async splitDark({ page, r }) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await splitPath(page, r);
    await page.emulateMedia({ colorScheme: 'light' });
  },

  async themeStills({ page, r }) {
    for (const t of THEMES) {
      await page.goto(`${ORIGIN}/design-preview/rooms/${t}`);
      await page.waitForLoadState('load');
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('p, div, span')) {
          if (
            el.children.length === 0 &&
            /^No .* yet\.?$/.test(el.textContent.trim())
          ) {
            el.parentElement.style.display = 'none';
          }
        }
        window.scrollTo(0, window.innerWidth < 500 ? 56 : 248);
      });
      r.cursor = { x: -200, y: -200 };
      await r.snap();
    }
  },

  async mLife({ page, r }) {
    await prep(page, '/life-updates/new');
    const inputs = page.locator('textarea');
    await r.click(inputs.nth(0), 0.5);
    await r.type(inputs.nth(0), 'Moved into a studio with an east window.', 3);
    const who = page.getByText(/who it.s for/i);
    await r.scrollToLocator(who, 0.9, 100);
    for (const name of [
      'Close Friends',
      'Page Turners Book Club',
      'Starfall Fandom Circle',
    ]) {
      await r.click(page.getByLabel(name, { exact: false }).first(), 0.4);
    }
    await r.hold(0.8);
  },

  // ---- mobile (390px) ----
  async mHome({ page, r }) {
    await prep(page, '/home');
    await r.hold(1.0);
    await r.scrollBy(700, 2.8);
  },

  async mBox({ page, r }) {
    await prep(page, '/home');
    await r.hold(0.4);
    await r.click(
      page.locator('nav a[href="/boxes"]:visible').first(),
      0.5,
      true,
    );
    await r.quiet(async () => page.url().endsWith('/boxes'));
    await r.hold(0.8);
    await r.click(
      page.locator('a[href^="/boxes/"]', { hasText: 'Close Friends' }).first(),
      0.6,
      true,
    );
    await r.quiet(async () => /\/boxes\/[0-9a-f-]{36}$/.test(page.url()));
    await r.hold(0.8);
    await r.scrollBy(1100, 3.0);
  },

  async mThread({ page, r }) {
    const href = await boxUrl(page, 'Close Friends');
    await prep(page, href);
    const link = page
      .locator('a[href$="#comments"]', { hasText: '7 comments' })
      .first();
    await r.scrollToLocator(link, 0.01, 400);
    await r.click(link, 0.6, true);
    await r.quiet(
      async () =>
        /\/posts\//.test(page.url()) &&
        (await page.getByRole('list', { name: 'Comments' }).count()) > 0,
    );
    await r.hold(0.8);
    await r.scrollToLocator(
      page.getByRole('list', { name: 'Comments' }),
      1.2,
      100,
    );
    await r.scrollBy(500, 2.0);
  },

  async mRoom({ page, r }) {
    await prep(page, '/rooms/demo_mara');
    await r.hold(1.2);
    await r.scrollBy(900, 3.0);
  },

  async mMemories({ page, r }) {
    await prep(page, '/memories/2026');
    await r.hold(0.8);
    await r.scrollBy(1000, 3.2);
  },

  async mDark({ page, r }) {
    await page.emulateMedia({ colorScheme: 'light' });
    await prep(page, '/settings/appearance');
    await r.hold(1.4);
    await page.emulateMedia({ colorScheme: 'dark' });
    await r.hold(2.4);
    await page.emulateMedia({ colorScheme: 'light' });
  },
};

async function splitPath(page, r) {
  await prep(page, '/home');
  await r.hold(0.6);
  await r.scrollBy(520, 2.0);
  await r.hold(0.4);
}

/** Removes the post the composer scene created, so re-runs leave no residue. */
export async function cleanupComposerPost(page) {
  const href = await boxUrl(page, 'Wren and Me');
  await prep(page, href);
  for (let i = 0; i < 5; i++) {
    const art = page.locator('article', { hasText: POST_TEXT }).first();
    if (!(await art.count())) return i;
    await art.getByRole('button', { name: 'Post options' }).click();
    await page.getByRole('menuitem', { name: /delete post/i }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /delete/i })
      .last()
      .click();
    await page.waitForTimeout(1800);
    await page.reload();
    await page.waitForLoadState('load');
  }
  return -1;
}

// Same choreography at 390px.
scenes.mReact = scenes.react;
scenes.mBoxGrid = scenes.boxGrid;
scenes.mSplitLight = scenes.splitLight;
scenes.mSplitDark = scenes.splitDark;
scenes.mThemeStills = scenes.themeStills;
