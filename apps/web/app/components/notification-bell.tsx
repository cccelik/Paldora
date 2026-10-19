'use client';

import type { UnreadCount } from '@paldora/validation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { unreadCountAction } from '../actions/notifications';
import { unreadBadge, unreadLabel } from '../lib/notification-text';
import { isNotificationHint, type RealtimeHint } from '../lib/realtime';
import { useToast } from './toast';
import { useRealtimeHint } from './use-realtime-hint';
import styles from './notification-bell.module.css';

const REFETCH_DEBOUNCE_MS = 300;

/**
 * The header's way to /notifications. The first count comes from the
 * layout; after that a realtime hint makes it refetch. Hints carry no
 * content, so the toast says only that something arrived.
 */
export function NotificationBell({ initial }: { initial: UnreadCount }) {
  const [count, setCount] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const pathname = usePathname();
  const showToast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A fresh server render (after mark-read, say) replaces the local count.
  if (initial !== seen) {
    setSeen(initial);
    setCount(initial);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const refetch = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void unreadCountAction().then((result) => {
        if (result.status === 'success') setCount(result.data);
      });
    }, REFETCH_DEBOUNCE_MS);
  }, []);

  useRealtimeHint((hint: RealtimeHint) => {
    if (!isNotificationHint(hint)) return;
    refetch();
    if (hint.type === 'notification.created' && pathname !== '/notifications') {
      showToast({
        message: 'You have a new notification.',
        link: { href: '/notifications', label: 'View' },
      });
    }
  });

  const badge = unreadBadge(count.capped ? 100 : count.count);
  const current = pathname === '/notifications';
  return (
    <Link
      href="/notifications"
      className={styles.bell}
      aria-label={unreadLabel(count.count, count.capped)}
      aria-current={current ? 'page' : undefined}
      data-unread={count.count}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 3a6 6 0 0 0-6 6v3.6l-1.7 2.9A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z" />
      </svg>
      {badge ? (
        <span className={styles.badge} aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
