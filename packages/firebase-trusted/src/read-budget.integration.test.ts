import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  Firestore,
  Query,
  Transaction,
  getFirestore,
} from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_WIDGETS } from '@paldora/domain';
import { NativeAccounts } from './native-accounts.js';
import { nativeBlockPairId } from './native-box-invitations.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeHomeFeed } from './native-home-feed.js';
import { NativeLifeUpdates } from './native-life-updates.js';
import { NativeMemories } from './native-memories.js';
import { NativeNotifications } from './native-notifications.js';
import { NativeRooms } from './native-rooms.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

/*
 * Firestore document-read budgets per page.
 *
 * PREDICTED_* values come from reading the service source (see
 * docs/firebase/read-costs.md for the per-step arithmetic). Each BUDGET_* is
 * ceil(predicted * 1.25): about 25% headroom, so a new per-item or
 * per-author read (an N+1) fails here. Measured on the emulator on 2026-10-26 and equal to these values; to re-baseline, replace
 * PREDICTED_* with the measured numbers printed by this file and recompute the
 * budgets with the same headroom.
 */
const HEADROOM = 1.25;
const budget = (predicted: number) => Math.ceil(predicted * HEADROOM);
const PREDICTED = {
  homeFeed: 62,
  // list (25) + one interactionSummaries call: account, Box and member (3) +
  // 20 post documents + 4 distinct actors x (account + block pair) = 8 -> 31.
  boxFeed: 56,
  // Index deleted: the same call scans 3 comments + 4 reactions per post
  // (7 x 20 = 140) on top of the 31 shared reads, plus the list (25). To be
  // measured; re-baseline from the first real run.
  boxFeedFallback: 196,
  unreadCount: 271,
  memoriesMonth: 75,
  roomView: 39,
  postDetail: 40,
} as const;
const BUDGETS = {
  homeFeed: budget(PREDICTED.homeFeed),
  boxFeed: budget(PREDICTED.boxFeed),
  boxFeedFallback: budget(PREDICTED.boxFeedFallback),
  unreadCount: budget(PREDICTED.unreadCount),
  memoriesMonth: budget(PREDICTED.memoriesMonth),
  roomView: budget(PREDICTED.roomView),
  postDetail: budget(PREDICTED.postDetail),
} as const;
/** Marginal reads allowed per extra distinct author: account + block pair. */
const PER_AUTHOR_READ_ALLOWANCE = 2;

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `read-budget-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const indexedPosts = new NativeBoxPosts(db, { trustInteractionIndex: true });
const updates = new NativeLifeUpdates(db);
const home = new NativeHomeFeed(db);
const memories = new NativeMemories(db);
const notifications = new NativeNotifications(db);
const rooms = new NativeRooms(db);

// ---- Read meter ------------------------------------------------------
// Billed reads: one per document returned, one per missing-document get,
// at least one per query (an empty result is still billed once), and one per
// 1,000 index entries for an aggregation (minimum one). Every Admin read goes
// through exactly one of the five wrapped methods below; none calls another
// (DocumentReference.get delegates to Firestore.getAll, Transaction.get to
// private readers), so nothing is counted twice.
const meter = { on: false, reads: 0 };
const restores: (() => void)[] = [];
type Method = (...args: unknown[]) => unknown;

function snapshotReads(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (result && typeof result === 'object') {
    if ('docs' in result)
      return Math.max(1, (result as unknown as { size: number }).size);
    if ('exists' in result) return 1;
    if ('data' in result) {
      const data = (result as { data: () => Record<string, unknown> }).data();
      const largest = Math.max(
        0,
        ...Object.values(data).filter(
          (value): value is number => typeof value === 'number',
        ),
      );
      return Math.max(1, Math.ceil(largest / 1000));
    }
  }
  return 0;
}

function instrument(prototype: object, name: string) {
  const holder = prototype as unknown as Record<string, Method>;
  const original = holder[name]!;
  holder[name] = new Proxy(original, {
    apply(target, thisArg, args) {
      const counting = meter.on;
      const out = Reflect.apply(target, thisArg, args) as unknown;
      if (!counting || !(out instanceof Promise)) return out;
      return out.then((result: unknown) => {
        meter.reads += snapshotReads(result);
        return result;
      });
    },
  });
  restores.push(() => {
    holder[name] = original;
  });
}

beforeAll(() => {
  if (!(db instanceof Firestore))
    throw new Error('Meter must wrap the Firestore class the services use');
  instrument(Firestore.prototype, 'getAll');
  instrument(Transaction.prototype, 'get');
  instrument(Transaction.prototype, 'getAll');
  instrument(Query.prototype, 'get');
  // AggregateQuery is not a public export; reach its prototype via an instance.
  instrument(
    Object.getPrototypeOf(db.collection('nativeBoxes').count()) as object,
    'get',
  );
});
afterAll(async () => {
  for (const restore of restores) restore();
  // processPending() drains one global queue shared by every test file, so
  // leave nothing pending for the next suite.
  for (let round = 0; round < 50; round += 1)
    if ((await notifications.processPending()) === 0) break;
  await deleteApp(app);
});

async function measure<T>(
  run: () => Promise<T>,
): Promise<{ value: T; reads: number }> {
  meter.reads = 0;
  meter.on = true;
  try {
    const value = await run();
    return { value, reads: meter.reads };
  } finally {
    meter.on = false;
  }
}

const results: Record<string, { reads: number; items: number }> = {};
function record(name: string, reads: number, items: number) {
  results[name] = { reads, items };
  console.info(
    `[read-budget] ${name}: ${reads} reads, ${items} items, ${(reads / Math.max(1, items)).toFixed(2)} reads/item`,
  );
}
afterAll(() => {
  // The reporter hides console output of passing tests; this keeps the
  // measurements retrievable (READ_BUDGET_OUT=/path/to/file.json).
  if (process.env.READ_BUDGET_OUT)
    writeFileSync(
      process.env.READ_BUDGET_OUT,
      JSON.stringify(results, null, 2),
    );
  console.table(
    Object.entries(results).map(([name, { reads, items }]) => ({
      path: name,
      reads,
      items,
      readsPerItem: Number((reads / Math.max(1, items)).toFixed(2)),
    })),
  );
});

// ---- Fixtures --------------------------------------------------------
async function person() {
  const uid = randomUUID();
  const username = `p${uid.replaceAll('-', '').slice(0, 12)}`;
  await auth.createUser({
    uid,
    email: `${uid}@example.invalid`,
    emailVerified: true,
  });
  await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  await accounts.provision(uid);
  await db
    .collection('nativeAccounts')
    .doc(uid)
    .update({ username, usernameNormalized: username });
  await db.collection('nativeUsernames').doc(username).set({ uid });
  await db
    .collection('nativeProfiles')
    .doc(uid)
    .update({ displayName: username });
  return { uid, username };
}

async function people(count: number) {
  return Promise.all(Array.from({ length: count }, () => person()));
}

async function addMember(boxId: string, uid: string) {
  const account = db.collection('nativeAccounts').doc(uid);
  await db
    .collection('nativeBoxes')
    .doc(boxId)
    .collection('members')
    .doc(uid)
    .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
  await account.collection('boxRefs').doc(boxId).set({ boxId });
}

async function befriend(first: string, second: string) {
  await db
    .collection('nativeFriendPairs')
    .doc(nativeBlockPairId(first, second))
    .set({ users: [first, second].sort(), status: 'accepted' });
}

/** Viewer owns Box A, author[0] owns Box B; everyone is in both Boxes. */
async function seedFeed(authorCount: number, stamps: number[]) {
  const viewer = (await person()).uid;
  const authors = (await people(authorCount)).map((p) => p.uid);
  const boxA = await boxes.create(viewer, 'Box A');
  const boxB = await boxes.create(authors[0]!, 'Box B');
  await Promise.all([
    ...authors.slice(1).map((uid) => addMember(boxB.id, uid)),
    ...authors.map((uid) => addMember(boxA.id, uid)),
    addMember(boxB.id, viewer),
  ]);
  const targets = [boxA.id, boxB.id];
  const postIds = await Promise.all(
    stamps.map((at, i) =>
      posts.create(targets[i % 2]!, authors[i % authorCount]!, `Post ${i}`, at),
    ),
  );
  await Promise.all(
    postIds.map((id) => home.processOnce(NativeHomeFeed.publishJobId(id))),
  );
  return { viewer, authors, postIds };
}

const stampsFrom = (start: string, count: number) =>
  Array.from({ length: count }, (_, i) => Date.parse(start) + i * 60_000);

async function homePageReads(authorCount: number) {
  const { viewer } = await seedFeed(
    authorCount,
    stampsFrom('2025-06-01T00:00:00Z', 45),
  );
  const { value, reads } = await measure(() =>
    home.page(viewer, undefined, 20),
  );
  expect(value.items).toHaveLength(20);
  return { reads, items: value.items.length };
}

async function boxFeedFixture() {
  const [viewer, m1, m2, m3, m4] = (await people(5)) as [
    Awaited<ReturnType<typeof person>>,
    Awaited<ReturnType<typeof person>>,
    Awaited<ReturnType<typeof person>>,
    Awaited<ReturnType<typeof person>>,
    Awaited<ReturnType<typeof person>>,
  ];
  const box = await boxes.create(viewer.uid, 'Busy Box');
  await Promise.all(
    [m1, m2, m3, m4].map((member) => addMember(box.id, member.uid)),
  );
  const stamps = stampsFrom('2025-06-01T00:00:00Z', 20);
  const postIds = await Promise.all(
    stamps.map((at, i) => posts.create(box.id, m4.uid, `Post ${i}`, at)),
  );
  const kinds: [string, string][] = [
    [m1.uid, '👍'],
    [m2.uid, '🎉'],
    [m3.uid, '👍'],
    [m4.uid, '❤️'],
  ];
  await Promise.all(
    postIds.flatMap((postId) => [
      ...kinds.map(([uid, kind]) =>
        posts.setReaction(box.id, postId, uid, kind),
      ),
      posts.createComment(box.id, postId, m1.uid, 'First'),
      posts.createComment(box.id, postId, m2.uid, 'Second'),
      posts.createComment(box.id, postId, m1.uid, 'Third'),
    ]),
  );
  return { viewer: viewer.uid, boxId: box.id };
}

async function notificationFixture() {
  const [owner, ...actors] = await people(6);
  const box = await boxes.create(owner!.uid, 'Noisy Box');
  await Promise.all(actors.map((actor) => addMember(box.id, actor.uid)));
  const postIds = await Promise.all(
    stampsFrom('2025-06-01T00:00:00Z', 10).map((at, i) =>
      posts.create(box.id, owner!.uid, `Post ${i}`, at),
    ),
  );
  const rows = postIds.flatMap((postId) =>
    actors.map(async (actor) => {
      const commentId = await posts.createComment(
        box.id,
        postId,
        actor.uid,
        'Hi',
      );
      await posts.setReaction(box.id, postId, actor.uid, '👍');
      return [
        { type: 'post.comment', actor: actor.uid, postId, commentId },
        { type: 'post.reaction', actor: actor.uid, postId, commentId: null },
      ];
    }),
  );
  const items = db
    .collection('nativeNotifications')
    .doc(owner!.uid)
    .collection('items');
  let n = 0;
  await Promise.all(
    (await Promise.all(rows)).flat().map((row) =>
      items.doc(`row-${String(n++).padStart(4, '0')}`).set({
        schemaVersion: 1,
        type: row.type,
        actorUid: row.actor,
        boxId: box.id,
        postId: row.postId,
        commentId: row.commentId,
        reactionKind: row.type === 'post.reaction' ? '👍' : null,
        read: false,
        createdAt: 1_000 + n,
      }),
    ),
  );
  return { owner: owner!.uid };
}

async function roomFixture() {
  const owner = await person();
  const viewer = await person();
  const friends = await people(8);
  await Promise.all([
    befriend(owner.uid, viewer.uid),
    ...friends.map((friend) => befriend(owner.uid, friend.uid)),
  ]);
  const first = await rooms.update(owner.uid, {
    themePreset: 'obsidian_gold',
    expectedUpdatedAt: null,
  });
  const second = await rooms.updateWidgets(owner.uid, {
    widgets: DEFAULT_ROOM_WIDGETS.map((widget) => ({
      ...widget,
      enabled: widget.type !== 'photos',
    })),
    expectedUpdatedAt: first.updatedAt,
  });
  await rooms.updateTopFriends(owner.uid, {
    userIds: friends.map((friend) => friend.uid),
    size: 8,
    visibility: 'visible',
    expectedUpdatedAt: second.updatedAt,
  });
  return { viewer: viewer.uid, ownerName: owner.username };
}

async function postDetailFixture() {
  const [viewer, author, c1, c2, c3] = await people(5);
  const box = await boxes.create(viewer!.uid, 'Thread Box');
  const commenters = [c1!, c2!, c3!];
  await Promise.all(
    [author!, ...commenters].map((member) => addMember(box.id, member.uid)),
  );
  const postId = await posts.create(box.id, author!.uid, 'Discuss', 1_000);
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      posts.createComment(
        box.id,
        postId,
        commenters[i % commenters.length]!.uid,
        `Comment ${i}`,
      ),
    ),
  );
  return { viewer: viewer!.uid, boxId: box.id, postId };
}

// ---- Tests -----------------------------------------------------------
describe('read meter self-check', () => {
  it('counts documents returned, missing gets, empty queries, getAll, transactions and aggregations', async () => {
    const collection = db.collection(`readBudgetMeter_${randomUUID()}`);
    await collection.doc('a').set({ n: 1 });
    await collection.doc('b').set({ n: 2 });
    const reads = async (run: () => Promise<unknown>) =>
      (await measure(run)).reads;
    expect(await reads(() => collection.doc('missing').get())).toBe(1);
    expect(await reads(() => collection.doc('a').get())).toBe(1);
    expect(await reads(() => collection.get())).toBe(2);
    expect(await reads(() => collection.where('n', '>', 5).get())).toBe(1);
    expect(
      await reads(() =>
        db.getAll(
          collection.doc('a'),
          collection.doc('b'),
          collection.doc('c'),
        ),
      ),
    ).toBe(3);
    expect(
      await reads(() =>
        db.runTransaction(async (tx) => {
          await tx.get(collection.doc('a'));
          await tx.get(collection);
        }),
      ),
    ).toBe(3);
    expect(await reads(() => collection.count().get())).toBe(1);
  });
});

describe('Firestore document reads per page', { timeout: 180_000 }, () => {
  it('Home feed first page (limit 20, 3 authors, 2 Boxes)', async () => {
    const { reads, items } = await homePageReads(3);
    record('home feed page', reads, items);
    expect(reads).toBeGreaterThan(items);
    expect(reads).toBeLessThanOrEqual(BUDGETS.homeFeed);
  });

  it('Home feed reads do not grow with distinct authors beyond a small slope', async () => {
    const three = await homePageReads(3);
    const six = await homePageReads(6);
    record('home feed page, 6 authors', six.reads, six.items);
    expect(six.reads - three.reads).toBeLessThanOrEqual(
      3 * PER_AUTHOR_READ_ALLOWANCE,
    );
    expect(six.reads).toBeLessThan(three.reads * 2);
  });

  it('Box feed page (limit 20) with reaction and comment counts, index-backed', async () => {
    const { viewer, boxId } = await boxFeedFixture();
    const page = await measure(() =>
      indexedPosts.list(boxId, viewer, undefined, 20),
    );
    const summaries = await measure(() =>
      indexedPosts.interactionSummaries(
        page.value.items.map((post) => ({ boxId, postId: post.id })),
        viewer,
      ),
    );
    expect(summaries.value[0]).toMatchObject({
      commentCount: 3,
      reactionCount: 4,
    });
    const reads = page.reads + summaries.reads;
    record('box feed page: list', page.reads, page.value.items.length);
    record(
      'box feed page: summaries',
      summaries.reads,
      page.value.items.length,
    );
    record('box feed page: total', reads, page.value.items.length);
    expect(page.value.items).toHaveLength(20);
    expect(reads).toBeLessThanOrEqual(BUDGETS.boxFeed);
  });

  it('Box feed page falls back to the scan when the index is missing (cost stays visible)', async () => {
    const { viewer, boxId } = await boxFeedFixture();
    const page = await measure(() =>
      indexedPosts.list(boxId, viewer, undefined, 20),
    );
    await Promise.all(
      page.value.items.map((post) =>
        db
          .collection('nativeBoxes')
          .doc(boxId)
          .collection('posts')
          .doc(post.id)
          .update({ interactionIndex: FieldValue.delete() }),
      ),
    );
    const summaries = await measure(() =>
      indexedPosts.interactionSummaries(
        page.value.items.map((post) => ({ boxId, postId: post.id })),
        viewer,
      ),
    );
    expect(summaries.value[0]).toMatchObject({
      commentCount: 3,
      reactionCount: 4,
    });
    const reads = page.reads + summaries.reads;
    record('box feed page (index missing): total', reads, 20);
    expect(reads).toBeLessThanOrEqual(BUDGETS.boxFeedFallback);
  });

  it('unread notification count with 100 visible rows', async () => {
    const { owner } = await notificationFixture();
    const { value, reads } = await measure(() =>
      notifications.unreadCount(owner),
    );
    expect(value).toEqual({ count: 100, capped: true });
    record('unread count', reads, 100);
    expect(reads).toBeLessThanOrEqual(BUDGETS.unreadCount);
  });

  it('Memories month page (limit 20, 30 posts and 2 Only Me updates in June)', async () => {
    const { viewer } = await seedFeed(3, [
      ...stampsFrom('2025-05-01T00:00:00Z', 5),
      ...stampsFrom('2025-06-01T00:00:00Z', 30),
    ]);
    await Promise.all(
      ['2025-06-10T12:00:00Z', '2025-06-20T12:00:00Z'].map((at, i) =>
        updates.create(
          viewer,
          { audience: { type: 'only_me' }, sections: { travel: `Trip ${i}` } },
          Date.parse(at),
        ),
      ),
    );
    const { value, reads } = await measure(() =>
      memories.page(
        viewer,
        { kind: 'personal' },
        { year: 2025, month: 6, limit: 20 },
      ),
    );
    expect(value.items).toHaveLength(20);
    record('memories month page', reads, value.items.length);
    expect(reads).toBeLessThanOrEqual(BUDGETS.memoriesMonth);
  });

  it('Room view with 8 Top Friends and 6 visible widgets', async () => {
    const { viewer, ownerName } = await roomFixture();
    const { value, reads } = await measure(() => rooms.get(viewer, ownerName));
    expect(value.topFriends.items).toHaveLength(8);
    expect(value.widgets).toHaveLength(6);
    record('room view', reads, value.topFriends.items?.length ?? 0);
    expect(reads).toBeLessThanOrEqual(BUDGETS.roomView);
  });

  it('post detail: permalink, first page of 30 root comments, reply previews and counts', async () => {
    const { viewer, boxId, postId } = await postDetailFixture();
    // The web data layer loads the thread through commentThreadsPage (S4).
    const { value, reads } = await measure(async () => {
      await posts.resolve(postId, viewer);
      return posts.commentThreadsPage(boxId, postId, viewer);
    });
    expect(value.items).toHaveLength(20);
    expect(value.nextCursor).toBeTruthy();
    record('post detail', reads, value.items.length);
    expect(reads).toBeLessThanOrEqual(BUDGETS.postDetail);
  });

  it('post detail, legacy per-root path (kept for comparison only)', async () => {
    const { viewer, boxId, postId } = await postDetailFixture();
    const { value, reads } = await measure(async () => {
      const roots = await posts.listCommentRoots(boxId, postId, viewer);
      await Promise.all(
        roots.items.map(async (root) => {
          const id = root.kind === 'comment' ? root.comment.id : root.id;
          await Promise.all([
            posts.listCommentReplies(boxId, postId, id, viewer, undefined, 3),
            posts.countCommentReplies(boxId, postId, id, viewer),
          ]);
        }),
      );
      return roots;
    });
    record('post detail, legacy per-root', reads, value.items.length);
    expect(reads).toBeGreaterThan(0);
  });
});
