import styles from '@/components/auth/auth-layout.module.css';
import { Wordmark } from '@/components/ui';
import { type ReactNode } from 'react';
/** The frame for signed-out pages: sign-in and password recovery. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      {/* Always the dark brand surface, whatever the app appearance. */}
      <aside className={styles.story} aria-hidden="true" data-appearance="dark">
        <Wordmark />
        <p className={styles.quote}>
          The good stuff was always meant to be kept.
        </p>
        <p className={styles.storyFootnote}>
          Private by default · Made to last
        </p>
      </aside>
      <main id="main" className={styles.panel}>
        <Wordmark />
        <section className={styles.card} aria-labelledby="auth-title">
          <p className={styles.eyebrow}>Paldora access</p>
          <h1 id="auth-title" className={styles.title}>
            {title}
          </h1>
          <p className={styles.description}>{description}</p>
          {children}
        </section>
        <p className={styles.footnote}>
          Paldora is in private testing. Accounts are created by invitation.
        </p>
      </main>
    </div>
  );
}
