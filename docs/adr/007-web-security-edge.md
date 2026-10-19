# ADR 007: One nonce CSP in proxy.ts; the proxy is optimistic only

Status: accepted (2026-10-18). Implements R3.

## Context

The legacy web app sent two Content-Security-Policy headers: a nonce policy
from `proxy.ts`, and an `'unsafe-inline'` policy from `next.config.ts`.
Browsers enforce both, so the effective policy was unclear.

The legacy proxy also called Supabase over the network on every request, and
public configuration silently fell back to `localhost`.

## Decision

- **CSP source.** `app/lib/csp.ts` builds the only CSP, and `proxy.ts` sets it
  per request. This follows the CSP guide in the installed Next 16.3 docs.
- **Production policy:**
  - scripts require the request nonce plus `'strict-dynamic'`;
  - styles allow `'self'` plus the nonce, with no inline styles;
  - `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`;
  - connections only to the API, Supabase, and the media origins;
  - `upgrade-insecure-requests` on HTTPS.
- **Development.** Adds only `'unsafe-eval'` for scripts and `'unsafe-inline'`
  for styles, as needed by hot reload and the error overlay.
- **Other headers.** `next.config.ts` sets only non-CSP security headers
  (HSTS in deployed environments).
- **Session refresh.** The proxy touches Supabase only when an `sb-*` cookie
  exists, and calls `getClaims()`. It never makes authorization decisions.
- **Configuration.** `next.config.ts` and `app/lib/environment.ts` validate
  public configuration with `@paldora/config`. A wrong value fails the build;
  there are no fallbacks.
- **Server Actions** return typed `ActionResult` values to `useActionState`,
  never query-string messages.

## Validation

- Unit tests cover the policy builder.
- Playwright on a production build asserts exactly one CSP header, a fresh
  nonce per request, no `unsafe-*` keywords, and no console CSP violations.
- `scripts/scan-client-bundle.mjs` fails CI when server-only names or
  credentials appear in browser bundles.

## Revisit when

Next.js changes its nonce or CSP guidance (re-read the local docs on upgrade),
or a feature needs a new origin. Add the origin to the builder, never a
wildcard.
