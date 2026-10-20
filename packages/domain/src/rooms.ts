/**
 * Rooms (Phase 7, ADR 017): a person's customizable profile at
 * `/rooms/[username]`. This registry holds only ids, labels, defaults, and
 * allowlists. Colors and font stacks are design tokens
 * (`design/tokens/paldora.tokens.json`, `room.*`), emitted as static CSS that
 * the web selects with `data-*` attributes, so no color or style ever comes
 * from user input. The database CHECKs, the Zod enums, and these lists must
 * agree; tests assert it.
 */

/** Legacy order; also the order of the theme picker. */
export const ROOM_THEME_PRESETS = [
  'obsidian_gold',
  'cream_paper',
  'lavender_dream',
  'ocean_glow',
  'daisy_day',
  'neon_night',
  'y2k_glitter',
  'dark_academia',
  'frutiger_aero',
  'tumblr_2014',
  'retro_windows',
  'cyberpunk',
  'minimal_editorial',
  'polaroid_scrapbook',
] as const;
export type RoomThemePreset = (typeof ROOM_THEME_PRESETS)[number];

/** Each accent has a light-scheme and a dark-scheme value in the tokens. */
export const ROOM_ACCENTS = [
  'gold',
  'lavender',
  'ocean',
  'daisy',
  'pink',
  'emerald',
  'cyan',
  'crimson',
] as const;
export type RoomAccent = (typeof ROOM_ACCENTS)[number];

export const ROOM_ACCENT_LABELS: Readonly<Record<RoomAccent, string>> = {
  gold: 'Gold',
  lavender: 'Lavender',
  ocean: 'Ocean',
  daisy: 'Daisy',
  pink: 'Pink',
  emerald: 'Emerald',
  cyan: 'Cyan',
  crimson: 'Crimson',
};

/** System font stacks only: no font URLs, no new `font-src`. */
export const ROOM_FONTS = [
  'editorial',
  'modern',
  'rounded',
  'mono',
  'handwritten',
] as const;
export type RoomFont = (typeof ROOM_FONTS)[number];

export const ROOM_FONT_LABELS: Readonly<Record<RoomFont, string>> = {
  editorial: 'Editorial serif',
  modern: 'Modern sans',
  rounded: 'Rounded',
  mono: 'Monospace',
  handwritten: 'Handwritten',
};

/** Every preset starts with the editorial serif (legacy behavior). */
export const ROOM_DEFAULT_FONT: RoomFont = 'editorial';

export const ROOM_DECORATION_PACKS = [
  'none',
  'stars',
  'flowers',
  'stickers',
  'tape',
  'pixels',
] as const;
export type RoomDecorationPack = (typeof ROOM_DECORATION_PACKS)[number];

export const ROOM_DECORATION_LABELS: Readonly<
  Record<RoomDecorationPack, string>
> = {
  none: 'None',
  stars: 'Stars',
  flowers: 'Flowers',
  stickers: 'Stickers',
  tape: 'Tape',
  pixels: 'Pixels',
};

export const ROOM_SCHEMES = ['light', 'dark'] as const;
export type RoomScheme = (typeof ROOM_SCHEMES)[number];

export interface RoomThemeMeta {
  readonly label: string;
  /** Picks each accent's side; must match the token canvas luminance. */
  readonly scheme: RoomScheme;
  readonly defaultAccent: RoomAccent;
  readonly defaultDecoration: RoomDecorationPack;
}

const theme = (
  label: string,
  scheme: RoomScheme,
  defaultAccent: RoomAccent,
  defaultDecoration: RoomDecorationPack,
): RoomThemeMeta => ({ label, scheme, defaultAccent, defaultDecoration });

export const ROOM_THEME_META: Readonly<Record<RoomThemePreset, RoomThemeMeta>> =
  {
    obsidian_gold: theme('Obsidian Gold', 'dark', 'gold', 'none'),
    cream_paper: theme('Cream Paper', 'light', 'gold', 'tape'),
    lavender_dream: theme('Lavender Dream', 'light', 'lavender', 'stars'),
    ocean_glow: theme('Ocean Glow', 'light', 'ocean', 'stars'),
    daisy_day: theme('Daisy Day', 'light', 'daisy', 'flowers'),
    neon_night: theme('Neon Night', 'dark', 'pink', 'pixels'),
    y2k_glitter: theme('Y2K Glitter', 'light', 'lavender', 'stars'),
    dark_academia: theme('Dark Academia', 'dark', 'gold', 'tape'),
    frutiger_aero: theme('Frutiger Aero', 'light', 'emerald', 'stickers'),
    tumblr_2014: theme('Tumblr 2014', 'dark', 'ocean', 'stars'),
    retro_windows: theme('Retro Windows', 'light', 'cyan', 'pixels'),
    cyberpunk: theme('Cyberpunk', 'dark', 'cyan', 'pixels'),
    minimal_editorial: theme('Minimal Editorial', 'light', 'crimson', 'none'),
    polaroid_scrapbook: theme('Polaroid Scrapbook', 'light', 'crimson', 'tape'),
  };

export const ROOM_LAYOUTS = ['single', 'two_column'] as const;
export type RoomLayout = (typeof ROOM_LAYOUTS)[number];

export const ROOM_LAYOUT_LABELS: Readonly<Record<RoomLayout, string>> = {
  single: 'Single column',
  two_column: 'Two columns',
};

/**
 * Tiers nest: hidden ⊂ friends ⊂ members. A block in either direction hides
 * a Room at every tier. `members` means people who share an active
 * membership in a Box with the owner, never every signed-in person.
 */
