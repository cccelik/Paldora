# Phase 3 plan: posts, feeds, realtime

Status: delivered 2026-10-19 (all steps).
Scope comes from [docs/rebuild-plan.md](../../rebuild-plan.md) Phase 3 and
[ADR 012](../../adr/012-realtime.md). Photos on posts are Phase 4.

## Start here (small, do first)

1. **Dedicated test database (done 2026-10-19).** Integration tests share the dev database and
   leave rows behind (task-observer observation 0001). Add a `paldora_test`
   database to Compose init and point `pnpm test:integration` at it, so Phase 3
   tests cannot disturb real data.
2. **Push and run CI once** (nothing has run on GitHub yet) and fix whatever it
   finds before adding more.
3. Optional: a hosted-Supabase smoke test of sign-in with the restored project.

## Decisions to confirm (recommended defaults)

| #   | Question                                                   | Default                                                                                 |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Can owners/admins delete other people's posts?             | **No.** Author-only until moderation in Phase 9.                                        |
| 2   | Blocked author's post in a feed: omit or placeholder?      | **Placeholder** (as D1): a neutral card with no author, no text, no Box-member hint.    |
| 3   | Edit window?                                               | **None.** Edited posts show "edited".                                                   |
| 4   | What does delete keep?                                     | A tombstone (id, Box, author, time); **content is erased** from the row.                |
| 5   | Can members who left still edit or delete their old posts? | **No.** Access needs an active membership; their posts stay in the Box.                 |
| 6   | Are realtime events allowed to be lost?                    | **Yes.** They are hints; clients refetch on reconnect. No durable outbox until Phase 5. |
| 7   | Archived Box: post, edit, delete?                          | **None** (read-only), `BOX_ARCHIVED`.                                                   |

## Data (migration 0003)

`posts`: `id`, `box_id` (cascade), `author_user_id`, `content` (1–5000 chars while
active, null when deleted; check), `status` (`active|deleted`), `created_at`,
`updated_at`, `edited_at`, `deleted_at`.
Indexes: `(box_id, created_at desc, id desc) where status = 'active'` for Box
feeds; `(author_user_id, created_at desc, id desc)` for later profile views.
Home feed is fan-out-on-read: posts joined to the viewer's active memberships,
keyset on `(created_at, id)`. Check the plan with `EXPLAIN` in a test and note
the result; add a covering index only if it shows a sort over many rows.
Box deletion already cascades posts. Phase 4 adds `post_media` and must
snapshot storage keys into the media outbox before that cascade.

## Contract

Schemas: `Post` (id, box `{id,name}`, author `UserSummary`, content, createdAt,
editedAt, `canEdit`), `HiddenPost` (id, boxId, createdAt only),
`FeedItem` = tagged union `{ kind: 'post' | 'hidden' }`, `CreatePostRequest`,
`UpdatePostRequest`. Add `POST_NOT_FOUND` to error codes.

| Operation         | Route                       | Limit         | Notes                                            |
| ----------------- | --------------------------- | ------------- | ------------------------------------------------ |
| `createPost`      | `POST /boxes/{boxId}/posts` | 120/h         | Active member, active Box                        |
| `listBoxPosts`    | `GET /boxes/{boxId}/posts`  | none          | Paged, newest first                              |
| `getHomeFeed`     | `GET /me/feed`              | none          | All active Boxes (archived included), paged      |
| `getPost`         | `GET /posts/{postId}`       | none          | Permalink; `POST_NOT_FOUND` for every non-access |
| `updatePost`      | `PATCH /posts/{postId}`     | 120/h         | Author only                                      |
| `deletePost`      | `DELETE /posts/{postId}`    | 60/h          | Author only; 204; idempotent for the author      |
| `openEventStream` | `GET /me/events`            | 12/h connects | `text/event-stream`; see Realtime                |

Add an optional `stream: true` flag to `RouteDefinition` so OpenAPI documents
`text/event-stream` with the event schema, and keep the stream out of the
typed `call()` path.

## API (module `posts`; depends on `identity` and `boxes` exports)

- `PostPolicyService`: loads a post with the viewer's Box membership in one
  query. Not found, non-member, left or removed, and deleted all return
  `POST_NOT_FOUND`; blocked-author permalinks do too.
- `PostService` (create, update, delete) and `FeedService` (Box feed, Home
  feed) kept separate; mapper turns rows into `FeedItem`.
- Block handling: the query computes `hidden` with `hiddenByBlock(viewer,
authorId)` and the mapper never copies content or author for hidden rows.
  Own posts are never hidden.
