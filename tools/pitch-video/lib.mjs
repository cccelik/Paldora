import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const OUT = path.join(HERE, 'out'); // git-ignored via tools/pitch-video/.gitignore

const require = createRequire(path.join(ROOT, 'package.json'));
export const { chromium } = require('@playwright/test');

export const ease = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
export const pad = (n) => String(n).padStart(5, '0');

/** Page-side helpers: cursor dot, click ripple, hidden Next dev badge. */
const OVERLAY = `(() => {
  const mount = () => {
    if (document.getElementById('__pv') || !document.body) return;
    const css = document.createElement('style');
    css.textContent = 'nextjs-portal{display:none!important}';
    document.head.appendChild(css);
    const dot = document.createElement('div');
    dot.id = '__pv';
    dot.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(195,154,82,.92);border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px)';
    const rip = document.createElement('div');
    rip.style.cssText = 'position:fixed;left:0;top:0;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:3px solid #C39A52;z-index:2147483646;pointer-events:none;opacity:0;transform:translate(-200px,-200px)';
    document.body.append(rip, dot);
    window.__pv = {
      set(x, y, t) {
        dot.style.transform = 'translate(' + x + 'px,' + y + 'px)' + (t >= 0 ? ' scale(.82)' : '');
        rip.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + (0.4 + Math.max(t, 0) * 1.4) + ')';
        rip.style.opacity = t >= 0 ? String(1 - t) : '0';
      },
      label(text) {
        let l = document.getElementById('__pvl');
        if (!l) {
          l = document.createElement('div');
          l.id = '__pvl';
          l.style.cssText = 'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);padding:12px 28px;border-radius:999px;background:#2A2420;color:#F2EBDF;font:600 24px Geist,system-ui,sans-serif;letter-spacing:.02em;z-index:2147483645;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.3)';
          document.body.append(l);
        }
        l.textContent = text;
      },
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();`;

export class Recorder {
  constructor(page, fps) {
    this.page = page;
    this.fps = fps;
    this.cursor = { x: -200, y: -200 };
    this.dir = null;
    this.n = 0;
  }

  begin(dir) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    this.dir = dir;
    this.n = 0;
  }

  async snap(ripple = -1) {
    await this.page.evaluate(
      ([x, y, t]) => window.__pv?.set(x, y, t),
      [this.cursor.x, this.cursor.y, ripple],
    );
    await this.page.screenshot({
      path: path.join(this.dir, `${pad(this.n++)}.jpg`),
      type: 'jpeg',
      quality: 93,
    });
  }

  async hold(sec) {
    for (let i = 0; i < Math.round(sec * this.fps); i++) await this.snap();
  }

  async scrollTo(y, sec) {
    const from = await this.page.evaluate(() => window.scrollY);
    const frames = Math.max(1, Math.round(sec * this.fps));
    for (let i = 1; i <= frames; i++) {
      const v = from + (y - from) * ease(i / frames);
      await this.page.evaluate((v2) => window.scrollTo(0, v2), v);
      await this.snap();
    }
  }

  async scrollBy(dy, sec) {
    const from = await this.page.evaluate(() => window.scrollY);
    await this.scrollTo(from + dy, sec);
  }

  async scrollToLocator(loc, sec, top = 140) {
    const y = await loc.evaluate(
      (el, t) => el.getBoundingClientRect().top + window.scrollY - t,
      top,
    );
    await this.scrollTo(Math.max(0, y), sec);
  }

  async moveTo(x, y, sec) {
    const { x: x0, y: y0 } = this.cursor;
    const frames = Math.max(1, Math.round(sec * this.fps));
    for (let i = 1; i <= frames; i++) {
      const e = ease(i / frames);
      this.cursor = { x: x0 + (x - x0) * e, y: y0 + (y - y0) * e };
      await this.snap();
    }
  }

  async center(loc) {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** Glide to the element, ripple, click. */
  async click(loc, travel = 0.7, nav = false) {
    const { x, y } = await this.center(loc);
    await this.moveTo(x, y, travel);
    // Navigating clicks: show the ripple first, click off camera (no loading frames).
    if (nav) for (let i = 0; i < 6; i++) await this.snap(i / 5);
    await loc.click();
    if (!nav) for (let i = 0; i < 8; i++) await this.snap(i / 7);
  }

  /** Keep recording frames until the condition holds (or give up loudly). */
  async until(fn, maxSec = 12) {
    for (let i = 0; i < maxSec * this.fps; i++) {
      if (await fn()) return;
      await this.snap();
    }
    throw new Error('condition never became true while recording');
  }

  /** Wait without recording (page transitions, skeletons), then settle. */
  async quiet(fn, ms = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await fn()) return this.page.waitForTimeout(1000);
      await this.page.waitForTimeout(100);
    }
    throw new Error('quiet wait timed out');
  }

  async type(loc, text, perFrame = 1) {
    await loc.focus();
    for (let i = 0; i < text.length; i += perFrame) {
      await this.page.keyboard.type(text.slice(i, i + perFrame));
      await this.snap();
    }
  }
}

export async function openSession(browser, profile, origin, credentials) {
  const context = await browser.newContext({
    viewport: { width: profile.vw, height: profile.vh },
    deviceScaleFactor: profile.dsf,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    bypassCSP: true, // recording only: lets the overlay use inline styles
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  await page.goto(`${origin}/sign-in`);
  await page.fill('input[type=email]', credentials.email);
  await page.fill('input[type=password]', credentials.password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/(boxes|home)/, { timeout: 30000 });
  await page.waitForLoadState('load');
  return { context, page };
}

export const PROFILES = {
  desktop: { vw: 1440, vh: 750, dsf: 4 / 3, mobile: false, out: [1920, 1080] },
  phone: { vw: 390, vh: 844, dsf: 2.5, mobile: true, out: [975, 2110] },
  vertical: {
    vw: 390,
    vh: 614,
    dsf: 1080 / 390,
    mobile: true,
    out: [1170, 2079],
  },
};
