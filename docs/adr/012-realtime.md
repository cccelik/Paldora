# ADR 012: One SSE stream per tab, scoped channels, targeted invalidation

Status: proposed (Phase 3). Implements R5.

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
