import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseConnection } from './index.js';
import {
  boxMemberships,
  boxes,
  friendships,
  profiles,
  users,
} from './schema.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('Paldora schema', () => {
  let connection: DatabaseConnection;
  const subjectA = `integration-${randomUUID()}`;
  const subjectB = `integration-${randomUUID()}`;
  const boxSubjectA = `integration-box-${randomUUID()}`;
  const boxSubjectB = `integration-box-${randomUUID()}`;
  const boxSubjectC = `integration-box-${randomUUID()}`;

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl as string);
    await connection.pool.query(
      "delete from paldora.boxes where owner_user_id in (select id from paldora.users where auth_subject like 'integration-%')",
    );
    await connection.pool.query(
      "delete from paldora.users where auth_subject like 'integration-%'",
    );
  });

  afterAll(async () => {
    await connection.pool.query(
      "delete from paldora.boxes where owner_user_id in (select id from paldora.users where auth_subject like 'integration-%')",
    );
    await connection.pool.query(
      "delete from paldora.users where auth_subject like 'integration-%'",
    );
    await connection.close();
  });

  it('enforces normalized username uniqueness at the database boundary', async () => {
    const normalized = `test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const [first, second] = await connection.database
      .insert(users)
      .values([
        {
          authSubject: boxSubjectA,
          email: `${boxSubjectA}@example.com`,
          emailNormalized: `${boxSubjectA}@example.com`,
        },
        {
          authSubject: boxSubjectB,
          email: `${boxSubjectB}@example.com`,
          emailNormalized: `${boxSubjectB}@example.com`,
        },
      ])
      .returning({ id: users.id });
    if (!first || !second) throw new Error('Test users were not inserted.');
    await connection.database.insert(profiles).values({
      userId: first.id,
      username: normalized,
      usernameNormalized: normalized,
    });
    await expect(
      connection.database.insert(profiles).values({
        userId: second.id,
        username: normalized.toLocaleUpperCase('en-US'),
        usernameNormalized: normalized,
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('enforces Box ownership and canonical friendship invariants', async () => {
    const inserted = await connection.database
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
        {
          authSubject: boxSubjectC,
          email: `${boxSubjectC}@example.com`,
          emailNormalized: `${boxSubjectC}@example.com`,
        },
      ])
      .returning({ id: users.id });
    const [first, second, third] = inserted;
    if (!first || !second || !third)
      throw new Error('Test users were not inserted.');
    const [box] = await connection.database
      .insert(boxes)
      .values({
        name: 'Integration Box',
        slug: `test-${randomUUID()}`,
        ownerUserId: first.id,
      })
      .returning({ id: boxes.id });
    if (!box) throw new Error('Test Box was not inserted.');
    await connection.database
      .insert(boxMemberships)
      .values({ boxId: box.id, userId: first.id, role: 'owner' });
    await expect(
      connection.database
        .insert(boxMemberships)
        .values({ boxId: box.id, userId: second.id, role: 'owner' }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });

    const [low, high] =
      first.id < second.id ? [first.id, second.id] : [second.id, first.id];
    await connection.database.insert(friendships).values({
      userLowId: low,
      userHighId: high,
      initiatedByUserId: first.id,
      status: 'pending',
    });
    await expect(
      connection.database.insert(friendships).values({
        userLowId: second.id < third.id ? third.id : second.id,
        userHighId: second.id < third.id ? second.id : third.id,
        initiatedByUserId: second.id,
        status: 'pending',
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});
