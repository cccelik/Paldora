'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import { PALDORA_ACTIVITY_EVENT } from '../lib/realtime-browser-event';

export function NotificationNavLink({
  active,
  mobile = false,
}: {
  active: boolean;
  mobile?: boolean;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    const load = () => {
      void createBrowserApiClient()
        .unreadNotificationCount()
        .then(({ unreadCount: count }) => setUnreadCount(count))
        .catch(() => undefined);
    };
    load();
    window.addEventListener(PALDORA_ACTIVITY_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      window.removeEventListener(PALDORA_ACTIVITY_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, []);
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      className={active ? 'active' : ''}
      href={'/notifications' as Route}
    >
      <span aria-hidden="true">♢</span>
      Notifications
      {unreadCount > 0 && (
        <small className="notification-badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </small>
      )}
      {mobile && <span className="sr-only"> notifications</span>}
    </Link>
  );
}
