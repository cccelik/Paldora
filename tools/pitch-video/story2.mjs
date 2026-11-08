// Pitch cut v2: music-driven. Everything is placed on a bar/beat grid.
export const BPM = 110;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;

/** Music arrangement per cut (see music.mjs). */
export const ARRANGEMENTS = {
  main: {
    bars: 24,
    dropBar: 2,
    hookFromG: 2,
    tail: 1.6,
    hookHits: [0, 1, 2],
    introHats: false,
  },
  short: { bars: 10, dropBar: 1, hookFromG: 0, tail: 1.4, introHats: true },
  vertical: { bars: 13, dropBar: 1, hookFromG: 1, tail: 1.6, introHats: true },
};

export const THEMES_V2 = [
  'obsidian_gold',
  'cream_paper',
  'lavender_dream',
  'ocean_glow',
  'daisy_day',
  'neon_night',
  'y2k_glitter',
  'dark_academia',
  'frutiger_aero',
  'tumblr_2014',
  'retro_windows',
  'cyberpunk',
  'minimal_editorial',
  'polaroid_scrapbook',
];

/**
 * Copy. "*word*" = italic brass accent, "\n" = line break.
 * Everything claimed here is true of the product today.
 */
export const COPY = {
  hook: ['Noisy.', 'Ranked.', 'Public.'],
  hookLine: 'Your people\ngot *lost*\nin the noise.',
  turn: ['So we', 'built a', 'box', 'for your', 'people.'],
  private: [
    'Private\n*by default.*',
    'No targeted ads. Only members see a Box.',
  ],
  algo: ['Newest first.\n*No algorithm.*', 'No ranking. No guessing. Ever.'],
  circles: [
    'A Box for\nevery *circle.*',
    'Close friends, fandoms, the dinner crew.',
  ],
  camera: [
    'Send a face,\n*not a thumbs-up.*',
    'Emoji, or a camera reaction right on the post.',
  ],
  room: [
    "Decorate it like\nit's *2006.*",
    'Your own Room: Polaroids, tape, a Top Friends row.',
  ],
  themes: ['14 themes.\nPick your *mood.*', ''],
  life: [
    'Tell everyone\n*once.*',
    'Each Box you choose gets it, with its own conversation.',
  ],
  memories: [
    'Your year,\n*kept.*',
    'Memories: everything you can still see, month by month.',
  ],
  split: ['Day or night.\n*Your call.*', 'Light or dark, the same warm brass.'],
  phone: [
    'Fits your\n*pocket,* too.',
    'The same Boxes and Rooms, at 390 pixels wide.',
  ],
  cta: 'Your people\nare *waiting.*',
  end: 'A box for your people.',
};

const S = (dir, start, bars = 1, extra = {}) => ({
  dir,
  start,
  bars,
  ...extra,
});

/** Groups per cut. Each group occupies `bars` bars; benefit shots split the bars. */
export const CUTS = {
  main: {
    portrait: false,
    groups: [
      { kind: 'replace', bars: 1 },
      { kind: 'hookLine', bars: 1 },
      { kind: 'turn', bars: 2 },
      {
        kind: 'benefit',
        copy: 'private',
        side: 'R',
        shots: [S('desktop/boxes', 66), S('desktop/boxes', 102)],
      },
      {
        kind: 'benefit',
        copy: 'algo',
        side: 'L',
        shots: [S('desktop/home', 0), S('desktop/home', 80)],
      },
      {
        kind: 'benefit',
        copy: 'circles',
        side: 'R',
        shots: [S('desktop/boxGrid', 0, 2, { speed: 0.75 })],
      },
      {
        kind: 'benefit',
        copy: 'camera',
        side: 'L',
        shots: [S('desktop/react', 20), S('desktop/react', 98)],
      },
      {
        kind: 'benefit',
        copy: 'room',
        side: 'R',
        shots: [S('desktop/room', 20, 2)],
      },
      { kind: 'themes', bars: 2, slots: 16 },
      {
        kind: 'benefit',
        copy: 'life',
        side: 'L',
        shots: [
          S('desktop/lifeupdate', 0, 1, { speed: 1.5, focus: [0.4, 0.45] }),
          S('desktop/lifeupdate', 120, 1, { focus: [0.4, 0.5] }),
        ],
      },
      {
        kind: 'benefit',
        copy: 'memories',
        side: 'R',
        shots: [
          S('desktop/memories', 0, 1, { focus: [0.42, 0.4] }),
          S('desktop/memories', 66, 1, { focus: [0.42, 0.4] }),
        ],
      },
      { kind: 'split', bars: 1, copy: 'split' },
      {
        kind: 'benefit',
        copy: 'phone',
        side: 'R',
        phone: true,
        shots: [S('phone/mBox', 120)],
      },
      { kind: 'cta', bars: 1 },
      { kind: 'wordmark', bars: 1 },
    ],
  },
  short: {
    portrait: false,
    groups: [
      { kind: 'hookLine', bars: 1 },
      { kind: 'turn', bars: 1 },
      {
        kind: 'benefit',
        copy: 'private',
        side: 'R',
        shots: [S('desktop/boxes', 70)],
      },
      {
        kind: 'benefit',
        copy: 'algo',
        side: 'L',
        shots: [S('desktop/home', 85)],
      },
      {
        kind: 'benefit',
        copy: 'camera',
        side: 'R',
        shots: [S('desktop/react', 95)],
      },
      {
        kind: 'benefit',
        copy: 'room',
        side: 'L',
        shots: [S('desktop/room', 40)],
      },
      { kind: 'themes', bars: 1, slots: 8 },
      {
        kind: 'benefit',
        copy: 'life',
        side: 'R',
        shots: [
          S('desktop/lifeupdate', 130, 1, { speed: 1.2, focus: [0.4, 0.5] }),
        ],
      },
      { kind: 'cta', bars: 1 },
      { kind: 'wordmark', bars: 1 },
    ],
  },
  vertical: {
    portrait: true,
    groups: [
      { kind: 'hookLine', bars: 1 },
      { kind: 'turn', bars: 1 },
      { kind: 'benefit', copy: 'private', shots: [S('vertical/mBox', 100)] },
      { kind: 'benefit', copy: 'algo', shots: [S('vertical/mHome', 40)] },
      {
        kind: 'benefit',
        copy: 'circles',
        shots: [S('vertical/mBoxGrid', 0, 1, { speed: 1.3 })],
      },
      { kind: 'benefit', copy: 'camera', shots: [S('vertical/mReact', 98)] },
      { kind: 'benefit', copy: 'room', shots: [S('vertical/mRoom', 30)] },
      { kind: 'themes', bars: 1, slots: 8 },
      { kind: 'benefit', copy: 'life', shots: [S('vertical/mLife', 60)] },
      {
        kind: 'benefit',
        copy: 'memories',
        shots: [S('vertical/mMemories', 40)],
      },
      { kind: 'split', bars: 1, copy: 'split' },
      { kind: 'cta', bars: 1 },
      { kind: 'wordmark', bars: 1 },
    ],
  },
};
