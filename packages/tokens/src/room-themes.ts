import { relativeLuminance } from './contrast.js';
import type { ResolvedToken } from './resolve.js';

/**
 * Room themes (Phase 7, ADR 017) as structured data, read from the resolved
 * `room.*` tokens. The emitter and the contrast tests share this reader, so
 * what is tested is exactly what is generated.
 */
export const ROOM_PRESET_ROLES = [
  'canvas',
  'surface',
  'text',
  'textMuted',
  'border',
] as const;
export type RoomPresetRole = (typeof ROOM_PRESET_ROLES)[number];

export const ROOM_ACCENT_SIDES = ['onLight', 'onDark'] as const;
export type RoomAccentSide = (typeof ROOM_ACCENT_SIDES)[number];

export type RoomScheme = 'light' | 'dark';

export interface RoomPresetTokens {
  /** The domain id (`obsidian_gold`), converted from the token key. */
  readonly id: string;
  readonly colors: Readonly<Record<RoomPresetRole, string>>;
}

export interface RoomAccentTokens {
  readonly key: string;
  readonly onLight: string;
  readonly onDark: string;
}

export interface RoomFontTokens {
  readonly key: string;
  readonly families: readonly string[];
}

export interface RoomThemeTokens {
  readonly presets: readonly RoomPresetTokens[];
  readonly accents: readonly RoomAccentTokens[];
  readonly fonts: readonly RoomFontTokens[];
}

/**
 * Token keys are camelCase, domain ids snake_case. A digit run that ends a
 * word gets its own segment (`tumblr2014` = `tumblr_2014`), one inside a
 * word does not (`y2kGlitter` = `y2k_glitter`).
 */
export function roomIdFromTokenKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([a-z])(\d+)$/, '$1_$2')
    .toLowerCase();
}

export function roomTokenKeyFromId(id: string): string {
  return id.replace(/_([a-z0-9])/g, (_match, next: string) =>
    next.toUpperCase(),
  );
}

const roomTokenKey = (key: string): string => {
  const id = roomIdFromTokenKey(key);
  if (roomTokenKeyFromId(id) !== key) {
    throw new Error(`Room token key ${key} does not round-trip (${id}).`);
  }
  return id;
};

/** Groups `room.<group>.<key>.<leaf>` tokens by key, in source order. */
function groupBy(
  tokens: readonly ResolvedToken[],
  group: string,
): Map<string, Map<string, ResolvedToken>> {
  const prefix = `room.${group}.`;
  const grouped = new Map<string, Map<string, ResolvedToken>>();
  for (const token of tokens) {
    if (!token.path.startsWith(prefix)) continue;
    const [key, leaf] = token.path.slice(prefix.length).split('.');
    if (!key) throw new Error(`Malformed room token ${token.path}.`);
    const entry = grouped.get(key) ?? new Map<string, ResolvedToken>();
    entry.set(leaf ?? '', token);
    grouped.set(key, entry);
  }
  return grouped;
}

function solidColor(token: ResolvedToken | undefined, label: string): string {
  const value = token?.value;
  if (typeof value !== 'string' || !/^#[0-9A-F]{6}$/i.test(value)) {
    throw new Error(`Room token ${label} must be a solid #RRGGBB color.`);
  }
  return value;
}

export function readRoomThemeTokens(
  tokens: readonly ResolvedToken[],
): RoomThemeTokens {
  const presets = [...groupBy(tokens, 'preset')].map(([key, leaves]) => ({
    id: roomTokenKey(key),
    colors: Object.fromEntries(
      ROOM_PRESET_ROLES.map((role) => [
        role,
        solidColor(leaves.get(role), `room.preset.${key}.${role}`),
      ]),
    ) as Record<RoomPresetRole, string>,
  }));
  const accents = [...groupBy(tokens, 'accent')].map(([key, leaves]) => ({
    key: roomTokenKey(key),
    onLight: solidColor(leaves.get('onLight'), `room.accent.${key}.onLight`),
    onDark: solidColor(leaves.get('onDark'), `room.accent.${key}.onDark`),
  }));
  const fonts = [...groupBy(tokens, 'font')].map(([key, leaves]) => {
    const value = leaves.get('')?.value;
    if (!Array.isArray(value)) {
      throw new Error(`Room font ${key} must be a font stack.`);
    }
    return { key: roomTokenKey(key), families: value.map(String) };
  });
  return { presets, accents, fonts };
}

/**
 * A preset is dark when its canvas is darker than its text. The domain
 * registry declares each preset's scheme; the web consistency test checks
 * that the two agree, and the contrast tests use this one.
 */
export function roomSchemeOf(
  colors: Pick<RoomPresetTokens['colors'], 'canvas' | 'text'>,
): RoomScheme {
  return relativeLuminance(colors.canvas) < relativeLuminance(colors.text)
    ? 'dark'
    : 'light';
}

/** The accent value a preset of this scheme uses. */
export const accentFor = (
  accent: RoomAccentTokens,
  scheme: RoomScheme,
): string => (scheme === 'light' ? accent.onLight : accent.onDark);
