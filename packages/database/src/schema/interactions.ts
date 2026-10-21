import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';
import { users } from './identity.js';
import { mediaAssets } from './media.js';
import { posts } from './posts.js';

export const commentStatus = paldoraSchema.enum('comment_status', [
  'active',
  'deleted',
]);

/**
 * Comments on a post, with exactly one reply level. A reply's parent is
 * always a root in the same post: the generated `depth` columns and the
 * composite self-reference make anything else unrepresentable, whatever the
 * API does. Deleting keeps a tombstone (who, where, when) and erases the text.
 */
export const comments = paldoraSchema.table(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Always a root (depth 0) of the same post, or null for a root. */
    parentCommentId: uuid('parent_comment_id'),
    /** Who a reply answers, for notifications only. */
    replyToUserId: uuid('reply_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    content: text('content'),
    status: commentStatus('status').notNull().default('active'),
    moderationHidden: boolean('moderation_hidden').notNull().default(false),
    depth: smallint('depth')
      .notNull()
      .generatedAlwaysAs(
        sql`case when parent_comment_id is null then 0 else 1 end`,
      ),
    parentDepth: smallint('parent_depth').generatedAlwaysAs(
      sql`case when parent_comment_id is null then null else 0 end`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('comments_id_post_depth_unique').on(
      table.id,
      table.postId,
      table.depth,
    ),
    foreignKey({
      name: 'comments_parent_root_fk',
      columns: [table.parentCommentId, table.postId, table.parentDepth],
      foreignColumns: [table.id, table.postId, table.depth],
    }).onDelete('cascade'),
    index('comments_post_roots_index')
      .on(table.postId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.parentCommentId} is null`),
    index('comments_replies_index')
      .on(table.parentCommentId, table.createdAt, table.id)
      .where(sql`${table.parentCommentId} is not null`),
    index('comments_post_active_index')
      .on(table.postId)
      .where(sql`${table.status} = 'active'`),
    index('comments_author_index').on(table.authorUserId),
    index('comments_reply_to_index')
      .on(table.replyToUserId)
      .where(sql`${table.replyToUserId} is not null`),
    check(
      'comments_content_lifecycle_check',
      sql`(${table.status} = 'active' and ${table.content} is not null and char_length(${table.content}) between 1 and 2000 and ${table.deletedAt} is null)
        or (${table.status} = 'deleted' and ${table.content} is null and ${table.deletedAt} is not null)`,
    ),
    check(
      'comments_reply_to_check',
      sql`${table.parentCommentId} is not null or ${table.replyToUserId} is null`,
    ),
  ],
);

/**
 * One reaction per person per post (the primary key decides races). `kind`
 * is a single emoji or the literal `real`, which always names a camera image
 * that no other reaction uses. Emoji validity is checked by the API; the
 * database bounds the length and the `real` pairing.
 */
export const postReactions = paldoraSchema.table(
  'post_reactions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    // RESTRICT is safe: assets are tombstoned, never hard-deleted.
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    uniqueIndex('post_reactions_media_asset_unique')
      .on(table.mediaAssetId)
      .where(sql`${table.mediaAssetId} is not null`),
    index('post_reactions_post_kind_index').on(table.postId, table.kind),
    index('post_reactions_user_index').on(table.userId),
    index('post_reactions_real_index')
      .on(table.postId, table.createdAt.desc())
      .where(sql`${table.kind} = 'real'`),
    check(
      'post_reactions_kind_length_check',
      sql`char_length(${table.kind}) between 1 and 64`,
    ),
    check(
      'post_reactions_real_media_check',
      sql`(${table.kind} = 'real') = (${table.mediaAssetId} is not null)`,
    ),
  ],
);

/** One emoji reaction per person per comment. Comments take no camera image. */
export const commentReactions = paldoraSchema.table(
  'comment_reactions',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index('comment_reactions_comment_kind_index').on(
      table.commentId,
      table.kind,
    ),
    index('comment_reactions_user_index').on(table.userId),
    check(
      'comment_reactions_kind_check',
      sql`char_length(${table.kind}) between 1 and 64 and ${table.kind} <> 'real'`,
    ),
  ],
);

export type CommentRow = typeof comments.$inferSelect;

export type PostReactionRow = typeof postReactions.$inferSelect;

export type CommentReactionRow = typeof commentReactions.$inferSelect;
