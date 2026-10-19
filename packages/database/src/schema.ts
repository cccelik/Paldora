import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * Every Paldora table lives in this schema. Feature phases add tables in the
 * phase that owns their invariants, each with a reviewed migration.
 */
export const paldoraSchema = pgSchema('paldora');

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// --- Identity ---------------------------------------------------------------

export const userStatus = paldoraSchema.enum('user_status', [
  'active',
  'suspended',
  'deleted',
]);

export const onboardingState = paldoraSchema.enum('onboarding_state', [
  'username',
  'profile',
  'avatar',
  'complete',
]);

export const appearancePreference = paldoraSchema.enum(
  'appearance_preference',
  ['light', 'dark', 'system'],
);

/**
 * A provisioned Paldora account. `auth_subject` is the identity provider's
 * `sub`; it is never exposed or used as the internal ID.
 */
export const users = paldoraSchema.table(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authSubject: text('auth_subject').notNull(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    status: userStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('users_auth_subject_unique').on(table.authSubject),
    uniqueIndex('users_email_normalized_unique').on(table.emailNormalized),
  ],
);

export const profiles = paldoraSchema.table(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    username: text('username'),
    usernameNormalized: text('username_normalized'),
    displayName: text('display_name'),
    bio: text('bio'),
    // Points only at a `ready` avatar; the worker swaps it after processing.
    avatarMediaId: uuid('avatar_media_id').references(
      (): AnyPgColumn => mediaAssets.id,
      { onDelete: 'set null' },
    ),
    onboardingState: onboardingState('onboarding_state')
      .notNull()
      .default('username'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('profiles_username_normalized_unique')
      .on(table.usernameNormalized)
      .where(sql`${table.usernameNormalized} is not null`),
    check(
      'profiles_username_pair_check',
      sql`(${table.username} is null) = (${table.usernameNormalized} is null)`,
    ),
    check(
      'profiles_username_length_check',
      sql`${table.username} is null or char_length(${table.username}) between 3 and 30`,
    ),
    check(
      'profiles_display_name_length_check',
      sql`${table.displayName} is null or char_length(${table.displayName}) between 1 and 80`,
    ),
    check(
      'profiles_bio_length_check',
      sql`${table.bio} is null or char_length(${table.bio}) <= 500`,
    ),
    // Onboarding can only advance past a step whose data exists.
    check(
      'profiles_onboarding_requirements_check',
      sql`(${table.onboardingState} = 'username' or ${table.username} is not null) and (${table.onboardingState} in ('username', 'profile') or ${table.displayName} is not null)`,
    ),
  ],
);

export const userPreferences = paldoraSchema.table('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  appearance: appearancePreference('appearance').notNull().default('system'),
  updatedAt: updatedAt(),
});

// --- Media ------------------------------------------------------------------

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
    check('media_assets_purpose_check', sql`${table.purpose} in ('avatar')`),
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

// --- Friendships and blocks -------------------------------------------------

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

// --- Boxes ------------------------------------------------------------------

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

export type UserRow = typeof users.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type MediaJobOutboxRow = typeof mediaJobOutbox.$inferSelect;
export type FriendshipRow = typeof friendships.$inferSelect;
export type BoxRow = typeof boxes.$inferSelect;
export type BoxMembershipRow = typeof boxMemberships.$inferSelect;
export type BoxInvitationRow = typeof boxInvitations.$inferSelect;
