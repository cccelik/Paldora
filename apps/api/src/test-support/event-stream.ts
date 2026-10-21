import type { RealtimeEvent } from '@paldora/validation';

export interface OpenStream {
  readonly response: Response;
  readonly events: RealtimeEvent[];
  /** Resolves with the first matching event, or rejects after `timeoutMs`. */
  waitFor(
    match: (event: RealtimeEvent) => boolean,
    timeoutMs?: number,
  ): Promise<RealtimeEvent>;
  /** Passes only if no matching event arrives within `windowMs`. */
  expectNone(
    match: (event: RealtimeEvent) => boolean,
    windowMs?: number,
  ): Promise<void>;
  /** Resolves when the server ends the stream. */
  readonly ended: Promise<void>;
  close(): void;
}

/** A minimal SSE client for tests: opens `/me/events` and collects events. */
export async function openStream(
  baseUrl: string,
  token: string,
): Promise<OpenStream> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/me/events`, {
    headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
    signal: controller.signal,
  });
  const events: RealtimeEvent[] = [];
  const waiters = new Set<() => void>();
  let finish: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    finish = resolve;
  });
  if (response.ok && response.body) {
    void (async () => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const data = block
              .split('\n')
              .find((line) => line.startsWith('data:'));
            if (data)
              events.push(JSON.parse(data.slice(5).trim()) as RealtimeEvent);
          }
          for (const wake of waiters) wake();
        }
      } catch {
        // Aborted by the test.
      }
      finish();
      for (const wake of waiters) wake();
    })();
  } else {
    finish();
  }
  const find = (match: (event: RealtimeEvent) => boolean, from = 0) =>
    events.slice(from).find(match);
  return {
    response,
    events,
    ended,
    close: () => controller.abort(),
    waitFor(match, timeoutMs = 5_000) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const found = find(match);
          if (found) {
            waiters.delete(check);
            clearTimeout(timer);
            resolve(found);
          }
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(
            new Error(
              `No matching event in ${timeoutMs}ms: ${JSON.stringify(events)}`,
            ),
          );
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
    async expectNone(match, windowMs = 600) {
      const seen = events.length;
      await new Promise((resolve) => {
        setTimeout(resolve, windowMs);
      });
      if (find(match, 0)) {
        throw new Error(
          `Unexpected event: ${JSON.stringify(find(match, 0))} (had ${seen} before)`,
        );
      }
    },
  };
}
