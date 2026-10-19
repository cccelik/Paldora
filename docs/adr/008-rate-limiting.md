# ADR 008: Declarative sliding-window rate limits that fail closed

Status: accepted (2026-10-18). Implements R6.

## Context

Legacy rate limits had three gaps:

- They were called by hand inside controllers.
- They used fixed windows.
- They were missing from several abuse-sensitive writes, including Life
  Updates, uploads, Room edits, Box creation, and username checks.

## Decision

- **Declaring limits.** `@RateLimit({ scope, limit, windowSeconds })` declares
  a limit, and `@RateLimitExempt(reason)` records a deliberate exemption. The
  route-inventory test fails if any non-GET handler has neither.
- **Enforcement.** A global `RateLimitGuard` runs after `AuthGuard`. It keys
  on the verified identity, or on IP for public routes.
- **Algorithm.** `RedisRateLimiter` keeps a sliding log in a sorted set,
  updated by one Lua script that uses Redis `TIME`, so API instances with
  skewed clocks agree. Denied attempts are not recorded.
- **Failure behavior.** If Redis is unavailable, the guard returns 503
  `RATE_LIMIT_UNAVAILABLE` (fail closed). An exceeded limit returns 429
  `RATE_LIMITED` with `Retry-After`.
- **Coverage.** Integration tests prove exact admission under 20 concurrent
  attempts, per-subject isolation, and retry hints.

## Consequences

- Each limited action costs one Redis round trip.
- Memory is O(limit) per subject and scope, fine for the hourly limits
  inherited from legacy (≤ 1,000).

## Revisit when

- Limits need very high ceilings: switch to a GCRA or approximate
  sliding-window counter.
- Public signup ships: add edge and IP-reputation limits in front.
