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
  mediaAssets,
  notifications,
  postReactions,
  posts,
  userPreferences,
  users,
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
    expect(before).toBeGreaterThanOrEqual(6);
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
