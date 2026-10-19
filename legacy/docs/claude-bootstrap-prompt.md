# Prompt for Claude: create Paldora's root `CLAUDE.md`

Copy everything inside the prompt block below into Claude while Claude is opened
at the root of the Paldora repository.

---

## Prompt

You are the senior product architect and lead engineer taking ownership of
Paldora. Your task in this turn is **not to implement or rewrite the product**.
Your task is to inspect the complete reference repository, select the useful
skills available in your environment, and create a high-quality root-level
`CLAUDE.md` that will guide a disciplined greenfield rebuild of the entire
product over many future sessions.

Paldora's core proposition is:

> **Paldora — a box for your people.**

It is a privacy-first social platform and long-lived digital scrapbook for real
friends and private communities. It combines the expressive identity of
MySpace, the personal posting of Tumblr, the visual organization of Pinterest,
chronological private social feeds, close-friend circles called **Boxes**,
structured Life Updates, Memories, and deeply customizable profile spaces
called **Rooms**. The surface should feel personal, nostalgic, warm, magical,
premium, and expressive. The engineering underneath must remain secure,
predictable, testable, portable, and deliberately boring.

The reference repository contains a working implementation through Phase 7. We
want to be able to rebuild Paldora from the beginning with Claude while
preserving the product decisions, security properties, interaction details,
and engineering lessons already established. Treat the existing product as
evidence and a behavioral reference—not as code to copy blindly.

This is a greenfield-quality rebuild, not a line-for-line reproduction. Preserve
intentional product behavior and privacy guarantees, but actively replace weak,
obsolete, overcomplicated, insecure, inaccessible, or poorly scaling
implementation choices when a demonstrably better option exists. “It is already
implemented this way” is not sufficient justification for repeating it.

The delivery priority is explicit: build and release the responsive website
first. Only after the web product, backend contracts, authorization model, media
pipeline, and operational foundations are stable should native development
begin. Native means **two separate applications**, not a cross-platform shell:

- iOS using Swift and SwiftUI;
- Android using Kotlin and Jetpack Compose.

Do not select React Native or Expo for the rebuild. The existing Expo scaffold
is legacy/reference material only and may be excluded from the greenfield
workspace. The two native apps share backend behavior, an API specification,
design tokens, terminology, and product rules—not UI source code.

### Hard boundary for this turn

Only create or update the root `CLAUDE.md`. Do not change application code,
database migrations, dependencies, environment files, deployment resources,
or the existing `apps/web/CLAUDE.md` and `apps/web/AGENTS.md`. Do not commit or
push unless explicitly asked. If you discover contradictions or defects, record
them in your final report or in a clearly labeled section of `CLAUDE.md`; do not
silently repair them during this task.

Never print, copy, summarize, or embed actual credentials, passwords, tokens,
database URLs, private object URLs, demo-user emails, or service-role keys.
Inspect `.env.example`, never the values in `.env`. Do not hardcode the current
Vercel, Render, or Supabase project identifiers into `CLAUDE.md`.

## 1. Select skills deliberately

Before inspecting or editing:

1. Enumerate the skills and plugins actually available to you at project,
   user, and environment scope.
2. Choose the smallest useful set for this task.
3. Read each selected skill's full instructions before using it.
4. Briefly state which skills you selected and why.
5. Do not invent skill names, claim a skill was used when it was unavailable,
   install global skills, or change user-level configuration without explicit
   permission.

Useful categories, **only if they really exist**, may include repository/code
auditing, architecture documentation, Next.js/React, frontend design and
accessibility, NestJS/API design, PostgreSQL/Drizzle, authentication/security,
test strategy, and deployment/DevOps. Do not use image generation: this task is
documentation and architecture work, not asset creation.

If no specialized skill is relevant, say so and proceed using direct repository
inspection. The finished `CLAUDE.md` must not depend on a nonstandard skill
being installed in future sessions.

## 2. Audit the repository before writing

Read enough implementation and documentation to establish ground truth. At a
minimum inspect:

- root `README.md`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `eslint.config.mjs`, `.env.example`, and `render.yaml`;
- every file in `docs/`, including ADRs;
- `design/DESIGN_MANIFEST.md`, `design/design-system.md`, and the Phase 1, 6,
  and 7 design handoff documents;
