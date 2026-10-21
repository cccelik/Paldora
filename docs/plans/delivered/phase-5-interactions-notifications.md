# Phase 5 plan: comments, reactions, camera reactions, notifications, toasts

Status: delivered (2026-10-20); accepted by the owner with all recommended defaults (2026-10-19). Drafted by a smaller model, reviewed by the lead. Scope comes from [docs/rebuild-plan.md](../../rebuild-plan.md) Phase 5, [ADR 011](../../adr/011-media-pipeline.md), [ADR 012](../../adr/012-realtime.md) and [ADR 013](../../adr/013-directional-blocks.md). It follows the format of [phase-3-posts-feeds-realtime.md](phase-3-posts-feeds-realtime.md). Behaviour is taken from `legacy/` and nothing is imported from it. Several legacy weaknesses are fixed here: the 681-line `interaction.service.ts`, the projector running inside the API process, whole-page refresh, and friendship-row block checks.

All claims below about existing code were checked against the repo at commit `fb9a5c5`.

---

## A. Summary and scope

**In scope**

- Comments on posts with exactly one reply level. Authors can edit and soft-delete. A delete erases the text and keeps a tombstone.
- One emoji reaction per user per post and per comment (primary-key enforced). Any single emoji grapheme is allowed.
- One camera ("real") reaction per user per post, post-only, via `getUserMedia`. The capture is a `reaction_image` media asset, Box-scoped, running through the existing pipeline.
- Five personal reaction presets per user (shortcuts only), editable in Settings.
- `activity_events` outbox plus a projector in the **worker**. It turns events into durable, deduplicated `notifications` for `post.comment`, `comment.reply`, `post.reaction` and `comment.reaction`.
- Notification API and UI: unread count, mark one, mark all, deep links, and visibility rechecked on every read.
- New `/me/events` event types. Notification events travel on the `user:` channel; interaction hints travel on the `box:` channel.
- A shared toast system.
- Per-user hourly rate limits: comment 300, reaction 1,000, camera upload 120.
- Post deletion erases that post's comments, reactions and notifications, and retires camera images.

**Explicitly out**

- Moderator or admin deletion of other people's comments (Phase 9).
- Mentions, comment media, notification email or push (Phase 10 and later).
- Inline thread expansion in feeds. Feeds show counts and the reaction bar; the thread lives on the post permalink.
- Notification digests, per-type mute settings, and emoji-picker libraries (we use a curated grid plus a free emoji input).
- Life Update notifications (Phase 6). The projector is built to take new event types.
- Denormalised counters. Counts are computed on read (see section F).

---

## B. Decisions needing the owner (recommended default in bold)

| #   | Question                  | Default                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reply to a reply          | **Attach to the top-level comment's thread.** The server resolves `parent_comment_id` to the root and records `reply_to_user_id` (the author of the comment actually replied to). Rejecting (legacy `REPLY_DEPTH_EXCEEDED`) makes the UI dead-end. The depth limit is final in the DB (see C).                                                                                                                                                                                        |
| 2   | Who gets notified         | **Only the person directly addressed.** A top-level comment notifies the post author. A reply notifies the author of the comment replied to (`reply_to_user_id`). A post reaction notifies the post author. A comment reaction notifies the comment author. There is no thread-wide fan-out: it spams, and it leaks who participates.                                                                                                                                                 |
| 3   | Reaction change semantics | **One row per user per target.** Changing the emoji updates in place: no new notification and no unread bump. Removing deletes the row, and the reaction notification then hides itself via the read-time rule (the reaction must still exist). Re-reacting after removal does **not** re-notify (the dedupe key persists), so toggling cannot spam. A camera reaction and an emoji are mutually exclusive: setting one replaces the other, and the replaced camera image is retired. |
| 4   | Deleting a comment        | **Tombstone; replies stay.** Its reactions are deleted. A deleted root is shown ("This comment was deleted") only while it still has non-deleted replies. A deleted reply is omitted.                                                                                                                                                                                                                                                                                                 |
| 5   | Deleting a post           | **Erase interactions in the same transaction.** Comment text is erased (tombstoned), all reactions are deleted, camera images are retired, and notifications are deleted. Posts are soft-deleted, so FK cascades never fire; this must be explicit.                                                                                                                                                                                                                                   |
| 6   | Feed interactions         | **Counts plus a reaction bar in feeds. The thread appears only on `/posts/[id]`.**                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | Blocked reactors          | **Omitted** from reaction lists and counts, with no placeholder (a placeholder has no value). Blocked _comments_ get the neutral placeholder required by ADR 013.                                                                                                                                                                                                                                                                                                                     |
| 8   | Notification retention    | **90 days**, deleted in batches by the reaper. Activity events are purged 14 days after completion.                                                                                                                                                                                                                                                                                                                                                                                   |
| 9   | Camera image limits       | `reaction_image`: JPEG/PNG/WebP, 5 MB, 25 MP, master 1280 px, display 1024 px, thumbnail 320 px, all inside-fit. Visible to exactly the people who can see the post.                                                                                                                                                                                                                                                                                                                  |

No other product question is open. Moderation of others' comments waits for Phase 9, as with posts.

---

## C. Data model (migration `0005_interactions_notifications`)

Write it by editing `packages/database/src/schema.ts` and running `pnpm db:generate --name interactions_notifications`. Review the SQL by hand. Do not edit 0000–0004. The migration is expand-only: new tables, one defaulted column, and widened (looser) check constraints, so old API and worker code keep running.

### New enums

`comment_status` (`active|deleted`) and `activity_event_status` (`pending|completed|dead`).

### `comments`

- `id` uuid PK default random.
- `post_id` uuid not null → `posts` ON DELETE CASCADE.
- `author_user_id` uuid not null → `users` ON DELETE CASCADE.
- `parent_comment_id` uuid null. It is always a root, never a reply.
- `reply_to_user_id` uuid null → `users` ON DELETE SET NULL. It is only for notifications.
- `content` text null.
- `status` comment_status not null default `active`.
- `created_at`, `updated_at`, `edited_at`, `deleted_at`.
- Lifecycle check, modelled on `posts_content_lifecycle_check`: `status='active' and char_length(content) between 1 and 2000`, or `status='deleted' and content is null and deleted_at is not null`.

**Depth is final in the database.**

- `depth smallint GENERATED ALWAYS AS (case when parent_comment_id is null then 0 else 1 end) STORED`.
- `parent_depth smallint GENERATED ALWAYS AS (case when parent_comment_id is null then null else 0 end) STORED`.
- Unique `(id, post_id, depth)` as the FK referent.
- Composite FK `(parent_comment_id, post_id, parent_depth)` → `comments(id, post_id, depth)` ON DELETE CASCADE.
- With the default MATCH SIMPLE, a null `parent_comment_id` skips the check. A non-null one must reference a **root in the same post**. This guarantees both one reply level and no cross-post parent.
- Spike first: confirm drizzle-kit emits `generatedAlwaysAs` plus the composite `foreignKey` cleanly. If not, hand-edit only the new 0005 SQL, which the migration README allows.

