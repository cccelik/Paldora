import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBlockPairs } from './native-block-pairs.js';
import {
  NativeBoxPosts,
  NativePostError,
  type NativePost,
} from './native-box-posts.js';
import { NativeHomeFeed } from './native-home-feed.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `batch-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const posts = new NativeBoxPosts(db);
const blocks = new NativeBlockPairs(db);
const home = new NativeHomeFeed(db);
afterAll(() => deleteApp(app));

async function user() {
  const uid = randomUUID();
  await auth.createUser({
    uid,
    email: `${uid}@example.invalid`,
    emailVerified: true,
  });
  await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  await accounts.provision(uid);
  return uid;
}

async function box(
  members: string[],
  status: 'active' | 'archived' | 'deleting' = 'active',
) {
  const id = randomUUID();
  const ref = db.collection('nativeBoxes').doc(id);
  await ref.set({ name: 'Batch', ownerUid: members[0], status });
  for (const uid of members)
    await ref
      .collection('members')
      .doc(uid)
      .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
  return id;
}

async function seedPost(
  boxId: string,
  authorUid: string,
  createdAt: number,
  extra: Record<string, unknown> = {},
) {
  const id = randomUUID();
  await db
    .collection('nativeBoxes')
    .doc(boxId)
    .collection('posts')
    .doc(id)
    .set({
      boxId,
      authorUid,
      text: `Post ${createdAt}`,
      kind: 'post',
      status: 'active',
      moderationHidden: false,
      createdAt,
      updatedAt: createdAt,
      mediaAssetIds: [],
      ...extra,
    });
  return id;
}

async function hint(
  viewer: string,
  boxId: string,
  postId: string,
  authorUid: string,
  createdAt: number,
) {
  await db
    .collection('nativeFeedRefs')
    .doc(viewer)
    .collection('items')
    .doc(`p_${postId}`)
    .set({
      kind: 'post',
      contentId: postId,
      authorUid,
      boxId,
      createdAt,
      schemaVersion: 2,
    });
}

async function viaGet(
  boxId: string,
  postId: string,
  viewer: string,
): Promise<NativePost | null> {
  try {
    return await posts.get(boxId, postId, viewer);
  } catch (error) {
    if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
      return null;
    throw error;
  }
}

describe('batched post authorization', () => {
  it('returns exactly what get() returns for every mixed-visibility item', async () => {
    const viewer = await user();
    const author = await user();
    const suspended = await user();
    const blockedByViewer = await user();
    const blockedViewer = await user();
    const stranger = await user();
    const main = await box([
      author,
      viewer,
      suspended,
      blockedByViewer,
      blockedViewer,
    ]);
    const archived = await box([author, viewer], 'archived');
    const deleting = await box([author, viewer], 'deleting');
    const left = await box([author, viewer]);
    const foreign = await box([author, stranger]);
    const refs: { boxId: string; postId: string }[] = [];
    const add = async (
      boxId: string,
      authorUid: string,
      extra: Record<string, unknown> = {},
    ) => {
      refs.push({
        boxId,
        postId: await seedPost(boxId, authorUid, 1_000 + refs.length, extra),
      });
    };
    await add(main, author);
    await add(main, viewer);
    await add(main, author, { status: 'deleted' });
    await add(main, author, { moderationHidden: true });
    await add(main, suspended);
    await add(main, blockedByViewer);
    await add(main, blockedViewer);
    await add(main, author, {
      kind: 'life_update',
      lifeUpdateId: randomUUID(),
    });
    await add(archived, author);
    await add(deleting, author);
    await add(left, author);
    await add(foreign, author);
    refs.push({ boxId: main, postId: randomUUID() });
    refs.push({ boxId: archived, postId: refs[0]!.postId });
    refs.push({ boxId: randomUUID(), postId: randomUUID() });
    await accounts.suspend(suspended);
    await blocks.setBlocked(viewer, blockedByViewer, true);
    await blocks.setBlocked(blockedViewer, viewer, true);
    await db
      .collection('nativeBoxes')
      .doc(left)
      .collection('members')
      .doc(viewer)
      .update({ status: 'left' });

    const batch = await posts.getMany(refs, viewer);
    const single = await Promise.all(
      refs.map((ref) => viaGet(ref.boxId, ref.postId, viewer)),
    );
    expect(batch).toEqual(single);
    expect(batch.flatMap((post) => (post ? [post.id] : [])).sort()).toEqual(
      [refs[0]!, refs[1]!, refs[8]!].map((ref) => ref.postId).sort(),
    );

    const inactive = await posts.getMany(refs, suspended);
    expect(inactive.every((post) => post === null)).toBe(true);
  });

  it('yields null, not an error, for guessed, foreign or malformed ids', async () => {
    const viewer = await user();
    const other = await user();
    const mine = await box([viewer]);
    const theirs = await box([other]);
    const foreignPost = await seedPost(theirs, other, 5);
    const ownPost = await seedPost(mine, viewer, 6);
    const result = await posts.getMany(
      [
        { boxId: theirs, postId: foreignPost },
        { boxId: mine, postId: randomUUID() },
        { boxId: randomUUID(), postId: randomUUID() },
        { boxId: 'a/b', postId: 'c' },
        { boxId: mine, postId: '' },
        { boxId: mine, postId: ownPost },
      ],
      viewer,
    );
    expect(result.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(result[5]?.id).toBe(ownPost);
    expect(await posts.getMany([], viewer)).toEqual([]);
  });

  it('list() filters a page the same way get() does', async () => {
    const viewer = await user();
    const author = await user();
    const hidden = await user();
    const id = await box([author, viewer, hidden]);
    const ok1 = await seedPost(id, author, 10);
    await seedPost(id, author, 20, { status: 'deleted' });
    await seedPost(id, hidden, 30);
    const ok2 = await seedPost(id, viewer, 40);
    await blocks.setBlocked(viewer, hidden, true);
    const page = await posts.list(id, viewer);
    expect(page.items.map((post) => post.id)).toEqual([ok2, ok1]);
    await expect(posts.list(id, await user())).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('keeps Home cursors gapless and duplicate-free across filtered hints', async () => {
    const viewer = await user();
    const author = await user();
    const blocked = await user();
    const id = await box([author, viewer, blocked]);
    await blocks.setBlocked(viewer, blocked, true);
    const expected: string[] = [];
    for (let i = 0; i < 70; i++) {
      const at = 100 + i;
      const kind = i % 3;
      const authorUid = kind === 1 ? blocked : author;
      const postId = await seedPost(
        id,
        authorUid,
        at,
        kind === 2 ? { status: 'deleted' } : {},
      );
      await hint(viewer, id, postId, authorUid, at);
      if (kind === 0) expected.unshift(postId);
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await home.page(viewer, cursor, 7);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 30);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expected);
  });

  it('returns nothing from existing hints once membership is removed', async () => {
    const viewer = await user();
    const author = await user();
    const id = await box([author, viewer]);
    for (let i = 0; i < 5; i++) {
      const postId = await seedPost(id, author, 500 + i);
      await hint(viewer, id, postId, author, 500 + i);
    }
    expect((await home.page(viewer)).items).toHaveLength(5);
    await db
      .collection('nativeBoxes')
      .doc(id)
      .collection('members')
      .doc(viewer)
      .update({ status: 'left' });
    expect((await home.page(viewer)).items).toEqual([]);
  });
});
