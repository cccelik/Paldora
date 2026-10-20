import type { CurrentUser, UnreadCount } from '@paldora/validation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '../actions/auth';
import { primaryNavigation } from '../lib/navigation';
import { AppNav, BottomNav } from './app-nav';
import { NotificationBell } from './notification-bell';
import { SubmitButton } from './submit-button';
import { Avatar, Wordmark } from './ui';
import styles from './app-shell.module.css';

/**
 * The trusted frame around signed-in pages. Navigation and account actions
 * live here, outside any user-customized content (a Room canvas sits in
 * `main`, below the header and the bottom nav).
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
  const links = primaryNavigation(user.profile.username);
  const avatar = <Avatar url={user.profile.avatar?.thumbnailUrl} name={name} />;
  return (
    <>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link href="/home" className={styles.brand} aria-label="Paldora home">
            <Wordmark />
          </Link>
          <AppNav links={links} />
          <div className={styles.account}>
            <NotificationBell initial={unread} />
            {/* Below 768px Settings lives here, as the avatar. */}
            <Link
              href="/settings/account"
              className={styles.avatarLink}
              aria-label="Settings"
            >
              {avatar}
            </Link>
            <span className={styles.avatarPlain}>{avatar}</span>
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
      <BottomNav links={links} />
    </>
  );
}
