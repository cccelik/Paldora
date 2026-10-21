import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { redisReady } from './redis-ready.js';

/** Just enough of an ioredis client: a status, connect, and events. */
function fakeRedis(status: string) {
  const emitter = new EventEmitter() as EventEmitter & {
    status: string;
    connect: ReturnType<typeof vi.fn>;
  };
  emitter.status = status;
  emitter.connect = vi.fn(async () => {
    emitter.status = 'ready';
  });
  return emitter;
}

const asRedis = (fake: ReturnType<typeof fakeRedis>) =>
  fake as unknown as Redis;

describe('redisReady', () => {
  it('opens a lazy connection that has not started', async () => {
    const redis = fakeRedis('wait');
    await redisReady(asRedis(redis));
    expect(redis.connect).toHaveBeenCalledTimes(1);
  });

  it('returns at once when ready, ended, or closed (the command decides)', async () => {
    for (const status of ['ready', 'end', 'close']) {
      const redis = fakeRedis(status);
      await redisReady(asRedis(redis), 10_000);
      expect(redis.connect, status).not.toHaveBeenCalled();
    }
  });

  it('waits for a connection that is being opened instead of failing', async () => {
    const redis = fakeRedis('connecting');
    let settled = false;
    const waiting = redisReady(asRedis(redis), 10_000).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    redis.status = 'ready';
    redis.emit('ready');
    await waiting;
    expect(settled).toBe(true);
    expect(redis.connect).not.toHaveBeenCalled();
    expect(redis.listenerCount('ready')).toBe(0);
    expect(redis.listenerCount('end')).toBe(0);
  });

  it('gives up after the wait, so rate limits still fail closed', async () => {
    vi.useFakeTimers();
    try {
      const redis = fakeRedis('reconnecting');
      const waiting = redisReady(asRedis(redis), 50);
      await vi.advanceTimersByTimeAsync(50);
      await expect(waiting).resolves.toBeUndefined();
      expect(redis.listenerCount('ready')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
