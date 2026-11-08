// Local-only demo seeder: fictional users, friendships, Boxes, posts with
// procedurally generated photos, comments, replies, reactions, Life Updates and
// one customized Room. Everything goes through the real trusted code paths
// (callables on the Functions emulator with Auth-emulator ID tokens, and the
// same media HTTP flow the clients use). Re-runnable; `--reset-demo` removes it.
import { createHash, randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import {
  NativeAccountLifecycle,
  NativeAccounts,
  NativeBoxDeletion,
  NativeProfiles,
} from '../dist/index.js';

// ---------------------------------------------------------------- safety ----
const isLocal = (value) =>
  typeof value === 'string' && /^(127\.0\.0\.1|localhost):\d+$/.test(value);
const hosts = {
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  firestore: process.env.FIRESTORE_EMULATOR_HOST,
  storage: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  functions: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST,
};
if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  !Object.values(hosts).every(isLocal)
)
  throw new Error(
    'Demo seeding refuses to run: GCLOUD_PROJECT must be demo-paldora and the Auth, Firestore, Storage and Functions emulator hosts must be 127.0.0.1 or localhost.',
  );
const PROJECT = 'demo-paldora';
const REGION = 'europe-west4';
const BUCKET = 'demo-paldora.firebasestorage.app';
const FIXTURE_EMAIL = 'me@example.test';
const DEMO_PASSWORD = 'Demo-Paldora-Pass1!';
const reset = process.argv.includes('--reset-demo');

// ----------------------------------------------------------------- stats ----
const stats = {
  users: 0,
  friendships: 0,
  boxes: 0,
  posts: 0,
  photos: 0,
  comments: 0,
  replies: 0,
  postReactions: 0,
  commentReactions: 0,
  lifeUpdates: 0,
};
const failures = [];