**Indexes**

- `comments_post_roots_index (post_id, created_at desc, id desc) WHERE parent_comment_id IS NULL`.
- `comments_replies_index (parent_comment_id, created_at, id) WHERE parent_comment_id IS NOT NULL`.
- `comments_post_active_index (post_id) WHERE status='active'` for counts.
- `comments_author_index (author_user_id)` for FK cascade performance.

### `post_reactions`

- `post_id` → `posts` CASCADE, `user_id` → `users` CASCADE, **PK `(post_id, user_id)`**.
- `kind` text not null, with `char_length between 1 and 64`. It is an emoji or the literal `'real'`.
- `media_asset_id` uuid null → `media_assets` ON DELETE RESTRICT. Assets are tombstoned, never hard-deleted.
- `created_at`, `updated_at`.
- Check `(kind='real') = (media_asset_id is not null)`.
- Unique index on `media_asset_id` WHERE not null, so a camera image is used once.
- Indexes `(post_id, kind)`, `(user_id)`, and `(post_id, created_at desc) WHERE kind='real'` for previews.
- Emoji validity cannot be checked in SQL. Zod and the service enforce it, and the DB bounds the length and the `'real'` pairing.

### `comment_reactions`

- PK `(comment_id, user_id)`, both FKs CASCADE.
- `kind` 1–64 chars, with check `kind <> 'real'`.
- `created_at`, `updated_at`.
- Indexes `(comment_id, kind)` and `(user_id)`.

### `user_preferences` gains `reaction_presets`

- `reaction_presets text[] NOT NULL DEFAULT '{👍,❤️,😂,😮,😢}'` with check `cardinality(reaction_presets) = 5`.
- A column is chosen over a table: it is one atomic replace, and the presets are only shortcuts.
- Distinctness and emoji validity are enforced in Zod and the service. A duplicate would be harmless.
- Rows may be missing (`current-user.service.ts` left-joins them), so reads default to `DEFAULT_REACTION_PRESETS` from domain.

### `activity_events` (the outbox)

- `id` uuid PK.
- `type` text, check in `comment.created | post.reaction.set | comment.reaction.set`.
- `actor_user_id` → `users` CASCADE.
- `post_id` uuid not null → `posts` CASCADE.
- `comment_id` uuid null → `comments` CASCADE.
- A check ties `comment_id` to the type: required for `comment.created` and `comment.reaction.set`, forbidden for `post.reaction.set`.
- `dedupe_key` text not null **unique**. It equals the notification key for that event: `post.comment:{commentId}`, `comment.reply:{commentId}`, `post.reaction:{postId}:{actorId}`, `comment.reaction:{commentId}:{actorId}`.
- `status` activity_event_status default `pending`.
- `attempts` int default 0 (check ≥ 0).
- `available_at` default now.
- `completed_at`, `last_error`, `created_at`, `updated_at`.
- Check `(status='completed') = (completed_at is not null)`.
- Indexes: partial `(available_at, created_at) WHERE status='pending'` for claiming, and partial `(completed_at) WHERE status='completed'` for retention.
- Real FK columns are used rather than a jsonb payload, so invalid events are unrepresentable and Box deletion cascades.

### `notifications`

- `id` uuid PK.
- `recipient_user_id`, `actor_user_id` → `users` CASCADE, with check `recipient <> actor`.
- `type` text, check in the four types.
- `post_id` → `posts` CASCADE, `comment_id` null → `comments` CASCADE.
- `activity_event_id` null → `activity_events` ON DELETE SET NULL, so event retention cannot delete notifications.
- `dedupe_key` text not null **unique**.
- `read_at`, `created_at`.
- Check that `comment_id` is present for every type except `post.reaction`.
- Indexes: `(recipient_user_id, created_at desc, id desc)` and a partial `(recipient_user_id, created_at desc) WHERE read_at IS NULL`.
- The row stores **IDs only, never content**. All display data is joined at read time (section D).

### Media changes in the same migration

- Widen `media_assets_purpose_check` to include `reaction_image`.
- Rewrite `media_assets_box_scope_check` so `purpose in ('post_image','reaction_image')` requires `box_id` unless the status is `deleted`.
- Replace `media_assets_unattached_index` with one whose predicate is `purpose in ('post_image','reaction_image') and status='ready'`.

### Lifecycles

- **Comment:** `active → deleted`, one way. The `edited_at` marker is set on edit.
- **Reaction:** row present or absent. A real reaction's asset is `pending → processing → ready` before the claim. The claim happens in the setter transaction. Replacing or removing the reaction retires the asset in the same transaction.
- **Activity event:** `pending → completed | dead`. A failure bumps `attempts`, sets `available_at` with exponential backoff and jitter, and records `last_error`. At 8 attempts it becomes `dead`, and the reaper logs at error level while any exist (the same pattern as the media outbox).
- **Notification:** created unread, `read_at` set once. It is deleted by retention or by post erasure.

### Cascade review

- Box delete → posts → comments, reactions, events and notifications all cascade.
- Camera images are already retired by the existing loop in `box-lifecycle.service.ts` (`mediaAssets where boxId = …`), because the assets carry `box_id`. Add a test, not code.
- `post_reactions.media_asset_id` RESTRICT is safe because assets are only ever tombstoned.
- User delete is handled by Phase 9.

### Outbox claim and ack, and where the projector runs

The projector runs in the **worker** process, as a poll loop beside `startDispatcher` in `apps/worker/src/main.ts`. It is not a BullMQ job: projection is pure SQL, so it needs no queue hop. It reuses the SKIP LOCKED idea but is simpler than the media outbox, because there is no network call between claim and ack:

1. One transaction:
   - `SELECT … FROM activity_events WHERE status='pending' AND available_at <= now() ORDER BY available_at, created_at LIMIT 50 FOR UPDATE SKIP LOCKED`.
   - Project each event inside a savepoint (nested `transaction.transaction`). Success marks it `completed` and records what was created.
   - Failure rolls back only that savepoint, then bumps `attempts`, backoff and `last_error`, or marks it `dead`.
   - Commit.
2. After commit, publish Redis `notification.created` hints for the notifications created.

A crash before commit leaves the rows pending and locked only for the life of the transaction, so no lease column is needed. A crash after commit but before publish loses a lost-by-design hint, which the client's `resync` repairs. Replicas are safe because of SKIP LOCKED. The `dedupe_key` unique constraints make double projection harmless.

---

## D. Authorization matrix and errors

Every interaction check starts from one function, `loadPostContext` (post, Box status, membership and `hidden` in one query). Move it to `apps/api/src/posts/post-context.ts` in slice 2, so interactions can import it without a module cycle. Not-a-member, deleted, missing and blocked-author all give `POST_NOT_FOUND`. Comment targets add the same rule on the comment and its root.

