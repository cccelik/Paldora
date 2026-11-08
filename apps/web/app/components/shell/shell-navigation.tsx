'use client';

import { useNotificationCount } from '@/components/notifications/use-notification-count';
import { Sidebar, type SidebarItem } from '@/components/shell/sidebar';
import styles from '@/components/shell/shell-navigation.module.css';
import { Icon, type IconName } from '@/components/ui/icons';
import {
  bottomLinks,
  isCurrentSection,
  type NavigationLink,
} from '@/lib/server/navigation';
import { unreadBadge } from '@/lib/notifications/notification-text';
import { type UnreadCount } from '@paldora/validation';
import { type Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

const ACTIVITY = '/notifications';

/**
 * Both navigations of the trusted shell share one live unread count: the
 * 264px sidebar from 1024px, and the floating bottom nav below it (My Room
 * is one of its five). Neither is ever drawn inside user-customized content.
 */
export function ShellNavigation({
  links,
  unread,
  profile,
  footer,
  part,
}: {
  links: readonly NavigationLink[];
  unread: UnreadCount;
  profile: { name: string; handle: string; avatarUrl?: string | null };
  footer: ReactNode;
  part: 'sidebar' | 'bottom';
}) {
  const pathname = usePathname();
  const count = useNotificationCount(unread);
  const badge = unreadBadge(count.capped ? 100 : count.count);
  const current = links.find((link) => isCurrentSection(pathname, link));

  if (part === 'sidebar') {
    const items: SidebarItem[] = links.map((link) => ({
      href: link.href,
      label: link.label,
      icon: link.icon,
      ...(link.href === ACTIVITY && badge ? { count: badge } : {}),
    }));
    return (
      <Sidebar
        items={items}
        currentHref={current?.href ?? ''}
        composeHref="/life-updates/new"
        profile={profile}
        footer={footer}
      />
    );
  }
  return (
    <nav aria-label="Primary mobile" className={styles.bottomNav}>
      {bottomLinks(links).map((link) => (
        <BottomLink
          key={link.href}
          href={link.href}
          label={link.label}
          icon={link.icon}
          active={current?.href === link.href}
          badge={link.href === ACTIVITY ? badge : null}
        />
      ))}
    </nav>
  );
}

function BottomLink({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  badge: string | null;
}) {
  return (
    <Link
      href={href as Route}
      className={styles.bottomLink}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.bottomIcon}>
        <Icon name={icon} size={20} active={active} />
        {badge ? (
          <span className={styles.dot} aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </span>
      <span>{label}</span>
      {badge ? <span className="visually-hidden"> {badge} unread</span> : null}
    </Link>
  );
}
