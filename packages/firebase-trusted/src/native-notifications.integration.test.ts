import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxes } from './native-boxes.js';
import { nativeBlockPairId } from './native-box-invitations.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeNotifications } from './native-notifications.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('Disposable Auth and Firestore emulators required');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `notifications-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const notifications = new NativeNotifications(db);
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

describe('private notification projection', () => {
  it('dedupes activity, rechecks membership and target state, and marks only owned pointers read', async () => {
    const owner = await user();
    const peer = await user();
    const box = await boxes.create(owner, 'Private');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(peer)
      .set({ uid: peer, role: 'member', status: 'active', joinedAt: 1 });
    const postId = await posts.create(box.id, owner, 'Hello');
    const commentId = await posts.createComment(box.id, postId, peer, 'Hi');
    expect(await notifications.processPending()).toBeGreaterThanOrEqual(1);
    expect(await notifications.processPending()).toBe(0);
    const page = await notifications.list(owner);
    expect(page.items).toMatchObject([
      { type: 'post.comment', postId, commentId, actorUid: peer },
    ]);
    expect(await notifications.unreadCount(owner)).toMatchObject({ count: 1 });
    await expect(
      notifications.get(peer, page.items[0]!.id),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await notifications.markRead(owner, page.items[0]!.id);
    expect((await notifications.unreadCount(owner)).count).toBe(0);
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(owner)
      .update({ status: 'removed' });
    expect((await notifications.list(owner)).items).toEqual([]);
  });

  it('counts unread pointers in bounded chunks, excluding blocked, former-member and hidden-post rows, and keeps the cap', async () => {
    const owner = await user();
    const peer = await user();
    const blockedActor = await user();
    const members = (boxId: string) =>
      db.collection('nativeBoxes').doc(boxId).collection('members');
    const box = await boxes.create(owner, 'Counted');
    for (const uid of [peer, blockedActor])
      await members(box.id)
        .doc(uid)
        .set({ uid, role: 'member', status: 'active', joinedAt: 1 });
    const postId = await posts.create(box.id, owner, 'Hello');
    const commentId = await posts.createComment(box.id, postId, peer, 'Hi');
    const former = await boxes.create(peer, 'Left');
    await members(former.id)
      .doc(owner)
      .set({ uid: owner, role: 'member', status: 'active', joinedAt: 1 });
    const formerPostId = await posts.create(former.id, peer, 'Gone');
    await members(former.id).doc(owner).update({ status: 'removed' });
    await db
      .collection('nativeBlockPairs')
      .doc(nativeBlockPairId(owner, blockedActor))
      .set({ blockedBy: [owner], epoch: 1 });

    const items = db
      .collection('nativeNotifications')
      .doc(owner)
      .collection('items');
    let n = 0;
    const row = (actorUid: string, boxId: string, post: string) =>
      items.doc(`row-${String(n++).padStart(4, '0')}`).set({
        schemaVersion: 1,
        type: 'post.comment',
        actorUid,
        boxId,
        postId: post,
        commentId,
        reactionKind: null,
        read: false,
        createdAt: 1_000 + n,
      });
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 60; i += 1) writes.push(row(peer, box.id, postId));
    for (let i = 0; i < 10; i += 1) {
      writes.push(row(blockedActor, box.id, postId));
      writes.push(row(peer, former.id, formerPostId));
      writes.push(row(peer, box.id, randomUUID()));
    }
    await Promise.all(writes);
    expect(await notifications.unreadCount(owner)).toEqual({
      count: 60,
      capped: false,
    });

    const more: Promise<unknown>[] = [];
    for (let i = 0; i < 60; i += 1) more.push(row(peer, box.id, postId));
    await Promise.all(more);
    expect(await notifications.unreadCount(owner)).toEqual({
      count: 100,
      capped: true,
    });
  });
});
