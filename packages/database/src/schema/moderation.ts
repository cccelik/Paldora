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

export const staffRole = paldoraSchema.enum('staff_role', [
  'moderator',
  'administrator',
]);

/** Granted only by the audited operator workflow, never from a JWT claim. */
export const staffGrants = paldoraSchema.table('staff_grants', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: staffRole('role').notNull(),
  grantedAt: createdAt(),
});

export const moderationAuditEvent = paldoraSchema.enum(
  'moderation_audit_event',
  [
    'staff.granted',
    'staff.revoked',
    'case.viewed',
    'content.hidden',
    'content.restored',
    'account.suspended',
    'account.unsuspended',
  ],
);

/**
 * Actor and subject IDs deliberately have no foreign keys: account deletion
 * must not cascade away an audit event. The retention policy is decided before
 * account deletion ships.
 */
export const moderationAudit = paldoraSchema.table(
  'moderation_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    event: moderationAuditEvent('event').notNull(),
    reason: text('reason').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('moderation_audit_idempotency_unique').on(table.idempotencyKey),
    index('moderation_audit_subject_index').on(
      table.subjectId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('moderation_audit_actor_index').on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
    check(
      'moderation_audit_reason_check',
      sql`char_length(${table.reason}) between 20 and 1000`,
    ),
  ],
);
