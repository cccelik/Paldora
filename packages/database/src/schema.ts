import {
  bigint,
  check,
  index,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const applicationSchemaName = 'paldora' as const;
export const paldoraSchema = pgSchema(applicationSchemaName);

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
export const mediaStatus = paldoraSchema.enum('media_status', [
  'pending',
  'ready',
  'failed',
]);
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
export const friendshipStatus = paldoraSchema.enum('friendship_status', [
  'pending',
  'accepted',
  'declined',
  'blocked',
]);
export const postStatus = paldoraSchema.enum('post_status', [
  'active',
  'deleted',
]);

export const users = paldoraSchema.table(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authSubject: text('auth_subject').notNull(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    status: userStatus('status').notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('users_auth_subject_unique').on(table.authSubject),
    uniqueIndex('users_email_normalized_unique').on(table.emailNormalized),
  ],
);

export const mediaAssets = paldoraSchema.table(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull().default('avatar'),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    contentLength: bigint('content_length', { mode: 'number' }).notNull(),
    status: mediaStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('media_assets_object_key_unique').on(table.objectKey),
    index('media_assets_owner_status_index').on(
      table.ownerUserId,
      table.status,
    ),
    check(
      'media_assets_avatar_purpose_check',
      sql`${table.purpose} = 'avatar'`,
    ),
    check(
      'media_assets_content_type_check',
      sql`${table.contentType} in ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check(
      'media_assets_content_length_check',
      sql`${table.contentLength} between 1 and 10485760`,
    ),
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
    avatarMediaId: uuid('avatar_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    onboardingState: onboardingState('onboarding_state')
      .notNull()
      .default('username'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
  ],
);

export const boxes = paldoraSchema.table(
  'boxes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    privacyMode: text('privacy_mode').notNull().default('private'),
    status: boxStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('boxes_slug_unique').on(table.slug),
    index('boxes_owner_status_index').on(table.ownerUserId, table.status),
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
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.boxId, table.userId] }),
    uniqueIndex('box_memberships_one_owner_per_box')
      .on(table.boxId)
      .where(sql`${table.role} = 'owner' and ${table.status} = 'active'`),
    index('box_memberships_user_status_index').on(table.userId, table.status),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('box_invitations_pending_pair_unique')
      .on(table.boxId, table.inviteeUserId)
      .where(sql`${table.status} = 'pending'`),
    index('box_invitations_invitee_status_index').on(
      table.inviteeUserId,
      table.status,
    ),
    check(
      'box_invitations_distinct_users_check',
      sql`${table.inviterUserId} <> ${table.inviteeUserId}`,
    ),
  ],
);

export const posts = paldoraSchema.table(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    boxId: uuid('box_id')
      .notNull()
      .references(() => boxes.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    status: postStatus('status').notNull().default('active'),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('posts_box_chronological_index').on(
      table.boxId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('posts_author_status_index').on(table.authorUserId, table.status),
    check(
      'posts_content_state_check',
      sql`(${table.status} = 'active' and char_length(${table.content}) between 1 and 5000) or (${table.status} = 'deleted' and ${table.content} = '')`,
    ),
    check(
      'posts_deleted_at_state_check',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} is not null)`,
    ),
  ],
);

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
    blockedByUserId: uuid('blocked_by_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    status: friendshipStatus('status').notNull().default('pending'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
      sql`${table.userLowId}::text < ${table.userHighId}::text`,
    ),
    check(
      'friendships_initiator_is_party_check',
      sql`${table.initiatedByUserId} in (${table.userLowId}, ${table.userHighId})`,
    ),
    check(
      'friendships_blocker_state_check',
      sql`(${table.status} = 'blocked') = (${table.blockedByUserId} is not null)`,
    ),
    check(
      'friendships_blocker_is_party_check',
      sql`${table.blockedByUserId} is null or ${table.blockedByUserId} in (${table.userLowId}, ${table.userHighId})`,
    ),
  ],
);
