import styles from '@/components/legal/legal-links.module.css';
import { LEGAL_PAGES } from '@/lib/legal';
import Link from 'next/link';

/** Links to the public information pages, for footers and Settings. */
export function LegalLinks({ label = 'About Paldora' }: { label?: string }) {
  return (
    <nav aria-label={label} className={styles.nav}>
      <ul className={styles.list}>
        {LEGAL_PAGES.map((page) => (
          <li key={page.href}>
            <Link className={styles.link} href={page.href}>
              {page.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