| Action                            | Owner / admin / member of an active Box                                   | Archived Box   | Former member / stranger / guessed ID         | Block with post author | Block with comment author (or root author)                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------- | -------------- | --------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Read comments of a post           | yes                                                                       | yes            | `POST_NOT_FOUND`                              | `POST_NOT_FOUND`       | that comment shows as a neutral `hidden` placeholder (id, time, no author, no text); a thread whose root is hidden shows as one placeholder |
| Create comment / reply            | yes (300/h)                                                               | `BOX_ARCHIVED` | `POST_NOT_FOUND`                              | `POST_NOT_FOUND`       | reply target hidden → `COMMENT_NOT_FOUND`                                                                                                   |
| Edit own comment                  | author                                                                    | `BOX_ARCHIVED` | `COMMENT_NOT_FOUND`                           | n/a                    | n/a                                                                                                                                         |
| Edit someone else's comment       | `COMMENT_ACCESS_DENIED` (403; they can see it)                            | `BOX_ARCHIVED` | `COMMENT_NOT_FOUND`                           | n/a                    | `COMMENT_NOT_FOUND`                                                                                                                         |
| Delete own comment                | author, idempotent 204                                                    | `BOX_ARCHIVED` | `COMMENT_NOT_FOUND`                           | n/a                    | n/a                                                                                                                                         |
| Delete someone else's             | `COMMENT_ACCESS_DENIED` (no moderation until Phase 9)                     | `BOX_ARCHIVED` | `COMMENT_NOT_FOUND`                           | n/a                    | n/a                                                                                                                                         |
| React / change / remove (post)    | yes (1000/h)                                                              | `BOX_ARCHIVED` | `POST_NOT_FOUND`                              | `POST_NOT_FOUND`       | n/a                                                                                                                                         |
| React / change / remove (comment) | yes                                                                       | `BOX_ARCHIVED` | `COMMENT_NOT_FOUND`                           | `POST_NOT_FOUND`       | `COMMENT_NOT_FOUND`                                                                                                                         |
| Camera reaction                   | claim a ready `reaction_image` that is mine, from this post's Box, unused | `BOX_ARCHIVED` | `POST_NOT_FOUND`                              | `POST_NOT_FOUND`       | n/a                                                                                                                                         |
| List a post's reactions           | yes; blocked reactors omitted                                             | yes            | `POST_NOT_FOUND`                              | `POST_NOT_FOUND`       | omitted                                                                                                                                     |
| Reserve a camera upload           | active member of an open Box                                              | `BOX_ARCHIVED` | `BOX_NOT_FOUND`                               | n/a                    | n/a                                                                                                                                         |
| Notifications: list, count, mark  | own rows only, visibility rule below                                      | still visible  | other people's IDs → `NOTIFICATION_NOT_FOUND` | hidden                 | hidden                                                                                                                                      |
| Set presets                       | self                                                                      | n/a            | n/a                                           | n/a                    | n/a                                                                                                                                         |

**Notification visibility, rechecked at every read** (list, unread count, mark-one). One shared SQL fragment in `notification-visibility.ts` joins on:

- `posts` active;
- the viewer has an active `box_memberships` row for that post's Box (a former member sees nothing);
- the actor is active, and `NOT hiddenByBlock(viewer, actor)` holds (the shared helper from `@paldora/database`);
- the target is still live: for `post.comment` and `comment.reply`, the comment is active; for `post.reaction`, a matching `post_reactions` row `(post, actor)` exists; for `comment.reaction`, the comment is active and a matching `comment_reactions` row exists.

The actor's identity, the emoji, and the camera image URL come from live rows at read time, so nothing is cached in the notification and nothing leaks after a block, removal, delete or un-react. The projector applies the same rules at creation time (block, membership, active target, recipient is not the actor, recipient is active).

**Races.** A block landing between a comment insert and its projection is caught by the projector's check. A block landing after the notification exists is caught by the read-time check. No `lockPair` is needed, because interactions persist no pair decision. A test pins this down.

**Error codes** (append to `packages/domain/src/errors.ts`, the Phase 5 section):

- `COMMENT_NOT_FOUND` (404). Missing, deleted, in a hidden thread, or not visible all look identical.
- `COMMENT_ACCESS_DENIED` (403). Only for someone who can already see the comment.
- `NOTIFICATION_NOT_FOUND` (404).
- Reuse `POST_NOT_FOUND`, `BOX_NOT_FOUND`, `BOX_ARCHIVED`, `MEDIA_NOT_FOUND`, `MEDIA_NOT_READY`, `VALIDATION_FAILED`, `RATE_LIMITED` and `RATE_LIMIT_UNAVAILABLE`. Do not add a bespoke "blocked" code.

---

## E. Contract

Add to `packages/validation` a new `comments.ts`, `reactions.ts` and `notifications.ts`; append entries in `routes.ts` (the registry and `apiRoutes`); extend `events.ts`; add client methods in `packages/api-client/src/index.ts`; then run `pnpm contract:generate`. Every route needs its controller in the same slice, because `route-inventory.test.ts` requires the controllers and the registry to match exactly, and it requires a rate-limit decision on every non-GET route.

### Domain additions (`packages/domain`)

- `reactions.ts`: `COMMENT_CONTENT_MAX_LENGTH = 2000`, `REACTION_KIND_MAX_LENGTH = 64`, `REAL_REACTION_KIND = 'real'`, `REACTION_PRESET_COUNT = 5`, `DEFAULT_REACTION_PRESETS`, `isSingleEmoji` (single grapheme via `Intl.Segmenter`, matching `\p{Extended_Pictographic}|\p{Regional_Indicator}|keycap`, reject `'real'` and untrimmed input; same rule as the legacy function), and `NOTIFICATION_TYPES`.
- `media.ts`: add `reaction_image` to `MEDIA_PURPOSES` and a `MEDIA_PURPOSE_POLICIES` row (scope `box`, values from decision 9). The `Record<MediaPurpose, …>` types will force the worker `attachments` map and other tables to be updated.

### Schemas

