# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Paldora — a box for your people.** Expression on the surface, discipline underneath.

This is the root operating manual for Paldora. It summarizes and links to the
detailed documents. It does not replace them.

**Current active workspace (October 2026):** the local web migration uses
Firebase Auth, Firestore, Storage, Functions, and `@paldora/firebase-trusted`.
The API, worker, PostgreSQL, Redis, S3/MinIO, and Supabase packages described
later in this file are historical design/reference notes, not current runtime
instructions. Follow [docs/development.md](docs/development.md) for local
commands and [docs/firebase/implementation.md](docs/firebase/implementation.md)
for migration status. `legacy/` remains frozen. The native iOS app (`apps/ios`, SwiftUI, outside the pnpm graph) runs locally against the same emulators through the callable contract in `contracts/native/`; see [apps/ios/README.md](apps/ios/README.md). Hosted deployment is not done; web host is Firebase App Hosting ([ADR 023](docs/adr/023-web-hosting-app-hosting.md)).

**Repository state.** The root is the **greenfield rebuild**. Phase 0
(foundation) is delivered. The execution plan, milestones, status, and open
decisions are in [docs/rebuild-plan.md](docs/rebuild-plan.md). The new build's own docs
are in [docs/](docs/): development, architecture, security, API, database,
deployment, and the [ADRs](docs/adr/README.md), which record the accepted §R
decisions.

- **[legacy/](legacy/) is the frozen Phase 7 reference build.** It holds the old
  code, docs, design assets, concept book, CI, and deploy files.
- Read it for behavior and lessons. **Never import from it, add it to the new
  workspace, or modify it.** It is deleted after Phase 7 parity.
- Every path in §C–§Q below that starts with `legacy/` describes the reference
  build, not the new code.

**Nested instructions apply in their directories.** Before modifying an area,
read the nearest `CLAUDE.md`/`AGENTS.md`. Today that is
[apps/web/AGENTS.md](apps/web/AGENTS.md), loaded by `apps/web/CLAUDE.md`. Its
first rule is binding everywhere Next.js is touched: **Paldora uses a new
Next.js version (16.x) with breaking changes. Read the relevant guide in
`apps/web/node_modules/next/dist/docs/` before writing Next.js code, and heed
deprecation notices.** Do not rely on remembered framework behavior.
`middleware` is now `proxy.ts`, and `error.tsx` receives `retry`.

In the API, always inject with an explicit `@Inject(Token)`. The `tsx` and
esbuild dev runner does not emit decorator metadata, so type-based injection
breaks.

---

## A. Mission and product principles

Paldora is a privacy-first social platform and long-lived digital scrapbook for
real friends and private communities. It is **not** an engagement-maximizing
public network. It combines:

- MySpace-style identity (customizable profile spaces);
- Tumblr-style personal posting;
- Pinterest-style visual organization;
- modern private, chronological social UX;
- scrapbook nostalgia: Polaroids, paper, tape, postcards, sparkles.

The surface should feel personal, warm, magical, premium, and expressive. The
engineering underneath must be secure, predictable, testable, portable, and
deliberately boring.

**Core promises** (product constraints, not marketing): private by default · no
targeted ads · no manipulative ranking (chronological feeds) · memories remain
owned by users · real relationships over reach · made to last.

**Terminology. Use these exactly:**

| Term            | Meaning                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Box**         | A private social circle or community with members and roles (owner/admin/member).                                                          |
| **Room**        | A user's customizable profile at `/rooms/[username]`. **Never** a chat room or a Box subspace.                                             |
| **Life Update** | A structured, reusable update stored once. It can have isolated delivery contexts (one backing post each) in several Boxes, or be Only Me. |
| **Memory**      | A **derived** chronological view of content the viewer can still access. It is never a copied content record.                              |

## B. Source-of-truth order

Resolve conflicts in this order:

1. The current user instruction.
2. The nearest applicable `CLAUDE.md`/`AGENTS.md`.
3. Executable tests and the security invariants in §G.
4. Current code and migrations.
5. Architecture, API, security, and design documents in [docs/](legacy/docs/) and [design/](legacy/design/).
6. Historical plans, phase notes, and the design manifest.

Rules:

- Deployed migrations are immutable.
- A `TODO` in [design/DESIGN_MANIFEST.md](legacy/design/DESIGN_MANIFEST.md) means no approved artboard exists. It says nothing about implementation, in either direction.
- Phase prose in the README and docs is history. Verify it against code before relying on it.

## C. Current implementation status (reference build)

The reference build is a **production-shaped responsive web vertical slice
through Phase 7** (14 checkpoint commits, `8da91da` → `61bc5f3`).

- **Public registration is intentionally disabled.** Accounts are provisioned administratively.
- `apps/mobile` is an Expo placeholder that renders a splash screen. It is **legacy reference only and is not the target mobile architecture.**

