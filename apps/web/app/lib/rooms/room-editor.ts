import {
  ROOM_WIDGET_LABELS,
  ROOM_WIDGET_TYPES,
  type RoomWidgetSetting,
} from '@paldora/domain';
import { type RoomView, type UserSummary } from '@paldora/validation';
/**
 * Pure helpers for the Room customizer: ordering lists with buttons, the
 * words announced after a move, and what a draft is missing. The rules
 * themselves (allowed values, eligibility, freshness) are the API's; these
 * only keep the editor from sending something it already knows will fail.
 */

/** A copy of `list` with the item at `index` moved by `delta`, or null. */
export function moveItem<Item>(
  list: readonly Item[],
  index: number,
  delta: -1 | 1,
): Item[] | null {
  const target = index + delta;
  const item = list[index];
  if (item === undefined || target < 0 || target >= list.length) return null;
  const next = [...list];
  next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** "Photos moved to position 3 of 7." */
export function movedAnnouncement(
  name: string,
  index: number,
  total: number,
): string {
  return `${name} moved to position ${index + 1} of ${total}.`;
}

/** "Move Photos up, position 4 of 7" (the button names the item's place). */
export function moveLabel(
  name: string,
  direction: 'up' | 'down',
  index: number,
  total: number,
): string {
  return `Move ${name} ${direction}, position ${index + 1} of ${total}`;
}

export type WidgetDraft = Omit<RoomWidgetSetting, 'position'>;

/**
 * The saved widgets in global order as an editable list. Every type
 * appears once, even if a response ever left one out (it is added at the
 * end, enabled, so a full-replace save still lists all seven).
 */
export function widgetDrafts(
  widgets: readonly RoomView['widgets'][number][],
): WidgetDraft[] {
  const sorted = [...widgets].sort((a, b) => a.position - b.position);
  const seen = new Set(sorted.map((widget) => widget.type));
  const missing = ROOM_WIDGET_TYPES.filter((type) => !seen.has(type)).map(
    (type) => ({ type, placement: 'main' as const, enabled: true }),
  );
  return [
    ...sorted.map(({ type, placement, enabled }) => ({
      type,
      placement,
      enabled,
    })),
    ...missing,
  ];
}

/** The draft list as the full-replace body: position is the list order. */
export function widgetSettings(
  drafts: readonly WidgetDraft[],
): RoomWidgetSetting[] {
  return drafts.map((draft, position) => ({ ...draft, position }));
}

export const widgetName = (draft: WidgetDraft) =>
  ROOM_WIDGET_LABELS[draft.type];

/** Accepted friends not yet chosen, in the order the friends list gave. */
export function friendsToAdd(
  friends: readonly UserSummary[],
  chosen: readonly UserSummary[],
): UserSummary[] {
  const taken = new Set(chosen.map((friend) => friend.id));
  return friends.filter((friend) => !taken.has(friend.id));
}

/** Why the Top Friends draft cannot be saved as it is, or null. */
export function topFriendsProblem(count: number, size: number): string | null {
  if (count <= size) return null;
  const extra = count - size;
  return `Remove ${extra} ${extra === 1 ? 'friend' : 'friends'} or choose a bigger size.`;
}

/** The form value for a version: an empty string for a never-saved Room. */
export const versionField = (updatedAt: string | null) => updatedAt ?? '';
