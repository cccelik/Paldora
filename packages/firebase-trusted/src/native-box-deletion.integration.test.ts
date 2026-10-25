import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxDeletion } from './native-box-deletion.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeBoxes } from './native-boxes.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `deletion-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const deletion = new NativeBoxDeletion(db);
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

async function drain(boxId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await deletion.processOnce(boxId, 2_000 + attempt)) === 'complete')
      return;
  }
  throw new Error('Box deletion did not converge');
}

describe('trusted resumable Box deletion', () => {
  it('closes access first and removes text content, invitations, members and hints in batches', async () => {
    const owner = await admittedUser();
    const outsider = await admittedUser();
    const box = await boxes.create(owner, 'Doomed');
    const boxRef = db.collection('nativeBoxes').doc(box.id);
    const postId = await posts.create(box.id, owner, 'Goodbye');
    const commentId = await posts.createComment(
      box.id,
      postId,
      owner,
      'A reply',
    );
    await posts.setReaction(box.id, postId, owner, '❤️', commentId);
    for (let index = 0; index < 27; index += 1) {
      const uid = randomUUID();
      await boxRef
        .collection('members')
        .doc(uid)
        .set({ uid, role: 'member', status: 'active' });
      await db
        .collection('nativeAccounts')
        .doc(uid)
        .collection('boxRefs')
        .doc(box.id)
        .set({ boxId: box.id });
      await db
        .collection('nativeBoxInvitations')
        .doc(randomUUID())
        .set({ boxId: box.id, inviteeUid: uid, status: 'pending' });
    }
    const reportRef = db.collection('nativeReports').doc(randomUUID());
    const activityRef = db.collection('nativeActivity').doc(randomUUID());
    const noticeRef = db.collection('nativeModerationNotices').doc(postId);
    await activityRef.set({ boxId: box.id, status: 'projected' });
    await noticeRef.set({ boxId: box.id, ownerUid: owner, targetKind: 'post' });
    await reportRef.set({
      boxId: box.id,
      postId,
      reporterUid: owner,
      reason: 'reason',
      status: 'open',
      createdAt: 1_000,
      closedAt: null,
    });
    await expect(deletion.start(box.id, owner, 'doomed')).rejects.toMatchObject(
      { code: 'INVALID' },
    );
    await expect(
      deletion.start(box.id, outsider, 'Doomed'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const jobId = await deletion.start(box.id, owner, 'Doomed', 1_000);
    expect(jobId).toBe(`box-delete-${box.id}`);
    expect(await deletion.start(box.id, owner, 'Doomed')).toBe(jobId);
    await expect(boxes.get(box.id, owner)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(posts.get(box.id, postId, owner)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await deletion.processOnce(box.id);
      if ((await reportRef.get()).get('status') === 'closed') break;
    }
    expect((await reportRef.get()).get('status')).toBe('closed');
    await drain(box.id);
    expect((await deletion.status(box.id, owner)).phase).toBe('complete');
    expect((await boxRef.get()).exists).toBe(false);
    expect((await activityRef.get()).exists).toBe(false);
    expect((await noticeRef.get()).exists).toBe(false);
    expect(
      (await db.collection('nativePostPointers').doc(postId).get()).exists,
    ).toBe(false);
    expect(
      (
        await boxRef
          .collection('posts')
          .doc(postId)
          .collection('comments')
          .doc(commentId)
          .get()
      ).exists,
    ).toBe(false);
    expect(
      (
        await db
          .collection('nativeBoxInvitations')
          .where('boxId', '==', box.id)
          .get()
      ).empty,
    ).toBe(true);
    expect(
      (
        await db
          .collection('nativeAccounts')
          .doc(owner)
          .collection('boxRefs')
          .doc(box.id)
          .get()
      ).exists,
    ).toBe(false);
    expect(
      (
        await db
          .collection('nativeModerationAudit')
          .where('boxId', '==', box.id)
          .get()
      ).empty,
    ).toBe(false);
    expect((await reportRef.get()).get('retentionStatus')).toBe('pending');
  });

  it('waits for media, then removes only this Box’s derived references', async () => {
    const owner = await admittedUser();
    const box = await boxes.create(owner, 'Blocked');
    const media = db.collection('nativeMediaAssets').doc(randomUUID());
    const delivery = db
      .collection('nativeLifeUpdateDeliveries')
      .doc(randomUUID());
    await media.set({ boxId: box.id });
    await delivery.set({ boxId: box.id });
    await deletion.start(box.id, owner, 'Blocked');
    await expect(deletion.processOnce(box.id)).rejects.toMatchObject({
      code: 'DEPENDENCY_PENDING',
    });
    expect(await deletion.repairPending(Date.now(), 25)).toContainEqual({
      boxId: box.id,
      phase: 'blockers',
      blocked: true,
    });
    expect((await deletion.status(box.id, owner)).phase).toBe('blockers');
    await media.delete();
    const feedRef = db
      .collection('nativeFeedRefs')
      .doc(owner)
      .collection('items')
      .doc(randomUUID());
    await feedRef.set({ boxId: box.id, postId: randomUUID() });
    const notification = db
      .collection('nativeNotifications')
      .doc(owner)
      .collection('items')
      .doc(randomUUID());
    await notification.set({ boxId: box.id, postId: randomUUID() });
    const unrelated = db
      .collection('nativeFeedRefs')
      .doc(owner)
      .collection('items')
      .doc(randomUUID());
    await unrelated.set({ boxId: randomUUID(), postId: randomUUID() });
    await drain(box.id);
    expect((await feedRef.get()).exists).toBe(false);
    expect((await notification.get()).exists).toBe(false);
    expect((await unrelated.get()).exists).toBe(true);
    await unrelated.delete();
    expect((await delivery.get()).exists).toBe(false);
    expect((await deletion.status(box.id, owner)).phase).toBe('complete');
  });

  it('retires every private Box object before discarding metadata and resumes after failure', async () => {
    const owner = await admittedUser();
    const box = await boxes.create(owner, 'With media');
    const path = `private/boxes/${box.id}/photo.webp`;
    const media = db.collection('nativeMediaAssets').doc(randomUUID());
    await media.set({ boxId: box.id, objectPaths: [path] });
    const removed: string[] = [];
    let fail = true;
    const withStorage = new NativeBoxDeletion(db, async (candidate) => {
      if (fail) throw new Error('storage unavailable');
      removed.push(candidate);
    });
    await withStorage.start(box.id, owner, 'With media');
    await expect(withStorage.processOnce(box.id)).rejects.toThrow(
      'storage unavailable',
    );
    expect((await media.get()).exists).toBe(true);
    fail = false;
    await withStorage.processOnce(box.id);
    expect(removed).toEqual([path]);
    expect((await media.get()).exists).toBe(false);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((await withStorage.processOnce(box.id)) === 'complete') break;
    }
    expect((await withStorage.status(box.id, owner)).phase).toBe('complete');
    expect((await db.collection('nativeBoxes').doc(box.id).get()).exists).toBe(
      false,
    );
  });

  it('holds deletion for an unrecognized Box-linked derived collection', async () => {
    const owner = await admittedUser();
    const box = await boxes.create(owner, 'Unknown');
    const unknown = db
      .collection('otherProjection')
      .doc(owner)
      .collection('items')
      .doc(randomUUID());
    await unknown.set({ boxId: box.id });
    await deletion.start(box.id, owner, 'Unknown');
    await deletion.processOnce(box.id);
    await expect(deletion.processOnce(box.id)).rejects.toMatchObject({
      code: 'DEPENDENCY_PENDING',
    });
    expect(await deletion.repairPending(Date.now(), 25)).toContainEqual({
      boxId: box.id,
      phase: 'derived_refs',
      blocked: true,
    });
    expect((await unknown.get()).exists).toBe(true);
    await unknown.delete();
    await drain(box.id);
  });

  it('detaches only the deleted Box and tombstones the final delivery', async () => {
    const owner = await admittedUser();
    const one = await boxes.create(owner, 'First');
    const two = await boxes.create(owner, 'Second');
    const updates = new (
      await import('./native-life-updates.js')
    ).NativeLifeUpdates(db);
    const id = await updates.create(owner, {
      audience: { type: 'boxes', boxIds: [one.id, two.id] },
      sections: { travel: 'A shared story' },
    });
    const { NativeHomeFeed } = await import('./native-home-feed.js');
    const home = new NativeHomeFeed(db);
    for (const context of (await updates.get(id, owner)).contexts)
      await home.processOnce(NativeHomeFeed.publishJobId(context.postId));
    const feedRef = db
      .collection('nativeFeedRefs')
      .doc(owner)
      .collection('items')
      .doc(`l_${id}`);
    expect((await feedRef.get()).get('boxIds')).toEqual(
      expect.arrayContaining([one.id, two.id]),
    );
    await deletion.start(one.id, owner, 'First');
    await drain(one.id);
    expect((await feedRef.get()).get('boxIds')).toEqual([two.id]);
    expect(
      (await updates.get(id, owner)).contexts.map((context) => context.boxId),
    ).toEqual([two.id]);
    await deletion.start(two.id, owner, 'Second');
    await drain(two.id);
    expect((await feedRef.get()).exists).toBe(false);
    await expect(updates.get(id, owner)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(
      (await db.collection('nativeLifeUpdates').doc(id).get()).get('sections'),
    ).toEqual({});
  });

  it('serializes ownership transfer against deletion start', async () => {
    const owner = await admittedUser();
    const successor = await admittedUser();
    const box = await boxes.create(owner, 'Race');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(successor)
      .set({ uid: successor, role: 'member', status: 'active' });
    const results = await Promise.allSettled([
      deletion.start(box.id, owner, 'Race'),
      boxes.transfer(box.id, owner, successor),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const saved = await db.collection('nativeBoxes').doc(box.id).get();
    if (saved.get('status') === 'deleting') {
      expect(saved.get('ownerUid')).toBe(owner);
      await drain(box.id);
    } else {
      expect(saved.get('ownerUid')).toBe(successor);
      expect(await deletion.status(box.id, owner).catch(() => null)).toBeNull();
    }
  });
});
