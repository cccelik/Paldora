import type { CurrentUser } from '@paldora/domain';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOutAction } from '../actions/auth';
import { roomPath } from '../lib/room-paths';
import { Wordmark } from './wordmark';
import { InitialAvatar } from './ui';
import { NotificationNavLink } from './notification-nav-link';
import { AppRealtimeBridge } from './app-realtime-bridge';
import { AppAppearanceBridge } from './app-appearance-bridge';

const navigation = [
  { key: 'home', label: 'Home', href: '/home', icon: '⌂' },
  {
    key: 'life-updates',
    label: 'Life Updates',
    href: '/life-updates',
    icon: '♡',
  },
  { key: 'boxes', label: 'Boxes', href: '/boxes', icon: '◇' },
  { key: 'memories', label: 'Memories', href: '/memories', icon: '▧' },
  { key: 'friends', label: 'Friends', href: '/friends', icon: '♧' },
] as const;

function currentRoomPath(current: CurrentUser) {
  return current.profile.username
    ? roomPath(current.profile.username)
    : '/settings/account';
}

export function AppShell({
  current,
  active,
  children,
}: {
  current: CurrentUser;
  active:
    | 'home'
    | 'life-updates'
    | 'boxes'
    | 'memories'
    | 'room'
    | 'friends'
    | 'notifications'
    | 'settings';
  children: ReactNode;
}) {
  const accountName = current.profile.displayName ?? current.user.email;
  const mobileRoomHref = currentRoomPath(current);
  return (
    <main className="application-shell">
      <AppRealtimeBridge />
      <AppAppearanceBridge />
      <aside className="app-sidebar">
        <Wordmark compact />
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              aria-current={active === item.key ? 'page' : undefined}
              className={active === item.key ? 'active' : ''}
              href={item.href}
              key={item.label}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          {current.profile.username && (
            <Link
              aria-current={active === 'room' ? 'page' : undefined}
              className={active === 'room' ? 'active' : ''}
              href={roomPath(current.profile.username)}
            >
              <span aria-hidden="true">✦</span>
              My Room
            </Link>
          )}
        </nav>
        <div className="sidebar-notifications">
          <NotificationNavLink active={active === 'notifications'} />
        </div>
        <div className="sidebar-account">
          <Link
            className="mini-profile"
            href={
              current.profile.username
                ? roomPath(current.profile.username)
                : '/settings/account'
            }
          >
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
          </Link>
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
          aria-current={active === 'room' ? 'page' : undefined}
          aria-label="Open My Room"
          className={`mobile-create${active === 'room' ? ' active' : ''}`}
          href={mobileRoomHref}
        >
          <span aria-hidden="true">✦</span>
          <small>Room</small>
        </Link>
        <Link className={active === 'friends' ? 'active' : ''} href="/friends">
          <span>♧</span>Friends
        </Link>
        <NotificationNavLink active={active === 'notifications'} mobile />
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
