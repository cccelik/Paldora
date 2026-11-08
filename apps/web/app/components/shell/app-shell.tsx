import { signOutAction } from '@/actions/auth';
import { SubmitButton } from '@/components/forms/submit-button';
import styles from '@/components/shell/app-shell.module.css';
import { ShellNavigation } from '@/components/shell/shell-navigation';
import { Avatar, Wordmark } from '@/components/ui';
import { primaryNavigation } from '@/lib/server/navigation';
import { type CurrentUser, type UnreadCount } from '@paldora/validation';
import Link from 'next/link';
import { type ReactNode } from 'react';
/**
 * The trusted frame around signed-in pages (Figma W03 layout): a 264px
 * sidebar from 1024px, a slim top bar and a floating bottom nav below it.
 * Navigation and account actions live here, outside any user-customized
 * content (a Room canvas sits in `main`, below the sidebar and the bottom
 * nav).
 */
export function AppShell({
  user,
  unread,
  children,
}: {
  user: CurrentUser;
  /** The first unread count; the navigation keeps it current from then on. */
  unread: UnreadCount;
  children: ReactNode;
}) {
  const handle = user.profile.username ?? '';
  const name = user.profile.displayName ?? handle;
  const links = primaryNavigation(user.profile.username);
  const avatarUrl = user.profile.avatar?.thumbnailUrl ?? null;
  const signOut = (
    <form action={signOutAction} className={styles.signOut}>
      <SubmitButton variant="quiet" pendingLabel="Signing out…">
        Sign out
      </SubmitButton>
    </form>
  );
  return (
    <div className={styles.frame}>
      <aside className={styles.sidebar}>
        <ShellNavigation
          part="sidebar"
          links={links}
          unread={unread}
          profile={{
            name,
            handle,
            avatarUrl,
          }}
          footer={signOut}
        />
      </aside>
      <div className={styles.content}>
        <header className={styles.header}>
          <Link href="/home" className={styles.brand} aria-label="Paldora home">
            <Wordmark />
          </Link>
          <div className={styles.account}>
            <Link
              href="/settings/account"
              className={styles.avatarLink}
              aria-label="Settings"
            >
              <Avatar url={avatarUrl} name={name} />
            </Link>
            {signOut}
          </div>
        </header>
        <main id="main" className={styles.main}>
          {children}
        </main>
      </div>
      <ShellNavigation
        part="bottom"
        links={links}
        unread={unread}
        profile={{ name, handle }}
        footer={null}
      />
    </div>
  );
}
