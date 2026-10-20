import {
  ROOM_ACCENTS,
  ROOM_CONFIGURATION_VERSION,
  ROOM_CURRENTLY_MAX,
  ROOM_DECORATION_PACKS,
  ROOM_FONTS,
  ROOM_LAYOUTS,
  ROOM_LOCATION_MAX,
  ROOM_MUSIC_TEXT_MAX,
  ROOM_MUSIC_URL_MAX,
  ROOM_RELATIONSHIPS,
  ROOM_THEME_PRESETS,
  ROOM_VISIBILITIES,
  ROOM_WIDGET_PLACEMENTS,
  ROOM_WIDGET_TYPES,
  TOP_FRIENDS_MAX,
  TOP_FRIENDS_VISIBILITIES,
} from '@paldora/domain';
import { z } from 'zod';
import { memoryQuerySchema, memorySummaryQuerySchema } from './memories.js';
import { userSummarySchema } from './people.js';
import { postMediaSchema } from './posts.js';
import {
  cursorPageQuerySchema,
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

/**
 * Rooms (Phase 7). Every write is strict: there is no field that could carry
 * CSS, HTML, script, a font or background URL, or a color, so unknown keys
 * such as `css` or `background` fail with VALIDATION_FAILED. Every write
 * names the version it was based on (`expectedUpdatedAt`, null for a Room
 * that was never saved), so a stale tab cannot overwrite a newer save.
 */

/** Body IDs as lowercase UUIDs, matching PostgreSQL's comparison. */
const idSchema = uuidSchema.transform((value) => value.toLowerCase());

const distinct = (values: readonly unknown[]) =>
  new Set(values).size === values.length;

export const roomVisibilitySchema = z.enum(ROOM_VISIBILITIES);
export const roomThemePresetSchema = z.enum(ROOM_THEME_PRESETS);
export const roomLayoutSchema = z.enum(ROOM_LAYOUTS);
export const roomAccentSchema = z.enum(ROOM_ACCENTS);
export const roomFontSchema = z.enum(ROOM_FONTS);
export const roomDecorationPackSchema = z.enum(ROOM_DECORATION_PACKS);
export const roomWidgetTypeSchema = z.enum(ROOM_WIDGET_TYPES);
export const roomWidgetPlacementSchema = z.enum(ROOM_WIDGET_PLACEMENTS);
export const topFriendsVisibilitySchema = z.enum(TOP_FRIENDS_VISIBILITIES);
export const topFriendsSizeSchema = z.union([
  z.literal(4),
  z.literal(8),
  z.literal(12),
]);

/** The version the client loaded: required, null for a never-saved Room. */
const expectedUpdatedAtSchema = isoTimestampSchema.nullable();

// Hosts that are never a public music site. WHATWG URL parsing has already
// normalized numeric forms such as `0x7f.1` to dotted IPv4 by this point.
const ipv4Host = /^\d{1,3}(\.\d{1,3}){3}$/;
const whitespaceOrBackslash = /[\s\\]/;
const hasForbiddenCharacter = (value: string) =>
  whitespaceOrBackslash.test(value) ||
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
const userinfo = /^https:\/\/[^/?#]*@/;

function parseHttps(value: string): URL | null {
  if (
    value.length > ROOM_MUSIC_URL_MAX ||
    !value.startsWith('https://') ||
    hasForbiddenCharacter(value) ||
    userinfo.test(value)
  ) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * The stored form of a music link, or null when it is not allowed: HTTPS
 * only, at most 2,048 characters, no userinfo, no whitespace or control
 * characters, and a public-looking host (not an IP literal, not
 * `localhost`, at least one dot). The result is the normalized `href`,
 * which passes this check again, so the web render path can re-validate
 * stored values with `isSafeMusicUrl`.
 */
export function normalizeMusicUrl(value: string): string | null {
  const url = parseHttps(value.trim());
  if (!url || url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  const host = url.hostname.toLowerCase();
  if (
    host.startsWith('[') ||
    ipv4Host.test(host) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    !host.includes('.') ||
    host.endsWith('.')
  ) {
    return null;
  }
  const href = url.href;
  return parseHttps(href) ? href : null;
}

export const isSafeMusicUrl = (value: string): boolean =>
  normalizeMusicUrl(value) !== null;

/** Trimmed optional text: empty becomes null, so "clear" is one value. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === '' ? null : value))
    .nullable();

const musicText = optionalText(
  ROOM_MUSIC_TEXT_MAX,
  'Use 120 characters or fewer.',
);

export const roomMusicSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(ROOM_MUSIC_URL_MAX, 'Use a link of 2,048 characters or fewer.')
      .transform((value, context) => {
        const normalized = normalizeMusicUrl(value);
        if (normalized === null) {
          context.addIssue({
            code: 'custom',
            message: 'Use a public https:// link.',
          });
          return z.NEVER;
        }
        return normalized;
      }),
    title: musicText.default(null),
    artist: musicText.default(null),
  })
  .strict()
  .meta({ id: 'RoomMusicInput' });

const updateRoomFields = {
  visibility: roomVisibilitySchema.optional(),
  themePreset: roomThemePresetSchema.optional(),
  layout: roomLayoutSchema.optional(),
  /** null follows the preset. */
  accent: roomAccentSchema.nullable().optional(),
  font: roomFontSchema.nullable().optional(),
  decorationPack: roomDecorationPackSchema.nullable().optional(),
  sparkles: z.boolean().optional(),
  location: optionalText(
    ROOM_LOCATION_MAX,
    'Use 120 characters or fewer.',
  ).optional(),
  currently: optionalText(
    ROOM_CURRENTLY_MAX,
    'Use 240 characters or fewer.',
  ).optional(),
  /** null removes the music card. */
  music: roomMusicSchema.nullable().optional(),
  /** A ready `room_banner` upload of yours; null removes the banner. */
  bannerMediaId: idSchema.nullable().optional(),
};

/**
 * A partial change (strict). A present field replaces that setting; one
 * left out stays as it is. At least one setting must be present.
 */
export const updateRoomSchema = z
  .object({ ...updateRoomFields, expectedUpdatedAt: expectedUpdatedAtSchema })
  .strict()
  .refine(
    (input) =>
      Object.keys(updateRoomFields).some(
        (key) => input[key as keyof typeof updateRoomFields] !== undefined,
      ),
    { message: 'Change at least one Room setting.' },
  )
  .meta({ id: 'UpdateRoomRequest' });

export const roomWidgetSchema = z
  .object({
    type: roomWidgetTypeSchema,
    placement: roomWidgetPlacementSchema,
    position: z
      .number()
      .int()
      .min(0)
      .max(ROOM_WIDGET_TYPES.length - 1),
    enabled: z.boolean(),
  })
  .strict()
  .meta({ id: 'RoomWidget' });

/** All seven widgets, each type once, positions 0–6 each once. */
export const updateRoomWidgetsSchema = z
  .object({
    widgets: z
      .array(roomWidgetSchema)
      .length(ROOM_WIDGET_TYPES.length, 'List all seven widgets.')
      .refine((widgets) => distinct(widgets.map((widget) => widget.type)), {
        message: 'List each widget once.',
      })
      .refine((widgets) => distinct(widgets.map((widget) => widget.position)), {
        message: 'Give each widget its own position.',
      }),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict()
  .meta({ id: 'UpdateRoomWidgetsRequest' });

/** The full Top Friends list in display order, its size, and audience. */
export const updateRoomTopFriendsSchema = z
  .object({
    userIds: z
      .array(idSchema)
      .max(TOP_FRIENDS_MAX, 'Choose up to 12 Top Friends.')
      .refine(distinct, { message: 'Choose each friend once.' }),
    size: topFriendsSizeSchema,
    visibility: topFriendsVisibilitySchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .strict()
  .refine(({ userIds, size }) => userIds.length <= size, {
    path: ['userIds'],
    message: 'Choose no more Top Friends than the size you picked.',
  })
  .meta({ id: 'UpdateRoomTopFriendsRequest' });

/**
 * The username in a Room URL. Deliberately lenient: a malformed name is
 * ROOM_NOT_FOUND like any other inaccessible Room, never VALIDATION_FAILED,
 * so the response says nothing about what usernames can look like.
 */
export const roomParamsSchema = z.object({
  username: z.string().max(100),
});

/**
 * One Room as the viewer may see it. Owner-only fields (`visibility`,
 * `updatedAt`, `banner.bannerMediaId`, `topFriends.size` and
 * `.visibility`, disabled widgets) are null or absent for visitors.
 */
export const roomSchema = z
  .object({
    owner: z.object({
      id: uuidSchema,
      username: z.string(),
      displayName: z.string(),
      bio: z.string().nullable(),
      avatarUrl: z.url().nullable(),
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
    music: z
      .object({
        url: z.url({ protocol: /^https$/ }),
        title: z.string().nullable(),
        artist: z.string().nullable(),
      })
      .nullable(),
    banner: z
      .object({ url: z.url(), bannerMediaId: uuidSchema.nullable() })
      .nullable(),
    widgets: z
      .array(
        z.object({
          type: roomWidgetTypeSchema,
          placement: roomWidgetPlacementSchema,
          position: z.number().int().min(0),
          enabled: z.boolean(),
        }),
      )
      .max(ROOM_WIDGET_TYPES.length),
    topFriends: z.object({
      size: topFriendsSizeSchema.nullable(),
      visibility: topFriendsVisibilitySchema.nullable(),
      items: z.array(userSummarySchema).max(TOP_FRIENDS_MAX).nullable(),
    }),
    visibility: roomVisibilitySchema.nullable(),
    updatedAt: isoTimestampSchema.nullable(),
    configurationVersion: z.literal(ROOM_CONFIGURATION_VERSION),
  })
  .meta({ id: 'Room' });

/**
 * Room previews page like Memories, but `year` is optional (every year,
 * newest first). A `month` needs a `year`.
 */
export const roomContentQuerySchema = memoryQuerySchema
  .extend({ year: memoryQuerySchema.shape.year.optional() })
  .refine((query) => query.month === undefined || query.year !== undefined, {
    path: ['month'],
    message: 'Choose a year for the month.',
  });
export const roomContentSummaryQuerySchema = memorySummaryQuerySchema;

/** Items with photos per page: at most 4 photos each, so ≤ 48 photos. */
export const ROOM_PHOTO_PAGE_MAX_ITEMS = 12;
export const ROOM_PHOTO_PAGE_DEFAULT_ITEMS = 6;

/**
 * A page of Room photos counts the posts and Life Updates that carry them
 * (newest first), not single photos: every photo of an item arrives on the
 * same page, and the cursor is the item's.
 */
export const roomPhotoQuerySchema = cursorPageQuerySchema.extend({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ROOM_PHOTO_PAGE_MAX_ITEMS)
    .default(ROOM_PHOTO_PAGE_DEFAULT_ITEMS),
});

export const roomPhotoSchema = z
  .object({
    photo: postMediaSchema,
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('post'), postId: uuidSchema }),
      z.object({
        kind: z.literal('life_update'),
        lifeUpdateId: uuidSchema,
        boxId: uuidSchema,
      }),
    ]),
    occurredAt: isoTimestampSchema,
  })
  .meta({ id: 'RoomPhoto' });

export const roomPhotoPageSchema = cursorPageSchema(roomPhotoSchema).meta({
  id: 'RoomPhotoPage',
});

export type RoomMusicInput = z.output<typeof roomMusicSchema>;
export type UpdateRoomInput = z.output<typeof updateRoomSchema>;
export type UpdateRoomRequest = z.input<typeof updateRoomSchema>;
export type RoomWidgetInput = z.output<typeof roomWidgetSchema>;
export type UpdateRoomWidgetsInput = z.output<typeof updateRoomWidgetsSchema>;
export type UpdateRoomWidgetsRequest = z.input<typeof updateRoomWidgetsSchema>;
export type UpdateRoomTopFriendsInput = z.output<
  typeof updateRoomTopFriendsSchema
>;
export type UpdateRoomTopFriendsRequest = z.input<
  typeof updateRoomTopFriendsSchema
>;
export type RoomView = z.infer<typeof roomSchema>;
export type RoomContentQuery = z.output<typeof roomContentQuerySchema>;
export type RoomContentQueryInput = z.input<typeof roomContentQuerySchema>;
export type RoomPhotoQuery = z.output<typeof roomPhotoQuerySchema>;
export type RoomPhotoQueryInput = z.input<typeof roomPhotoQuerySchema>;
export type RoomPhotoView = z.infer<typeof roomPhotoSchema>;
export type RoomPhotoPage = z.infer<typeof roomPhotoPageSchema>;
