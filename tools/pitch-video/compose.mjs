// Pitch cut v2 compositor: node compose.mjs <main|short|vertical> [--still t1,t2,...]
// Renders every output frame in Chromium from recorded UI footage + kinetic type, then muxes with music.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { HERE, OUT, ROOT, chromium } from './lib.mjs';
import { BAR, BEAT, COPY, CUTS, THEMES_V2 } from './story2.mjs';
import { ARRANGEMENTS } from './story2.mjs';

const cutName = process.argv[2] ?? 'main';
const stillArg = process.argv.indexOf('--still');
const stills =
  stillArg > 0 ? process.argv[stillArg + 1].split(',').map(Number) : null;
const cut = CUTS[cutName];
const arr = ARRANGEMENTS[cutName];
const P = cut.portrait;
const [W, H] = P ? [1080, 1920] : [1920, 1080];
const FPS = 30;
const total = arr.bars * BAR + arr.tail;
const framesRoot = path.join(OUT, 'frames');
const dims = {
  desktop: [1920, 1000],
  phone: [975, 2110],
  vertical: [1080, 1700],
};
const nice = (t) =>
  t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * "Line one\n*accent* word" -> lines of word tokens tagged with a reveal batch `b`.
 * Each line is one batch (a phrase); a "|" token inside a line starts a new batch.
 * `lineBatch` overrides the batch per line (lines that ride together).
 */
function tokens(text, lineBatch = null) {
  let b = -1;
  return text.split('\n').map((line, li) => {
    if (lineBatch) b = lineBatch[li];
    else b += 1;
    let on = false;
    const out = [];
    for (const raw of line.split(' ')) {
      if (raw === '|') {
        b += 1;
        continue;
      }
      if (raw.startsWith('*')) on = true;
      out.push({ t: raw.replaceAll('*', ''), a: on, b });
      if (raw.endsWith('*')) on = false;
    }
    return out;
  });
}

/** Reveal times (seconds, group-local) from batch start times; the whole batch fades together. */
function timed(lines, starts, big = {}) {
  return lines.map((row) =>
    row.map((w) => ({
      t: w.t,
      a: w.a,
      at: starts[Math.min(w.b, starts.length - 1)],
      ...(big[w.t] ? { big: big[w.t] } : {}),
    })),
  );
}
const nBatches = (lines) => Math.max(...lines.flat().map((w) => w.b)) + 1;

const count = (dir) =>
  readdirSync(path.join(framesRoot, dir)).filter((f) => f.endsWith('.jpg'))
    .length;
const srcDims = (dir) => dims[dir.split('/')[0]];

