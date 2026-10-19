import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
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

export const userPreferences = paldoraSchema.table(
  'user_preferences',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    appearance: appearancePreference('appearance').notNull().default('system'),
    /**
     * Five personal reaction shortcuts (Phase 5). Emoji validity and
     * distinctness are enforced by the API; any single emoji is always
     * allowed as a reaction, so a preset is only a convenience.
     */
    reactionPresets: text('reaction_presets')
      .array()
      .notNull()
      .default(sql`array['👍', '❤️', '😂', '😮', '😢']::text[]`),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'user_preferences_reaction_presets_check',
      sql`cardinality(${table.reactionPresets}) = 5`,
    ),
  ],
);

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
      sql`${table.purpose} in ('avatar', 'post_image', 'reaction_image')`,
    ),
    check(
      'media_assets_box_scope_check',
      sql`(${table.purpose} = 'avatar' and ${table.boxId} is null)
        or (${table.purpose} in ('post_image', 'reaction_image') and (${table.boxId} is not null or ${table.status} = 'deleted'))`,
    ),
    index('media_assets_box_index')
      .on(table.boxId)
      .where(sql`${table.boxId} is not null`),
    index('media_assets_unattached_index')
      .on(table.updatedAt)
      .where(
        sql`${table.purpose} in ('post_image', 'reaction_image') and ${table.status} = 'ready'`,
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

// --- Posts ------------------------------------------------------------------

export const postStatus = paldoraSchema.enum('post_status', [
  'active',
  'deleted',
]);

/**
 * Text posts in a Box. Deleting keeps a tombstone (who, where, when) and
 * erases the text. Phase 4 adds media and must queue storage deletion before
 * the Box cascade removes these rows.
 */
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
    content: text('content'),
    status: postStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('posts_box_feed_index')
      .on(table.boxId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.status} = 'active'`),
    index('posts_author_index').on(
      table.authorUserId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      'posts_content_lifecycle_check',
      sql`(${table.status} = 'active' and (${table.content} is null or char_length(${table.content}) between 1 and 5000))
        or (${table.status} = 'deleted' and ${table.content} is null and ${table.deletedAt} is not null)`,
    ),
  ],
);

/**
 * Photos on a post, in display order. A photo belongs to at most one post
 * (unique asset), and its position is unique within the post.
 */
export const postMedia = paldoraSchema.table(
  'post_media',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.position] }),
    uniqueIndex('post_media_asset_unique').on(table.mediaAssetId),
    check('post_media_position_check', sql`${table.position} between 0 and 3`),
  ],
);

// --- Comments, reactions, notifications (Phase 5) ---------------------------

export const commentStatus = paldoraSchema.enum('comment_status', [
  'active',
  'deleted',
]);

/**
 * Comments on a post, with exactly one reply level. A reply's parent is
 * always a root in the same post: the generated `depth` columns and the
 * composite self-reference make anything else unrepresentable, whatever the
 * API does. Deleting keeps a tombstone (who, where, when) and erases the text.
 */
export const comments = paldoraSchema.table(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Always a root (depth 0) of the same post, or null for a root. */
    parentCommentId: uuid('parent_comment_id'),
    /** Who a reply answers, for notifications only. */
    replyToUserId: uuid('reply_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    content: text('content'),
    status: commentStatus('status').notNull().default('active'),
    depth: smallint('depth')
      .notNull()
      .generatedAlwaysAs(
        sql`case when parent_comment_id is null then 0 else 1 end`,
      ),
    parentDepth: smallint('parent_depth').generatedAlwaysAs(
      sql`case when parent_comment_id is null then null else 0 end`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    unique('comments_id_post_depth_unique').on(
      table.id,
      table.postId,
      table.depth,
    ),
    foreignKey({
      name: 'comments_parent_root_fk',
      columns: [table.parentCommentId, table.postId, table.parentDepth],
      foreignColumns: [table.id, table.postId, table.depth],
    }).onDelete('cascade'),
    index('comments_post_roots_index')
      .on(table.postId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.parentCommentId} is null`),
    index('comments_replies_index')
      .on(table.parentCommentId, table.createdAt, table.id)
      .where(sql`${table.parentCommentId} is not null`),
    index('comments_post_active_index')
      .on(table.postId)
      .where(sql`${table.status} = 'active'`),
    index('comments_author_index').on(table.authorUserId),
    index('comments_reply_to_index')
      .on(table.replyToUserId)
      .where(sql`${table.replyToUserId} is not null`),
    check(
      'comments_content_lifecycle_check',
      sql`(${table.status} = 'active' and ${table.content} is not null and char_length(${table.content}) between 1 and 2000 and ${table.deletedAt} is null)
        or (${table.status} = 'deleted' and ${table.content} is null and ${table.deletedAt} is not null)`,
    ),
    check(
      'comments_reply_to_check',
      sql`${table.parentCommentId} is not null or ${table.replyToUserId} is null`,
    ),
  ],
);

/**
 * One reaction per person per post (the primary key decides races). `kind`
 * is a single emoji or the literal `real`, which always names a camera image
 * that no other reaction uses. Emoji validity is checked by the API; the
 * database bounds the length and the `real` pairing.
 */
export const postReactions = paldoraSchema.table(
  'post_reactions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    // RESTRICT is safe: assets are tombstoned, never hard-deleted.
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    uniqueIndex('post_reactions_media_asset_unique')
      .on(table.mediaAssetId)
      .where(sql`${table.mediaAssetId} is not null`),
    index('post_reactions_post_kind_index').on(table.postId, table.kind),
    index('post_reactions_user_index').on(table.userId),
    index('post_reactions_real_index')
      .on(table.postId, table.createdAt.desc())
      .where(sql`${table.kind} = 'real'`),
    check(
      'post_reactions_kind_length_check',
      sql`char_length(${table.kind}) between 1 and 64`,
    ),
    check(
      'post_reactions_real_media_check',
      sql`(${table.kind} = 'real') = (${table.mediaAssetId} is not null)`,
    ),
  ],
);

/** One emoji reaction per person per comment. Comments take no camera image. */
export const commentReactions = paldoraSchema.table(
  'comment_reactions',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index('comment_reactions_comment_kind_index').on(
      table.commentId,
      table.kind,
    ),
    index('comment_reactions_user_index').on(table.userId),
    check(
      'comment_reactions_kind_check',
      sql`char_length(${table.kind}) between 1 and 64 and ${table.kind} <> 'real'`,
    ),
  ],
);

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

export type PostRow = typeof posts.$inferSelect;
export type PostMediaRow = typeof postMedia.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type MediaJobOutboxRow = typeof mediaJobOutbox.$inferSelect;
export type FriendshipRow = typeof friendships.$inferSelect;
export type BoxRow = typeof boxes.$inferSelect;
export type BoxMembershipRow = typeof boxMemberships.$inferSelect;
export type BoxInvitationRow = typeof boxInvitations.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type PostReactionRow = typeof postReactions.$inferSelect;
export type CommentReactionRow = typeof commentReactions.$inferSelect;
export type ActivityEventRow = typeof activityEvents.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
