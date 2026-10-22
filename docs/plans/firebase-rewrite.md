# Complete Firebase rewrite plan

Status: implementation started at Phase 0 on 2026-10-22; the Firestore
go/no-go decision and production deployment remain open. See
[the discovery record](../firebase/discovery.md). Public signup remains
disabled. Phase-by-phase progress is in
[the execution tracker](../firebase/implementation.md). This plan replaces the current
Supabase Auth + PostgreSQL + Redis + S3-compatible storage + NestJS/BullMQ
deployment with a Firebase/Google Cloud project. It preserves Paldora's product
semantics, privacy promises, and web experience. It is a rewrite, not a deployment
configuration change.

## Executive decision

Use Firebase Authentication, Cloud Firestore, Cloud Storage for Firebase,
Firebase App Hosting, Cloud Functions for Firebase, Cloud Tasks, and Cloud
Scheduler. These are **multiple managed products in one Google Cloud/Firebase
provider**, not one runtime or one billable service. Firestore is the canonical
store; do not retain Cloud SQL/PostgreSQL, Redis, BullMQ, Supabase, or S3 in
the target architecture. Keep a narrow server-owned HTTP API for web and
future Swift/Kotlin clients. It may run as Cloud Functions v2 HTTP handlers;
App Hosting runs only the Next.js web app. Keep `contracts/openapi.json` and
the Zod/domain packages as the language-neutral contract and business-rule
sources where still applicable.

**Go/no-go at the end of the discovery spike:** benchmark the Box membership,
Home feed, Memories, and moderation authorization designs against real
fixtures. If privacy-equivalent Firestore queries require unbounded reads,
large fan-out, or brittle access copies, stop and consider a single-provider
Google Cloud design with Cloud SQL instead. That alternative consolidates the
vendor but is not the complete Firebase rewrite described here.

## Current baseline and fixed behavior

The source of truth is current code, tests, and `CLAUDE.md` security invariants,
not this plan if they disagree. Current workspaces include a Next.js 16 web
app, a NestJS REST API (roughly 65 controller/service files), a BullMQ worker,
PostgreSQL schema/migrations, Redis rate limits and realtime hints, Supabase
email/password auth, private S3-compatible media, and a versioned OpenAPI
contract. There is no staging or production deployment yet. Phase 9 has a
seven-day deletion cancellation period, 90-day closed-case evidence retention,
immediate media-object retirement on takedown, Box transfer before account
deletion, and private JSON export. Keep all of these.

Also preserve: private-by-default access; blocked/missing resources returning
indistinguishable results; exactly one Box owner; atomic Box transfer; Life
Update content stored once with per-Box conversation contexts; chronological
feeds and derived Memories; author identity read fresh; one reaction per target
and person; two-level comments; Room visibility, personalization sanitization,
and stale-save protection; revocable suspension on every read and stream;
reporter anonymity; audit trails; no public signup until hosted gates pass.

## Scope and exclusions

In scope: auth migration, Firestore model and indexes, all current API behavior,
media pipeline, event/notification pipeline, realtime invalidation, moderation,
export/deletion, web session integration, data migration tooling, deployment,
observability, rules, tests, and operational documentation. Retain UI and
design code unless a session or data-access boundary requires a change.

Out of scope: new product features, native app implementation, public signup,
search, billing, and end-to-end encryption. The external appeal/moderation email
is still unset. The rewrite does not create a staffed appeal channel.

## Target architecture

```text
Next.js 16 on Firebase App Hosting
  -> /api/v1 HTTP API on Cloud Functions v2
       -> Firebase Auth (identity)
       -> Firestore (canonical application state and durable intent)
       -> Cloud Storage for Firebase (private media and exports)
       -> Cloud Tasks / scheduled functions (processing and maintenance)
  -> Firebase Auth browser SDK for sign-in/session refresh only

Future Swift/Kotlin -> same /api/v1 HTTP contract
Firestore event/outbox docs -> Cloud Tasks -> idempotent handlers
```

The server API remains the authorization boundary. Set Firestore and Storage
client security rules to deny direct application-data reads/writes except
explicitly approved paths (initially none); Firebase Admin SDK bypasses rules,
so the API must apply every policy itself. This retains a single authorization
implementation for web and native clients. Never expose Admin credentials to
the browser or App Hosting client bundle. Do not silently move authorization
into browser Firestore listeners: Firestore rules are not query filters and
server SDKs bypass them. Use API endpoints for data and an authenticated
realtime hint channel, or carefully scoped Firestore hint documents containing
only IDs with separately tested rules. Decide that hint mechanism in Phase 3.