| Area                          | Implemented behavior (verified in code)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Foundation                  | pnpm + Turborepo TypeScript monorepo; Next.js App Router web, NestJS REST API, BullMQ worker, unused Expo scaffold; shared domain/validation/api-client/auth/database/config/observability/storage/ui packages. PostgreSQL canonical, Redis ephemeral, private S3-compatible storage, Zod env parsing, pino logs.                                                                                                                                                                                                                                                                                                                                |
| 2 Auth, onboarding, settings  | Supabase email/password with SSR cookies. Sign-in/out, forgot password, recovery callback (`token_hash` and PKCE `code`; redirect allowlist `/home`, `/reset-password`), password update, session refresh. A valid but unprovisioned identity gets `ACCOUNT_NOT_PROVISIONED`. Internal `users.id` ≠ Supabase `sub`. No signup, social login, or magic link. Username → profile → avatar onboarding. Settings: display name, bio, avatar, five reaction presets, read-only email, reset password, appearance, sign-out.                                                                                                                           |
| 2b Usernames                  | `normalizeUsername` in [packages/validation](legacy/packages/validation/src/index.ts): NFKD, diacritic removal, `ı`→`i`, `en-US` lowercase, reserved names. Uniqueness enforced by `profiles.username_normalized`. The availability endpoint is advisory.                                                                                                                                                                                                                                                                                                                                                                                        |
| 3 Friends, blocks, Boxes      | Bilateral requests, accept/decline, remove, block/unblock. Private Boxes: create, rename, archive/restore, invite (accepted friends quick list **or any provisioned username**, so fandom circles need no friendship), join, leave, remove, role changes, atomic ownership transfer, owner-only permanent delete (exact-name plus second confirmation). An owner must transfer before leaving. Admins may promote members and remove non-owners, but cannot demote admins or touch the owner.                                                                                                                                                    |
| 4 Posts, feeds, media         | Chronological keyset Box and Home feeds. Plain text ≤5,000 chars plus ≤4 JPEG/PNG/WebP (≤10 MB each). Author-only edit and soft delete. Archived Boxes are readable but reject posts. Expanding composer, overflow menus, fullscreen accessible viewer with save/share (shares the `/posts/:id` permalink, never a storage URL). SSE invalidation. Identity is always joined fresh from `profiles`, never snapshotted.                                                                                                                                                                                                                           |
| 5 Interactions, notifications | Comments ≤2,000 chars with exactly one reply level. Author edit and soft delete. One reaction per user per post/comment (PK-enforced) using any single emoji grapheme; five presets are shortcuts only. Guarded double-click/tap 👍. Post-only camera reactions via `getUserMedia` (no library picker). `activity_events` → projector → deduped `notifications`. Unread count, mark one/all read, deep links, visibility rechecked on read. Shared timed toasts (success/attention/failure).                                                                                                                                                     |
| 6 Life Updates, Memories      | Optional structured sections (≤2,000 each, ≤10,000 total), ≤4 photos, many per month. Audience is `only_me` or 1–20 distinct active Boxes, **immutable after publish**. Content and media stored once; one backing post per Box with isolated threads. Home dedupes into one card with alphabetically ordered Box tabs. Only Me hides interactions. Memories are UTC year/month, cursor-paginated, re-authorized per query.                                                                                                                                                                                                                      |
| 7 Rooms                       | Authenticated `/rooms/[username]`, owner-only `/customize`. Visibility `friends` / `members` / `hidden`. Missing, blocked, and inaccessible all return `ROOM_NOT_FOUND`. 14 presets (Obsidian Gold … Polaroid Scrapbook, see [docs/themes.md](legacy/docs/themes.md)). Single/two-column layouts; widgets with visibility/order/placement and keyboard reordering. Top 4/8/12 accepted friends with separate visibility, removed atomically on unfriend or block. HTTPS-only music link card (no embeds or autoplay). Private processed banner. `expectedUpdatedAt` stale-save detection. App Light/Dark/System is separate from the Room theme. |
| 8 Operations                  | Docker PostgreSQL 17 / Redis 8 / MinIO. `/api/v1/health` (liveness, no I/O) and `/health/ready` (PG + Redis, 503). Exact-origin CORS, helmet, web CSP, `x-request-id`, redacted logs, fail-fast config. A demo topology exists in `render.yaml` + [docs/deployment.md](legacy/docs/deployment.md). It is **a demo, not production**.                                                                                                                                                                                                                                                                                                             |

## D. Deferred and long-term scope (NOT implemented)

Do not build fake UI or seed fake data that implies any of these exist.

- **Public registration**, only after the Phase 9 moderation and abuse gate passes.
- **Auth expansions:** Google/Apple, magic link, passkeys, MFA, a sessions/devices list, login history.
- **Audiences and post types:** public/friends/close-friends/private post audiences, follows, and quote/link/music/poll/gallery/milestone posts.
- **Search:** global privacy-aware search for users, Boxes, and permitted content.
- **Organization:** galleries, albums, bookmarks, Pinterest-like Collections, collection sharing.
- **Memory features:** On This Day, friendship/Box timelines, yearly recaps, milestones, events.
- **Advanced Room personalization:** scoped custom CSS and sanitized, sandboxed HTML widgets, only after a dedicated security review. **Arbitrary JavaScript is permanently prohibited.**
- **Trust and safety:** reporting (users/posts/comments/Boxes), moderation queue, takedown, suspension, admin lookup, immutable audit log.
- **Account lifecycle:** asynchronous account deletion and portable data export.
- **Monetization:** entitlements, storage usage, Paldora+ (Stripe on web, possibly RevenueCat on mobile). A downgrade overage **blocks new uploads and never deletes memories**.
- **Analytics:** privacy-respecting, focused on healthy Boxes and memory value. Never time-spent optimization.
- **Operations:** error tracking, metrics/alerts, email, push, search-indexing jobs.
- **Native apps:** a native **iOS app (Swift/SwiftUI)** and a separate native **Android app (Kotlin/Jetpack Compose)**, built after the web/API is release-ready. **No React Native or Expo.**
- **End-to-end encrypted Boxes:** only with established protocols, client key management, independent review, and a separate threat model. Never custom crypto, never unverified security claims.

Dependency order: stable web + backend → advanced personalization (after normal
Rooms are safe) → moderation/admin before public signup → native apps on a
mature, language-neutral contract.

## E. Architecture and dependency rules

> The diagram below is the retired reference architecture. The active one is Firebase Auth, Firestore, Storage and Functions behind `@paldora/firebase-trusted` (see [docs/firebase/implementation.md](docs/firebase/implementation.md) and [docs/deployment.md](docs/deployment.md)).

```text
Next.js web ────────────┐
iOS (SwiftUI) ──────────┼─> versioned HTTP API (/api/v1) ─> NestJS API ─> PostgreSQL (canonical)
Android (Compose) ──────┘                                    ├─> Redis (queues, rate limits, pub/sub)
                                                             └─> private S3-compatible storage
          PostgreSQL outboxes ─> BullMQ ─> worker (Sharp media, deletion)
```

**Rules:**

- PostgreSQL is canonical. Redis is disposable and must never hold the only copy of durable intent or private content.
- Clients never touch PostgreSQL, Redis, or storage credentials. They receive only short-lived signed URLs.
- Controllers are thin (parse → rate-limit → delegate). Services and `*-authorization-policy.service.ts` own rules. Persistence sits behind focused data boundaries.
- `domain` is framework-neutral and `validation` owns shared Zod schemas. `api-client` centralizes HTTP, auth headers, and typed errors. Workspace packages stay acyclic.
- **Contract boundary:** the native Firebase contract: the callable registry, generated JSON Schema, and fixtures under `contracts/native/` ([ADR 021](docs/adr/021-firebase-native-contract.md), Proposed). Generate or verify Swift and Kotlin transport models from it; `pnpm contract:native:check` guards drift. Domain and UI layers stay native and hand-written. The OpenAPI pipeline in §R2 is historical.
- Web, iOS, and Android share API semantics, token values, terminology, fixtures, and conformance tests. They **never share UI source**.
- Native apps follow platform conventions (navigation, accessibility APIs, Keychain/Keystore, lifecycle, background work, media, push). They do not chase pixel parity.
- Modular monolith until measured scale or ownership pressure says otherwise. No microservices.
- Fan-out-on-read plus keyset pagination. Measure before adding ranking, feed fan-out, broad caching, or a search engine.
- Expensive or retryable work runs in the worker, never in synchronous HTTP.
- Transactional outboxes (`media_job_outbox`, `activity_events`) bridge commits to BullMQ and projection. They are claimed with `FOR UPDATE SKIP LOCKED`, and the outbox UUID is the BullMQ job ID.
- SSE payloads carry IDs, action, and timestamp only. They are **invalidation hints**: clients re-fetch through normal authorization.

