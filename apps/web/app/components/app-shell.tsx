import type { CurrentUser, UnreadCount } from '@paldora/validation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '../actions/auth';
import { AppNav } from './app-nav';
import { NotificationBell } from './notification-bell';
import { SubmitButton } from './submit-button';
import { Avatar, Wordmark } from './ui';
import styles from './app-shell.module.css';

/**
 * The trusted frame around signed-in pages. Navigation and account actions
 * live here, outside any user-customized content.
 */
export function AppShell({
  user,
  unread,
  children,
}: {
  user: CurrentUser;
  /** The first unread count; the bell keeps it current from then on. */
  unread: UnreadCount;
  children: ReactNode;
}) {
  const name = user.profile.displayName ?? user.profile.username;
  return (
    <>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link href="/home" className={styles.brand} aria-label="Paldora home">
            <Wordmark />
          </Link>
          <AppNav />
          <div className={styles.account}>
            <NotificationBell initial={unread} />
            <Avatar url={user.profile.avatar?.thumbnailUrl} name={name} />
            <form action={signOutAction} className={styles.signOut}>
              <SubmitButton variant="quiet" pendingLabel="Signing out…">
                Sign out
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
    </>
  );
}
