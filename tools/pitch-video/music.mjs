// Original groove, synthesised from scratch (no samples, no external audio).
// node music.mjs <main|short|vertical>  ->  out/audio/music-<cut>.wav (loudness normalised)
// ~110 BPM funk: kick/snare/hats with light swing, slap-style bass, e-piano and clav
// stabs, a two-bar hook, a riser into the drop, a clean outro stinger.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT } from './lib.mjs';
import { ARRANGEMENTS, BPM } from './story2.mjs';

const SR = 44100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const STEP = BEAT / 4; // sixteenth
const SWING = 0.1; // fraction of a step that off-beat sixteenths are late
const TAU = Math.PI * 2;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

let seed = 12345;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
};

const cut = process.argv[2] ?? 'main';
const arr = ARRANGEMENTS[cut];
if (!arr) throw new Error('unknown cut');
const bars = arr.bars;
const tail = arr.tail;
const total = Math.ceil((bars * BAR + tail) * SR);
const L = new Float32Array(total);
const R = new Float32Array(total);
const revSend = new Float32Array(total);

/** Mix a mono signal into the stereo bus at time t (s). */
function put(sig, t, gain = 1, pan = 0, rev = 0) {
  const i0 = Math.max(0, Math.round(t * SR));
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < sig.length && i0 + i < total; i++) {
    L[i0 + i] += sig[i] * gl;
    R[i0 + i] += sig[i] * gr;
    if (rev) revSend[i0 + i] += sig[i] * rev;
  }
}
const mk = (sec) => new Float32Array(Math.round(sec * SR));
const hp = (x, a = 0.9) => {
  const y = new Float32Array(x.length);
  let px = 0;
  let py = 0;
  for (let i = 0; i < x.length; i++) {
    py = a * (py + x[i] - px);
    px = x[i];
    y[i] = py;
  }
  return y;
};

