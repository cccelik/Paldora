import { sql } from 'drizzle-orm';
import {
  check,
  index,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';
import { users } from './identity.js';

export const boxStatus = paldoraSchema.enum('box_status', [
  'active',
  'archived',
]);

export const boxRole = paldoraSchema.enum('box_role', [
  'owner',
  'admin',
  'member',
]);

export const boxMembershipStatus = paldoraSchema.enum('box_membership_status', [
  'active',
  'left',
  'removed',
]);

export const boxInvitationStatus = paldoraSchema.enum('box_invitation_status', [
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
]);

/**
 * A private circle. Ownership is the single `owner` membership (one active
 * owner per Box, enforced by a partial unique index), never a column here.
 */
export const boxes = paldoraSchema.table(
  'boxes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    privacyMode: text('privacy_mode').notNull().default('private'),
    status: boxStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'boxes_name_length_check',
      sql`char_length(${table.name}) between 1 and 80`,
    ),
    check('boxes_private_check', sql`${table.privacyMode} = 'private'`),
  ],
);

export const boxMemberships = paldoraSchema.table(
  'box_memberships',
  {
    boxId: uuid('box_id')
      .notNull()
      .references(() => boxes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: boxRole('role').notNull().default('member'),
    status: boxMembershipStatus('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.boxId, table.userId] }),
    uniqueIndex('box_memberships_one_owner_per_box')
      .on(table.boxId)
      .where(sql`${table.role} = 'owner' and ${table.status} = 'active'`),
    index('box_memberships_user_status_index').on(table.userId, table.status),
    index('box_memberships_box_status_index').on(table.boxId, table.status),
    // Only active members carry a role beyond the default.
    check(
      'box_memberships_inactive_role_check',
      sql`${table.status} = 'active' or ${table.role} = 'member'`,
    ),
  ],
);

export const boxInvitations = paldoraSchema.table(
  'box_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    boxId: uuid('box_id')
      .notNull()
      .references(() => boxes.id, { onDelete: 'cascade' }),
    inviterUserId: uuid('inviter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteeUserId: uuid('invitee_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: boxInvitationStatus('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('box_invitations_pending_pair_unique')
      .on(table.boxId, table.inviteeUserId)
      .where(sql`${table.status} = 'pending'`),
    index('box_invitations_invitee_status_index').on(
      table.inviteeUserId,
      table.status,
    ),
    index('box_invitations_box_status_index').on(table.boxId, table.status),
    check(
      'box_invitations_distinct_users_check',
      sql`${table.inviterUserId} <> ${table.inviteeUserId}`,
    ),
    // Pending invitations have no response; answered ones always do.
    check(
      'box_invitations_responded_check',
      sql`case ${table.status}
        when 'pending' then ${table.respondedAt} is null
        when 'expired' then true
        else ${table.respondedAt} is not null
      end`,
    ),
  ],
);

export type BoxRow = typeof boxes.$inferSelect;

export type BoxMembershipRow = typeof boxMemberships.$inferSelect;

export type BoxInvitationRow = typeof boxInvitations.$inferSelect;