- `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, and
  `apps/web/app/components/README.md`;
- web route structure, shared components, server actions, API helpers,
  authentication middleware/proxy, realtime client, and responsive shell;
- every Nest controller, module, authentication guard, authorization policy,
  feature service, rate limiter, event projector, and outbox dispatcher;
- domain contracts, Zod schemas, typed API client, configuration parsers,
  storage abstraction, database schema, and every migration;
- worker media processing and deletion behavior;
- unit, integration, authorization, worker, Playwright, hosted, and design
  capture tests;
- Git history and phase checkpoint commits to understand feature sequencing.

Use `rg`/`rg --files` and focused file reads. Do not infer behavior from file
names alone. When prose and executable behavior disagree, prefer current code,
migrations, tests, and the latest explicit product decision; note meaningful
discrepancies.

Before drafting, privately build these inventories:

- application and package boundaries;
- user-visible routes and states;
- REST endpoints and stable errors;
- current tables, constraints, indexes, cascades, and outboxes;
- authorization rules per resource;
- realtime event flows;
- media upload/processing/deletion lifecycle;
- reusable UI components and client boundaries;
- implemented versus deferred product scope;
- local, CI, test, and hosted deployment workflows.

## 3. Evaluate the implementation and recommend better choices

After establishing what exists, perform a critical architecture and engineering
review. Do not assume the current stack, schema, boundaries, API shapes, or UI
implementation are optimal simply because they work. Evaluate them against
current stable best practices for the framework versions actually selected for
the rebuild.

When information may have changed—framework APIs, security recommendations,
browser behavior, accessibility guidance, provider capabilities, deployment
limits, or package support—consult current official documentation rather than
relying on memory. Prefer primary sources such as framework, standards, OWASP,
PostgreSQL, Supabase, and cloud-provider documentation. Record the decision and
the date or version it applies to; do not paste long external documentation into
`CLAUDE.md`.

Assess at least:

- monorepo and package boundaries, dependency direction, build caching, and CI;
- Next.js rendering, caching, Server/Client Component boundaries, forms, route
  protection, cookie handling, and error boundaries;
- NestJS module/service size, policy placement, validation, transactions,
  idempotency, concurrency, and error mapping;
- database normalization, indexes, constraints, query plans, pagination,
  isolation levels, migration safety, retention, and backup/restore;
- authentication, provisioning, password recovery, sessions, authorization,
  CSRF/CORS/CSP, rate limiting, secrets, logging, and privacy leakage;
- private media upload, validation, processing, delivery, ownership, lifecycle,
  outbox reliability, retries, deduplication, and orphan cleanup;
- realtime transport, reconnect behavior, event ordering, authorization,
  invalidation strategy, and load characteristics;
- component reuse, state ownership, responsiveness, accessibility, performance,
  bundle size, image loading, and optimistic UI correctness;
- observability, failure recovery, deployment topology, provider lock-in, local
  parity, and operating cost;
- test architecture, deterministic fixtures, contract coverage, security tests,
  browser coverage, and flaky-test risk.

For every meaningful proposed change, classify it as one of:

- **Keep** — the existing choice remains the best fit;
- **Improve** — preserve the approach but strengthen its implementation;
- **Replace** — use a materially better design in the rebuild;
- **Defer** — promising, but unsupported by present requirements or evidence.

Include a concise “reference implementation review” and “greenfield decisions”
section in `CLAUDE.md`. For each **Improve** or **Replace** item, capture:

1. the observed problem or risk;
2. the recommended design;
3. why it is better for Paldora specifically;
4. security, privacy, accessibility, performance, complexity, cost, and
   portability tradeoffs;
5. migration or compatibility implications;
6. how the choice will be validated and what would cause it to be revisited.

Prefer the simplest design that satisfies measured requirements. Do not replace
technology merely because another option is newer or fashionable. Avoid
premature microservices, event sourcing, GraphQL, custom cryptography, broad
state libraries, or abstraction layers without a concrete need. Conversely, do
not preserve technical debt for the sake of compatibility in a true greenfield
area.

Product semantics, privacy boundaries, and user-visible behavior may be changed
only when the change is clearly safer or more usable and is documented as a
product decision requiring approval. Security defects may never be preserved
for compatibility. Data-loss, access-control, and cross-Box privacy risks take
priority over matching legacy behavior.

## 4. Produce a root guide, not a repository dump

Create `/CLAUDE.md` as the authoritative high-level guide for future Claude
sessions. It should be self-contained enough to orient a new agent, but it
should link to canonical repository documents for exhaustive endpoint tables,
migration details, and visual manifests instead of pasting them wholesale.

Aim for approximately 300–600 well-organized lines. Optimize for instructions
that will remain useful across sessions. Use concise tables and lists where
they improve scanning. Do not turn it into a changelog, marketing page, or a
copy of the README.

The root guide must explicitly say that nested `CLAUDE.md`/`AGENTS.md` files
apply in their directories and must be read before modifying those areas. It
must preserve the Next.js rule in `apps/web/AGENTS.md`: this repository uses a
new Next.js version with breaking changes, so agents must consult the locally
installed Next documentation before relying on remembered framework behavior.

## 5. Required `CLAUDE.md` content

Use a structure close to the following, improving it where the audit supports
something clearer.

### A. Mission and product principles

Explain:

- the “box for your people” concept;
- Paldora as a private living scrapbook, not an engagement-maximizing public
  network;
- the synthesis of MySpace identity, Tumblr expression, Pinterest-like visual
  organization, modern private social UX, and scrapbook nostalgia;
- core promises: private by default, no targeted ads, no manipulative ranking,
  memories remain owned by users, real relationships over reach, made to last;
- the guiding principle: **expression on the surface, discipline underneath**.

Clarify terminology:

- **Box** = a private social circle/community with members and roles;
- **Room** = a user's customizable profile, never a chat room or Box subspace;
- **Life Update** = a structured, reusable update that can have isolated
  delivery contexts in several Boxes;
- **Memory** = a derived chronological view of content the viewer can still
  access, not a copied content record.

### B. Source-of-truth order

Define how to resolve conflicts. A sensible order is:

1. current user instruction;
2. nearest applicable `CLAUDE.md`/`AGENTS.md`;
3. executable tests and security invariants;
4. current code and migrations;
5. architecture/API/security/design documents;
6. historical plans and manifests.

State that migrations already deployed are immutable and that TODO designs are
not evidence of implemented behavior.

### C. Current implementation status

Clearly state that the reference build has a production-shaped responsive web
vertical slice through Phase 7. Its Expo project is only a placeholder and is
not the target mobile architecture. Public registration remains intentionally
disabled.

Summarize the implemented functionality accurately:

1. **Foundation**
   - pnpm/Turborepo TypeScript monorepo;
   - Next.js App Router web, NestJS REST API, BullMQ worker, and an unused Expo
     scaffold that must not be carried into the greenfield architecture;
   - shared domain, validation, typed API client, auth, database, config,
     observability, storage, and UI-token packages;
   - PostgreSQL source of truth, Redis for ephemeral coordination, private
     S3-compatible storage, strict environment parsing and structured logs.

2. **Authentication, onboarding, profiles, and settings**
   - Supabase email/password authentication with secure SSR cookies;
   - sign-in, sign-out, forgot password, token-hash/PKCE recovery callback,
     password update, session refresh, and protected-route decisions;
   - administratively provisioned, preverified demo identities; a valid but
     unprovisioned Supabase identity receives `ACCOUNT_NOT_PROVISIONED`;
   - internal user UUID remains separate from Supabase `sub`;
   - no public signup, social login, or magic-link UI yet;
   - username/profile/avatar onboarding and account editing;
   - Unicode username normalization including decomposition, diacritic removal,
     locale-independent lowercase conversion, dotless-`ı` handling, reserved
     names, and database-enforced normalized uniqueness;
   - display-name, bio, avatar, reaction-preset, email-display, reset-password,
     appearance, and sign-out settings.

3. **Friends, blocks, and Boxes**
   - bilateral friend requests, accept/decline, remove friend, block/unblock;
   - blocking overrides visibility and interaction rights;
   - private Boxes with owner/admin/member roles, create/rename/archive/restore,
     invitations, joining, leaving, removal, role changes, ownership transfer,
     and owner-only permanent deletion;
   - invite accepted friends from a quick list or any provisioned username
     without forcing friendship, enabling fandom/community circles;
   - owner/admin permissions must remain exact: only the owner can transfer
     ownership or delete the Box; owners/admins have bounded member-management
     powers; an owner must transfer before leaving;
   - Box deletion removes relational content and records durable media cleanup
     before cascades.

4. **Posts, feeds, realtime, and private media**
   - chronological, cursor-paginated Box and Home feeds;
   - plain-text posts plus up to four JPEG/PNG/WebP images;
   - author-only edit and soft delete; archived Boxes are readable but reject
     publishing;
   - compact expanding composer, overflow menus, responsive isolated feed
     scrolling, accessible fullscreen media viewer, download/share, galleries,
     and multi-photo navigation;
   - authenticated SSE invalidation for Box and Home feeds; Redis events carry
     identifiers only and clients re-fetch authoritative API data;
   - fresh profile/avatar data is resolved consistently so old posts, member
     lists, and friend lists do not retain stale identity snapshots;
   - short-lived exact MIME/length signed uploads, server completion checks,
     Sharp decoding/orientation/metadata stripping, bounded WebP derivatives,
     signed reads, and durable deletion.

5. **Interactions and notifications**
   - comments and one reply level, author edit/delete, cursor pagination;
   - one reaction per user per post/comment, idempotent replacement/removal;
   - five customizable preset emoji plus arbitrary single-grapheme emoji;
   - double-click/double-tap like, a compact picker, and reselecting one's own
     reaction;
   - post-only realtime camera reactions using `getUserMedia`, private upload,
     processing, and cleanup;
   - durable activity events project deduplicated notifications; HTTP handlers
     do not directly create notifications;
   - unread counts, mark one/all read, deep links to the proper private context,
     realtime invalidation, and visibility rechecks;
   - reusable, dismissible, timed toast messages with semantic success,
     attention, and failure colors.

6. **Life Updates and Memories**
   - structured optional Life Update sections, shared photos, validation limits,
     and multiple updates per month;
   - audience is either Only Me or 1–20 distinct active Boxes and is immutable
     after publishing;
   - content/media are stored once; each Box has a separate backing delivery
     post with isolated comments/reactions;
   - Home deduplicates accessible deliveries into one card with deterministic
     Box-context tabs; Box feeds remain context-specific;
   - edits fan out timestamps/invalidation; full deletion cleans shared media
     once; deleting a Box removes only its delivery unless it was the last one;
   - Only Me updates hide interaction controls;
   - personal and Box Memories are derived, UTC year/month grouped,
     cursor-paginated, deduplicated where appropriate, and re-authorized on
     every query.

7. **Rooms and personalization**
   - authenticated Rooms at `/rooms/[username]` with owner-only customization;
   - Room visibility: friends, signed-in members, or hidden; inaccessible,
     blocked, and missing Rooms are deliberately indistinguishable;
   - Room visibility never grants access to a private Box or its content;
   - semantic shared Room tree with safe scoped variables and 14 functional
     presets: Obsidian Gold, Cream Paper, Lavender Dream, Ocean Glow, Daisy Day,
     Neon Night, Y2K Glitter, Dark Academia, Frutiger Aero, Tumblr 2014, Retro
     Windows, Cyberpunk, Minimal Editorial, and Polaroid Scrapbook;
   - one/two-column responsive layouts, widget visibility/order/placement,
     keyboard movement, reduced-motion handling, contrast fallbacks, live
     preview, explicit save, stale-save detection, and restore defaults;
   - structural identity/banner regions plus Currently, Music, Top Friends,
     Photos, Life Updates, Posts, and Memory-highlight widgets;
   - Top 4/8/12 uses accepted active friends only, has independent visibility,
     preserves ordering, and is removed atomically on friendship removal/block;
   - validated credential-free HTTPS music link card without autoplay, scraping,
     or third-party embeds;
   - private processed Room banner with authorized signed reads and durable
     replacement/deletion;
   - app Light/Dark/System appearance is separate from the Room theme;
   - desktop sidebar and mobile bottom navigation expose My Room.

8. **Operations and deployment**
   - local Docker PostgreSQL, Redis, and MinIO;
   - health/readiness probes, exact-origin CORS, CSP, security headers, request
     IDs, redacted logs, and fail-fast config;
   - demo deployment supports Vercel web, Render API/worker/PostgreSQL/Key Value,
     Supabase Auth and private S3-compatible Storage;
   - production service-role and S3 credentials are server-only; Vercel receives
     only explicitly public variables;
   - the temporary free-tier topology is a demo environment, not the target
     production architecture.

### D. Deferred and long-term product scope

Distinguish this from implemented behavior. Preserve these planned capabilities
without pretending they exist:

- public registration only after moderation/abuse controls are operational;
- Google/Apple, magic link, passkeys, MFA, sessions/devices, and login history;
- public/friends/close-friends/private post audiences, follows, and additional
  post types such as quote, link, music, poll, gallery, and milestone;
- global privacy-aware search for users, Boxes, and permitted content;
- dedicated galleries, albums, bookmarks, Pinterest-like Collections, and
  collection sharing;
- On This Day, friendship/group timelines, generated yearly recaps, milestones,
  and events;
- advanced Room personalization with scoped custom CSS and sanitized sandboxed
  HTML widgets only after a dedicated security review; arbitrary JavaScript is
  permanently prohibited;
- reporting for users/posts/comments/Boxes, moderation queue, content takedown,
  account suspension, admin lookup, and immutable audit history;
- asynchronous account deletion and portable data export;
- entitlement/storage-usage architecture, Paldora+, Stripe on web and possibly
  RevenueCat on mobile; downgrade overage must preserve existing memories while
  blocking new uploads rather than deleting content;
- privacy-respecting analytics focused on healthy Boxes and memory value, not
  addictive time-spent optimization;
- error tracking, deeper metrics/alerts, email, push notifications, and search
  indexing jobs;
- a native iOS application written in Swift/SwiftUI and a separate native
  Android application written in Kotlin/Jetpack Compose, both consuming the
  stable API after the website is release-ready;
- future end-to-end encrypted Boxes only with established protocols, client key
  management, independent review, and a separate threat model—never custom
  cryptography or unverified security marketing.

Use the original dependency order: finish and stabilize the website and backend
first, then advanced personalization only after normal Rooms are safe,
moderation/admin before public signup, and finally the two native applications
after the language-neutral API contract is mature.

### E. Architecture and dependency rules

Document the actual modular-monolith flow:

```text
Next.js web ─────────────┐
iOS (SwiftUI) ──────────┼─> versioned HTTP API ─> NestJS API ─> PostgreSQL
Android (Compose) ──────┘                                   ├─> Redis
                                                            └─> private S3 storage

                                              BullMQ worker ─> media/jobs