// ------------------------------------------------------------ plumbing ----
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Idempotency keys are stable within one seeded run (so a resumed run never
// duplicates) but differ after --reset-demo, because the trusted layer keeps a
// key for 24 hours and would otherwise hand back ids of deleted content.
let runId = 'unset';
const uuidFor = (label) => {
  const hex = createHash('sha1')
    .update(`paldora-demo:${runId}:${label}`)
    .digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

async function signIn(email, password) {
  const response = await fetch(
    `http://${hosts.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(`Sign-in failed for ${email}.`);
  return body.idToken;
}

async function callable(token, name, data = {}) {
  const response = await fetch(
    `http://${hosts.functions}/${PROJECT}/${REGION}/${name}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ data }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const error = new Error(
      `${name}: ${body.error?.status ?? response.status} ${body.error?.message ?? ''}`,
    );
    error.status = body.error?.status;
    throw error;
  }
  return body.result;
}

/** Run one step; record a failure and continue instead of aborting the run. */
async function step(label, action, fallback = null) {
  try {
    return await action();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    return fallback;
  }
}

// -------------------------------------------------------------- images ----
const PALETTES = [
  ['#f6d365', '#fda085', '#7a3b1d'],
  ['#a1c4fd', '#c2e9fb', '#1d3b6e'],
  ['#d4fc79', '#96e6a1', '#1f5130'],
  ['#fbc2eb', '#a6c1ee', '#4a2a6b'],
  ['#ff9a9e', '#fad0c4', '#6b1d2a'],
  ['#84fab0', '#8fd3f4', '#134a52'],
  ['#2c3e50', '#bd3e3e', '#ffe9c2'],
  ['#232526', '#c9a24b', '#f7ecd0'],
];

function sceneSvg(width, height, label, seed) {
  const [a, b, ink] = PALETTES[seed % PALETTES.length];
  const shapes = [];
  for (let i = 0; i < 9; i += 1) {
    const x = ((seed * 131 + i * 197) % 100) / 100;
    const y = ((seed * 71 + i * 113) % 100) / 100;
    const r = (0.06 + ((seed + i * 7) % 12) / 100) * Math.min(width, height);
    const kind = (seed + i) % 3;
    const cx = Math.round(x * width);
    const cy = Math.round(y * height);
    const fill = `fill="${ink}" fill-opacity="${0.08 + (i % 4) * 0.05}"`;
    if (kind === 0)
      shapes.push(
        `<circle cx="${cx}" cy="${cy}" r="${Math.round(r)}" ${fill}/>`,
      );
    else if (kind === 1)
      shapes.push(
        `<rect x="${cx}" y="${cy}" width="${Math.round(r * 2)}" height="${Math.round(r * 1.2)}" rx="12" ${fill} transform="rotate(${((seed + i * 23) % 60) - 30} ${cx} ${cy})"/>`,
      );
    else
      shapes.push(
        `<polygon points="${cx},${cy - Math.round(r)} ${cx + Math.round(r)},${cy + Math.round(r)} ${cx - Math.round(r)},${cy + Math.round(r)}" ${fill}/>`,
      );
  }
  const size = Math.round(Math.min(width, height) / 11);
  const safe = label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>${shapes.join('')}
<rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.78)}" width="${Math.round(width * 0.88)}" height="${Math.round(height * 0.15)}" rx="16" fill="#ffffff" fill-opacity="0.72"/>
<text x="50%" y="${Math.round(height * 0.78 + height * 0.1)}" font-family="sans-serif" font-size="${size}" font-weight="700" fill="${ink}" text-anchor="middle">${safe}</text>
</svg>`;
}

const SHAPES = {
  landscape: [1600, 1000],
  portrait: [1000, 1400],
  square: [1200, 1200],
  wide: [1800, 900],
};
async function makeImage(shape, label, seed) {
  const [width, height] = SHAPES[shape];
  return sharp(Buffer.from(sceneSvg(width, height, label, seed)))
    .jpeg({ quality: 82 })
    .toBuffer();
}
async function makeAvatar(initials, seed) {
  const svg = sceneSvg(512, 512, initials, seed).replace(
    /<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" rx="16"[^>]*\/>/,
    '',
  );
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Reserve, PUT the bytes, complete. Returns the asset id (not yet ready). */
async function upload(token, purpose, boxId, contentType, bytes) {
  const reserved = await callable(token, 'createMediaUpload', {
    purpose,
    ...(boxId ? { boxId } : {}),
    contentType,
    contentLength: bytes.length,
  });
  const put = await fetch(
    `http://${hosts.functions}/${PROJECT}/${REGION}/mediaUpload${reserved.upload.path}`,
    {
      method: 'PUT',
      headers: {
        'content-type': contentType,
        authorization: `Bearer ${token}`,
      },
      body: bytes,
    },
  );
  if (put.status !== 204) throw new Error(`mediaUpload PUT ${put.status}`);
  const id = reserved.mediaAsset.id;
  await callable(token, 'completeMediaUpload', { assetId: id });
  return id;
}
async function waitReady(token, id, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const asset = await callable(token, 'getMediaAsset', { assetId: id });
    if (asset.status === 'ready') return asset;
    if (asset.status === 'failed' || asset.status === 'rejected')
      throw new Error(`media ${id} ended as ${asset.status}`);
    if (Date.now() > deadline)
      throw new Error(`media ${id} not ready (still ${asset.status})`);
    await sleep(1000);
  }
}

// ------------------------------------------------------------- the cast ----
const PEOPLE = [
  [
    'mara',
    'Mara Okonkwo-Reyes',
    'Ceramics, night buses and unfinished sketchbooks.',
  ],
  ['juno', 'Juno Halvorsen', 'Sound engineer. Tea first, opinions second.'],
  ['teo', 'Teo Marchetti', 'Cooks for too many people. Rides a yellow bike.'],
  ['priya', 'Priya Nandakumar', 'Reads three books at once and finishes two.'],
  [
    'sol',
    'Sol Ekstrom',
    'Fandom archivist. Fan-fiction editor in my other life.',
  ],
  ['wren', 'Wren Castellanos', 'Plants, postcards, long walks.'],
  ['bram', 'Bram de Vries', 'Amateur astronomer, professional napper.'],
];
const un = (key) => `demo_${key}`;
const emailOf = (key) => `demo.${key}@example.test`;

// Friendship graph. Everyone is friends with "me"; the rest is deliberately
// partial: cluster A (mara, juno, teo), cluster B (priya, sol), cross links
// teo-priya and sol-mara, wren knows only "me", and bram has a pending
// request to sol that was never answered.
const FRIEND_PAIRS = [
  ['mara', 'juno'],
  ['mara', 'teo'],
  ['juno', 'teo'],
  ['priya', 'sol'],
  ['teo', 'priya'],
  ['sol', 'mara'],
];
const PENDING_PAIRS = [['bram', 'sol']];

