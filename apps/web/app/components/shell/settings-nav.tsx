'use client';

import styles from '@/components/shell/settings-nav.module.css';
import { Icon, type IconName } from '@/components/ui/icons';
import { type Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const sections: readonly {
  href: string;
  label: string;
  icon: IconName;
}[] = [
  { href: '/settings/account', label: 'Account', icon: 'user' },
  { href: '/settings/appearance', label: 'Appearance', icon: 'spark' },
  { href: '/settings/reactions', label: 'Reactions', icon: 'heart' },
  { href: '/settings/reports', label: 'Your reports', icon: 'alert' },
  { href: '/settings/content-notices', label: 'Content notices', icon: 'info' },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className={styles.nav}>
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href as Route}
          className={styles.link}
          aria-current={pathname === section.href ? 'page' : undefined}
        >
          <Icon name={section.icon} size={18} />
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