- `commentSchema`: `{id, postId, parentCommentId|null, author: UserSummary, content, createdAt, editedAt|null, replyCount (roots), interactions: CommentInteractionSummary, canEdit}`.
- `deletedCommentSchema` (tombstone, no author or text) and `hiddenCommentSchema` (block placeholder: id, createdAt only).
- `commentItemSchema`: discriminated union on `kind: 'comment' | 'deleted' | 'hidden'`.
- `CommentThread` for the roots page: `{root: CommentItem, replies: CommentItem[] (preview, up to 3 oldest), replyCount}`.
- `PostInteractionSummary`: `{commentCount, reactionCount, reactions: [{kind, count}] (top 8 by count), realCount, realPreview: [{user: UserSummary, thumbnailUrl}] (up to 4 latest), viewerReaction: {kind, mediaAssetId?}|null, canInteract}`. `canInteract` is false when the Box is archived.
- `postSchema` gains `interactions: PostInteractionSummary`. `HiddenPost` stays unchanged. Update conformance fixtures and `openapi.test.ts`.
- `CommentInteractionSummary`: `{reactions, reactionCount, viewerReaction}`.
- `SetPostReactionRequest`: `{kind: emoji | 'real' | null, mediaAssetId?}`, with a refinement that `kind === 'real'` if and only if `mediaAssetId` is present. `SetCommentReactionRequest`: `{kind: emoji | null}`.
- `PostReactionEntry`: `{user, kind, image?: {url, thumbnailUrl}, createdAt}`.
- `ReactionPresetsRequest`: `{presets: 5 distinct emoji}`.
- `NotificationSchema`: `{id, type, actor: UserSummary, postId, commentId|null, box: {id, name}, reaction: {kind, thumbnailUrl?}|null, read, createdAt}`.
- `NotificationPage`: a cursor page plus `unreadCount` (capped at 100 and flagged).
- `preferencesSchema` gains `reactionPresets: string[5]`. `updatePreferencesSchema` stays `{appearance}`.

### Operations

| operationId                | Route                                                                               | Rate limit (scope)                   | Errors beyond globals                                            |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `createComment`            | `POST /posts/{postId}/comments` body `{content, parentCommentId?}` → 201            | 300/h `comment-create`               | `POST_NOT_FOUND, COMMENT_NOT_FOUND, BOX_ARCHIVED`                |
| `listComments`             | `GET /posts/{postId}/comments` (roots, newest first, each with the reply preview)   | none                                 | `POST_NOT_FOUND`                                                 |
| `listReplies`              | `GET /comments/{commentId}/replies` (oldest first)                                  | none                                 | `COMMENT_NOT_FOUND`                                              |
| `getComment`               | `GET /comments/{commentId}` returns the comment and its `rootId` (deep links)       | none                                 | `COMMENT_NOT_FOUND`                                              |
| `updateComment`            | `PATCH /comments/{commentId}`                                                       | 300/h `comment-update`               | `COMMENT_NOT_FOUND, COMMENT_ACCESS_DENIED, BOX_ARCHIVED`         |
| `deleteComment`            | `DELETE /comments/{commentId}` → 204, idempotent                                    | 300/h `comment-delete`               | same                                                             |
| `setPostReaction`          | `PUT /posts/{postId}/reaction` → 200 `PostInteractionSummary`, idempotent set-state | 1000/h `reaction-set`                | `POST_NOT_FOUND, BOX_ARCHIVED, MEDIA_NOT_FOUND, MEDIA_NOT_READY` |
| `setCommentReaction`       | `PUT /comments/{commentId}/reaction`                                                | 1000/h `reaction-set` (shared scope) | `COMMENT_NOT_FOUND, BOX_ARCHIVED`                                |
| `listPostReactions`        | `GET /posts/{postId}/reactions?kind=` paged                                         | none                                 | `POST_NOT_FOUND`                                                 |
| `setReactionPresets`       | `PUT /me/reaction-presets`                                                          | 120/h `reaction-presets`             | none                                                             |
| `listNotifications`        | `GET /me/notifications` paged, includes `unreadCount`                               | none                                 | none                                                             |
| `getUnreadCount`           | `GET /me/notifications/unread-count`                                                | none                                 | none                                                             |
| `markNotificationRead`     | `POST /me/notifications/{notificationId}/read` → 204, idempotent                    | 600/h `notification-read`            | `NOTIFICATION_NOT_FOUND`                                         |
| `markAllNotificationsRead` | `POST /me/notifications/read-all` → 204                                             | 600/h `notification-read`            | none                                                             |

**Camera upload limit.** The reservation is the existing `POST /media/uploads` (flat 480/h decorator on `MediaController`). The 120/h camera limit cannot be a second decorator on the same route. Extract the guard's fail-closed logic into a helper (`assertWithinLimit(limiter, subject, policy)` next to `rate-limiter.ts`) and call it in `MediaUploadService.create` when the purpose is `reaction_image`, using scope `camera-upload`. Any limiter exception maps to `RATE_LIMIT_UNAVAILABLE`, same as the guard. Document that the purpose-specific limit lives in the service.

### Realtime (`packages/validation/src/events.ts`)

- Add event types: `comment.created`, `comment.updated`, `comment.deleted`, `reaction.changed` (all on the Box channel, carrying `boxId`, `postId`, optional `commentId`), `notification.created` (user channel, carrying `notificationId`, `postId`) and `notifications.changed` (user channel, sent after mark-read so other tabs update).
- Add optional `commentId` and `notificationId` to `realtimeEventSchema`. **This is mandatory:** `RealtimeBus.dispatch` parses with the schema and zod strips unknown keys.
- Move `boxChannel` and `userChannel` into `events.ts` (re-exported from `realtime-bus.ts`) so the worker publishes to the same channel names.
- IDs only. No text, names or emoji ever travel on the stream.

---

## F. API module layout

All files stay small (services under about 150 lines, complexity ≤ 15). Inject with explicit `@Inject(Token)`.

### `apps/api/src/interactions/`

- `interaction-errors.ts`: `commentNotFound`, `commentAccessDenied`.
- `interaction-policy.service.ts`:
  - `postForWrite(tx, viewerId, postId)`: calls `loadPostContext`, takes the Box row `FOR SHARE` (as `PostService.create` does), and throws `POST_NOT_FOUND` / `BOX_ARCHIVED`.
  - `commentFor(tx, viewerId, commentId, {write})`: loads comment plus root plus post context in one query, applies the block rule on the comment author and the root author, and requires `status='active'` for writes.
- `comment.service.ts` (create / update / delete in transactions):
  - Create: resolve the parent to the root, set `reply_to_user_id`, insert the comment, and insert the `comment.created` activity event in the same transaction (`ON CONFLICT (dedupe_key) DO NOTHING`).
  - Update: `UPDATE … WHERE id = ? AND author = ? AND status='active'`; zero rows maps to `COMMENT_NOT_FOUND`, so concurrent edit versus delete is decided by the database.
  - Delete: tombstone it and delete its `comment_reactions` in one transaction.
  - Publish the Box hint after commit, best effort.
- `comment-query.service.ts`:
  - Roots page: keyset on `(created_at, id)` using `cursorTimestamp`, `afterCursor`, `decodeCursor` and `pageOf` from `platform/pagination.ts`.
  - Replies for the whole page in **one** query: `row_number() over (partition by parent_comment_id order by created_at, id) <= 3` plus a grouped `replyCount` query. This is one extra query per page, no N+1.
  - Authors via `ProfileSummaryService.summaries` (visible rows only, as in `PostQueryService`).
  - The tombstone rule: a deleted root is returned only if it has at least one non-deleted reply.
  - `get`: single comment plus root id.
