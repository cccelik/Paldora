'use client';

import { createBrowserClient } from '@supabase/ssr';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { readEventStream } from '../lib/event-stream';
import {
  backoffDelay,
  parseHint,
  REALTIME_DEBOUNCE_MS,
  REALTIME_EVENT,
  shouldRefresh,
  shouldResync,
  type RealtimeHint,
} from '../lib/realtime';

interface RealtimeBridgeProps {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * One event stream per tab (R5). It only invalidates: when a hint says the
 * page on screen is affected, the server components re-render through their
 * normal authorized queries. Every hint is also re-dispatched as a window
 * `paldora:realtime` event, so a card or the bell can refetch just itself. Nothing from the stream is rendered directly.
 * The stream ends at token expiry and on any error; reconnecting gets a fresh
 * token and a `resync`, so a missed hint is repaired rather than trusted.
 */
export function RealtimeBridge({
  apiUrl,
  supabaseUrl,
  supabaseAnonKey,
}: RealtimeBridgeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let connectedBefore = false;
    let attempt = 0;

    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(
        () => router.refresh(),
        REALTIME_DEBOUNCE_MS.routeRefresh,
      );
    };

    async function listenOnce(): Promise<void> {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('signed out');
      const response = await fetch(`${apiUrl}/me/events`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'text/event-stream',
        },
        cache: 'no-store',
        signal,
      });
      if (!response.ok || !response.body) throw new Error('stream rejected');
      for await (const message of readEventStream(response.body)) {
        const hint = parseHint(message.data);
        if (!hint) continue;
        if (hint.type === 'resync') {
          attempt = 0;
          if (!signal.aborted) setConnected(true);
          // The first connection already rendered fresh data; later ones
          // may have missed events while disconnected.
          if (connectedBefore && shouldResync(pathRef.current)) refresh();
          connectedBefore = true;
        } else if (hint.type !== 'ping') {
          // Components that show one item (a card's summary, the bell)
          // listen for this and refetch only what the hint concerns.
          window.dispatchEvent(
            new CustomEvent<RealtimeHint>(REALTIME_EVENT, { detail: hint }),
          );
          if (shouldRefresh(pathRef.current, hint)) refresh();
        }
      }
    }

    async function run(): Promise<void> {
      while (!signal.aborted) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await listenOnce();
        } catch {
          if (signal.aborted) return;
        }
        if (!signal.aborted) setConnected(false);
        // Reconnect with jittered backoff, whether it ended or failed.
        // eslint-disable-next-line no-await-in-loop
        await sleep(backoffDelay(attempt), signal);
        attempt += 1;
      }
    }

    void run();
    return () => {
      controller.abort();
      clearTimeout(refreshTimer);
    };
  }, [apiUrl, supabaseUrl, supabaseAnonKey, router]);

  // A hidden marker: lets tests (and later, status UI) know the stream is live.
  return <span hidden data-realtime={connected ? 'connected' : 'connecting'} />;
}
