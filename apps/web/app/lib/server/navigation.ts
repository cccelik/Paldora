import { roomHref } from '@/lib/rooms/room-theme';
/**
 * The one list of primary destinations. The desktop top nav shows every
 * link in list order; below 768px the bottom nav shows the five with a
 * `bottom` position, in that order, and Settings moves to the avatar in the
 * header. Memories stays reachable from Home, Life Updates, and Rooms.
 */
export interface NavigationLink {
  readonly href: string;
  readonly label: string;
  /** The path prefix that marks this link as the current section. */
  readonly section: string;
  /** Position in the bottom nav, or null when it is not there. */
  readonly bottom: number | null;
}

const link = (
  href: string,
  label: string,
  bottom: number | null,
  section = href,
): NavigationLink => ({ href, label, section, bottom });

export function primaryNavigation(
  username: string | null,
): readonly NavigationLink[] {
  return [
    link('/home', 'Home', 0),
    link('/friends', 'Friends', 3),
    link('/boxes', 'Boxes', 1),
    link('/life-updates', 'Life Updates', 2),
    link('/memories', 'Memories', null),
    ...(username ? [link(roomHref(username), 'My Room', 4)] : []),
    link('/settings/account', 'Settings', null, '/settings'),
  ];
}

export function bottomLinks(
  links: readonly NavigationLink[],
): readonly NavigationLink[] {
  return links
    .filter((entry) => entry.bottom !== null)
    .sort((a, b) => (a.bottom ?? 0) - (b.bottom ?? 0));
}

function comparable(path: string): string {
  try {
    return decodeURIComponent(path).toLowerCase();
  } catch {
    return path.toLowerCase();
  }
}

/** True on the section's page and anything under it (case-insensitive). */
export function isCurrentSection(
  pathname: string,
  entry: Pick<NavigationLink, 'section'>,
): boolean {
  const path = comparable(pathname);
  const section = comparable(entry.section);
  return path === section || path.startsWith(`${section}/`);
}
