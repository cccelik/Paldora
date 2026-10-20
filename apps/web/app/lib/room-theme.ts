import {
  resolveRoomStyle,
  type RoomLayout,
  type RoomWidgetPlacement,
  type RoomWidgetType,
} from '@paldora/domain';
import {
  isSafeMusicUrl,
  usernameSchema,
  type RoomView,
} from '@paldora/validation';

/**
 * Pure helpers for showing a Room. A Room's look is a set of `data-*`
 * attributes that select static CSS from `@paldora/tokens/room-themes.css`:
 * no inline style (the CSP forbids it) and no color computed from input.
 */

export interface RoomThemeAttributes {
  readonly 'data-room-theme': string;
  readonly 'data-room-scheme': string;
  readonly 'data-room-accent': string;
  readonly 'data-room-font': string;
  readonly 'data-room-decoration': string;
  readonly 'data-room-sparkles': 'on' | 'off';
  readonly 'data-room-layout': RoomLayout;
}

/** The canvas attributes for a saved (or draft) Room style. */
export function roomThemeAttributes(
  style: RoomView['style'],
): RoomThemeAttributes {
  const resolved = resolveRoomStyle(style);
  return {
    'data-room-theme': resolved.theme,
    'data-room-scheme': resolved.scheme,
    'data-room-accent': resolved.accent,
    'data-room-font': resolved.font,
    'data-room-decoration': resolved.decoration,
    'data-room-sparkles': resolved.sparkles ? 'on' : 'off',
    'data-room-layout': resolved.layout,
  };
}

export interface PlacedWidget {
  readonly type: RoomWidgetType;
  readonly placement: RoomWidgetPlacement;
  /** The global order, kept so narrow screens can collapse to it. */
  readonly position: number;
}

export interface RoomColumns {
  /** `single`: everything in `main`, in global order. */
  readonly main: readonly PlacedWidget[];
  readonly sidebar: readonly PlacedWidget[];
}

/**
 * Enabled widgets in saved order. Single column: one list in global
 * position order (placement ignored). Two columns: placement picks the
 * column and position orders within it. Saved data is never changed.
 */
export function roomColumns(
  layout: RoomLayout,
  widgets: readonly RoomView['widgets'][number][],
): RoomColumns {
  const enabled = widgets
    .filter((widget) => widget.enabled)
    .map(({ type, placement, position }) => ({ type, placement, position }))
    .sort((a, b) => a.position - b.position);
  if (layout === 'single') return { main: enabled, sidebar: [] };
  return {
    main: enabled.filter((widget) => widget.placement === 'main'),
    sidebar: enabled.filter((widget) => widget.placement === 'sidebar'),
  };
}

export interface MusicLink {
  readonly href: string;
  readonly host: string;
}

/**
 * A stored music URL is re-checked before it becomes a link. Anything that
 * fails (it never should) is shown as plain text instead.
 */
export function musicLink(url: string): MusicLink | null {
  if (!isSafeMusicUrl(url)) return null;
  const parsed = new URL(url);
  return { href: parsed.href, host: parsed.hostname.replace(/^www\./, '') };
}

/**
 * A `[username]` route segment that could name a Room, or null. Anything
 * else is answered with the same not-found page before any API call.
 * Case variants pass: the API normalizes them.
 */
export function roomUsernameParam(value: string): string | null {
  let decoded = value;
  if (value.includes('%')) {
    try {
      decoded = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  const parsed = usernameSchema.safeParse(decoded);
  return parsed.success && parsed.data === decoded ? decoded : null;
}

export function roomHref(username: string): string {
  return `/rooms/${encodeURIComponent(username)}`;
}

/** Plain-text excerpt of at most `max` characters, cut at a word. */
export function excerpt(text: string, max = 240): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