**Reference ownership map:**

| Workspace                                               | Owns                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [apps/web](legacy/apps/web)                             | Next 16 App Router UI. `app/**/page.tsx` routes, `app/actions/*` Server Actions, `app/lib/api.ts` (server API client from the Supabase cookie session), `browser-api.ts`, `authenticated-sse.ts`, `proxy.ts` (CSP nonce + session refresh), `design-preview/*` fixture routes (404 in production). |
| [apps/api](legacy/apps/api)                             | NestJS 11. Currently **one flat `AppModule`** with 11 controllers and ~33 providers. `SupabaseAuthGuard` is applied per controller. Zod parsing via `request-validation.ts`. Outbox and activity dispatchers poll inside the API process. `seed-demo.ts` provisions accounts.                      |
| [apps/worker](legacy/apps/worker)                       | BullMQ consumer: `process-post-image` (all image purposes) and `delete-media-object`. Sharp `failOn:'error'`, `limitInputPixels` 40 MP, `.rotate()`, 1600px display + 640px thumbnail WebP, metadata stripped.                                                                                     |
| [apps/mobile](legacy/apps/mobile)                       | Legacy Expo placeholder. **Exclude from the greenfield workspace.**                                                                                                                                                                                                                                |
| [packages/domain](legacy/packages/domain)               | Branded IDs, DTOs, Room theme registry, channel names. No framework imports.                                                                                                                                                                                                                       |
| [packages/validation](legacy/packages/validation)       | Zod request schemas, username normalization, limits (page size ≤50).                                                                                                                                                                                                                               |
| [packages/api-client](legacy/packages/api-client)       | `PaldoraApiClient` + `ApiClientError` (hand-written).                                                                                                                                                                                                                                              |
| [packages/auth](legacy/packages/auth)                   | Principal and identity types only.                                                                                                                                                                                                                                                                 |
| [packages/config](legacy/packages/config)               | Zod env parsers for api/worker/seed (none for web).                                                                                                                                                                                                                                                |
| [packages/database](legacy/packages/database)           | Drizzle schema, pool factory (`max: 20`, hard-coded), migrations in `drizzle/`.                                                                                                                                                                                                                    |
| [packages/storage](legacy/packages/storage)             | `ObjectStorage` interface + S3 implementation (signed PUT/GET, head, read, write, delete).                                                                                                                                                                                                         |
| [packages/observability](legacy/packages/observability) | pino logger with redaction.                                                                                                                                                                                                                                                                        |
| [packages/ui](legacy/packages/ui)                       | A 5-color token object, **unused by web** (see §Q).                                                                                                                                                                                                                                                |

**Greenfield destination for native apps:** keep them in **this repository** as
`apps/ios` (Xcode project + Swift Package Manager) and `apps/android` (Gradle,
Kotlin DSL). Keep both **outside the pnpm/Turborepo task graph**.

- **Why the same repo:** one small team, and contract, token, and fixture changes must land atomically with their API change.
- **CI:** each platform gets its own path-filtered job (`macos` for iOS, `ubuntu` + emulator for Android). Each triggers on its own directory or on changes to `contracts/` or `design/tokens/`.
- **Releases:** each platform has its own versioning and release ownership.
- **Revisit when:** separate teams own the platforms, or CI cost or minutes become a measured problem.

## F. Data-model map and invariants

All tables live in the `paldora` schema. See [packages/database/src/schema.ts](legacy/packages/database/src/schema.ts) and [docs/database.md](legacy/docs/database.md).

| Domain        | Tables                                                                                | Key invariants                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity      | `users`, `profiles`, `user_preferences`                                               | Unique `auth_subject`, unique normalized email and username. `user_status` gates every request. Appearance stored server-side.                                                                                                                                                                                                                     |
| Social/Boxes  | `friendships`, `boxes`, `box_memberships`, `box_invitations`                          | **Friendship:** one canonical row per pair (`user_low_id < user_high_id`); status `pending/accepted/declined/blocked` with `blocked_by_user_id`. **Box membership:** PK `(box_id,user_id)`; partial unique index = one active owner per Box. **Invitations:** partial unique pending pair. `boxes.privacy_mode` is check-constrained to `private`. |
| Content/media | `posts`, `post_media`, `media_assets`, `media_job_outbox`                             | Posts soft-delete (`status`). `post_media` positions 0–3, unique per post. `media_assets.box_id` cascades. Outbox deletion payloads **snapshot object keys before cascades**.                                                                                                                                                                      |
| Interactions  | `comments`, `post_reactions`, `comment_reactions`, `activity_events`, `notifications` | Comments soft-delete; self-FK with one-level depth enforced in service. `post_reactions` PK `(post_id,user_id)`; a `real` reaction must have a unique `reaction_image` asset. Unique `dedupe_key` on events and notifications.                                                                                                                     |
| Life Updates  | `life_updates`, `life_update_deliveries`, `life_update_media`                         | One delivery per (update, Box) or a single only-me delivery. Each delivery owns a backing `posts` row (cascade). Media positions are unique.                                                                                                                                                                                                       |
| Rooms         | `rooms`, `room_widgets`, `room_top_friends`                                           | Many check constraints on the theme/token allowlist. Widget and top-friend positions are unique. Rows cascade from `rooms.user_id`.                                                                                                                                                                                                                |

Requirements for every table:

- UUID PKs, `timestamptz` timestamps, FKs with a **reviewed** cascade policy, checked enums or lifecycles.
- Partial or compound uniqueness where races are possible, and keyset indexes `(scope, created_at desc, id desc)`.
- **Database constraints are the final authority on races.** Availability checks are advisory.
- Image bytes never enter PostgreSQL.
- Migrations `0000`–`0015` are immutable. Generate a new one with `pnpm db:generate`, review the SQL, and apply it with `pnpm db:migrate`.

## G. Authorization and security invariants (non-negotiable)

