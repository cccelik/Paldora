import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  Armchair,
  Ban,
  Bell,
  BookOpen,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Ellipsis,
  Eye,
  Flag,
  Heart,
  History,
  House,
  Image,
  Info,
  KeyRound,
  Link,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Music,
  Package,
  Palette,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Send,
  Settings,
  Share,
  Shield,
  SquarePen,
  Star,
  Trash2,
  TriangleAlert,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * The Paldora icon owner. Symbols are Lucide (ISC licence) drawn on a 24 px
 * grid with a 1.6 px round stroke; Apple's SF Symbols may not be used on the
 * web, so Lucide is the closest permissive equivalent. Names match the iOS
 * `PaldoraIcon` cases where one exists. `spark` is a brand shape, not a
 * Lucide glyph. Decorative by default: the control that contains an icon
 * supplies the accessible name. Pass `title` only for a standalone meaningful
 * icon. The icon -> Lucide mapping is in components/README.md.
 */
const brandPaths = {
  spark:
    'M12 3c.7 5.3 3.7 8.3 9 9-5.3.7-8.3 3.7-9 9-.7-5.3-3.7-8.3-9-9 5.3-.7 8.3-3.7 9-9z',
} as const;

export const lucideIcons = {
  home: House,
  box: Package,
  room: Armchair,
  book: BookOpen,
  bell: Bell,
  activity: Bell,
  friends: Users,
  user: User,
  gear: Settings,
  settings: Settings,
  plus: Plus,
  music: Music,
  back: ChevronLeft,
  chev: ChevronRight,
  down: ChevronDown,
  up: ChevronUp,
  arrowLeft: ArrowLeft,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  external: ArrowUpRight,
  heart: Heart,
  chat: MessageCircle,
  lock: Lock,
  close: X,
  check: Check,
  info: Info,
  alert: TriangleAlert,
  image: Image,
  camera: Camera,
  edit: Pencil,
  compose: SquarePen,
  refresh: RotateCw,
  more: Ellipsis,
  memories: History,
  cal: Calendar,
  search: Search,
  send: Send,
  share: Share,
  report: Flag,
  flag: Flag,
  block: Ban,
  ban: Ban,
  delete: Trash2,
  trash: Trash2,
  archive: Archive,
  download: Download,
  copy: Copy,
  link: Link,
  logout: LogOut,
  eye: Eye,
  pin: MapPin,
  shield: Shield,
  mail: Mail,
  palette: Palette,
  key: KeyRound,
  star: Star,
  swap: ArrowLeftRight,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof lucideIcons | keyof typeof brandPaths;

/** Every name the Icon accepts, for tests and the gallery. */
export const iconNames: readonly IconName[] = [
  ...(Object.keys(lucideIcons) as IconName[]),
  ...(Object.keys(brandPaths) as IconName[]),
];

export function Icon({
  name,
  size = 20,
  active = false,
  title,
}: {
  name: IconName;
  size?: 14 | 16 | 18 | 20 | 22 | 24;
  /** Active icons use the heavier 1.8 stroke. */
  active?: boolean;
  title?: string;
}) {
  const strokeWidth = active ? 1.8 : 1.6;
  const a11y = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true as const };
  if (name === 'spark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        {...a11y}
      >
        {title ? <title>{title}</title> : null}
        <path d={brandPaths.spark} />
      </svg>
    );
  }
  const Glyph = lucideIcons[name];
  return (
    <Glyph size={size} strokeWidth={strokeWidth} focusable="false" {...a11y} />
  );
}
