import { requireEnvironmentVariables } from '@paldora/config';
import { afterAll, describe, expect, it } from 'vitest';
import { InfrastructureService } from './infrastructure.service.js';
import { RedisRateLimiter } from './rate-limit/rate-limiter.js';

const { DATABASE_URL, REDIS_URL } = requireEnvironmentVariables(
  ['DATABASE_URL', 'REDIS_URL'],
  process.env,
);
const infrastructure = new InfrastructureService({
  DATABASE_URL: DATABASE_URL ?? '',
  DATABASE_POOL_MAX: 2,
  REDIS_URL: REDIS_URL ?? '',
} as ConstructorParameters<typeof InfrastructureService>[0]);
const limiter = new RedisRateLimiter(infrastructure.redis);
const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

afterAll(() => infrastructure.onApplicationShutdown());

describe('infrastructure readiness', () => {
  it('is ready against real PostgreSQL and Redis', async () => {
    await expect(infrastructure.isReady()).resolves.toBe(true);
  });
});

describe('RedisRateLimiter', () => {
  const policy = { scope: `test-${run}`, limit: 3, windowSeconds: 60 };

  it('allows up to the limit, then denies with a retry hint', async () => {
    const decisions = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      // Sequential by design: each attempt observes the previous one.
      decisions.push(await limiter.consume('user:a', policy));
    }
    expect(decisions.map((decision) => decision.allowed)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(decisions[3]?.retryAfterSeconds).toBeGreaterThan(0);
    expect(decisions[3]?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('keeps subjects independent', async () => {
    await expect(limiter.consume('user:b', policy)).resolves.toMatchObject({
      allowed: true,
    });
  });

  it('does not over-admit under concurrency', async () => {
    const concurrent = { ...policy, scope: `${policy.scope}-burst`, limit: 5 };
    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume('user:c', concurrent)),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
  });
});

describe('Redis cold start', () => {
  it('serves concurrent first requests on a fresh lazy connection', async () => {
    // Right after boot nothing has connected yet. The first caller starts
    // the connection; the others must wait for it, not fail closed.
    const fresh = new InfrastructureService({
      DATABASE_URL: DATABASE_URL ?? '',
      DATABASE_POOL_MAX: 1,
      REDIS_URL: REDIS_URL ?? '',
    } as ConstructorParameters<typeof InfrastructureService>[0]);
    try {
      expect(fresh.redis.status).toBe('wait');
      const coldLimiter = new RedisRateLimiter(fresh.redis);
      const policy = {
        scope: `test-${run}-cold`,
        limit: 50,
        windowSeconds: 60,
      };
      const decisions = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          coldLimiter.consume(`user:${index}`, policy),
        ),
      );
      expect(decisions.every((decision) => decision.allowed)).toBe(true);
    } finally {
      await fresh.onApplicationShutdown();
    }
  });
});