// Boxes. "me" is the fixture account. Roles: first member is the owner.
const BOXES = [
  {
    key: 'close',
    name: 'Close Friends',
    owner: 'mara',
    admins: ['juno'],
    members: ['teo', 'me'],
  },
  {
    key: 'books',
    name: 'Page Turners Book Club',
    owner: 'priya',
    admins: ['me'],
    members: ['sol', 'teo', 'wren'],
  },
  {
    key: 'fandom',
    name: 'Starfall Fandom Circle',
    owner: 'sol',
    admins: ['priya'],
    members: ['bram', 'wren', 'me'],
  },
  {
    key: 'family',
    name: 'Sunday Dinner Crew',
    owner: 'me',
    admins: ['juno'],
    members: ['bram', 'teo'],
  },
  {
    key: 'duet',
    name: 'Wren and Me',
    owner: 'me',
    admins: [],
    members: ['wren'],
  },
  {
    key: 'studio',
    name: 'Studio Night Crew',
    owner: 'juno',
    admins: ['mara'],
    members: ['teo', 'priya', 'sol'],
  },
  {
    key: 'flat',
    name: 'Old Flat 12B (archived)',
    owner: 'teo',
    admins: [],
    members: ['me', 'mara', 'juno'],
    archive: true,
  },
];

