# Firebase rewrite execution tracker

Status: **Firebase-only local web cutover implemented; hosted release remains gated**. Started
2026-10-22. The current work order is the user's complete local migration plan:
server-only Next.js access through `@paldora/firebase-trusted`, Auth session
cookies, Firestore, private Storage and local Functions. The older hosted rewrite
plan and native direct-client prototype remain useful history, but their hosted
phase gates and direct-client web architecture are superseded for local work.
The removed HTTP API is retained only as historical behavior in `legacy/` and the
parity documents. Public signup stays disabled and `paldora-dev` stays on Spark.

## Current local workstream

| Phase                                     | Status           | Evidence and next gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Parity contract                        | Complete         | `parity-matrix.json` covers all 90 canonical API contract routes, including liveness/readiness (89 HTTP-decorator routes plus one SSE route). The earlier 92 estimate was inaccurate. The original route crosswalk was verified against 89 typed-client methods, the direct SSE transport, and eight worker workstreams before the old client was retired. `pnpm firebase:parity:check` now rejects legacy runtime imports and old workspace services. The route registry owns validation schemas; the matrix records domain web surfaces, reference suites, replacements, and acceptance criteria. Both direct web transports are tracked. Generated `route-crosswalk.md` and `route-boundaries.json` record exact web call sites, contract access, validation schemas, route summaries, errors and media boundaries for all 90 routes. Each route now also links to its API controller handler, principal injection and called service in `route-boundaries.json` and `route-crosswalk.md`; the checker fails if a protected handler loses its principal or a handler loses its service boundary. Domain acceptance tests are assigned for every route. Replacement behavior remains subject to its later phase gate.                                                                                                                                                                                                                                                                                                                |
| 2. Foundation and identity                | Complete         | Admin-only web adapter and tested seven-day Auth session-cookie service exist. Trusted provisioning, profile/onboarding, username and preferences have emulator coverage. Reauthenticated password changes and email-link recovery reset rotate the session epoch; emulator tests cover old-cookie rejection. Firebase-mode web sign-in, onboarding and logout pass desktop/mobile browser tests; unadmitted and suspended sign-in is denied. Explicit origin checks exist on Firebase web actions. Desktop/mobile password-reset, stale-cookie and cross-origin Server Action checks pass, and the Admin-marker bundle scan passes. Firebase-mode account profile, appearance, reaction settings and reauthenticated password change work locally. The 12 desktop/mobile browser checks pass. Avatar upload and account lifecycle controls belong to Phases 5 and 7, respectively.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3. Relationships and Boxes                | Complete         | Trusted friendship requests with direction-specific decline/cancel/removal, username-resolved block listing/mutation, recipient and sender invitation views, members and Box lifecycle services exist locally. Invitation acceptance and listings recheck the inviter's active account and current owner/admin membership. Box deletion closes reads, records a durable job, detaches Life Update deliveries, removes only linked feed/notification pointers, closes reports, and cleans invitations, hints and descendants in retryable steps. The desktop/mobile browser path passes invitation acceptance, friendship, block/unblock, archive/restore, pre-join 404, ownership transfer and empty-Box deletion. The deletion worker and scheduled repair both retire private Box objects from Storage before removing metadata; real Storage, failure/retry, block/unblock, and deletion browser checks pass. A local repair command handles jobs beyond one request. Transfer-versus-deletion and removal race tests, failed-cleanup repair, media retirement and no-orphan-reference checks pass in emulators. Large-scale cleanup throughput remains a Phase 5/load gate.                                                                                                                                                                                                                                                                                                                                                        |
| 4. Content, feeds, Memories and Rooms     | Complete locally | Trusted text posts, threaded comments and emoji reactions, canonical text Life Updates, ID-only Home references, UTC Memories, and versioned Rooms/personalization are wired to Firebase web mode. Comment roots and active replies page separately, deleted roots retain tombstones, and linked comments open a pinned thread. Room reads recheck account, membership, blocks and content state. Memories pages use one bounded source window per request (up to 50 Box candidates, 320 Home references, and 20 own updates), preserve same-timestamp cursor order, and can advance through empty hidden-heavy batches. Year/month source queries start and stop at UTC boundaries; sparse Room histories query author-indexed feed hints and verify the canonical author. The Firebase calendar deliberately uses navigable year/month links without exact count badges, which would require an unbounded live visibility scan; the old API view retains its count badges. Trusted Auth/Firestore integration passes 62 tests, including hidden-heavy Box and Home windows, 35-Box Home pagination and live Room revocation. The 14 desktop/mobile Firebase browser checks pass, including delivered Life Update conversations, Room and personal Memories, month-page accessibility and 390px overflow, and Box deletion. All five local Functions flow checks pass, including feed projection and repair. Media-backed content and photo previews belong to Phase 5; hosted performance/cost validation remains separate on Spark. |
| 5. Media and durable work                 | Complete locally | Trusted Auth/Firestore/Storage suite passed 70/70 before the final targeted changes; the media suite then passed 13/13, covering invalid bytes, worker claims, retry, orphan sweep, dead-letter replay, expiry, takedown, and delete/process races. Functions flow passed 5/5 with task dispatch and Pub/Sub repair functions initialized. Desktop/mobile browser suite passed 18/18, including private post photos, Life Update photos, avatar, Room banner, camera capture and old-route retirement. Hosted deny-all rules passed. Hosted IAM, queue timing, cost/load and object retirement remain separate on Spark.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6. Notifications, realtime and moderation | Complete locally | Canonical comment/reaction transactions write ID-only activity intents; Functions and web project deduped recipient notifications, and every list/count/open rechecks live Box, post, comment/reaction, actor, block and account state. Same-origin SSE rechecks the session and account every five seconds, expires after 45 seconds, reconnects with a polling refresh fallback, and carries opaque hints only. Trusted user/Box/post/comment reports, private receipts, staff queue/case audit, exact-ID administrator lookup, hide/restore/suspend/unsuspend, owner notices, 90-day evidence redaction and Box cleanup are wired to Firebase web mode. Post takedown closes reads before draining durable media retirement and only reports success after objects are gone; restoration requires new media processing. Full trusted suite passed 77/77 before final targeted additions; final focused media/moderation/notifications/Box-cleanup suite passed, Functions flow 5/5, full desktop/mobile browser suite 20/20, expanded Phase 6 desktop/mobile journeys 2/2, hosted deny-all rules, lint, typecheck, build, parity checker and client-bundle scan passed. Hosted timing and IAM remain a later release gate.                                                                                                                                                                                                                                                                                                          |
| 7. Export and account deletion            | Complete locally | `NativeAccountLifecycle` writes private `paldora-json-v1` archives, expires them after seven days, and streams same-origin downloads after fresh session checks. Password reauthentication, Box ownership guard, exact seven-day cancellation, account freeze, Auth revocation, generation-tagged resumable erasure, media retirement and orphan cleanup are wired into web and scheduled Functions. Fault-injection, media, expiry, and desktop/390px browser tests pass. Hosted timing, cost, IAM and load remain a release gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 8. Web cutover and cleanup                | Complete locally | All active web routes and actions use the server-only Firebase data layer. Supabase callback, HTTP API client, old service applications and their database, Redis and S3 packages were removed from the active workspace. Same-origin SSE, media and export handlers remain. The Firebase desktop/390px browser suite passed 22/22 after cutover. CI now runs the emulator suites and a static legacy-runtime import check. Hosted validation and public signup remain separate gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