Deny by default. **Every feature must answer, and test, all of these:**

- Who may create, read, update, and delete it?
- What happens with a forged request or a guessed UUID?
- What happens after a block (either direction), unfriend, Box removal or leave, archival, deletion, account suspension, or Room visibility change?
- Which absence and denial responses must be indistinguishable?

Invariants:

- **Authentication never implies authorization.** Membership, ownership, and visibility are checked server-side on **every** read and mutation, including SSE delivery (per event) and signed media reads.
- **Verify the JWT, then map the identity.** Verify Supabase JWT issuer, audience, signature (JWKS), and expiry. Map `sub` to a separately provisioned internal user. An unknown subject gets `ACCOUNT_NOT_PROVISIONED`; a non-active user gets `ACCOUNT_BLOCKED`.
- **Blocks override social access.** A block in either direction overrides friendship, invitations, interactions, Room access, Top Friends, and notification visibility. (See §Q on post-feed inconsistency.)
- **A visible Room never widens access.** Every Room preview re-filters by the viewer's current Box membership and blocks.
- **Use non-leaking errors:** `POST_NOT_FOUND`, `BOX_NOT_FOUND`, `ROOM_NOT_FOUND`, `INTERACTION_NOT_AVAILABLE`, etc. Absence and denial must look identical.
- **Media rules:**
  - Private buckets only.
  - Uploads are signed for an exact MIME type and length, with a 300 s TTL.
  - Completion rechecks ownership, scope, stored MIME, exact byte count, and single-use attachment.
  - The worker decodes with pixel limits and strips metadata.
  - Reads use signed derivative URLs (900 s).
  - Object keys and credentials never reach clients.
- **Web hardening:** exact-origin CORS, a restrictive CSP, HTTPS, secure SSR cookies, a recovery-redirect allowlist, request IDs, stable public errors, and no stacks in production.
- **Never log or emit** private bodies, tokens, cookies, passwords, credentials, signed URLs, or image data, whether in logs, analytics, or events.
- **Distributed Redis rate limits on abuse-sensitive mutations fail closed** (`RATE_LIMIT_UNAVAILABLE`). Current limits per user per hour:

  | Action         | Limit |
  | -------------- | ----: |
  | friend request |    20 |
  | Box invite     |    60 |
  | post           |   120 |
  | post upload    |   480 |
  | comment        |   300 |
  | reaction       | 1,000 |
  | camera upload  |   120 |

- The Supabase service-role key and S3 keys are server-only. They never go into web, iOS, or Android bundles, Vercel, or committed files. The service-role key is used **only** by the trusted seed and admin path.
- Room personalization accepts only the reviewed Phase 8 closed CSS/HTML grammar (ADR 018), with independent flags off by default. Never scripts, font URLs, or background URLs. **Never arbitrary JavaScript.** **Never custom cryptography.**

## H. API, validation, and errors

- REST under `/api/v1` (URI versioning). `Authorization: Bearer <Supabase access token>`.
- Error envelope `{ "error": { "code", "message", "requestId?" } }` with stable `SCREAMING_SNAKE` codes.
- Zod validation at the boundary (`parseRequest`/`parseUuid`). Page size ≤50. Cursors are opaque `(createdAt, id)` values.
- PATCH is partial and server-authoritative. Set-state operations are idempotent (`PUT …/reaction` with an emoji or `null`; Top Friends and widgets replace the full order).
- Room updates use `expectedUpdatedAt` → `ROOM_UPDATE_STALE`.
- The exhaustive endpoint list is in [docs/api.md](legacy/docs/api.md) and the `*.controller.ts` files.

**A new endpoint requires all of:**

1. domain DTOs;
2. a shared Zod schema;
3. a typed client method (and, for native clients, a callable registry entry and fixture under `contracts/native/`);
4. an explicit policy plus stable non-leaking errors;
5. a transaction and constraint design;
6. a rate-limit decision;
7. unit, integration, and authorization tests;
8. documentation.

## I. UI/UX and component architecture

**Brand:**

- Palette: Obsidian Ink, Antique Gold, Champagne, Warm Ivory, Soft Lavender. Canonical values are in [design/design-system.md](legacy/design/design-system.md).
- Use gold as a signal, never as a fill.
- Typography: an editorial serif for brand moments and Room/Life Update headings, a clean sans for all functional UI, and handwriting only for decoration.
- Motifs: subtle four-point stars, open-box symbolism, Polaroids, paper, tape, postcards. At most one decorative cluster per viewport outside Rooms.
- **Never:** generic SaaS, corporate blue, childish, crypto, Instagram/TikTok clone, glassmorphism, or decoration that harms usability.

**Every screen** must:

- work at desktop widths and at **390px**;
- provide keyboard access, visible focus (`color.focus`), labels, and semantic HTML;
- meet WCAG 2.2 AA contrast and 44×44px touch targets;
- respect reduced motion and safe areas;
- have honest loading, empty, error, inaccessible, and deleted states;
- use **no fake data** that implies a feature exists.

**Component rules** (full catalog: [apps/web/app/components/README.md](legacy/apps/web/app/components/README.md)):

- Route files load data and compose sections. Repeated product rendering lives in `app/components`.
- Stateless, server-compatible primitives live in `app/components/ui` and are exported from `ui/index.ts`.
- Search before creating. Extract at the second _genuine_ use.
- Server Components by default. Put `'use client'` at the smallest interactive boundary.
- Reuse the established owners:

  | Concern        | Reuse                                                                                                      |
  | -------------- | ---------------------------------------------------------------------------------------------------------- |
  | Shell          | `AppShell`                                                                                                 |
  | Menus          | `OverflowMenu`                                                                                             |
  | Uploads        | `AvatarUploader(View)`, `image-upload.ts`                                                                  |
  | Feeds          | `PostFeed`, `UnifiedFeed`                                                                                  |
  | Interactions   | `PostInteractions`/`usePostInteractions`, `CommentThread`, `ReactionBar`, `EmojiChooser`, `ReactionCamera` |
  | Notifications  | `NotificationRow`, `NotificationNavLink`                                                                   |
  | Media viewing  | `PostMediaLightbox`                                                                                        |
  | Life Updates   | `LifeUpdateCard`/`Composer`/`Editor`                                                                       |
  | Memories       | `MemoryTimeline`                                                                                           |
  | Rooms          | `RoomCanvas` and the room editors                                                                          |
  | Box management | `BoxManagementMenu`                                                                                        |
  | Feedback       | toasts from `ui/toast.tsx`                                                                                 |
  | Realtime       | `AppRealtimeBridge` (one stream per tab)                                                                   |

