# ADR 003: Supabase Auth for identity only

Status: accepted (2026-10-18). Decision D4, confirmed by the owner on 2026-10-18.

## Context

Paldora needs:

- email/password sign-in now;
- recovery, OAuth, magic link, passkeys, and MFA later;
- administrative provisioning while public signup stays disabled.

Building authentication in-house is high-risk.

## Decision

- **Scope.** Supabase Auth issues sessions. Paldora uses it for identity
  only: no Supabase database, RLS, or storage authorization.
- **Verification.** The API verifies every access token with `jose` against
  the project's JWKS (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`). It
  checks the issuer, the `authenticated` audience, the expiry (5 s
  tolerance), and that the token has `sub` and `exp`.
- **Algorithms.** Only ES256 and RS256 are accepted. HS256 and `none` are
  rejected, so a leaked shared secret or algorithm confusion cannot mint
  tokens. Tests prove both rejections.
- **User mapping.** `sub` maps to a separately provisioned internal user in
  Phase 1. A valid but unknown identity receives `ACCOUNT_NOT_PROVISIONED`.
- **Web sessions.** The web proxy refreshes sessions with
  `supabase.auth.getClaims()`. Supabase's Next.js guide (checked 2026-10)
  says never to trust `getSession()` in server code.
- **Service-role key.** It is used only by the trusted provisioning script,
  never by web, native apps, or deployed services.

## Consequences

- **Asymmetric signing keys required.** The Supabase project must use them.
  Legacy projects that still sign with a shared secret must migrate first.
- **Two user rows.** Account deletion must remove both the Supabase identity
  and the Paldora user.

## Revisit when

Passkeys, MFA, or session-management requirements outgrow Supabase, or pricing
or terms change materially.
