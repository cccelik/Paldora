# Security

Paldora is private by default, and authorization is deny-by-default. The
non-negotiable invariants live in [CLAUDE.md §G](../CLAUDE.md). This page
records the controls that are implemented and how each one is verified.

## Implemented controls (Phases 0–2)

| Control                        | Implementation                                                                                                                                                                                                      | Verified by                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Authentication on every route  | Global `AuthGuard`; `@Public()` only for contract routes declared public                                                                                                                                            | `route-inventory.test.ts`, `platform.test.ts`                        |
| Token verification             | `jose` with JWKS; issuer, audience, `exp`, `sub`; ES256/RS256 only                                                                                                                                                  | `access-token-verifier.test.ts` (forged, HS256, `none`, expired)     |
| Non-leaking errors             | One envelope with `requestId`; unknown errors become `INTERNAL_ERROR`, never stack traces or messages                                                                                                               | `platform.test.ts`                                                   |
| Input bounds                   | 256 kB JSON limit; Zod at the boundary; page size ≤ 50                                                                                                                                                              | `platform.test.ts`, conformance fixtures                             |
| Abuse limits                   | Declarative sliding-window limits; fail closed with 503                                                                                                                                                             | `platform.test.ts`, Redis integration test                           |
| CORS                           | Exact `WEB_ORIGIN`, no credentials, explicit methods and headers                                                                                                                                                    | `platform.test.ts`                                                   |
| API headers                    | helmet; CSP `default-src 'none'; frame-ancestors 'none'`                                                                                                                                                            | `platform.test.ts`                                                   |
| Web CSP                        | One per-request nonce policy in `proxy.ts`; no inline script or style in production                                                                                                                                 | `csp.test.ts`, Playwright                                            |
| Web headers                    | nosniff, `X-Frame-Options: DENY`, COOP, restrictive Permissions-Policy, HSTS when deployed                                                                                                                          | Playwright                                                           |
| Configuration                  | Zod parsers; HTTPS and no `*_dev_only` credentials in staging and production; errors name keys, never values                                                                                                        | `runtimes.test.ts`                                                   |
| Log privacy                    | Redaction of auth headers, cookies, tokens, passwords, secrets, signed URLs, bodies, and content (three levels deep); paths logged without query strings                                                            | `logger.test.ts`, `platform.test.ts`                                 |
| Bundle secrets                 | `scripts/scan-client-bundle.mjs` in CI                                                                                                                                                                              | CI `validate` job                                                    |
| Principal mapping              | After JWT verification the guard maps `sub` to an internal user on every request: unknown → `ACCOUNT_NOT_PROVISIONED`, non-active → `ACCOUNT_BLOCKED`                                                               | `platform.test.ts`, `identity.integration.test.ts`                   |
| Admin-only provisioning        | Public signup disabled; the service-role key exists only in the provisioning script's environment                                                                                                                   | `runtimes.test.ts`, `provision-user.integration.test.ts`             |
| Signed uploads                 | PUT signed for exact `content-type` and `content-length`, 300 s; completion re-checks owner, status, size, and MIME; single use                                                                                     | `s3-object-storage.integration.test.ts`, `media.integration.test.ts` |
| Image processing               | Sharp `failOn: 'error'`, 40 MP decode limit, allowed decoded formats only, orientation applied, all metadata stripped; raw upload deleted (D2)                                                                      | `derivatives.test.ts`, `worker.integration.test.ts`, full-stack e2e  |
| Signed reads                   | Only display/thumbnail derivatives are signed (900 s); masters and raw uploads never leave the server                                                                                                               | `media.integration.test.ts`                                          |
| Block semantics                | Directional `user_blocks`; one symmetric helper (`hiddenByBlock`/`isBlockedBetween`); pair advisory lock; blocking ends friendships, withdraws requests and Box invitations, never removes Box members              | `block.integration.test.ts` (matrix and races)                       |
| Non-leaking lookups            | Reaching out to someone who blocked you answers `USER_NOT_FOUND`, identical to a username that does not exist; only the blocker hears `USER_BLOCKED`                                                                | `block.integration.test.ts`, Playwright                              |
| Box access                     | One policy service: non-members, former members, deleted Boxes, and guessed IDs all answer `BOX_NOT_FOUND`; members lacking a role get `BOX_ACCESS_DENIED`                                                          | `boxes.integration.test.ts`, Playwright                              |
| Role changes under concurrency | Membership rows locked in user-ID order; simultaneous transfers, removals, and leaves are decided one after the other; exactly one active owner (unique index)                                                      | `boxes.integration.test.ts`                                          |
| Pagination safety              | Opaque cursors validated strictly; microsecond timestamps from PostgreSQL; page size ≤ 50                                                                                                                           | `pagination.test.ts`, integration paging tests                       |
| Realtime stream                | Bearer-authenticated like every route; per-person cap; ends at token expiry; subscriptions follow active memberships so removal stops delivery; payloads are IDs only; clients refetch through normal authorization | `realtime.integration.test.ts`, Playwright (live removal)            |
| Web session                    | Supabase SSR cookies; proxy redirects protected pages without a session (optimistic only); recovery callback allowlist; failures carry no URL details                                                               | `callback-path.test.ts`, `proxy.test.ts`, e2e                        |

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

