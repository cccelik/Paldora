import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { UserId } from '@paldora/domain';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';

const oneHourSeconds = 60 * 60;

@Injectable()
export class RateLimitService {
  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}

  public assertFriendRequestAllowed(userId: UserId): Promise<void> {
    return this.assertAllowed('friend-request', userId, 20, oneHourSeconds);
  }

  public assertBoxInvitationAllowed(userId: UserId): Promise<void> {
    return this.assertAllowed('box-invitation', userId, 60, oneHourSeconds);
  }

  private async assertAllowed(
    scope: string,
    userId: UserId,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    let count: number;
    try {
      count = await this.infrastructure.incrementRateLimit(
        `paldora:rate-limit:${scope}:${userId}`,
        windowSeconds,
      );
    } catch {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'RATE_LIMIT_UNAVAILABLE',
        'This action is temporarily unavailable. Try again shortly.',
      );
    }
    if (count > limit) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many requests. Try again later.',
      );
    }
  }
}