The local gate is a clean checkout running Auth, Firestore, Storage, Functions and Pub/Sub
emulators plus the web app, completing every user and moderator flow without
external services. Hosted IAM, task timing, costs, backup/restore, abuse, media
retirement and release remain separate; no billing or deployment is authorized.

**Local verification (2026-10-25):** format, lint, typecheck, unit tests,
design tokens, Firebase-only parity, build, and browser-bundle secret scan
passed. Demo-emulator rules, prototype, native rules, Functions, and trusted
integration suites passed; the trusted suite has 85 tests, including a
125-record paged export. The production-build desktop/390px browser suite
passed in the working tree and again from an isolated source copy without its
build caches or private `.env`. The copy installed the pinned lockfile, built,
passed the Firebase-only check, and passed the client-bundle scan. A Git-based
clean checkout can be repeated after these still-uncommitted changes are saved
to version control; no deployment or signup gate was changed.

For the current local backend, run `CI=true pnpm firebase:local:dev` in one
terminal. It builds Functions and starts all four emulators against
`demo-paldora`; Storage client rules are deny-all. For the current Firebase web slice, run `CI=true pnpm firebase:web:local:test`; it builds and tests the app against the four demo emulators. A pending Box deletion can be advanced with `GCLOUD_PROJECT=demo-paldora FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 CI=true pnpm firebase:box-repair:local` while emulators run. Export and deletion repair are documented in [account-lifecycle.md](account-lifecycle.md). The active workspace is Firebase-only; `legacy/` remains frozen.

