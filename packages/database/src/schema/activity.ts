import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';
import { users } from './identity.js';
import { posts } from './posts.js';
import { comments } from './interactions.js';

export const activityEventStatus = paldoraSchema.enum('activity_event_status', [
  'pending',
  'completed',
  'dead',
]);

/**
 * The interactions outbox. Written in the same transaction as the comment or
 * reaction that causes it, and projected into notifications by the worker.
 * Real foreign keys (not a JSON payload) make invalid events unrepresentable
 * and let Box deletion cascade. `dedupe_key` equals the notification's key,
 * so recording or projecting twice is harmless.
 */
export const activityEvents = paldoraSchema.table(
  'activity_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: text('type').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, {
      onDelete: 'cascade',
    }),
    dedupeKey: text('dedupe_key').notNull(),
    status: activityEventStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('activity_events_dedupe_key_unique').on(table.dedupeKey),
    index('activity_events_claim_index')
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    index('activity_events_retention_index')
      .on(table.completedAt)
      .where(sql`${table.status} = 'completed'`),
    index('activity_events_actor_index').on(table.actorUserId),
    index('activity_events_post_index').on(table.postId),
    index('activity_events_comment_index')
      .on(table.commentId)
      .where(sql`${table.commentId} is not null`),
    check(
      'activity_events_type_check',
      sql`${table.type} in ('comment.created', 'post.reaction.set', 'comment.reaction.set')`,
    ),
    check(
      'activity_events_comment_check',
      sql`(${table.type} = 'post.reaction.set') = (${table.commentId} is null)`,
    ),
    check('activity_events_attempts_check', sql`${table.attempts} >= 0`),
    check(
      'activity_events_completed_check',
      sql`(${table.status} = 'completed') = (${table.completedAt} is not null)`,
    ),
  ],
);

/**
 * Durable, deduplicated notifications. A row stores IDs only, never content:
 * who did it, the actor's face, the emoji, and the camera image are joined
 * from live rows at read time, with visibility rechecked on every read.
 */
export const notifications = paldoraSchema.table(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, {
      onDelete: 'cascade',
    }),
    // SET NULL, so purging old events never deletes a notification.
    activityEventId: uuid('activity_event_id').references(
      () => activityEvents.id,
      { onDelete: 'set null' },
    ),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('notifications_dedupe_key_unique').on(table.dedupeKey),
    index('notifications_recipient_index').on(
      table.recipientUserId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('notifications_recipient_unread_index')
      .on(table.recipientUserId, table.createdAt.desc())
      .where(sql`${table.readAt} is null`),
    index('notifications_actor_index').on(table.actorUserId),
    index('notifications_post_index').on(table.postId),
    index('notifications_comment_index')
      .on(table.commentId)
      .where(sql`${table.commentId} is not null`),
    index('notifications_activity_event_index')
      .on(table.activityEventId)
      .where(sql`${table.activityEventId} is not null`),
    index('notifications_created_index').on(table.createdAt),
    check(
      'notifications_distinct_people_check',
      sql`${table.recipientUserId} <> ${table.actorUserId}`,
    ),
    check(
      'notifications_type_check',
      sql`${table.type} in ('post.comment', 'comment.reply', 'post.reaction', 'comment.reaction')`,
    ),
    check(
      'notifications_comment_check',
      sql`(${table.type} = 'post.reaction') = (${table.commentId} is null)`,
    ),
  ],
);

export type ActivityEventRow = typeof activityEvents.$inferSelect;

export type NotificationRow = typeof notifications.$inferSelect;
