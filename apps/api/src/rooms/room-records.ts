import {
  ROOM_DEFAULTS,
  roomWidgets,
  rooms,
  type DatabaseExecutor,
  type DatabaseTransaction,
  type RoomSettingsRow,
} from '@paldora/database';
import type {
  RoomAccent,
  RoomDecorationPack,
  RoomFont,
  RoomLayout,
  RoomThemePreset,
  RoomVisibility,
  RoomWidgetSetting,
  RoomWidgetType,
  TopFriendsSize,
  TopFriendsVisibility,
} from '@paldora/domain';
import { eq } from 'drizzle-orm';
import { cursorTimestamp } from '../platform/pagination.js';
import { roomUpdateStale } from './room-errors.js';

/**
 * A Room's settings with the domain types. The database CHECKs of migration
 * 0007 hold the same allowlists as the domain registry (a test asserts it),
 * so narrowing the text columns here is safe.
 */
export interface RoomSettings {
  readonly visibility: RoomVisibility;
  readonly themePreset: RoomThemePreset;
  readonly layout: RoomLayout;
  readonly accent: RoomAccent | null;
  readonly font: RoomFont | null;
  readonly decorationPack: RoomDecorationPack | null;
  readonly sparkles: boolean;
  readonly location: string | null;
  readonly currently: string | null;
  readonly musicUrl: string | null;
  readonly musicTitle: string | null;
  readonly musicArtist: string | null;
  readonly bannerMediaId: string | null;
  readonly topFriendsSize: TopFriendsSize;
  readonly topFriendsVisibility: TopFriendsVisibility;
}

/**
 * Settings plus the version a write must name. `version` is the exact
 * microsecond `updated_at` text (never a JavaScript Date), or null when the
 * person has no Room row yet and is served the defaults.
 */
export interface RoomState {
  readonly settings: RoomSettings;
  readonly version: string | null;
}

export const roomSettingsColumns = {
  visibility: rooms.visibility,
  themePreset: rooms.themePreset,
  layout: rooms.layout,
  accent: rooms.accent,
  font: rooms.font,
  decorationPack: rooms.decorationPack,
  sparkles: rooms.sparkles,
  location: rooms.location,
  currently: rooms.currently,
  musicUrl: rooms.musicUrl,
  musicTitle: rooms.musicTitle,
  musicArtist: rooms.musicArtist,
  bannerMediaId: rooms.bannerMediaId,
  topFriendsSize: rooms.topFriendsSize,
  topFriendsVisibility: rooms.topFriendsVisibility,
};

export function settingsOf(row: RoomSettingsRow): RoomSettings {
  return {
    ...row,
    themePreset: row.themePreset as RoomThemePreset,
    accent: row.accent as RoomAccent | null,
    font: row.font as RoomFont | null,
    decorationPack: row.decorationPack as RoomDecorationPack | null,
    topFriendsSize: row.topFriendsSize as TopFriendsSize,
  };
}

/** What a person who never saved their Room is served. */
export const DEFAULT_ROOM_STATE: RoomState = {
  settings: settingsOf(ROOM_DEFAULTS),
  version: null,
};

/**
 * Locks the caller's Room row for the rest of the transaction and returns
 * its state, or the defaults (version null) when there is no row yet.
 * Every Room write starts here, so saves of any section serialize.
 */
export async function lockRoom(
  transaction: DatabaseTransaction,
  userId: string,
): Promise<{ readonly state: RoomState; readonly exists: boolean }> {
  const [row] = await transaction
    .select({
      ...roomSettingsColumns,
      version: cursorTimestamp(rooms.updatedAt),
    })
    .from(rooms)
    .where(eq(rooms.userId, userId))
    .for('update');
  if (!row) return { state: DEFAULT_ROOM_STATE, exists: false };
  const { version, ...settings } = row;
  return { state: { settings: settingsOf(settings), version }, exists: true };
}

/**
 * Creates the Room row on the first real change (rows are lazy; reads never
 * write). If another save created it since this one read "no Room", that
 * save won and this one is stale: the caller asked for changes on top of
 * the defaults, which are no longer current.
 */
export async function createRoom(
  transaction: DatabaseTransaction,
  userId: string,
): Promise<void> {
  const created = await transaction
    .insert(rooms)
    .values({ userId })
    .onConflictDoNothing()
    .returning({ userId: rooms.userId });
  if (created.length === 0) throw roomUpdateStale();
}

/**
 * The stale-save rule: the client must name the version it loaded, exactly.
 * Both sides are the microsecond strings `cursorTimestamp` produces; a
 * millisecond rendering of the same instant is (correctly) stale.
 */
export function assertFresh(
  version: string | null,
  expected: string | null,
): void {
  if (version !== expected) throw roomUpdateStale();
}

/** A Room's stored widget rows; none means the defaults are served. */
export async function storedWidgets(
  executor: DatabaseExecutor,
  userId: string,
): Promise<RoomWidgetSetting[]> {
  const rows = await executor
    .select({
      type: roomWidgets.widgetType,
      placement: roomWidgets.placement,
      position: roomWidgets.position,
      enabled: roomWidgets.enabled,
    })
    .from(roomWidgets)
    .where(eq(roomWidgets.roomUserId, userId));
  // The type CHECK holds exactly the domain list.
  return rows.map((row) => ({ ...row, type: row.type as RoomWidgetType }));
}
