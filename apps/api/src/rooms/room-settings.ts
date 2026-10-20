import type { UpdateRoomInput } from '@paldora/validation';
import type { RoomSettings } from './room-records.js';

/** The columns `PATCH /me/room` may change. */
export type SettingsChanges = Partial<
  Omit<RoomSettings, 'topFriendsSize' | 'topFriendsVisibility'>
>;

type Simple = Exclude<
  keyof SettingsChanges,
  'musicUrl' | 'musicTitle' | 'musicArtist'
>;

const SIMPLE_FIELDS = [
  'visibility',
  'themePreset',
  'layout',
  'accent',
  'font',
  'decorationPack',
  'sparkles',
  'location',
  'currently',
  'bannerMediaId',
] as const satisfies readonly Simple[];

function musicChanges(
  music: UpdateRoomInput['music'],
  current: RoomSettings,
): SettingsChanges {
  if (music === undefined) return {};
  const next = {
    musicUrl: music?.url ?? null,
    musicTitle: music?.title ?? null,
    musicArtist: music?.artist ?? null,
  };
  const same =
    next.musicUrl === current.musicUrl &&
    next.musicTitle === current.musicTitle &&
    next.musicArtist === current.musicArtist;
  return same ? {} : next;
}

/**
 * Only the fields that would actually change, so an equal request is a
 * no-op (`{}`) and never bumps the version. Pure. A field left out of the
 * request stays as it is; a null override (`accent`, `font`,
 * `decorationPack`) follows the preset again; the music card is replaced
 * or removed as a whole.
 */
export function settingsChanges(
  input: UpdateRoomInput,
  current: RoomSettings,
): SettingsChanges {
  const changes: Record<string, unknown> = {};
  for (const field of SIMPLE_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== current[field]) {
      changes[field] = value;
    }
  }
  return {
    ...(changes as SettingsChanges),
    ...musicChanges(input.music, current),
  };
}
