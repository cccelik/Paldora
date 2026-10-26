import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_WIDGETS } from '@paldora/domain';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxes } from './native-boxes.js';
import { nativeBlockPairId } from './native-box-invitations.js';
import { NativeRooms } from './native-rooms.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('Disposable Firebase emulators required');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `rooms-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const rooms = new NativeRooms(db);
afterAll(() => deleteApp(app));

async function person(username: string) {
  const uid = randomUUID();
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
  return uid;
}

describe('trusted Room policy and versioned writes', () => {
  it('hides default Rooms, allows friends, and rechecks block and shared-Box access', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const viewer = await person(`viewer${randomUUID().slice(0, 8)}`);
    const outsider = await person(`outside${randomUUID().slice(0, 8)}`);
    const ownerName = (
      await db.collection('nativeAccounts').doc(owner).get()
    ).get('username') as string;
    expect(await rooms.get(owner)).toMatchObject({
      relationship: 'owner',
      visibility: 'friends',
      updatedAt: null,
    });
    await expect(rooms.get(viewer, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const pairId = nativeBlockPairId(owner, viewer);
    await db
      .collection('nativeFriendPairs')
      .doc(pairId)
      .set({ users: [owner, viewer].sort(), status: 'accepted' });
    expect(await rooms.get(viewer, ownerName)).toMatchObject({
      relationship: 'friend',
      visibility: null,
      updatedAt: null,
    });
    await db
      .collection('nativeBlockPairs')
      .doc(pairId)
      .set({ blockedBy: [viewer], epoch: 1 });
    await expect(rooms.get(viewer, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await db.collection('nativeBlockPairs').doc(pairId).delete();

    const first = await rooms.update(owner, {
      visibility: 'members',
      expectedUpdatedAt: null,
    });
    expect(first.visibility).toBe('members');
    const box = await boxes.create(owner, 'Shared');
    const boxRef = db.collection('nativeBoxes').doc(box.id);
    await boxRef
      .collection('members')
      .doc(outsider)
      .set({ uid: outsider, status: 'active', role: 'member' });
    await db
      .collection('nativeAccounts')
      .doc(outsider)
      .collection('boxRefs')
      .doc(box.id)
      .set({ boxId: box.id });
    expect((await rooms.get(outsider, ownerName)).relationship).toBe('member');
    await boxRef
      .collection('members')
      .doc(outsider)
      .update({ status: 'removed' });
    await expect(rooms.get(outsider, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await rooms.update(owner, {
      visibility: 'hidden',
      expectedUpdatedAt: first.updatedAt,
    });
    await expect(rooms.get(viewer, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('finds a shared Box beyond the first page of hints, and ignores one the owner left', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const viewer = await person(`viewer${randomUUID().slice(0, 8)}`);
    const ownerName = (
      await db.collection('nativeAccounts').doc(owner).get()
    ).get('username') as string;
    await rooms.update(owner, {
      visibility: 'members',
      expectedUpdatedAt: null,
    });
    const refs = db
      .collection('nativeAccounts')
      .doc(viewer)
      .collection('boxRefs');
    // 50 stale hints sort before the real shared Box, so it is the 51st hint.
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        refs.doc(`-decoy-${String(i).padStart(2, '0')}`).set({ boxId: 'x' }),
      ),
    );
    const box = await boxes.create(owner, 'Late');
    const boxRef = db.collection('nativeBoxes').doc(box.id);
    await boxRef
      .collection('members')
      .doc(viewer)
      .set({ uid: viewer, status: 'active', role: 'member' });
    await refs.doc(box.id).set({ boxId: box.id });
    expect((await rooms.get(viewer, ownerName)).relationship).toBe('member');
    await boxRef.collection('members').doc(owner).update({ status: 'removed' });
    await expect(rooms.get(viewer, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('uses one stale version across settings, widgets, Top Friends and safe personalization', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const friend = await person(`friend${randomUUID().slice(0, 8)}`);
    const pairId = nativeBlockPairId(owner, friend);
    await db
      .collection('nativeFriendPairs')
      .doc(pairId)
      .set({ users: [owner, friend].sort(), status: 'accepted' });
    const first = await rooms.update(owner, {
      themePreset: 'obsidian_gold',
      expectedUpdatedAt: null,
    });
    expect(first.style.themePreset).toBe('obsidian_gold');
    await expect(
      rooms.update(owner, { visibility: 'hidden', expectedUpdatedAt: null }),
    ).rejects.toMatchObject({ code: 'STALE' });
    const widgets = DEFAULT_ROOM_WIDGETS.map((widget) => ({
      ...widget,
      enabled: widget.type !== 'photos',
    }));
    const second = await rooms.updateWidgets(owner, {
      widgets,
      expectedUpdatedAt: first.updatedAt,
    });
    expect(
      second.widgets.find((widget) => widget.type === 'photos')?.enabled,
    ).toBe(false);
    const third = await rooms.updateTopFriends(owner, {
      userIds: [friend],
      size: 4,
      visibility: 'visible',
      expectedUpdatedAt: second.updatedAt,
    });
    expect(third.topFriends.items?.map((item) => item.id)).toEqual([friend]);
    await expect(
      rooms.updateTopFriends(owner, {
        userIds: [randomUUID()],
        size: 4,
        visibility: 'visible',
        expectedUpdatedAt: third.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'FRIEND_INELIGIBLE' });
    const fourth = await rooms.updatePersonalization(owner, {
      cssSource: '.room-title { font-weight: 700 }',
      widgets: [{ title: 'Hello', source: '<p>Safe</p>' }],
      expectedUpdatedAt: third.updatedAt,
    });
    expect(fourth.updatedAt).not.toBe(third.updatedAt);
    const ownerName = fourth.owner.username;
    expect(
      (await rooms.personalizationRendered(owner, ownerName)).css,
    ).toContain('font-weight');
    await expect(
      rooms.updatePersonalization(owner, {
        cssSource: 'body { background: red }',
        widgets: [],
        expectedUpdatedAt: fourth.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect((await rooms.personalizationSource(owner)).widgets).toHaveLength(1);
  });
  it('lets exactly one of two concurrent writes with the same expectedUpdatedAt win', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const base = await rooms.update(owner, {
      visibility: 'members',
      expectedUpdatedAt: null,
    });
    const results = await Promise.allSettled([
      rooms.update(owner, {
        location: 'Paris',
        expectedUpdatedAt: base.updatedAt,
      }),
      rooms.update(owner, {
        currently: 'Reading',
        expectedUpdatedAt: base.updatedAt,
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected');
    expect(lost).toMatchObject({ reason: { code: 'STALE' } });
    const final = await rooms.get(owner);
    expect([final.location, final.currently].filter(Boolean)).toHaveLength(1);
  });

  it('treats a stale write that changes nothing as an idempotent success', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const first = await rooms.update(owner, {
      location: 'Paris',
      expectedUpdatedAt: null,
    });
    await rooms.update(owner, {
      currently: 'Reading',
      expectedUpdatedAt: first.updatedAt,
    });
    // No-op against current state (e.g. a retried request) succeeds without a
    // version bump, even with a stale token; any real change is still STALE.
    const retry = await rooms.update(owner, {
      location: 'Paris',
      expectedUpdatedAt: first.updatedAt,
    });
    expect(retry.currently).toBe('Reading');
    await expect(
      rooms.update(owner, {
        location: 'Rome',
        expectedUpdatedAt: first.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'STALE' });
  });

  it('does not attach banner media on a stale write', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const first = await rooms.update(owner, {
      location: 'Paris',
      expectedUpdatedAt: null,
    });
    await rooms.update(owner, {
      currently: 'Reading',
      expectedUpdatedAt: first.updatedAt,
    });
    const assetId = randomUUID();
    const assetRef = db.collection('nativeMediaAssets').doc(assetId);
    await assetRef.set({
      status: 'ready',
      purpose: 'room_banner',
      ownerUid: owner,
      attachedRoomUid: null,
    });
    await expect(
      rooms.update(owner, {
        bannerMediaId: assetId,
        expectedUpdatedAt: first.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'STALE' });
    expect((await assetRef.get()).get('attachedRoomUid')).toBeNull();
  });
});
