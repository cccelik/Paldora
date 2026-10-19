'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { runAuthenticatedEventLoop } from '../lib/authenticated-sse';
import { announceRealtimeActivity } from '../lib/realtime-browser-event';

const APPLICATION_EVENT_TYPES = new Set([
  'ready',
  'post.created',
  'post.updated',
  'post.deleted',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'reaction.set',
  'comment.reaction.set',
  'notification.created',
]);

/** Keeps every protected page current while using only one HTTP stream per tab. */
export function AppRealtimeBridge() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const abortController = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let connected = false;
    const refresh = (event: { type: string; data: string }) => {
      announceRealtimeActivity(event);
      if (event.type === 'ready' && !connected) {
        connected = true;
        return;
      }
      // Server refreshes must never replace an in-progress structured edit.
      // The editor owns its local preview and saves explicitly.
      if (pathname.endsWith('/customize')) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 80);
    };
    void runAuthenticatedEventLoop(
      '/me/feed/events',
      APPLICATION_EVENT_TYPES,
      abortController.signal,
      refresh,
    );
    return () => {
      clearTimeout(refreshTimer);
      abortController.abort();
    };
  }, [pathname, router]);

  return null;
}
