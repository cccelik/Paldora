import {
  bigint,
  boolean,
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
  'processing',
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
export const commentStatus = paldoraSchema.enum('comment_status', [
  'active',
  'deleted',
]);
export const activityEventType = paldoraSchema.enum('activity_event_type', [
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'reaction.set',
  'comment.reaction.set',
  'life_update.published',
]);
export const notificationType = paldoraSchema.enum('notification_type', [
  'post.comment',
  'comment.reply',
  'post.reaction',
  'comment.reaction',
  'life_update.published',
]);
export const lifeUpdateStatus = paldoraSchema.enum('life_update_status', [
  'active',
  'deleted',
]);
export const lifeUpdateAudience = paldoraSchema.enum('life_update_audience', [
  'box',
  'only_me',
]);
export const roomVisibility = paldoraSchema.enum('room_visibility', [
  'friends',
  'members',
  'hidden',
]);
export const roomLayout = paldoraSchema.enum('room_layout', [
  'single',
  'two_column',
]);
export const roomWidgetPlacement = paldoraSchema.enum('room_widget_placement', [
  'main',
  'sidebar',
]);
export const topFriendsVisibility = paldoraSchema.enum(
  'top_friends_visibility',
  ['visible', 'friends', 'hidden'],
);
export const appearancePreference = paldoraSchema.enum(
  'appearance_preference',
  ['light', 'dark', 'system'],
);

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

export const mediaAssets = paldoraSchema.table(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boxId: uuid('box_id').references(() => boxes.id, {
      onDelete: 'cascade',
    }),
    purpose: text('purpose').notNull().default('avatar'),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    contentLength: bigint('content_length', { mode: 'number' }).notNull(),
    displayObjectKey: text('display_object_key'),
    thumbnailObjectKey: text('thumbnail_object_key'),
    width: integer('width'),
    height: integer('height'),
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
    index('media_assets_box_status_index').on(table.boxId, table.status),
    check(
      'media_assets_purpose_check',
      sql`${table.purpose} in ('avatar', 'post_image', 'reaction_image', 'life_update_image', 'room_banner')`,
    ),
    check(
      'media_assets_purpose_box_check',
      sql`(${table.purpose} in ('avatar', 'life_update_image', 'room_banner') and ${table.boxId} is null) or (${table.purpose} in ('post_image', 'reaction_image') and ${table.boxId} is not null)`,
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

export interface MediaJobPayload {
  mediaAssetId: string;
  objectKeys?: string[];
}

export const mediaJobOutbox = paldoraSchema.table(
  'media_job_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobType: text('job_type').notNull(),
    mediaAssetId: uuid('media_asset_id').notNull(),
    payload: jsonb('payload').$type<MediaJobPayload>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('media_job_outbox_pending_index')
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.publishedAt} is null`),
    index('media_job_outbox_media_asset_index').on(table.mediaAssetId),
    check(
      'media_job_outbox_job_type_check',
      sql`${table.jobType} in ('delete-media-object', 'process-post-image')`,
    ),
    check('media_job_outbox_attempts_check', sql`${table.attempts} >= 0`),
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
    reactionPresets: jsonb('reaction_presets')
      .$type<readonly [string, string, string, string, string]>()
      .notNull()
      .default(['👍', '❤️', '😂', '😮', '😢']),
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

export const rooms = paldoraSchema.table(
  'rooms',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    visibility: roomVisibility('visibility').notNull().default('friends'),
    themePreset: text('theme_preset').notNull().default('cream_paper'),
    configurationVersion: integer('configuration_version').notNull().default(1),
    layout: roomLayout('layout').notNull().default('two_column'),
    accent: text('accent').notNull().default('gold'),
    background: text('background').notNull().default('theme'),
    font: text('font').notNull().default('editorial'),
    decorationPack: text('decoration_pack').notNull().default('tape'),
    sparkles: boolean('sparkles').notNull().default(false),
    location: text('location'),
    currently: text('currently'),
    musicUrl: text('music_url'),
    musicTitle: text('music_title'),
    musicArtist: text('music_artist'),
    bannerMediaId: uuid('banner_media_id').references(() => mediaAssets.id, {
      onDelete: 'set null',
    }),
    topFriendsSize: integer('top_friends_size').notNull().default(8),
    topFriendsVisibility: topFriendsVisibility('top_friends_visibility')
      .notNull()
      .default('visible'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('rooms_visibility_index').on(table.visibility, table.updatedAt),
    check(
      'rooms_configuration_version_check',
      sql`${table.configurationVersion} = 1`,
    ),
    check(
      'rooms_theme_preset_check',
      sql`${table.themePreset} in ('obsidian_gold', 'cream_paper', 'lavender_dream', 'ocean_glow', 'daisy_day', 'neon_night', 'y2k_glitter', 'dark_academia', 'frutiger_aero', 'tumblr_2014', 'retro_windows', 'cyberpunk', 'minimal_editorial', 'polaroid_scrapbook')`,
    ),
    check(
      'rooms_accent_check',
      sql`${table.accent} in ('gold', 'lavender', 'ocean', 'daisy', 'pink', 'emerald', 'cyan', 'crimson')`,
    ),
    check(
      'rooms_background_check',
      sql`${table.background} in ('theme', 'paper', 'midnight', 'gradient', 'scrapbook', 'terminal')`,
    ),
    check(
      'rooms_font_check',
      sql`${table.font} in ('editorial', 'modern', 'rounded', 'mono', 'handwritten')`,
    ),
    check(
      'rooms_decoration_pack_check',
      sql`${table.decorationPack} in ('none', 'stars', 'flowers', 'stickers', 'tape', 'pixels')`,
    ),
    check(
      'rooms_location_length_check',
      sql`${table.location} is null or char_length(${table.location}) <= 120`,
    ),
    check(
      'rooms_currently_length_check',
      sql`${table.currently} is null or char_length(${table.currently}) <= 240`,
    ),
    check(
      'rooms_music_url_length_check',
      sql`${table.musicUrl} is null or char_length(${table.musicUrl}) <= 2048`,
    ),
    check(
      'rooms_music_title_length_check',
      sql`${table.musicTitle} is null or char_length(${table.musicTitle}) <= 120`,
    ),
    check(
      'rooms_music_artist_length_check',
      sql`${table.musicArtist} is null or char_length(${table.musicArtist}) <= 120`,
    ),
    check(
      'rooms_music_https_check',
      sql`${table.musicUrl} is null or ${table.musicUrl} like 'https://%'`,
    ),
    check(
      'rooms_top_friends_size_check',
      sql`${table.topFriendsSize} in (4, 8, 12)`,
    ),
  ],
);

export const roomWidgets = paldoraSchema.table(
  'room_widgets',
  {
    roomUserId: uuid('room_user_id')
      .notNull()
      .references(() => rooms.userId, { onDelete: 'cascade' }),
    widgetType: text('widget_type').notNull(),
    placement: roomWidgetPlacement('placement').notNull(),
    position: integer('position').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roomUserId, table.widgetType] }),
    uniqueIndex('room_widgets_position_unique').on(
      table.roomUserId,
      table.position,
    ),
    check(
      'room_widgets_type_check',
      sql`${table.widgetType} in ('currently', 'music', 'top_friends', 'photos', 'life_updates', 'posts', 'memories')`,
    ),
    check(
      'room_widgets_position_check',
      sql`${table.position} between 0 and 6`,
    ),
  ],
);

export const roomTopFriends = paldoraSchema.table(
  'room_top_friends',
  {
    roomUserId: uuid('room_user_id')
      .notNull()
      .references(() => rooms.userId, { onDelete: 'cascade' }),
    friendUserId: uuid('friend_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roomUserId, table.friendUserId] }),
    uniqueIndex('room_top_friends_position_unique').on(
      table.roomUserId,
      table.position,
    ),
    check(
      'room_top_friends_position_check',
      sql`${table.position} between 0 and 11`,
    ),
    check(
      'room_top_friends_not_self_check',
      sql`${table.roomUserId} <> ${table.friendUserId}`,
    ),
  ],
);

export const userPreferences = paldoraSchema.table('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  appearance: appearancePreference('appearance').notNull().default('system'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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

export interface LifeUpdateSectionData {
  lifeLately?: string;
  workOrUniversity?: string;
  travel?: string;
  currentlyInto?: string;
  listeningTo?: string;
  watching?: string;
  reading?: string;
  excitedAbout?: string;
  whatsNext?: string;
}

export const lifeUpdates = paldoraSchema.table(
  'life_updates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sections: jsonb('sections').$type<LifeUpdateSectionData>().notNull(),
    status: lifeUpdateStatus('status').notNull().default('active'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('life_updates_author_chronological_index').on(
      table.authorUserId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      'life_updates_deleted_at_state_check',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} is not null)`,
    ),
  ],
);

