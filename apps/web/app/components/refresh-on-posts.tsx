'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import {
  REALTIME_DEBOUNCE_MS,
  concernsPosts,
  type RealtimeHint,
} from '../lib/realtime';
import { useRealtimeHint } from './use-realtime-hint';

/**
 * Re-renders the page (through its normal authorized queries) when a
 * realtime hint concerns one of these posts. For pages whose URL does not
 * name the posts they show, such as a Life Update's page. Renders nothing.
 */
export function RefreshOnPosts({ postIds }: { postIds: readonly string[] }) {
  const router = useRouter();
  const shown = useMemo(
    () => new Set(postIds.map((id) => id.toLowerCase())),
    [postIds],
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useRealtimeHint((hint: RealtimeHint) => {
    if (!concernsPosts(shown, hint)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => router.refresh(),
      REALTIME_DEBOUNCE_MS.routeRefresh,
    );
  });
  return null;
}