// ---------- instruments ----------
function kick(v = 1) {
  const s = mk(0.32);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (TAU * (44 + 110 * Math.exp(-t * 32))) / SR;
    s[i] =
      (Math.sin(ph) * Math.exp(-t * 8) + rnd() * Math.exp(-t * 400) * 0.35) * v;
  }
  return s;
}
function snare(v = 1) {
  const s = mk(0.3);
  const n = new Float32Array(s.length).map(() => rnd());
  const h = hp(n, 0.82);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] =
      (Math.sin(TAU * 190 * t) * Math.exp(-t * 26) * 0.5 +
        h[i] * Math.exp(-t * 20) * 0.7) *
      v;
  }
  return s;
}
function clap(v = 1) {
  const s = mk(0.3);
  const n = hp(
    new Float32Array(s.length).map(() => rnd()),
    0.7,
  );
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const burst = [0, 0.011, 0.022].reduce(
      (a, d) => a + (t > d ? Math.exp(-(t - d) * 90) : 0),
      0,
    );
    s[i] = n[i] * (burst * 0.35 + Math.exp(-t * 18) * 0.4) * v;
  }
  return s;
}
function hat(open, v = 1) {
  const s = mk(open ? 0.28 : 0.07);
  const n = hp(
    new Float32Array(s.length).map(() => rnd()),
    0.93,
  );
  for (let i = 0; i < s.length; i++)
    s[i] = n[i] * Math.exp((-i / SR) * (open ? 16 : 85)) * v * 0.6;
  return s;
}
function crash(sec, v = 1) {
  const s = mk(sec);
  const n = hp(
    new Float32Array(s.length).map(() => rnd()),
    0.9,
  );
  for (let i = 0; i < s.length; i++)
    s[i] = n[i] * Math.exp((-i / SR) * 2.6) * v * 0.5;
  return s;
}
function boom(sec, v = 1) {
  const s = mk(sec);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] =
      Math.sin(TAU * (38 + 30 * Math.exp(-t * 5)) * t) * Math.exp(-t * 2.2) * v;
  }
  return s;
}
function tom(f, v = 1) {
  const s = mk(0.3);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (TAU * f * (1 + 0.6 * Math.exp(-t * 25))) / SR;
    s[i] =
      (Math.sin(ph) * Math.exp(-t * 11) + rnd() * Math.exp(-t * 120) * 0.25) *
      v;
  }
  return s;
}
/** Slap-style bass: sawtooth through a fast-closing lowpass, a sub sine, a little pop. */
function bass(m, dur, v = 1) {
  const f = mtof(m);
  const len = dur + 0.04;
  const s = mk(len);
  let lp = 0;
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph = (ph + f / SR) % 1;
    const saw = ph * 2 - 1;
    const cutoff = 220 + 2600 * Math.exp(-t * 28);
    const a = 1 - Math.exp((-TAU * cutoff) / SR);
    lp += a * (saw - lp);
    const env =
      Math.min(1, t / 0.004) *
      (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.04));
    s[i] =
      (lp * 0.75 +
        Math.sin(TAU * f * t) * 0.6 +
        rnd() * Math.exp(-t * 300) * 0.15) *
      env *
      v;
  }
  return s;
}
/** Electric-piano: two-operator FM with a short bright tine. */
function epiano(m, dur, v = 1) {
  const f = mtof(m);
  const len = dur + 0.5;
  const s = mk(len);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const idx = 1.6 * Math.exp(-t * 7) + 0.25;
    const body = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t));
    const tine = Math.sin(TAU * f * 7 * t) * Math.exp(-t * 30) * 0.12;
    const env =
      Math.min(1, t / 0.004) *
      Math.exp(-t * 3.2) *
      (t < dur ? 1 : Math.exp(-(t - dur) * 14));
    s[i] = (body + tine) * env * v * 0.5;
  }
  return s;
}
function clav(m, v = 1) {
  const f = mtof(m);
  const s = mk(0.12);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph = (ph + f / SR) % 1;
    const pulse = ph < 0.22 ? 1 : -1;
    lp +=
      (1 - Math.exp((-TAU * (1800 + 3000 * Math.exp(-t * 40))) / SR)) *
      (pulse - lp);
    s[i] = lp * Math.exp(-t * 38) * v * 0.5;
  }
  return hp(s, 0.96);
}
/** Hook voice: soft pluck (triangle + octave sine), with a gentle bell edge. */
function pluck(m, dur, v = 1) {
  const f = mtof(m);
  const s = mk(dur + 0.35);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const ph = (f * t) % 1;
    const tri = 4 * Math.abs(ph - 0.5) - 1;
    const env =
      Math.min(1, t / 0.005) *
      Math.exp(-t * 4.2) *
      (t < dur ? 1 : Math.exp(-(t - dur) * 18));
    s[i] =
      (tri * 0.55 +
        Math.sin(TAU * f * 2 * t) * 0.25 +
        Math.sin(TAU * f * 4.01 * t) * Math.exp(-t * 14) * 0.15) *
      env *
      v *
      0.55;
  }
  return s;
}
function riser(sec, v = 1) {
  const s = mk(sec);
  let lp = 0;
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const u = i / s.length;
    const t = i / SR;
    const a = 0.02 + 0.9 * u ** 2;
    lp = a * lp + (1 - a) * rnd(); // brightening noise
    const n = (rnd() - lp * 0.6) * (0.08 + 0.5 * u ** 2.2);
    ph += (TAU * 180 * 2 ** (u * 4.2)) / SR;
    s[i] = (n + Math.sin(ph) * 0.18 * u ** 1.5) * v * Math.min(1, t / 0.1);
  }
  return s;
}

// ---------- arrangement ----------
const at = (bar, step) =>
  bar * BAR + step * STEP + (step % 2 ? SWING * STEP : 0);
const D = arr.dropBar;
const CHORDS = [
  { root: 33, keys: [57, 60, 64, 67], third: 3 }, // Am7
  { root: 33, keys: [57, 60, 64, 67], third: 3 },
  { root: 38, keys: [54, 57, 60, 64], third: 4 }, // D9
  { root: 38, keys: [54, 57, 60, 64], third: 4 },
];
const E7 = { root: 40, keys: [56, 59, 62, 64] };
const BASS_PATTERN = [
  [0, 0, 2, 1],
  [3, 0, 1, 0.7],
  [4, 12, 1, 0.8],
  [6, 10, 1, 0.7],
  [7, 7, 1, 0.8],
  [8, 0, 2, 1],
  [11, 0, 1, 0.7],
  [12, 3, 1, 0.8],
  [14, 5, 1, 0.7],
  [15, 7, 1, 0.8],
];
const HOOK = {
  A1: [
    [0, 76, 2],
    [3, 76, 1],
    [4, 79, 2],
    [6, 81, 4],
    [10, 79, 2],
    [12, 76, 3],
  ],
  A2: [
    [0, 74, 2],
    [3, 76, 1],
    [4, 74, 2],
    [6, 72, 2],
    [8, 69, 6],
  ],
  B1: [
    [0, 74, 2],
    [3, 74, 1],
    [4, 78, 2],
    [6, 81, 4],
    [10, 78, 2],
    [12, 74, 3],
  ],
  B2: [
    [0, 72, 2],
    [3, 74, 1],
    [4, 76, 2],
    [6, 74, 2],
    [8, 71, 4],
    [12, 76, 2],
  ],
};

