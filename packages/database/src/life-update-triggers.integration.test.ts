import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { lifeUpdateDeliveries, lifeUpdates, posts } from './index.js';
import {
  PG_ERROR,
  connectTestDatabase,
  failureOf,
} from './test-support/connection.js';
import {
  IMMUTABLE,
  contentFixtures,
  lifeUpdateFixtures,
} from './test-support/content.js';

/** The triggers that keep a Life Update's audience immutable after publish. */
const { database } = connectTestDatabase('paldora-life-update-trigger-test', 2);
const { INTEGRITY } = PG_ERROR;
const { newUser, newBox, newPost } = contentFixtures(database);
const { insertUpdate, backingPost, publish, publishOnlyMe } =
  lifeUpdateFixtures(database);

describe('Life Update immutability triggers', () => {
  it('rejects a delivery added in a later transaction', async () => {
    const author = await newUser();
    const { lifeUpdateId } = await publish(author, [await newBox()]);
    const boxId = await newBox();
    const failure = await failureOf(
      database.transaction(async (tx) => {
        await tx.insert(lifeUpdateDeliveries).values({
          lifeUpdateId,
          audience: 'boxes',
          authorUserId: author,
          position: 1,
          boxId,
          postId: await backingPost(tx, boxId, author),
        });
      }),
    );
    expect(failure).toEqual({ code: INTEGRITY, constraint: IMMUTABLE });
  });

  it('rejects changing or directly removing a delivery', async () => {
    const author = await newUser();
    const { lifeUpdateId } = await publish(author, [await newBox()]);
    const where = eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdateId);
    const update = await failureOf(
      database.update(lifeUpdateDeliveries).set({ position: 1 }).where(where),
    );
    expect(update).toEqual({ code: INTEGRITY, constraint: IMMUTABLE });
    const removal = await failureOf(
      database.delete(lifeUpdateDeliveries).where(where),
    );
    expect(removal).toEqual({ code: INTEGRITY, constraint: IMMUTABLE });
  });

  it.each([
    ['the audience', { audience: 'boxes' }],
    ['the author', { authorUserId: 'other' }],
    ['the publish time', { createdAt: new Date(0) }],
  ] as const)('rejects changing %s', async (_name, change) => {
    const author = await newUser();
    const other = await newUser();
    const lifeUpdateId = await publishOnlyMe(author);
    const values = 'authorUserId' in change ? { authorUserId: other } : change;
    const failure = await failureOf(
      database
        .update(lifeUpdates)
        .set(values)
        .where(eq(lifeUpdates.id, lifeUpdateId)),
    );
    expect(failure).toEqual({ code: INTEGRITY, constraint: IMMUTABLE });
  });

  it('allows editing sections and tombstoning', async () => {
    const author = await newUser();
    const lifeUpdateId = await publishOnlyMe(author);
    await database
      .update(lifeUpdates)
      .set({ sections: { reading: 'Dune' }, editedAt: new Date() })
      .where(eq(lifeUpdates.id, lifeUpdateId));
    await database
      .update(lifeUpdates)
      .set({ status: 'deleted', sections: {}, deletedAt: new Date() })
      .where(eq(lifeUpdates.id, lifeUpdateId));
    const [row] = await database
      .select({ status: lifeUpdates.status })
      .from(lifeUpdates)
      .where(eq(lifeUpdates.id, lifeUpdateId));
    expect(row?.status).toBe('deleted');
  });

  it('rejects committing a Life Update with no delivery', async () => {
    const author = await newUser();
    const failure = await failureOf(
      database.transaction(async (tx) => {
        await insertUpdate(tx, author);
      }),
    );
    expect(failure).toEqual({
      code: INTEGRITY,
      constraint: 'life_update_requires_delivery',
    });
  });

  it('rejects committing a backing post with no delivery', async () => {
    const author = await newUser();
    const boxId = await newBox();
    const failure = await failureOf(
      database
        .insert(posts)
        .values({ boxId, authorUserId: author, kind: 'life_update' }),
    );
    expect(failure).toEqual({
      code: INTEGRITY,
      constraint: 'posts_life_update_requires_delivery',
    });
  });

  it('rejects changing a post’s kind in either direction', async () => {
    const author = await newUser();
    const boxId = await newBox();
    const { postIds } = await publish(author, [boxId]);
    const ordinary = await newPost(boxId, author);
    for (const [postId, kind] of [
      [postIds[0] ?? '', 'post'],
      [ordinary, 'life_update'],
    ] as const) {
      const failure = await failureOf(
        database
          .update(posts)
          .set({ kind, content: null })
          .where(eq(posts.id, postId)),
      );
      expect(failure).toEqual({
        code: INTEGRITY,
        constraint: 'posts_kind_immutable',
      });
    }
  });
});
