'use client';

import { useRouter } from 'next/navigation';
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

  useEffect(() => {
    const abortController = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (event: { type: string; data: string }) => {
      announceRealtimeActivity(event);
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
  }, [router]);

  return null;
}
