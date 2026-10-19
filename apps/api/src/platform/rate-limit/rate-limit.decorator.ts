import { SetMetadata } from '@nestjs/common';

export interface RateLimitPolicy {
  /** Stable key segment, e.g. `friend-request`. Changing it resets counters. */
  readonly scope: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'paldora:rateLimit';
export const RATE_LIMIT_EXEMPT_KEY = 'paldora:rateLimitExempt';

/**
 * Applies a sliding-window limit per authenticated identity (per IP on public
 * routes). Enforcement fails closed with `RATE_LIMIT_UNAVAILABLE`.
 */
export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_KEY, policy);

/**
 * Records a deliberate decision that a mutating route needs no limit. The
 * route-inventory test requires every non-GET handler to have one or the other.
 */
export const RateLimitExempt = (reason: string) =>
  SetMetadata(RATE_LIMIT_EXEMPT_KEY, reason);