export const ROOM_VISIBILITIES = ['friends', 'members', 'hidden'] as const;
export type RoomVisibility = (typeof ROOM_VISIBILITIES)[number];

export const ROOM_VISIBILITY_LABELS: Readonly<Record<RoomVisibility, string>> =
  {
    friends: 'Friends',
    members: 'Friends and Box members',
    hidden: 'Only me',
  };

export const ROOM_VISIBILITY_DESCRIPTIONS: Readonly<
  Record<RoomVisibility, string>
> = {
  friends: 'Your accepted friends can visit your Room.',
  members:
    'Your friends and people who share a Box with you can visit your Room.',
  hidden: 'Only you can see your Room.',
};

/** How the viewer may see a Room; `hidden` never admits a non-owner. */
export const ROOM_RELATIONSHIPS = ['owner', 'friend', 'member'] as const;
export type RoomRelationship = (typeof ROOM_RELATIONSHIPS)[number];

/**
 * A closed registry: each type is bound to one data source and one
 * component. A Room stores only `enabled`, `placement`, and `position` per
 * type, always as exactly seven rows. A new type needs an entry here, a
 * migration widening `room_widgets_type_check`, and a component.
 */
export const ROOM_WIDGET_TYPES = [
  'currently',
  'music',
  'top_friends',
  'photos',
  'life_updates',
  'posts',
  'memories',
] as const;
export type RoomWidgetType = (typeof ROOM_WIDGET_TYPES)[number];

export const ROOM_WIDGET_LABELS: Readonly<Record<RoomWidgetType, string>> = {
  currently: 'Currently',
  music: 'Music',
  top_friends: 'Top Friends',
  photos: 'Photos',
  life_updates: 'Life Updates',
  posts: 'Posts',
  memories: 'Memories',
};

export const ROOM_WIDGET_PLACEMENTS = ['main', 'sidebar'] as const;
export type RoomWidgetPlacement = (typeof ROOM_WIDGET_PLACEMENTS)[number];

export interface RoomWidgetSetting {
  readonly type: RoomWidgetType;
  readonly placement: RoomWidgetPlacement;
  /** Global order, 0–6. In `two_column` it orders within each column. */
  readonly position: number;
  readonly enabled: boolean;
}

/** Served for a Room with no widget rows. */
export const DEFAULT_ROOM_WIDGETS: readonly RoomWidgetSetting[] = [
  { type: 'currently', placement: 'sidebar', position: 0, enabled: true },
  { type: 'music', placement: 'sidebar', position: 1, enabled: true },
  { type: 'top_friends', placement: 'sidebar', position: 2, enabled: true },
  { type: 'photos', placement: 'sidebar', position: 3, enabled: true },
  { type: 'life_updates', placement: 'main', position: 4, enabled: true },
  { type: 'posts', placement: 'main', position: 5, enabled: true },
  { type: 'memories', placement: 'main', position: 6, enabled: true },
];

export const TOP_FRIENDS_SIZES = [4, 8, 12] as const;
export type TopFriendsSize = (typeof TOP_FRIENDS_SIZES)[number];
export const TOP_FRIENDS_MAX = 12;

/**
 * `visible`: anyone who can view the Room. `friends`: viewers who are the
 * owner's accepted friends. `hidden`: the owner only.
 */
export const TOP_FRIENDS_VISIBILITIES = [
  'visible',
  'friends',
  'hidden',
] as const;
export type TopFriendsVisibility = (typeof TOP_FRIENDS_VISIBILITIES)[number];

export const ROOM_LOCATION_MAX = 120;
export const ROOM_CURRENTLY_MAX = 240;
export const ROOM_MUSIC_TEXT_MAX = 120;
export const ROOM_MUSIC_URL_MAX = 2048;
/** The only configuration version; a future change bumps it in a migration. */
export const ROOM_CONFIGURATION_VERSION = 1;

/** The style knobs. A null override follows the preset. */
export interface RoomStyleSettings {
  readonly themePreset: RoomThemePreset;
  readonly layout: RoomLayout;
  readonly accent: RoomAccent | null;
  readonly font: RoomFont | null;
  readonly decorationPack: RoomDecorationPack | null;
  readonly sparkles: boolean;
}

export interface RoomDefaults extends RoomStyleSettings {
  readonly visibility: RoomVisibility;
  readonly topFriendsSize: TopFriendsSize;
  readonly topFriendsVisibility: TopFriendsVisibility;
}

/**
 * The roomless configuration: what a person who never customized is served.
 * Rooms are created lazily on the first write; these match the column
 * defaults of migration 0007.
 */
export const DEFAULT_ROOM: RoomDefaults = {
  visibility: 'friends',
  themePreset: 'cream_paper',
  layout: 'two_column',
  accent: null,
  font: null,
  decorationPack: null,
  sparkles: false,
  topFriendsSize: 8,
  topFriendsVisibility: 'friends',
};

export interface ResolvedRoomStyle {
  readonly theme: RoomThemePreset;
  readonly scheme: RoomScheme;
  readonly accent: RoomAccent;
  readonly font: RoomFont;
  readonly decoration: RoomDecorationPack;
  readonly sparkles: boolean;
  readonly layout: RoomLayout;
}

/** Applies the preset's defaults to null overrides. Pure. */
export function resolveRoomStyle(style: RoomStyleSettings): ResolvedRoomStyle {
  const meta = ROOM_THEME_META[style.themePreset];
  return {
    theme: style.themePreset,
    scheme: meta.scheme,
    accent: style.accent ?? meta.defaultAccent,
    font: style.font ?? ROOM_DEFAULT_FONT,
    decoration: style.decorationPack ?? meta.defaultDecoration,
    sparkles: style.sparkles,
    layout: style.layout,
  };
}
