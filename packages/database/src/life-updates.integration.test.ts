import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  boxes,
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  posts,
} from './index.js';
import {
  PG_ERROR,
  connectTestDatabase,
  failureOf,
} from './test-support/connection.js';
import { contentFixtures, lifeUpdateFixtures } from './test-support/content.js';

/** Life Update publishing, sections, and media: the Phase 6 schema. */
const { database } = connectTestDatabase('paldora-life-update-schema-test', 2);
const { CHECK, UNIQUE, FOREIGN_KEY } = PG_ERROR;
const { newUser, newBox, newPost, lifeUpdatePhoto } = contentFixtures(database);
const { insertUpdate, backingPost, publish, publishOnlyMe } =
  lifeUpdateFixtures(database);

describe('Life Update publishing', () => {
  it('gives the update, its backing posts, and deliveries one created_at', async () => {
    const author = await newUser();
    const boxIds = [await newBox(), await newBox()];
    const { lifeUpdateId, postIds } = await publish(author, boxIds);
    const times = await database.execute<{ at: string }>(sql`
      select created_at::text as at from paldora.life_updates where id = ${lifeUpdateId}
      union all select created_at::text from paldora.posts where id in (${sql.join(
        postIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      union all select created_at::text from paldora.life_update_deliveries where life_update_id = ${lifeUpdateId}
    `);
    expect(times.rows).toHaveLength(5);
    expect(new Set(times.rows.map((row) => row.at)).size).toBe(1);
    const [delivery] = await database
      .select({ postKind: lifeUpdateDeliveries.postKind })
      .from(lifeUpdateDeliveries)
      .where(eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdateId))
      .limit(1);
    expect(delivery?.postKind).toBe('life_update');
  });

  it('accepts 20 Boxes and an Only Me row, and rejects position 20', async () => {
    const author = await newUser();
    const twenty = await Promise.all(
      Array.from({ length: 20 }, () => newBox()),
    );
    const { postIds } = await publish(author, twenty);
    expect(postIds).toHaveLength(20);
    await expect(publishOnlyMe(author)).resolves.toBeDefined();
    const boxId = await newBox();
    const failure = await failureOf(
      database.transaction(async (tx) => {
        const lifeUpdateId = await insertUpdate(tx, author);
        await tx.insert(lifeUpdateDeliveries).values({
          lifeUpdateId,
          audience: 'boxes',
          authorUserId: author,
          position: 20,
          boxId,
          postId: await backingPost(tx, boxId, author),
        });
      }),
    );
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'life_update_deliveries_position_check',
    });
  });

  it('rejects the same Box twice', async () => {
    const author = await newUser();
    const boxId = await newBox();
    const failure = await failureOf(publish(author, [boxId, boxId]));
    expect(failure).toEqual({
      code: UNIQUE,
      constraint: 'life_update_deliveries_box_unique',
    });
  });

  it.each([
    ['a Box delivery without a Box', 'boxes', false],
    ['an Only Me delivery with a Box', 'only_me', true],
  ] as const)('rejects %s', async (_name, audience, withBox) => {
    const author = await newUser();
    const boxId = await newBox();
    const failure = await failureOf(
      database.transaction(async (tx) => {
        const lifeUpdateId = await insertUpdate(tx, author, audience);
        await tx.insert(lifeUpdateDeliveries).values({
          lifeUpdateId,
          audience,
          authorUserId: author,
          position: 0,
          boxId: withBox ? boxId : null,
          postId: withBox ? await backingPost(tx, boxId, author) : null,
        });
      }),
    );
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'life_update_deliveries_shape_check',
    });
  });

  it('rejects a delivery whose audience differs from its Life Update', async () => {
    const author = await newUser();
    const failure = await failureOf(
      database.transaction(async (tx) => {
        const lifeUpdateId = await insertUpdate(tx, author, 'boxes');
        await tx.insert(lifeUpdateDeliveries).values({
          lifeUpdateId,
          audience: 'only_me',
          authorUserId: author,
          position: 0,
        });
      }),
    );
    expect(failure).toEqual({
      code: FOREIGN_KEY,
      constraint: 'life_update_deliveries_audience_fk',
    });
  });

  it.each([
    ['a delivery author who is not the Life Update author', 'delivery'],
    ['a backing post by someone else', 'post'],
    ['a backing post in another Box', 'box'],
    ['an ordinary post as the backing post', 'kind'],
  ] as const)('rejects %s', async (_name, mismatch) => {
    const author = await newUser();
    const other = await newUser();
    const boxId = await newBox();
    const otherBox = await newBox();
    const failure = await failureOf(
      database.transaction(async (tx) => {
        const lifeUpdateId = await insertUpdate(tx, author);
        const postId =
          mismatch === 'kind'
            ? await newPost(boxId, author)
            : await backingPost(
                tx,
                mismatch === 'box' ? otherBox : boxId,
                mismatch === 'post' ? other : author,
              );
        await tx.insert(lifeUpdateDeliveries).values({
          lifeUpdateId,
          audience: 'boxes',
          authorUserId: mismatch === 'delivery' ? other : author,
          position: 0,
          boxId,
          postId,
        });
      }),
    );
    expect(failure.code).toBe(FOREIGN_KEY);
    expect(failure.constraint).toBe(
      mismatch === 'delivery'
        ? 'life_update_deliveries_author_fk'
        : 'life_update_deliveries_post_fk',
    );
  });

  it('allows one delivery per backing post', async () => {
    const author = await newUser();
    const boxId = await newBox();
    const { postIds } = await publish(author, [boxId]);
    const failure = await failureOf(
      database.transaction(async (tx) => {
        const lifeUpdateId = await insertUpdate(tx, author);
        await tx.insert(lifeUpdateDeliveries).values({
          lifeUpdateId,
          audience: 'boxes',
          authorUserId: author,
          position: 0,
          boxId,
          postId: postIds[0] ?? '',
        });
      }),
    );
    expect(failure).toEqual({
      code: UNIQUE,
      constraint: 'life_update_deliveries_post_unique',
    });
  });

  it('keeps text off backing posts', async () => {
    const author = await newUser();
    const boxId = await newBox();
    const failure = await failureOf(
      database.insert(posts).values({
        boxId,
        authorUserId: author,
        kind: 'life_update',
        content: 'x',
      }),
    );
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'posts_life_update_content_check',
    });
    const unknown = await failureOf(
      database
        .insert(posts)
        .values({ boxId, authorUserId: author, kind: 'poll', content: 'x' }),
    );
    expect(unknown.constraint).toBe('posts_kind_check');
  });
});

