# Firebase migration discovery record

Status: Phase 0 in progress, 2026-10-22. This record implements the first
checkpoint in [the Firebase rewrite plan](../plans/firebase-rewrite.md). No
Firebase project or hosted environment has been chosen. The existing
PostgreSQL/Supabase/Redis/S3 application remains canonical, and public signup
remains disabled. The `firebase/` files are a local, deny-all emulator scaffold,
not a production deployment.

## Inventory and migration rule

The current schema has 30 application tables in
`packages/database/src/schema/`; the versioned API has 90 routes in
`packages/validation/src/routes/index.ts`. A route or table is not considered
migrated because a similarly named Firestore collection exists. For each
vertical slice, carry over its authorization matrix, transaction invariants,
failure behavior, and contract tests before switching its read path. Use a
separate adapter behind the existing service boundary, with one canonical
backend per environment and no unreviewed dual writes.

| SQL source                                                                                | Candidate Firestore state                                                                      | Invariant or query that needs proof                                                                             |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `users`, `profiles`, `user_preferences`                                                   | `users/{id}`, `profiles/{id}`, `preferences/{id}`, `authLinks/{uid}`, `usernames/{normalized}` | Active status on every request; Firebase UID stays distinct from internal UUID; username reservation is atomic. |
| `friendships`, `user_blocks`                                                              | Deterministic pair documents                                                                   | Both-direction block semantics; request/friend/block races remain serialized.                                   |
| `boxes`, `box_memberships`, `box_invitations`                                             | `boxes/{id}`, `boxMembers/{boxId_userId}`, `boxInvitations/{id}`                               | One active owner and transfer/leave/removal concurrency; owner lives in exactly one authoritative field.        |
| `posts`, `post_media`                                                                     | `posts/{id}`, media references                                                                 | Membership, block, deletion, and moderation are checked at read time; no leaked feed copy.                      |
| `comments`, `post_reactions`, `comment_reactions`                                         | `comments/{id}`, deterministic `reactions/{target_user}`                                       | One reaction per target/user, one reply level, target visibility on every read.                                 |
| `life_updates`, `life_update_deliveries`, `life_update_media`                             | `lifeUpdates/{id}`, `deliveries/{update_box}`                                                  | One canonical update; immutable audience; isolated Box conversations; Home dedupes.                             |
| `rooms`, `room_widgets`, `room_top_friends`, `room_customizations`, `room_custom_widgets` | `rooms/{userId}` plus bounded child documents                                                  | Current friend/Box visibility, stale-write prevention, validated personalization.                               |
| `media_assets`, `media_job_outbox`                                                        | `mediaAssets/{id}`, `outbox/{id}`                                                              | Durable intent before task enqueue; immediately retire objects on moderation; no master/raw read links.         |
| `activity_events`, `notifications`                                                        | `activityEvents/{id}`, `notifications/{id}`                                                    | Idempotent projection; authorization checked again when read or opened.                                         |
| `user_reports`, `staff_grants`, `moderation_audit`                                        | `reports/{id}`, `staffGrants/{userId}`, `caseAudit/{id}`, `staffAudit/{id}`                    | Reporter privacy, audited case access/action, 90-day redaction with reversible active enforcement.              |
| `account_exports`, `account_deletion_requests`                                            | `exports/{id}`, `deletionRequests/{userId}`                                                    | Private expiring JSON archive; 7-day cancellation deadline; ownership transfer; retryable complete erasure.     |

The current SQL schema is the authoritative list until the model is approved.
Do not infer collection fields solely from the table names: document every
field, nullability, status transition, index, and cascade in Phase 1's
`docs/firebase/collections.md`.

## Four go/no-go query prototypes

All prototypes must run against the **actual Firestore emulator**, then a
disposable billed staging project for latency/cost measurements. An in-memory
simulation alone cannot validate query plans or billing. Seed at least 10,000
and 100,000 posts with skewed Box sizes, overlapping memberships, blocks,
deleted/hidden posts, and Life Updates delivered to multiple Boxes. Include a
viewer with more than 30 Boxes; a single Firestore `in` query is limited to 30
disjunctions. Record p50/p95 latency and billed document/index reads for every
case, including nearly all candidates hidden. Use Query Explain in staging.

### P1. Box membership and ownership

Prototype a deterministic `boxMembers/{boxId_userId}` document and a Box
`ownerId`. Transfer reads Box and both membership docs, checks active roles,
then writes all in one transaction with a version increment. Parallel transfer,
leave, remove, and delete operations must have exactly one winner and leave
one active owner. A disabled/removed account must lose reads immediately.
Compare the result with existing `boxes.integration.test.ts` behavior. Do not
rely on a query such as “members with role owner” for uniqueness.

Initial emulator prototype: `packages/firebase-prototype/src/box-ownership.ts`
uses a transactional Box `ownerId` and deterministic membership documents.
Four integration tests pass for create/read denial, transfer, two competing
transfers, and transfer racing removal. Invitation, leave/delete, suspension,
the full role matrix, and hosted contention/cost remain open. This is a partial
P1 result, not a production adapter.

