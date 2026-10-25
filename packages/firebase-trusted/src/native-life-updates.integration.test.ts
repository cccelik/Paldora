import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxPosts } from './native-box-posts.js';
import { nativeBlockPairId } from './native-box-invitations.js';
import { NativeBoxes } from './native-boxes.js';
import { NativeLifeUpdates } from './native-life-updates.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `updates-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const posts = new NativeBoxPosts(db);
const updates = new NativeLifeUpdates(db);
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

async function join(boxId: string, uid: string) {
  await db
    .collection('nativeBoxes')
    .doc(boxId)
    .collection('members')
    .doc(uid)
    .set({ uid, role: 'member', status: 'active' });
}

describe('canonical Life Updates', () => {
  it('keeps Only Me private and permits section edits without changing audience', async () => {
    const owner = await admittedUser();
    const other = await admittedUser();
    const id = await updates.create(
      owner,
      {
        audience: { type: 'only_me' },
        sections: { travel: '  Paris  ' },
      },
      1_000,
    );
    expect(await updates.get(id, owner)).toMatchObject({
      audience: 'only_me',
      sections: { travel: 'Paris' },
      contexts: [],
      canEdit: true,
    });
    await expect(updates.get(id, other)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(
      updates.edit(id, owner, { sections: {} }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    await updates.edit(id, owner, { sections: { reading: 'Novel' } }, 2_000);
    expect((await updates.get(id, owner)).sections).toEqual({
      reading: 'Novel',
    });
    expect(
      (await updates.listMine(owner)).items.map((item) => item.id),
    ).toEqual([id]);
    await updates.remove(id, owner);
    await updates.remove(id, owner);
    await expect(updates.get(id, owner)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect((await updates.listMine(owner)).items).toEqual([]);
  });

  it('publishes one canonical update with separate current Box contexts', async () => {
    const author = await admittedUser();
    const reader = await admittedUser();
    const outsider = await admittedUser();
    const one = await boxes.create(author, 'One');
    const two = await boxes.create(author, 'Two');
    await join(one.id, reader);
    const id = await updates.create(
      author,
      {
        audience: { type: 'boxes', boxIds: [one.id, two.id] },
        sections: { lifeLately: 'Hello' },
      },
      1_000,
    );
    const view = await updates.get(id, reader);
    expect(view.contexts).toHaveLength(1);
    expect(view.contexts[0]?.boxId).toBe(one.id);
    await expect(updates.get(id, outsider)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect((await updates.get(id, author)).contexts).toHaveLength(2);
    const postId = view.contexts[0]!.postId;
    expect(await posts.resolve(postId, author)).toMatchObject({
      kind: 'life_update',
      lifeUpdateId: id,
      post: { id: postId, boxId: one.id },
    });
    await expect(
      posts.edit(one.id, postId, author, 'Bypass'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await join(two.id, reader);
    expect((await updates.get(id, reader)).contexts).toHaveLength(2);
    await db
      .collection('nativeBoxes')
      .doc(one.id)
      .collection('members')
      .doc(reader)
      .delete();
    expect(
      (await updates.get(id, reader)).contexts.map((context) => context.boxId),
    ).toEqual([two.id]);
    await db
      .collection('nativeBoxes')
      .doc(two.id)
      .collection('members')
      .doc(reader)
      .delete();
    await expect(updates.get(id, reader)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await updates.remove(id, author);
    expect(
      (await db.collection('nativePostPointers').doc(postId).get()).exists,
    ).toBe(false);
    await expect(posts.get(one.id, postId, author)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('rejects archived targets atomically and revokes blocked or hidden deliveries', async () => {
    const author = await admittedUser();
    const reader = await admittedUser();
    const one = await boxes.create(author, 'Open');
    const two = await boxes.create(author, 'Closed');
    await join(one.id, reader);
    await boxes.update(two.id, author, { status: 'archived' });
    await expect(
      updates.create(author, {
        audience: { type: 'boxes', boxIds: [one.id, two.id] },
        sections: { travel: 'No' },
      }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(
      (
        await db
          .collection('nativeLifeUpdateDeliveries')
          .where('boxId', '==', one.id)
          .get()
      ).empty,
    ).toBe(true);
    const id = await updates.create(author, {
      audience: { type: 'boxes', boxIds: [one.id] },
      sections: { travel: 'Yes' },
    });
    const postId = (await updates.get(id, reader)).contexts[0]!.postId;
    await db
      .collection('nativeBoxes')
      .doc(one.id)
      .collection('posts')
      .doc(postId)
      .update({ moderationHidden: true });
    await expect(updates.get(id, reader)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await db
      .collection('nativeBoxes')
      .doc(one.id)
      .collection('posts')
      .doc(postId)
      .update({ moderationHidden: false });
    const pairId = nativeBlockPairId(author, reader);
    await db
      .collection('nativeBlockPairs')
      .doc(pairId)
      .set({ blockedBy: [author] });
    await expect(updates.get(id, reader)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });
});
