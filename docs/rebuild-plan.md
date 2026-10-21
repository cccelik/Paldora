# Paldora rebuild plan

This is the plan for rebuilding Paldora from an empty root, one verified
milestone at a time. [CLAUDE.md](../CLAUDE.md) holds the durable rules: product
principles, security invariants, standards, and the Keep/Improve/Replace
decisions (§Q–§R). This file holds the execution order, the deliverables, and
the exit gates.

## Ground rules

- **`legacy/` is frozen.** It is the Phase 7 reference build: a behavioral and
  visual reference only. Never import from it, never add it to the new
  workspace, never "fix" it. Copy code out only after reviewing it against
  CLAUDE.md, and rewrite where §R calls for it.
- **The new product is built at the root.** Each milestone is one vertical
  slice: migration → API → contract → client → UI → worker → tests → docs.
- **Every milestone ends at a release checkpoint.** All gates are green, the
  docs are updated, the ADRs are written, and the user signs off before the
  next milestone starts.
- **Parity is measured.** Each phase lists the legacy behaviors it must
  reproduce. The manual flows in
  [legacy/docs/development.md](../legacy/docs/development.md) become automated
  acceptance tests.
- **Retire `legacy/`** after Phase 7 reaches parity and one release has been
  stable on the new code: delete it in a dedicated commit. Git history keeps it.

## Target repository layout

```text
apps/
  web/          Next.js App Router (responsive website — ships first)
  api/          NestJS modular monolith, feature modules
  worker/       BullMQ worker + scheduled reaper
  ios/          Swift/SwiftUI app (Phase 10, outside the pnpm graph)
  android/      Kotlin/Compose app (Phase 11, outside the pnpm graph)
packages/
  domain/       framework-neutral types, branded IDs, Room theme registry
  validation/   Zod schemas: the single source for the request/response contract
  api-client/   generated TS transport + thin typed wrapper
  config/       Zod env parsers for web, api, worker, seed
  database/     Drizzle schema, migrations, pool factory
  storage/      ObjectStorage interface + S3 adapter + test fake
  observability/ logger, redaction, correlation helpers
  tokens/       generated CSS/TS from design/tokens (Swift/Kotlin outputs too)
contracts/      openapi.json (generated from validation, committed, drift-checked)
               + conformance fixtures shared by web, iOS, Android
design/         brand assets, tokens/*.json (DTCG source), approved artboards
docs/           architecture, api, database, security, deployment, adr/
infrastructure/ local Docker services
legacy/         frozen reference build (deleted after parity)
```

The legacy `auth` and `ui` packages are dropped. Principal types move to
`domain`, and tokens move to `packages/tokens`.

## Decisions that need your approval before the dependent phase

| #   | Decision                                                                                                                          | Needed by | Recommendation                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| D1  | Inside a shared Box, are a blocked user's **posts** hidden from the blocker? Legacy hides their Life Updates but not their posts. | Phase 2   | **Confirmed 2026-10-19** ([ADR 013](adr/013-directional-blocks.md)): hidden in both directions, neutral placeholder.        |
| D2  | Keep uploaded **originals**, which retain EXIF/GPS, after processing?                                                             | Phase 1   | **Confirmed 2026-10-18** ([ADR 011](adr/011-media-pipeline.md)): metadata-free re-encoded master; raw upload deleted.       |
| D3  | Web styling approach.                                                                                                             | Phase 0   | **Confirmed 2026-10-18** ([ADR 005](adr/005-design-tokens-and-styling.md)): CSS Modules + generated tokens; no Tailwind.    |
| D4  | Keep Supabase Auth as the identity provider.                                                                                      | Phase 0   | **Confirmed 2026-10-18** ([ADR 003](adr/003-supabase-identity.md)).                                                         |
| D5  | Production hosting target (not the free demo topology).                                                                           | Phase 4   | Decide with current pricing; requirements are in CLAUDE.md §N.                                                              |
| D6  | Node runtime line.                                                                                                                | Phase 0   | **Confirmed 2026-10-18** ([ADR 006](adr/006-runtime-and-dependencies.md)): Node 24 "Krypton", the Active LTS on 2026-10-18. |
| D7  | Accessible text variants for Deep Gold, success, and warning, which fail WCAG AA as text on light surfaces.                       | Phase 1   | **Confirmed 2026-10-18**: darkened variants in `design/tokens/paldora.tokens.json` (`color.accessible.*`).                  |

