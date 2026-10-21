import type { Redis } from 'ioredis';

/** States in which a connection is on its way and worth a short wait. */
const settling = new Set(['connecting', 'connect', 'reconnecting']);

/** How long a command waits for a connection already being made. */
export const REDIS_READY_WAIT_MS = 2_000;

/**
 * Makes sure a lazy, no-offline-queue connection can take a command now.
 * The first caller opens it; callers that arrive while it is opening wait
 * for `ready` (bounded) instead of sending into a stream that is not
 * writable yet, which ioredis rejects at once. Before this, concurrent first
 * requests after API boot failed closed with RATE_LIMIT_UNAVAILABLE. A
 * connection that does not become ready in time, or has ended, is left as
 * it is: the command then fails, and rate-limited routes still fail closed.
 */
export async function redisReady(
  redis: Redis,
  waitMs: number = REDIS_READY_WAIT_MS,
): Promise<void> {
  if (redis.status === 'wait') {
    await redis.connect();
    return;
  }
  if (!settling.has(redis.status)) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      redis.off('ready', done);
      redis.off('end', done);
      resolve();
    };
    const timer = setTimeout(done, waitMs);
    redis.once('ready', done);
    redis.once('end', done);
  });
}