// intro: riser + heartbeat kick + ticking hats
const introSec = D * BAR - STEP * 1.5;
put(riser(introSec, 0.9), 0, 1, 0, 0.1);
for (let b = 0; b < D; b++) {
  for (let q = 0; q < 4; q++) {
    put(kick(0.35 + 0.1 * b), at(b, q * 4), 0.8);
    if (b === D - 1 || arr.introHats)
      for (let s = 0; s < 16; s += 2)
        put(
          hat(false, 0.3 + (s % 4 === 0 ? 0.15 : 0) + b * 0.05),
          at(b, s),
          0.7,
          0.2,
        );
  }
}
for (const q of arr.hookHits ?? [])
  put(
    pluck([69, 72, 76][q] ?? 69, BEAT * 1.4, 0.9),
    at(0, q * 4),
    0.4,
    -0.1 + q * 0.1,
    0.5,
  ); // soft chime cues on the cold-open phrases
// snare roll into the drop
for (let s = 0; s < 8; s++)
  put(snare(0.25 + s * 0.09), at(D - 1, 8 + s), 0.8, 0, 0.05);
// drop impact
put(boom(1.8, 1), D * BAR, 0.9);
put(crash(2, 1), D * BAR, 0.7, 0, 0.2);

for (let g = 0; g < bars - D; g++) {
  const bar = D + g;
  const last = bar === bars - 1;
  const chord = CHORDS[g % 4];
  const resolve = g % 4 === 3;
  if (last) break; // final bar is the stinger
  // drums
  for (const s of [0, 6, 10]) put(kick(1), at(bar, s), 0.95);
  if (g % 2 === 1) put(kick(0.9), at(bar, 13), 0.9);
  for (const s of [4, 12]) {
    put(snare(1), at(bar, s), 0.8, 0, 0.08);
    put(clap(0.8), at(bar, s), 0.5, 0.1, 0.12);
  }
  for (const s of [7, 15]) put(snare(0.22), at(bar, s), 0.7);
  for (let s = 0; s < 16; s++) {
    const open = s === 14 && g % 2 === 0;
    const vel = s % 4 === 0 ? 0.75 : s % 2 === 0 ? 0.55 : 0.3;
    put(hat(open, vel), at(bar, s), 0.65, 0.25);
  }
  // bass (last beat of every fourth bar pushes to E)
  for (const [s, semi, len, vel] of BASS_PATTERN) {
    const toE = resolve && s >= 12;
    const root = toE ? E7.root : chord.root;
    const interval = semi === 3 ? chord.third : semi;
    put(
      bass(
        root + (toE ? ([0, 0, 0, 7][s - 12] ?? 0) : interval),
        len * STEP * 0.85,
        vel,
      ),
      at(bar, s),
      0.85,
    );
  }
  // e-piano stabs
  const voicing = resolve ? chord.keys : chord.keys;
  const stabs = [
    [0, 3],
    [3, 2],
    [6, 3],
    [10, 2],
    [11, 3],
  ];
  for (const [s, len] of stabs) {
    const useE = resolve && s >= 11;
    const keys = useE ? E7.keys : voicing;
    keys.forEach((m, k) =>
      put(
        epiano(m, len * STEP * 0.9, s === 0 ? 0.9 : 0.7),
        at(bar, s) + k * 0.004,
        0.45,
        -0.3 + k * 0.2,
        0.25,
      ),
    );
  }
  // clav chops
  const hi = chord.keys.slice(2).map((m) => m + 12);
  for (const [i, s] of [2, 5, 9, 13, 15].entries())
    put(clav(hi[i % 2], 0.7), at(bar, s), 0.4, 0.45, 0.1);
  // hook
  if (g >= arr.hookFromG) {
    const key = `${g % 4 < 2 ? 'A' : 'B'}${(g % 2) + 1}`;
    for (const [s, m, len] of HOOK[key]) {
      const p = pluck(m, len * STEP * 0.9, 0.9);
      put(p, at(bar, s), 0.55, -0.1, 0.3);
      put(p, at(bar, s) + STEP * 3, 0.2, 0.5, 0.3); // dotted-eighth echo
      put(p, at(bar, s) + STEP * 6, 0.08, -0.5, 0.3);
    }
  }
  if (g === 0) put(crash(1.2, 0.6), bar * BAR, 0.4);
}

