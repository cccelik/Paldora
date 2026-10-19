import { currentUserSchema, errorEnvelopeSchema } from '@paldora/validation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  uniqueUsername,
  type TestApp,
} from '../testing/test-app.js';

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

async function errorCode(response: Response): Promise<string> {
  return errorEnvelopeSchema.parse(await response.json()).error.code;
}

const patchProfile = (
  user: Awaited<ReturnType<TestApp['createUser']>>,
  body: unknown,
) => app.request(user, '/me/profile', { method: 'PATCH', body });

describe('principal mapping', () => {
  it('requires a bearer token', async () => {
    const response = await app.request(null, '/me');
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects a valid token whose subject was never provisioned', async () => {
    const token = await app.issuer.token('subject-never-provisioned');
    const response = await fetch(`${app.baseUrl}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('ACCOUNT_NOT_PROVISIONED');
  });

  it('rejects suspended users on every request', async () => {
    const user = await app.createUser({ status: 'suspended' });
    const response = await app.request(user, '/me');
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('ACCOUNT_BLOCKED');
  });

  it('returns the provisioned user without the identity-provider subject', async () => {
    const user = await app.createUser();
    const response = await app.request(user, '/me');
    expect(response.status).toBe(200);
    const body = await response.json();
    const current = currentUserSchema.parse(body);
    expect(current.user.id).toBe(user.id);
    expect(current.profile.onboardingState).toBe('username');
    expect(current.preferences.appearance).toBe('system');
    expect(JSON.stringify(body)).not.toContain(user.subject);
  });
});

describe('onboarding', () => {
  it('advances step by step and never backwards', async () => {
    const user = await app.createUser();
    const username = uniqueUsername();
    const first = await patchProfile(user, {
      username,
      onboardingState: 'profile',
    });
    expect(first.status).toBe(200);
    expect(currentUserSchema.parse(await first.json()).profile).toMatchObject({
      username,
      onboardingState: 'profile',
    });

    const second = await patchProfile(user, {
      displayName: '  Ada Lovelace ',
      bio: 'Counting engines.',
      onboardingState: 'avatar',
    });
    expect(currentUserSchema.parse(await second.json()).profile).toMatchObject({
      displayName: 'Ada Lovelace',
      onboardingState: 'avatar',
    });

    const back = await patchProfile(user, { onboardingState: 'username' });
    expect(back.status).toBe(400);
    expect(await errorCode(back)).toBe('INVALID_ONBOARDING_TRANSITION');
  });

  it('cannot skip a step whose data is missing', async () => {
    const user = await app.createUser();
    const skipUsername = await patchProfile(user, {
      onboardingState: 'complete',
    });
    expect(await errorCode(skipUsername)).toBe('ONBOARDING_INCOMPLETE');
    const skipName = await patchProfile(user, {
      username: uniqueUsername(),
      onboardingState: 'avatar',
    });
    expect(await errorCode(skipName)).toBe('ONBOARDING_INCOMPLETE');
  });

  it('rejects unknown and server-owned fields', async () => {
    const user = await app.createUser();
    const response = await patchProfile(user, { status: 'active' });
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('VALIDATION_FAILED');
  });
});

describe('usernames', () => {
  it('collide on the normalized form, even when accented or cased', async () => {
    const base = uniqueUsername('zoe');
    const owner = await app.createUser();
    expect((await patchProfile(owner, { username: base })).status).toBe(200);
    const rival = await app.createUser();
    const response = await patchProfile(rival, {
      username: base.toUpperCase().replace('ZOE', 'ZOË'),
    });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('USERNAME_UNAVAILABLE');
  });

  it('lets the database decide a race between two users', async () => {
    const username = uniqueUsername('race');
    const [left, right] = await Promise.all([
      app.createUser(),
      app.createUser(),
    ]);
    const results = await Promise.all([
      patchProfile(left, { username }),
      patchProfile(right, { username }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it('refuses reserved names', async () => {
    const user = await app.createUser();
    expect(
      await errorCode(await patchProfile(user, { username: 'Settings' })),
    ).toBe('USERNAME_UNAVAILABLE');
  });

  it('answers availability advisorily, including for your own name', async () => {
    const username = uniqueUsername();
    const owner = await app.createUser({ username });
    const other = await app.createUser();
    const check = async (user: typeof owner, value: string) =>
      (
        await app.request(
          user,
          `/me/username-availability?username=${encodeURIComponent(value)}`,
        )
      ).json();
    await expect(check(other, username)).resolves.toMatchObject({
      available: false,
      reason: 'taken',
    });
    await expect(check(owner, username)).resolves.toMatchObject({
      available: true,
    });
    await expect(check(other, 'admin')).resolves.toMatchObject({
      reason: 'reserved',
    });
    await expect(check(other, 'no spaces')).resolves.toMatchObject({
      reason: 'invalid',
    });
  });
});

describe('preferences', () => {
  it('replaces appearance idempotently', async () => {
    const user = await app.createUser();
    for (const attempt of [1, 2]) {
      const response = await app.request(user, '/me/preferences', {
        method: 'PUT',
        body: { appearance: 'dark' },
      });
      expect(response.status, `attempt ${attempt}`).toBe(200);
    }
    const current = currentUserSchema.parse(
      await (await app.request(user, '/me')).json(),
    );
    expect(current.preferences.appearance).toBe('dark');
  });

  it('rejects values outside the allowlist', async () => {
    const user = await app.createUser();
    const response = await app.request(user, '/me/preferences', {
      method: 'PUT',
      body: { appearance: 'neon' },
    });
    expect(response.status).toBe(400);
  });
});
