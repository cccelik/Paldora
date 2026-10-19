'use client';

import { useEffect, useRef } from 'react';
import { REALTIME_EVENT, type RealtimeHint } from '../lib/realtime';

/**
 * Calls `onHint` for realtime hints the bridge re-dispatches. The handler
 * may change between renders without resubscribing.
 */
export function useRealtimeHint(onHint: (hint: RealtimeHint) => void) {
  const handler = useRef(onHint);
  useEffect(() => {
    handler.current = onHint;
  }, [onHint]);
  useEffect(() => {
    const listener = (event: Event) => {
      const { detail } = event as CustomEvent<RealtimeHint>;
      if (detail && typeof detail.type === 'string') handler.current(detail);
    };
    window.addEventListener(REALTIME_EVENT, listener);
    return () => window.removeEventListener(REALTIME_EVENT, listener);
  }, []);
}
