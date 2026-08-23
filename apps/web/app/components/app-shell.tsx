import type { CurrentUser } from '@paldora/domain';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '../actions/auth';
import { Wordmark } from './wordmark';

const navigation = [
  ['Home', '/home', '⌂'],
  ['Life Updates', '#later-life-updates', '♡'],
  ['Boxes', '/boxes', '◇'],
  ['Memories', '#later-memories', '▧'],
  ['Friends', '/friends', '♧'],
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
  const initials = (current.profile.displayName ?? current.user.email)
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <main className="application-shell">
      <aside className="app-sidebar">
        <Wordmark compact />
        <nav aria-label="Primary navigation">
          {navigation.map(([label, href, icon]) => (
            <Link
              aria-current={
                active === label.toLocaleLowerCase() ? 'page' : undefined
              }
              className={active === label.toLocaleLowerCase() ? 'active' : ''}
              href={href}
              key={label}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
              {href.startsWith('#') && <small>Soon</small>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="mini-profile">
            <div className="mini-avatar">
              {current.profile.avatarUrl ? (
                <img src={current.profile.avatarUrl} alt="" />
              ) : (
                initials
              )}
            </div>
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
