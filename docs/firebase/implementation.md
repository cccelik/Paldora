# Firebase rewrite execution tracker

Status: **in progress, Phase 0**. Started 2026-10-22. This tracker is the
implementation order for [the complete rewrite plan](../plans/firebase-rewrite.md)
and [the Firebase-native architecture decision](native-architecture.md).
The existing backend remains the
source of truth until a phase's exit gate passes. Public signup stays disabled.

Each phase ends with a reviewable commit, test evidence, and an explicit
go/no-go note. A phase is **done** only when every listed acceptance condition
passes in the relevant environment. Experimental code must not be wired into
production paths just because a local emulator test passes.

## Phase 0 — discovery and hard-query proof (in progress)

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

## Phase 5 — media, jobs, realtime and abuse (pending Phase 4)

- [ ] Replace S3 with private Cloud Storage grants and Sharp processing tasks;
      preserve metadata removal, raw retirement and immediate takedown semantics.
- [ ] Replace Redis/BullMQ/outboxes with durable Firestore intent, Cloud Tasks
      and scheduled repair jobs; prove retries, idempotency and dead-letter alerts.
- [ ] Replace realtime hints without private payloads; enforce current
      membership, block and suspension on delivery.
- [ ] Implement user-scoped fail-closed rate limits and load-test contention.

**Exit gate:** fault-injection, signed-URL retirement, stream and abuse suites
pass in staging and do not expose private objects.

## Phase 6 — moderation, export and deletion (pending Phase 5)

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
