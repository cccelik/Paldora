import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { NativeAccounts } from './native-accounts.js';
import { NativeWebSessions } from './native-web-sessions.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `sessions-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const sessions = new NativeWebSessions(
  auth,
  db,
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com',
  'demo-api-key',
);
afterAll(() => deleteApp(app));

async function member(admitted = true) {
  const uid = randomUUID();
  const email = `${uid}@example.invalid`;
  const password = `Test-${randomUUID()}!`;
  await auth.createUser({ uid, email, password, emailVerified: true });
  if (admitted) {
    await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
    await accounts.provision(uid);
  }
  return { uid, email, password };
}

describe('server-only Firebase web sessions', () => {
  it('creates a session only for an admitted active account and rechecks status', async () => {
    const user = await member();
    const signedIn = await sessions.signIn(user.email, user.password);
    expect(signedIn.uid).toBe(user.uid);
    expect(await sessions.verify(signedIn.cookie)).toBe(user.uid);
    await sessions.reauthenticate(user.uid, user.email, user.password);
    await expect(
      sessions.reauthenticate(randomUUID(), user.email, user.password),
    ).rejects.toBeInstanceOf(Error);
    await accounts.suspend(user.uid);
    await expect(sessions.verify(signedIn.cookie)).rejects.toBeInstanceOf(
      Error,
    );
  });

  it('uses the same failure for unknown credentials and unadmitted identities', async () => {
    const unadmitted = await member(false);
    await expect(
      sessions.signIn(unadmitted.email, unadmitted.password),
    ).rejects.toThrow('SESSION_UNAVAILABLE');
    await expect(
      sessions.signIn('missing@example.invalid', 'wrong'),
    ).rejects.toThrow('SESSION_UNAVAILABLE');
    await expect(sessions.verify('forged-cookie')).rejects.toThrow(
      'SESSION_UNAVAILABLE',
    );
  });

  it('requires reauthentication for password changes and revokes the old cookie', async () => {
    const user = await member();
    const old = await sessions.signIn(user.email, user.password);
    await expect(
      sessions.changePassword(
        user.uid,
        user.email,
        'wrong',
        `Changed-${randomUUID()}!`,
      ),
    ).rejects.toThrow('SESSION_UNAVAILABLE');
    const nextPassword = `Changed-${randomUUID()}!`;
    await sessions.changePassword(
      user.uid,
      user.email,
      user.password,
      nextPassword,
    );
    await expect(sessions.verify(old.cookie)).rejects.toThrow(
      'SESSION_UNAVAILABLE',
    );
    await expect(sessions.signIn(user.email, user.password)).rejects.toThrow(
      'SESSION_UNAVAILABLE',
    );
    expect((await sessions.signIn(user.email, nextPassword)).uid).toBe(
      user.uid,
    );
    // A later operator claim rewrite cannot accidentally revive the old cookie.
    await auth.setCustomUserClaims(user.uid, { paldoraAdmitted: true });
    await expect(sessions.verify(old.cookie)).rejects.toThrow(
      'SESSION_UNAVAILABLE',
    );
  });

  it('signs out everywhere without a password and refuses inactive accounts', async () => {
    const user = await member();
    const old = await sessions.signIn(user.email, user.password);
    await sessions.signOutEverywhere(user.uid);
    await expect(sessions.verify(old.cookie)).rejects.toThrow(
      'SESSION_UNAVAILABLE',
    );
    // The password still works: this only ends existing sessions.
    expect((await sessions.signIn(user.email, user.password)).uid).toBe(
      user.uid,
    );
    const unadmitted = await member(false);
    await expect(sessions.signOutEverywhere(unadmitted.uid)).rejects.toThrow(
      'SESSION_UNAVAILABLE',
    );
  });

  it('issues recovery only to admitted accounts and invalidates prior sessions on reset', async () => {
    const user = await member();
    const unadmitted = await member(false);
    const old = await sessions.signIn(user.email, user.password);
    await sessions.requestPasswordReset('missing@example.invalid');
    await sessions.requestPasswordReset(unadmitted.email);
    await sessions.requestPasswordReset(user.email);
    const codesResponse = await fetch(
      'http://127.0.0.1:9099/emulator/v1/projects/demo-paldora/oobCodes',
    );
    const codes = (await codesResponse.json()) as {
      oobCodes: Array<{ email: string; oobCode: string; requestType: string }>;
    };
    expect(codes.oobCodes.some((code) => code.email === unadmitted.email)).toBe(
      false,
    );
    const code = codes.oobCodes.find((item) => item.email === user.email);
    expect(code?.requestType).toBe('PASSWORD_RESET');
    const nextPassword = `Recovered-${randomUUID()}!`;
    await sessions.resetPassword(code!.oobCode, nextPassword);
    await expect(sessions.verify(old.cookie)).rejects.toThrow(
      'SESSION_UNAVAILABLE',
    );
    await expect(sessions.signIn(user.email, user.password)).rejects.toThrow(
      'SESSION_UNAVAILABLE',
    );
    expect((await sessions.signIn(user.email, nextPassword)).uid).toBe(
      user.uid,
    );
    await expect(
      sessions.resetPassword(code!.oobCode, nextPassword),
    ).rejects.toThrow('SESSION_UNAVAILABLE');
  });
});
