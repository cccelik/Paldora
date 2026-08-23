import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InfrastructureService } from '../src/infrastructure.service.js';

const hasInfrastructure = Boolean(
  process.env.DATABASE_URL && process.env.REDIS_URL,
);

describe.runIf(hasInfrastructure)('Redis rate-limit integration', () => {
  let infrastructure: InfrastructureService;

  beforeAll(() => {
    infrastructure = new InfrastructureService();
  });

  afterAll(async () => {
    await infrastructure.onApplicationShutdown();
  });

  it('atomically increments a fixed-window counter', async () => {
    const key = `paldora:rate-limit:integration:${randomUUID()}`;
    await expect(infrastructure.incrementRateLimit(key, 5)).resolves.toBe(1);
    await expect(infrastructure.incrementRateLimit(key, 5)).resolves.toBe(2);
  });
});