- Trusted navigation, privacy, and account actions stay **outside** `.room-canvas` and theme scope. Room content stays below `z.sticky`.
- Mobile bottom navigation exposes **My Room** directly. Box creation stays on the Boxes page.

## J. Coding and refactoring standards

**Enforced** ([eslint.config.mjs](legacy/eslint.config.mjs), [tsconfig.base.json](legacy/tsconfig.base.json)):

- Strict TypeScript with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- No `any`. Type-only imports are explicit. No duplicate imports.
- Production code limits:

  | Rule               | Limit                                            |
  | ------------------ | ------------------------------------------------ |
  | complexity         | ≤ 15                                             |
  | nesting depth      | ≤ 4                                              |
  | function length    | ≤ 150 lines (excluding blanks/comments)          |
  | parameters         | ≤ 5                                              |
  | `no-await-in-loop` | allowed only with a local protocol justification |

- Lint runs with `--max-warnings=0`.

**Expected practice:**

- No business rules in React. No god services or components, no service locators, no circular workspace deps.
- Use maps, sets, and indexes and batch database work. No N+1 queries and no accidental nested loops.
- Use transactions for multi-step invariants, and **no network calls inside open transactions**.
- Keep files focused, use explicit domain language and dependency injection, and model states so invalid ones are hard to represent.
- Validate at trust boundaries, then enforce again in PostgreSQL.
- Design mutations for retry: natural uniqueness or idempotency keys, plus optimistic concurrency where edits race.
- Avoid hidden global state, time-dependent tests, unbounded queries, and offset pagination on growing lists.
- **Observability:** structured logs with request and job correlation IDs, bounded retries with backoff and jitter, dead-letter states, health/readiness probes, and metrics that never contain private content.
- **Dependencies:** use maintained, stable packages and pin exact versions (the reference build mixes `^` ranges). Add one only when its value beats its maintenance, bundle, security, and lock-in cost.
- **Performance:** set budgets and measure (query plans, bundles, rendering, media) before optimizing.
- Record consequential decisions as ADRs in [docs/adr/](legacy/docs/adr/), with rejected alternatives and revisit triggers. Do not relitigate settled ADRs without new evidence.
- Preserve unrelated work in dirty trees. No destructive git, and never rewrite deployed migrations.
- Update the component catalog and docs when architecture changes.

## K. Working method for future sessions

1. Read the applicable instructions and canonical docs for the area.
2. Inspect current code and tests before proposing anything.
3. Write down the feature's authorization matrix, data invariants, and failure modes before implementing.
4. Make the smallest coherent plan, in dependency order.
5. Reuse or extend shared contracts and components. Never fork them.
6. Implement database → API → client → UI → worker as **one vertical slice**.
7. Give concise progress updates during long work.
8. Verify in proportion to risk. Report exact commands and results, and never claim unrun tests passed.
9. Update docs and the design manifest only when the implementation supports the claim.
10. **Stop for direction** before external billing, public launch, destructive production operations, or scope-changing product decisions.

For reviews and diagnosis, do not mutate code unless asked. For implementation,
finish and verify the slice rather than returning only a plan.

## L. Greenfield phase order (release-gated)

Each milestone ships its own migration, API, UI, tests, and release checkpoint.
Do not attempt the whole app in one generation. Apply §R decisions as each
phase is built. The detailed tasks, legacy references, exit gates, open
decisions (D1–D7), and the status table live in [docs/rebuild-plan.md](docs/rebuild-plan.md).
Update that table when a phase exits.

| #   | Milestone                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Foundation: workspace, local infra, CI with **real** Postgres/Redis/MinIO services, OpenAPI pipeline, token pipeline, health, logging, error filter, docs |
| 1   | Supabase auth, admin provisioning, profiles/onboarding/avatar (on the generic media module from R4 in a minimal form)                                     |
| 2   | Friendships, directional blocks (R8), Boxes, invitations, roles and lifecycle                                                                             |
| 3   | Posts, chronological feeds, realtime invalidation (R5)                                                                                                    |
| 4   | Media pipeline hardening: outbox completion tracking, reaper, dead-letter, worker                                                                         |
| 5   | Comments/replies, emoji and camera reactions, durable notifications                                                                                       |
| 6   | Multi-Box Life Updates and derived Memories                                                                                                               |
| 7   | Rooms, 14 themes, Top Friends, widgets, banner/music, app appearance                                                                                      |
| 8   | Advanced personalization, only after a dedicated security review                                                                                          |
| 9   | Moderation/admin, reporting, audit, account deletion/export, **signup gate**                                                                              |
| 10  | iOS app (Swift/SwiftUI): complete native client on the frozen Firebase callable contract                                                                  |
| 11  | Android app (Kotlin/Compose): separate complete native client on the same callable contract                                                               |
| 12  | Discovery, collections, premium, recaps, once their privacy models are explicit                                                                           |

Public registration stays disabled until Phase 9 passes. Phases 10 and 11 each
include:

- native architecture;
- secure token storage and refresh (Keychain/Keystore);
- networking and error mapping from the contract;
- universal/app links;
- media capture and upload;
- SSE reconnect;
- push readiness;
- accessibility (VoiceOver/TalkBack, Dynamic Type/font scale);
- offline and poor-network states;
- XCUITest or Compose UI tests;
- TestFlight or Play internal testing;
- store privacy labels and data-safety forms.

Do not start them to mirror screens while the web app or the callable contract is still churning.

## M. Testing and definition of done