// stinger: one big Amaj9 hit that rings, a kick, a high sparkle
const FB = (bars - 1) * BAR;
put(kick(1), FB, 1);
put(boom(2.2, 0.9), FB, 0.8);
put(crash(2.6, 0.8), FB, 0.6, 0, 0.3);
put(bass(33, 1.4, 1), FB, 0.9);
[57, 61, 64, 68, 71].forEach((m, k) =>
  put(epiano(m, 2.2, 0.9), FB + k * 0.006, 0.4, -0.4 + k * 0.2, 0.5),
);
put(pluck(93, 1.2, 0.8), FB + BEAT * 2, 0.4, 0.2, 0.5); // A6 bell
put(pluck(97, 1.6, 0.8), FB + BEAT * 2.5, 0.35, -0.2, 0.5); // C#7

// ---------- reverb (comb bank on the send bus) ----------
function reverb(src, delays, fb) {
  const out = new Float32Array(total);
  for (const d of delays) {
    const n = Math.round(d * SR);
    const buf = new Float32Array(n);
    let lp = 0;
    let idx = 0;
    for (let i = 0; i < total; i++) {
      const y = buf[idx];
      lp += 0.35 * (y - lp);
      buf[idx] = src[i] + lp * fb;
      out[i] += y * 0.25;
      idx = (idx + 1) % n;
    }
  }
  return out;
}
const rl = reverb(revSend, [0.0297, 0.0371, 0.0411, 0.0437], 0.78);
const rr = reverb(revSend, [0.0311, 0.0383, 0.0427, 0.0451], 0.78);
for (let i = 0; i < total; i++) {
  L[i] += rl[i] * 0.55;
  R[i] += rr[i] * 0.55;
}

// ---------- master: soft saturation, fades, 16-bit WAV ----------
const fadeOut = 1.4 * SR;
const fadeIn = 0.02 * SR;
const pcm = Buffer.alloc(total * 4);
for (let i = 0; i < total; i++) {
  const fo = i > total - fadeOut ? Math.max(0, (total - i) / fadeOut) : 1;
  const fi = Math.min(1, i / fadeIn);
  const l = Math.tanh(L[i] * 0.9) * fo * fi;
  const r = Math.tanh(R[i] * 0.9) * fo * fi;
  pcm.writeInt16LE(
    Math.max(-32768, Math.min(32767, Math.round(l * 30000))),
    i * 4,
  );
  pcm.writeInt16LE(
    Math.max(-32768, Math.min(32767, Math.round(r * 30000))),
    i * 4 + 2,
  );
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
const dir = path.join(OUT, 'audio');
mkdirSync(dir, { recursive: true });
const raw = path.join(dir, `raw-${cut}.wav`);
writeFileSync(raw, Buffer.concat([header, pcm]));

// two-pass loudnorm to about -14 LUFS with a true-peak ceiling
const target = 'loudnorm=I=-14:TP=-1.5:LRA=11';
const probe = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-nostats',
    '-i',
    raw,
    '-af',
    `${target}:print_format=json`,
    '-f',
    'null',
    '-',
  ],
  { encoding: 'utf8' },
);
const m = JSON.parse(
  probe.stderr.slice(
    probe.stderr.lastIndexOf('{'),
    probe.stderr.lastIndexOf('}') + 1,
  ),
);
const final = path.join(dir, `music-${cut}.wav`);
execFileSync('ffmpeg', [
  '-y',
  '-v',
  'error',
  '-i',
  raw,
  '-af',
  `${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},alimiter=limit=0.89:level=false`,
  '-ar',
  String(SR),
  '-ac',
  '2',
  final,
]);
console.log(
  `${final}  ${(total / SR).toFixed(2)}s  (${BPM} BPM, ${bars} bars)`,
);
