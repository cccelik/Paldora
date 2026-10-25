import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBlockPairs } from './native-block-pairs.js';
import { NativeBoxInvitations } from './native-box-invitations.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeHomeFeed } from './native-home-feed.js';
import { NativeLifeUpdates } from './native-life-updates.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `home-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const updates = new NativeLifeUpdates(db);
const invitations = new NativeBoxInvitations(db);
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

async function join(boxId: string, owner: string, guest: string, now: number) {
  const invite = await invitations.invite(boxId, owner, guest, now - 1);
  await invitations.accept(invite, guest, now);
}

describe('ID-only Home feed and durable reference repair', () => {
  it('pages across more than thirty Box memberships without a fan-in query', async () => {
    const member = await user();
    const batch = db.batch();
    const ids: string[] = [];
    for (let index = 0; index < 35; index++) {
      const boxId = randomUUID();
      const postId = randomUUID();
      const at = Date.parse('2025-06-01T00:00:00Z') + index;
      ids.push(postId);
      const box = db.collection('nativeBoxes').doc(boxId);
      batch.set(box, {
        name: `Box ${index}`,
        ownerUid: member,
        status: 'active',
      });
      batch.set(box.collection('members').doc(member), {
        uid: member,
        role: 'owner',
        status: 'active',
        joinedAt: 1,
      });
      batch.set(box.collection('posts').doc(postId), {
        boxId,
        authorUid: member,
        text: `Post ${index}`,
        kind: 'post',
        status: 'active',
        moderationHidden: false,
        createdAt: at,
        updatedAt: at,
      });
      batch.set(
        db
          .collection('nativeFeedRefs')
          .doc(member)
          .collection('items')
          .doc(`p_${postId}`),
        {
          kind: 'post',
          contentId: postId,
          authorUid: member,
          boxId,
          createdAt: at,
          schemaVersion: 2,
        },
      );
    }
    await batch.commit();
    const first = await home.page(member, undefined, 20);
    const second = await home.page(member, first.nextCursor!, 20);
    expect(first.items.map((item) => item.id)).toEqual(ids.slice(15).reverse());
    expect(second.items.map((item) => item.id)).toEqual(
      ids.slice(0, 15).reverse(),
    );
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(35);
  });
  it('fans out posts, backfills on joining, paginates, and rechecks access', async () => {
    const owner = await user();
    const guest = await user();
    const box = await boxes.create(owner, 'Home');
    const old = await posts.create(box.id, owner, 'Old', 1_000);
    const middle = await posts.create(box.id, owner, 'Middle', 2_000);
    await home.processOnce(NativeHomeFeed.publishJobId(old));
    await home.processOnce(NativeHomeFeed.publishJobId(middle));
    expect((await home.page(owner)).items.map((item) => item.id)).toEqual([
      middle,
      old,
    ]);
    expect((await home.page(guest)).items).toEqual([]);

    await join(box.id, owner, guest, 3_000);
    const newest = await posts.create(box.id, owner, 'Newest', 4_000);
    await home.processOnce(NativeHomeFeed.joinJobId(box.id, guest, 3_000));
    await home.processOnce(NativeHomeFeed.publishJobId(newest));
    const first = await home.page(guest, undefined, 2);
    expect(first.items.map((item) => item.id)).toEqual([newest, middle]);
    expect(first.nextCursor).toBeTruthy();
    expect(
      (await home.page(guest, first.nextCursor!, 2)).items.map(
        (item) => item.id,
      ),
    ).toEqual([old]);

    await posts.remove(box.id, middle, owner);
    expect((await home.page(guest)).items.map((item) => item.id)).toEqual([
      newest,
      old,
    ]);
    await home.processOnce(NativeHomeFeed.unpublishJobId(middle));
    expect(
      (
        await db
          .collection('nativeFeedRefs')
          .doc(guest)
          .collection('items')
          .doc(`p_${middle}`)
          .get()
      ).exists,
    ).toBe(false);
    await blocks.setBlocked(guest, owner, true);
    expect((await home.page(guest)).items).toEqual([]);
    await blocks.setBlocked(guest, owner, false);
    await boxes.removeMember(box.id, guest, guest);
    expect((await home.page(guest)).items).toEqual([]);
    const jobs = await db.collection('nativeJobs').get();
    const leaveJob = jobs.docs.find(
      (job) =>
        job.get('mode') === 'leave' &&
        job.get('boxId') === box.id &&
        job.get('uid') === guest,
    );
    expect(leaveJob).toBeDefined();
    await home.processOnce(leaveJob!.id);
    expect(
      (
        await db
          .collection('nativeFeedRefs')
          .doc(guest)
          .collection('items')
          .get()
      ).empty,
    ).toBe(true);
    await expect(home.page(guest, 'bad')).rejects.toMatchObject({
      code: 'INVALID',
    });
  });

  it('deduplicates multi-Box Life Updates and keeps remaining context after one Box is unavailable', async () => {
    const author = await user();
    const reader = await user();
    const one = await boxes.create(author, 'One');
    const two = await boxes.create(author, 'Two');
    await join(one.id, author, reader, 1_000);
    await join(two.id, author, reader, 1_001);
    const updateId = await updates.create(
      author,
      {
        audience: { type: 'boxes', boxIds: [one.id, two.id] },
        sections: { lifeLately: 'Hello' },
      },
      2_000,
    );
    const privateId = await updates.create(
      author,
      { audience: { type: 'only_me' }, sections: { travel: 'Private' } },
      2_001,
    );
    const contexts = (await updates.get(updateId, author)).contexts;
    for (const context of contexts)
      await home.processOnce(NativeHomeFeed.publishJobId(context.postId));
    expect(
      (await home.page(reader)).items.filter(
        (item) => item.lifeUpdateId === updateId,
      ),
    ).toHaveLength(1);
    expect(
      (await home.page(author)).items.some(
        (item) => item.lifeUpdateId === privateId,
      ),
    ).toBe(false);
    const hint = await db
      .collection('nativeFeedRefs')
      .doc(reader)
      .collection('items')
      .doc(`l_${updateId}`)
      .get();
    expect(hint.get('boxIds')).toEqual(
      expect.arrayContaining([one.id, two.id]),
    );
    expect(hint.get('sections')).toBeUndefined();
    await db
      .collection('nativeBoxes')
      .doc(one.id)
      .update({ status: 'deleting' });
    expect(
      (await home.page(reader)).items.filter(
        (item) => item.lifeUpdateId === updateId,
      ),
    ).toHaveLength(1);
    await updates.remove(updateId, author);
    expect((await home.page(reader)).items).toEqual([]);
    for (const context of contexts)
      await home.processOnce(NativeHomeFeed.unpublishJobId(context.postId));
    expect(
      (
        await db
          .collection('nativeFeedRefs')
          .doc(reader)
          .collection('items')
          .doc(`l_${updateId}`)
          .get()
      ).exists,
    ).toBe(false);
  });

  it('advances past hidden-heavy candidates and retries a completed job idempotently', async () => {
    const owner = await user();
    const box = await boxes.create(owner, 'Hidden');
    const ids = await Promise.all(
      Array.from({ length: 45 }, (_, i) =>
        posts.create(box.id, owner, `Post ${i}`, i + 1),
      ),
    );
    for (const id of ids)
      await home.processOnce(NativeHomeFeed.publishJobId(id));
    for (const id of ids.slice(5)) await posts.remove(box.id, id, owner);
    const page = await home.page(owner, undefined, 5);
    expect(page.items).toHaveLength(5);
    expect(page.items.map((item) => item.id)).toEqual(
      ids.slice(0, 5).reverse(),
    );
    expect(await home.processOnce(NativeHomeFeed.publishJobId(ids[0]!))).toBe(
      'complete',
    );
    expect((await home.page(owner)).items).toHaveLength(5);
  });
});
