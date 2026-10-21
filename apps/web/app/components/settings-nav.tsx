'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './settings-nav.module.css';
const sections = [
  { href: '/settings/account', label: 'Account' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/reactions', label: 'Reactions' },
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