Each phase needs reviewable changes, test evidence and an explicit gate result.
A phase is **done** only when every listed acceptance condition passes locally.
Experimental code must not be wired into production paths just because an
emulator test passes. Commits and pushes require separate user authorization.

## Historical hosted/direct-client tracker (superseded for local order)

The checklist below records earlier prototypes and hosted prerequisites. Use the
current local workstream above to decide the next implementation and gate.

### Phase 0 — discovery and hard-query proof (in progress)

- [x] Inventory current schema and API routes; record preservation rules.
- [x] Pin Firebase CLI, configure disposable local emulators and deny-all
      Firestore/Storage rules. Verify anonymous requests are rejected.
- [x] Isolate a Firestore Box-ownership transaction prototype and exercise
      create, transfer, read denial, and transfer/removal concurrency in emulator.
- [x] Extend Box transaction prototype with owner/admin role policy, transfer
      demotion, leave/remove states, archive admission, returning-member reset,
      and concurrent role-change checks (10 emulator tests across P1/P2).
- [x] Build an isolated direct-client Box creation/read slice with Firebase
      client SDK, atomic owner membership and private Box-ID hint, active-account
      rules, and emulator privacy tests. Native rules stay local; hosted rules
      remain deny-all until full parity is proven.
- [x] Add an atomic direct-client ownership transfer with active-successor,
      partial-write, suspended-account, and competing-transfer emulator tests.
- [x] Add direct-client role changes, member removal and leave with current
      owner/admin policy, immediate read revocation and transfer/removal race
      tests. Invitations and deletion remain closed.
- [x] Add owner-only Box rename and archive/reopen with versioned writes; reject
      forged ownership changes and member changes while archived.
- [x] Prototype trusted invitation send/accept against native Box collections
      with block-pair transaction reads and direct-client deny rules. Callable
      Auth binding, username resolution, rate limits and block lifecycle remain
      open.
- [x] Add a trusted block-pair epoch prototype so block/unblock cannot revive
      a previously pending invitation; new invitations can be sent after an
      unblock. Full block effects and invite listing still need design.
- [x] Resolve invitation recipients by normalized username and recheck the
      trusted username mapping in the Firestore transaction. Client rules deny
      direct reads and writes to the mapping.
- [x] Add trusted transactional username reservation and rename with normalized
      uniqueness, collision tests, and suspended-account denial. Hosted calls
      remain open.
- [x] Prototype trusted account provisioning against the Auth emulator:
      verified, enabled, operator-admitted Auth users only; no silent suspension reversal; status
      write before refresh-token revocation. An Auth-bound local callable now
      provisions only already-created, Admin-admitted verified users; unverified or unadmitted users cannot
      create Boxes. Web sessions and live account migration remain open.
- [x] Add trusted invitation decline and manager revocation with an
      accept/revoke race test. Invitation listing remains open.