### P2. Home feed

The SQL implementation in `PostQueryService` joins active memberships to
active posts and uses `(created_at,id)` keyset ordering; Life Updates are
deduped before presenting the page. Firestore alternatives to measure:

1. Query posts by `boxId in <up to 30 IDs>` in chunks; merge sorted streams on
   the server, then recheck current membership, block, post status, and Life
   Update delivery. This can amplify reads when candidates are hidden or a
   member has many Boxes.
2. Per-Box limited queries with a stable k-way merge. This gives a query per
   Box per page and may be expensive for large memberships.
3. A per-user candidate index containing only opaque post IDs. It must be
   maintained on membership changes and may not be treated as authorization;
   stale candidates must be filtered. Measure write fan-out and cleanup.

Reject a design that fetches an unbounded number of candidates to fill a page.
The API can return a short page with a continuation cursor when a bounded scan
is exhausted, but must not expose hidden IDs or infer their existence from
errors. Test stable ordering and no duplicate Life Update under concurrent
insert/hide/remove operations. No plaintext copied into a feed index.

Initial emulator prototype: `packages/firebase-prototype/src/home-feed.ts`
chunks Box IDs into groups of 30, merges sorted candidate streams, and uses a
canonical `itemId` for Life Update deduplication across pages. Seven prototype
tests across P1/P2 pass, including 31-Box paging and a blocked-heavy chunk.
The per-chunk safe boundary returns a short page rather than skip an unfetched
candidate. It **refuses** a 61-Box, 50-item page with a 100-candidate budget;
a production design needs a continuation strategy for high membership counts.
The current blocked-author set is supplied by the test, not loaded and checked
from Firestore. Actual billable reads, hosted indexes, and all concurrent
visibility changes remain unmeasured. This is partial P2 evidence only.

### P3. Memories and Room previews

The current `memoryCandidates` SQL unions visible Box posts and the viewer's
Only Me updates, filters blocks and optional photos, then dedupes deliveries.
Prototype both page and year/month summary from the same candidate semantics.
An aggregate count over visible-but-filtered Firestore documents is not an
accurate substitute: block/membership/moderation changes must affect summary
and page together. Room previews must add author and Room visibility checks,
never widen access. Test 20-Box Life Updates, former members, blocks, hidden
content, and a long history. Set a maximum query/read budget before porting.

### P4. Moderation

Report submission first checks that the reporter can currently identify the
target. Staff queue is bounded; case read and action append an audit event.
Prototype exact target lookup, report dedupe, case action, and 90-day redaction
while active hide/suspension remains reversible. Simulate a failed object
deletion during takedown: no success response and no new read path to media.
Do not use Firestore TTL to enforce retention deadlines: expiration is delayed
and subcollections remain. Define a scheduled, idempotent retention job.

## Prototype measurements and decision thresholds

Before coding a production adapter, fill the following for each prototype:
fixture size and distribution; index manifest; query count; documents and index
entries read; writes per mutation; p50/p95 latency; largest result; failure
mode; privacy matrix parity; and approximate monthly cost at 1k, 10k, and
100k active users. Establish explicit maximum candidate reads per 50-item
page from measured cost; the provisional target is **at most 200 candidate
documents and 10 backend queries per page** for a typical viewer, with a
separate documented worst-case cap. This is a decision target, not an achieved
benchmark. If feed/Memories cannot meet a bounded cost without serving stale
access, record a no-go and revisit Cloud SQL on Google Cloud.

## Initial local scaffold

`firebase.json` configures loopback-only Auth, Firestore, Storage, and
Functions emulators. The Firestore and Storage rules deny all client reads and
writes. This deliberately matches the current server-owned API boundary;
server Admin SDK access uses IAM and is not governed by these rules. The index
manifest now contains only the two prototype collection indexes. There is
no `.firebaserc`, service-account key, deploy command, or production resource
in this slice. The Firebase CLI is pinned to 15.34.0, and the smoke script
refuses any project other than `demo-paldora`. Run `pnpm firebase:rules:check`
to start the local emulators and verify that anonymous Firestore reads and
writes and Storage uploads receive 403. This check passed locally on
2026-10-22. It does not yet test authenticated clients or Admin SDK IAM.
Never point tests at a real project by default.

## Next implementation slice

Finish P1 role/invitation/leave/delete parity and benchmark contention. Then
implement and measure P2–P4. The Admin SDK is pinned in the isolated prototype;
Phase 1 still needs a reviewed production adapter and emulator CI. Only after
the go/no-go review should the team switch identity or content traffic. Keep
public signup disabled throughout. Track each gate in
[implementation.md](implementation.md).

## References checked 2026-10-22

- [Firestore `in`/OR limit](https://firebase.google.com/docs/firestore/query-data/queries)
- [Firestore query rules are not filters](https://firebase.google.com/docs/firestore/security/rules-query)
- [Firestore emulator setup](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [Firestore Query Explain](https://firebase.google.com/docs/firestore/query-data/queries)
- [Firestore TTL limitations](https://firebase.google.com/docs/firestore/ttl)