Phase 1 returns no other person's data. Phase 2 does, through the matrix below.

## Authorization matrix: Phase 2

Roles: **O** owner, **A** admin, **M** member, **S** stranger (never a member,
or left/removed, or the Box is gone). Strangers always get `BOX_NOT_FOUND`.
Members without the role get `BOX_ACCESS_DENIED`.

| Action                               | O                    | A                            | M   | S   |
| ------------------------------------ | -------------------- | ---------------------------- | --- | --- |
| Read Box, member list                | ✓                    | ✓                            | ✓   | 404 |
| Rename, archive, restore             | ✓                    | 403                          | 403 | 404 |
| Delete (exact name typed)            | ✓                    | 403                          | 403 | 404 |
| Invite, list or withdraw invitations | ✓                    | ✓                            | 403 | 404 |
| Promote member → admin               | ✓                    | ✓                            | 403 | 404 |
| Demote admin → member                | ✓                    | 403                          | 403 | 404 |
| Change the owner’s role              | 403                  | 403                          | 403 | 404 |
| Transfer ownership                   | ✓                    | 403                          | 403 | 404 |
| Remove a member / admin              | ✓                    | ✓ (members and other admins) | 403 | 404 |
| Remove the owner                     | 403                  | 403                          | 403 | 404 |
| Leave                                | 409 (transfer first) | ✓                            | ✓   | 404 |

Friends and requests:

| Action                          | Who                                       | Everyone else                                                         |
| ------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Send a request                  | Any active person, 20/hour                | Blocked either way → `USER_NOT_FOUND` / `USER_BLOCKED` (blocker only) |
| Accept or decline               | Only the recipient                        | `FRIEND_REQUEST_NOT_FOUND` (same as missing or answered)              |
| Withdraw                        | Only the sender                           | `FRIEND_REQUEST_NOT_FOUND`                                            |
| Remove a friend                 | Either friend                             | `FRIENDSHIP_NOT_FOUND`                                                |
| Answer or read a Box invitation | Only the invitee (list: and Box managers) | `INVITATION_NOT_FOUND`                                                |

Block matrix (ADR 013), tested in both directions, plus unblock and re-block
sequences and concurrent races:

| Thing                                 | When A blocks B (or B blocks A)                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing friendship                   | Deleted; not restored on unblock                                                                                                                  |
| Pending friend request, either way    | Deleted                                                                                                                                           |
| New friend request                    | Blocked person: `USER_NOT_FOUND`. Blocker: `USER_BLOCKED`.                                                                                        |
| Pending Box invitation, either way    | Revoked                                                                                                                                           |
| New Box invitation                    | Same as friend requests                                                                                                                           |
| Accepting an invitation               | `INVITATION_NOT_FOUND`                                                                                                                            |
| Shared Box membership and member list | **Unchanged.** Membership is a Box fact; what each person _authors_ is hidden from the other once content exists (Phases 3, 5, 6 add their rows). |
| Block list                            | Only the blocker’s own blocks, with no avatars                                                                                                    |

Posts (Phase 3, D1 applied):

| Action         | Owner / admin / member                   | Former member, stranger      | Blocked pair (either direction)                  |
| -------------- | ---------------------------------------- | ---------------------------- | ------------------------------------------------ |
| Post in a Box  | ✓ (not if archived: `BOX_ARCHIVED`)      | `BOX_NOT_FOUND`              | n/a                                              |
| Read feeds     | ✓                                        | `BOX_NOT_FOUND` / empty Home | Post becomes a `hidden` item: id, Box, time only |
| Read one post  | ✓                                        | `POST_NOT_FOUND`             | `POST_NOT_FOUND`                                 |
| Edit or delete | Author only; others `POST_ACCESS_DENIED` | `POST_NOT_FOUND`             | Author keeps access to their own post            |

Deleting erases the text (database check) and keeps a tombstone. Moderators
cannot delete others' posts until Phase 9. Tests: `posts.integration.test.ts`
(roles, archived, guesses, concurrency, paging, both block directions,
unblock then re-block) and the Playwright block scenario.

Known limits: suspended members stay in a Box's counts but vanish from its
lists until Phase 9 defines suspension. Re-requesting after a decline is
allowed and bounded only by the rate limit.

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