- [x] Extract trusted account, username, block and invitation transactions into
      `packages/firebase-trusted`; expose invitation and username operations
      through Auth-bound local callable Functions. An emulator flow now proves
      two verified users can provision accounts, create a private Box, invite by
      username, accept, and gain member read access. Unauthorized and anonymous
      callable requests are rejected. Hosted deployment and web switching remain
      pending.
- [x] Add a bounded, cursor-based recipient invitation listing callable with
      current account, Box, expiry, and block-epoch checks. The Firestore query
      uses a declared composite index and returns no items to other accounts.
      Sender-side listing and web integration remain open.
- [x] Prototype trusted text-only Box posts with Auth-bound create/get/list/edit/
      soft-delete callables, current member/account checks, block-aware reads,
      and bounded candidate pagination. Direct client post documents remain
      denied. This does not yet cover media, comments, reactions, Life Updates,
      feed merging, moderation, abuse limits, or web integration.
- [x] Bind local block/unblock calls to Firebase Auth and exercise immediate
      block-aware post hiding. Full friendship teardown, notification invalidation,
      and all content-type block semantics remain open.
- [x] Add trusted local text comments (one reply level, author edit/soft delete,
      block-aware listing) and one-emoji-per-user reactions on posts or comments.
      All reads recheck the parent post and member access. Camera reactions,
      interaction summaries, notifications and web UI remain open.
- [x] Add trusted friend-request send, incoming/sent/accepted listing,
      acceptance, cancellation/decline and removal. Blocking closes the pair's
      pending or accepted friendship in the same transaction; unblocking does
      not restore it. Auth-bound local callables and a private-document denial
      test cover the flow. Room visibility and web integration remain open.
- [x] Add a bounded trusted Box member list for active members. It rechecks
      current Box/member/account and block state for each candidate, excludes
      blocked or inactive members, and rejects nonmember callers. Direct
      collection listing remains denied by rules.
- [x] Add per-account, per-action Firestore fixed-window limits to every local
      callable and test concurrent calls at the boundary. This closes the
      current local callable abuse hole; hosted cost/contention, endpoint limit
      parity, expiry cleanup and edge/IP controls remain open.
- [x] Prototype text-post reporting and staff-only review/hide callables.
      Reports remain inaccessible to clients; staff grants are trusted-only;
      hiding updates the post and writes an audit entry in one transaction.
      A bounded trusted maintenance method redacts reporter identity and reason
      90 days after closure. Media retirement, scheduling, appeal/contact and full
      report-target parity remain open.
- [x] Prototype a bounded 31-Box Home feed query with chunking, Life Update
      dedupe, cursor safety and an explicit high-membership budget failure.
- [ ] Complete P1 parity: invitations, roles, leave/delete, suspended accounts,
      and full existing Box race matrix; benchmark contention and write cost.
- [ ] Prototype P2 Home feed with >30 memberships, block-heavy and hidden-heavy
      pages, Life Update dedupe, bounded candidate reads, and stable cursors under
      concurrent changes and hosted cost measurements. The initial emulator
      prototype covers only part of this gate.
- [ ] Prototype P3 Memories and Room previews, including year/month summaries
      under membership/block/moderation changes.
- [ ] Prototype P4 reports, audit, takedown failure, and retention.
- [ ] Measure 10k/100k-post fixtures in emulator and disposable billed staging;
      record Query Explain, p50/p95, index/read/write cost and a decision for the
      provisional 200-candidate/10-query typical-page target.
- [ ] Review privacy matrix and costs; publish a Firestore go/no-go ADR.

**Exit gate:** all four query prototypes have bounded behavior and their
authorization outcomes match current integration tests. No production data
migration or API switch before this gate.

**Architecture adjustment:** prefer direct Firebase SDK access when the rules
and queries prove the same authorization semantics. Use Firebase Functions for
the operations that require trusted code. The old HTTP API is a migration
source, not a mandatory target service. The Phase 1–7 API references below
remain a behavior checklist and will be rewritten per vertical slice.

## Phase 1 — Firebase foundation (pending Phase 0)

- [x] Create `paldora-dev` under the project owner's Google account; provision
      the default Standard Firestore database in `europe-west4` and deploy the
      repository's deny-all Firestore rules. The repository has a `dev` alias
      and no default project alias.
