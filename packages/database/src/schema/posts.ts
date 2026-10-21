import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';
import { users } from './identity.js';
import { boxes } from './boxes.js';
import { mediaAssets } from './media.js';

export const postStatus = paldoraSchema.enum('post_status', [
  'active',
  'deleted',
]);

/**
 * Text posts in a Box. Deleting keeps a tombstone (who, where, when) and
 * erases the text. Phase 4 adds media and must queue storage deletion before
 * the Box cascade removes these rows.
 */
export const posts = paldoraSchema.table(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    boxId: uuid('box_id')
      .notNull()
      .references(() => boxes.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content'),
    /**
     * `life_update` marks the backing post of one Life Update delivery
     * (Phase 6): it carries no text of its own, only the delivery's
     * comments, reactions, and notifications.
     */
    kind: text('kind').notNull().default('post'),
    status: postStatus('status').notNull().default('active'),
    moderationHidden: boolean('moderation_hidden').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    check('posts_kind_check', sql`${table.kind} in ('post', 'life_update')`),
    check(
      'posts_life_update_content_check',
      sql`${table.kind} = 'post' or ${table.content} is null`,
    ),
    // The referent of the delivery's composite foreign key: a backing post
    // must be a `life_update` post of the same Box and author.
    uniqueIndex('posts_delivery_reference_unique').on(
      table.id,
      table.boxId,
      table.authorUserId,
      table.kind,
    ),
    index('posts_box_feed_index')
      .on(table.boxId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'active'`),
    index('posts_author_index').on(
      table.authorUserId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      'posts_content_lifecycle_check',
      sql`(${table.status} = 'active' and (${table.content} is null or char_length(${table.content}) between 1 and 5000))
        or (${table.status} = 'deleted' and ${table.content} is null and ${table.deletedAt} is not null)`,
    ),
  ],
);

/**
 * Photos on a post, in display order. A photo belongs to at most one post
 * (unique asset), and its position is unique within the post.
 */
export const postMedia = paldoraSchema.table(
  'post_media',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.position] }),
    uniqueIndex('post_media_asset_unique').on(table.mediaAssetId),
    check('post_media_position_check', sql`${table.position} between 0 and 3`),
  ],
);

export type PostRow = typeof posts.$inferSelect;

export type PostMediaRow = typeof postMedia.$inferSelect;
