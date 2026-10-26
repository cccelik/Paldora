import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { REAL_REACTION_KIND } from '@paldora/domain';
import { NativeAccounts } from './native-accounts.js';
import { NativeBlockPairs } from './native-block-pairs.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeInteractionIndex } from './native-interaction-index.js';
import { NativeNotifications } from './native-notifications.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `interaction-summaries-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const blocks = new NativeBlockPairs(db);
const scanning = new NativeBoxPosts(db);
const indexed = new NativeBoxPosts(db, { trustInteractionIndex: true });
const index = new NativeInteractionIndex(db);
afterAll(async () => {
  // processPending() drains one global queue shared by every test file, so
  // leave nothing pending for the next suite.
  const notifications = new NativeNotifications(db);
  for (let round = 0; round < 50; round += 1)
    if ((await notifications.processPending()) === 0) break;
  await deleteApp(app);
});

async function admittedUser() {
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

/** Owner (viewer) plus `count` members; a fresh post authored by the owner. */
async function world(count: number) {
  const owner = await admittedUser();
  const box = await boxes.create(owner, 'Summaries');
  const members: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const uid = await admittedUser();
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(uid)
      .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
    members.push(uid);
  }
  const postId = await posts().create(box.id, owner, 'Hello');
  const postRef = db
    .collection('nativeBoxes')
    .doc(box.id)
    .collection('posts')
    .doc(postId);
  return { owner, members, boxId: box.id, postId, postRef };
}

function posts() {
  return scanning;
}

/** The index-backed batch result must equal the scan, field for field. */
async function same(boxId: string, postId: string, viewer: string) {
  const [fast] = await indexed.interactionSummaries(
    [{ boxId, postId }],
    viewer,
  );
  const scan = await scanning.interactionSummary(boxId, postId, viewer);
  expect(fast).toEqual(scan);
  return scan;
}

async function realReaction(
  w: { boxId: string; postId: string },
  uid: string,
  asset: Record<string, unknown> = {},
) {
  const mediaAssetId = randomUUID();
  await db.collection('nativeMediaAssets').doc(mediaAssetId).set({
    status: 'ready',
    purpose: 'reaction_image',
    boxId: w.boxId,
    ownerUid: uid,
  });
  await posts().setReaction(w.boxId, w.postId, uid, REAL_REACTION_KIND, {
    mediaAssetId,
  });
  await db
    .collection('nativeMediaAssets')
    .doc(mediaAssetId)
    .update({ attachedReactionPostId: w.postId, ...asset });
  return mediaAssetId;
}

const jobRef = (postId: string) =>
  db.collection('nativeJobs').doc(NativeInteractionIndex.jobId(postId));

