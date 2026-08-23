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
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
).replace(/\/$/, '');
const INITIAL_RETRY_MILLISECONDS = 1_000;
const MAX_RETRY_MILLISECONDS = 30_000;

export function PostRealtimeRefresh({ boxId }: { boxId?: BoxId }) {
  const router = useRouter();

  useEffect(() => {
    const abortController = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 80);
    };

    void runPostEventLoop(boxId, abortController.signal, scheduleRefresh);
    return () => {
      clearTimeout(refreshTimer);
      abortController.abort();
    };
  }, [boxId, router]);

  return null;
}

async function runPostEventLoop(
  boxId: BoxId | undefined,
  signal: AbortSignal,
  onPostEvent: () => void,
): Promise<void> {
  let retryMilliseconds = INITIAL_RETRY_MILLISECONDS;
  while (!signal.aborted) {
    // Connections must be retried sequentially so only one authenticated stream exists.
    // eslint-disable-next-line no-await-in-loop
    const outcome = await consumePostEventConnection(
      boxId,
      signal,
      onPostEvent,
    ).catch(() => 'retry' as const);
    if (signal.aborted || outcome === 'stop') return;
    retryMilliseconds =
      outcome === 'connected' ? INITIAL_RETRY_MILLISECONDS : retryMilliseconds;
    // eslint-disable-next-line no-await-in-loop
    await abortableDelay(retryMilliseconds, signal);
    retryMilliseconds = Math.min(retryMilliseconds * 2, MAX_RETRY_MILLISECONDS);
  }
}

async function consumePostEventConnection(
  boxId: BoxId | undefined,
  signal: AbortSignal,
  onPostEvent: () => void,
): Promise<'connected' | 'retry' | 'stop'> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 'stop';
  const eventPath = boxId
    ? `/boxes/${encodeURIComponent(boxId)}/posts/events`
    : '/me/feed/events';
  const response = await fetch(`${API_BASE_URL}${eventPath}`, {
    cache: 'no-store',
    headers: {
      accept: 'text/event-stream',
      authorization: `Bearer ${session.access_token}`,
    },
    signal,
  });
  if (response.status === 401) {
    await supabase.auth.refreshSession();
    return 'retry';
  }
  if (response.status === 403 || response.status === 404) return 'stop';
  if (!response.ok || !response.body) {
    throw new Error(`Post event stream returned ${response.status}.`);
  }
  await consumePostEventStream(response.body, signal, onPostEvent);
  return 'connected';
}

async function consumePostEventStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onPostEvent: () => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    // A ReadableStream reader is inherently sequential; concurrent reads are invalid.
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseServerSentEvents(buffer);
    buffer = parsed.remainder;
    if (parsed.events.some((event) => POST_EVENT_TYPES.has(event.type))) {
      onPostEvent();
    }
  }
}

function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}
