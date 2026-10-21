import { sql } from 'drizzle-orm';
import {
  check,
  index,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';
import { users } from './identity.js';

export const friendshipStatus = paldoraSchema.enum('friendship_status', [
  'pending',
  'accepted',
  'declined',
]);

/**
 * One row per pair of people, stored canonically (`user_low_id < user_high_id`)
 * so a pair can never exist twice. Blocks are NOT here (ADR 013).
 */
export const friendships = paldoraSchema.table(
  'friendships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userLowId: uuid('user_low_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userHighId: uuid('user_high_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    initiatedByUserId: uuid('initiated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatus('status').notNull().default('pending'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('friendships_pair_unique').on(
      table.userLowId,
      table.userHighId,
    ),
    index('friendships_low_status_index').on(table.userLowId, table.status),
    index('friendships_high_status_index').on(table.userHighId, table.status),
    check(
      'friendships_canonical_pair_check',
      sql`${table.userLowId} < ${table.userHighId}`,
    ),
    check(
      'friendships_initiator_is_party_check',
      sql`${table.initiatedByUserId} in (${table.userLowId}, ${table.userHighId})`,
    ),
  ],
);

/**
 * Directional: A blocking B and B blocking A are independent rows, so each
 * person's block survives the other's unblock. Every visibility query treats
 * a block in either direction as hiding both people from each other.
 */
export const userBlocks = paldoraSchema.table(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    index('user_blocks_blocked_index').on(table.blockedId),
    check(
      'user_blocks_distinct_check',
      sql`${table.blockerId} <> ${table.blockedId}`,
    ),
  ],
);

export type FriendshipRow = typeof friendships.$inferSelect;
