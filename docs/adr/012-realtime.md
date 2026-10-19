# ADR 012: One SSE stream per tab, scoped channels, targeted invalidation

Status: accepted (2026-10-19), built in Phase 3. Implements R5.

## Context

The legacy realtime design had four problems:

- Every connection ran a database access check for every event on one global
  Redis channel, which costs O(connections × events).
- Any event called `router.refresh()` on the whole page.
- Streams never re-checked token expiry or account status after connecting.
- Two SSE endpoints were never used.

## Proposed design

- **One stream per tab.** `GET /api/v1/me/events`, authenticated per ADR 003.
- **Scoped channels.** One Redis channel per Box (`box:{id}`) and per user
  (`user:{id}`). A connection subscribes according to its current
  memberships, and membership changes publish resubscribe or close commands.
- **Payloads stay minimal.** IDs, action, and timestamp only. They remain
  invalidation hints, and clients re-fetch through normal authorization.
- **Stream lifetime ends at or before the access token expires.** Clients
  reconnect with a fresh token, and the server re-checks user status on
  reconnect.
- **Reconnect.** `Last-Event-ID` resume is best effort; on a gap the client
  does a full refresh.
- **Targeted invalidation.** Clients invalidate only the affected queries or
  segments and never interrupt editors with unsaved changes.

## Validation

- Privacy tests: removal mid-stream, blocking mid-stream, token expiry.
- A load test with N concurrent connections, with a budget defined in
  Phase 3.

## Revisit when

Bidirectional features (presence, typing) are required; consider WebSockets
then.

## What Phase 3 built

- `GET /me/events` (SSE): one stream per tab. First event `resync`; then
  `post.created|updated|deleted` for Boxes the person belongs to,
  `memberships.changed`, and a `ping` every 25 s. Payloads are a type, IDs, and
  a timestamp.
- `RealtimeBus`: one Redis publisher and one shared subscriber per API process,
  with reference-counted `paldora:box:{id}` and `paldora:user:{id}` channels.
  No database query happens per event.
- Membership changes (create, accept, leave, remove, Box delete) publish
  `memberships.changed` after commit; the stream recomputes its Box set, so a
  removed member stops receiving that Box's events immediately and a new member
  starts.
- Streams end at access-token expiry, when the Redis subscriber drops, or after
  an error. Clients reconnect with jittered backoff and a fresh token; every
  connection starts with `resync`. At most 5 streams per person; 120 connects
  per hour.
- Publishing is best effort after commit (no durable outbox until Phase 5).
- Web: `RealtimeBridge` (one fetch-based stream per tab, Bearer token from the
  Supabase browser session) refreshes the page only when the hint concerns it:
  Home for any post change, a Box page for that Box, a post page for that post,
  membership-shaped pages for membership changes.

Not done: `Last-Event-ID` replay (a reconnect resyncs instead) and a k6 load
profile.

## Addendum: Phase 5 (2026-10-20)

- **New event types.** `comment.created|updated|deleted` and
  `reaction.changed` go to the post's Box channel (`boxId`, `postId`, and
  `commentId` where there is one); `notification.created` (`notificationId`,
  `postId`) goes to the recipient's user channel, published by the worker's
  activity projector after its transaction commits;
  `notifications.changed` (no IDs) goes to the reader's own channel after a
  mark, so their other tabs update. All are still IDs plus a timestamp, and
  every optional ID is declared in `realtimeEventSchema`, because the bus
  strips unknown keys in transit.
- **Window-event dispatch.** `RealtimeBridge` no longer has to refresh the
  page for everything: it re-dispatches each hint as a `paldora:realtime`
  `CustomEvent` on `window` (`useRealtimeHint` subscribes). A feed card's
  `PostInteractions` filters on its own `postId` and refetches only its
  summary through a debounced Server Action; the bell updates its count.
  Interaction hints refresh the route only on the post's own page, and never
  on Home or a Box page. Notification hints show a generic toast that names no
  one (events carry no content).
- **Publishing** stays best effort after commit. The durable intent is the
  `activity_events` outbox ([ADR 015](015-interactions-and-activity-projector.md)),
  so a lost hint costs a stale count until the next fetch, never a lost
  notification.
