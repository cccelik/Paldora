import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { REAL_REACTION_KIND } from '@paldora/domain';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeInteractionIndex } from './native-interaction-index.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `interaction-index-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const index = new NativeInteractionIndex(db);
afterAll(() => deleteApp(app));

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

async function fixture(extraMembers: number) {
  const owner = await admittedUser();
  const box = await boxes.create(owner, 'Index');
  const members = [owner];
  for (let i = 0; i < extraMembers; i += 1) {
    const uid = await admittedUser();
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(uid)
      .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
    members.push(uid);
  }
  const postId = await posts.create(box.id, owner, 'Indexed');
  const postRef = db
    .collection('nativeBoxes')
    .doc(box.id)
    .collection('posts')
    .doc(postId);
  return { owner, boxId: box.id, postId, postRef, members };
}

describe('post interaction index', () => {
  it('stays consistent across comments, deletes and every reaction transition', async () => {
    const { boxId, postId, postRef, members } = await fixture(1);
    const [owner, peer] = members as [string, string];
    expect((await postRef.get()).get('interactionIndex')).toEqual({
      v: 1,
      comments: {},
      reactions: {},
    });
    const first = await posts.createComment(boxId, postId, owner, 'one');
    await posts.createComment(boxId, postId, peer, 'two', first);
    const third = await posts.createComment(boxId, postId, peer, 'three');
    await posts.deleteComment(boxId, postId, third, peer);
    await posts.setReaction(boxId, postId, owner, '👍');
    await posts.setReaction(boxId, postId, owner, '🎉');
    const assetId = randomUUID();
    await db.collection('nativeMediaAssets').doc(assetId).set({
      status: 'ready',
      purpose: 'reaction_image',
      boxId,
      ownerUid: peer,
    });
    await posts.setReaction(boxId, postId, peer, REAL_REACTION_KIND, {
      mediaAssetId: assetId,
    });
    const raw = (await postRef.get()).get('interactionIndex');
    expect(raw).toEqual({
      v: 1,
      comments: { [owner]: 1, [peer]: 1 },
      reactions: {
        [owner]: { kind: '🎉' },
        [peer]: { kind: REAL_REACTION_KIND, mediaAssetId: assetId },
      },
    });
    expect((await index.check(boxId, postId)).ok).toBe(true);
    await posts.setReaction(boxId, postId, peer, null);
    await posts.setReaction(boxId, postId, owner, null);
    expect((await index.check(boxId, postId)).ok).toBe(true);
    expect((await postRef.get()).get('interactionIndex.reactions')).toEqual({});
  });

  it('does not decrement for a comment that was moderation-hidden', async () => {
    const { boxId, postId, postRef, owner } = await fixture(0);
    const id = await posts.createComment(boxId, postId, owner, 'hide me');
    await postRef.collection('comments').doc(id).update({
      moderationHidden: true,
    });
    await postRef.update({
      interactionIndex: { v: 1, comments: {}, reactions: {} },
    });
    // Hidden comments are not active-visible, so the index already excludes it.
    await expect(
      posts.deleteComment(boxId, postId, id, owner),
    ).resolves.toBeUndefined();
    expect((await index.check(boxId, postId)).ok).toBe(true);
  });

  it('survives concurrent reactions and comment churn', async () => {
    const { boxId, postId, members } = await fixture(9);
    const seeded: string[] = [];
    for (let i = 0; i < 6; i += 1)
      seeded.push(
        await posts.createComment(boxId, postId, members[i % 10]!, `s${i}`),
      );
    const kinds = ['👍', '🎉', '❤️', null, '😂'];
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 16; i += 1)
      jobs.push(
        posts.setReaction(
          boxId,
          postId,
          members[i % 10]!,
          kinds[i % kinds.length]!,
        ),
      );
    for (let i = 0; i < 6; i += 1) {
      jobs.push(posts.createComment(boxId, postId, members[i % 10]!, `n${i}`));
      jobs.push(
        posts.deleteComment(boxId, postId, seeded[i]!, members[i % 10]!),
      );
    }
    const results = await Promise.allSettled(jobs);
    const aborted = results.filter((r) => r.status === 'rejected');
    // With HOT_POST_ATTEMPTS retries a burst serialises instead of failing.
    console.info(`index concurrency: ${aborted.length}/${jobs.length} aborted`);
    expect(aborted).toHaveLength(0);
    const check = await index.check(boxId, postId);
    expect(check.diffs).toEqual([]);
    expect(check.ok).toBe(true);
  }, 90_000);

  it('never exposes interactionIndex through toPost or getMany', async () => {
    const { boxId, postId, owner } = await fixture(0);
    const one = await posts.get(boxId, postId, owner);
    const [many] = await posts.getMany([{ boxId, postId }], owner);
    expect(one).not.toHaveProperty('interactionIndex');
    expect(many).not.toHaveProperty('interactionIndex');
    expect(JSON.stringify(many)).not.toContain('interactionIndex');
  });

  it('repair rebuilds a corrupted index and clears a stale uid', async () => {
    const { boxId, postId, postRef, owner } = await fixture(0);
    await posts.createComment(boxId, postId, owner, 'real');
    await posts.setReaction(boxId, postId, owner, '👍');
    await postRef.update({
      interactionIndex: {
        v: 1,
        comments: { [owner]: 7, erased: 2 },
        reactions: { erased: { kind: '🎉' } },
      },
    });
    const broken = await index.check(boxId, postId);
    expect(broken.ok).toBe(false);
    expect(broken.extra).toContain('erased');
    await expect(index.repair(boxId, postId)).resolves.toEqual({
      status: 'repaired',
    });
    expect((await postRef.get()).get('interactionIndex')).toEqual({
      v: 1,
      comments: { [owner]: 1 },
      reactions: { [owner]: { kind: '👍' } },
    });
    expect((await index.check(boxId, postId)).ok).toBe(true);
  });

  it('self-heals an unknown version on the next write and backfills pages', async () => {
    const { boxId, postId, postRef, owner } = await fixture(0);
    await postRef.update({ interactionIndex: { v: 2, whatever: true } });
    await posts.createComment(boxId, postId, owner, 'x');
    expect((await postRef.get()).get('interactionIndex')).toBeUndefined();
    let cursor: string | null = null;
    do {
      const page = await index.backfillPage(cursor, 100);
      cursor = page.nextCursor;
    } while (cursor);
    expect((await index.check(boxId, postId)).ok).toBe(true);
  });
});