### Service replacement map

| Existing dependency                   | Firebase target                                                                         | Rewrite required                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Auth and SSR cookies         | Firebase Auth plus HttpOnly server session cookie for Next.js                           | Sign-in, callback/recovery, provisioning, principal mapping, revocation, web proxy/actions, tests.                                     |
| PostgreSQL + Drizzle + SQL migrations | Firestore documents, indexes, data migrations                                           | Every repository/query/transaction, uniqueness and referential invariants, pagination, deletion, retention.                            |
| Redis rate limits                     | Firestore-backed or managed Cloud Armor/API Gateway controls; fail-closed server policy | Sliding windows, outage behavior, abuse tests; evaluate read/write cost.                                                               |
| Redis pub/sub and SSE                 | Authenticated hint stream or scoped Firestore hint documents                            | Membership invalidation, suspension, stream termination, refetch behavior.                                                             |
| BullMQ + PostgreSQL outbox            | Firestore durable intent + Cloud Tasks functions                                        | Idempotency, retries, dead letters, maintenance schedule, media processing.                                                            |
| Private S3 media                      | Cloud Storage for Firebase / underlying Google Cloud Storage                            | Upload grants, content validation, Sharp derivatives, signed reads, immediate takedown deletion, expiry.                               |
| NestJS server deployment              | Cloud Functions v2 HTTP entry point retaining versioned API                             | Cold-start/build configuration, secrets, request limits, observability; framework may be retained inside function if benchmarks allow. |
| Separate worker process               | Task queue/scheduled functions                                                          | Process-media, deletion, export, notification projection, maintenance.                                                                 |
| Monorepo web deploy                   | Firebase App Hosting                                                                    | Turborepo/pnpm build, Node version, environment, preview and rollout settings.                                                         |

### Region and project layout

Create separate `paldora-dev`, `paldora-staging`, and `paldora-prod` Firebase
projects under one billing organization. Pick one EU region that supports each
selected product; verify current location support, latency, and data-processing
terms before creating resources. Keep Firestore, Storage, Functions, Tasks,
and App Hosting as co-located as supported. Create budget alerts and IAM roles
before loading data. Prod access is least-privilege; service accounts separate
web, API, tasks, and operator tooling. Use Secret Manager for server-only keys.

## Data model and query design

Write a versioned `docs/firebase/collections.md` during Phase 1 with one row
per current SQL table, fields, owner, indexes, access rule, migration transform,
retention, and reconciliation query. Keep internal user UUIDs as document IDs
if possible; map Firebase Auth `uid` to internal `users/{id}` via a unique
`authLinks/{firebaseUid}` document. Never assume Firebase UID equals the
internal ID. Use server-generated IDs for new records. Maintain one reserved
`usernames/{normalized}` document per username to enforce uniqueness by
transaction. Reserve email uniqueness in Firebase Auth, not a profile field.

Suggested collections (exact layout finalized only after query prototypes):

| Domain        | Proposed documents                                                                             | Required read/write pattern and invariant                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity      | `users/{id}`, `authLinks/{uid}`, `usernames/{normalized}`, `profiles/{id}`, `preferences/{id}` | Resolve active status on every API request; username reservation and profile update transactional.                                                      |
| Relationships | `friendRequests/{id}`, `friendships/{pairKey}`, `blocks/{pairKey}`                             | Canonical pair key and deterministic IDs; block transaction withdraws requests/invites and ends friendship.                                             |
| Boxes         | `boxes/{id}`, `boxMembers/{boxId_userId}`, `boxInvitations/{id}`                               | Owner ID lives on Box; transfer checks both memberships and updates Box plus member roles atomically. Never duplicate authoritative owner in many docs. |
| Posts         | `posts/{id}`, `boxFeedEntries/{boxId_postId}` only if proven necessary                         | Canonical post plus bounded index entry; author identity joined from profile at read time. On hide/delete, read path checks canonical state.            |
| Life Updates  | `lifeUpdates/{id}`, `lifeUpdateDeliveries/{updateId_boxId}`, backing post docs                 | One content record, immutable audience after publish, per-Box comment/reaction context.                                                                 |
| Interactions  | `comments/{id}`, `reactions/{targetKind_targetId_userId}`                                      | Deterministic reaction ID for uniqueness; one reply level; comment/reaction visibility rechecked against target.                                        |
| Rooms         | `rooms/{userId}`, `roomWidgets/{id}` if needed                                                 | Owner-only updates, expected-version compare-and-swap, visibility evaluated at request time.                                                            |
| Media         | `mediaAssets/{id}`, `mediaJobs/{id}`                                                           | Owner, purpose, exact object keys, processing state, lifecycle epoch; no public object reads.                                                           |
| Activity      | `activityEvents/{id}`, `notifications/{id}`, `outbox/{id}`                                     | Deterministic dedupe keys, retryable projector, no private payload in hints.                                                                            |
| Moderation    | `reports/{id}`, `cases/{id}`, `staffGrants/{userId}`, `staffAudit/{id}`, `caseAudit/{id}`      | No reporter identity in subject views; append-only through server IAM, case redaction after 90 days, minimal pointer while enforcement active.          |
| Lifecycle     | `exports/{id}`, `deletionRequests/{userId}`, `erasureSteps/{userId_step}`                      | Seven-day deadline, cancellation until deadline only, resumable per-step erasure.                                                                       |

