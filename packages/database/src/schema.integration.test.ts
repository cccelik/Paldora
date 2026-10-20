import { requireEnvironmentVariables } from '@paldora/config';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  activityEvents,
  boxes,
  commentReactions,
  comments,
  createDatabaseConnection,
  lifeUpdateDeliveries,
  lifeUpdateMedia,
  lifeUpdates,
  mediaAssets,
  notifications,
  postReactions,
  posts,
  userPreferences,
  users,
  type DatabaseTransaction,
} from './index.js';

const { DATABASE_URL } = requireEnvironmentVariables(
  ['DATABASE_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 2,
  applicationName: 'paldora-schema-test',
});
const database = connection.database;

afterAll(() => connection.close());

interface PostgresFailure {
  readonly code: string | undefined;
  readonly constraint: string | undefined;
}

/** The PostgreSQL error behind a rejected write (Drizzle wraps it). */
async function failureOf(write: Promise<unknown>): Promise<PostgresFailure> {
  try {
    await write;
  } catch (error) {
    let current: unknown = error;
    while (typeof current === 'object' && current !== null) {
      const candidate = current as {
        code?: unknown;
        constraint?: unknown;
        cause?: unknown;
      };
      if (typeof candidate.code === 'string') {
        return {
          code: candidate.code,
          constraint:
            typeof candidate.constraint === 'string'
              ? candidate.constraint
              : undefined,
        };
      }
      current = candidate.cause;
    }
    throw error;
  }
  throw new Error('The write was expected to fail.');
}

const CHECK = '23514';
const UNIQUE = '23505';
const FOREIGN_KEY = '23503';

async function newUser() {
  const email = `schema-${randomUUID()}@example.test`;
  const [user] = await database
    .insert(users)
    .values({
      authSubject: `schema-${randomUUID()}`,
      email,
      emailNormalized: email,
    })
    .returning({ id: users.id });
  if (!user) throw new Error('user insert failed');
  return user.id;
}

async function newPost(boxId: string, authorUserId: string) {
  const [post] = await database
    .insert(posts)
    .values({ boxId, authorUserId, content: 'hello' })
    .returning({ id: posts.id });
  if (!post) throw new Error('post insert failed');
  return post.id;
}

/** A Box with one post by `author`. */
async function scene() {
  const author = await newUser();
  const [box] = await database
    .insert(boxes)
    .values({ name: 'Schema' })
    .returning({ id: boxes.id });
  if (!box) throw new Error('box insert failed');
  const postId = await newPost(box.id, author);
  return { author, boxId: box.id, postId };
}

async function newComment(
  postId: string,
  authorUserId: string,
  parentCommentId: string | null = null,
) {
  const [comment] = await database
    .insert(comments)
    .values({ postId, authorUserId, parentCommentId, content: 'nice' })
    .returning({ id: comments.id, depth: comments.depth });
  if (!comment) throw new Error('comment insert failed');
  return comment;
}

async function reactionImage(
  ownerUserId: string,
  boxId: string,
  status: 'ready' | 'deleted' = 'ready',
) {
  const key = `test/${randomUUID()}`;
  const [asset] = await database
    .insert(mediaAssets)
    .values({
      ownerUserId,
      purpose: 'reaction_image',
      boxId,
      status,
      contentType: 'image/jpeg',
      contentLength: 1024,
      uploadObjectKey: key,
      uploadExpiresAt: new Date(Date.now() + 60_000),
      masterObjectKey: `${key}/master`,
      displayObjectKey: `${key}/display`,
      thumbnailObjectKey: `${key}/thumbnail`,
      width: 10,
      height: 10,
    })
    .returning({ id: mediaAssets.id });
  if (!asset) throw new Error('asset insert failed');
  return asset.id;
}

describe('migrated database', () => {
  it('is reachable', async () => {
    await expect(connection.check()).resolves.toBeUndefined();
  });

  it('contains the paldora schema and the migration journal', async () => {
    const result = await database.execute<{ name: string }>(sql`
      select table_schema || '.' || table_name as name
      from information_schema.tables
      where table_schema = 'paldora' and table_name = '__drizzle_migrations'
    `);
    expect(result.rows).toEqual([{ name: 'paldora.__drizzle_migrations' }]);
  });

  it('applies the migrations again as a no-op', async () => {
    const count = async () =>
      (
        await database.execute<{ count: number }>(
          sql`select count(*)::int as count from paldora.__drizzle_migrations`,
        )
      ).rows[0]?.count;
    const before = await count();
    await migrate(database, {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
      migrationsSchema: 'paldora',
      migrationsTable: '__drizzle_migrations',
    });
    expect(await count()).toBe(before);
    expect(before).toBeGreaterThanOrEqual(7);
  });
});