```

Required rules:

- PostgreSQL is canonical; Redis is disposable and must not contain the only
  copy of durable intent or private content.
- Clients never connect directly to PostgreSQL or receive storage credentials.
- API controllers are thin; services/policies own business rules; repositories
  or focused data boundaries own persistence.
- `domain` stays framework-neutral, `validation` owns shared schemas, the web
  `api-client` centralizes HTTP/auth/error handling, and shared TypeScript
  packages remain acyclic.
- Maintain a language-neutral, versioned API description such as OpenAPI as the
  contract boundary. Generate or verify idiomatic Swift and Kotlin transport
  models/clients from it where this reduces drift, while keeping domain and UI
  layers native and hand-designed.
- Web, iOS, and Android share API semantics, design-token values, terminology,
  fixtures, and conformance tests—not React components or platform UI code.
- Native applications follow their platform conventions, accessibility APIs,
  navigation, secure credential storage, lifecycle, background-task, media,
  and notification models. Do not force pixel-identical behavior where native
  conventions produce a better experience.
- Use a modular monolith until measured scaling or ownership needs justify
  extraction; do not begin with microservices.
- Use fan-out-on-read and keyset pagination initially; measure before adding
  ranking, feed fan-out, broad caching, or a dedicated search engine.
- Expensive/retryable work belongs in workers, not synchronous HTTP paths.
- PostgreSQL transactional outboxes bridge database commits to BullMQ and
  activity projection so Redis failure cannot lose durable intent.
- SSE events contain IDs/actions/timestamps only. They are invalidation hints;
  clients always re-fetch through normal authorization.

Include the reference ownership map for `apps/web`, `apps/api`, `apps/worker`,
the legacy `apps/mobile` scaffold, and every `packages/*` workspace. Define the
greenfield destination for independent `apps/ios` and `apps/android` projects,
including whether they remain in the same repository; decide this from CI,
release ownership, and developer workflow rather than assuming all code must
use pnpm/Turborepo.

### F. Data-model map and invariants

Summarize the current tables and their ownership:

- identity/profile: `users`, `profiles`, `user_preferences`;
- social/Boxes: `friendships`, `boxes`, `box_memberships`, `box_invitations`;
- content/media: `posts`, `post_media`, `media_assets`, `media_job_outbox`;
- interactions: `comments`, `post_reactions`, `comment_reactions`,
  `activity_events`, `notifications`;
- Life Updates: `life_updates`, `life_update_deliveries`, `life_update_media`;
- Rooms: `rooms`, `room_widgets`, `room_top_friends`.

Require UUID identifiers, timestamps, foreign keys, checked lifecycle enums,
partial/compound uniqueness where necessary, keyset indexes, and database
constraints as the final race-condition authority. Mention important cascade
and soft-delete choices. Make clear that image bytes never enter PostgreSQL and
that deployed migrations are immutable.

### G. Authorization and security invariants

State deny-by-default rules in forceful language. Every feature must answer and
test:

- Who may create/read/update/delete it?
- What happens for forged requests and guessed UUIDs?
- What happens after blocking, friendship removal, Box removal/leave, archival,
  post deletion, account suspension, or Room visibility change?
- Which resource absence and denial responses must be indistinguishable?

Include these non-negotiables:

- authentication never implies authorization to a Box/resource;
- verify Supabase issuer, audience, signature, and expiry; map `sub` to the
  separately provisioned internal user;
- server-side authorization on every read and mutation, including realtime
  delivery and signed media reads;
- block in either direction overrides social access and notification visibility;
- a visible Room never widens content access;
- stable non-leaking errors such as `POST_NOT_FOUND`, `BOX_NOT_FOUND`, and
  `ROOM_NOT_FOUND`;
- private buckets, short-lived signed URLs, exact MIME/length completion checks,
  image decoding limits, metadata stripping, and durable cleanup;
- exact-origin CORS, restrictive CSP, HTTPS, secure SSR cookies, safe recovery
  redirects, request IDs, safe public errors, and no stack traces in production;
- no private post bodies, tokens, cookies, passwords, credentials, signed URLs,
  or private image data in logs/analytics/events;
- distributed rate limits for abuse-sensitive mutations; security limits fail
  closed where the current design requires it;
- never expose Supabase service-role or S3 credentials to web, iOS, or Android
  bundles;
- no arbitrary HTML/CSS/script in the current Room model and never arbitrary
  JavaScript;
- never implement custom cryptography.

### H. API, validation, and errors

Record `/api/v1` versioning, bearer authentication, typed request/response
contracts, Zod validation, consistent error envelopes, bounded list sizes,
opaque timestamp/UUID cursors, partial server-authoritative updates, idempotent
state-setting operations, and optimistic concurrency for Room updates.

Point to `docs/api.md` and controllers for the exhaustive endpoint list. Explain
that any new endpoint requires:

- domain DTOs;
- shared validation;
- typed API-client method;
- explicit policy and stable errors;
- transaction/constraint design;
- unit/integration/authorization tests;
- documentation.

### I. UI/UX and component architecture

Capture the brand system:

- Obsidian Ink, Antique Gold, Champagne, Warm Ivory, Soft Lavender;
- editorial serif for major brand moments, clean sans for functional UI;
- subtle stars/sparkles, open-box symbolism, Polaroids, paper, tape, postcards,
  and scrapbook fragments;
- premium and nostalgic, never generic SaaS, corporate blue, childish, crypto,
  an Instagram/TikTok clone, excessive glassmorphism, or decoration that harms
  usability.

Require desktop and 390px behavior, keyboard access, visible focus, labels,
semantic HTML, WCAG AA contrast, 44px touch targets, reduced motion, safe-area
handling, honest loading/empty/error/inaccessible/deleted states, and no fake
data that suggests a feature exists when it does not.

Preserve component rules:

- route files load data and compose sections;
- repeated product rendering belongs in `app/components`;
- stateless server-compatible primitives belong in `app/components/ui` and are
  exported through its index;
- search before creating; extract a pattern at its second genuine use;
- keep Server Components by default and place `'use client'` at the smallest
  interactive boundary;
- reuse established components for identity, overflow menus, uploads, feeds,
  comments, reactions, notifications, media viewing, Life Updates, Memories,
  Rooms, forms, feedback, and toasts;
- keep trusted navigation/privacy/account actions outside Room theme scope;
- mobile navigation must provide a direct My Room path; Box creation remains
  available on the Boxes page.

### J. Coding and refactoring standards

Preserve the strict rules already enforced:

- strict TypeScript; no undocumented `any`;
- no duplicate imports, circular workspace dependencies, business rules in
  React, god services/components, or service-locator shortcuts;
- production complexity at most 15, nesting depth at most 4, functions at most
  150 nonblank/noncomment lines, at most 5 parameters, and no sequential
  `await` loops without a documented protocol reason;
- prefer maps/sets/indexes and batched database operations over accidental
  nested loops or N+1 queries;
- focused files and functions, explicit domain language, dependency injection,
  immutable data where useful, and transactions for multi-step invariants;
- preserve unrelated user work in dirty worktrees; do not use destructive Git
  commands or rewrite deployed migrations;
- no speculative abstraction: reuse first, extract on demonstrated repetition,
  and keep abstractions aligned to actual domain ownership;
- update the component catalog and relevant docs when architecture changes.

Add these modern engineering expectations:

- choose maintained, stable dependencies and pin supported runtime/toolchain
  ranges; introduce a dependency only when its value exceeds its maintenance,
  bundle, security, and lock-in cost;
- model domain states so invalid states are difficult to represent; validate at
  trust boundaries and enforce critical invariants again in PostgreSQL;
- design mutating APIs for retries using transactions, idempotency keys or
  natural uniqueness, and explicit optimistic concurrency where appropriate;
- avoid hidden global state, time-dependent tests, unbounded queries, offset
  pagination for growing feeds, N+1 access patterns, and network calls inside
  open database transactions;
- use structured logs, request and job correlation IDs, bounded retries with
  backoff/jitter, dead-letter handling, health/readiness checks, and actionable
  metrics without logging private content;
- meet WCAG 2.2 AA where applicable, test keyboard and screen-reader semantics,
  respect reduced motion and data preferences, and treat mobile behavior as a
  first-class product rather than a scaled desktop page;
- establish performance budgets and measure before optimizing; profile queries,
  rendering, bundles, and media instead of guessing;
- document consequential decisions as ADRs, including rejected alternatives and
  revisit triggers, so future agents do not repeatedly relitigate them.

### K. Working method for future Claude sessions

Instruct future agents to:

1. read applicable instructions and canonical docs;
2. inspect current code/tests before proposing changes;
3. identify the feature's authorization matrix, data invariants, and failure
   modes before implementation;
4. make the smallest coherent plan in dependency order;
5. reuse or extend shared contracts/components rather than duplicate them;
6. implement database/API/client/UI/worker changes as one vertical slice;
7. communicate concise progress during long-running work;
8. verify proportionally to risk and report exact commands/results;
9. update docs/design manifest only when the implementation supports the claim;
10. stop for user direction before external billing, public launch, destructive
    production operations, or scope-changing product decisions.

For reviews/diagnosis, do not mutate code unless asked. For implementation,
finish and verify the requested slice rather than returning only a plan.

### L. Phase order for a greenfield rebuild

Define release-gated milestones. Use the existing product as a behavioral
reference, apply the approved greenfield decisions, and rebuild one verified
slice at a time:

0. foundation, local infrastructure, CI, docs, health, logging;
1. Supabase auth, administrative provisioning, profiles/onboarding/avatar;
2. friendships, blocking, Boxes, invitations, roles and lifecycle;
3. posts, chronological feeds, realtime invalidation;
4. private media pipeline, worker, transactional outbox and hardening;
5. comments/replies, emoji/camera reactions, durable notifications;
6. multi-Box Life Updates and derived Memories;
7. Rooms, 14 themes, Top Friends, widgets, banner/music and app appearance;
8. advanced personalization only after security review;
9. moderation/admin, reporting, audit, account lifecycle/export, signup gate;
10. iOS application in Swift/SwiftUI, delivered as a complete native client
    against the stable versioned API;
11. Android application in Kotlin/Jetpack Compose, delivered as a separate
    complete native client against the same contract;
12. later discovery/collections/premium/recaps only after their dependencies and
    privacy models are explicit.

Each milestone gets its own migration/API/UI/tests/release checkpoint. Do not
attempt the entire app in one generation. Public registration stays disabled
until Phase 9 abuse and moderation controls pass their release gate.

The iOS and Android phases must each include native architecture, secure token
storage and refresh, networking/error mapping, deep links, media capture/upload,
realtime reconnect behavior, push-notification readiness, accessibility,
offline/poor-network states, platform-specific UI tests, beta distribution, and
store privacy/compliance preparation. Do not begin them merely to mirror screens
while the web/API behavior is still changing rapidly.

### M. Testing and definition of done

Require unit, integration, authorization, API, worker, and Playwright coverage.
Privacy tests are first-class: test unrelated users, blocked users, former Box
members, guessed IDs, deleted content, archived Boxes, concurrent writes,
reconnects, storage failures, and cleanup retries.

Preserve standard gates:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Add clean-database migrations, integration/worker tests, hosted Supabase tests,
desktop and 390px Playwright, accessibility checks, client-secret scans, and
real provider smoke tests when relevant. Tests must never use production data.
For native phases, add Swift unit/integration tests and XCUITest on supported iOS
targets, plus Kotlin unit/integration and Compose UI/instrumentation tests across
supported Android API levels. Add contract-conformance tests so web, iOS, and
Android interpret authentication, cursors, errors, and DTO evolution identically.

A feature is done only when schema/constraints, migration, API, authorization,
validation, typed client, responsive UI, loading/empty/error states, tests,
observability, security review, and documentation are complete. Availability
checks remain advisory; database constraints resolve races.

### N. Environment, deployment, and operations

Document local startup and environment validation without embedding secrets.
Explain public versus server-only variables and point to `.env.example` and
`docs/deployment.md`. Preserve release order: verify/backup, apply compatible
migrations, deploy API/worker, deploy web, smoke test, then remove obsolete
schema in a later expand/contract release.

Note that provider pricing/free-tier behavior is time-sensitive and must be
checked against current official documentation before making hosting claims.
Production requires durable PostgreSQL backups, a Redis `noeviction` policy for
BullMQ, durable private object storage, TLS, secret management, metrics/alerts,
and tuned connection/worker budgets. The temporary Render free-tier topology
must not be described as production-grade.

## 6. Validate the resulting guide

After writing `CLAUDE.md`:

1. Re-read it as if you were a new Claude session with no chat history.
2. Confirm it distinguishes implemented reference behavior from future plans.
3. Confirm all major product areas above are represented.
4. Confirm it has no secrets, real account data, provider credentials, or
   environment-specific project URLs.
5. Confirm it does not contradict code/tests on authorization, ownership,
   visibility, deletion, media, realtime, or Room behavior.
6. Confirm it explicitly identifies implementation choices that should be kept,
   improved, replaced, or deferred, with evidence and tradeoffs.
7. Confirm recommendations use current official guidance where facts are
   version-sensitive and do not present personal preference as best practice.
8. Confirm links and paths are real.
9. Run formatting/checks appropriate for a Markdown-only change and inspect
   `git diff --check`.
10. Do not claim tests were run if they were not.

In your final response, report:

- the skills you used and why;
- the created `CLAUDE.md` path;
- the repository areas you audited;
- the most important architectural/product decisions captured;
- the most important Keep/Improve/Replace recommendations and their rationale;
- any contradictions or stale documentation found;
- validation performed;
- the recommended first greenfield implementation milestone.

Remember: this task creates the durable operating manual for rebuilding
Paldora. It does not start the rebuild itself.

---

## End prompt
