'use client';

import { unreadCountAction } from '@/actions/notifications';
import { useToast } from '@/components/common/toast';
import { useDebouncedCallback } from '@/components/common/use-debounced-callback';
import { useRealtimeHint } from '@/components/realtime/use-realtime-hint';
import {
  REALTIME_DEBOUNCE_MS,
  isNotificationHint,
  type RealtimeHint,
} from '@/lib/realtime/realtime';
import { type UnreadCount } from '@paldora/validation';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * The live unread count behind the sidebar and the bottom nav. The first
 * count comes from the layout; after that a realtime hint makes it refetch.
 * Hints carry no content, so the toast says only that something arrived.
 */
export function useNotificationCount(initial: UnreadCount): UnreadCount {
  const [count, setCount] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const pathname = usePathname();
  const showToast = useToast();

  // A fresh server render (after mark-read, say) replaces the local count.
  if (initial !== seen) {
    setSeen(initial);
    setCount(initial);
  }

  const refetch = useDebouncedCallback(() => {
    void unreadCountAction().then((result) => {
      if (result.status === 'success') setCount(result.data);
    });
  }, REALTIME_DEBOUNCE_MS.unreadCount);

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
  return count;
}
