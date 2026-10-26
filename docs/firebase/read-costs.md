# Firestore read costs per page

Firestore bills per document read, so an N+1 in a trusted service is a cost
regression as well as a latency one. `packages/firebase-trusted/src/read-budget.integration.test.ts`
measures document reads for the main read paths and fails when a path exceeds
its budget.

Run it with the other integration suites against disposable emulators:

```bash
pnpm --filter @paldora/firebase-trusted test:integration read-budget
```

## Methodology

- **Meter.** The test wraps five Admin SDK methods with `Proxy` `apply` traps:
  `Firestore.getAll`, `Transaction.get`, `Transaction.getAll`, `Query.get` and
  `AggregateQuery.get`. A Proxy around the `db` instance is not enough, because
  `db.collection()` and `db.doc()` return real reference objects that bypass it.
  Wrapping the prototype methods covers every service call. None of these
  methods calls another, and `DocumentReference.get` delegates to
  `Firestore.getAll`, so nothing is counted twice. The wrappers are removed in
  `afterAll`.
- **Counting rules.** Count documents returned, not calls.
  - A document get costs 1, including a missing document.
  - A query returning N documents costs N. An empty query costs 1, which is how
    Firestore bills it.
  - An aggregation (`count()`) costs 1 per 1,000 index entries, minimum 1.
  - Transaction reads count once per attempt. A retried transaction is billed
    again, and the meter shows that.
- **Self-check.** A first test asserts the meter against known cases: missing
  document, existing document, 2-document query, empty query, `getAll` of 3,
  transaction doc plus query, and `count()`.
- **Fixtures.** Each path uses its own disposable users and Boxes, with
  `randomUUID` ids and the same emulator guard as the other integration tests.
  Fixture writes happen before the meter is switched on. Only the measured call
  is counted.
- **Reported numbers.** Reads per page and reads per returned item. Each run
  prints a table, and each path logs one `[read-budget]` line.

## Paths measured

| Path                 | Fixture                                                                   | Call measured                                                                  |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Home feed            | 45 posts from 3 authors in 2 Boxes, all published to the viewer's feed    | `NativeHomeFeed.page(viewer, undefined, 20)`                                   |
| Home feed, 6 authors | Same, 6 authors                                                           | Same. Compared with the 3-author run.                                          |
| Box feed             | 20 posts, each with 4 reactions and 3 comments from 4 members             | `NativeBoxPosts.list(…, 20)` plus `interactionSummary` for each post           |
| Unread notifications | 100 unread rows: 50 comment and 50 reaction, across 10 posts and 5 actors | `NativeNotifications.unreadCount`                                              |
| Memories month       | 35 feed posts (30 in June 2025) plus 2 Only Me updates                    | `NativeMemories.page(viewer, personal, { year, month: 6, limit: 20 })`         |
| Room view            | Friend viewer, 8 Top Friends, 7 stored widgets (6 enabled)                | `NativeRooms.get(viewer, username)`                                            |
| Post detail          | 30 root comments, no replies                                              | `resolve`, `listCommentRoots`, then per root `listCommentReplies(3)` and count |

## Measured numbers

Measured on the Firestore emulator on 2026-10-26 with the counting meter in
`packages/firebase-trusted/src/read-budget.integration.test.ts`. Each value
matched the prediction derived from reading the source. Adding distinct authors
did not change the home feed count (161 reads for 3 and for 6 authors), so the
author lookup is not an N+1. Billing is per document read; check current Firebase
pricing before turning these into a cost estimate.

| Path                 | Reads per page |         Items | Reads per item |
| -------------------- | -------------: | ------------: | -------------: |
| Home feed            |             62 |            20 |            3.1 |
| Home feed, 6 authors |             68 |            20 |            3.4 |
| Box feed             |            465 |            20 |           23.3 |
| Unread count         |            271 |      100 rows |            2.7 |
| Memories month       |             75 |            20 |            3.8 |
| Room view            |             39 | 8 Top Friends |            4.9 |
| Post detail          |             40 |      20 roots |            2.0 |

