import { HttpStatus } from '@nestjs/common';
import type { UserId } from '@paldora/domain';
import { describe, expect, it, vi } from 'vitest';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { RateLimitService } from '../src/rate-limit.service.js';

const userId = '00000000-0000-4000-8000-000000000001' as UserId;

describe('RateLimitService', () => {
  it('allows requests through the configured limit', async () => {
    const incrementRateLimit = vi.fn().mockResolvedValue(20);
    const service = rateLimits(incrementRateLimit);
    await expect(
      service.assertFriendRequestAllowed(userId),
    ).resolves.toBeUndefined();
    expect(incrementRateLimit).toHaveBeenCalledWith(
      `paldora:rate-limit:friend-request:${userId}`,
      3600,
    );
  });

  it('returns a stable error when the limit is exceeded', async () => {
    const service = rateLimits(vi.fn().mockResolvedValue(61));
    await expect(
      service.assertBoxInvitationAllowed(userId),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { error: { code: 'RATE_LIMITED' } },
    });
  });

  it('uses a separate post creation budget', async () => {
    const incrementRateLimit = vi.fn().mockResolvedValue(120);
    const service = rateLimits(incrementRateLimit);
    await expect(service.assertPostAllowed(userId)).resolves.toBeUndefined();
    expect(incrementRateLimit).toHaveBeenCalledWith(
      `paldora:rate-limit:post:${userId}`,
      3600,
    );
  });

  it('bounds direct post image uploads separately', async () => {
    const incrementRateLimit = vi.fn().mockResolvedValue(480);
    const service = rateLimits(incrementRateLimit);
    await expect(
      service.assertPostMediaUploadAllowed(userId),
    ).resolves.toBeUndefined();
    expect(incrementRateLimit).toHaveBeenCalledWith(
      `paldora:rate-limit:post-media-upload:${userId}`,
      3600,
    );
  });

  it('fails closed when Redis is unavailable', async () => {
    const service = rateLimits(vi.fn().mockRejectedValue(new Error('offline')));
    await expect(
      service.assertFriendRequestAllowed(userId),
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { error: { code: 'RATE_LIMIT_UNAVAILABLE' } },
    });
  });
});

function rateLimits(incrementRateLimit: ReturnType<typeof vi.fn>) {
  return new RateLimitService({
    incrementRateLimit,
  } as unknown as InfrastructureService);
}
