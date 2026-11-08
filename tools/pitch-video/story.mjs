// The story: what is shown, in what order, with which captions.
// Only things that exist in the app today are claimed here.

export const ORIGIN = 'http://127.0.0.1:3000';
export const FPS = 30;
export const XFADE = 0.5;

export const THEMES = [
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

/** Caption = [eyebrow, text]. Scenes are recorded by scenes.mjs under the same id. */
export const CAPTIONS = {
  home: ['Home', 'Newest first. No ranking, ever.'],
  boxes: ['Boxes', 'Private circles. Only members can see a Box.'],
  thread: [
    'Conversation',
    'Reply in threads. React with an emoji or your camera.',
  ],
  composer: [
    'Share',
    'Write a post, add a photo. It is resized in your browser first.',
  ],
  lifeupdate: [
    'Life Updates',
    'Write it once. Send it to the Boxes you choose, or keep it Only Me.',
  ],
  memories: ['Memories', 'Everything you can still see, month by month.'],
  room: [
    'Rooms',
    'Your own corner. Polaroids, tape, and a Top Friends row you choose.',
  ],
  themes: ['14 Room themes', 'The same Room, in any mood.'],
  friends: ['Friends', 'Add people by username. Block quietly.'],
  appearance: ['Light or dark', 'Follows your device. Same brass either way.'],
  mHome: ['Home', 'Newest first. No ranking, ever.'],
  mBox: ['Boxes', 'Private circles for the people you share with.'],
  mThread: [
    'Conversation',
    'Reply in threads. React with an emoji or your camera.',
  ],
  mRoom: ['Rooms', 'Your own corner, in your own theme.'],
  mMemories: ['Memories', 'Everything you can still see, month by month.'],
  mDark: ['Light or dark', 'Follows your device. Same brass either way.'],
};

export const PRINCIPLES = [
  ['Private', 'by default.'],
  ['Chronological.', 'No ranking.'],
  ['No targeted', 'ads.'],
  ['Your memories', 'stay yours.'],
];

/** Desktop timeline. `type`: card (still), frames (recorded), phone (mobile mock). */
export const DESKTOP = [
  { id: 'title', type: 'card', dur: 3.8 },
  { id: 'home', type: 'frames' },
  { id: 'boxes', type: 'frames' },
  { id: 'thread', type: 'frames' },
  { id: 'composer', type: 'frames' },
  { id: 'lifeupdate', type: 'frames' },
  { id: 'memories', type: 'frames' },
  { id: 'room', type: 'frames' },
  { id: 'themes', type: 'frames' },
  { id: 'friends', type: 'frames' },
  { id: 'appearance', type: 'frames' },
  ...PRINCIPLES.map((_, i) => ({
    id: `principle${i}`,
    type: 'card',
    dur: 1.6,
  })),
  { id: 'phone', type: 'phone' },
  { id: 'end', type: 'card', dur: 4 },
];

export const VERTICAL = [
  { id: 'title', type: 'card', dur: 3.5 },
  { id: 'mHome', type: 'frames' },
  { id: 'mBox', type: 'frames' },
  { id: 'mThread', type: 'frames' },
  { id: 'mRoom', type: 'frames' },
  { id: 'mMemories', type: 'frames' },
  { id: 'mDark', type: 'frames' },
  ...PRINCIPLES.map((_, i) => ({
    id: `principle${i}`,
    type: 'card',
    dur: 1.7,
  })),
  { id: 'end', type: 'card', dur: 3.5 },
];