// Posts: img = [shape, label]. Comments: [by, text, [replies [by, text]], [reactions [by, emoji]]].
const POSTS = [
  {
    box: 'close',
    by: 'mara',
    text: 'Finally glazed the blue bowls. Kiln opens tomorrow and I am not calm about it.',
    img: [
      ['landscape', 'Blue bowls, unfired'],
      ['square', 'Glaze tests'],
    ],
    react: [
      ['juno', '😍'],
      ['teo', '🔥'],
      ['me', '❤️'],
    ],
    comments: [
      [
        'juno',
        'Blue on blue on blue. I want the biggest one.',
        [
          ['mara', 'You can have the lopsided one, it has character.'],
          ['juno', 'Lopsided is my love language.'],
          ['teo', 'Pre-ordering a mug.'],
        ],
        [
          ['mara', '😂'],
          ['me', '👍'],
        ],
      ],
      [
        'teo',
        'Do the kiln gods accept snacks? Asking for a friend.',
        [['mara', 'They accept focaccia.']],
        [],
      ],
      [
        'me',
        'Save me one with a chip. I always chip them.',
        [],
        [['mara', '😂']],
      ],
    ],
  },
  {
    box: 'close',
    by: 'teo',
    text: 'Sunday ragu, nine hours, zero regrets. Bring bread.',
    img: [['portrait', 'Ragu day']],
    react: [
      ['mara', '🤤'],
      ['juno', '🔥'],
    ],
    comments: [
      [
        'mara',
        'Is nine hours a real number or an emotional number?',
        [['teo', 'Eight and a half, plus emotion.']],
        [['teo', '😂']],
      ],
      ['me', 'Coming at six with bread and bad jokes.', [], []],
    ],
  },
  {
    box: 'close',
    by: 'juno',
    text: 'New rule: no phones at the next dinner. Put them in the bowl by the door.',
    img: [],
    react: [
      ['teo', '👍'],
      ['me', '👍'],
      ['mara', '😬'],
    ],
    comments: [
      [
        'mara',
        'Who is going to cave first? I say Teo.',
        [
          ['teo', 'Slander.'],
          ['juno', 'He has already hidden a second phone.'],
          ['teo', 'It is a camera.'],
        ],
        [['me', '😂']],
      ],
    ],
  },
  {
    box: 'close',
    by: 'me',
    text: 'Found the photo from the lake trip. Everyone looks so happy and slightly sunburnt.',
    img: [['wide', 'Lake day']],
    react: [
      ['mara', '🥹'],
      ['juno', '❤️'],
      ['teo', '❤️'],
    ],
    comments: [
      ['teo', 'The sunburn was worth it.', [], []],
      [
        'mara',
        'Printing this one for the fridge.',
        [['me', 'Send me a copy for mine.']],
        [['juno', '❤️']],
      ],
    ],
  },
  {
    box: 'books',
    by: 'priya',
    text: 'Month pick: a slow, strange novel about a lighthouse keeper who collects other people’s letters. Discussion on the 28th.',
    img: [['portrait', 'Book club pick']],
    react: [
      ['sol', '📚'],
      ['me', '👍'],
      ['wren', '😍'],
    ],
    comments: [
      [
        'sol',
        'I will read the first chapter tonight and report back with feelings.',
        [
          ['priya', 'Feelings are required.'],
          ['sol', 'Spoiler-free feelings.'],
        ],
        [],
      ],
      [
        'wren',
        'Is it very sad? I need to know my tissue budget.',
        [
          ['priya', 'Medium sad, high cozy.'],
          ['teo', 'Tissue budget approved.'],
        ],
        [['priya', '👍']],
      ],
    ],
  },
  {
    box: 'books',
    by: 'me',
    text: 'Halfway through and I keep rereading one paragraph on page 94 because it is just that good.',
    img: [],
    react: [
      ['priya', '🥹'],
      ['teo', '👏'],
    ],
    comments: [
      [
        'priya',
        'Page 94! The one about the tide table?',
        [['me', 'That one. Obsessed.']],
        [['me', '❤️']],
      ],
    ],
  },
  {
    box: 'books',
    by: 'wren',
    text: 'Brought the book to the park and a duck stole my bookmark. Please enjoy the crime scene.',
    img: [
      ['landscape', 'Park crime scene'],
      ['square', 'Duck suspect'],
      ['portrait', 'The bookmark (RIP)'],
    ],
    react: [
      ['sol', '😂'],
      ['priya', '😂'],
      ['me', '🦆'],
    ],
    comments: [
      [
        'sol',
        'Duck is clearly guilty. Look at that face.',
        [],
        [['wren', '😂']],
      ],
      [
        'teo',
        'I will lend you a bookmark. Shaped like a duck, for irony.',
        [['wren', 'Yes please.']],
        [],
      ],
    ],
  },
  {
    box: 'fandom',
    by: 'sol',
    text: 'Theory thread: if the lantern in episode 6 is the same one from the prologue, the whole finale changes. Fight me.',
    img: [['wide', 'Lantern theory board']],
    react: [
      ['wren', '🤯'],
      ['bram', '🔥'],
      ['priya', '🤔'],
      ['me', '👀'],
    ],
    comments: [
      [
        'bram',
        'The shadow on the left is the tell. Zoom in.',
        [
          ['sol', 'You are right, the reflection is reversed!'],
          ['bram', 'Told you.'],
          ['wren', 'This is why I joined.'],
        ],
        [['sol', '🤯']],
      ],
      [
        'priya',
        'Counter-theory: continuity error and we are all overthinking.',
        [
          ['sol', 'Take that back.'],
          ['priya', 'Never.'],
        ],
        [['bram', '😂']],
      ],
      ['me', 'Putting a small bet on the lantern theory.', [], []],
    ],
  },
  {
    box: 'fandom',
    by: 'wren',
    text: 'Made fan art for the season finale. It is not good but it is mine.',
    img: [['portrait', 'Finale fan art']],
    react: [
      ['sol', '😭'],
      ['bram', '❤️'],
      ['priya', '👏'],
      ['me', '❤️'],
    ],
    comments: [
      [
        'sol',
        'This is so good I am saving it to the archive.',
        [['wren', 'You are too kind.']],
        [['wren', '🥹']],
      ],
    ],
  },
  {
    box: 'fandom',
    by: 'bram',
    text: 'Clear skies tonight, so I am going to watch the real stars while we wait for the next episode.',
    img: [['landscape', 'Night sky attempt']],
    react: [
      ['sol', '✨'],
      ['wren', '🌌'],
    ],
    comments: [
      ['me', 'Send photos if the clouds behave.', [['bram', 'Will do.']], []],
    ],
  },
  {
    box: 'family',
    by: 'me',
    text: 'Dinner at mine this Sunday. Soup, bread, and whoever shows up.',
    img: [],
    react: [
      ['bram', '🙌'],
      ['teo', '🍲'],
      ['juno', '❤️'],
    ],
    comments: [
      [
        'juno',
        'I am bringing dessert and zero apologies.',
        [['me', 'Perfect.']],
        [],
      ],
      [
        'bram',
        'Can I bring the telescope? Dessert and stars.',
        [
          ['me', 'Yes, the roof is free.'],
          ['bram', 'Brilliant.'],
        ],
        [['me', '🔭']],
      ],
    ],
  },
  {
    box: 'family',
    by: 'teo',
    text: 'Recipe card from my grandmother, transcribed for the group. The secret is more butter, obviously.',
    img: [['square', 'Grandma’s recipe card']],
    react: [
      ['me', '🥹'],
      ['juno', '❤️'],
      ['bram', '🤤'],
    ],
    comments: [
      ['juno', 'More butter is always the answer.', [], [['teo', '😂']]],
    ],
  },
  {
    box: 'duet',
    by: 'wren',
    text: 'Mailed you a postcard. It will arrive in four to nine business weeks, so brace yourself.',
    img: [['wide', 'Postcard front']],
    react: [['me', '😍']],
    comments: [
      [
        'me',
        'I will frame it on arrival, whichever decade that is.',
        [['wren', 'Perfect.']],
        [],
      ],
    ],
  },
  {
    box: 'duet',
    by: 'me',
    text: 'Plant swap on Saturday? I have too many cuttings and nowhere to put them.',
    img: [],
    react: [['wren', '🌱']],
    comments: [['wren', 'Yes! Bringing the spider plant babies.', [], []]],
  },
  {
    box: 'studio',
    by: 'juno',
    text: 'Tracking the second session tomorrow. Studio is booked 7 to midnight, snacks encouraged.',
    img: [['landscape', 'Studio board']],
    react: [
      ['mara', '🎶'],
      ['teo', '🔥'],
      ['priya', '👏'],
    ],
    comments: [
      [
        'mara',
        'I will bring the good headphones and the bad jokes.',
        [['juno', 'Bring the good jokes too.']],
        [],
      ],
      [
        'priya',
        'Can I sit in the back and be quiet?',
        [
          ['juno', 'Back row is yours.'],
          ['sol', 'I will save you a seat.'],
        ],
        [['juno', '❤️']],
      ],
    ],
  },
  {
    box: 'studio',
    by: 'sol',
    text: 'Group chat is closed to outsiders, so: rough mix is a mess and I am proud of it.',
    img: [],
    react: [
      ['juno', '😂'],
      ['teo', '🙌'],
    ],
    comments: [['teo', 'The mess has soul.', [], []]],
  },
  {
    box: 'flat',
    by: 'teo',
    text: 'Remember when the heating broke in January and we all lived in one room under blankets?',
    img: [['square', 'The blanket fort']],
    react: [
      ['me', '🥶'],
      ['mara', '😂'],
      ['juno', '🧣'],
    ],
    comments: [
      [
        'mara',
        'Best winter of my life, honestly.',
        [
          ['teo', 'Same.'],
          ['me', 'We should do it again but with working heat.'],
        ],
        [['teo', '❤️']],
      ],
      ['juno', 'Still have the lamp. Still works. Still ugly.', [], []],
    ],
  },
  {
    box: 'flat',
    by: 'me',
    text: 'Boxing up the last of the old flat photos. Archiving this Box for now, but the memories stay.',
    img: [],
    react: [
      ['teo', '🥹'],
      ['mara', '❤️'],
    ],
    comments: [
      ['teo', 'Thank you for keeping this one alive.', [['me', 'Always.']], []],
    ],
  },
];

