'use client';

import styles from '@/components/shell/settings-nav.module.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const sections = [
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/reactions', label: 'Reactions' },
  { href: '/settings/reports', label: 'Your reports' },
  { href: '/settings/content-notices', label: 'Content notices' },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className={styles.nav}>
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className={styles.link}
          aria-current={pathname === section.href ? 'page' : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
