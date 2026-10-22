import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeUsernames } from './native-usernames.js';

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires the disposable Firestore emulator');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `usernames-${randomUUID()}`,
);
const db = getFirestore(app);
const usernames = new NativeUsernames(db);
afterAll(() => deleteApp(app));

async function account(status: 'active' | 'suspended' = 'active') {
  const uid = randomUUID();
  await db.collection('nativeAccounts').doc(uid).set({ status });
  return uid;
}

describe('trusted native username reservations', () => {
  it('normalizes and prevents another account from taking the same name', async () => {
    const first = await account();
    const second = await account();
    const suffix = randomUUID().slice(0, 8);
    await expect(usernames.reserve(first, `Zoë_${suffix}`)).resolves.toBe(
      `zoe_${suffix}`,
    );
    await expect(
      usernames.reserve(second, `zoe_${suffix}`),
    ).rejects.toMatchObject({
      code: 'TAKEN',
    });
    expect(
      (await db.collection('nativeUsernames').doc(`zoe_${suffix}`).get()).get(
        'uid',
      ),
    ).toBe(first);
  });

  it('moves a reservation atomically when an account renames', async () => {
    const first = await account();
    const second = await account();
    await usernames.reserve(first, 'first_name');
    await usernames.reserve(first, 'second_name');
    expect(
      (await db.collection('nativeUsernames').doc('first_name').get()).exists,
    ).toBe(false);
    expect(
      (await db.collection('nativeUsernames').doc('second_name').get()).get(
        'uid',
      ),
    ).toBe(first);
    await expect(usernames.reserve(second, 'first_name')).resolves.toBe(
      'first_name',
    );
  });

  it('allows one winner for concurrent claims and denies suspended accounts', async () => {
    const first = await account();
    const second = await account();
    const outcomes = await Promise.allSettled([
      usernames.reserve(first, 'shared_name'),
      usernames.reserve(second, 'shared_name'),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    const suspended = await account('suspended');
    await expect(
      usernames.reserve(suspended, 'other_name'),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it('rejects invalid and reserved names', async () => {
    const uid = await account();
    await expect(usernames.reserve(uid, 'a')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(usernames.reserve(uid, 'admin')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });
});
