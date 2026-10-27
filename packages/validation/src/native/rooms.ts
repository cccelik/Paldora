import {
  ROOM_CONFIGURATION_VERSION,
  ROOM_LOCATION_MAX,
  ROOM_CURRENTLY_MAX,
  ROOM_MUSIC_TEXT_MAX,
  ROOM_MUSIC_URL_MAX,
  ROOM_RELATIONSHIPS,
  TOP_FRIENDS_MAX,
} from '@paldora/domain';
import { z } from 'zod';
import {
  isSafeMusicUrl,
  roomAccentSchema,
  roomDecorationPackSchema,
  roomFontSchema,
  roomLayoutSchema,
  roomThemePresetSchema,
  roomVisibilitySchema,
  roomWidgetPlacementSchema,
  roomWidgetTypeSchema,
  topFriendsSizeSchema,
  topFriendsVisibilitySchema,
} from '../rooms.js';
import { nativePersonSchema } from './notifications.js';
import {
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

/**
 * Rooms (ADR 021 decision 8). Each callable wraps the same trusted `NativeRooms`
 * service as the web adapter. Theme, accent, font and decoration values are the
 * shared registry ids; no CSS, color or URL ever crosses this contract. The
 * banner is an opaque media asset id that the client renders with
 * `mediaRead/{id}/display`; whether a viewer may see its bytes is rechecked on
 * every read against the Room's live visibility. Advanced personalization
 * (custom CSS and sandboxed widgets, Phase 8) is web-only and not in this
 * contract.
 */

/** Absence, a hidden Room, a block and a non-member viewer are all `not-found`. */
export const getMyRoomInputSchema = z.object({});
export const getRoomInputSchema = z.object({ username: nativeString(100) });

export const nativeRoomWidgetSchema = z.object({
  type: roomWidgetTypeSchema,
  placement: roomWidgetPlacementSchema,
  position: z.number().int().min(0),
  enabled: z.boolean(),
});

export const nativeRoomMusicSchema = z.object({
  /** HTTPS only. A link card the client opens externally; never embedded or played. */
  url: z.string(),
  title: z.string().nullable(),
  artist: z.string().nullable(),
});

export const nativeRoomSchema = z.object({
  owner: z.object({
    uid: z.string(),
    username: z.string(),
    displayName: z.string(),
    bio: z.string().nullable(),
    /** Opaque media id for the `mediaRead` thumbnail, or null. */
    avatarMediaId: z.string().nullable(),
  }),
  relationship: z.enum(ROOM_RELATIONSHIPS),
  style: z.object({
    themePreset: roomThemePresetSchema,
    layout: roomLayoutSchema,
    accent: roomAccentSchema.nullable(),
    font: roomFontSchema.nullable(),
    decorationPack: roomDecorationPackSchema.nullable(),
    sparkles: z.boolean(),
  }),
  location: z.string().nullable(),
  currently: z.string().nullable(),
  music: nativeRoomMusicSchema.nullable(),
  /** Opaque media id for `mediaRead/{id}/display`, or null. Never a URL. */
  bannerMediaId: z.string().nullable(),
  widgets: z.array(nativeRoomWidgetSchema),
  topFriends: z.object({
    /** Owner only; null for visitors. */
    size: topFriendsSizeSchema.nullable(),
    visibility: topFriendsVisibilitySchema.nullable(),
    /** Null when the owner hides Top Friends from this viewer. */
    items: z.array(nativePersonSchema).max(TOP_FRIENDS_MAX).nullable(),
  }),
  /** Owner only; null for visitors. */
  visibility: roomVisibilitySchema.nullable(),
  /** Owner only. Send it back as `expectedUpdatedAt`; null for a never-saved Room. */
  updatedAt: nativeTimestampSchema.nullable(),
  configurationVersion: z.literal(ROOM_CONFIGURATION_VERSION),
});
export const getMyRoomOutputSchema = nativeRoomSchema;
export const getRoomOutputSchema = nativeRoomSchema;

/** The version the client loaded: required, null for a never-saved Room. */
const expectedUpdatedAtSchema = nativeTimestampSchema.nullable();
const nativeText = (max: number) => z.string().max(max).nullable();

const updateMyRoomFields = {
  visibility: roomVisibilitySchema.optional(),
  themePreset: roomThemePresetSchema.optional(),
  layout: roomLayoutSchema.optional(),
  /** null follows the preset. */
  accent: roomAccentSchema.nullable().optional(),
  font: roomFontSchema.nullable().optional(),
  decorationPack: roomDecorationPackSchema.nullable().optional(),
  sparkles: z.boolean().optional(),
  /** Empty clears. */
  location: nativeText(ROOM_LOCATION_MAX).optional(),
  currently: nativeText(ROOM_CURRENTLY_MAX).optional(),
  /** null removes the music card. A public `https://` link only. */
  music: z
    .object({
      url: z.string().max(ROOM_MUSIC_URL_MAX).refine(isSafeMusicUrl),
      title: nativeText(ROOM_MUSIC_TEXT_MAX).optional(),
      artist: nativeText(ROOM_MUSIC_TEXT_MAX).optional(),
    })
    .strict()
    .nullable()
    .optional(),
  /** A ready `room_banner` upload of yours; null removes the banner. */
  bannerMediaId: nativeString(64).nullable().optional(),
};

/** A present field replaces that setting; one left out stays. At least one is required. */
export const updateMyRoomInputSchema = z
  .object({ ...updateMyRoomFields, expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict()
  .refine((input) =>
    Object.keys(updateMyRoomFields).some(
      (key) => input[key as keyof typeof updateMyRoomFields] !== undefined,
    ),
  );
export const updateMyRoomOutputSchema = nativeRoomSchema;

/** All seven widgets, each type once, positions 0 to 6 each once. */
export const updateMyRoomWidgetsInputSchema = z
  .object({
    widgets: z
      .array(
        nativeRoomWidgetSchema
          .extend({ position: z.number().int().min(0).max(6) })
          .strict(),
      )
      .length(7),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();
export const updateMyRoomWidgetsOutputSchema = nativeRoomSchema;

/** The full list in display order; every id must be an accepted, unblocked friend. */
export const updateMyRoomTopFriendsInputSchema = z
  .object({
    userIds: z.array(nativeString(64)).max(TOP_FRIENDS_MAX),
    size: topFriendsSizeSchema,
    visibility: topFriendsVisibilitySchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict();
export const updateMyRoomTopFriendsOutputSchema = nativeRoomSchema;

export const NATIVE_ROOM_PHOTO_MAX = 6;

export const listRoomPhotosInputSchema = z.object({
  username: nativeString(100),
});
export const nativeRoomPhotoSchema = z.object({
  mediaAssetId: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('post'), postId: z.string() }),
    z.object({
      kind: z.literal('life_update'),
      lifeUpdateId: z.string(),
      boxId: z.string(),
    }),
  ]),
  occurredAt: nativeTimestampSchema,
});
/** At most six recent photos in one page; `nextCursor` is always null today. */
export const listRoomPhotosOutputSchema = nativePageSchema(
  nativeRoomPhotoSchema,
);

export type NativeRoom = z.infer<typeof nativeRoomSchema>;
export type NativeRoomPhoto = z.infer<typeof nativeRoomPhotoSchema>;