let tCursor = 0;
const groups = [];
for (const g of cut.groups) {
  const t0 = tCursor;
  const t1 =
    t0 + g.bars * BAR ||
    t0 + (g.shots ? g.shots.reduce((a, s) => a + s.bars, 0) * BAR : 0);
  tCursor = t1;
  const o = { kind: g.kind, t0, t1, flash: false };
  const size = P ? 96 : 100;
  const sideR = g.side === 'R';
  if (g.kind === 'replace') {
    o.hl = {
      x: 0,
      y: 0,
      w: W,
      h: H,
      size: 300,
      align: 'center',
      lines: [COPY.hook.map((t) => ({ t, a: false, at: 0 }))],
    };
  } else if (g.kind === 'hookLine') {
    const lines = timed(tokens(COPY.hookLine, [0, 1, 1]), [0.05, BEAT]);
    o.hl = {
      x: 0,
      y: 0,
      w: W,
      h: H,
      size: P ? 150 : 180,
      align: 'center',
      lines,
    };
  } else if (g.kind === 'turn') {
    const starts =
      g.bars === 2 ? [0.05, 2 * BEAT, 4 * BEAT] : [0.05, BEAT, 2 * BEAT];
    const lines = timed(
      tokens('So we built a\nbox\nfor your people.'),
      starts,
      {
        box: P ? 2.7 : 2.6,
      },
    );
    lines[1][0].a = true;
    o.hl = {
      x: 0,
      y: 0,
      w: W,
      h: H,
      size: P ? 104 : 120,
      align: 'center',
      lines,
    };
  } else if (g.kind === 'cta') {
    o.hl = {
      x: 0,
      y: 0,
      w: W,
      h: H,
      size: P ? 150 : 200,
      align: 'center',
      lines: timed(tokens(COPY.cta), [0.05, BEAT]),
    };
  } else if (g.kind === 'wordmark') {
  } else {
    // benefit / themes / split share the "headline + card" composition
    const [headline, sub] = COPY[g.copy ?? 'themes'];
    const raw =
      P && g.kind === 'themes'
        ? headline
        : g.kind === 'themes'
          ? headline.replace('\n', ' | ')
          : g.kind === 'split' && !P
            ? headline.replace('\n', ' | ')
            : headline;
    const barsInGroup = g.bars ?? g.shots.reduce((a, x) => a + x.bars, 0);
    const bs =
      barsInGroup >= 2
        ? [0.05, BEAT, 2 * BEAT]
        : [0.05, BEAT * 0.75, BEAT * 1.5];
    const parsed = tokens(raw);
    const lines = timed(parsed, bs);
    const subObj = sub
      ? { text: sub, size: P ? 36 : 34, at: bs[Math.min(nBatches(parsed), 2)] }
      : null;
    if (g.kind === 'benefit') {
      const phone = !!g.phone;
      o.card = P
        ? { x: 114, y: 540, w: 851, h: 1340, r: 30, dir: 0 }
        : phone
          ? { x: 1130, y: 90, w: 416, h: 900, r: 46, dir: 1, phone: true }
          : sideR
            ? { x: 770, y: 190, w: 1090, h: 700, r: 28, dir: 1 }
            : { x: 60, y: 190, w: 1090, h: 700, r: 28, dir: -1 };
      o.hl = P
        ? {
            x: 70,
            y: 70,
            w: 940,
            h: 440,
            size,
            align: 'left',
            vj: 'flex-start',
            lines,
          }
        : {
            x: sideR ? 80 : 1190,
            y: 0,
            w: phone ? 850 : 640,
            h: H,
            size,
            align: 'left',
            lines,
          };
      if (phone) o.hl.x = 90;
      o.sub = subObj;
      let sc = t0;
      o.shots = g.shots.map((s) => {
        const [sw, sh] = srcDims(s.dir);
        const sh0 = {
          dir: s.dir,
          start: s.start,
          speed: s.speed ?? 1,
          t0: sc,
          t1: sc + s.bars * BAR,
          srcW: sw,
          srcH: sh,
          count: count(s.dir),
          z0: 1,
          z1: 1.06,
          focus:
            s.focus ?? (P ? [0.5, 0.5] : phone ? [0.5, 0.5] : [0.55, 0.42]),
        };
        sc += s.bars * BAR;
        return sh0;
      });
    } else if (g.kind === 'themes') {
      const dir = P ? 'vertical/mThemeStills' : 'desktop/themeStills';
      const [sw, sh] = srcDims(dir);
      const slots = g.slots;
      const order =
        slots === 16
          ? [...Array(14).keys(), 12, 13]
          : [0, 5, 2, 12, 8, 6, 13, 11];
      o.slots = slots;
      o.order = order;
      o.hl = P
        ? {
            x: 70,
            y: 60,
            w: 940,
            h: 330,
            size: 92,
            align: 'left',
            vj: 'flex-start',
            lines,
          }
        : { x: 150, y: 40, w: 1100, h: 190, size: 88, align: 'left', lines };
      o.card = P
        ? { x: 130, y: 540, w: 820, h: 1291, r: 28, dir: 0 }
        : { x: 260, y: 280, w: 1400, h: 729, r: 28, dir: 0 };
      o.pill = P ? { x: 70, y: 420, size: 44 } : { x: 1290, y: 112, size: 40 };
      o.shots = [
        {
          dir,
          start: 0,
          speed: 1,
          t0,
          t1,
          srcW: sw,
          srcH: sh,
          count: 14,
          z0: 1,
          z1: 1,
          focus: [0.5, 0.5],
        },
      ];
    } else if (g.kind === 'split') {
      const pre = P ? 'vertical/mSplit' : 'desktop/split';
      const [sw, sh] = srcDims(P ? 'vertical/x' : 'desktop/x');
      o.card = P
        ? { x: 114, y: 540, w: 851, h: 1340, r: 30, dir: 0 }
        : { x: 160, y: 330, w: 1600, h: 650, r: 28, dir: 0 };
      o.hl = P
        ? {
            x: 70,
            y: 70,
            w: 940,
            h: 440,
            size,
            align: 'left',
            vj: 'flex-start',
            lines,
          }
        : {
            x: 0,
            y: 30,
            w: W,
            h: 290,
            size: 92,
            align: 'center',
            lines,
          };
      o.sub = P ? subObj : subObj ? { ...subObj, size: 32 } : null;
      o.shots = [
        {
          dir: `${pre}Light`,
          dirB: `${pre}Dark`,
          start: 10,
          speed: 1,
          t0,
          t1,
          srcW: sw,
          srcH: sh,
          count: count(`${pre}Light`),
          z0: 1,
          z1: 1.06,
          focus: P ? [0.5, 0.5] : [0.5, 0.3],
        },
      ];
    }
  }
  groups.push(o);
}

const cfg = {
  W,
  H,
  fps: FPS,
  beat: BEAT,
  total,
  portrait: P,
  dropT: ARRANGEMENTS[cutName].dropBar * BAR,
  fonts: path.join(ROOT, 'apps/web/app/fonts'),
  frames: framesRoot,
  endText: COPY.end,
  themeNames: THEMES_V2.map(nice),
  groups,
};

const outDir = path.join(OUT, 'v2', cutName);
const browser = await chromium.launch({
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
});
await page.goto(`file://${path.join(HERE, 'stage.html')}`);
await page.evaluate((c) => window.init(c), cfg);
const N = Math.round(total * FPS);
if (stills) {
  mkdirSync(outDir, { recursive: true });
  for (const t of stills) {
    await page.evaluate((x) => window.frame(x), t);
    await page.screenshot({
      path: path.join(outDir, `still_${t.toFixed(2)}.png`),
    });
  }
  await browser.close();
  console.log('stills', stills.join(','));
  process.exit(0);
}
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (let f = 0; f < N; f++) {
  await page.evaluate((x) => window.frame(x), f / FPS);
  await page.screenshot({
    path: path.join(outDir, `${String(f).padStart(5, '0')}.jpg`),
    type: 'jpeg',
    quality: 95,
  });
}
await browser.close();

execFileSync('node', [path.join(HERE, 'mux.mjs'), cutName], {
  stdio: 'inherit',
});