describe('Life Update sections', () => {
  const section = (length: number) => 'x'.repeat(length);

  it.each([
    ['exactly 2,000 characters', { travel: section(2000) }],
    [
      'exactly 10,000 characters in total',
      Object.fromEntries(
        ['lifeLately', 'travel', 'reading', 'watching', 'whatsNext'].map(
          (key) => [key, section(2000)],
        ),
      ),
    ],
    ['no sections at all', {}],
  ])('accepts %s', async (_name, sections) => {
    const author = await newUser();
    await expect(
      database.transaction(async (tx) => {
        const lifeUpdateId = await insertUpdate(
          tx,
          author,
          'only_me',
          sections,
        );
        await tx.insert(lifeUpdateDeliveries).values({
          lifeUpdateId,
          audience: 'only_me',
          authorUserId: author,
          position: 0,
        });
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      'a 2,001-character section',
      sql`jsonb_build_object('travel', repeat('x', 2001))`,
    ],
    ['an empty section', sql`'{"travel": ""}'::jsonb`],
    [
      'more than 10,000 characters in total',
      sql`jsonb_build_object('a', repeat('x', 2000), 'b', repeat('x', 2000), 'c', repeat('x', 2000), 'd', repeat('x', 2000), 'e', repeat('x', 2000), 'f', 'x')`,
    ],
    ['a non-string value', sql`'{"travel": 1}'::jsonb`],
    ['a key that is not letters', sql`'{"travel_1": "x"}'::jsonb`],
    ['an array', sql`'["x"]'::jsonb`],
    [
      'more than 20 keys',
      sql`(select jsonb_object_agg(repeat('k', n), 'x') from generate_series(1, 21) as n)`,
    ],
  ])('rejects %s', async (_name, sections) => {
    const author = await newUser();
    const failure = await failureOf(
      database.execute(
        sql`insert into paldora.life_updates (author_user_id, audience, sections) values (${author}, 'only_me', ${sections})`,
      ),
    );
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'life_updates_sections_check',
    });
  });

  it.each([
    [
      'deleted with sections left',
      { status: 'deleted', deletedAt: new Date() },
    ],
    ['deleted without a time', { status: 'deleted', sections: {} }],
    ['active with a deletion time', { deletedAt: new Date() }],
  ] as const)('enforces the lifecycle: %s', async (_name, values) => {
    const author = await newUser();
    const failure = await failureOf(
      database.insert(lifeUpdates).values({
        authorUserId: author,
        audience: 'only_me',
        sections: { travel: 'x' },
        ...values,
      }),
    );
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'life_updates_lifecycle_check',
    });
  });
});

