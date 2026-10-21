import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';
import { users } from './identity.js';
import { boxes } from './boxes.js';

export const mediaStatus = paldoraSchema.enum('media_status', [
  'pending',
  'processing',
  'ready',
  'failed',
  'deleted',
]);

/**
 * One uploaded image and its derivatives. Image bytes never enter PostgreSQL;
 * only object keys do, and they never leave the server.
 *
 * `owner_user_id` is RESTRICT, not CASCADE: removing a user must first
 * schedule storage cleanup through the outbox, so no object is orphaned.
 */
export const mediaAssets = paldoraSchema.table(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    purpose: text('purpose').notNull(),
    /**
     * Box-scoped purposes (post photos) name their Box. SET NULL, because Box
     * deletion first tombstones these assets and queues storage cleanup.
     */
    boxId: uuid('box_id').references((): AnyPgColumn => boxes.id, {
      onDelete: 'set null',
    }),
    status: mediaStatus('status').notNull().default('pending'),
    contentType: text('content_type').notNull(),
    contentLength: bigint('content_length', { mode: 'number' }).notNull(),
    uploadObjectKey: text('upload_object_key').notNull(),
    uploadExpiresAt: timestamp('upload_expires_at', {
      withTimezone: true,
    }).notNull(),
    masterObjectKey: text('master_object_key'),
    displayObjectKey: text('display_object_key'),
    thumbnailObjectKey: text('thumbnail_object_key'),
    width: integer('width'),
    height: integer('height'),
    failureReason: text('failure_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('media_assets_upload_object_key_unique').on(
      table.uploadObjectKey,
    ),
    index('media_assets_owner_purpose_index').on(
      table.ownerUserId,
      table.purpose,
      table.createdAt.desc(),
    ),
    index('media_assets_pending_expiry_index')
      .on(table.uploadExpiresAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      'media_assets_purpose_check',
      sql`${table.purpose} in ('avatar', 'post_image', 'reaction_image', 'life_update_image', 'room_banner')`,
    ),
    // User-scoped purposes never name a Box (a Life Update photo serves every
    // delivery Box); Box-scoped ones always do until they are tombstoned.
    check(
      'media_assets_box_scope_check',
      sql`(${table.purpose} in ('avatar', 'life_update_image', 'room_banner') and ${table.boxId} is null)
        or (${table.purpose} in ('post_image', 'reaction_image') and (${table.boxId} is not null or ${table.status} = 'deleted'))`,
    ),
    // The referent of the Room banner's composite foreign key (Phase 7): a
    // banner must be the Room owner's own `room_banner` asset.
    uniqueIndex('media_assets_id_owner_purpose_unique').on(
      table.id,
      table.ownerUserId,
      table.purpose,
    ),
    index('media_assets_box_index')
      .on(table.boxId)
      .where(sql`${table.boxId} is not null`),
    index('media_assets_unattached_index')
      .on(table.updatedAt)
      .where(
        sql`${table.purpose} in ('post_image', 'reaction_image', 'life_update_image', 'room_banner') and ${table.status} = 'ready'`,
      ),
    check(
      'media_assets_content_type_check',
      sql`${table.contentType} in ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      'media_assets_content_length_check',
      sql`${table.contentLength} between 1 and 10485760`,
    ),
    check(
      'media_assets_ready_check',
      sql`${table.status} <> 'ready' or (${table.masterObjectKey} is not null and ${table.displayObjectKey} is not null and ${table.thumbnailObjectKey} is not null and ${table.width} > 0 and ${table.height} > 0)`,
    ),
    check(
      'media_assets_failure_reason_check',
      sql`${table.failureReason} is null or ${table.failureReason} in ('upload_mismatch', 'undecodable', 'processing_exhausted', 'expired')`,
    ),
  ],
);

export const outboxStatus = paldoraSchema.enum('outbox_status', [
  'pending',
  'published',
  'completed',
  'dead',
]);

export interface MediaJobPayload {
  /** Present for `media.process`. */
  readonly mediaAssetId?: string;
  /**
   * Present for `media.delete`. Keys are snapshotted when the row is written,
   * so later cascades or updates cannot lose them.
   */
  readonly objectKeys?: readonly string[];
}

/**
 * Durable intent for media work. The outbox ID is the BullMQ job ID. The
 * worker, not the enqueuer, marks a row `completed`; exhausted retries mark
 * it `dead` so nothing is silently dropped.
 */
export const mediaJobOutbox = paldoraSchema.table(
  'media_job_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobType: text('job_type').notNull(),
    payload: jsonb('payload').$type<MediaJobPayload>().notNull(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('media_job_outbox_dispatch_index')
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      'media_job_outbox_job_type_check',
      sql`${table.jobType} in ('media.process', 'media.delete')`,
    ),
    check(
      'media_job_outbox_payload_check',
      sql`(${table.jobType} = 'media.process' and ${table.payload} ? 'mediaAssetId') or (${table.jobType} = 'media.delete' and jsonb_typeof(${table.payload} -> 'objectKeys') = 'array')`,
    ),
    check('media_job_outbox_attempts_check', sql`${table.attempts} >= 0`),
    check(
      'media_job_outbox_completed_check',
      sql`(${table.status} = 'completed') = (${table.completedAt} is not null)`,
    ),
  ],
);

export type MediaAssetRow = typeof mediaAssets.$inferSelect;

export type MediaJobOutboxRow = typeof mediaJobOutbox.$inferSelect;