describe('comments', () => {
  it('derives depth from the parent and allows a reply to a root', async () => {
    const { author, postId } = await scene();
    const root = await newComment(postId, author);
    const reply = await newComment(postId, author, root.id);
    expect([root.depth, reply.depth]).toEqual([0, 1]);
  });

  it('rejects a reply to a reply', async () => {
    const { author, postId } = await scene();
    const root = await newComment(postId, author);
    const reply = await newComment(postId, author, root.id);
    const failure = await failureOf(newComment(postId, author, reply.id));
    expect(failure).toEqual({
      code: FOREIGN_KEY,
      constraint: 'comments_parent_root_fk',
    });
  });

  it('rejects a parent from another post', async () => {
    const { author, boxId, postId } = await scene();
    const otherPost = await newPost(boxId, author);
    const root = await newComment(postId, author);
    const failure = await failureOf(newComment(otherPost, author, root.id));
    expect(failure.code).toBe(FOREIGN_KEY);
  });

  it('rejects a reply target on a root and writes to the generated depth', async () => {
    const { author, postId } = await scene();
    const failure = await failureOf(
      database.insert(comments).values({
        postId,
        authorUserId: author,
        content: 'x',
        replyToUserId: author,
      }),
    );
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'comments_reply_to_check',
    });
    const generated = await failureOf(
      database.execute(
        sql`insert into paldora.comments (post_id, author_user_id, content, depth) values (${postId}, ${author}, 'x', 1)`,
      ),
    );
    expect(generated.code).toBe('428C9');
  });

  it.each([
    ['empty active text', { content: '' }],
    ['oversized active text', { content: 'x'.repeat(2001) }],
    ['missing active text', { content: null }],
    ['deleted with text', { status: 'deleted', deletedAt: new Date() }],
    ['deleted without a time', { status: 'deleted', content: null }],
  ] as const)('enforces the lifecycle: %s', async (_name, values) => {
    const { author, postId } = await scene();
    const failure = await failureOf(
      database
        .insert(comments)
        .values({ postId, authorUserId: author, content: 'ok', ...values }),
    );
    expect(failure).toEqual({
      code: CHECK,
      constraint: 'comments_content_lifecycle_check',
    });
  });

  it('accepts a tombstone and 2,000 characters', async () => {
    const { author, postId } = await scene();
    await database.insert(comments).values({
      postId,
      authorUserId: author,
      content: 'x'.repeat(2000),
    });
    const root = await newComment(postId, author);
    await database
      .update(comments)
      .set({ status: 'deleted', content: null, deletedAt: new Date() })
      .where(eq(comments.id, root.id));
    // A reply to a tombstoned root is still structurally valid.
    await expect(newComment(postId, author, root.id)).resolves.toBeDefined();
  });
});

describe('reactions', () => {
  it('pairs a camera reaction with exactly one image', async () => {
    const { author, boxId, postId } = await scene();
    const reactor = await newUser();
    const realWithout = await failureOf(
      database
        .insert(postReactions)
        .values({ postId, userId: reactor, kind: 'real' }),
    );
    expect(realWithout.constraint).toBe('post_reactions_real_media_check');
    const image = await reactionImage(author, boxId);
    const emojiWith = await failureOf(
      database
        .insert(postReactions)
        .values({ postId, userId: reactor, kind: '👍', mediaAssetId: image }),
    );
    expect(emojiWith.constraint).toBe('post_reactions_real_media_check');
    await database
      .insert(postReactions)
      .values({ postId, userId: author, kind: 'real', mediaAssetId: image });
    const secondUse = await failureOf(
      database
        .insert(postReactions)
        .values({ postId, userId: reactor, kind: 'real', mediaAssetId: image }),
    );
    expect(secondUse).toEqual({
      code: UNIQUE,
      constraint: 'post_reactions_media_asset_unique',
    });
  });

  it('allows one reaction per person per post and per comment', async () => {
    const { author, postId } = await scene();
    await database
      .insert(postReactions)
      .values({ postId, userId: author, kind: '👍' });
    const again = await failureOf(
      database
        .insert(postReactions)
        .values({ postId, userId: author, kind: '❤️' }),
    );
    expect(again.code).toBe(UNIQUE);
    const comment = await newComment(postId, author);
    await database
      .insert(commentReactions)
      .values({ commentId: comment.id, userId: author, kind: '👍' });
    const twice = await failureOf(
      database
        .insert(commentReactions)
        .values({ commentId: comment.id, userId: author, kind: '😂' }),
    );
    expect(twice.code).toBe(UNIQUE);
  });

  it('rejects camera and empty kinds on comments and long kinds anywhere', async () => {
    const { author, postId } = await scene();
    const comment = await newComment(postId, author);
    for (const kind of ['real', '', 'x'.repeat(65)]) {
      const failure = await failureOf(
        database
          .insert(commentReactions)
          .values({ commentId: comment.id, userId: author, kind }),
      );
      expect(failure.constraint).toBe('comment_reactions_kind_check');
    }
    const long = await failureOf(
      database
        .insert(postReactions)
        .values({ postId, userId: author, kind: 'x'.repeat(65) }),
    );
    expect(long.constraint).toBe('post_reactions_kind_length_check');
  });
});