describe('interactionSummaries equals the scan', { timeout: 120_000 }, () => {
  it('counts comments, replies and emoji reactions, with a viewer reaction', async () => {
    const w = await world(3);
    const [a, b, c] = w.members as [string, string, string];
    const root = await posts().createComment(w.boxId, w.postId, a, 'root');
    await posts().createComment(w.boxId, w.postId, b, 'reply', root);
    await posts().createComment(w.boxId, w.postId, a, 'again');
    await posts().setReaction(w.boxId, w.postId, a, '👍');
    await posts().setReaction(w.boxId, w.postId, b, '👍');
    await posts().setReaction(w.boxId, w.postId, c, '🎉');
    await posts().setReaction(w.boxId, w.postId, w.owner, '❤️');
    const summary = await same(w.boxId, w.postId, w.owner);
    expect(summary).toMatchObject({ commentCount: 3, reactionCount: 4 });
    expect(summary.viewerReaction).toEqual({ kind: '❤️' });
    expect((await jobRef(w.postId).get()).exists).toBe(false);
    await same(w.boxId, w.postId, a);
  });

  it('hides an actor the viewer blocked, and one who blocked the viewer', async () => {
    const w = await world(2);
    const [a, b] = w.members as [string, string];
    for (const uid of [a, b]) {
      await posts().createComment(w.boxId, w.postId, uid, 'hi');
      await posts().setReaction(w.boxId, w.postId, uid, '👍');
    }
    await blocks.setBlocked(w.owner, a, true);
    await blocks.setBlocked(b, w.owner, true);
    const summary = await same(w.boxId, w.postId, w.owner);
    expect(summary).toMatchObject({ commentCount: 0, reactionCount: 0 });
    // The owner (the post's author) blocked `a`, so `a` cannot read the post:
    // the batch must deny exactly like the scan, with no summary at all.
    const [denied] = await indexed.interactionSummaries(
      [{ boxId: w.boxId, postId: w.postId }],
      a,
    );
    expect(denied).toBeNull();
    await expect(
      scanning.interactionSummary(w.boxId, w.postId, a),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('follows a commenter being suspended and then restored', async () => {
    const w = await world(1);
    const [a] = w.members as [string];
    await posts().createComment(w.boxId, w.postId, a, 'hi');
    await posts().setReaction(w.boxId, w.postId, a, '🎉');
    await accounts.suspend(a);
    expect(await same(w.boxId, w.postId, w.owner)).toMatchObject({
      commentCount: 0,
      reactionCount: 0,
    });
    await db.collection('nativeAccounts').doc(a).update({ status: 'active' });
    expect(await same(w.boxId, w.postId, w.owner)).toMatchObject({
      commentCount: 1,
      reactionCount: 1,
    });
  });

  it('follows a comment being hidden, restored and deleted (hidden or not)', async () => {
    const w = await world(1);
    const [a] = w.members as [string];
    const keep = await posts().createComment(w.boxId, w.postId, a, 'keep');
    const gone = await posts().createComment(w.boxId, w.postId, a, 'gone');
    const commentRef = (id: string) => w.postRef.collection('comments').doc(id);
    // Moderation maintains the index in its own transaction (ADR 022); the
    // repair here stands in for that write.
    await commentRef(keep).update({ moderationHidden: true });
    await index.repair(w.boxId, w.postId);
    expect((await same(w.boxId, w.postId, w.owner)).commentCount).toBe(1);
    await commentRef(keep).update({ moderationHidden: false });
    await index.repair(w.boxId, w.postId);
    expect((await same(w.boxId, w.postId, w.owner)).commentCount).toBe(2);
    await posts().deleteComment(w.boxId, w.postId, gone, a);
    expect((await same(w.boxId, w.postId, w.owner)).commentCount).toBe(1);
    await commentRef(keep).update({ moderationHidden: true });
    await index.repair(w.boxId, w.postId);
    await posts().deleteComment(w.boxId, w.postId, keep, a);
    expect((await same(w.boxId, w.postId, w.owner)).commentCount).toBe(0);
    expect((await index.check(w.boxId, w.postId)).ok).toBe(true);
  });

  it('checks camera assets at read time: not ready, someone elses, another post', async () => {
    const w = await world(5);
    const [ok, pending, foreign, elsewhere, viewerLike] = w.members as [
      string,
      string,
      string,
      string,
      string,
    ];
    await realReaction(w, ok);
    await realReaction(w, pending, { status: 'processing' });
    await realReaction(w, foreign, { ownerUid: ok });
    await realReaction(w, elsewhere, { attachedReactionPostId: randomUUID() });
    await realReaction(w, viewerLike);
    const summary = await same(w.boxId, w.postId, w.owner);
    expect(summary.realCount).toBe(2);
    expect(summary.reactionCount).toBe(2);
    // Readiness is never cached: flipping an asset changes the very next read.
    const viewerSummary = await same(w.boxId, w.postId, viewerLike);
    expect(viewerSummary.viewerReaction?.kind).toBe(REAL_REACTION_KIND);
    const asset = (await w.postRef.collection('reactions').doc(ok).get()).get(
      'mediaAssetId',
    ) as string;
    await db
      .collection('nativeMediaAssets')
      .doc(asset)
      .update({ status: 'processing' });
    expect((await same(w.boxId, w.postId, w.owner)).realCount).toBe(1);
    expect((await same(w.boxId, w.postId, ok)).viewerReaction).toBeNull();
  });

  it('orders more than four real previews by actor id', async () => {
    const w = await world(6);
    for (const uid of w.members) await realReaction(w, uid);
    const summary = await same(w.boxId, w.postId, w.owner);
    expect(summary.realCount).toBe(6);
    expect(summary.realPreview).toHaveLength(4);
    expect(summary.realPreview.map((p) => p.user.id)).toEqual(
      [...w.members].sort().slice(0, 4),
    );
  });

  it('hides an erased actor whose account is gone', async () => {
    const w = await world(1);
    const [a] = w.members as [string];
    await posts().createComment(w.boxId, w.postId, a, 'bye');
    await posts().setReaction(w.boxId, w.postId, a, '👍');
    await db.collection('nativeAccounts').doc(a).delete();
    expect(await same(w.boxId, w.postId, w.owner)).toMatchObject({
      commentCount: 0,
      reactionCount: 0,
    });
  });

  it('reports canInteract false for an archived Box', async () => {
    const w = await world(0);
    await db
      .collection('nativeBoxes')
      .doc(w.boxId)
      .update({ status: 'archived' });
    expect((await same(w.boxId, w.postId, w.owner)).canInteract).toBe(false);
  });

  it('summarises several posts and actors in one call, null for the unavailable', async () => {
    const w = await world(2);
    const [a, b] = w.members as [string, string];
    const second = await posts().create(w.boxId, a, 'Second');
    await posts().createComment(w.boxId, w.postId, b, 'x');
    await posts().setReaction(w.boxId, second, b, '🎉');
    const refs = [
      { boxId: w.boxId, postId: w.postId },
      { boxId: w.boxId, postId: randomUUID() },
      { boxId: w.boxId, postId: second },
    ];
    const batch = await indexed.interactionSummaries(refs, w.owner);
    expect(batch[1]).toBeNull();
    expect(batch[0]).toEqual(
      await scanning.interactionSummary(w.boxId, w.postId, w.owner),
    );
    expect(batch[2]).toEqual(
      await scanning.interactionSummary(w.boxId, second, w.owner),
    );
    await expect(
      indexed.interactionSummary(w.boxId, randomUUID(), w.owner),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe(
  'untrusted indexes fall back to the scan',
  { timeout: 120_000 },
  () => {
    async function populated() {
      const w = await world(1);
      const [a] = w.members as [string];
      await posts().createComment(w.boxId, w.postId, a, 'one');
      await posts().setReaction(w.boxId, w.postId, a, '👍');
      return { ...w, a };
    }

    it('a post with no index scans and enqueues one repair job', async () => {
      const w = await populated();
      await w.postRef.update({ interactionIndex: FieldValue.delete() });
      expect(await same(w.boxId, w.postId, w.owner)).toMatchObject({
        commentCount: 1,
        reactionCount: 1,
      });
      const job = await jobRef(w.postId).get();
      expect(job.data()).toMatchObject({
        type: 'interactionIndexRepair',
        boxId: w.boxId,
        postId: w.postId,
        status: 'pending',
        attempts: 0,
      });
      // Reading again is idempotent: ALREADY_EXISTS is ignored.
      await same(w.boxId, w.postId, w.owner);
      expect(
        await index.processOnce(NativeInteractionIndex.jobId(w.postId)),
      ).toBe('complete');
      expect((await index.check(w.boxId, w.postId)).ok).toBe(true);
    });

    it('a v:2 index is not trusted', async () => {
      const w = await populated();
      await w.postRef.update({
        interactionIndex: { v: 2, comments: {}, reactions: {} },
      });
      expect((await same(w.boxId, w.postId, w.owner)).commentCount).toBe(1);
      expect((await jobRef(w.postId).get()).exists).toBe(true);
    });

    it('an overflowed index scans and is not re-enqueued (repair cannot trust it)', async () => {
      const w = await populated();
      await w.postRef.update({ interactionIndex: { v: 1, overflow: true } });
      expect((await same(w.boxId, w.postId, w.owner)).commentCount).toBe(1);
      expect((await jobRef(w.postId).get()).exists).toBe(false);
    });

    it('the option off always scans and never enqueues', async () => {
      const w = await populated();
      await w.postRef.update({ interactionIndex: FieldValue.delete() });
      await scanning.interactionSummaries(
        [{ boxId: w.boxId, postId: w.postId }],
        w.owner,
      );
      expect((await jobRef(w.postId).get()).exists).toBe(false);
    });

    it('trusts a well-formed v1 index even if it is wrong; check() and repair are the safety net', async () => {
      const w = await populated();
      await w.postRef.update({
        interactionIndex: { v: 1, comments: {}, reactions: {} },
      });
      const [fast] = await indexed.interactionSummaries(
        [{ boxId: w.boxId, postId: w.postId }],
        w.owner,
      );
      const scan = await scanning.interactionSummary(
        w.boxId,
        w.postId,
        w.owner,
      );
      expect(fast?.commentCount).toBe(0);
      expect(scan.commentCount).toBe(1);
      expect((await index.check(w.boxId, w.postId)).ok).toBe(false);
      expect((await jobRef(w.postId).get()).exists).toBe(false);
      await index.repair(w.boxId, w.postId);
      expect(await same(w.boxId, w.postId, w.owner)).toMatchObject({
        commentCount: 1,
        reactionCount: 1,
      });
    });
  },
);
