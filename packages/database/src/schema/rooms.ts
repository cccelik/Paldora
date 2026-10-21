import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';
import { users } from './identity.js';
import { mediaAssets } from './media.js';

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

export const roomTopFriendsVisibility = paldoraSchema.enum(
  'room_top_friends_visibility',
  ['visible', 'friends', 'hidden'],
);

/**
 * A person's Room settings, created lazily on the first save (ADR 017). A
 * missing row means the default configuration (`DEFAULT_ROOM` in
 * packages/domain, equal to these column defaults). The allowlists below
 * mirror the domain registry; a test asserts they agree. There is no column
 * that could hold CSS, HTML, a URL other than the HTTPS music link, or a
 * color. Triggers (migration 0007) keep `user_id` and `created_at` fixed,
 * make `updated_at` strictly increase on every write (the stale-save
 * version), and trim Top Friends when the size is lowered.
 */
export const rooms = paldoraSchema.table(
  'rooms',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    configurationVersion: smallint('configuration_version')
      .notNull()
      .default(1),
    visibility: roomVisibility('visibility').notNull().default('friends'),
    themePreset: text('theme_preset').notNull().default('cream_paper'),
    layout: roomLayout('layout').notNull().default('two_column'),
    /** Null follows the preset (accent, font, decoration). */
    accent: text('accent'),
    font: text('font'),
    decorationPack: text('decoration_pack'),
    sparkles: boolean('sparkles').notNull().default(false),
    location: text('location'),
    currently: text('currently'),
    musicUrl: text('music_url'),
    musicTitle: text('music_title'),
    musicArtist: text('music_artist'),
    bannerMediaId: uuid('banner_media_id'),
    bannerPurpose: text('banner_purpose')
      .notNull()
      .generatedAlwaysAs(sql`'room_banner'`),
    topFriendsSize: smallint('top_friends_size').notNull().default(8),
    topFriendsVisibility: roomTopFriendsVisibility('top_friends_visibility')
      .notNull()
      .default('friends'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
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
      sql`${table.accent} is null or ${table.accent} in ('gold', 'lavender', 'ocean', 'daisy', 'pink', 'emerald', 'cyan', 'crimson')`,
    ),
    check(
      'rooms_font_check',
      sql`${table.font} is null or ${table.font} in ('editorial', 'modern', 'rounded', 'mono', 'handwritten')`,
    ),
    check(
      'rooms_decoration_pack_check',
      sql`${table.decorationPack} is null or ${table.decorationPack} in ('none', 'stars', 'flowers', 'stickers', 'tape', 'pixels')`,
    ),
    check(
      'rooms_location_length_check',
      sql`${table.location} is null or char_length(${table.location}) between 1 and 120`,
    ),
    check(
      'rooms_currently_length_check',
      sql`${table.currently} is null or char_length(${table.currently}) between 1 and 240`,
    ),
    // HTTPS only, no userinfo, no whitespace, bounded: the database half of
    // the music link rules (the API also rejects IP literals and localhost).
    check(
      'rooms_music_url_check',
      sql`${table.musicUrl} is null or (${table.musicUrl} like 'https://%' and char_length(${table.musicUrl}) <= 2048 and ${table.musicUrl} !~ '\\s' and ${table.musicUrl} !~ '^https://[^/?#]*@')`,
    ),
    check(
      'rooms_music_title_length_check',
      sql`${table.musicTitle} is null or char_length(${table.musicTitle}) between 1 and 120`,
    ),
    check(
      'rooms_music_artist_length_check',
      sql`${table.musicArtist} is null or char_length(${table.musicArtist}) between 1 and 120`,
    ),
    check(
      'rooms_music_text_requires_url_check',
      sql`${table.musicUrl} is not null or (${table.musicTitle} is null and ${table.musicArtist} is null)`,
    ),
    check(
      'rooms_top_friends_size_check',
      sql`${table.topFriendsSize} in (4, 8, 12)`,
    ),
    // MATCH SIMPLE: a Room without a banner skips the key. NO ACTION, not
    // SET NULL (the generated purpose cannot be nulled); assets are
    // tombstoned, never deleted, so the key never blocks a cleanup.
    foreignKey({
      name: 'rooms_banner_media_fk',
      columns: [table.bannerMediaId, table.userId, table.bannerPurpose],
      foreignColumns: [
        mediaAssets.id,
        mediaAssets.ownerUserId,
        mediaAssets.purpose,
      ],
    }),
    uniqueIndex('rooms_banner_media_unique')
      .on(table.bannerMediaId)
      .where(sql`${table.bannerMediaId} is not null`),
  ],
);

/**
 * Exactly seven rows per Room, one per widget type, or none (the Room then
 * serves `DEFAULT_ROOM_WIDGETS`). A deferred trigger checks the count at
 * commit, so a full replace (delete, then insert) is one valid change.
 */
export const roomWidgets = paldoraSchema.table(
  'room_widgets',
  {
    roomUserId: uuid('room_user_id')
      .notNull()
      .references(() => rooms.userId, { onDelete: 'cascade' }),
    widgetType: text('widget_type').notNull(),
    placement: roomWidgetPlacement('placement').notNull(),
    position: smallint('position').notNull(),
    enabled: boolean('enabled').notNull().default(true),
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

/**
 * A Room's Top Friends in display order. Only accepted, active friends with
 * no block either way may be inserted (a trigger is the final authority),
 * and unfriending or blocking removes the pair's rows in the same
 * transaction (triggers on `friendships` and `user_blocks`, migration 0007).
 */
export const roomTopFriends = paldoraSchema.table(
  'room_top_friends',
  {
    roomUserId: uuid('room_user_id')
      .notNull()
      .references(() => rooms.userId, { onDelete: 'cascade' }),
    friendUserId: uuid('friend_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.roomUserId, table.friendUserId] }),
    uniqueIndex('room_top_friends_position_unique').on(
      table.roomUserId,
      table.position,
    ),
    index('room_top_friends_friend_index').on(
      table.friendUserId,
      table.roomUserId,
    ),
    check(
      'room_top_friends_not_self_check',
      sql`${table.roomUserId} <> ${table.friendUserId}`,
    ),
    check(
      'room_top_friends_position_check',
      sql`${table.position} between 0 and 11`,
    ),
  ],
);

export type RoomRow = typeof rooms.$inferSelect;

export type RoomWidgetRow = typeof roomWidgets.$inferSelect;

export type RoomTopFriendRow = typeof roomTopFriends.$inferSelect;
