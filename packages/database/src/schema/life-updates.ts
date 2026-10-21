import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
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
import { boxes } from './boxes.js';
import { mediaAssets } from './media.js';
import { posts } from './posts.js';

export const lifeUpdateAudience = paldoraSchema.enum('life_update_audience', [
  'only_me',
  'boxes',
]);

export const lifeUpdateStatus = paldoraSchema.enum('life_update_status', [
  'active',
  'deleted',
]);

/**
 * A structured update stored once. Its audience is chosen at publish time
 * and never changes (triggers in migration 0006). Deleting keeps a
 * tombstone with the sections erased, so a retried delete stays idempotent.
 * `sections` is a `{ key: text }` object; the shape and lengths are checked
 * by `paldora.life_update_sections_valid` (0006), the key list by the API.
 */
export const lifeUpdates = paldoraSchema.table(
  'life_updates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    audience: lifeUpdateAudience('audience').notNull(),
    status: lifeUpdateStatus('status').notNull().default('active'),
    sections: jsonb('sections')
      .$type<Readonly<Record<string, string>>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('life_updates_id_author_unique').on(table.id, table.authorUserId),
    unique('life_updates_id_audience_unique').on(table.id, table.audience),
    index('life_updates_author_index').on(
      table.authorUserId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      'life_updates_sections_check',
      sql`jsonb_typeof(${table.sections}) = 'object' and paldora.life_update_sections_valid(${table.sections}) is true`,
    ),
    check(
      'life_updates_lifecycle_check',
      sql`(${table.status} = 'active' and ${table.deletedAt} is null)
        or (${table.status} = 'deleted' and ${table.sections} = '{}'::jsonb and ${table.deletedAt} is not null)`,
    ),
  ],
);

/**
 * The audience, stored as rows: one per delivery Box (each with its own
 * backing post, so every Box has an isolated conversation), or a single
 * only-me row with neither. The composite foreign keys make a delivery's
 * audience, author, Box, and post agree with its Life Update and post.
 */
export const lifeUpdateDeliveries = paldoraSchema.table(
  'life_update_deliveries',
  {
    lifeUpdateId: uuid('life_update_id').notNull(),
    audience: lifeUpdateAudience('audience').notNull(),
    authorUserId: uuid('author_user_id').notNull(),
    /** Input order, 0–19; the PK plus this bound caps a Life Update at 20 Boxes. */
    position: smallint('position').notNull(),
    boxId: uuid('box_id').references(() => boxes.id, { onDelete: 'cascade' }),
    postId: uuid('post_id'),
    postKind: text('post_kind')
      .notNull()
      .generatedAlwaysAs(sql`'life_update'`),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.lifeUpdateId, table.position] }),
    unique('life_update_deliveries_box_unique').on(
      table.lifeUpdateId,
      table.boxId,
    ),
    uniqueIndex('life_update_deliveries_post_unique').on(table.postId),
    index('life_update_deliveries_box_index')
      .on(table.boxId, table.lifeUpdateId)
      .where(sql`${table.boxId} is not null`),
    check(
      'life_update_deliveries_position_check',
      sql`${table.position} between 0 and 19`,
    ),
    check(
      'life_update_deliveries_shape_check',
      sql`(${table.audience} = 'only_me' and ${table.boxId} is null and ${table.postId} is null and ${table.position} = 0)
        or (${table.audience} = 'boxes' and ${table.boxId} is not null and ${table.postId} is not null)`,
    ),
    foreignKey({
      name: 'life_update_deliveries_audience_fk',
      columns: [table.lifeUpdateId, table.audience],
      foreignColumns: [lifeUpdates.id, lifeUpdates.audience],
    }).onDelete('cascade'),
    foreignKey({
      name: 'life_update_deliveries_author_fk',
      columns: [table.lifeUpdateId, table.authorUserId],
      foreignColumns: [lifeUpdates.id, lifeUpdates.authorUserId],
    }).onDelete('cascade'),
    // MATCH SIMPLE: the only-me row (null Box and post) skips this key.
    foreignKey({
      name: 'life_update_deliveries_post_fk',
      columns: [table.postId, table.boxId, table.authorUserId, table.postKind],
      foreignColumns: [posts.id, posts.boxId, posts.authorUserId, posts.kind],
    }).onDelete('cascade'),
  ],
);

/**
 * A Life Update's photos, stored once for every delivery. The assets are
 * user-scoped (`life_update_image`) and belong to one Life Update each.
 */
export const lifeUpdateMedia = paldoraSchema.table(
  'life_update_media',
  {
    lifeUpdateId: uuid('life_update_id')
      .notNull()
      .references(() => lifeUpdates.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.lifeUpdateId, table.position] }),
    uniqueIndex('life_update_media_asset_unique').on(table.mediaAssetId),
    check(
      'life_update_media_position_check',
      sql`${table.position} between 0 and 3`,
    ),
  ],
);

export type LifeUpdateRow = typeof lifeUpdates.$inferSelect;

export type LifeUpdateDeliveryRow = typeof lifeUpdateDeliveries.$inferSelect;
