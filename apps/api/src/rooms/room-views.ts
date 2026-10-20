import {
  DEFAULT_ROOM_WIDGETS,
  ROOM_CONFIGURATION_VERSION,
  type RoomRelationship,
  type RoomWidgetSetting,
  type TopFriendsVisibility,
} from '@paldora/domain';
import type { RoomView, UserSummary } from '@paldora/validation';
import type { RoomSettings, RoomState } from './room-records.js';

export interface RoomViewParts {
  readonly relationship: RoomRelationship;
  readonly owner: RoomView['owner'];
  readonly room: RoomState;
  /** Stored widget rows, or none (the defaults are served). */
  readonly widgets: readonly RoomWidgetSetting[];
  /** Null when this viewer may not see the list at all. */
  readonly topFriends: readonly UserSummary[] | null;
  /** The signed display URL, only while the banner asset is ready. */
  readonly bannerUrl: string | null;
}

/**
 * Who may see the Top Friends list (plan B7): `visible` everyone who can
 * view the Room, `friends` the owner's accepted friends, `hidden` the owner.
 */
export function mayViewTopFriends(
  visibility: TopFriendsVisibility,
  relationship: RoomRelationship,
): boolean {
  if (relationship === 'owner' || visibility === 'visible') return true;
  return visibility === 'friends' && relationship === 'friend';
}

/** Stored rows or the defaults, in global position order. */
export function orderedWidgets(
  stored: readonly RoomWidgetSetting[],
): RoomWidgetSetting[] {
  const widgets = stored.length > 0 ? stored : DEFAULT_ROOM_WIDGETS;
  return [...widgets]
    .sort((first, second) => first.position - second.position)
    .map(({ type, placement, position, enabled }) => ({
      type,
      placement,
      position,
      enabled,
    }));
}

function musicOf(settings: RoomSettings): RoomView['music'] {
  if (settings.musicUrl === null) return null;
  return {
    url: settings.musicUrl,
    title: settings.musicTitle,
    artist: settings.musicArtist,
  };
}

/**
 * The Room as this viewer may see it. Pure. Visitors never receive the
 * owner-only fields (plan B16): `visibility`, `updatedAt`, the banner's
 * media id, the Top Friends size and audience, and disabled widgets.
 */
export function toRoomView(parts: RoomViewParts): RoomView {
  const { settings, version } = parts.room;
  const isOwner = parts.relationship === 'owner';
  const widgets = orderedWidgets(parts.widgets).filter(
    (widget) => isOwner || widget.enabled,
  );
  return {
    owner: parts.owner,
    relationship: parts.relationship,
    style: {
      themePreset: settings.themePreset,
      layout: settings.layout,
      accent: settings.accent,
      font: settings.font,
      decorationPack: settings.decorationPack,
      sparkles: settings.sparkles,
    },
    location: settings.location,
    currently: settings.currently,
    music: musicOf(settings),
    banner:
      parts.bannerUrl === null
        ? null
        : {
            url: parts.bannerUrl,
            bannerMediaId: isOwner ? settings.bannerMediaId : null,
          },
    widgets,
    topFriends: {
      size: isOwner ? settings.topFriendsSize : null,
      visibility: isOwner ? settings.topFriendsVisibility : null,
      items: parts.topFriends === null ? null : [...parts.topFriends],
    },
    visibility: isOwner ? settings.visibility : null,
    updatedAt: isOwner ? version : null,
    configurationVersion: ROOM_CONFIGURATION_VERSION,
  };
}