- `comment-views.ts`: mapper. A `hidden` row carries only `id` and `createdAt`; a `deleted` row carries no text or author.
- `reaction.service.ts` (post reactions) and `comment-reaction.service.ts`.
  - The setter transaction: policy, then `SELECT … FOR UPDATE` on the existing reaction row, then (for `real`) claim the asset, then upsert, then retire the replaced camera image if any, then insert the activity event when the row is new.
  - To detect "new", use `returning({inserted: sql\`(xmax = 0)\`})`. A kind change on an existing row emits **no** activity event, so there is no re-notification. The event's own `dedupe_key` unique constraint also covers re-react after removal.
  - `kind = null` deletes the row and retires its asset (idempotent, returns the summary).
- `reaction-media.ts` (about 80 lines):
  - `claimReactionImage(tx, userId, post)`: `SELECT … FOR UPDATE` on the asset. Require owner = user, purpose `reaction_image`, `box_id` = the post's Box, status `ready`, and not already attached. Every unusable asset answers `MEDIA_NOT_FOUND`; a not-yet-ready one answers `MEDIA_NOT_READY`, matching `assertPhotosUsable`. A unique violation on `post_reactions_media_asset_unique` maps to `MEDIA_NOT_FOUND` via `isUniqueViolation`.
  - `retireReactionImage(tx, assets)`: wraps the existing `retireAssets`.
- `interaction-summary.service.ts`: batch summaries (below).
- `activity-events.ts`: `recordActivity(executor, event)`, the single insert with `ON CONFLICT DO NOTHING`.
- `interaction-erasure.ts`: a plain function `erasePostInteractions(tx, postId)`, which `PostService.remove` calls inside its existing transaction. It selects the post's real reaction assets `FOR UPDATE` and retires them, deletes `post_reactions` and `comment_reactions`, tombstones all comments (content null, `deleted_at`), and deletes the post's notifications. It imports nothing from `posts/`, so there is no cycle.
- `comments.controller.ts`, `reactions.controller.ts` (`ZodPipe`, `uuidParam`, `@RateLimit`, `@CurrentPrincipal`, the same style as `posts.controller.ts`), and `interactions.module.ts`. `PostsModule` imports `InteractionsModule` (exporting the summary service); `InteractionsModule` does not import `PostsModule`.
- Add `InteractionsModule` and `NotificationsModule` to `app.module.ts`.

### How summaries are batched (no N+1)

`InteractionSummaryService.forPosts(viewerId, postIds)` runs a fixed number of queries regardless of page size, and `PostQueryService.feed` and `get` call it once per page next to `mediaFor`:

1. Comment counts: `SELECT post_id, count(*) FROM comments WHERE post_id = ANY($ids) AND status='active' AND NOT hiddenByBlock(viewer, author_user_id) GROUP BY post_id`.
2. Reaction counts: `SELECT post_id, kind, count(*) FROM post_reactions WHERE post_id = ANY($ids) AND NOT hiddenByBlock(viewer, user_id) GROUP BY post_id, kind`.
3. The viewer's own reactions: `WHERE post_id = ANY($ids) AND user_id = $viewer`.
4. Real previews: latest 4 per post (window query), joined to `media_assets`, signed via `MediaUrlService.sign`, with authors via `ProfileSummaryService`.

Hidden (blocked-author) feed items are excluded from the `postIds` passed in, so they get no summary. `forComments` does the same for reaction counts and the viewer reaction on a comment page. Counts are **viewer-relative** (blocked authors excluded) so a number cannot reveal blocked activity. They are computed on read, not denormalised. The indexes above cover each query, and the per-viewer block lookup is a primary-key probe on `user_blocks`. Revisit with denormalised counters only if an `EXPLAIN` in the integration test or the p95 budget says so.

### Notifications: `apps/api/src/notifications/`

- `notification-visibility.ts`: the SQL fragment from section D.
- `notification-query.service.ts`: list (keyset, with batched actor summaries and a batched camera-image sign), `unreadCount` (a bounded subselect with `LIMIT 100`, since it runs on every page via the layout), and `get` (the same fragment for mark-one).
- `notification.service.ts`: `markRead` (`UPDATE … WHERE id = ? AND recipient = ? AND read_at IS NULL`, but first confirm visibility so an invisible ID gives `NOTIFICATION_NOT_FOUND`), and `markAllRead`. Both publish `notifications.changed` to the user channel after commit.
- `notification-views.ts`, `notifications.controller.ts`, `notifications.module.ts`.

### Identity

- `PreferencesService.replacePresets` (upsert) with the route `PUT /me/reaction-presets` on the identity controller. `CurrentUserService` returns the presets with the `DEFAULT_REACTION_PRESETS` fallback when the row is missing.

### Posts

- `PostService.remove` calls `erasePostInteractions` in its transaction.
- `toPostView` adds `interactions`, and `createPost` and `updatePost` responses go through the same summary batch for one post.

---

## G. Worker

New files under `apps/worker/src/activity/`:

- `activity-store.ts`: `claimBatch(tx)`, `markCompleted`, `recordFailure` (backoff `min(60s, 500ms × 2^attempts)` plus jitter, `dead` at 8 attempts).
- `projection-rules.ts`: set-based `INSERT … SELECT … ON CONFLICT (dedupe_key) DO NOTHING RETURNING` per event type, joining `activity_events`, `posts`, `comments`, `box_memberships` and `users`. It uses the shared `hiddenByBlock` fragment so the block rule has one definition. There is no per-event N+1 and no row-by-row visibility query.
- `projector.ts`: `startProjector({database, publisher, logger, intervalMs})`, a poll loop with the same shape as `startDispatcher` (non-overlapping ticks, a stop that awaits the in-flight tick). `main.ts` starts it with `environment.OUTBOX_POLL_INTERVAL_MS` and stops it in the shutdown sequence, before `connection.close()`.
- `realtime-publisher.ts`: publishes a `RealtimeEvent` to `userChannel(recipient)` on the existing `queueConnection`, which is fail-fast. It is best effort, with warn-level logging on failure.
- `maintenance/activity-retention.ts`, called from `reap()` and surfaced in `ReapResult`: purge completed events older than 14 days and notifications older than 90 days in bounded batches, and count `dead` events so the existing error log fires.

**Recipient rules and dedupe keys**

| Event                        | Notification type  | Recipient                                  | Dedupe key                               |
| ---------------------------- | ------------------ | ------------------------------------------ | ---------------------------------------- |
| `comment.created`, no parent | `post.comment`     | post author                                | `post.comment:{commentId}`               |
| `comment.created`, reply     | `comment.reply`    | `reply_to_user_id` (fallback: root author) | `comment.reply:{commentId}`              |
| `post.reaction.set`          | `post.reaction`    | post author                                | `post.reaction:{postId}:{actorId}`       |
| `comment.reaction.set`       | `comment.reaction` | comment author                             | `comment.reaction:{commentId}:{actorId}` |

**Skip conditions** (the event is still marked `completed`, no notification is made): recipient equals actor; recipient not active; recipient not an active member of the post's Box; a block in either direction (`isBlockedBetween` semantics); post not active; target comment not active or reaction already removed.