## Phase 0: Foundation (first milestone, detailed)

**Goal:** an empty but production-shaped skeleton where every later rule is
structural rather than conventional. No product features.

Work in this order. Each step is reviewable on its own.

1. **Workspace.**
   - Root `package.json`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`; excludes `apps/ios`, `apps/android`, `legacy`), `turbo.json`.
   - Strict `tsconfig.base.json` (carry over legacy flags), ESLint flat config (carry over the complexity rules), Prettier.
   - Exact-pinned dependencies. Pick versions at least two weeks old and record them in an ADR.
2. **Local infrastructure.**
   - `infrastructure/docker-compose.yml`: PostgreSQL, Redis (`noeviction`, AOF), MinIO with private bucket init. Bind to loopback.
   - `.env.example` with no real values. Root `.env` stays local-only.
3. **Config package.**
   - Zod parsers for `web` (public vars only; fails the build), `api`, `worker`, `seed`.
   - No `localhost` fallbacks outside development.
4. **Database package.**
   - Pool factory with configurable size.
   - The `paldora` schema migration only.
   - A migration-safety README (expand/contract, immutability).
5. **Observability package.**
   - pino with deep redaction (auth headers, cookies, tokens, passwords, `*Url` signed values).
   - Request and job correlation helpers.
6. **API skeleton (R1).**
   - Nest app with a `platform` module: health/readiness, request-ID middleware, a global exception filter (envelope + `requestId`, unknown → `INTERNAL_ERROR`, no stacks), a Zod validation pipe, typed config via DI, helmet, exact-origin CORS.
   - A **global** auth guard with an `@Public()` decorator. A test enumerates every route and fails if one is unguarded and not allowlisted.
   - A JWT verifier (issuer, audience, JWKS, expiry) behind an interface, with a **local test issuer** for integration tests.
   - A declarative rate-limit decorator with a sliding-window Lua script (R6). Fails closed.
7. **Contract pipeline (R2).**
   - Spike, then record an ADR: Zod 4 → OpenAPI 3.1 generation, plus a generated TS client.
   - `contracts/openapi.json` is committed. CI fails on drift.
   - Conformance fixture format for errors, cursors, and DTOs.
8. **Tokens pipeline (R7).**
   - Reconcile the three diverging legacy token sets into `design/tokens/*.json`. Source of truth: `legacy/design/design-system.md`. Get approval.
   - Generate CSS custom properties + TS. Stub Swift/Kotlin outputs.
   - A WCAG AA contrast test over the declared pairs.
9. **Web skeleton (R3).**
   - Next.js (read the installed `node_modules/next/dist/docs` first).
   - A single nonce CSP in `proxy.ts`. Proxy refreshes the session with `getClaims()` as an optimistic check only.
   - Root layout, the trusted shell frame, `error.tsx`/`not-found.tsx`, and the landing page.
   - A Server Action result pattern via `useActionState` (no query-string notices).
10. **Worker skeleton.** BullMQ worker with graceful shutdown, a job-correlation logger, and a placeholder scheduled job (the future reaper).
11. **CI (R10).**
    - Jobs: format, lint, typecheck, unit, build.
    - Integration runs with Postgres, Redis, and MinIO service containers. Integration suites **fail when `CI=true` and services are missing**.
    - Clean-database migration validation.
    - Playwright `chromium` + `mobile-chrome` with axe checks.
    - A client-bundle secret scan.
12. **Docs.**
    - `docs/architecture.md`, `docs/security.md`, `docs/deployment.md`, `docs/api.md`, `docs/database.md`.
    - ADRs: carry over legacy 001–004 (refreshed), plus new ADRs for R1–R11 and D3/D4/D6.
    - A short root `README.md`.

**Exit gate:** all CI jobs green from a clean clone; `docker compose up` +
`pnpm dev` serves the landing page and `/api/v1/health/ready`; the
unguarded-route test, CSP test, and contrast test pass; ADRs merged.

### Phase 0 delivery notes (2026-10-18)

**Delivered:** steps 1–12.

**Deviations from the steps above:**

- **Contract format.** The contract is `contracts/openapi.json`, not YAML.
  JSON needs no extra dependency and is deterministic for drift checks.
- **Typed client.** The TS client is derived from the route registry and
  validates responses at runtime, instead of coming from a code generator
  (ADR 004).
- **Worker scope.** The worker needs only Redis for now. Database access
  arrives with the first job that uses it (Phase 1/4).
- **Storage.** `packages/storage` is deferred to Phase 1, its first consumer.
  MinIO is already in Compose.
- **Compose project name.** The project is `paldora-v2`, so its volumes never
  mix with the legacy `paldora` data.
- **CI integration services.** The integration job uses Postgres and Redis;
  MinIO joins with Phase 1 media.
- **Failing integration tests.** Suites fail whenever their variables are
  missing (not only when `CI=true`), and they run as a separate
  `pnpm test:integration` task.
- **Seed parser.** The `seed` config parser arrives with provisioning in
  Phase 1.

**Verified locally (2026-10-18, Node 23.7 with an engine warning; CI pins 24):**

- format, lint, typecheck, and build: all green;
- 106 unit tests;
- 8 integration tests against Docker PostgreSQL 17 and Redis 8, including
  migrations applied twice;
- 13 Playwright checks on a production build, desktop and 390px (1 skipped
  by design on mobile);
- `contract:check`, `tokens:check`, and the client-bundle scan, which was
  also checked against a planted secret;
- API and worker smoke tests (readiness, graceful shutdown).

**Not yet verified:**

- **GitHub Actions.** The workflow has not run on GitHub; nothing has been
  pushed.
- **Full-stack `pnpm dev`.** Not exercised against a real Supabase project.
  Supabase is first used by Phase 1.

## Phase 1 delivery notes (2026-10-19)

**Delivered:** provisioning, sign-in/out, password recovery (PKCE `code` and
`token_hash`), principal mapping, profiles and username normalization,
forward-only onboarding, app appearance, and avatars on the generic media
module with D2 processing.

**Deviations and deferrals:**

- **Reaction presets** move to Phase 5 with reactions, so settings show no
  control for a feature that does not exist yet.
- **No "My Room" link** in navigation until Rooms exist (Phase 7).
- **Media reaper** already expires abandoned uploads and requeues stalled
  rows; dead-letter retries, retention, and the remaining fault tests stay in
  Phase 4 (ADR 011).
- **Full-stack e2e** uses a loopback Supabase Auth stand-in
  (`apps/web/e2e/full-stack/fake-auth-server.mjs`) rather than the Supabase
  CLI: it needs no extra Docker stack and exercises the same verifier.

**Verified locally (2026-10-19, Node 23.7):** see the release checkpoint in
the session report; CI has still not run on GitHub.

**Not yet verified:** a hosted Supabase smoke test. The previous project's
hostname no longer resolves, so a new Supabase project (asymmetric signing
keys, Site URL and redirect `…/auth/callback`) is needed.

## Phase 2 delivery notes (2026-10-19)

**Delivered:** friendships, directional blocks (D1 applied), Boxes with
owner/admin/member roles, invitations by username, atomic ownership transfer,
archive/restore, and owner-only permanent delete (exact name plus a tick).
Friends, Boxes, and Box pages are responsive and tested at 390px.

**Deviations and additions:**

- **Pagination everywhere.** Every list uses opaque keyset cursors (page size
  ≤ 50), including friends, requests, blocks, Boxes, members, and invitations.
- **Added beyond the reference build:** withdrawing a friend request and
  withdrawing a Box invitation.
- **`boxes` has no owner column** and no slug. Ownership is the single active
  owner membership (a unique index), which removes a second source of truth.
- **Delete confirmation moved to a query value** (`?confirmName=`) because
  DELETE bodies are unreliable across HTTP clients and OpenAPI generators.
- **Box deletion cleanup** covers memberships and invitations only; media and
  content cleanup lands with the phases that add them (see
  [docs/database.md](database.md)).
- **No notifications yet.** Invitations and requests appear on their pages;
  durable notifications arrive in Phase 5.

**Not yet verified:** the CI run on GitHub, and a hosted Supabase sign-in.

## Phase 3 delivery notes (2026-10-19)

**Delivered (the whole [plan](plans/delivered/phase-3-posts-feeds-realtime.md)):**
text posts, Box and Home chronological feeds with keyset paging, permalink
page, author-only edit and delete (text erased), archived Boxes read-only, and
D1 block placeholders. Recommended defaults were used for every open question.

**Realtime delivered as well (steps 5–6):** the `/me/events` stream, a Redis
bus, membership-change publishing, and a web bridge that refreshes only the
affected pages ([ADR 012](adr/012-realtime.md)). Integration and
full-stack tests now run in a dedicated `paldora_test` database
(`scripts/with-test-database.mjs`). Still open: the first GitHub CI run.

## Phase 4 delivery notes (2026-10-19)

**Delivered:** photos on posts (up to 4), worker processing for the `post_image`
purpose, a keyboard-accessible viewer, no-orphan cleanup on post and Box
deletion, a hardened reaper (unclaimed photos, dead-deletion retries, outbox
retention), and fault-injection tests ([ADR 011](adr/011-media-pipeline.md)).

**Not done:** D5 (production hosting) is still open. Nothing built here depends
on it, but a managed storage lifecycle policy and metrics-based alerting wait for
it. Alerts today are error logs.

## Phase 5 delivery notes (2026-10-20)

**Delivered (the whole [plan](plans/delivered/phase-5-interactions-notifications.md),
all recommended defaults):** comments with one reply level enforced in the
database, tombstones, and deep links; one emoji or camera reaction per person
per post and per comment, with the guarded double tap; five personal reaction
presets; camera reactions captured in the browser (no file picker), processed
by the worker, shown as a thumbnail strip with a paged reactions list; the
`activity_events` outbox and a worker projector with savepoints, dedupe keys,
backoff, and dead-lettering; ID-only notifications with read-time visibility,
a live bell, and a notifications page; toasts; and targeted realtime refresh
through a window event ([ADR 015](adr/015-interactions-and-activity-projector.md),
addenda in ADR 012 and 013).

**Deviations from the plan, as reported by each slice:**

- Comment realtime hints were published in slice 2 (with comments), not with
  reactions in slice 3.
- Reaction presets (`PUT /me/reaction-presets`, defaults) landed in slice 3
  with the API, ahead of the settings page.
- Reaction writes take a per-person, per-target advisory lock (`lockReactor`)
  before the row lock, so replacing a reaction and retiring its camera image
  cannot interleave; the primary key stays the final word.
- `hiddenByBlock` accepts a column or SQL expression as the viewer, so the
  projector's set-based statement shares the one block definition.
- Notification visibility also requires the actor to have a username (a
  public face), so half-onboarded accounts never appear as actors.
- Worker integration test files run serially: two reapers in one database
  can lock each other's rows.
- `Permissions-Policy: camera=(self)` shipped with the camera backend
  (slice 4), not with the camera UI.
- The blocked-camera e2e uses its own Chromium launched with
  `--use-fake-ui-for-media-stream=deny`: with the fake UI on, headless
  Chromium ignores per-context permission overrides for media.

**Notes:** the camera strip links to a paged reactions page
(`/posts/{id}/reactions`, filterable to camera reactions) rather than
expanding inline. An optimistic camera reaction bumps the count only; the
server's answer fills the strip with the signed thumbnail.

## Phase 6 delivery notes (2026-10-20)

**Delivered (the whole [plan](plans/delivered/phase-6-life-updates-memories.md),
all recommended defaults):** Life Updates with nine optional sections and up
to four photos, shared once to 1–20 Boxes or kept Only Me; one backing post
per Box, so each Box keeps its own conversation; an audience that the
database makes immutable; edit and delete across every Box at once; Home
dedupe into one card with alphabetical Box tabs; Box-deletion tombstones and
a worker sweep; and derived Memories (personal and per Box, UTC year/month,
type filter, cursor paging, summary counts) with no stored copy
([ADR 016](adr/016-life-updates-and-memories.md), addendum in ADR 013).

**Deviations from the plan, as reported by each slice:**

- `PATCH /life-updates/{id}` is partial: `sections` and `mediaAssetIds` are
  each optional and replace that part when present.
- `feedItemSchema` moved to `packages/validation/src/feeds.ts` to avoid a
  posts ↔ life-updates import cycle; ordinary-post page data moved to
  `PostPageService` (`itemsForPosts`), which Memories reuse.
- `MemorySummary` also returns the chosen `year` (null when empty).
- No `posts.kind` index: EXPLAIN shows range scans on `posts_box_feed_index`.
- Web Memories: `/memories/[year]` shows the year's items under UTC month
  headings as well as the month grid; there is no separate date rail (each
  card already shows its time). There is no `loading.tsx`, because a
  streamed fallback would turn the not-found pages into 200 responses.

**Notes:** months are UTC, and the pages say so. Blocked authors' content is
omitted from Memories with no placeholder (decision 15); feeds keep the
neutral placeholder.

## Phase 7 delivery notes (2026-10-20)

**Delivered (the whole [plan](plans/delivered/phase-7-rooms.md), recommended
defaults B1–B16):** Rooms at `/rooms/[username]` with nested visibility
(`hidden` ⊂ `friends` ⊂ `members`, where members means a shared active or
archived Box) and one byte-identical `ROOM_NOT_FOUND` for every denial; 14
token-only themes with two-sided accents, five system fonts, decorations
and reduced-motion sparkles; single and two-column layouts; seven closed-
registry widgets; Top Friends (4/8/12, own audience) removed by database
triggers on unfriend and block; an HTTPS-only music card; a processed 3:1
banner (`room_banner` media purpose); previews derived from the Memories
candidates; the owner-only customizer at `/rooms/[username]/customize` with
per-section saves, required `expectedUpdatedAt`, a persistent reload notice
on a stale save, a live inert preview, and keyboard reordering; the mobile
bottom nav with My Room; Room links from friend and member rows
([ADR 017](adr/017-rooms.md), addendum in ADR 013).

**Deviations from the plan, as reported by each slice:** listed in the
plan's section J progress note. In short: one `RoomWriteService` for all
three writes (rows created only on a real change; a lost insert race is
`ROOM_UPDATE_STALE`); `GET /me/room` and the writes answer `ROOM_NOT_FOUND`
until the caller has a username; Top Friends saves take sorted `lockPair`
locks (no deadlock, no 40P01 retry); the photo preview query pages items
(1–12, default 6); `BottomNav` lives in `app-nav.tsx`; photo thumbnails
link to their post or Life Update instead of opening a lightbox inside the
canvas; the customizer loads every preview (a widget can be switched on
before its preview is saved) and the first 200 friends for the picker; the
banner reuses the avatar's single-photo upload hook (`useMediaUpload`).

**Fixed on the way:** concurrent first requests after API boot failed
closed with `RATE_LIMIT_UNAVAILABLE`, because the lazy, no-offline-queue
Redis connection was opened only by a caller that saw status `wait`;
callers arriving while it was `connecting` sent into an unwritable stream.
`platform/redis-ready.ts` now makes them wait (bounded, 2 s) for `ready`, in
the rate limiter, the readiness probe, and realtime publishing (an
integration test reproduces the cold start).

**Parity checklist (legacy Room behavior):** presets 14/14, layouts,
widgets with visibility/order/placement and keyboard reordering, Top
Friends 4/8/12 with separate visibility and atomic removal, HTTPS music
card with no embeds, private processed banner, stale-save detection, and
app appearance kept separate: all covered by automated tests. Deliberate
differences: `members` no longer means every signed-in user (B2), the
independent `background` override is gone and legacy hex values were
nudged for AA (B9/B10, **K4 sign-off pending**), Top Friends default to
`friends` (B7). Not yet done for the overall Phase 7 parity checkpoint: the
hosted smoke list (`legacy/docs/deployment.md` §6) has not run against a
hosted build, and CI has not run on GitHub; `legacy/` stays until one
release has shipped.

## Phases 1–9: Web product (rebuild to parity, then beyond)

Every phase delivers: migration(s), domain + Zod + OpenAPI entries, policy +
stable errors + rate-limit decisions, services, generated client, responsive
UI (desktop + 390px, all states), worker jobs if any, unit/integration/
authorization/e2e tests, docs, and an authorization matrix in the PR.

| Phase | Scope                                                                                                                                                                                         | Legacy reference                                                                                                             | Greenfield changes applied                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1     | Supabase sign-in/out, recovery (`token_hash` + PKCE), admin provisioning seed, `users`/`profiles`/`user_preferences`, username normalization, onboarding, avatar, account/appearance settings | `legacy/apps/api/src/{auth,user,avatar}*.ts`, `legacy/packages/validation`, `legacy/design/03-auth`                          | Generic **media module** (R4) with purpose policies; avatar is its first purpose; D2 applied |
| 2     | Friendships, **directional blocks**, Boxes, roles, invitations, lifecycle, ownership transfer, permanent delete                                                                               | `legacy/apps/api/src/{social,box-*}*.ts`, ADR 003                                                                            | `user_blocks` table + symmetric SQL helper (R8); D1 applied                                  |
| 3     | Text posts, Box + Home keyset feeds, single `/me/events` SSE stream                                                                                                                           | `legacy/apps/api/src/post*.ts`, `legacy/apps/web/app/lib/authenticated-sse.ts`                                               | Per-Box/per-user channels, token-bounded stream lifetime, targeted client invalidation (R5)  |
| 4     | Post images ≤4, worker processing, viewer/lightbox, outbox completion states, reaper, dead-letter, fault-injection tests; production hosting decision (D5)                                    | `legacy/apps/worker`, `legacy/apps/api/src/media-job-outbox*.ts`                                                             | `pending→published→completed/dead` outbox (R4); release-job migrations (R9)                  |
| 5     | Comments + one reply level, emoji/camera reactions, presets, activity projector, notifications, toasts                                                                                        | `legacy/apps/api/src/{interaction,notification,activity-event,reaction-media}*.ts`                                           | Projector in worker loop; services split by responsibility (no 680-line services)            |
| 6     | Life Updates (multi-Box deliveries, Only Me), derived Memories                                                                                                                                | `legacy/apps/api/src/{life-update,memory}*.ts`, `legacy/design/07-life-updates`, `legacy/design/13-memories`                 | Block filtering consistent with D1 across all content types                                  |
| 7     | Rooms, 14 themes, widgets, Top Friends, music card, banner, app appearance                                                                                                                    | `legacy/apps/api/src/room*.ts`, `legacy/packages/domain` (theme registry), `legacy/design/10-rooms`, `legacy/docs/themes.md` | Themes consume generated tokens; banner via media module                                     |
| 8     | Advanced personalization (scoped CSS, sanitized sandboxed HTML widgets): **only after a dedicated security review and threat model**                                                          | `legacy/docs/themes.md` (deferred notes)                                                                                     | Never arbitrary JavaScript                                                                   |
| 9     | Reporting, moderation queue, takedown, suspension, admin lookup, immutable audit log, account deletion + export, **public signup gate**                                                       | (none, new)                                                                                                                  | Suspension enforced in guard and streams                                                     |

**Parity checkpoint after Phase 7:** every flow in
`legacy/docs/development.md` and the hosted smoke list in
`legacy/docs/deployment.md` passes as automated tests against the new build.
Then retire `legacy/`.

## Phases 10–11: Native apps

These start only when the API contract has been stable for at least one release
with no breaking changes. iOS comes first, then Android, each a complete client.

Each delivers:

- native architecture;
- Keychain/Keystore token storage and refresh;
- generated transport from `contracts/` with hand-written domain and UI;
- error mapping;
- universal/app links;
- media capture and upload;
- SSE reconnect;
- push readiness;
- VoiceOver/TalkBack and Dynamic Type;
- offline and poor-network states;
- XCUITest / Compose UI tests;
- conformance fixtures;
- TestFlight / Play internal testing;
- store privacy forms.

## Phase 12: Later scope

Discovery/search, Collections, galleries/albums, On This Day, recaps,
Paldora+ entitlements. Each one needs its privacy model written and approved
before it is designed.

## How to run a session against this plan

1. Read CLAUDE.md, this file, and the legacy reference listed for the phase.
2. Confirm which open decisions (D1–D7) the phase depends on. Stop and ask if
   any is unapproved.
3. Propose the phase's authorization matrix, tables, endpoints, and test list.
   Then implement the slice and report the exact gate results.
4. Update this file's status table below when a phase exits.

| Phase | Status                                                                              |
| ----- | ----------------------------------------------------------------------------------- |
| 0     | Delivered 2026-10-18; D3/D4/D6/D7 confirmed. Awaiting a first green CI run          |
| 1     | Delivered 2026-10-19 (local gates green); hosted Supabase smoke pending             |
| 2     | Delivered 2026-10-19 (local gates green); D1 confirmed                              |
| 3     | Delivered 2026-10-19 (posts, feeds, realtime); local gates green                    |
| 4     | Delivered 2026-10-19 (local gates green); D5 hosting decision open                  |
| 5     | Delivered 2026-10-20 (local gates green); interactions and notifications            |
| 6     | Delivered 2026-10-20 (local gates green); Life Updates and derived Memories         |
| 7     | Delivered 2026-10-20 (local gates green); Rooms and customizer; K4 sign-off pending |
| 8–12  | Not started                                                                         |