describe('reaction images', () => {
  it('requires a Box unless tombstoned', async () => {
    const { author, boxId } = await scene();
    await expect(reactionImage(author, boxId)).resolves.toBeDefined();
    const failure = await failureOf(
      database.insert(mediaAssets).values({
        ownerUserId: author,
        purpose: 'reaction_image',
        contentType: 'image/jpeg',
        contentLength: 10,
        uploadObjectKey: `test/${randomUUID()}`,
        uploadExpiresAt: new Date(),
      }),
    );
    expect(failure.constraint).toBe('media_assets_box_scope_check');
  });
});

describe('activity events and notifications', () => {
  it('ties the comment to the event type and dedupes events', async () => {
    const { author, postId } = await scene();
    const comment = await newComment(postId, author);
    const withoutComment = await failureOf(
      database.insert(activityEvents).values({
        type: 'comment.created',
        actorUserId: author,
        postId,
        dedupeKey: `post.comment:${randomUUID()}`,
      }),
    );
    expect(withoutComment.constraint).toBe('activity_events_comment_check');
    const reactionWithComment = await failureOf(
      database.insert(activityEvents).values({
        type: 'post.reaction.set',
        actorUserId: author,
        postId,
        commentId: comment.id,
        dedupeKey: `post.reaction:${randomUUID()}`,
      }),
    );
    expect(reactionWithComment.constraint).toBe(
      'activity_events_comment_check',
    );
    const unknown = await failureOf(
      database.insert(activityEvents).values({
        type: 'post.viewed',
        actorUserId: author,
        postId,
        commentId: comment.id,
        dedupeKey: randomUUID(),
      }),
    );
    expect(unknown.constraint).toBe('activity_events_type_check');
    const event = {
      type: 'comment.created',
      actorUserId: author,
      postId,
      commentId: comment.id,
      dedupeKey: `post.comment:${comment.id}`,
    };
    await database.insert(activityEvents).values(event);
    expect(
      (await failureOf(database.insert(activityEvents).values(event)))
        .constraint,
    ).toBe('activity_events_dedupe_key_unique');
    const completedWithoutTime = await failureOf(
      database
        .update(activityEvents)
        .set({ status: 'completed' })
        .where(eq(activityEvents.dedupeKey, event.dedupeKey)),
    );
    expect(completedWithoutTime.constraint).toBe(
      'activity_events_completed_check',
    );
  });

  it('dedupes notifications and forbids notifying yourself', async () => {
    const { author, postId } = await scene();
    const actor = await newUser();
    const comment = await newComment(postId, actor);
    const notification = {
      recipientUserId: author,
      actorUserId: actor,
      type: 'post.comment',
      postId,
      commentId: comment.id,
      dedupeKey: `post.comment:${comment.id}`,
    };
    await database.insert(notifications).values(notification);
    expect(
      (await failureOf(database.insert(notifications).values(notification)))
        .constraint,
    ).toBe('notifications_dedupe_key_unique');
    const self = await failureOf(
      database.insert(notifications).values({
        ...notification,
        actorUserId: author,
        dedupeKey: randomUUID(),
      }),
    );
    expect(self.constraint).toBe('notifications_distinct_people_check');
    const reactionWithComment = await failureOf(
      database.insert(notifications).values({
        ...notification,
        type: 'post.reaction',
        dedupeKey: randomUUID(),
      }),
    );
    expect(reactionWithComment.constraint).toBe('notifications_comment_check');
  });
});