**Camera reactions in the worker.** Almost everything is the existing media pipeline, driven by the policy table:

- Add `reaction_image: attachReactionImage` to `attachments` in `media/attachments.ts`. It is a no-op, because the API claims the image in the setter transaction, as with `post_image`.
- Widen `maintenance/reaper.ts` `expireUnattachedPhotos` to both purposes. "Unattached" means not in `post_media` for `post_image`, and not in `post_reactions` for `reaction_image`. Factor the predicate out of the 190-line file. The 24 h TTL is reused.
- `derivatives.ts` already follows the policy spec, so no change is expected. Add a test for `reaction_image` sizes.

---

## H. Web

Read `apps/web/node_modules/next/dist/docs/` for Server Actions and `useOptimistic` before coding. Nothing here uses `style` attributes (CSP).

### New shared pieces

- **Toasts** (`components/toast.tsx`, `toast.module.css`, `use-toast`):
  - A client `ToastProvider` in `(signed-in)/layout.tsx`, with a `useToast()` hook and a helper `useActionToast(state)`.
  - One live region: errors use `role="alert"`, everything else `role="status"` with `aria-live="polite"`.
  - Auto-dismiss at 5 s, errors at 8 s, paused on hover and focus. Stack at most 3. The dismiss button is 44×44. Placement is bottom, clear of safe areas. Reduced-motion users get no animation.
  - Forms keep inline `ActionFeedback`; toasts are for button-style actions (reactions, delete, mark read, "new notification").
- **Realtime bridge** (`realtime-bridge.tsx`, `lib/realtime.ts`):
  - Extend `shouldRefresh` for the new types. `comment.*` and `reaction.changed` refresh only `/posts/{postId}`. They do **not** trigger `router.refresh()` on Home or a Box page.
  - The bridge dispatches a `window` CustomEvent (`paldora:realtime`) with the hint. A feed card's `PostInteractions` component filters on its own `postId`, then refetches only its summary with a debounced Server Action. This is the targeted invalidation required by R5.
  - `notification.created` and `notifications.changed` update the bell via the same event, and show a generic toast ("You have a new notification." with a View link; no names, because events carry no content). `/notifications` itself refreshes.
- **`NotificationBell`** (client, in the `AppShell` header next to the avatar, plus the mobile nav): a link to `/notifications` with an accessible count (`aria-label="Notifications, 3 unread"`, shown as "99+" past 99, 44×44 target). The initial value is fetched in `(signed-in)/layout.tsx` via `unread-count`; later values come from the event.
- **`/notifications` page**:
  - Paged list with `MoreLink`. Rows (`NotificationRow`) show the avatar, a sentence by type ("Ada commented on your post"), `LocalTime`, and an unread dot with a text label for screen readers.
  - The row is a `<form>` whose action is `openNotificationAction`: it calls `markNotificationRead` and then `redirect()` to `/posts/{postId}?comment={commentId}#comment-{id}`. It works without JavaScript.
  - "Mark all read" uses `RowActionForm`. The empty state follows the usual `EmptyState` copy.
  - Deleted or hidden targets simply do not appear, per the visibility rule.

### Interaction components

- `PostInteractions` (client): a reaction bar plus a "N comments" link to the permalink. It holds the summary as `useOptimistic` over the server props. Mutations are Server Actions called through `startTransition`.
- `ReactionBar` and `EmojiChooser`:
  - Buttons for the five presets, then a "More" popover with a curated static grid and a free input ("Any emoji") validated by the shared `isSingleEmoji`.
  - The viewer's current choice is shown as `aria-pressed`. Labels are explicit ("React with 👍. 3 people").
  - **Guarded double-tap on 👍:** while a request is pending the button ignores further presses (single flight), and a second press within about 600 ms of the first is ignored, so a quick double tap cannot toggle it on then off. A deliberate later press on the active emoji removes it.
  - The picker opens as a native `<dialog>` (full-width at 390 px, as the lightbox does), with focus moving in and returning to the trigger.
- `CommentThread` (server renders the first page, client for compose and reply):
  - An `<ol>` of roots with one nested reply `<ol>`. Indent one level only (16 px at 390 px). "View N more replies" via a Server Action calling `listReplies`.
  - `CommentComposer`: a textarea with a live counter (`aria-describedby`), `ControlOrMeta+Enter` to submit, and a visible "Replying to Ada" chip.
  - Edit inline (like `PostActions`), delete via `ConfirmAction`.
  - Hidden and deleted rows render neutral placeholder text. Archived Box: composer and reaction controls are replaced by a read-only note (`canInteract` false).
  - Deep link: if `?comment=` is present, `getComment` resolves the root and the thread is pinned at the top and scrolled/focused (`id="comment-{id}"`, `scroll-margin`). The list excludes the pinned root by id.
- `ReactionPresetEditor` at `/settings/reactions` (add to `SettingsNav`): five slots using the same chooser, reset to defaults, saved through `reactionPresetsAction`. It shows the same presets in the bar.
- **Camera capture** (`ReactionCamera`, `use-reaction-capture.ts`):
  - A native `<dialog>` opened from the bar's camera button on a post (never on comments).
  - Flow: idle → requesting permission → live (mirrored preview via CSS) → captured preview (Retake / Send) → uploading → processing → sent.
  - It reuses the existing path: a `prepareReactionImage` server action (a thin sibling of `preparePostPhoto`, purpose `reaction_image`, Box id from the post), then `putToSignedUrl`, then the complete action, then polling, then the `setPostReaction` action with `kind: 'real'`. Extract `untilProcessed` from `use-photo-attachments.ts` into `lib/media-polling.ts` and share it.
  - Capture draws the video to a canvas, downscales to 1280 px, and exports JPEG at 0.88 (this alone strips EXIF; the server strips again).
  - Stop all tracks on close, unmount and `visibilitychange: hidden`. Revoke the preview object URL.
  - **Fallbacks:** insecure context ("Camera needs HTTPS"); no `mediaDevices` or `NotFoundError` ("No camera found"); `NotAllowedError` ("Camera access was blocked", with how to re-enable and a Try again button); upload or processing failure (Retry). There is no file picker by design, so every fallback points back to emoji reactions.
  - **Header fix (required):** `apps/web/next.config.ts` currently sends `Permissions-Policy: camera=(), …`, which blocks `getUserMedia` entirely. Change to `camera=(self)` and keep microphone, geolocation and browsing-topics empty. Add a unit assertion and an e2e check on the header. The CSP already allows `blob:` for `img-src` and `media-src`, so no CSP change is needed.
- Real-reaction strip: on the permalink and in feeds, up to 4 thumbnails with alt text "{name}'s camera reaction" and a link to the full list (`listPostReactions`).

### Accessibility and 390 px