export const lifeUpdateDeliveries = paldoraSchema.table(
  'life_update_deliveries',
  {
    postId: uuid('post_id')
      .primaryKey()
      .references(() => posts.id, { onDelete: 'cascade' }),
    lifeUpdateId: uuid('life_update_id')
      .notNull()
      .references(() => lifeUpdates.id, { onDelete: 'cascade' }),
    audience: lifeUpdateAudience('audience').notNull(),
    boxId: uuid('box_id').references(() => boxes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('life_update_deliveries_box_unique')
      .on(table.lifeUpdateId, table.boxId)
      .where(sql`${table.audience} = 'box'`),
    uniqueIndex('life_update_deliveries_only_me_unique')
      .on(table.lifeUpdateId)
      .where(sql`${table.audience} = 'only_me'`),
    index('life_update_deliveries_life_update_index').on(table.lifeUpdateId),
    check(
      'life_update_deliveries_audience_box_check',
      sql`(${table.audience} = 'box' and ${table.boxId} is not null) or (${table.audience} = 'only_me' and ${table.boxId} is null)`,
    ),
  ],
);

export const lifeUpdateMedia = paldoraSchema.table(
  'life_update_media',
  {
    mediaAssetId: uuid('media_asset_id')
      .primaryKey()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    lifeUpdateId: uuid('life_update_id')
      .notNull()
      .references(() => lifeUpdates.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('life_update_media_position_unique').on(
      table.lifeUpdateId,
      table.position,
    ),
    index('life_update_media_life_update_index').on(table.lifeUpdateId),
    check(
      'life_update_media_position_check',
      sql`${table.position} between 0 and 3`,
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
    boxId: uuid('box_id').references(() => boxes.id, { onDelete: 'cascade' }),
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
      sql`(${table.status} = 'active' and char_length(${table.content}) between 0 and 5000) or (${table.status} = 'deleted' and ${table.content} = '')`,
    ),
    check(
      'posts_deleted_at_state_check',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} is not null)`,
    ),
  ],
);

export const postMedia = paldoraSchema.table(
  'post_media',
  {
    mediaAssetId: uuid('media_asset_id')
      .primaryKey()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('post_media_post_position_unique').on(
      table.postId,
      table.position,
    ),
    index('post_media_post_index').on(table.postId),
    check('post_media_position_check', sql`${table.position} between 0 and 3`),
  ],
);

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
    parentCommentId: uuid('parent_comment_id').references(
      (): AnyPgColumn => comments.id,
      { onDelete: 'cascade' },
    ),
    content: text('content').notNull(),
    status: commentStatus('status').notNull().default('active'),
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
    index('comments_post_root_chronological_index').on(
      table.postId,
      table.parentCommentId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('comments_parent_chronological_index').on(
      table.parentCommentId,
      table.createdAt,
      table.id,
    ),
    index('comments_author_status_index').on(table.authorUserId, table.status),
    check(
      'comments_content_state_check',
      sql`(${table.status} = 'active' and char_length(${table.content}) between 1 and 2000) or (${table.status} = 'deleted' and ${table.content} = '')`,
    ),
    check(
      'comments_deleted_at_state_check',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} is not null)`,
    ),
    check(
      'comments_not_own_parent_check',
      sql`${table.parentCommentId} is null or ${table.parentCommentId} <> ${table.id}`,
    ),
  ],
);

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
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index('post_reactions_post_kind_index').on(table.postId, table.kind),
    index('post_reactions_user_index').on(table.userId, table.updatedAt.desc()),
    uniqueIndex('post_reactions_media_asset_unique').on(table.mediaAssetId),
    check(
      'post_reactions_real_media_check',
      sql`(${table.kind} = 'real') = (${table.mediaAssetId} is not null)`,
    ),
    check(
      'post_reactions_kind_length_check',
      sql`char_length(${table.kind}) between 1 and 64`,
    ),
  ],
);

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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index('comment_reactions_comment_kind_index').on(
      table.commentId,
      table.kind,
    ),
    index('comment_reactions_user_index').on(
      table.userId,
      table.updatedAt.desc(),
    ),
    check(
      'comment_reactions_kind_length_check',
      sql`char_length(${table.kind}) between 1 and 64`,
    ),
  ],
);

