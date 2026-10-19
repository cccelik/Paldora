import { requireEnvironmentVariables } from '@paldora/config';
import {
  createDatabaseConnection,
  profiles,
  userPreferences,
  users,
} from '@paldora/database';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { provisionUser } from './provision-user.js';

const { DATABASE_URL } = requireEnvironmentVariables(
  ['DATABASE_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 2,
  applicationName: 'paldora-provision-test',
});
afterAll(() => connection.close());

const unique = () => randomUUID().replace(/-/g, '').slice(0, 10);

describe('provisionUser', () => {
  it('creates the user, profile, and preferences together', async () => {
    const id = unique();
    const result = await provisionUser(connection.database, {
      subject: `subject-${id}`,
      email: `  Person.${id}@Example.TEST `,
    });
    expect(result.created).toBe(true);
    const [user] = await connection.database
      .select()
      .from(users)
      .where(eq(users.id, result.userId));
    expect(user?.emailNormalized).toBe(`person.${id}@example.test`);
    const [profile] = await connection.database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, result.userId));
    expect(profile?.onboardingState).toBe('username');
    const [preferences] = await connection.database
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, result.userId));
    expect(preferences?.appearance).toBe('system');
  });

  it('completes onboarding when a username and name are supplied', async () => {
    const id = unique();
    const result = await provisionUser(connection.database, {
      subject: `subject-${id}`,
      email: `${id}@example.test`,
      username: `Demo_${id}`,
      displayName: 'Demo Person',
    });
    const [profile] = await connection.database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, result.userId));
    expect(profile).toMatchObject({
      username: `Demo_${id}`,
      usernameNormalized: `demo_${id}`,
      onboardingState: 'complete',
    });
  });

  it('is safe to re-run and never overwrites an existing profile', async () => {
    const id = unique();
    const request = { subject: `subject-${id}`, email: `${id}@example.test` };
    const first = await provisionUser(connection.database, request);
    await connection.database
      .update(profiles)
      .set({ displayName: 'Chosen by the person' })
      .where(eq(profiles.userId, first.userId));
    const again = await provisionUser(connection.database, {
      ...request,
      username: `other_${id}`,
      displayName: 'Admin guess',
    });
    expect(again).toEqual({ userId: first.userId, created: false });
    const [profile] = await connection.database
      .select()
      .from(profiles)
      .where(eq(profiles.userId, first.userId));
    expect(profile?.displayName).toBe('Chosen by the person');
  });

  it('refuses reserved usernames', async () => {
    await expect(
      provisionUser(connection.database, {
        subject: `subject-${unique()}`,
        email: `${unique()}@example.test`,
        username: 'Admin',
        displayName: 'Nope',
      }),
    ).rejects.toThrow(/reserved/);
  });
});
