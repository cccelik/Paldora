'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './app-shell.module.css';

const links = [
  { href: '/home', label: 'Home' },
  { href: '/friends', label: 'Friends' },
  { href: '/boxes', label: 'Boxes' },
  { href: '/life-updates', label: 'Life Updates' },
  { href: '/settings/account', label: 'Settings', section: '/settings' },
] as const;

/** Primary navigation; marks the current section for assistive tech. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className={styles.nav}>
      {links.map((link) => {
        const section = 'section' in link ? link.section : link.href;
        const current =
          pathname === section || pathname.startsWith(`${section}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={styles.navLink}
            aria-current={current ? 'page' : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
