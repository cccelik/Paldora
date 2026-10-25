import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeBlockPairs } from './native-block-pairs.js';
import { nativeBlockPairId } from './native-box-invitations.js';

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires the disposable Firestore emulator');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `blocks-${randomUUID()}`,
);
const db = getFirestore(app);
const blocks = new NativeBlockPairs(db);
afterAll(() => deleteApp(app));

describe('trusted blocked-user management', () => {
  it('resolves a username, closes friendship and lists only the actor’s current blocks', async () => {
    const actor = randomUUID();
    const target = randomUUID();
    const other = randomUUID();
    const pairId = nativeBlockPairId(actor, target);
    const batch = db.batch();
    for (const uid of [actor, target, other])
      batch.set(db.collection('nativeAccounts').doc(uid), {
        status: 'active',
        username: uid === target ? 'jules' : uid,
      });
    batch.set(db.collection('nativeProfiles').doc(target), {
      displayName: 'Jules',
    });
    batch.set(db.collection('nativeUsernames').doc('jules'), { uid: target });
    batch.set(db.collection('nativeFriendPairs').doc(pairId), {
      users: [actor, target].sort(),
      status: 'accepted',
    });
    await batch.commit();
    expect(await blocks.blockByUsername(actor, ' JuLeS ', 1_000)).toBe(target);
    expect(
      (await db.collection('nativeFriendPairs').doc(pairId).get()).get(
        'status',
      ),
    ).toBe('blocked');
    expect((await blocks.list(actor)).items).toEqual([
      {
        userId: target,
        username: 'jules',
        displayName: 'Jules',
        blockedAt: 1_000,
      },
    ]);
    expect((await blocks.list(target)).items).toEqual([]);
    await expect(
      blocks.list(actor, nativeBlockPairId(actor, other)),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await blocks.setBlocked(actor, target, false, 2_000);
    expect((await blocks.list(actor)).items).toEqual([]);
    await blocks.setBlocked(actor, target, true, 3_000);
    expect((await blocks.list(actor)).items[0]?.blockedAt).toBe(3_000);
    expect(
      (await db.collection('nativeBlockPairs').doc(pairId).get()).get('epoch'),
    ).toBe(2);
  });

  it('rejects stale username reservations and cannot add a block for an inactive target', async () => {
    const actor = randomUUID();
    const target = randomUUID();
    await db.collection('nativeAccounts').doc(actor).set({ status: 'active' });
    await db
      .collection('nativeAccounts')
      .doc(target)
      .set({ status: 'suspended' });
    await db.collection('nativeUsernames').doc('stale').set({ uid: target });
    await expect(blocks.blockByUsername(actor, 'stale')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await db
      .collection('nativeAccounts')
      .doc(target)
      .update({ status: 'active' });
    await expect(
      blocks.setBlocked(actor, target, true, 1_000, 'wrong'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await db
      .collection('nativeUsernames')
      .doc('stale')
      .update({ uid: randomUUID() });
    await expect(
      blocks.setBlocked(actor, target, true, 1_000, 'stale'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
