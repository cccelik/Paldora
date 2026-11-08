// Renders title/end/principle cards, lower-third captions and the phone overlay
// as PNGs, using the app's self-hosted Fraunces + Geist and the Hearth & Brass tokens.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT, ROOT, chromium } from './lib.mjs';
import { CAPTIONS, PRINCIPLES } from './story.mjs';

const tokens = JSON.parse(
  readFileSync(path.join(ROOT, 'design/tokens/paldora.tokens.json'), 'utf8'),
);
const dark = tokens.theme.dark;
const C = {
  canvas: dark.bg.canvas.$value,
  surface: dark.bg.surface.$value,
  inverse: tokens.theme.light.bg.inverse.$value, // dark in both modes
  hairline: dark.border.hairline.$value,
  text: dark.text.primary.$value,
  secondary: dark.text.secondary.$value,
  brass: dark.accent.brass.$value,
  brassText: dark.accent.brassText.$value,
};
const fonts = path.join(ROOT, 'apps/web/app/fonts');

const BASE = `
@font-face{font-family:Fraunces;src:url('file://${fonts}/Fraunces-Variable.woff2');font-weight:100 900;font-style:normal}
@font-face{font-family:Fraunces;src:url('file://${fonts}/Fraunces-Italic-Variable.woff2');font-weight:100 900;font-style:italic}
@font-face{font-family:Geist;src:url('file://${fonts}/Geist-Variable.woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0}
html,body{width:100%;height:100%;background:transparent}
body{font-family:Geist,sans-serif;color:${C.text};-webkit-font-smoothing:antialiased}
em{font-style:italic;font-weight:300;color:${C.brassText}}
.card{position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 45%,#221c16 0%,${C.canvas} 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.mark{font-family:Fraunces;font-style:italic;font-weight:300}
.dot{color:${C.brass}}
.star{position:absolute;color:${C.brass};opacity:.8}
`;

const star = (x, y, s, o = 0.8) =>
  `<svg class="star" style="left:${x};top:${y};width:${s}px;height:${s}px;opacity:${o}" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c.8 6.6 5.4 11.2 12 12-6.6.8-11.2 5.4-12 12-.8-6.6-5.4-11.2-12-12C6.6 11.2 11.2 6.6 12 0z"/></svg>`;

const cards = (W, H, v) => {
  const k = v ? 0.85 : 1;
  const px = (n) => `${Math.round(n * k)}px`;
  const title = `<div class="card">
    ${star('18%', '22%', 34 * k)}${star('80%', '30%', 22 * k, 0.55)}${star('72%', '74%', 40 * k)}${star('24%', '70%', 18 * k, 0.5)}
    <div class="mark" style="font-size:${px(72)}">paldora<span class="dot">.</span></div>
    <div style="font:300 ${px(168)}/${px(176)} Fraunces;margin-top:${px(40)};letter-spacing:-.01em">A box for<br><em>your people.</em></div>
    <div style="margin-top:${px(48)};font:400 ${px(30)}/1.4 Geist;color:${C.secondary};letter-spacing:.02em">A private place for friends and their memories.</div></div>`;
  const end = `<div class="card">
    ${star('20%', '28%', 30 * k, 0.6)}${star('78%', '66%', 36 * k)}
    <div class="mark" style="font-size:${px(260)};line-height:1">paldora<span class="dot">.</span></div>
    <div style="margin-top:${px(44)};font:400 ${px(40)} Geist;color:${C.secondary};letter-spacing:.03em">A box for your people.</div></div>`;
  const principle = ([
    a,
    b,
  ]) => `<div class="card">${star('82%', '24%', 28 * k, 0.6)}
    <div style="font:300 ${px(150)}/${px(160)} Fraunces;letter-spacing:-.01em">${a}<br><em>${b}</em></div></div>`;
  return { title, end, principle };
};

/** Caption bar text, placed in the dedicated strip below the footage (never over the app). */
const caption = ([eyebrow, text], W, v) =>
  v
    ? `<div style="position:absolute;left:64px;right:64px;top:1700px;height:220px;display:flex;flex-direction:column;justify-content:center;gap:12px">
    <div style="font:600 24px Geist;letter-spacing:.16em;text-transform:uppercase;color:${C.brassText}">${eyebrow}</div>
    <div style="font:400 44px/54px Fraunces;color:#F2EBDF">${text}</div></div>`
    : `<div style="position:absolute;left:80px;right:80px;top:1000px;height:80px;display:flex;align-items:center;gap:32px;white-space:nowrap">
    <div style="font:600 20px Geist;letter-spacing:.16em;text-transform:uppercase;color:${C.brassText}">${eyebrow}</div>
    <div style="font:400 36px Fraunces;color:#F2EBDF">${text}</div></div>`;

const phoneOverlay = () => `
  <div style="position:absolute;left:150px;top:0;height:1080px;width:760px;display:flex;flex-direction:column;justify-content:center">
    <div style="font:600 20px Geist;letter-spacing:.16em;text-transform:uppercase;color:${C.brassText};margin-bottom:24px">On your phone</div>
    <div style="font:300 96px/104px Fraunces;letter-spacing:-.01em">Made for the<br><em>small screen,</em><br>too.</div>
    <div style="margin-top:36px;font:400 28px/1.45 Geist;color:${C.secondary}">The same Boxes and Rooms, at 390 pixels wide.</div></div>
  <div style="position:absolute;left:1060px;top:53px;width:450px;height:974px;border-radius:46px;box-shadow:0 0 0 16px #0c0a09,0 0 0 18px #3A332C,0 40px 120px rgba(0,0,0,.6)"></div>`;

async function shot(page, dir, name, size, html, transparent) {
  const file = path.join(dir, `${name}.html`);
  writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><style>${BASE}</style>${html}`,
  );
  await page.setViewportSize({ width: size[0], height: size[1] });
  await page.goto(`file://${file}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(dir, `${name}.png`),
    omitBackground: transparent,
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [profile, size, v] of [
  ['desktop', [1920, 1080], false],
  ['vertical', [1080, 1920], true],
]) {
  const dir = path.join(OUT, 'cards', profile);
  mkdirSync(dir, { recursive: true });
  const c = cards(size[0], size[1], v);
  await shot(page, dir, 'title', size, c.title, false);
  await shot(page, dir, 'end', size, c.end, false);
  for (const [i, p] of PRINCIPLES.entries())
    await shot(page, dir, `principle${i}`, size, c.principle(p), false);
  for (const [id, cap] of Object.entries(CAPTIONS)) {
    const isMobileCap = /^m[A-Z]/.test(id);
    if (isMobileCap !== v) continue;
    await shot(page, dir, `cap_${id}`, size, caption(cap, size[0], v), true);
  }
  if (!v) await shot(page, dir, 'phone_overlay', size, phoneOverlay(), true);
}
await browser.close();
console.log('cards done');
