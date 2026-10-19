import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../api-error.js';
import type { RateLimitPolicy } from './rate-limit.decorator.js';
import type { RateLimitDecision, RateLimiter } from './rate-limiter.js';

/**
 * Records one attempt against `policy` for `subject` and throws when it is
 * over the limit. Fails closed: when the limit cannot be enforced (Redis
 * down, a script error), the action is refused with RATE_LIMIT_UNAVAILABLE.
 *
 * The route guard uses this for `@RateLimit`. Services call it directly for
 * limits that depend on the request body, such as the camera-upload limit,
 * which a second decorator on the same route cannot express.
 */
export async function assertWithinLimit(
  limiter: RateLimiter,
  subject: string,
  policy: RateLimitPolicy,
): Promise<void> {
  let decision: RateLimitDecision;
  try {
    decision = await limiter.consume(subject, policy);
  } catch {
    throw new ApiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      'RATE_LIMIT_UNAVAILABLE',
      'This action is temporarily unavailable. Try again shortly.',
    );
  }
  if (!decision.allowed) {
    throw new ApiError(
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMITED',
      'Too many requests. Try again later.',
      { 'Retry-After': String(decision.retryAfterSeconds) },
    );
  }
}

/** The key segment a per-person limit counts under. */
export const userSubject = (userId: string) => `user:${userId}`;
