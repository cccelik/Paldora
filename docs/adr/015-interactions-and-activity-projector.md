# ADR 015: Interactions and the activity projector

Status: accepted; built in Phase 5 (2026-10-20). Plan:
[phase-5-interactions-notifications.md](../plans/phase-5-interactions-notifications.md).
Builds on [ADR 011](011-media-pipeline.md) (camera images),
[ADR 012](012-realtime.md) (hints), and [ADR 013](013-directional-blocks.md)
(blocks).

## Context

Comments, reactions, camera reactions, and notifications are the first
features where one person's action writes something another person reads
later, possibly after a block, a removal from the Box, or a deletion. The
legacy build had three weaknesses here:

- **A 681-line `interaction.service.ts`** owned every rule.
- **The projector ran inside the API process**, so notification work shared
  request capacity and was lost on a crash between commit and projection.
- **Copies of content.** Notification rows and counts were easy to get wrong
  after a block, because visibility was not rechecked when they were read.

## Decision

- **One reaction per person per target.** `post_reactions` and
  `comment_reactions` have the primary key `(target, user)`. Setting a
  reaction is set-state (`PUT …/reaction` with an emoji, `real` plus a
  camera upload, or `null`), so a retry is harmless. A camera image and an
  emoji are mutually exclusive on a post; the replaced image is retired in the
  same transaction. A per-person, per-target advisory lock orders concurrent
  sets; the primary key and the unique `media_asset_id` index are the final
  word. Changing the emoji does not notify again.
- **The activity outbox.** Every new comment and every first reaction writes
  an `activity_events` row in the same transaction as its cause. It holds
  real foreign keys (actor, post, comment), never content, and carries the
  notification's dedupe key (`post.comment:{comment}`, `comment.reply:{comment}`,
  `post.reaction:{post}:{actor}`, `comment.reaction:{comment}:{actor}`). The
  key is unique on both `activity_events` and `notifications`, so a retried
  request, a changed emoji, or a re-react after removal never notifies twice.
- **The projector runs in the worker.** A poll loop beside the media
  dispatcher claims due events with `FOR UPDATE SKIP LOCKED` (at most 50),
  projects each in its own **savepoint** with one set-based
  `INSERT … SELECT … ON CONFLICT (dedupe_key) DO NOTHING`, and marks it
  completed. A failing event rolls back only its savepoint, then backs off
  with jitter and becomes `dead` after 8 attempts. The skip rules (self
  action, inactive recipient, recipient no longer in the Box, a block in
  either direction via the shared `hiddenByBlock`, post or comment no longer
  active, reaction already removed) live in that statement. Hints
  (`notification.created`) are published after commit, best effort.
- **Notifications store IDs only, and visibility is decided at read time.**
  Every list, count, and mark applies one visibility fragment: own row, post
  active, active membership in its Box, actor active with a public face and
  not in a block with the reader either way, and the target still live (the
  comment active, the actor's reaction row still present). Display data
  (names, emoji, the camera thumbnail) is joined live and signed only after
  those checks. A block hides a notification at once and an unblock restores
  it; someone else's ID and a hidden one both answer `NOTIFICATION_NOT_FOUND`.
- **Viewer-relative counts.** Comment and reaction counts exclude people in
  a block relationship with the viewer, so a number never reveals blocked
  activity. Blocked comments render as neutral placeholders; blocked reactors
  are omitted without a placeholder.
- **Tombstones.** Deleting a comment erases its text and reactions and keeps
  the row, so replies keep their thread; a deleted root is shown only while
  it has live replies. Posts are soft-deleted, so `erasePostInteractions`
  removes their comments' text, reactions, notifications, and camera images
  inside the post's delete transaction.
- **Depth in the database.** One reply level is enforced by generated depth
  columns and a composite self-reference `(parent_comment_id, post_id,
parent_depth) → (id, post_id, depth)`; a reply to a reply is re-attached to
  the root by the service (recording `reply_to_user_id`), and the database
  rejects anything deeper or across posts.
- **Small services.** The API's `interactions` module splits policy, comment
  writes, comment queries, views, summaries (a constant number of queries per
  feed page), reactions, reaction media, and erasure; `notifications` only
  reads and marks.

## Rejected alternatives

- **Projecting inside the API request.** Adds latency and failure modes to
  every comment, and loses the notification on a crash after commit.
- **Projecting through BullMQ.** Projection is pure SQL with no network call
  between claim and ack; a queue hop would add a second copy of intent in
  Redis without buying anything.
- **Copying text, emoji, or names into notifications.** They would survive a
  block, a deletion, an edit, or an un-react, and leak.
- **Fan-out to everyone in a thread.** Spams, and reveals who participates.
- **Several reactions per person, or a separate camera-reaction table.**
  Multiplies counts and race cases for no product value; one row per person
  keeps "what did I react" a single question.
- **Depth checked only in the service.** A race or a bug could store a
  third level; the composite key makes it impossible.
- **Hard-deleting comments.** Orphans replies or forces cascades that erase
  other people's words.

## Consequences

- Notifications appear after one projector poll (250 ms in e2e, configurable
  by `OUTBOX_POLL_INTERVAL_MS`), not synchronously.
- Every notification read runs the visibility fragment; the unread count is
  capped at 100 to bound it.
- Completed events are purged after 14 days and notifications after 90, by
  the reaper.
- The worker's integration files run one at a time, because two reapers in
  one database can lock each other's rows.

## Revisit when

- Projector lag or poll cost is measured as a problem: consider `LISTEN/NOTIFY`
  to wake the loop (still with the outbox as the source of truth).
- Notifications need push or email delivery (Phase 10+): add a delivery
  outbox keyed by notification, not new content copies.
- Read-time visibility becomes a measured bottleneck on large inboxes: add a
  covering index or a bounded materialized unread count, keeping the fragment
  as the authority.
- Moderation (Phase 9) needs to act on other people's comments: add it as a
  separate policy, never by widening the author-only rules.
