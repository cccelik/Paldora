import { Avatar } from '@/components/ui/avatar';
import { Icon, type IconName } from '@/components/ui/icons';
import { buttonClassName } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';
import styles from '@/components/shell/sidebar.module.css';
import { type Route } from 'next';
import Link from 'next/link';
/**
 * Figma "Web sidebar" (26:371), 264 wide: seven items, the active one a dark
 * pill, an ember count on Activity, the accent "New life update" button and
 * the signed-in profile. Presentational: `currentHref` marks the active
 * item. Step 3 swaps it in for `AppNav` in `AppShell`.
 */
export interface SidebarItem {
  href: string;
  label: string;
  icon: IconName;
  /** An unread count, shown in an ember badge and spoken. */
  count?: number;
}

export function Sidebar({
  items,
  currentHref,
  composeHref,
  profile,
  navLabel = 'Primary',
}: {
  items: readonly SidebarItem[];
  currentHref: string;
  composeHref: string;
  profile: { name: string; handle: string; avatarUrl?: string | null };
  navLabel?: string;
}) {
  const settings = items.filter((item) => item.href.startsWith('/settings'));
  const main = items.filter((item) => !item.href.startsWith('/settings'));
  const link = (item: SidebarItem) => (
    <li key={item.href}>
      <Link
        href={item.href as Route}
        className={styles.link}
        aria-current={item.href === currentHref ? 'page' : undefined}
      >
        <Icon name={item.icon} size={18} active={item.href === currentHref} />
        <span className={styles.label}>{item.label}</span>
        {item.count ? (
          <span className={styles.count}>
            {item.count}
            <span className="visually-hidden"> unread</span>
          </span>
        ) : null}
      </Link>
    </li>
  );
  return (
    <div className={styles.sidebar}>
      <Wordmark />
      <nav aria-label={navLabel}>
        <ul className={styles.list}>{main.map(link)}</ul>
        {settings.length > 0 ? (
          <ul className={`${styles.list} ${styles.divided}`}>
            {settings.map(link)}
          </ul>
        ) : null}
      </nav>
      <Link
        href={composeHref as Route}
        className={buttonClassName('accent', { block: true })}
      >
        <Icon name="spark" size={16} />
        New life update
      </Link>
      <div className={styles.profile}>
        <Avatar url={profile.avatarUrl} name={profile.name} size="s" />
        <p className={styles.who}>
          <span className={styles.name}>{profile.name}</span>
          <span className={styles.handle}>@{profile.handle}</span>
        </p>
      </div>
    </div>
  );
}