- Reuse `cursorTimestamp`, `afterCursor`, `pageOf`, `uuidParam`, `lockPair` is
  **not** needed (no pair decision). Edits and deletes use `UPDATE … WHERE
status = 'active' AND author = viewer` so concurrent edit/delete is decided
  by the database.
- Archived Box check inside the same transaction (`FOR SHARE` on the Box row).

## Realtime (ADR 012, R5)

- `RealtimeBus` in `platform`: one Redis **publisher** and one shared
  **subscriber** connection per API process; channels `box:{id}` and
  `user:{id}`; payload is IDs and a type only (`post.created|updated|deleted`,
  `memberships.changed`).
- Publish **after commit**, best effort, from post services and from the Phase 2
  membership paths (accept, leave, remove, Box delete → every member).
- `GET /me/events`: global guard as usual. On connect load the viewer's active
  Boxes and subscribe to those channels plus `user:{id}`; ref-count channels
  in-process and fan out to connections, so no database check per event.
  `memberships.changed` makes the server recompute and resubscribe; a removed
  member stops receiving that Box's events at once. Heartbeat every 25 s. The
  stream ends at the access token's expiry, and the guard re-checks user
  status on every reconnect. Cap concurrent streams per user (5). On connect
  send a `resync` event instead of replaying (`Last-Event-ID` best effort).
- Web: the browser opens one fetch-based stream per tab with the Supabase
  access token (EventSource cannot send headers); `connect-src` already allows
  the API origin. `AppRealtimeBridge` reconnects with jittered backoff and
  calls `router.refresh()` debounced, only when the open route is `/home` or
  that Box's page. No whole-app refresh.
- Lesson from legacy to avoid: refreshing the whole page on every event.

## Web UI

Reuse `PageHeader`, `Section`, `Badge`, `EmptyState`, `PersonRow` styles,
`ConfirmAction`, `RowActionForm`, `MoreLink`, `Avatar`, `SubmitButton`.
New: `PostComposer` (client, auto-growing textarea, live character count,
Cmd/Ctrl+Enter submits), `PostCard`, `HiddenPostCard`, `PostFeed`
(shared by Home and Box), `EditPostForm` (inline), `LocalTime` (renders UTC on
the server, reformats in the viewer's timezone after mount), `/posts/[postId]`.
Home becomes the unified feed with a compact welcome. Edit/Delete are inline
buttons for the author (an overflow menu waits until a second use appears).
Server Actions must be `async function` declarations; typed routes need a
`MoreLink`-style cast for query strings.

## Tests

- Unit: mapper hides content and author for blocked rows; cursor stability for
  equal timestamps; composer counter/limits; realtime backoff.
- Integration matrix (per role × action): create/read/edit/delete as owner,
  admin, member, left, removed, stranger, suspended; archived Box; guessed and
  malformed IDs; deleted-post tombstone has no content; concurrent edit vs
  delete; paging across several Boxes with identical timestamps; rate limit.
- Block rows added to `block.integration.test.ts`: Box feed, Home feed,
  permalink, both directions, unblock then re-block, and a race between a
  block and a post.
- Realtime integration: members receive events, non-members never do; removal
  mid-stream stops delivery; token expiry closes; stream cap; Redis loss ends
  the stream cleanly; reconnect sends `resync`.
- Full-stack e2e (desktop and 390 px, axe): two people, one posts and the other
  sees it appear without reloading; composer by keyboard; hidden-post
  placeholder; edit and delete; permalink 404 parity for stranger vs made-up.
- Gates as in CLAUDE.md §M, then commit on `main` in logical commits.

## Order of work (each step ends green and committable)

1. Domain, schema, migration 0003, contract routes, fixtures, error code.
2. Post services, controllers, policy, block hiding, integration tests.
3. Feeds (Box and Home) with `EXPLAIN` check and paging tests.
4. Typed client and web UI without realtime; e2e.
5. Realtime bus, SSE endpoint, membership-change publishing; integration tests.
6. Web realtime bridge; e2e with live updates.
7. Docs (security matrix, API, database, architecture), ADR 012 accepted,
   rebuild plan status, all gates, commit.

Steps 1–4 fit one session; 5–6 are a second. Stop at the end of 4 if usage is
short; the product is usable (post and read) without live updates.

## Risks

- Server Actions and typed routes bit twice in Phase 2; follow the notes in
  [apps/web/app/components/README.md](../../../apps/web/app/components/README.md).
- Long-lived SSE behind proxies: disable buffering, send heartbeats, and verify
  Express flushes headers; test through the production web build.
- Redis subscriber reconnects must resubscribe every channel; cover it.
- Time rendering can cause hydration mismatches; keep `LocalTime` isolated.