Firestore has no SQL joins, foreign keys, unique indexes, or cascade deletes.
Each missing invariant must have a transaction or durable compensating workflow.
Do not copy private content into feeds/notifications/Room snapshots merely for
query convenience. Candidate lists may contain opaque IDs, but every returned
item must be re-authorized against current membership, blocks, status, and
moderation state. Bound candidate scan work (for example a capped number of
pages per request) and return a stable cursor rather than unbounded filtering.
Document and test behavior when many candidates are hidden. Avoid hot shared
counters; shard only if benchmarks show need, and do not use approximate
counters as privacy-sensitive authorizations.

For each endpoint, record collection group, filters, order, composite index,
maximum candidate reads, expected p95, and worst-case billable reads/writes.
Version cursor payloads with a stable `(createdAt, documentId)` tie-breaker;
do not rely on PostgreSQL microsecond timestamps. Server timestamps can collide.
Write adversarial pagination tests for simultaneous insert/delete/hide and
cross-Box deduplication. Disable indexing on large text, widget payloads,
evidence, and TTL fields unless queried. Firestore document and transaction
limits require evidence and exports to live in private Storage, not large
documents.

## Security and privacy design

1. **Auth:** provision accounts administratively until the existing signup
   gate passes. Verify Firebase ID token issuer/audience/signature and check
   revocation as needed. Resolve the internal account and current status for
   every API request, media grant, and realtime heartbeat. Firebase ID tokens
   can remain valid after refresh-token revocation; suspension must use the
   application status check, not revocation alone.
2. **Web session:** exchange browser sign-in for an HttpOnly, Secure, SameSite
   session cookie through a server endpoint. Define CSRF protection, cookie
   rotation, logout, reset-password callback allowlist, and RSC/server-action
   authentication. No tokens in localStorage or URL logs. Test stale sessions
   and suspended users in an already-open tab.
3. **API:** keep exact error-envelope semantics, route validation, limits,
   OpenAPI, and language-neutral client. Ensure all functions share the same
   auth and rate-limit middleware; route inventory must fail CI on missing
   controls. Keep ordinary unknown/blocked content indistinguishable.
4. **Rules:** deny all direct Firestore/Storage application access by default.
   If a direct realtime hint path is chosen, allow only membership-scoped
   reads of opaque invalidation IDs and no client writes. Test rules in the
   emulator and verify Admin SDK service-account/IAM restrictions separately.
5. **Media:** keep original objects and derivatives private. The API checks
   access before issuing a short-lived signed read for derivatives only. Never
   use general Firebase `getDownloadURL()` links for private media. On
   moderator takedown, delete _all_ object generations/derivatives before
   acknowledging success, then mark content hidden; handle partial deletion
   with fail-closed reads and a retryable intent. Test a previously issued URL
   immediately after deletion, not just a newly requested URL.
6. **Audit:** writes only through privileged server action; immutable case and
   staff logs via IAM plus application checks. Storage/export/log access is
   scoped. Define backup retention and deletion/restore procedure explicitly;
   backup copies need their own erasure/retention policy review.
7. **Abuse:** preserve per-route limits and `RATE_LIMIT_UNAVAILABLE` failure
   semantics. Prototype Firestore transaction-based buckets against contention
   and cost, with a clearly defined fallback if the limiter cannot fail
   closed. Cloud Armor can complement but does not replace user-scoped limits.