- WCAG 2.2 AA, 44×44 targets, visible focus, labels on every control, and semantic lists.
- The unread dot has a text equivalent; counts that change are announced by a polite live region.
- No horizontal overflow at 390 px (the existing `expectNoOverflow` helper); the picker and camera dialogs fit within safe areas.
- Update `app/components/README.md` with every new component.
- Server Actions use the `post-photos.ts` pattern for button-style calls: `async function` declarations, `unknown` input validated with zod, and `ActionOutcome<Data>` results. Form-style actions use `runForm` / `runFormWithData`, with `paths` omitted for reaction actions so a reaction does not revalidate every feed.

---

## I. Tests

**Unit**

- `isSingleEmoji` table (ZWJ sequences, flags, keycaps, skin tones, `'real'`, multiple emoji, empty, whitespace).
- Comment and reaction schema refinements (real iff `mediaAssetId`; 5 distinct presets).
- The mappers: a hidden or tombstoned row never copies text or author.
- Recipient and dedupe-key rules.
- Notification visibility fragment shape.
- The double-tap guard, toast timing and stacking, `shouldRefresh` for the new hints, camera error-name mapping, canvas downscale math, and `Permissions-Policy` string.
- Domain policy row for `reaction_image`.

**Schema integration** (`packages/database/src/schema.integration.test.ts`)

- Reply-to-reply is rejected by the generated-column FK.
- A cross-post parent is rejected.
- The lifecycle checks, the real-media pairing, a second use of a media asset, `kind='real'` on a comment reaction, the activity-event type versus `comment_id` check, and the dedupe uniqueness on both tables.
- Box delete cascades everything.
- Migrations still apply twice and cleanly from empty.

**API integration** (all through `scripts/with-test-database.mjs`; tests live in `apps/api/src/interactions/*.integration.test.ts` and `notifications/*.integration.test.ts`)

- Role × action matrix from section D: owner, admin, member, left, removed, stranger, suspended, archived Box, guessed and malformed IDs, deleted post, deleted comment, reply to a reply (attaches to root, `reply_to_user_id` set), reply to a tombstone, comment length 2000 vs 2001.
- Paging with identical timestamps across roots and replies; the reply preview limit; tombstone-with-replies shown versus tombstone-without hidden; counts exclude deleted and blocked.
- Reaction set / change / remove / idempotent repeat for post and comment; real ↔ emoji switching retires the old image; one use of an image; someone else's image, wrong Box, not-ready image.
- Query-count test: a Home feed page of 20 posts runs a constant number of queries.
- Presets: defaults, replace, and the validation errors.
- Rate limits for comment, reaction and the camera purpose, including fail-closed when Redis is down (`RATE_LIMIT_UNAVAILABLE`).
- **Block rows added to `apps/api/src/social/block.integration.test.ts`**: comments (placeholder with no author), reactions (omitted and not counted), counts, replies, and notification visibility in both block directions, plus unblock then re-block, and a block versus comment-create race.
- Post deletion erases comments, reactions, notifications and images (asserting zero stored objects, via `MemoryObjectStorage` after the worker runs).
- Box deletion retires camera images.
- Notification API: list paging, unread count, mark one, mark all, other user's ID gives `NOTIFICATION_NOT_FOUND`, and the visibility matrix (left the Box, blocked after creation, comment deleted, reaction removed, post deleted).
- `route-inventory.test.ts` and `contract:check` stay green in every slice.

**Race tests** (modelled on the existing ones)

- Two simultaneous reactions by one user (PK decides).
- Concurrent edit versus delete of one comment.
- Two requests claiming one image.
- Archive versus comment create (the `FOR SHARE` lock).
- Block versus comment create.
- Double mark-read.

**Worker integration** (`apps/worker/src/activity/*.integration.test.ts`, with fault injection)

- Create-then-project for each of the four types.
- Dedupe: the same event projected twice, and re-react after removal.
- Two projectors running concurrently produce no duplicates (SKIP LOCKED).
- A poison event: a savepoint rolls back only that event, attempts and backoff advance, it reaches `dead` at 8, and its neighbours in the batch still complete.
- Crash simulation: abort the transaction before commit and confirm the event is still pending and re-projects exactly once.
- Redis down at publish: the notification exists and the event is `completed`.
- Skip rules: self action, block before projection, recipient left the Box, comment deleted before projection, post deleted.
- Retention purges only old completed events and old notifications.
- Reaper: unattached `reaction_image` is removed with zero orphaned objects; an attached one is kept.
- `reaction_image` processing through the media pipeline, including a Box deleted mid-processing.

**Realtime integration** (using `testing/event-stream.ts`)

- `notification.created` reaches only the recipient's stream.
- Box hints reach members only, and stop after removal.
- `notifications.changed` is delivered to the user's other streams.
- Events carry only IDs (assert the key set).
- The schema keeps `commentId` and `notificationId` through the bus.

**Full-stack Playwright** (desktop and 390 px; `expectAccessible` and `expectNoOverflow` on every new state)

- Two people in a Box: Ada posts; Grace comments, replies to a reply (it nests under the root), reacts with 👍 (the double-click guard leaves it set), reacts with a custom emoji, and changes her mind.
- Ada sees the bell count go up without reloading, the generic toast, and the notifications page; she follows the deep link, which pins and focuses the comment, then marks it read; "Mark all read" works.
- Grace edits and deletes her comment; the tombstone behaviour and a disappearing notification are verified.
- Ada blocks Grace: placeholders appear, notifications vanish, and the counts drop.
- An archived Box is read-only.
- Camera: launch Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (add a project-level launch option in `playwright.fullstack.config.ts`) and grant the `camera` permission. Capture, send, see the thumbnail appear after the worker finishes, and replace it with an emoji.
- Permission-denied path (a context without the grant shows the message and a working "Try again"; emoji reactions still work).
- Presets edited in Settings appear in the bar.
- The `Permissions-Policy` header contains `camera=(self)`.
- Gates as in CLAUDE.md §M.

---

## J. Ordered work breakdown (8 slices, each ends green and committable)

**Slice 1: data model, domain, schemas, no routes**

- Files: `packages/database/src/schema.ts`, new `packages/database/drizzle/0005_interactions_notifications.sql` (+ snapshot/journal), `packages/database/src/schema.integration.test.ts`, `packages/domain/src/{reactions,media,errors,index}.ts`, new `packages/validation/src/{comments,reactions,notifications}.ts`, `packages/validation/src/{events,index,identity}.ts`, `docs/database.md`.
- Do not touch `routes.ts` yet (the inventory test demands controllers). Add the realtime event types, the optional ids, and the shared channel helpers now, so later slices don't collide.
- Add `reaction_image` handling forced by `Record<MediaPurpose, …>`: a no-op entry in the worker `attachments.ts`.
- Exit gate: unit and schema integration tests pass; migrations apply twice.

**Slice 2: comments API plus summaries**