- [ ] Select one supported EU region and create separate dev, staging, and
      production projects with named billing owner, budgets, alerts, and IAM.
- [ ] Add pinned Admin SDK/server adapter package, Firestore collection and
      index manifests, data migration versioning, and local emulator test harness.
- [ ] Add App Hosting monorepo build for Next.js and a Functions v2 API build
      for the versioned HTTP contract. Validate pnpm/Node version and cold starts.
- [ ] Configure Secret Manager, separate service accounts, private Storage,
      deny-all direct client access, and CI that cannot deploy to production.
- [ ] Publish `collections.md` with every SQL field, key, uniqueness rule,
      cascade/retention behavior, query/index, and reconciliation query.

**Exit gate:** disposable staging deployment of health/contract endpoints,
least-privilege/IAM review, and clean emulator CI. Public signup stays off.

## Phase 2 — identity and sessions (pending Phase 1)

- [ ] Provision Firebase Auth users without public signup; preserve internal
      UUIDs using a transactional `authLinks/{uid}` mapping.
- [ ] Replace Supabase token verification, SSR cookies, recovery and password
      flows with Firebase equivalents; implement secure HttpOnly web sessions.
- [ ] Recheck account status and token revocation on every API request and
      stream heartbeat. Preserve non-enumerating errors and suspension behavior.
- [ ] Migrate auth/onboarding/settings tests and model password-hash import or
      reset migration for any real users found before cutover.

**Exit gate:** current identity/security E2E and API suites pass on Firebase
staging; no user is silently reprovisioned or granted access.

## Phase 3 — relationships and Boxes (pending Phase 2)

- [ ] Replace prototype with production repositories/services for friendship,
      blocks, invitations, Box lifecycle and roles.
- [ ] Carry over one-owner/ownership-transfer invariant, non-leaking 404s,
      block semantics and simultaneous-operation tests.
- [ ] Reconcile every migrated Box/member/invitation against the SQL source if
      a live data migration is required.

**Exit gate:** current Box and social integration matrices, adversarial races,
and browser flows pass with Firebase as the one canonical backend.

## Phase 4 — content, feeds, Rooms and Memories (pending Phase 3)

- [ ] Move posts/comments/reactions, then Life Updates, feeds, Memories, Rooms
      and personalization in vertical slices. Keep the OpenAPI contract stable.
- [ ] Enforce current access at read time; no stale materialized feed copy may
      authorize content. Preserve UTC windows, dedupe, keyset semantics and Room
      preview filtering.
- [ ] Run hosted performance/cost tests after each slice, including large and
      hidden-heavy Boxes.

**Exit gate:** full content/privacy E2E suite and query budgets pass.

## Phase 5 — private media and durable work (complete locally)

- [x] Add `nativeMediaAssets` records with a lifecycle epoch, private Storage
      paths, upload expiry, attachment IDs and three Sharp WebP derivatives.
      The same-origin upload route checks session, origin, exact type/length and
      decoded bytes. The same-origin read route rechecks source visibility and
      returns `private, no-store`; it never issues a Firebase download URL.
- [x] Wire post, Life Update, avatar, Room banner and camera-reaction images to
      trusted attachment transactions and Firebase-mode web forms. Deletion,
      replacement, Box deletion and moderation hide close reads before retiring
      objects. Raw uploads are removed after successful processing.
- [x] Store process/delete and post-cleanup intents in Firestore. A task
      Function dispatches new media jobs, and a scheduled Function repairs
      pending/stale jobs and expires unattached assets. Workers use leases,
      epochs and unique attempt paths. After five failed attempts a media job
      enters `dead`; `pnpm firebase:media-repair:local -- --retry JOB_ID` is the
      operator replay path in a disposable emulator.
- [x] Rerun the local Auth/Firestore/Storage integration suite (70 tests),
      Functions flow with task and Pub/Sub emulators (5 tests), desktop/mobile
      browser suite (18 tests), and hosted deny-all rules check. The browser
      suite exercises task dispatch, private post-photo routes, deletion,
      Life Update photos, avatar and Room banner uploads.