describe('Life Update media', () => {
  it('belongs to one Life Update, at positions 0–3', async () => {
    const author = await newUser();
    const first = await publishOnlyMe(author);
    const second = await publishOnlyMe(author);
    const photo = await lifeUpdatePhoto(author, null);
    await database
      .insert(lifeUpdateMedia)
      .values({ lifeUpdateId: first, mediaAssetId: photo, position: 0 });
    const reused = await failureOf(
      database
        .insert(lifeUpdateMedia)
        .values({ lifeUpdateId: second, mediaAssetId: photo, position: 0 }),
    );
    expect(reused).toEqual({
      code: UNIQUE,
      constraint: 'life_update_media_asset_unique',
    });
    const fifth = await failureOf(
      database.insert(lifeUpdateMedia).values({
        lifeUpdateId: second,
        mediaAssetId: await lifeUpdatePhoto(author, null),
        position: 4,
      }),
    );
    expect(fifth.constraint).toBe('life_update_media_position_check');
  });

  it('is user-scoped: a Life Update photo never names a Box', async () => {
    const author = await newUser();
    const boxId = await newBox();
    const failure = await failureOf(lifeUpdatePhoto(author, boxId));
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'media_assets_box_scope_check',
    });
    const unknown = await failureOf(
      database.insert(mediaAssets).values({
        ownerUserId: author,
        purpose: 'banner_image',
        contentType: 'image/jpeg',
        contentLength: 10,
        uploadObjectKey: `test/${randomUUID()}`,
        uploadExpiresAt: new Date(),
      }),
    );
    // Either check may report first; both reject an unknown purpose.
    expect(unknown.code).toBe(CHECK);
    expect([
      'media_assets_purpose_check',
      'media_assets_box_scope_check',
    ]).toContain(unknown.constraint);
  });
});

describe('Box deletion with Life Updates', () => {
  it('cascades that Box’s delivery and backing post only', async () => {
    const author = await newUser();
    const doomed = await newBox();
    const kept = await newBox();
    const { lifeUpdateId, postIds } = await publish(author, [doomed, kept]);
    await database.delete(boxes).where(eq(boxes.id, doomed));
    const deliveries = await database
      .select({ boxId: lifeUpdateDeliveries.boxId })
      .from(lifeUpdateDeliveries)
      .where(eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdateId));
    expect(deliveries).toEqual([{ boxId: kept }]);
    const remaining = await database
      .select({ id: posts.id })
      .from(posts)
      .where(
        sql`${posts.id} in (${sql.join(
          postIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    expect(remaining).toEqual([{ id: postIds[1] }]);
    const [update] = await database
      .select({ status: lifeUpdates.status })
      .from(lifeUpdates)
      .where(eq(lifeUpdates.id, lifeUpdateId));
    expect(update?.status).toBe('active');
  });
});
