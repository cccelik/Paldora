import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { currentUserSchema } from '@paldora/validation';
import { NativeAccounts } from './native-accounts.js';
import { NativeProfiles } from './native-profiles.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('This test requires disposable Auth and Firestore emulators');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `profiles-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const profiles = new NativeProfiles(db, auth);
afterAll(() => deleteApp(app));

async function admittedUser() {
  const uid = randomUUID();
  await auth.createUser({
    uid,
    email: `${uid}@example.invalid`,
    emailVerified: true,
  });
  await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  await accounts.provision(uid, 1_000);
  return uid;
}

describe('trusted native profile and preferences', () => {
  it('normalizes edits and enforces forward-only onboarding', async () => {
    const uid = await admittedUser();
    expect(
      currentUserSchema.safeParse(await profiles.current(uid)).success,
    ).toBe(true);
    await expect(
      profiles.update(uid, { onboardingState: 'profile' }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(await profiles.usernameAvailability(uid, 'Admin')).toMatchObject({
      available: false,
      reason: 'reserved',
    });
    expect(await profiles.usernameAvailability(uid, 'x')).toMatchObject({
      available: false,
      reason: 'invalid',
    });
    await profiles.update(
      uid,
      { username: 'Zoe_One', onboardingState: 'profile' },
      2_000,
    );
    await expect(
      profiles.update(uid, { onboardingState: 'avatar' }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    const result = await profiles.update(
      uid,
      { displayName: '  Zoe  ', bio: '  ', onboardingState: 'complete' },
      3_000,
    );
    expect(result.profile).toMatchObject({
      username: 'Zoe_One',
      displayName: 'Zoe',
      bio: null,
      onboardingState: 'complete',
    });
    expect(currentUserSchema.safeParse(result).success).toBe(true);
    await expect(
      profiles.update(uid, { onboardingState: 'username' }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(
      await profiles.updatePreferences(uid, { appearance: 'dark' }),
    ).toMatchObject({ appearance: 'dark' });
    expect(
      (await profiles.setReactionPresets(uid, ['❤️', '😂', '🥹', '🔥', '👏']))
        .reactionPresets,
    ).toEqual(['❤️', '😂', '🥹', '🔥', '👏']);
  });

  it('reserves normalized usernames atomically and releases the old name', async () => {
    const first = await admittedUser();
    const second = await admittedUser();
    const suffix = randomUUID().slice(0, 8);
    const accented = `Zoë_${suffix}`;
    const normalized = `zoe_${suffix}`;
    await profiles.update(first, { username: accented });
    expect(
      await profiles.usernameAvailability(second, normalized),
    ).toMatchObject({
      available: false,
      reason: 'taken',
    });
    await expect(
      profiles.update(second, { username: normalized }),
    ).rejects.toMatchObject({ code: 'TAKEN' });
    await profiles.update(first, { username: 'OtherName' });
    expect(
      await profiles.usernameAvailability(second, normalized),
    ).toMatchObject({
      available: true,
    });
    await profiles.update(second, { username: normalized });
    await accounts.suspend(second);
    await expect(profiles.current(second)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(
      profiles.update(second, { bio: 'hello' }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
