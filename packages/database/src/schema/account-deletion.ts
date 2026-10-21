import { sql } from 'drizzle-orm';
import {
  check,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paldoraSchema } from './_shared.js';
import { users } from './identity.js';

/** Survives account removal without retaining an email or auth subject. */
export const accountDeletionRequests = paldoraSchema.table(
  'account_deletion_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', {
      withTimezone: true,
    }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'account_deletion_status_check',
      sql`${table.status} in ('pending', 'blocked', 'erasing', 'cancelled', 'completed')`,
    ),
    check(
      'account_deletion_due_check',
      sql`${table.dueAt} >= ${table.requestedAt} + interval '7 days'`,
    ),
    check(
      'account_deletion_lifecycle_check',
      sql`(${table.status} in ('pending', 'blocked', 'erasing') and ${table.userId} is not null and ${table.cancelledAt} is null and ${table.completedAt} is null) or (${table.status} = 'cancelled' and ${table.cancelledAt} is not null and ${table.completedAt} is null) or (${table.status} = 'completed' and ${table.completedAt} is not null and ${table.cancelledAt} is null)`,
    ),
    uniqueIndex('account_deletion_one_live')
      .on(table.userId)
      .where(sql`${table.status} in ('pending', 'blocked', 'erasing')`),
    index('account_deletion_due_index')
      .on(table.nextAttemptAt)
      .where(sql`${table.status} in ('pending', 'blocked')`),
  ],
);