## Async workflows

Cloud Tasks delivery can retry; every handler must be idempotent. Commit a
durable `outbox/{id}` or state transition before enqueueing; a scheduled
dispatcher repairs any intent not enqueued after a crash. Task names use stable
IDs when supported, but deduplication is enforced in Firestore state rather
than assumed from the task service. Record attempts, next retry, terminal
failure, and alerts. Operators need a documented replay path.

- **Media:** upload reservation -> exact-size/type private upload -> complete
  verification -> task -> Sharp decode with current limits -> metadata strip ->
  derivatives -> mark ready -> retire raw. Concurrent author delete or
  takedown increments a lifecycle epoch; a late processing task must not
  republish retired media. Reaper removes unattached objects.
- **Notifications:** canonical activity event -> task -> deduped notification
  document. Block, hide, or lost Box membership is rechecked on notification
  read and deep link. No content snapshots in push/hints.
- **Export:** request -> task builds existing JSON format into private Storage
  -> owner-only fresh signed download -> expiry cleanup. Include every current
  data class and exclude other members' private material.
- **Deletion:** password reauth and Box-transfer check -> write deadline ->
  cancellable state for seven days. At deadline, transactionally freeze access;
  tasks delete media/exports, Auth identity, then all owned Firestore docs in
  resumable batches. A cancelled request must not be erased by a delayed task:
  every step checks request generation and deadline. Do not rely on Firestore
  TTL for the deadline or cascade; TTL can lag and does not delete subcollections.
- **Moderation retention:** scheduled scan after 90 days closes/redacts report
  evidence and case audit. Preserve a minimal reversible case pointer while
  hide/suspension remains active, then purge it. Storage evidence copies and
  logs follow the same documented policy.

## Migration and cutover

There is no hosted environment yet, so the expected first rollout migrates
**code and test fixtures**, not real customer records. Confirm that before
destructive work. If a live Supabase/PostgreSQL instance or real users exist at
cutover, treat that as a separate data-migration workstream and add the time
below. Never delete the old system before reconciliation and rollback expiry.

For real users: inventory IDs, Auth users, email verification, active sessions,
password-hash algorithm/availability, all SQL rows, storage objects, pending
jobs, and legal holds. Firebase Auth can import supported hashes, but verify
the actual Supabase hash format and access to hashes in a disposable test.
If incompatible or unavailable, use a secure password-reset migration, with
clear notice; do not attempt to reverse hashes. Preserve internal UUID mapping.
Export data in a consistent snapshot, transform to versioned NDJSON manifests,
load by dependency order, checksum counts and sampled payloads, verify private
read parity with test principals, then delta-sync or freeze writes for final
cutover. Reconcile object hashes/derivatives, ownership, status, audits,
scheduled deletions, and export expiries. Rehearse rollback; do not run two
independent systems accepting writes without a designed dual-write protocol.

## Implementation sequence and acceptance gates

| Phase                    | Work and concrete deliverable                                                                                                                                                                         | Exit gate                                                                                   | Solo estimate |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| 0. Discovery             | Inventory routes/tables/jobs; choose region; prototype four hardest queries; benchmark 10k/100k-post fixtures and hidden-heavy feeds; model cost and permissions. Write ADR and final collection map. | Privacy parity and bounded query cost demonstrated; explicit go/no-go.                      | 2–3 weeks     |
| 1. Foundation            | Firebase projects/emulators, IAM, secrets, budgets, App Hosting monorepo build, Functions build, CI previews; collection/index/rules manifests; typed Firestore repository interfaces.                | Hermetic emulator CI and staging deploy of health endpoint; no public signup.               | 2–3 weeks     |
| 2. Identity              | Firebase Auth provisioning, internal-ID mapping, session cookies, recovery/reset, account status, token/revocation behavior; migrate auth tests.                                                      | Existing auth/onboarding/settings and suspension tests pass; no account enumeration.        | 3–4 weeks     |
| 3. Social graph          | Friends, blocks, invitations, Boxes, member roles, ownership transfer, concurrency/uniqueness.                                                                                                        | Same adversarial block and Box matrix; race tests; no extra read paths.                     | 4–5 weeks     |
| 4. Content               | Posts, feeds, comments, reactions, Life Updates, Memories, Rooms/personalization; query indexes/cursors.                                                                                              | Feature parity E2E, visibility matrix, feed and cost benchmarks.                            | 6–8 weeks     |
| 5. Media and async       | Storage grants, Sharp tasks, durable intent, notifications, realtime hint path, rate limits, reaper.                                                                                                  | Fault-injection retries, old URL takedown test, stream removal/suspension, no leaked media. | 4–6 weeks     |
| 6. Phase 9               | Reports, staff controls/audit, takedown/restore, export, seven-day deletion, 90-day evidence retention.                                                                                               | Full moderation/deletion fault and retention suites; operator runbook.                      | 4–6 weeks     |
| 7. Migration and release | Reconciliation tooling, deployment pipeline, load/cost tests, backups/restore, alerts, staging smoke, rollout/rollback.                                                                               | Hosted privacy/abuse/deletion smoke passes; owner release review.                           | 3–4 weeks     |

