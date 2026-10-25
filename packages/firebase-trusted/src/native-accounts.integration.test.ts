import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `accounts-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
afterAll(() => deleteApp(app));

async function authUser(
  options: {
    emailVerified?: boolean;
    disabled?: boolean;
    admitted?: boolean;
  } = {},
) {
  const uid = randomUUID();
  await auth.createUser({
    uid,
    email: `${uid}@example.invalid`,
    emailVerified: options.emailVerified ?? true,
    disabled: options.disabled ?? false,
  });
  if (options.admitted !== false)
    await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  return uid;
}

describe('trusted native account provisioning', () => {
  it('provisions an existing verified Auth user once', async () => {
    const uid = await authUser();
    await accounts.provision(uid, 1_000);
    await accounts.provision(uid, 2_000);
    expect(
      (await db.collection('nativeAccounts').doc(uid).get()).data(),
    ).toEqual({
      schemaVersion: 1,
      status: 'active',
      createdAt: 1_000,
    });
  });

  it('denies missing, unverified, disabled, and unadmitted Auth users', async () => {
    const missing = randomUUID();
    const unverified = await authUser({ emailVerified: false });
    const disabled = await authUser({ disabled: true });
    const unadmitted = await authUser({ admitted: false });
    for (const uid of [missing, unverified, disabled, unadmitted]) {
      await expect(accounts.provision(uid)).rejects.toMatchObject({
        code: 'UNAVAILABLE',
      });
      expect(
        (await db.collection('nativeAccounts').doc(uid).get()).exists,
      ).toBe(false);
    }
  });

  it('suspends access state and refuses silent reprovisioning', async () => {
    const uid = await authUser();
    await accounts.provision(uid);
    await accounts.suspend(uid);
    expect(
      (await db.collection('nativeAccounts').doc(uid).get()).get('status'),
    ).toBe('suspended');
    await expect(accounts.provision(uid)).rejects.toMatchObject({
      code: 'ALREADY_RESTRICTED',
    });
    await accounts.suspend(uid);
    expect(
      (await db.collection('nativeAccounts').doc(uid).get()).get('status'),
    ).toBe('suspended');
  });
});
