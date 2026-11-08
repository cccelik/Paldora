// Assembles recorded frames + cards into the final MP4s.
// node assemble.mjs <desktop|vertical> [outfile]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { OUT, ROOT } from './lib.mjs';
import { DESKTOP, FPS, VERTICAL, XFADE } from './story.mjs';

const kind = process.argv[2] ?? 'desktop';
const vertical = kind === 'vertical';
const outFile =
  process.argv[3] ??
  path.join(
    ROOT,
    vertical ? 'Paldora-launch-v1-mobile.mp4' : 'Paldora-launch-v1.mp4',
  );
const [W, H] = vertical ? [1080, 1920] : [1920, 1080];
const CH = vertical ? 1700 : 1000; // footage height; the rest is the caption bar
const timeline = vertical ? VERTICAL : DESKTOP;
const cardsDir = path.join(OUT, 'cards', kind);
const segDir = path.join(OUT, 'segments', kind);
mkdirSync(segDir, { recursive: true });

/** Playback speed per scene (typing-heavy scenes are gently sped up). */
const SPEED = { lifeupdate: 1.3, composer: 1.1 };
const X264 = [
  '-c:v',
  'libx264',
  '-crf',
  '12',
  '-preset',
  'veryfast',
  '-pix_fmt',
  'yuv420p',
  '-r',
  String(FPS),
];
const ffmpeg = (args) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
const count = (dir) =>
  readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
const capFade = (d) =>
  `format=rgba,fade=t=in:st=0.6:d=0.4:alpha=1,fade=t=out:st=${(d - 1.0).toFixed(2)}:d=0.3:alpha=1`;

function cardSeg(id, dur) {
  const out = path.join(segDir, `${id}.mp4`);
  ffmpeg([
    '-loop',
    '1',
    '-framerate',
    String(FPS),
    '-i',
    path.join(cardsDir, `${id}.png`),
    '-t',
    String(dur),
    ...X264,
    out,
  ]);
  return { out, dur };
}

function frameSeg(id) {
  const dir = path.join(OUT, 'frames', vertical ? 'vertical' : 'desktop', id);
  const speed = SPEED[id] ?? 1;
  const dur = count(dir) / (FPS * speed);
  const out = path.join(segDir, `${id}.mp4`);
  const cap = path.join(cardsDir, `cap_${id}.png`);
  ffmpeg([
    '-framerate',
    String(FPS * speed),
    '-i',
    path.join(dir, '%05d.jpg'),
    '-loop',
    '1',
    '-framerate',
    String(FPS),
    '-i',
    cap,
    '-filter_complex',
    `[0:v]scale=${W}:${CH}:flags=lanczos:in_range=full:out_range=limited,pad=${W}:${H}:0:0:color=0x14110E,drawbox=x=0:y=${CH}:w=${W}:h=1:color=0x352E27:t=fill,fps=${FPS}[v];[1:v]${capFade(dur)}[c];[v][c]overlay=0:0:shortest=1,format=yuv420p`,
    '-t',
    dur.toFixed(3),
    ...X264,
    out,
  ]);
  return { out, dur };
}

function phoneSeg() {
  const parts = ['mBox', 'mRoom'].map((s) =>
    path.join(OUT, 'frames', 'phone', s),
  );
  const dur = parts.reduce((a, d) => a + count(d), 0) / FPS;
  const out = path.join(segDir, 'phone.mp4');
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=0x14110E:s=${W}x${H}:r=${FPS}`,
    '-framerate',
    String(FPS),
    '-i',
    path.join(parts[0], '%05d.jpg'),
    '-framerate',
    String(FPS),
    '-i',
    path.join(parts[1], '%05d.jpg'),
    '-loop',
    '1',
    '-framerate',
    String(FPS),
    '-i',
    path.join(cardsDir, 'phone_overlay.png'),
    '-filter_complex',
    `[1:v][2:v]concat=n=2:v=1[m];[m]scale=450:974:flags=lanczos:in_range=full:out_range=limited,fps=${FPS}[p];[0:v][p]overlay=1060:53:shortest=1[a];[3:v]format=rgba,fade=t=in:st=0.3:d=0.5:alpha=1[o];[a][o]overlay=0:0:shortest=1,format=yuv420p`,
    '-t',
    dur.toFixed(3),
    ...X264,
    out,
  ]);
  return { out, dur };
}

const segs = timeline.map((s) => {
  if (s.type === 'card')
    return cardSeg(s.id.startsWith('principle') ? s.id : s.id, s.dur);
  if (s.type === 'phone') return phoneSeg();
  return frameSeg(s.id);
});

// Cross-fade chain.
const total = segs.reduce((a, s) => a + s.dur, 0) - XFADE * (segs.length - 1);
let chain = '';
let acc = segs[0].dur;
let prev = '[0:v]';
for (let i = 1; i < segs.length; i++) {
  const offset = (acc - XFADE).toFixed(3);
  const label = i === segs.length - 1 ? '[vout]' : `[x${i}]`;
  chain += `${prev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}${label};`;
  prev = label;
  acc += segs[i].dur - XFADE;
}

// Generated ambient pad (no external audio): a soft open-fifth/sixth chord, filtered and faded.
const T = total.toFixed(2);
const pad = (f) => `0.05*sin(2*PI*${f}*t)`;
const exprL = `${pad(110)}+0.035*sin(2*PI*164.81*t)+0.03*sin(2*PI*220*t)+0.02*sin(2*PI*277.18*t)*(0.6+0.4*sin(2*PI*0.1*t))`;
const exprR = `${pad(110.4)}+0.035*sin(2*PI*165.2*t)+0.03*sin(2*PI*219.6*t)+0.02*sin(2*PI*277.6*t)*(0.6+0.4*sin(2*PI*0.13*t))`;

mkdirSync(path.dirname(outFile), { recursive: true });
ffmpeg([
  ...segs.flatMap((s) => ['-i', s.out]),
  '-f',
  'lavfi',
  '-i',
  `aevalsrc=${exprL}|${exprR}:s=44100:d=${T}`,
  '-filter_complex',
  `${chain.slice(0, -1)};[${segs.length}:a]lowpass=f=900,aecho=0.8:0.7:500:0.3,volume=0.6,afade=t=in:d=2,afade=t=out:st=${(total - 3).toFixed(2)}:d=3[aout]`,
  '-map',
  '[vout]',
  '-map',
  '[aout]',
  '-c:v',
  'libx264',
  '-crf',
  '17',
  '-preset',
  'slow',
  '-pix_fmt',
  'yuv420p',
  '-r',
  String(FPS),
  '-c:a',
  'aac',
  '-b:a',
  '160k',
  '-movflags',
  '+faststart',
  '-t',
  T,
  outFile,
]);
console.log(`${outFile}  ${T}s`);
