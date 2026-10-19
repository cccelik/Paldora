import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseConnection } from './index.js';
import {
  boxMemberships,
  boxes,
  friendships,
  mediaAssets,
  mediaJobOutbox,
  profiles,
  users,
} from './schema.js';

const databaseUrl = process.env.DATABASE_URL;
const subjectA = `integration-${randomUUID()}`;
const subjectB = `integration-${randomUUID()}`;
const boxSubjectA = `integration-box-${randomUUID()}`;
const boxSubjectB = `integration-box-${randomUUID()}`;
const boxSubjectC = `integration-box-${randomUUID()}`;
let connection: DatabaseConnection;

describe.runIf(Boolean(databaseUrl))('Paldora schema', () => {
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

  it(
    'enforces normalized username uniqueness at the database boundary',
    testUsernameUniqueness,
  );
  it(
    'enforces Box ownership and canonical friendship invariants',
    testRelationshipInvariants,
  );
  it(
    'enforces media Box ownership while retaining cascade cleanup jobs',
    testMediaBoxOutbox,
  );
});

async function testUsernameUniqueness(): Promise<void> {
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
}

async function testMediaBoxOutbox(): Promise<void> {
  const [owner] = await connection.database
    .insert(users)
    .values({
      authSubject: `integration-media-${randomUUID()}`,
      email: `integration-media-${randomUUID()}@example.com`,
      emailNormalized: `integration-media-${randomUUID()}@example.com`,
    })
    .returning({ id: users.id });
  if (!owner) throw new Error('Media owner was not inserted.');
  const [box] = await connection.database
    .insert(boxes)
    .values({
      name: 'Media FK Box',
      slug: `media-fk-${randomUUID()}`,
      ownerUserId: owner.id,
    })
    .returning({ id: boxes.id });
  if (!box) throw new Error('Media Box was not inserted.');
  await expect(
    connection.database.insert(mediaAssets).values({
      ownerUserId: owner.id,
      boxId: randomUUID(),
      purpose: 'post_image',
      objectKey: `posts/${randomUUID()}.png`,
      contentType: 'image/png',
      contentLength: 10,
    }),
  ).rejects.toMatchObject({ cause: { code: '23503' } });
  const objectKey = `posts/${box.id}/${randomUUID()}.png`;
  const [asset] = await connection.database
    .insert(mediaAssets)
    .values({
      ownerUserId: owner.id,
      boxId: box.id,
      purpose: 'post_image',
      objectKey,
      contentType: 'image/png',
      contentLength: 10,
    })
    .returning({ id: mediaAssets.id });
  if (!asset) throw new Error('Media asset was not inserted.');
  const [outbox] = await connection.database
    .insert(mediaJobOutbox)
    .values({
      jobType: 'delete-media-object',
      mediaAssetId: asset.id,
      payload: { mediaAssetId: asset.id, objectKeys: [objectKey] },
    })
    .returning({ id: mediaJobOutbox.id });
  if (!outbox) throw new Error('Outbox row was not inserted.');
  await connection.database.delete(boxes).where(eq(boxes.id, box.id));
  await expect(
    connection.database
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, asset.id)),
  ).resolves.toEqual([]);
  await expect(
    connection.database
      .select({ payload: mediaJobOutbox.payload })
      .from(mediaJobOutbox)
      .where(eq(mediaJobOutbox.id, outbox.id)),
  ).resolves.toEqual([
    { payload: { mediaAssetId: asset.id, objectKeys: [objectKey] } },
  ]);
  await connection.database
    .delete(mediaJobOutbox)
    .where(eq(mediaJobOutbox.id, outbox.id));
  await connection.database.delete(users).where(eq(users.id, owner.id));
}

async function testRelationshipInvariants(): Promise<void> {
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
}
