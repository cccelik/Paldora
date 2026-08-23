'use client';

import type { BoxId } from '@paldora/domain';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase/client';
import { parseServerSentEvents } from '../lib/sse';

const POST_EVENT_TYPES = new Set([
  'post.created',
  'post.updated',
  'post.deleted',
]);

export function PostRealtimeRefresh({ boxId }: { boxId?: BoxId }) {
  const router = useRouter();

  useEffect(() => {
    const abortController = new AbortController();
    let stopped = false;
    let retryMilliseconds = 1_000;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 80);
    };

    const connect = async () => {
      const supabase = createSupabaseBrowserClient();
      while (!stopped) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) return;
          const baseUrl = (
            process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
          ).replace(/\/$/, '');
          const eventPath = boxId
            ? `/boxes/${encodeURIComponent(boxId)}/posts/events`
            : '/me/feed/events';
          const response = await fetch(`${baseUrl}${eventPath}`, {
            cache: 'no-store',
            headers: {
              accept: 'text/event-stream',
              authorization: `Bearer ${session.access_token}`,
            },
            signal: abortController.signal,
          });
          if (!response.ok || !response.body) {
            if (response.status === 401) await supabase.auth.refreshSession();
            if (response.status === 403 || response.status === 404) return;
            throw new Error(`Post event stream returned ${response.status}.`);
          }
          retryMilliseconds = 1_000;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!stopped) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = parseServerSentEvents(buffer);
            buffer = parsed.remainder;
            if (
              parsed.events.some((event) => POST_EVENT_TYPES.has(event.type))
            ) {
              scheduleRefresh();
            }
          }
        } catch {
          if (abortController.signal.aborted) return;
        }
        await wait(retryMilliseconds, abortController.signal);
        retryMilliseconds = Math.min(retryMilliseconds * 2, 30_000);
      }
    };

    void connect();
    return () => {
      stopped = true;
      clearTimeout(refreshTimer);
      abortController.abort();
    };
  }, [boxId, router]);

  return null;
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
