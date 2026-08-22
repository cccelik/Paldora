import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseConnection } from './index.js';
import { profiles, users } from './schema.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('Phase 1 schema', () => {
  let connection: DatabaseConnection;
  const subjectA = `integration-${randomUUID()}`;
  const subjectB = `integration-${randomUUID()}`;

  beforeAll(() => {
    connection = createDatabaseConnection(databaseUrl as string);
  });

  afterAll(async () => {
    await connection.pool.query(
      'delete from paldora.users where auth_subject = any($1::text[])',
      [[subjectA, subjectB]],
    );
    await connection.close();
  });

  it('enforces normalized username uniqueness at the database boundary', async () => {
    const [first, second] = await connection.database
      .insert(users)
      .values([
        {
          authSubject: subjectA,
          email: `${subjectA}@example.com`,
          emailNormalized: `${subjectA}@example.com`,
        },
        {
          authSubject: subjectB,
          email: `${subjectB}@example.com`,
          emailNormalized: `${subjectB}@example.com`,
        },
      ])
      .returning({ id: users.id });
    if (!first || !second) throw new Error('Test users were not inserted.');
    await connection.database.insert(profiles).values({
      userId: first.id,
      username: 'Çelik',
      usernameNormalized: 'celik',
    });
    await expect(
      connection.database.insert(profiles).values({
        userId: second.id,
        username: 'CELIK',
        usernameNormalized: 'celik',
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });
});