## Budgets

`BUDGET = ceil(value × 1.25)`, about 25% headroom. Until the first emulator run
the value is the source-derived prediction. After the run, replace `PREDICTED`
in the test with the measured values and recompute.

| Path           | Predicted (source) | Budget | How the prediction is built                                                                                                                                                                                                                                                             |
| -------------- | -----------------: | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home feed      |                 62 |     78 | S3 (2026-10-26): `getMany` reads each distinct Box, member, author and block pair once and the post docs in one `getAll`; hint query sized to the page (was 161). Measured: 62                                                                                                          |
| Box feed       |                465 |    582 | S3: `list` is one read-only snapshot, 25 reads (was 143); the remaining cost is `interactionSummary` per post (~22 each), targeted by S6. Measured: 465                                                                                                                                 |
| Unread count   |                271 |    339 | S1 (2026-10-26): comment read once through the per-call cache and checked with `commentReadable` (was 671 with the uncached `commentDetail`). Measured: 271                                                                                                                             |
| Memories month |                 75 |     94 | S2 sized the windows to the page, S3 batched the Home source authorization (was 224 then 164). Measured: 75                                                                                                                                                                             |
| Room view      |                 39 |     49 | username 1 + viewer, owner, profile, room 4 + friend and block pair 2 + 8 Top Friends × 4. Widgets live in the Room document and cost nothing.                                                                                                                                          |
| Post detail    |                 40 |     50 | S4 (2026-10-26): `commentThreadsPage` loads roots, one batched reply query and viewer checks in a single read-only snapshot (the legacy per-root path measures 606). `replyCount` still counts blocked or suspended authors' replies, as `countCommentReplies` always did. Measured: 40 |

**Distinct-author guard.** Doubling the authors from 3 to 6 on the same 45 posts
may add at most `3 × 2 = 6` reads (an account and a block pair per new author).
The Home feed has no per-author cache today, so the expected growth is 0. The
test also requires `reads(6) < 2 × reads(3)`.

## Read-cost observations from the source

These are the reasons the numbers are high. They are recorded here and are not
fixed by this test.

Status after the 2026-10-26 reductions (S1 to S4):

- **Fixed:** the Home feed no longer over-reads hints or re-authorizes each item in
  its own transaction (S3, 161 to 62). The unread count reads each comment once
  (S1, 671 to 271). Memories windows follow the page size (S2, 224 to 75 with S3).
  Post detail loads a thread in one snapshot (S4, 606 to 40).
- **Still open: `interactionSummary` scans every comment and reaction on the
  post.** It costs O(comments + reactions + distinct actors) per post per feed
  render (about 22 reads per post in the fixture), so busy posts get more
  expensive over time. This is 440 of the Box feed's 465 reads. The planned fix
  is a per-actor interaction index (S6), which needs a write-path change, a
  backfill, a repair job and an ADR.
- **Open product question:** `replyCount` counts replies by blocked or suspended
  authors even though the preview shows them only as hidden placeholders.

## Limits of this measurement

- Emulator counts equal billed document reads. The emulator evaluates the same
  queries and returns the same documents the hosted service would.
- **Not measured:**
  - Index entry reads. Queries and aggregations bill by index entries for
    `count()`, and storage for indexes is billed separately.
  - Realtime listeners. Initial results and each changed document are billed.
  - Network egress.
  - Writes and deletes.
  - Cloud Functions and Storage costs.
  - Web data-layer hydration on top of the trusted services (author profiles,
    media URLs).
- **Not covered by fixtures:**
  - Notification list pages, `sharesBox` for `members`-visibility Rooms, camera
    ("real") reactions, Life Update cards in feeds, and reply-heavy threads.
  - Cache behaviour across requests. Every measured call is cold.
- **Hosted cost.** Verify against the current Firebase pricing page before
  turning read counts into money. No prices are asserted here, and free-tier
  allowances, regional pricing and plans change.