The phase ranges total **28–39 engineer-weeks** for a solo experienced
engineer if there is no live-user migration. Add **20–30% contingency** for
Firestore query redesign, pricing surprises, and Firebase/Next integration:
plan **34–50 calendar weeks solo**. With two experienced engineers splitting
bounded domains and one owning integration/security, expect roughly **20–30
calendar weeks**, not half the solo time. Add **4–8 engineer-weeks** and a
rehearsed freeze window if real user data/auth/media must migrate. External
security review, procurement, legal review, and an appeal mailbox are outside
these engineering estimates and can extend the calendar schedule.

Suggested checkpoints: week 3 go/no-go; week 9 auth + social parity; week 18
content/media parity; week 26 Phase 9 parity; final staging/cutover only after
hosted checks. Re-estimate after Phase 0 with measured read/write costs and
actual Firebase build/deploy results.

## Test and release matrix

Port the existing unit, contract, integration, browser, and security suites;
do not simply remove PostgreSQL-specific assertions without replacing the
behavior they protected. Run Firebase Emulator Suite for Auth, Firestore,
Storage, and Functions in CI. Add fault injection for task delivery, partial
object deletion, Auth outage, duplicate/reordered events, and restore. Run
real hosted tests in staging because emulator behavior does not prove IAM,
signed URL, CDN, timeout, or billing behavior. Repeat desktop and 390px mobile
accessibility E2E. Measure p50/p95 API latency, candidate reads per feed page,
index footprint, listener reads, task retries, and cost per 1,000 active users.

Release remains invite-only until: current CI gates pass; all privacy matrices
pass on hosted staging; backup/restore and erasure are demonstrated; alerts and
staffing are live; an external appeal/moderation address is set; and the owner
explicitly approves signup. Keep legacy services read-only for a documented
rollback period after cutover, then retire secrets and infrastructure only after
reconciliation, backup policy review, and a separate decommission approval.

## Risks and decisions to resolve before execution

1. Firestore feed/Memory authorization and cost may fail the discovery gate.
   A single-provider Cloud SQL design is the fallback; do not weaken privacy
   by serving stale materialized access lists.
2. Immediate media URL invalidation requires physical deletion and hosted
   verification. A stale Firebase download URL must never remain a viable
   bypass after moderation.
3. Auth import may require password resets; verify hashes and user population.
4. One vendor reduces account management but concentrates outage and pricing
   exposure. Establish export/backups and spend alerts.
5. App Hosting supports Turborepo monorepos, but test this repo's pnpm/Node 24
   build rather than assuming a zero-config rollout.
6. Choose the appeal mailbox, region, project/billing owner, and operational
   on-call staff before hosted signup. None is selected today.

## Official references checked 2026-10-22

- [App Hosting and monorepos](https://firebase.google.com/docs/app-hosting/monorepos)
- [Firestore rules and queries](https://firebase.google.com/docs/firestore/security/rules-query)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firestore quotas and best practices](https://firebase.google.com/docs/firestore/quotas)
- [Firestore TTL behavior](https://firebase.google.com/docs/firestore/ttl)
- [Firebase Auth user import](https://firebase.google.com/docs/auth/admin/import-users)
- [Firebase Auth session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions)
- [Cloud Functions task queues and scheduled functions](https://firebase.google.com/docs/functions/task-functions)
- [Cloud Storage security rules](https://firebase.google.com/docs/storage/security)

Verify current regional availability, quotas, pricing, and Next.js/Node
support again immediately before Phase 0 and before provisioning.
