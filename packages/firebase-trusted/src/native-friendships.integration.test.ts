import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeBlockPairs } from './native-block-pairs.js';
import { NativeFriendships } from './native-friendships.js';

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires the disposable Firestore emulator');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `friends-${randomUUID()}`,
);
const db = getFirestore(app);
const friends = new NativeFriendships(db);
const blocks = new NativeBlockPairs(db);
afterAll(() => deleteApp(app));

async function people() {
  const sender = randomUUID();
  const receiver = randomUUID();
  const senderName = `sender${sender.slice(0, 8)}`;
  const receiverName = `receiver${receiver.slice(0, 8)}`;
  const batch = db.batch();
  batch.set(db.collection('nativeAccounts').doc(sender), {
    status: 'active',
    username: senderName,
  });
  batch.set(db.collection('nativeAccounts').doc(receiver), {
    status: 'active',
    username: receiverName,
  });
  batch.set(db.collection('nativeUsernames').doc(senderName), { uid: sender });
  batch.set(db.collection('nativeUsernames').doc(receiverName), {
    uid: receiver,
  });
  await batch.commit();
  return { sender, receiver, receiverName };
}

describe('trusted friendship contract', () => {
  it('combines incoming and outgoing requests and enforces each response direction', async () => {
    const { sender, receiver, receiverName } = await people();
    const id = await friends.sendByUsername(sender, receiverName, 1_000);
    expect((await friends.list(sender, 'requests')).items).toMatchObject([
      { id, otherUid: receiver, status: 'sent' },
    ]);
    expect((await friends.list(receiver, 'requests')).items).toMatchObject([
      { id, otherUid: sender, status: 'pending' },
    ]);
    await expect(friends.decline(id, sender)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(friends.cancel(id, receiver)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await friends.decline(id, receiver, 1_100);
    expect((await friends.list(sender, 'requests')).items).toEqual([]);
    const resent = await friends.sendByUsername(sender, receiverName, 1_200);
    expect(resent).toBe(id);
    await friends.cancel(id, sender);
    expect((await friends.list(receiver, 'requests')).items).toEqual([]);
  });

  it('removes accepted friendships by other UID and keeps a block from reviving them', async () => {
    const { sender, receiver, receiverName } = await people();
    const id = await friends.sendByUsername(sender, receiverName, 1_000);
    await friends.accept(id, receiver, 1_100);
    await expect(friends.remove(sender, sender)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await friends.remove(sender, receiver);
    expect((await friends.list(sender, 'accepted')).items).toEqual([]);
    await expect(friends.remove(sender, receiver)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const next = await friends.sendByUsername(sender, receiverName, 1_200);
    await blocks.setBlocked(receiver, sender, true, 1_300);
    await expect(friends.accept(next, receiver)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await blocks.setBlocked(receiver, sender, false, 1_400);
    expect((await friends.list(sender, 'requests')).items).toEqual([]);
  });
});
