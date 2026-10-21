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

export const reportTargetKind = paldoraSchema.enum('report_target_kind', [
  'user',
  'box',
  'post',
  'comment',
]);

export const reportCategory = paldoraSchema.enum('report_category', [
  'harassment',
  'spam',
  'privacy',
  'other',
]);

export const reportStatus = paldoraSchema.enum('report_status', [
  'open',
  'closed',
]);

/** IDs remain after target deletion so the queue can close stale allegations. */
export const userReports = paldoraSchema.table(
  'user_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reporterUserId: uuid('reporter_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    targetKind: reportTargetKind('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    category: reportCategory('category').notNull(),
    detail: text('detail'),
    status: reportStatus('status').notNull().default('open'),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('user_reports_reporter_target_unique')
      .on(table.reporterUserId, table.targetKind, table.targetId)
      .where(sql`${table.reporterUserId} is not null`),
    index('user_reports_queue_index').on(
      table.status,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('user_reports_reporter_index').on(
      table.reporterUserId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('user_reports_retention_index')
      .on(table.closedAt)
      .where(sql`${table.status} = 'closed'`),
    check(
      'user_reports_detail_check',
      sql`${table.detail} is null or char_length(${table.detail}) between 1 and 2000`,
    ),
    check(
      'user_reports_closed_check',
      sql`(${table.status} = 'closed') = (${table.closedAt} is not null)`,
    ),
  ],
);

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
    'case.closed',
    'account.lookup',
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
