import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { redisReady } from '../db/redis-ready.js';
import type { RateLimitPolicy } from './rate-limit.decorator.js';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Records one attempt. Throws when the limit cannot be enforced. */
  consume(subject: string, policy: RateLimitPolicy): Promise<RateLimitDecision>;
}

/**
 * Sliding-log limiter. Uses Redis server time so API instances with skewed
 * clocks share one window. Denied attempts are not recorded, so a client that
 * respects Retry-After regains access when the oldest attempt ages out.
 */
const slidingWindowScript = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
if redis.call('ZCARD', key) >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, tonumber(oldest[2]) + window - now}
end
redis.call('ZADD', key, now, ARGV[3])
redis.call('PEXPIRE', key, window)
return {1, 0}
`;

export class RedisRateLimiter implements RateLimiter {
  public constructor(private readonly redis: Redis) {}

  public async consume(
    subject: string,
    policy: RateLimitPolicy,
  ): Promise<RateLimitDecision> {
    await redisReady(this.redis);
    const [allowed, retryAfterMs] = (await this.redis.eval(
      slidingWindowScript,
      1,
      `paldora:rate-limit:${policy.scope}:${subject}`,
      policy.windowSeconds * 1_000,
      policy.limit,
      randomUUID(),
    )) as [number, number];
    return {
      allowed: allowed === 1,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
    };
  }
}