export interface ActivityEventPayload {
  boxId?: string;
  postId?: string;
  commentId?: string;
  parentCommentId?: string;
  recipientUserId?: string;
  reactionKind?: string;
  lifeUpdateId?: string;
  boxIds?: string[];
}

export const activityEvents = paldoraSchema.table(
  'activity_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: activityEventType('type').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload').$type<ActivityEventPayload>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('activity_events_dedupe_key_unique').on(table.dedupeKey),
    index('activity_events_pending_index')
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.processedAt} is null`),
    check('activity_events_attempts_check', sql`${table.attempts} >= 0`),
  ],
);

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
    activityEventId: uuid('activity_event_id')
      .notNull()
      .references(() => activityEvents.id, { onDelete: 'cascade' }),
    dedupeKey: text('dedupe_key').notNull(),
    type: notificationType('type').notNull(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, {
      onDelete: 'cascade',
    }),
    lifeUpdateId: uuid('life_update_id').references(() => lifeUpdates.id, {
      onDelete: 'cascade',
    }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('notifications_activity_recipient_unique').on(
      table.activityEventId,
      table.recipientUserId,
    ),
    uniqueIndex('notifications_dedupe_key_unique').on(table.dedupeKey),
    index('notifications_recipient_chronological_index').on(
      table.recipientUserId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('notifications_recipient_unread_index')
      .on(table.recipientUserId, table.createdAt.desc())
      .where(sql`${table.readAt} is null`),
    check(
      'notifications_distinct_users_check',
      sql`${table.actorUserId} <> ${table.recipientUserId}`,
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
