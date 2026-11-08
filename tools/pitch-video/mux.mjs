// Encodes rendered frames + music into the final MP4: node mux.mjs <main|short|vertical>
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { OUT, ROOT } from './lib.mjs';
import { ARRANGEMENTS, BAR } from './story2.mjs';

const cut = process.argv[2] ?? 'main';
const total = ARRANGEMENTS[cut].bars * BAR + ARRANGEMENTS[cut].tail;
const outFile = path.join(
  ROOT,
  {
    main: 'Paldora-launch.mp4',
    short: 'Paldora-launch-short.mp4',
    vertical: 'Paldora-launch-mobile.mp4',
  }[cut],
);
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-v',
    'error',
    '-framerate',
    '30',
    '-i',
    path.join(OUT, 'v2', cut, '%05d.jpg'),
    '-i',
    path.join(OUT, 'audio', `music-${cut}.wav`),
    '-vf',
    'scale=in_range=full:out_range=limited,format=yuv420p',
    '-c:v',
    'libx264',
    '-crf',
    '15',
    '-preset',
    'slow',
    '-color_range',
    'tv',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-t',
    total.toFixed(3),
    outFile,
  ],
  { stdio: 'inherit' },
);
console.log(`${outFile} ${total.toFixed(2)}s`);