**Standard gates** (root workspace; CI runs all of them):

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm contract:check && pnpm tokens:check && pnpm build && pnpm scan:client-bundle
pnpm test:integration     # real PostgreSQL + Redis (Docker); FAILS if unconfigured
pnpm test:e2e             # builds production web; desktop + 390px; axe; CSP
```

**Focused runs:**

```bash
pnpm --filter @paldora/api exec vitest run src/platform/platform.test.ts
pnpm --filter @paldora/web exec vitest run app/lib/csp.test.ts
pnpm test:e2e --project=mobile-390 apps/web/e2e/foundation.spec.ts
DATABASE_URL=postgresql://paldora:paldora_dev_only@localhost:5432/paldora \
REDIS_URL=redis://localhost:6379 pnpm test:integration
```

- **Integration tests.** `*.integration.test.ts` files call
  `requireEnvironmentVariables` and **throw** when infrastructure is
  unconfigured. Never reintroduce `describe.runIf` skipping.
- **Route inventory.** `apps/api/src/route-inventory.test.ts` fails when Nest
  routes and the contract registry diverge, or when a mutating route has no
  rate-limit decision.

**Reference build only** (`cd legacy` first):

- **Environment.** It expects its own `legacy/.env`; the root `.env` was
  intentionally left in place.
- **CI.** Its CI lives in `legacy/.github/` and no longer runs.
- **First pnpm run.** It must be an interactive `pnpm install` to relink
  `node_modules`. Non-interactive runs abort with
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
- **Silent test skips.** Its integration suites use `describe.runIf` and skip
  silently when the database or Redis variables are unset.

**Privacy tests are first-class.** Cover:

- unrelated users, blocked users (both directions), former members;
- guessed IDs, deleted content, archived Boxes;
- concurrent writes, SSE reconnects;
- storage and Redis failures, cleanup retries.

**Release gates:**

- clean-database migrations;
- integration and worker tests against real services;
- hosted Supabase smoke tests;
- desktop and 390px Playwright;
- automated accessibility checks;
- client-bundle secret scans;
- real provider smoke tests when providers change.

Never use production data in tests.

**Native gates:**

- **iOS:** Swift unit and integration tests, plus XCUITest on supported iOS versions.
- **Android:** Kotlin unit and integration tests, plus Compose UI/instrumentation tests across supported API levels.
- **Both:** **contract-conformance fixtures** shared with web, so auth, cursors, errors, and DTO evolution are interpreted identically.

**Done means:**

- schema, constraints, and migration;
- API, policy, validation, and typed client;
- responsive UI with all states;
- tests, observability, and security review;
- docs.

## N. Environment, deployment, operations

**Local setup** (root; details in [docs/development.md](docs/development.md)):

```bash
corepack enable && pnpm install && cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d --wait   # project paldora-v2; PG :5432, Redis :6379, MinIO :9000 (loopback)
pnpm db:migrate
pnpm dev                                                            # web :3000, API :4000/api/v1, worker
```

**Environment:**

- Node 24 LTS (`.nvmrc`). pnpm is pinned in `package.json`.
- Variables are listed in [.env.example](.env.example). **Never read or print
  `.env`.**
- `PALDORA_ENV=staging|production` makes the parsers require HTTPS and reject
  `*_dev_only` credentials.
- Only `NEXT_PUBLIC_*` values, validated by `@paldora/config`, may reach the
  browser.
- `DATABASE_URL`, `REDIS_URL`, Supabase admin keys, and storage secrets are
  server-only.
- Open the app via the exact `WEB_ORIGIN`, because CORS depends on it.
- Use a distinct `JOB_QUEUE_NAME` for each environment that shares a Redis
  instance.
- The compose project is `paldora-v2`, so it never touches the legacy
  `paldora` volumes. Don't run both stacks at once.

**Release order:** verify and back up → apply backward-compatible migrations
(one job) → deploy API and worker → deploy web → smoke test → remove obsolete
schema in a later expand/contract release. See
[docs/deployment.md](docs/deployment.md) and
[ADR 014](docs/adr/014-release-topology.md).

**Production requires:**

- PostgreSQL with PITR backups and tested restores;
- Redis with `maxmemory-policy noeviction` (BullMQ requirement; verified in the BullMQ production guide, 2026-10);
- durable private object storage and TLS;
- a secret manager, metrics, and alerts;
- tuned connection-pool and worker-concurrency budgets.

The free-tier Render/Vercel/Supabase topology is a **demo**: services sleep,
the database expires, the key-value store is not persistent, and there are no
backups. Never call it production-grade. Provider pricing and limits change, so
check current official docs before making hosting claims.

---

## Q. Reference implementation review

Classifications: **Keep** · **Improve** · **Replace** · **Defer**. The evidence
paths are real, so verify before acting.

**Keep:**

- PostgreSQL + Drizzle with reviewed SQL migrations ([ADR 001](legacy/docs/adr/001-use-postgresql.md)).
- A NestJS modular monolith ([ADR 002](legacy/docs/adr/002-use-nestjs-api.md)).
- Supabase as identity provider only, with internal user mapping and admin provisioning.
- Explicit membership rows ([ADR 003](legacy/docs/adr/003-box-membership-model.md)).
- Private S3 storage with signed URLs and Sharp in a worker ([ADR 004](legacy/docs/adr/004-media-storage.md)).
- Transactional outboxes with `SKIP LOCKED`.
- Fan-out-on-read keyset feeds.
- Identifier-only SSE invalidation.
- Life Update "store once, deliver per Box" and Memories derived at query time.
- The Room semantic tree with a versioned allowlist registry.
- Non-leaking not-found errors.
- Strict TS and ESLint complexity limits.
- pnpm + Turborepo.
- The deterministic design-capture routes.

**Discrepancies and defects found (recorded, not fixed):**

1. **Two CSPs.** [apps/web/proxy.ts](legacy/apps/web/proxy.ts) sets a nonce CSP, while [apps/web/next.config.ts](legacy/apps/web/next.config.ts) sets a second CSP with `script-src 'unsafe-inline'` and `img-src https:`. Browsers enforce both. The intent and the effective policy are unclear.
2. **Inconsistent block semantics.** Life Updates and Life-Update Memories hide authors blocked in either direction, but Box and Home **post** feeds and post Memories do not filter blocked authors in shared Boxes ([post.service.ts](legacy/apps/api/src/post.service.ts) vs [life-update.service.ts](legacy/apps/api/src/life-update.service.ts)). This needs a product decision.
3. **Blocks live in `friendships`.** There is one row per pair, so a blocked user cannot block back (`INTERACTION_NOT_AVAILABLE`), and the blocker's unblock deletes all protection.
4. **Outbox rows are marked published on enqueue.** If BullMQ exhausts its 5 attempts on `delete-media-object`, the job is dropped (`removeOnFail`) and objects are orphaned. Only `process-post-image` has a final-failure handler. Nothing reaps abandoned `pending` uploads.
5. **Realtime cost and correctness.**
   - Every connection runs a DB access check per event on a global Redis channel.
   - Any event calls `router.refresh()` for the whole page.
   - Streams never re-check token expiry or user status after connecting.
   - Box and notification SSE endpoints exist, but web uses only `/me/feed/events`.
6. **Rate-limit gaps.** None on Life Update create, avatar/Life-Update/banner uploads, Room writes, Box create, or username availability. All windows are fixed.
7. **Validation and error handling.**
   - A class-validator `ValidationPipe` is configured although all validation is Zod.
   - There is no global exception filter, so `requestId` never appears in error bodies and the readiness 503 uses Nest's default shape.
   - The auth guard is per controller, not global.
8. **Web config and session handling.**
   - Web has no env parser and silently falls back to `localhost` URLs.
   - Proxy calls `supabase.auth.getUser()` (a network round trip) on every matched request. Supabase's current Next.js guide (checked 2026-10) recommends `getClaims()` for proxy validation, and the local Next 16 auth guide says Proxy should do optimistic checks only.
   - Server Action results travel as `?error=`/`?notice=` query strings.
9. **Three diverging token sets** with different hex values: [design/design-system.md](legacy/design/design-system.md), [packages/ui](legacy/packages/ui/src/index.ts), and `apps/web/app/globals.css` (3,796 lines, which also imports Tailwind but uses it little).
10. **Five near-duplicate upload services** (avatar, post, reaction, Life Update, banner).
11. **Oversized services and one flat module.** `life-update.service.ts` (692 lines) and `interaction.service.ts` (681 lines) are large, and the API is one flat module.
12. **Test gaps.**
    - CI never runs API integration or authorization tests (they skip when env vars are unset).
    - Playwright covers fixture routes only, and CI runs only the Chromium project (not `mobile-chrome`).
    - There are no automated accessibility checks.
13. **Unsafe deploy migrations.** [scripts/start-deployed-services.mjs](legacy/scripts/start-deployed-services.mjs) migrates on every start, which races with multiple replicas. The pool is fixed at 20 per process, and API + worker share one container.
14. **Shallow log redaction.** It covers only one level (`*.token`) and has no rule for signed URLs.
15. **Originals are retained forever with original metadata.** Only derivatives are stripped (privacy and storage trade-off, product decision).
16. **Stale docs.**
    - The README still describes a "foundation only" build with an Expo app and omits Phase 7.
    - [docs/architecture.md](legacy/docs/architecture.md) and [docs/deployment.md](legacy/docs/deployment.md) reference Expo/EAS.
    - ADR 003 says "accepted for future implementation".
    - The manifest marks implemented screens (Boxes, notifications, photo viewer) as `TODO`, because it tracks artboards.
    - `apps/web` builds with `next build --webpack` without a recorded reason.
    - `docs/claude-bootstrap-prompt.md` is untracked.

## R. Greenfield decisions

Format: problem → design → why for Paldora → trade-offs → migration → validation / revisit trigger.

**R1 Improve: API structure and edge behavior.**

- **Problem:** Q7 and Q11.
- **Design:**
  - Nest feature modules: `identity`, `social`, `boxes`, `posts`, `media`, `interactions`, `life-updates`, `memories`, `rooms`, `realtime`, `platform`.
  - A **global** auth guard with an explicit `@Public()` opt-out.
  - A global exception filter that emits the envelope with `requestId` and maps unknown errors to `INTERNAL_ERROR`.
  - A Zod pipe; drop class-validator.
  - Typed config injected through DI.
- **Why:** deny-by-default becomes structural, not a convention.
- **Trade-offs:** slightly more module wiring.
- **Migration:** none (greenfield).
- **Validate:** a test enumerates every route and asserts it is guarded unless allowlisted.
- **Revisit when:** a module needs independent deployment.

**R2 Replace: hand-written contract with an OpenAPI pipeline.** _Historical: superseded for native clients by the callable contract in `contracts/native/` (ADR 021)._

- **Problem:** a hand-maintained 842-line client, with native apps coming.
- **Design:**
  - Zod schemas are the single source. Generate `contracts/openapi.json` in CI and fail on drift.
  - Generate the TS client.
  - Generate Swift (swift-openapi-generator) and Kotlin transport models.
- **Why:** three clients must agree on errors, cursors, and nullability.
- **Trade-offs:** generator constraints on schema style.
- **Migration:** keep `/api/v1` semantics.
- **Validate:** contract-conformance fixtures run in all three clients.
- **Revisit when:** generator quality blocks idiomatic code. Then hand-write the transport code, but keep it fixture-verified.

**R3 Improve: web edge.**

- **Problem:** Q1 and Q8.
- **Design:**
  - **One** nonce CSP defined in `proxy.ts` only, including the needed `media-src`/`worker-src`.
  - A Zod web env parser that fails the build.
  - Proxy uses `getClaims()` for the optimistic refresh only. The data layer still lets the API decide authorization.
  - Server Actions return typed results via `useActionState`, not URL query strings.
- **Why:** removes CSP ambiguity, keeps messages out of URLs and history, and avoids a per-request auth round trip.
- **Trade-offs:** the nonce makes pages dynamic (already the case via `connection()`).
- **Validate:** an e2e test asserts exactly one CSP header with no `unsafe-inline` scripts in production.
- **Revisit when:** Next changes its CSP guidance (re-read the local docs).

**R4 Replace: per-purpose upload services and fire-and-forget outbox.**

- **Problem:** Q4, Q10, and Q15.
- **Design:**
  - One `media` module with a purpose policy table (MIME, size, scope, attach rules, derivative spec).
  - Outbox rows track `pending → published → completed | dead`. The worker marks completion in PostgreSQL.
  - A scheduled reaper deletes expired `pending` uploads and retries `dead` deletions with alerts.
  - Decide whether to keep re-encoded originals (product approval needed).
- **Why:** cleanup becomes provably durable, which privacy and "made to last" both require.
- **Trade-offs:** extra state and a cron job.
- **Validate:** fault-injection tests (Redis down, worker crash, storage 5xx) end with zero orphans.
- **Revisit when:** a managed lifecycle policy replaces the reaper.

**R5 Improve: realtime.**

- **Problem:** Q5.
- **Design:**
  - One `/me/events` stream per tab.
  - Per-Box and per-user Redis channels, subscribed according to the connection's current memberships.
  - Membership changes push a resubscribe or close.
  - A stream lifetime ≤ access-token expiry, with user status re-checked on reconnect.
  - `Last-Event-ID` best effort.
  - Clients invalidate targeted queries, not the whole route.
- **Why:** removes O(connections × events) DB checks and over-refresh without weakening authorization, because clients still re-fetch.
- **Trade-offs:** subscription bookkeeping.
- **Validate:** load test with N connections and a k6 profile. Privacy tests cover removal mid-stream.
- **Revisit when:** bidirectional needs appear; consider WebSockets only then (**Defer**).

**R6 Improve: rate limiting.**

- **Problem:** Q6.
- **Design:**
  - Declarative per-route limit metadata covering every abuse-sensitive write, plus username availability and auth-adjacent endpoints.
  - A sliding-window or GCRA Lua script.
  - Edge limits as well.
- **Validate:** a route-inventory test checks that every write has a limit decision.

**R7 Replace: three token copies.**

- **Problem:** Q9.
- **Design:**
  - `design/tokens/*.json` (DTCG format) is the single source.
  - Generate CSS custom properties, Swift, and Kotlin from it.
  - Web styling uses tokens with co-located CSS Modules per component, replacing the 3.8k-line global file. Drop Tailwind unless it is adopted fully.
- **Why:** native apps need the same values.
- **Validate:** a contrast test runs on generated pairs (WCAG AA).

**R8 Replace: blocks inside `friendships`.**

- **Problem:** Q2 and Q3.
- **Design:**
  - A directional `user_blocks(blocker_id, blocked_id)` table with a unique pair, and a symmetric `is_blocked_between` SQL helper used by every visibility query.
  - Friendship keeps only `pending/accepted/declined`.
  - **Product decision required:** whether shared-Box posts from a blocked user are hidden from the blocker. The recommended answer is yes, with "hidden because you blocked …" placeholders and no leaking to the other side.
- **Validate:** an authorization matrix test covers each content type × block direction.

**R9 Improve: deploy topology.**

- **Problem:** Q13.
- **Design:**
  - Migrations run in a single release job, never at service start.
  - Separate API and worker services with configurable pool sizes.
  - Outbox dispatchers become a leader-safe worker loop, which `SKIP LOCKED` already makes safe.
- **Validate:** a staging deploy with two API replicas.

**R10 Improve: tests in CI.**

- **Problem:** Q12.
- **Design:**
  - CI service containers for Postgres, Redis, and MinIO. Integration suites **fail** (not skip) when `CI=true` and services are missing.
  - A full-stack Playwright suite against a seeded API using a local JWT issuer (Supabase CLI) in addition to the fixture routes.
  - Both the `chromium` and `mobile-chrome` projects run.
  - `@axe-core/playwright` checks.
  - A bundle secret scan.
- **Revisit when:** CI time exceeds ~15 min; then shard.

**R11 Replace: Expo with two native apps.** Per §D/§E and Phases 10–11.

**Defer** (no present evidence):

- LISTEN/NOTIFY instead of outbox polling;
- WebSockets;
- a CDN/edge image proxy or stable time-bucketed signed URLs (measure cache churn first);
- a search engine;
- feed fan-out-on-write or ranking;
- read replicas or partitioning;
- microservices, event sourcing, GraphQL, global state libraries.

**Recommended first greenfield milestone: Phase 0.** Scope:

- the workspace without Expo;
- CI with real services and failing-not-skipping integration tests;
- the R1 API skeleton (global guard, error filter, Zod pipe, typed config);
- the R2 OpenAPI generation;
- the R7 token pipeline;
- the R3 single CSP and web env parser;
- health/readiness and structured logging;
- the ADRs for R1–R11.

Ship it with green gates before any product feature.

## S. Development tooling (Claude Code)

Everything here is installed at **project scope** (`.claude/`, `skills-lock.json`)
and pinned to releases at least two weeks old. Telemetry for each tool is off
via `.claude/settings.json`. The repository stays the source of truth: when a
tool's advice conflicts with this file, an ADR, or the code, follow those and
say so.

| Tool                                   | Use it for                                                            | Rules for Paldora                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Superpowers** (plugin)               | Brainstorming, plans, TDD, debugging, verification, review            | Scale it to the task. A one-file fix gets a short plan in chat, not a design doc. **No commits, pushes, branches, or worktrees without the user's go-ahead**, even when a skill suggests them.                                                                                                                                                     |
| **Graphify** (`graphify` CLI + skill)  | Structure, dependencies, impact before cross-module changes           | Query first (`graphify query "…"`, `graphify path A B`), then verify in the code, because the graph can be stale. After changing code, run `graphify update .` (AST only, no AI calls). It indexes the current build only; `legacy/` is excluded in `.graphifyignore`. Always-on hooks are deliberately not installed.                             |
| **Built-in memory + Claude Mem**       | History: past decisions, problems, conventions                        | Claude Mem captures sessions automatically: local-only, worker on `127.0.0.1`, no cloud sync, telemetry off. The built-in memory holds explicit facts and feedback. Neither one replaces `CLAUDE.md`, ADRs, or `docs/rebuild-plan.md`. Never store secrets, `.env` values, or private user content. Wrap sensitive text in `<private>…</private>`. |
| **Impeccable** (plugin, `/impeccable`) | Web UI critique, polish, accessibility                                | **Web only**, never native apps. It must follow the generated `--pal-*` tokens, CSS Modules, and §I. Do not let it introduce Tailwind, inline `style`, or a second design system. Its detector hook runs after UI edits.                                                                                                                           |
| **Find Skills** (`npx skills find`)    | Discovering a skill when a new framework or recurring problem appears | Don't search on every task. Install project-scope only: `DISABLE_TELEMETRY=1 npx skills@1.7.0 add <source> -a claude-code --copy`. Pin the source to a commit or tag at least two weeks old, read it before installing, and record it here.                                                                                                        |
| **Task Observer** (skill)              | Spotting repeated friction and turning it into skill improvements     | It proposes changes and never changes skills, hooks, or files without approval. Its logs live in `.task-observer/`, which is git-ignored and private.                                                                                                                                                                                              |
| `vercel-react-best-practices`          | React/Next performance                                                | The local Next 16 docs take precedence over remembered APIs.                                                                                                                                                                                                                                                                                       |
| `supabase-postgres-best-practices`     | Schema, indexes, queries, migrations                                  | Paldora uses Supabase for **auth only**. Ignore its RLS and Supabase-client advice. Migration rules come from `packages/database/README.md`.                                                                                                                                                                                                       |

**Task Observer activation** (deliberately narrowed from upstream's "every
session"): when a session involves multi-step implementation, debugging, or
review, invoke the task-observer skill **before the first tool call** and run
its Session Start Protocol (storage check, frontmatter scan, review trigger).
Skip it for quick questions. If a skipped session turns into multi-step work,
or the user corrects how you work, invoke it at that moment, before the next
write. Suggest a review of its observations about weekly, never mid-task.

**Session start order:** read this file and the applicable `AGENTS.md`, then
pull relevant history from memory, then consult Graphify when structure
matters, then confirm against the actual code.
