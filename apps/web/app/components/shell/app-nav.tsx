'use client';

import styles from '@/components/shell/app-nav.module.css';
import {
  bottomLinks,
  isCurrentSection,
  type NavigationLink,
} from '@/lib/server/navigation';
import { type Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
function NavLinks({
  links,
  className,
}: {
  links: readonly NavigationLink[];
  className: string | undefined;
}) {
  const pathname = usePathname();
  return links.map((link) => (
    <Link
      key={link.href}
      href={link.href as Route}
      className={className}
      aria-current={isCurrentSection(pathname, link) ? 'page' : undefined}
    >
      {link.label}
    </Link>
  ));
}

/** Desktop primary navigation; hidden below 768px, where `BottomNav` takes over. */
export function AppNav({ links }: { links: readonly NavigationLink[] }) {
  return (
    <nav aria-label="Primary" className={styles.nav}>
      <NavLinks links={links} className={styles.navLink} />
    </nav>
  );
}

/**
 * Below 768px: five fixed destinations at the bottom of the screen, above
 * page content (and any Room canvas) and clear of the home indicator.
 */
export function BottomNav({ links }: { links: readonly NavigationLink[] }) {
  return (
    <nav aria-label="Primary mobile" className={styles.bottomNav}>
      <NavLinks links={bottomLinks(links)} className={styles.bottomLink} />
    </nav>
  );
}
