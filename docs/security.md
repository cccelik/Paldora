# Security

Paldora is private by default, and authorization is deny-by-default. The
non-negotiable invariants live in [CLAUDE.md §G](../CLAUDE.md). This page
records the controls that are implemented and how each one is verified.

## Implemented controls (Phases 0–1)

| Control                       | Implementation                                                                                                                                           | Verified by                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Authentication on every route | Global `AuthGuard`; `@Public()` only for contract routes declared public                                                                                 | `route-inventory.test.ts`, `platform.test.ts`                        |
| Token verification            | `jose` with JWKS; issuer, audience, `exp`, `sub`; ES256/RS256 only                                                                                       | `access-token-verifier.test.ts` (forged, HS256, `none`, expired)     |
| Non-leaking errors            | One envelope with `requestId`; unknown errors become `INTERNAL_ERROR`, never stack traces or messages                                                    | `platform.test.ts`                                                   |
| Input bounds                  | 256 kB JSON limit; Zod at the boundary; page size ≤ 50                                                                                                   | `platform.test.ts`, conformance fixtures                             |
| Abuse limits                  | Declarative sliding-window limits; fail closed with 503                                                                                                  | `platform.test.ts`, Redis integration test                           |
| CORS                          | Exact `WEB_ORIGIN`, no credentials, explicit methods and headers                                                                                         | `platform.test.ts`                                                   |
| API headers                   | helmet; CSP `default-src 'none'; frame-ancestors 'none'`                                                                                                 | `platform.test.ts`                                                   |
| Web CSP                       | One per-request nonce policy in `proxy.ts`; no inline script or style in production                                                                      | `csp.test.ts`, Playwright                                            |
| Web headers                   | nosniff, `X-Frame-Options: DENY`, COOP, restrictive Permissions-Policy, HSTS when deployed                                                               | Playwright                                                           |
| Configuration                 | Zod parsers; HTTPS and no `*_dev_only` credentials in staging and production; errors name keys, never values                                             | `runtimes.test.ts`                                                   |
| Log privacy                   | Redaction of auth headers, cookies, tokens, passwords, secrets, signed URLs, bodies, and content (three levels deep); paths logged without query strings | `logger.test.ts`, `platform.test.ts`                                 |
| Bundle secrets                | `scripts/scan-client-bundle.mjs` in CI                                                                                                                   | CI `validate` job                                                    |
| Principal mapping             | After JWT verification the guard maps `sub` to an internal user on every request: unknown → `ACCOUNT_NOT_PROVISIONED`, non-active → `ACCOUNT_BLOCKED`    | `platform.test.ts`, `identity.integration.test.ts`                   |
| Admin-only provisioning       | Public signup disabled; the service-role key exists only in the provisioning script's environment                                                        | `runtimes.test.ts`, `provision-user.integration.test.ts`             |
| Signed uploads                | PUT signed for exact `content-type` and `content-length`, 300 s; completion re-checks owner, status, size, and MIME; single use                          | `s3-object-storage.integration.test.ts`, `media.integration.test.ts` |
| Image processing              | Sharp `failOn: 'error'`, 40 MP decode limit, allowed decoded formats only, orientation applied, all metadata stripped; raw upload deleted (D2)           | `derivatives.test.ts`, `worker.integration.test.ts`, full-stack e2e  |
| Signed reads                  | Only display/thumbnail derivatives are signed (900 s); masters and raw uploads never leave the server                                                    | `media.integration.test.ts`                                          |
| Web session                   | Supabase SSR cookies; proxy redirects protected pages without a session (optimistic only); recovery callback allowlist; failures carry no URL details    | `callback-path.test.ts`, `proxy.test.ts`, e2e                        |

## Authorization matrix: Phase 1

| Resource / action                   | Who may                         | Guessed ID / other user             | After suspension  |
| ----------------------------------- | ------------------------------- | ----------------------------------- | ----------------- |
| `GET /me`                           | The signed-in, active user      | n/a (no ID in the route)            | `ACCOUNT_BLOCKED` |
| `PATCH /me/profile`                 | Self; onboarding forward only   | n/a                                 | `ACCOUNT_BLOCKED` |
| `GET /me/username-availability`     | Self; rate-limited (120/h)      | Reveals only taken/free, never who  | `ACCOUNT_BLOCKED` |
| `PUT /me/preferences`               | Self                            | n/a                                 | `ACCOUNT_BLOCKED` |
| `DELETE /me/avatar`                 | Self; idempotent                | n/a                                 | `ACCOUNT_BLOCKED` |
| `POST /media/uploads`               | Self, within the purpose policy | Client cannot choose keys or owners | `ACCOUNT_BLOCKED` |
| `POST /media/uploads/{id}/complete` | Owner, once, while `pending`    | `MEDIA_NOT_FOUND` (same as missing) | `ACCOUNT_BLOCKED` |
| `GET /media/{id}`                   | Owner                           | `MEDIA_NOT_FOUND` (same as missing) | `ACCOUNT_BLOCKED` |

Blocks, Boxes, and other viewers do not exist yet: no Phase 1 route returns
another person's data. Avatars of other people become readable with
friendships and Boxes in Phase 2, through those policies.

## Assumptions

- TLS terminates at the deployment edge, which enforces HTTPS.
- PostgreSQL and Redis are reachable only on private networks. Locally, they
  bind to loopback.
- Secrets come from the platform's secret manager. `.env` is local only and
  never committed.
- Buckets are private, and clients only ever receive short-lived signed URLs.

## Per-feature requirement

Before implementation, every feature documents and tests its authorization
matrix:

- create, read, update, and delete rights;
- guessed IDs;
- blocks in either direction;
- former members;
- archived and deleted states;
- suspension;
- indistinguishable absence and denial.

Never claim encryption properties that are not implemented. End-to-end
encrypted Boxes require their own threat model and an external review.