- [x] Fault-inject a failed derivative write before Firestore publication and
      deletion racing a running processor. The focused media emulator suite
      passes 13/13 tests, including orphan sweeping, the losing processor's
      durable job state, moderator takedown, pending repair, expiry and
      dead-letter replay. The browser suite uses a fake camera device to test
      capture, upload, private read and retirement after emoji replacement.
- [ ] Verify task dispatch, retry timing, IAM, object retirement, cost and
      throughput in hosted staging after a billing/deployment decision. Spark
      and hosted deny-all rules remain unchanged.

The local runbook is `docs/firebase/media-local.md`. Notification realtime
and user-scoped abuse controls belong to Phase 6 of the complete migration.

## Phase 6 — moderation, export and deletion (next local phase)

- [ ] Move reports, audited staff grants/case actions, hidden-content notices,
      and moderation retention without exposing reporters or case evidence.
- [ ] Rebuild private JSON export and seven-day deletion with Box-transfer
      prerequisite, exact deadline and resumable object/Auth/data erasure.
- [ ] Validate 90-day closed-case redaction with reversible active enforcement.

**Exit gate:** Phase 9 API/browser/worker fault tests pass on hosted staging.
Public signup remains off until staffing, abuse operations and the external
appeal email exist.

## Phase 7 — migration and release (pending Phases 0–6)

- [ ] Confirm whether any real data exists. If so, rehearse Auth hash/reset,
      snapshot/transform/import/reconciliation, media hashes, pending jobs,
      rollback and write-freeze cutover. Never dual-write without a designed
      protocol.
- [ ] Test backup restore, IAM break-glass, logs, metrics, budgets, alerts and
      the entire hosted privacy/abuse/deletion smoke list.
- [ ] Obtain owner review of the hosting and moderation operating model, staff
      coverage, appeal contact, and signup gate.
- [ ] Decommission old services/secrets only after a separate review and
      reconciliation window.

**Exit gate:** Firebase is canonical, hosted checks and restore drills pass,
and public signup is activated only by a separate owner decision.

## Current implementation notes

The development Firebase project is `paldora-dev` (display name **Paldora
Development**). Its default Firestore database is in `europe-west4`, a location
supported by Firestore, Functions v2, and App Hosting. Client reads and writes
are denied by the deployed `firebase/firestore.rules`. No app backend, Storage
bucket, Auth sign-in provider, staging/production project, or public signup has
been enabled. The project is for controlled development and Phase 0 hosted
query checks only. App Hosting and Cloud Storage require a linked billing
account; billing owner, budgets and alerts remain Phase 1 prerequisites.
The owner explicitly chose to keep `paldora-dev` on the free Spark plan for now
(2026-10-22). Do not link billing or upgrade to Blaze as part of migration work
without a later owner instruction. Local emulators and the Firestore free quota
remain available; hosted App Hosting, Cloud Storage for Firebase and related
paid-plan checks wait until that decision changes.

`packages/firebase-prototype` is deliberately isolated. Its `BoxOwnershipPrototype`
uses `prototypeBoxes/{id}` plus deterministic
`prototypeBoxMembers/{boxId_userId}` documents. A Box `ownerId` is the one
authoritative owner pointer; a Firestore transaction changes that pointer and
both role documents together. The emulator tests cover one-owner and race
behavior but **do not yet prove** full Box parity, query cost, production IAM,
or hosted latency. The prototype collection names must not become production
names without the Phase 1 collection review.
The role/leave/archive tests cover more of the current Box policy, while
invitations, block-pair serialization, deletion with content cleanup, account
suspension, and hosted contention measurements remain open P1 work.
Its `HomeFeedPrototype` proves one bounded chunk-and-merge path for 31 Boxes,
while deliberately refusing a high-membership page whose scan budget cannot
preserve pagination safety. It accepts a test-supplied blocked-author set and
therefore does not yet establish full privacy parity or hosted cost.
