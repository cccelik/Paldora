import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBlockPairs } from './native-block-pairs.js';
import { NativeBoxPosts, NativePostError } from './native-box-posts.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `threads-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const posts = new NativeBoxPosts(db);
const blocks = new NativeBlockPairs(db);
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
  await ref.set({ name: 'Threads', ownerUid: members[0], status });
  for (const uid of members)
    await ref
      .collection('members')
      .doc(uid)
      .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
  return id;
}

async function post(boxId: string, authorUid: string) {
  const id = randomUUID();
  await db
    .collection('nativeBoxes')
    .doc(boxId)
    .collection('posts')
    .doc(id)
    .set({
      boxId,
      authorUid,
      text: 'Thread post',
      kind: 'post',
      status: 'active',
      moderationHidden: false,
      createdAt: 1,
      updatedAt: 1,
      mediaAssetIds: [],
    });
  return id;
}

let clock = 1_000;
async function comment(
  boxId: string,
  postId: string,
  authorUid: string,
  parentId: string | null,
  extra: Record<string, unknown> = {},
) {
  const id = randomUUID();
  clock += 1;
  await db
    .collection('nativeBoxes')
    .doc(boxId)
    .collection('posts')
    .doc(postId)
    .collection('comments')
    .doc(id)
    .set({
      postId,
      authorUid,
      parentId,
      text: `c${clock}`,
      status: 'active',
      moderationHidden: false,
      createdAt: clock,
      updatedAt: clock,
      ...extra,
    });
  return id;
}

async function legacyPage(
  boxId: string,
  postId: string,
  viewer: string,
  cursor?: string,
) {
  const roots = await posts.listCommentRoots(boxId, postId, viewer, cursor);
  const items = await Promise.all(
    roots.items.map(async (root) => {
      const rootId = root.kind === 'comment' ? root.comment.id : root.id;
      if (root.kind === 'hidden')
        return { root, rootId, replies: [], replyCount: 0 };
      const [preview, replyCount] = await Promise.all([
        posts.listCommentReplies(boxId, postId, rootId, viewer, undefined, 3),
        posts.countCommentReplies(boxId, postId, rootId, viewer),
      ]);
      return { root, rootId, replies: preview.items, replyCount };
    }),
  );
  return { items, nextCursor: roots.nextCursor };
}

describe('commentThreadsPage', () => {
  it('matches roots, previews and counts of the per-root methods', async () => {
    const [viewer, other, blocked, suspended] = await Promise.all([
      user(),
      user(),
      user(),
      user(),
    ]);
    const boxId = await box([viewer, other, blocked, suspended]);
    const postId = await post(boxId, other);
    await blocks.setBlocked(viewer, blocked, true);
    await accounts.suspend(suspended);

    await comment(boxId, postId, blocked, null);
    await comment(boxId, postId, suspended, null);
    await comment(boxId, postId, other, null, { moderationHidden: true });
    const deletedLive = await comment(boxId, postId, other, null, {
      status: 'deleted',
    });
    await comment(boxId, postId, other, deletedLive);
    const deletedEmpty = await comment(boxId, postId, other, null, {
      status: 'deleted',
    });
    await comment(boxId, postId, other, deletedEmpty, { status: 'deleted' });
    await comment(boxId, postId, other, null);
    const one = await comment(boxId, postId, other, null);
    await comment(boxId, postId, other, one);
    const five = await comment(boxId, postId, other, null);
    await comment(boxId, postId, other, five);
    await comment(boxId, postId, blocked, five);
    await comment(boxId, postId, suspended, five);
    await comment(boxId, postId, other, five, { moderationHidden: true });
    await comment(boxId, postId, other, five);
    await comment(boxId, postId, viewer, five);
    await comment(boxId, postId, viewer, five);

    const fresh = await posts.commentThreadsPage(boxId, postId, viewer);
    expect(fresh).toEqual(await legacyPage(boxId, postId, viewer));
    expect(fresh.items.some((t) => t.replyCount >= 5)).toBe(true);
    expect(fresh.items.some((t) => t.root.kind === 'deleted')).toBe(true);
    expect(fresh.items.some((t) => t.root.kind === 'hidden')).toBe(true);
  });

  it('pages with a cursor and falls back for heavy threads identically', async () => {
    const [viewer, other] = await Promise.all([user(), user()]);
    const boxId = await box([viewer, other]);
    const postId = await post(boxId, other);
    for (let i = 0; i < 22; i += 1) await comment(boxId, postId, other, null);
    const heavy = await comment(boxId, postId, other, null);
    for (let i = 0; i < 65; i += 1) await comment(boxId, postId, other, heavy);
    const first = await posts.commentThreadsPage(boxId, postId, viewer);
    expect(first).toEqual(await legacyPage(boxId, postId, viewer));
    expect(first.nextCursor).not.toBeNull();
    const second = await posts.commentThreadsPage(
      boxId,
      postId,
      viewer,
      first.nextCursor!,
    );
    expect(second).toEqual(
      await legacyPage(boxId, postId, viewer, first.nextCursor!),
    );
    expect(first.items[0]!.replyCount).toBe(65);
    expect(first.items[0]!.replies).toHaveLength(3);
  });

  it('denies outsiders, former members, deleting Boxes and forged ids', async () => {
    const [owner, member, outsider] = await Promise.all([
      user(),
      user(),
      user(),
    ]);
    const boxId = await box([owner, member]);
    const postId = await post(boxId, owner);
    const root = await comment(boxId, postId, owner, null);
    await comment(boxId, postId, owner, root);
    const otherPost = await post(boxId, owner);
    const foreignRoot = await comment(boxId, otherPost, owner, null);
    const foreignReply = await comment(boxId, otherPost, owner, foreignRoot);

    await expect(
      posts.commentThreadsPage(boxId, postId, outsider),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      posts.commentThreadsPage(boxId, postId, owner, foreignRoot),
    ).rejects.toBeInstanceOf(NativePostError);
    await expect(
      posts.commentThreadsPage(boxId, postId, owner, foreignReply),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      posts.commentThreadsPage(boxId, postId, owner, 'a/b'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      posts.commentThreadsPage(boxId, randomUUID(), owner),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });

    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .doc(member)
      .update({ status: 'left' });
    await expect(
      posts.commentThreadsPage(boxId, postId, member),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });

    await db
      .collection('nativeBoxes')
      .doc(boxId)
      .update({ status: 'deleting' });
    await expect(
      posts.commentThreadsPage(boxId, postId, owner),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
