import { LegalLinks } from '@/components/legal/legal-links';
import { buttonClassName, Wordmark } from '@/components/ui';
import styles from '@/(public)/layout.module.css';
import { FIREBASE_SESSION_COOKIE } from '@/lib/server/firebase/session';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { type ReactNode } from 'react';

/**
 * Information pages open to everyone, signed in or not. Only the presence of
 * the session cookie picks the header link; no account data is read here.
 */
export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const signedIn = Boolean((await cookies()).get(FIREBASE_SESSION_COOKIE));
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Paldora home">
          <Wordmark />
        </Link>
        <Link
          className={buttonClassName('secondary')}
          href={signedIn ? '/home' : '/sign-in'}
        >
          {signedIn ? 'Back to Paldora' : 'Sign in'}
        </Link>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <LegalLinks />
      </footer>
    </div>
  );
}