describe('Box deletion', () => {
  it('cascades posts, comments, reactions, events, and notifications', async () => {
    const { author, boxId, postId } = await scene();
    const actor = await newUser();
    const comment = await newComment(postId, actor);
    const image = await reactionImage(actor, boxId);
    await database
      .insert(postReactions)
      .values({ postId, userId: actor, kind: 'real', mediaAssetId: image });
    await database
      .insert(commentReactions)
      .values({ commentId: comment.id, userId: author, kind: '👍' });
    const [event] = await database
      .insert(activityEvents)
      .values({
        type: 'comment.created',
        actorUserId: actor,
        postId,
        commentId: comment.id,
        dedupeKey: `post.comment:${comment.id}`,
      })
      .returning({ id: activityEvents.id });
    await database.insert(notifications).values({
      recipientUserId: author,
      actorUserId: actor,
      type: 'post.comment',
      postId,
      commentId: comment.id,
      activityEventId: event?.id,
      dedupeKey: `post.comment:${comment.id}`,
    });
    // Box deletion tombstones Box-scoped assets first (the API does this).
    await database
      .update(mediaAssets)
      .set({ status: 'deleted' })
      .where(eq(mediaAssets.boxId, boxId));
    await database.delete(boxes).where(eq(boxes.id, boxId));

    const left = await database.execute<{ name: string; count: number }>(sql`
      select 'comments' as name, count(*)::int as count from paldora.comments where post_id = ${postId}
      union all select 'post_reactions', count(*)::int from paldora.post_reactions where post_id = ${postId}
      union all select 'comment_reactions', count(*)::int from paldora.comment_reactions where comment_id = ${comment.id}
      union all select 'activity_events', count(*)::int from paldora.activity_events where post_id = ${postId}
      union all select 'notifications', count(*)::int from paldora.notifications where post_id = ${postId}
    `);
    expect(left.rows.every((row) => row.count === 0)).toBe(true);
    const [asset] = await database
      .select({ status: mediaAssets.status, boxId: mediaAssets.boxId })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, image));
    expect(asset).toEqual({ status: 'deleted', boxId: null });
  });
});

describe('reaction presets', () => {
  it('default to five emoji and must stay at five', async () => {
    const userId = await newUser();
    const [row] = await database
      .insert(userPreferences)
      .values({ userId })
      .returning({ presets: userPreferences.reactionPresets });
    expect(row?.presets).toEqual(['👍', '❤️', '😂', '😮', '😢']);
    const failure = await failureOf(
      database
        .update(userPreferences)
        .set({ reactionPresets: ['👍'] })
        .where(eq(userPreferences.userId, userId)),
    );
    expect(failure.constraint).toBe('user_preferences_reaction_presets_check');
  });
});

// --- Life Updates (Phase 6) -------------------------------------------------

const INTEGRITY = '23000';
const IMMUTABLE = 'life_update_audience_immutable';

async function newBox(name = 'Life') {
  const [box] = await database
    .insert(boxes)
    .values({ name })
    .returning({ id: boxes.id });
  if (!box) throw new Error('box insert failed');
  return box.id;
}

async function insertUpdate(
  tx: DatabaseTransaction,
  authorUserId: string,
  audience: 'boxes' | 'only_me' = 'boxes',
  sections: Record<string, string> = { travel: 'Lisbon' },
) {
  const [update] = await tx
    .insert(lifeUpdates)
    .values({ authorUserId, audience, sections })
    .returning({ id: lifeUpdates.id });
  if (!update) throw new Error('life update insert failed');
  return update.id;
}

async function backingPost(
  tx: DatabaseTransaction,
  boxId: string,
  authorUserId: string,
) {
  const [post] = await tx
    .insert(posts)
    .values({ boxId, authorUserId, kind: 'life_update' })
    .returning({ id: posts.id });
  if (!post) throw new Error('backing post insert failed');
  return post.id;
}

/** A Life Update delivered to each Box, the way the publish service writes it. */
async function publish(author: string, boxIds: readonly string[]) {
  return database.transaction(async (tx) => {
    const lifeUpdateId = await insertUpdate(tx, author);
    const postIds: string[] = [];
    for (const [position, boxId] of boxIds.entries()) {
      // Sequential on one transaction connection.
      const postId = await backingPost(tx, boxId, author);
      await tx.insert(lifeUpdateDeliveries).values({
        lifeUpdateId,
        audience: 'boxes',
        authorUserId: author,
        position,
        boxId,
        postId,
      });
      postIds.push(postId);
    }
    return { lifeUpdateId, postIds };
  });
}

async function publishOnlyMe(author: string) {
  return database.transaction(async (tx) => {
    const lifeUpdateId = await insertUpdate(tx, author, 'only_me');
    await tx.insert(lifeUpdateDeliveries).values({
      lifeUpdateId,
      audience: 'only_me',
      authorUserId: author,
      position: 0,
    });
    return lifeUpdateId;
  });
}

async function lifeUpdatePhoto(ownerUserId: string, boxId: string | null) {
  const key = `test/${randomUUID()}`;
  const [asset] = await database
    .insert(mediaAssets)
    .values({
      ownerUserId,
      purpose: 'life_update_image',
      boxId,
      status: 'ready',
      contentType: 'image/jpeg',
      contentLength: 1024,
      uploadObjectKey: key,
      uploadExpiresAt: new Date(Date.now() + 60_000),
      masterObjectKey: `${key}/master`,
      displayObjectKey: `${key}/display`,
      thumbnailObjectKey: `${key}/thumbnail`,
      width: 10,
      height: 10,
    })
    .returning({ id: mediaAssets.id });
  if (!asset) throw new Error('asset insert failed');
  return asset.id;
}

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
