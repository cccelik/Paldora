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
| Box feed             | 20 posts, each with 4 reactions and 3 comments from 4 members             | `NativeBoxPosts.list(…, 20)` plus ONE `interactionSummaries` call (index on)   |
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

| Path                    | Reads per page |         Items | Reads per item |
| ----------------------- | -------------: | ------------: | -------------: |
| Home feed               |             62 |            20 |            3.1 |
| Home feed, 6 authors    |             68 |            20 |            3.4 |
| Box feed                |             56 |            20 |            2.8 |
| Box feed, index missing |            196 |            20 |            9.8 |
| Unread count            |            271 |      100 rows |            2.7 |
| Memories month          |             75 |            20 |            3.8 |
| Room view               |             39 | 8 Top Friends |            4.9 |
| Post detail             |             40 |      20 roots |            2.0 |

## Budgets

`BUDGET = ceil(value × 1.25)`, about 25% headroom. Until the first emulator run
the value is the source-derived prediction. After the run, replace `PREDICTED`
in the test with the measured values and recompute.

| Path           | Predicted (source) | Budget | How the prediction is built                                                                                                                                                                                                                                                                                                  |
| -------------- | -----------------: | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home feed      |                 62 |     78 | S3 (2026-10-26): `getMany` reads each distinct Box, member, author and block pair once and the post docs in one `getAll`; hint query sized to the page (was 161). Measured: 62                                                                                                                                               |
| Box feed       |                 56 |     70 | S3: `list` is one read-only snapshot, 25 reads (was 143). S6 (2026-10-27): summaries come from `posts.interactionIndex` in one batched transaction (31 reads: 3 access + 20 posts + 4 actors x 2). Measured: 56 (was 465 with a per-post scan). With the index missing the batched scan measures 196                         |
| Unread count   |                271 |    339 | S1 (2026-10-26): comment read once through the per-call cache and checked with `commentReadable` (was 671 with the uncached `commentDetail`). Measured: 271                                                                                                                                                                  |
| Memories month |                 75 |     94 | S2 sized the windows to the page, S3 batched the Home source authorization (was 224 then 164). Measured: 75                                                                                                                                                                                                                  |
| Room view      |                 39 |     49 | username 1 + viewer, owner, profile, room 4 + friend and block pair 2 + 8 Top Friends × 4. Widgets live in the Room document and cost nothing.                                                                                                                                                                               |
| Post detail    |                 40 |     50 | S4 (2026-10-26): `commentThreadsPage` loads roots, one batched reply query and viewer checks in a single read-only snapshot (the legacy per-root path measures 606). `replyCount` counts every visible-state reply (blocked and suspended authors appear as placeholders), as `countCommentReplies` always did. Measured: 40 |

**Distinct-author guard.** Doubling the authors from 3 to 6 on the same 45 posts
may add at most `3 × 2 = 6` reads (an account and a block pair per new author).
The Home feed has no per-author cache today, so the expected growth is 0. The
test also requires `reads(6) < 2 × reads(3)`.

## Read-cost observations from the source

These are the reasons the numbers are high. They are recorded here and are not
fixed by this test.

Status after the 2026-10-26/27 reductions (S1 to S4 and S6):

- **Fixed:** the Home feed no longer over-reads hints or re-authorizes each item in
  its own transaction (S3, 161 to 62). The unread count reads each comment once
  (S1, 671 to 271). Memories windows follow the page size (S2, 224 to 75 with S3).
  Post detail loads a thread in one snapshot (S4, 606 to 40).
- **Read path (S6, task C): `interactionSummaries` is index-backed.** One
  read-only transaction authorizes the posts, checks each distinct actor once
  (account plus block pair, both directions) and reads the camera assets of
  visible real reactions in one `getAll`; no comment or reaction is scanned.
  Cost per page is about 3 + posts + 2 x distinct actors + real assets. The
  index is trusted only when `PALDORA_TRUST_INTERACTION_INDEX=1` (default off:
  backfill first, then enable). A post with no trusted index (absent, unknown
  version, corrupt) uses the scan, now memoised per transaction (about 7 reads
  per post in the fixture instead of 22), and enqueues a best-effort
  `interactionIndexRepair` job. Overflowed posts always scan and are not
  re-enqueued. A well-formed but wrong v1 index is trusted by the read path;
  `check()` and repair are the safety net. Measured on the emulator on
  2026-10-27: Box feed 465 to 56 reads, 196 when the index is missing. A repair
  job that already completed (or failed) is re-armed to `pending` by the next
  read that finds the index missing, at most once per 10 minutes.
- **Decided (2026-10-27): `replyCount` stays a count of replies in the
  thread.** Replies by blocked or suspended authors are listed as hidden
  placeholders, so the count equals the number of rows the viewer pages through
  and "N more replies" stays accurate. Excluding them would need a read per
  reply author on every thread and would disagree with the list. The
  placeholder already reveals only that a reply exists.

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
