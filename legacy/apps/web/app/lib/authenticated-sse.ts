'use client';

import { createSupabaseBrowserClient } from './supabase/client';
import { parseServerSentEvents, type ServerSentEvent } from './sse';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
).replace(/\/$/, '');
const INITIAL_RETRY_MILLISECONDS = 1_000;
const MAX_RETRY_MILLISECONDS = 30_000;

export async function runAuthenticatedEventLoop(
  path: string,
  eventTypes: ReadonlySet<string>,
  signal: AbortSignal,
  onEvent: (event: ServerSentEvent) => void,
): Promise<void> {
  let retryMilliseconds = INITIAL_RETRY_MILLISECONDS;
  while (!signal.aborted) {
    // Connections are sequential so one component owns one authenticated stream.
    // eslint-disable-next-line no-await-in-loop
    const outcome = await consumeConnection(
      path,
      eventTypes,
      signal,
      onEvent,
    ).catch(() => 'retry' as const);
    if (signal.aborted || outcome === 'stop') return;
    retryMilliseconds =
      outcome === 'connected' ? INITIAL_RETRY_MILLISECONDS : retryMilliseconds;
    // eslint-disable-next-line no-await-in-loop
    await abortableDelay(retryMilliseconds, signal);
    retryMilliseconds = Math.min(retryMilliseconds * 2, MAX_RETRY_MILLISECONDS);
  }
}

async function consumeConnection(
  path: string,
  eventTypes: ReadonlySet<string>,
  signal: AbortSignal,
  onEvent: (event: ServerSentEvent) => void,
): Promise<'connected' | 'retry' | 'stop'> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return 'stop';
  const response = await fetch(`${API_BASE_URL}${path}`, {
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
    throw new Error(`Event stream returned ${response.status}.`);
  }
  await consumeStream(response.body, eventTypes, signal, onEvent);
  return 'connected';
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  eventTypes: ReadonlySet<string>,
  signal: AbortSignal,
  onEvent: (event: ServerSentEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    // A ReadableStream reader is inherently sequential.
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseServerSentEvents(buffer);
    buffer = parsed.remainder;
    for (const event of parsed.events) {
      if (eventTypes.has(event.type)) onEvent(event);
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
