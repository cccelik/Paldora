import { sql } from 'drizzle-orm';
import {
  check,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, paldoraSchema } from './_shared.js';
import { users } from './identity.js';

/** Private, short-lived JSON archives. The object key never enters a response. */
export const accountExports = paldoraSchema.table(
  'account_exports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    objectKey: text('object_key'),
    createdAt: createdAt(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'account_exports_status_check',
      sql`${table.status} in ('pending', 'ready', 'expired')`,
    ),
    check(
      'account_exports_ready_check',
      sql`(${table.status} = 'ready') = (${table.readyAt} is not null and ${table.expiresAt} is not null)`,
    ),
    check(
      'account_exports_key_check',
      sql`(${table.status} in ('pending', 'ready') and ${table.objectKey} is not null) or (${table.status} = 'expired' and ${table.objectKey} is null)`,
    ),
    uniqueIndex('account_exports_one_pending')
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
    index('account_exports_owner_created').on(
      table.userId,
      table.createdAt.desc(),
    ),
    index('account_exports_expiry')
      .on(table.expiresAt)
      .where(sql`${table.status} = 'ready'`),
  ],
);
