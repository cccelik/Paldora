import { type IconName } from '@/components/ui/icons';
import { roomHref } from '@/lib/rooms/room-theme';
/**
 * The one list of primary destinations (the seven of the Figma web sidebar).
 * From 1024px the sidebar shows every link in list order; below that the
 * bottom nav shows the five with a `bottom` position, in that order, with My
 * Room among them, and Settings moves to the avatar in the header. Memories
 * stays reachable from Home, Life Updates, and Rooms; Life Updates from Home
 * and the sidebar's "New life update" button.
 */
export interface NavigationLink {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  /** The path prefix that marks this link as the current section. */
  readonly section: string;
  /** Position in the bottom nav, or null when it is not there. */
  readonly bottom: number | null;
}

const link = (
  href: string,
  label: string,
  icon: IconName,
  bottom: number | null,
  section = href,
): NavigationLink => ({ href, label, icon, section, bottom });

export function primaryNavigation(
  username: string | null,
): readonly NavigationLink[] {
  return [
    link('/home', 'Home', 'home', 0),
    link('/boxes', 'Boxes', 'box', 1),
    ...(username ? [link(roomHref(username), 'My Room', 'room', 2)] : []),
    link('/memories', 'Memories', 'book', null),
    link('/notifications', 'Activity', 'bell', 4),
    link('/friends', 'Friends', 'friends', 3),
    link('/settings/account', 'Settings', 'gear', null, '/settings'),
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
