import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxDeletion } from './native-box-deletion.js';
import { NativeBoxes } from './native-boxes.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `boxes-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
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

describe('trusted Box lifecycle', () => {
  it('honors bounded web page sizes and returns a usable cursor', async () => {
    const owner = await admittedUser();
    const created = await Promise.all([
      boxes.create(owner, 'One'),
      boxes.create(owner, 'Two'),
      boxes.create(owner, 'Three'),
    ]);
    const first = await boxes.list(owner, undefined, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await boxes.list(owner, first.nextCursor!, 2);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      [...first.items, ...second.items].map((box) => box.id).sort(),
    ).toEqual(created.map((box) => box.id).sort());
  });

  it('creates a private Box and enforces ownership, transfer and removal', async () => {
    const owner = await admittedUser();
    const next = await admittedUser();
    const outsider = await admittedUser();
    const box = await boxes.create(owner, '  Friends  ');
    expect(box).toMatchObject({ name: 'Friends', ownerUid: owner, version: 1 });
    expect(box).toMatchObject({ currentUserRole: 'owner', memberCount: 1 });
    expect((await boxes.list(owner)).items.map((item) => item.id)).toEqual([
      box.id,
    ]);
    await expect(boxes.get(box.id, outsider)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(
      boxes.update(box.id, outsider, { name: 'Hijacked' }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(boxes.transfer(box.id, owner, outsider)).rejects.toMatchObject(
      { code: 'UNAVAILABLE' },
    );
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(next)
      .set({ uid: next, role: 'member', status: 'active' });
    await db
      .collection('nativeAccounts')
      .doc(next)
      .collection('boxRefs')
      .doc(box.id)
      .set({ boxId: box.id });
    await db.collection('nativeBoxes').doc(box.id).update({ memberCount: 2 });
    await boxes.transfer(box.id, owner, next);
    expect(await boxes.get(box.id, owner)).toMatchObject({
      ownerUid: next,
      version: 2,
      currentUserRole: 'admin',
    });
    await expect(
      boxes.update(box.id, owner, { status: 'archived' }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(
      await boxes.update(box.id, next, { status: 'archived' }),
    ).toMatchObject({ status: 'archived', version: 3 });
    await expect(
      boxes.changeRole(box.id, next, owner, 'member'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await boxes.update(box.id, next, { status: 'active' });
    await boxes.changeRole(box.id, next, owner, 'member');
    await boxes.removeMember(box.id, next, owner);
    expect((await boxes.get(box.id, next)).memberCount).toBe(1);
    await expect(boxes.get(box.id, owner)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect((await boxes.list(owner)).items).toEqual([]);
    await expect(boxes.removeMember(box.id, next, next)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('rejects suspended actors and stale transfer attempts', async () => {
    const owner = await admittedUser();
    const successor = await admittedUser();
    const box = await boxes.create(owner, 'Safety');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(successor)
      .set({ uid: successor, role: 'member', status: 'active' });
    await boxes.transfer(box.id, owner, successor);
    await expect(
      boxes.transfer(box.id, owner, successor),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await accounts.suspend(successor);
    await expect(boxes.get(box.id, successor)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(
      boxes.update(box.id, successor, { name: 'Nope' }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('serializes ownership transfer against deletion and member removal', async () => {
    const owner = await admittedUser();
    const successor = await admittedUser();
    const box = await boxes.create(owner, 'Race');
    await db
      .collection('nativeBoxes')
      .doc(box.id)
      .collection('members')
      .doc(successor)
      .set({
        uid: successor,
        role: 'member',
        status: 'active',
        joinedAt: Date.now(),
      });
    await db
      .collection('nativeAccounts')
      .doc(successor)
      .collection('boxRefs')
      .doc(box.id)
      .set({ boxId: box.id });
    await db.collection('nativeBoxes').doc(box.id).update({ memberCount: 2 });
    const deletion = new NativeBoxDeletion(db);
    const results = await Promise.allSettled([
      boxes.transfer(box.id, owner, successor),
      deletion.start(box.id, owner, 'Race'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const state = await db.collection('nativeBoxes').doc(box.id).get();
    if (state.get('status') === 'deleting') {
      expect(state.get('ownerUid')).toBe(owner);
      await expect(boxes.get(box.id, owner)).rejects.toMatchObject({
        code: 'UNAVAILABLE',
      });
      for (let step = 0; step < 30; step += 1) {
        if ((await deletion.processOnce(box.id)) === 'complete') break;
      }
      expect((await deletion.status(box.id, owner)).phase).toBe('complete');
    } else {
      expect(state.get('ownerUid')).toBe(successor);
      expect(await boxes.get(box.id, successor)).toMatchObject({
        currentUserRole: 'owner',
      });
      await expect(
        boxes.removeMember(box.id, owner, successor),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    }
  });
});