const LIFE_UPDATES = [
  {
    key: 'mara-multi',
    by: 'mara',
    boxes: ['close', 'studio'],
    sections: {
      lifeLately:
        'Moved into a studio with a window that faces east, so mornings are suddenly good.',
      currentlyInto: 'Glaze chemistry and very small bowls.',
      excitedAbout: 'First kiln opening next week.',
    },
    img: ['landscape', 'New studio window'],
  },
  {
    key: 'priya-books',
    by: 'priya',
    boxes: ['books'],
    sections: {
      reading:
        'The lighthouse novel, plus a field guide to mosses I cannot stop reading.',
      whatsNext: 'A cabin weekend with no wifi.',
    },
    img: null,
  },
  {
    key: 'me-only',
    by: 'me',
    boxes: null,
    sections: {
      travel:
        'Planning a slow trip along the coast in spring: trains, small towns, no itinerary.',
      whatsNext: 'Book the first train and one rainy-day cafe.',
    },
    img: ['portrait', 'Coast notes'],
  },
];

// ----------------------------------------------------------------- main ----
const app = initializeApp({ projectId: PROJECT }, `seed-demo-${randomUUID()}`);
try {
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const stateRef = db.collection('nativeDemoSeed').doc('v1');

  const me = await auth.getUserByEmail(FIXTURE_EMAIL).catch(() => null);
  if (!me)
    throw new Error(
      `${FIXTURE_EMAIL} not found. Create it first with the fixture seed (pnpm firebase:local:seed).`,
    );

  const uids = { me: me.uid };
  for (const [key] of PEOPLE) {
    const user = await auth.getUserByEmail(emailOf(key)).catch(() => null);
    if (user) uids[key] = user.uid;
  }
  const tokens = {};
  const tokenOf = async (key) => {
    tokens[key] ??= await signIn(
      key === 'me' ? FIXTURE_EMAIL : emailOf(key),
      key === 'me' ? 'a-local-test-password' : DEMO_PASSWORD,
    );
    return tokens[key];
  };
  const state = (await stateRef.get()).data() ?? {};
  runId = state.runId ?? randomUUID();

  if (reset) {
    await runReset({ db, auth, storage, uids, state, tokenOf });
  } else if (state.status === 'complete') {
    process.stdout.write(
      'Demo content already seeded (marker nativeDemoSeed/v1). Use --reset-demo to remove it first. Nothing changed.\n',
    );
  } else {
    await seed({ db, auth, uids, tokenOf, stateRef, state });
  }
} finally {
  await deleteApp(app);
}

