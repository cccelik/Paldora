import type { CurrentUser } from '@paldora/domain';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '../actions/auth';
import { Wordmark } from './wordmark';
import { InitialAvatar } from './ui';

const navigation = [
  { key: 'home', label: 'Home', href: '/home', icon: '⌂' },
  { label: 'Life Updates', icon: '♡' },
  { key: 'boxes', label: 'Boxes', href: '/boxes', icon: '◇' },
  { label: 'Memories', icon: '▧' },
  { key: 'friends', label: 'Friends', href: '/friends', icon: '♧' },
] as const;

export function AppShell({
  current,
  active,
  children,
}: {
  current: CurrentUser;
  active: 'home' | 'boxes' | 'friends' | 'settings';
  children: ReactNode;
}) {
  const accountName = current.profile.displayName ?? current.user.email;
  return (
    <main className="application-shell">
      <aside className="app-sidebar">
        <Wordmark compact />
        <nav aria-label="Primary navigation">
          {navigation.map((item) =>
            'href' in item ? (
              <Link
                aria-current={active === item.key ? 'page' : undefined}
                className={active === item.key ? 'active' : ''}
                href={item.href}
                key={item.label}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            ) : (
              <span className="nav-deferred" key={item.label}>
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
                <small>Soon</small>
              </span>
            ),
          )}
        </nav>
        <div className="sidebar-account">
          <div className="mini-profile">
            <InitialAvatar
              className="mini-avatar"
              name={accountName}
              imageUrl={current.profile.avatarUrl}
              length={2}
            />
            <div>
              <strong>{current.profile.displayName ?? 'Paldora friend'}</strong>
              <span>@{current.profile.username ?? 'setting-up'}</span>
            </div>
          </div>
          <Link
            className={active === 'settings' ? 'active' : ''}
            href="/settings/account"
          >
            <span aria-hidden="true">⚙</span> Settings
          </Link>
          <form action={signOutAction}>
            <button className="sidebar-signout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="app-main">{children}</div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link className={active === 'home' ? 'active' : ''} href="/home">
          <span>⌂</span>Home
        </Link>
        <Link className={active === 'boxes' ? 'active' : ''} href="/boxes">
          <span>◇</span>Boxes
        </Link>
        <Link
          className="mobile-create"
          href="/boxes/new"
          aria-label="Create a Box"
        >
          ＋<small>Box</small>
        </Link>
        <Link className={active === 'friends' ? 'active' : ''} href="/friends">
          <span>♧</span>Friends
        </Link>
        <Link
          className={active === 'settings' ? 'active' : ''}
          href="/settings/account"
        >
          <span>⚙</span>Settings
        </Link>
      </nav>
    </main>
  );
}
