import { requireEnvironmentVariables } from '@paldora/config';
import {
  boxMemberships,
  boxes,
  createDatabaseConnection,
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  mediaJobOutbox,
  posts,
  profiles,
  users,
} from '@paldora/database';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DELIVERYLESS_GRACE_MS,
  sweepDeliverylessLifeUpdates,
} from './deliveryless-life-updates.js';

const { DATABASE_URL } = requireEnvironmentVariables(
  ['DATABASE_URL', 'REDIS_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 4,
  applicationName: 'paldora-deliveryless-test',
});
const database = connection.database;
afterAll(() => connection.close());

async function person(): Promise<string> {
  const email = `deliveryless-${randomUUID()}@example.test`;
  const [user] = await database
    .insert(users)
    .values({
      authSubject: `subject-${randomUUID()}`,
      email,
      emailNormalized: email,
    })
    .returning({ id: users.id });
  if (!user) throw new Error('user insert failed');
  await database.insert(profiles).values({ userId: user.id });
  return user.id;
}

async function boxOf(ownerId: string): Promise<string> {
  const [box] = await database
    .insert(boxes)
    .values({ name: `Sweep ${randomUUID().slice(0, 8)}` })
    .returning({ id: boxes.id });
  if (!box) throw new Error('box insert failed');
  await database
    .insert(boxMemberships)
    .values({ boxId: box.id, userId: ownerId, role: 'owner' });
  return box.id;
}

async function photoOf(ownerId: string) {
  const id = randomUUID();
  const objectKeys = {
    uploadObjectKey: `uploads/${id}`,
    masterObjectKey: `media/${id}/master.webp`,
    displayObjectKey: `media/${id}/display.webp`,
    thumbnailObjectKey: `media/${id}/thumbnail.webp`,
  };
  await database.insert(mediaAssets).values({
    id,
    ownerUserId: ownerId,
    purpose: 'life_update_image',
    status: 'ready',
    contentType: 'image/jpeg',
    contentLength: 1_000,
    uploadExpiresAt: new Date(),
    ...objectKeys,
    width: 1600,
    height: 1200,
  });
  const keys = Object.values(objectKeys);
  return { id, keys };
}

/** A Life Update delivered to `boxIds`, as the API's publish writes it. */
async function publish(
  authorId: string,
  boxIds: readonly string[],
  photoId: string,
) {
  return database.transaction(async (transaction) => {
    const [update] = await transaction
      .insert(lifeUpdates)
      .values({
        authorUserId: authorId,
        audience: 'boxes',
        sections: { travel: 'Lisbon' },
      })
      .returning({ id: lifeUpdates.id });
    if (!update) throw new Error('life update insert failed');
    const created = await transaction
      .insert(posts)
      .values(
        boxIds.map((boxId) => ({
          boxId,
          authorUserId: authorId,
          kind: 'life_update',
        })),
      )
      .returning({ id: posts.id, boxId: posts.boxId });
    await transaction.insert(lifeUpdateDeliveries).values(
      created.map((post, position) => ({
        lifeUpdateId: update.id,
        audience: 'boxes' as const,
        authorUserId: authorId,
        position,
        boxId: post.boxId,
        postId: post.id,
      })),
    );
    await transaction
      .insert(lifeUpdateMedia)
      .values({ lifeUpdateId: update.id, mediaAssetId: photoId, position: 0 });
    return update.id;
  });
}

const later = () => new Date(Date.now() + DELIVERYLESS_GRACE_MS + 60_000);

async function stateOf(lifeUpdateId: string, photoId: string) {
  const [update] = await database
    .select({ status: lifeUpdates.status, sections: lifeUpdates.sections })
    .from(lifeUpdates)
    .where(eq(lifeUpdates.id, lifeUpdateId));
  const [photo] = await database
    .select({ status: mediaAssets.status })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, photoId));
  return { update, photo: photo?.status };
}

const deletionsFor = async (keys: readonly string[]) => {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaJobOutbox)
    .where(
      and(
        eq(mediaJobOutbox.jobType, 'media.delete'),
        sql`${mediaJobOutbox.payload} -> 'objectKeys' @> ${JSON.stringify(keys)}::jsonb`,
      ),
    );
  return row?.count ?? 0;
};

describe('deliveryless Life Update sweep', () => {
  it('tombstones a Life Update whose every Box was deleted, and retires its photos', async () => {
    const author = await person();
    const box = await boxOf(author);
    const photo = await photoOf(author);
    const id = await publish(author, [box], photo.id);
    // Deleted behind the API's back: the cascade leaves no delivery.
    await database.delete(boxes).where(eq(boxes.id, box));

    // Too recent: left for a later run.
    await sweepDeliverylessLifeUpdates(database, new Date(), 200);
    expect((await stateOf(id, photo.id)).update?.status).toBe('active');

    const result = await sweepDeliverylessLifeUpdates(database, later(), 200);
    expect(result.tombstonedLifeUpdates).toBeGreaterThanOrEqual(1);
    expect(result.orphanedBackingPosts).toBe(0);
    expect(await stateOf(id, photo.id)).toEqual({
      update: { status: 'deleted', sections: {} },
      photo: 'deleted',
    });
    expect(await deletionsFor(photo.keys)).toBe(1);
    // Safe to repeat.
    await sweepDeliverylessLifeUpdates(database, later(), 200);
    expect(await deletionsFor(photo.keys)).toBe(1);
  });

  it('leaves a Life Update that still has a Box alone', async () => {
    const author = await person();
    const [kept, lost] = [await boxOf(author), await boxOf(author)];
    const photo = await photoOf(author);
    const id = await publish(author, [kept, lost], photo.id);
    await database.delete(boxes).where(eq(boxes.id, lost));
    await sweepDeliverylessLifeUpdates(database, later(), 200);
    expect(await stateOf(id, photo.id)).toEqual({
      update: { status: 'active', sections: { travel: 'Lisbon' } },
      photo: 'ready',
    });
  });
});