// ------------------------------------------------------------------ seed ----
async function seed({ db, auth, uids, tokenOf, stateRef, state }) {
  // Users: Auth account, admitted claim, trusted provisioning, onboarded profile.
  const accounts = new NativeAccounts(db, auth);
  const profiles = new NativeProfiles(db, auth);
  for (const [key, displayName, bio] of PEOPLE) {
    if (uids[key]) continue;
    const uid = randomUUID();
    await auth.createUser({
      uid,
      email: emailOf(key),
      password: DEMO_PASSWORD,
      emailVerified: true,
      displayName,
    });
    await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
    await accounts.provision(uid);
    await profiles.update(uid, {
      username: un(key),
      displayName,
      bio,
      onboardingState: 'complete',
    });
    uids[key] = uid;
    stats.users += 1;
  }
  await stateRef.set(
    {
      status: 'running',
      runId,
      uids,
      boxIds: state.boxIds ?? {},
      lifeUpdateIds: state.lifeUpdateIds ?? {},
      updatedAt: Date.now(),
    },
    { merge: true },
  );

  // Avatars (procedural). Becomes the avatar when the asset turns ready.
  for (const [index, [key, displayName]] of PEOPLE.entries()) {
    await step(`avatar ${key}`, async () => {
      const token = await tokenOf(key);
      const current = await callable(token, 'getMyProfile', {});
      if ((current.profile ?? current).avatarMediaId) return;
      const initials = displayName
        .split(/\s+/)
        .map((part) => part[0])
        .join('');
      const id = await upload(
        token,
        'avatar',
        null,
        'image/png',
        await makeAvatar(initials, index + 2),
      );
      await waitReady(token, id);
    });
  }

  // Friendships.
  const befriend = async (a, b) =>
    step(`friend ${a}-${b}`, async () => {
      try {
        const sent = await callable(await tokenOf(a), 'sendFriendRequest', {
          username: un(b),
        });
        await callable(await tokenOf(b), 'acceptFriendRequest', {
          requestId: sent.requestId,
        });
        stats.friendships += 1;
      } catch (error) {
        if (error.status !== 'ALREADY_EXISTS') throw error;
      }
    });
  const meProfile = await callable(await tokenOf('me'), 'getMyProfile', {});
  const meUsername = meProfile.profile?.username ?? meProfile.username;
  for (const [key] of PEOPLE)
    await step(`friend ${key}-me`, async () => {
      try {
        const sent = await callable(await tokenOf(key), 'sendFriendRequest', {
          username: meUsername,
        });
        await callable(await tokenOf('me'), 'acceptFriendRequest', {
          requestId: sent.requestId,
        });
        stats.friendships += 1;
      } catch (error) {
        if (error.status !== 'ALREADY_EXISTS') throw error;
      }
    });
  for (const [a, b] of FRIEND_PAIRS) await befriend(a, b);
  for (const [a, b] of PENDING_PAIRS)
    await step(`pending ${a}-${b}`, async () => {
      try {
        await callable(await tokenOf(a), 'sendFriendRequest', {
          username: un(b),
        });
      } catch (error) {
        if (error.status !== 'ALREADY_EXISTS') throw error;
      }
    });

  // Boxes: owner creates, invites by username (friends or not), invitees accept, roles set.
  const boxIds = { ...(state.boxIds ?? {}) };
  const nameOf = (key) => (key === 'me' ? meUsername : un(key));
  for (const box of BOXES) {
    await step(`box ${box.key}`, async () => {
      const ownerToken = await tokenOf(box.owner);
      if (!boxIds[box.key]) {
        const created = await callable(ownerToken, 'createBox', {
          name: box.name,
          idempotencyKey: uuidFor(`box:${box.key}`),
        });
        boxIds[box.key] = created.id;
        stats.boxes += 1;
        await stateRef.set({ boxIds }, { merge: true });
      }
      for (const member of [...box.admins, ...box.members]) {
        try {
          const invite = await callable(ownerToken, 'inviteBox', {
            boxId: boxIds[box.key],
            username: nameOf(member),
          });
          await callable(await tokenOf(member), 'acceptBoxInvitation', {
            invitationId: invite.invitationId,
          });
        } catch (error) {
          if (!['ALREADY_EXISTS', 'FAILED_PRECONDITION'].includes(error.status))
            throw error;
        }
      }
      for (const admin of box.admins)
        await callable(ownerToken, 'setBoxMemberRole', {
          boxId: boxIds[box.key],
          memberUid: uids[admin],
          role: 'admin',
        });
    });
  }

  // Posts, photos, comments, replies, reactions.
  for (const [index, post] of POSTS.entries()) {
    const boxId = boxIds[post.box];
    if (!boxId) continue;
    await step(`post ${index} (${post.box})`, async () => {
      const token = await tokenOf(post.by);
      const assetIds = [];
      for (const [imageIndex, [shape, label]] of post.img.entries()) {
        const bytes = await makeImage(shape, label, index * 5 + imageIndex);
        assetIds.push(
          await upload(token, 'post_image', boxId, 'image/jpeg', bytes),
        );
      }
      for (const id of assetIds) await waitReady(token, id);
      const created = await callable(token, 'createBoxPost', {
        boxId,
        text: post.text,
        ...(assetIds.length ? { mediaAssetIds: assetIds } : {}),
        idempotencyKey: uuidFor(`post:${index}`),
      });
      stats.posts += 1;
      stats.photos += assetIds.length;
      for (const [by, kind] of post.react)
        await step(`post ${index} reaction`, async () => {
          await callable(await tokenOf(by), 'setBoxReaction', {
            boxId,
            postId: created.postId,
            kind,
          });
          stats.postReactions += 1;
        });
      for (const [ci, [by, text, replies, reacts]] of post.comments.entries()) {
        const root = await callable(await tokenOf(by), 'createBoxComment', {
          boxId,
          postId: created.postId,
          text,
          idempotencyKey: uuidFor(`c:${index}:${ci}`),
        });
        stats.comments += 1;
        for (const [rb, kind] of reacts)
          await step(`comment reaction ${index}.${ci}`, async () => {
            await callable(await tokenOf(rb), 'setBoxReaction', {
              boxId,
              postId: created.postId,
              commentId: root.commentId,
              kind,
            });
            stats.commentReactions += 1;
          });
        for (const [ri, [rby, rtext]] of replies.entries()) {
          await callable(await tokenOf(rby), 'createBoxComment', {
            boxId,
            postId: created.postId,
            text: rtext,
            parentId: root.commentId,
            idempotencyKey: uuidFor(`r:${index}:${ci}:${ri}`),
          });
          stats.replies += 1;
        }
      }
    });
  }

  // Archive the archived Box last (archived Boxes reject new posts).
  for (const box of BOXES.filter((item) => item.archive))
    await step(`archive ${box.key}`, async () => {
      if (boxIds[box.key])
        await callable(await tokenOf(box.owner), 'updateBox', {
          boxId: boxIds[box.key],
          status: 'archived',
        });
    });

  // Life Updates.
  const lifeUpdateIds = { ...(state.lifeUpdateIds ?? {}) };
  for (const update of LIFE_UPDATES)
    await step(`life update ${update.key}`, async () => {
      const token = await tokenOf(update.by);
      const mediaAssetIds = [];
      if (update.img) {
        const id = await upload(
          token,
          'life_update_image',
          null,
          'image/jpeg',
          await makeImage(update.img[0], update.img[1], 11),
        );
        await waitReady(token, id);
        mediaAssetIds.push(id);
        stats.photos += 1;
      }
      const created = await callable(token, 'createLifeUpdate', {
        audience: update.boxes
          ? { type: 'boxes', boxIds: update.boxes.map((key) => boxIds[key]) }
          : { type: 'only_me' },
        sections: update.sections,
        ...(mediaAssetIds.length ? { mediaAssetIds } : {}),
        idempotencyKey: uuidFor(`lu:${update.key}`),
      });
      lifeUpdateIds[update.key] = created.id;
      stats.lifeUpdates += 1;
    });

  // One customized Room (Mara's) with Top Friends.
  await step('room mara', async () => {
    const token = await tokenOf('mara');
    const room = await callable(token, 'getMyRoom', {});
    const styled = await callable(token, 'updateMyRoom', {
      visibility: 'friends',
      themePreset: 'polaroid_scrapbook',
      layout: 'two_column',
      sparkles: true,
      location: 'Rotterdam, a studio with an east window',
      currently: 'Waiting for the kiln to cool',
      music: {
        url: 'https://music.example.com/late-night-glaze',
        title: 'Late Night Glaze',
        artist: 'Demo Artist',
      },
      expectedUpdatedAt: room.updatedAt ?? null,
    });
    await callable(token, 'updateMyRoomTopFriends', {
      userIds: [uids.juno, uids.teo, uids.sol, uids.me],
      size: 4,
      visibility: 'visible',
      expectedUpdatedAt: styled.updatedAt ?? null,
    });
  });

  await stateRef.set(
    {
      status: failures.length ? 'partial' : 'complete',
      uids,
      boxIds,
      lifeUpdateIds,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
  report(uids);
}

function report(uids) {
  const out = process.stdout;
  out.write('\nDemo seed finished (emulators only).\n');
  out.write(`Created this run: ${JSON.stringify(stats)}\n`);
  out.write(`Shared demo password: ${DEMO_PASSWORD}\n`);
  out.write(
    `Sign in as ${FIXTURE_EMAIL} (fixture password) to see everything it belongs to.\n`,
  );
  out.write(
    `Demo users: ${PEOPLE.map(([key]) => `${un(key)} <${emailOf(key)}>`).join(', ')}\n`,
  );
  out.write(`uids: ${JSON.stringify(uids)}\n`);
  if (failures.length)
    out.write(
      `FAILED STEPS (${failures.length}):\n  ${failures.join('\n  ')}\n`,
    );
  else out.write('No failed steps.\n');
}

// ----------------------------------------------------------------- reset ----
async function runReset({ db, auth, storage, uids, state, tokenOf }) {
  const out = process.stdout;
  const boxIds = state.boxIds ?? {};
  const deletePath = async (path) => {
    await storage.bucket(BUCKET).file(path).delete({ ignoreNotFound: true });
  };
  const boxDeletion = new NativeBoxDeletion(db, deletePath);
  // Life Updates by their authors first.
  for (const update of LIFE_UPDATES) {
    const id = state.lifeUpdateIds?.[update.key];
    if (id && uids[update.by])
      await step(`delete life update ${update.key}`, async () => {
        try {
          await callable(await tokenOf(update.by), 'deleteLifeUpdate', { id });
        } catch (error) {
          if (error.status !== 'NOT_FOUND') throw error; // already gone
        }
      });
  }
  // Boxes: the owner's own deletion path, then drive the job to completion.
  for (const box of BOXES) {
    const boxId = boxIds[box.key];
    if (!boxId || !uids[box.owner]) continue;
    await step(`delete box ${box.key}`, async () => {
      try {
        await callable(await tokenOf(box.owner), 'beginBoxDeletion', {
          boxId,
          confirmName: box.name,
        });
      } catch (error) {
        if (error.status === 'NOT_FOUND') return; // already gone
        throw error;
      }
      for (let i = 0; i < 200; i += 1) {
        if ((await boxDeletion.processOnce(boxId)) === 'complete') break;
      }
    });
  }
  // Demo accounts through the account-deletion path (7-day wait simulated).
  const lifecycle = new NativeAccountLifecycle(db, auth, storage, BUCKET);
  for (const [key] of PEOPLE) {
    if (!uids[key]) continue;
    await step(`delete account ${key}`, async () => {
      await lifecycle.requestDeletion(uids[key], DEMO_PASSWORD, async () => {});
      const later = Date.now() + 8 * 24 * 60 * 60 * 1000;
      for (let i = 0; i < 100; i += 1) {
        if ((await lifecycle.processDeletion(uids[key], later)) === 'complete')
          break;
      }
    });
  }
  if (failures.length === 0)
    await db.collection('nativeDemoSeed').doc('v1').delete();
  out.write(
    `Demo reset finished. ${failures.length ? `FAILED STEPS:\n  ${failures.join('\n  ')}` : 'No failed steps.'}\n`,
  );
}