- Files: `apps/api/src/posts/post-context.ts` (moved), `apps/api/src/interactions/*` (policy, comment service, query, views, summary, erasure, controller, module), `app.module.ts`, `posts/{post-query.service,post.service,post-views,posts.module}.ts`, `routes.ts`, `contracts/openapi.json`, `packages/api-client/src/index.ts`, and the integration tests including block rows.
- Includes `Post.interactions` (with reaction counts read-only) and fixtures.
- Depends on slice 1.

**Slice 3: emoji reactions, presets, activity recording**

- Files: `interactions/{reaction.service,comment-reaction.service,activity-events}.ts`, the reactions controller, the identity files for presets, the Box hints in comment/reaction services, `routes.ts`, the client, tests.
- Depends on slice 2 (shared files; strictly after it).

**Slice 4: camera reactions backend**

- Files: `interactions/reaction-media.ts`, the `real` branch in the reaction service, `listPostReactions`, `media-upload.service.ts` (purpose limit via the extracted `assertWithinLimit`), `apps/worker/src/media/attachments.ts`, `apps/worker/src/maintenance/reaper.ts`, `apps/web/next.config.ts` (header), tests, `docs/adr/011` addendum.
- Depends on slice 3.

**Slice 5: projector, notifications API, realtime delivery**

- Files: `apps/worker/src/activity/*`, `apps/worker/src/{main,jobs}.ts`, `maintenance/activity-retention.ts`, `apps/api/src/notifications/*`, `routes.ts`, the client, worker/API/realtime tests.
- Depends on slice 1; for realistic tests it uses events from slice 2/3, but can insert events directly. **Can run in parallel with slices 3 and 4.** Conflict points are limited to `routes.ts`, `api-client/src/index.ts` and `errors.ts`, resolved by rebase. Make these edits append-only.

**Slice 6: web foundation — toasts, bell, bridge**

- Files: `components/toast*`, `components/notification-{bell,row}.tsx`, `app/(signed-in)/notifications/page.tsx`, `app/actions/notifications.ts`, `app-shell.tsx`, `(signed-in)/layout.tsx`, `lib/realtime.ts`, `components/realtime-bridge.tsx`, tests, README.
- Needs slice 5's API for the bell and page. The toast and bridge parts can start after slice 1. The bridge change must land **before** slice 7.

**Slice 7: web comments and emoji reactions**

- Files: `components/{post-interactions,reaction-bar,emoji-chooser,comment-thread,comment-composer}.tsx`, `post-card.tsx`, `app/actions/{interactions,presets}.ts`, `(signed-in)/posts/[postId]/page.tsx`, `(signed-in)/settings/reactions/page.tsx`, `settings-nav.tsx`, CSS modules, e2e for comments/reactions/notifications.
- Depends on slices 2, 3 and 6.

**Slice 8: web camera, final e2e, docs**

- Files: `components/reaction-camera.tsx`, `use-reaction-capture.ts`, `app/actions/reaction-media.ts`, `lib/media-polling.ts` (extracted), `use-photo-attachments.ts`, `playwright.fullstack.config.ts` (fake-camera flags), camera e2e, `docs/{api,database,security,architecture}.md`, new `docs/adr/015-interactions-and-activity-projector.md`, ADR 012 and 013 addenda, `docs/rebuild-plan.md` (Phase 5 delivery notes and status), components README.
- Depends on slices 4 and 7.
- Exit gate: all standard gates from CLAUDE.md §M, plus the full-stack suite.

**Parallelism summary:** slices 1 → 2 → 3 → 4 are strictly sequential (shared API files). Slice 5 can run in parallel with 3–4. Slice 6's toast and bridge work can start after slice 1; it finishes after slice 5. Slices 7 and 8 are sequential and come last.

---

## K. Risks and pitfalls (learned in Phases 1–4)

- **`Permissions-Policy` blocks the camera.** The current header is `camera=()`. Camera capture silently fails (`NotAllowedError`) until it is changed to `camera=(self)`. Easy to miss because it looks like a user-denied permission.
- **Zod strips unknown keys on the bus.** `RealtimeBus.dispatch` parses with `realtimeEventSchema`, so any new field missing from the schema vanishes in transit.
- **Route inventory is exact.** `route-inventory.test.ts` fails if the registry and controllers differ, or if a non-GET route lacks a rate-limit or exemption decision. Add registry entries and controllers in the same commit.
- **Soft-deleted posts do not cascade.** Interactions, notifications and camera images would stay unless `erasePostInteractions` runs inside the delete transaction. Box delete does cascade, but camera images must be retired first (the existing loop covers it by `box_id`).
- **The media tables have three constraints and an index to widen** (`purpose_check`, `box_scope_check`, `unattached_index`). Forgetting `box_scope_check` makes every reservation fail with a check violation, not a friendly error.
- **`Record<MediaPurpose, …>` forces updates** in the policy table and the worker `attachments` map. Let the compiler find them.
- **Purpose-specific rate limits** cannot be a second decorator on `POST /media/uploads`. Put the 120/h camera limit in the service, and keep it fail-closed.
- **Notification content must come from live rows.** Do not copy comment text or emoji into `notifications`, or removal and block checks stop working.
- **Savepoints in the projector.** One poisoned event must not roll back the batch. Test it.
- **No network calls inside open transactions.** Publish Redis hints only after commit; never sign URLs inside a write transaction.
- **Use the shared block helper.** Reuse `hiddenByBlock` / `isBlockedBetween` from `@paldora/database`; never write a second block query. Add rows to the ADR 013 matrix test.
- **Next 16:** Server Actions must be `async function` declarations (Turbopack requires it for every export of a `'use server'` file). Read the local docs before writing `useOptimistic` and Server Action code.
- **Typed routes** need a string cast for hrefs with query strings or fragments (the `MoreLink` pattern), e.g. `/posts/{id}?comment={id}#comment-{id}`.
- **Prettier reformatting** breaks naive string-replace edits. Apply changes with real edits, then run `pnpm format`.
- **Run integration tests only through `scripts/with-test-database.mjs`** (`pnpm test:integration`). Never against the dev database.
- **Drizzle migrations must be generated, then reviewed.** Generated columns and composite FKs may need hand edits in the new file only. Never touch 0000–0004.
- **No `style` attributes** (CSP forbids inline styles in production). Use CSS Modules and classes.
- **The React hooks lint rule is not installed.** Do not add `eslint-disable` comments for it. The only allowed disables are `no-await-in-loop` with a protocol justification, as elsewhere.
- **`exactOptionalPropertyTypes`** is on: conditional spreads for optional fields, as in `ProfileChanges` and `parseHint`.
- **Whole-page refresh** was a legacy flaw. Do not call `router.refresh()` from interaction hints on Home or Box pages; use the targeted summary refetch.
- **Complexity and length limits** (≤ 15, ≤ 150 lines per function): split the reaction setter into policy, claim, upsert, and event steps from the start.
- **Fake-camera e2e** needs Chromium flags in the full-stack config; without them the capture test hangs on a permission prompt.
