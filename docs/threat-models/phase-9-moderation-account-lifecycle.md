# Phase 9 threat model: moderation and account lifecycle

Status: working review. No public signup or moderator endpoint is enabled by
this document. See [ADR 019](../adr/019-moderation-authority-and-audit.md).

## Assets and trust boundaries

Private content, reporter identity, case evidence, account status, export
archives, media object keys and audit history are sensitive. Ordinary members,
staff browsers, the API, PostgreSQL, Redis, the worker, Supabase Auth and
private object storage are separate trust boundaries. Staff authentication
proves identity; database role checks authorize each case and action. A signed
download URL is a bearer capability and must be short-lived and never logged.

## Attacks and required controls

| Attack                                                  | Control and verification                                                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guess a user, Box, post or comment ID through reporting | Resolve the target through its ordinary access policy before accepting; use the same absence envelope for missing, blocked, removed and deleted targets. Test both block directions and former membership.                        |
| Learn who reported whom                                 | Reporter receipts are owner-only; staff case views never appear in ordinary APIs, logs, notifications or SSE. Test cross-user receipt reads.                                                                                      |
| Promote a member to moderator                           | Staff grant is a database-owned, audited operator action; API payloads and JWT claims never confer staff authority. Test forged claims and roles.                                                                                 |
| Abuse case access or alter the audit                    | Require role and record case access; append-only audit enforced by SQL permissions/trigger, with idempotent actions. Test update/delete rejection and duplicate action keys.                                                      |
| Hide a post but keep its image or preview readable      | Enumerate every content and signed-media path; enforce hidden state before signing or rendering, including feeds, Rooms, Memories, comments, reactions and notifications. Test prior URLs until expiry and stop new URL issuance. |
| Keep a suspended SSE connection                         | Recheck account status at stream delivery/heartbeat and close promptly; test suspension during an open stream.                                                                                                                    |
| Delete user while a Room banner or asset remains        | Clear Room banner first, retire every owned asset through the outbox, then remove user; retry safely after every crash point. Test foreign-key and object-store outcomes.                                                         |
| Export another member's shared content                  | Export only owned data and currently authorized references; private artifact with expiry and one-owner access; test revoked Box access and guessed export ID.                                                                     |
| Open signup before response capacity                    | Keep registration disabled until rate limits, case workflow, appeals/contact path, deletion/export and hosted smoke checks pass.                                                                                                  |

## Read-path inventory before takedown

Current API entry points include post pages and feeds (`posts`), Box views,
comment/reaction summaries (`interactions`), Life Updates, Memories candidates,
Room content and personalization, profile/avatar summaries, notifications and
`/me/events`. Media URLs are issued in `media-urls.service.ts` after caller
authorization, with additional signing in interaction and Room view services.
Each target kind needs a central hidden-state predicate reused by every route;
do not patch only the page endpoint. Existing 900-second URLs cannot be
retroactively revoked by a database flag; choose object retirement or an
acceptable exposure window before shipping takedown.

## Account-deletion dependency inventory

`users` is referenced by identity preferences, profiles, friendships/blocks,
Box membership and invitations, posts, comments and reactions, activity and
notifications, Life Updates, Rooms and Top Friends. Many references cascade;
`media_assets.owner_user_id` is `RESTRICT`. `rooms.banner_media_id` references
an owned `room_banner` asset. Media derivatives and deletion outbox rows require
object-key snapshots before cascades. Existing Box ownership must be transferred
or the Box deliberately retired; a member's deletion must not silently orphan
a community. The deletion workflow must enumerate both SQL references and
private object keys at execution time and prove idempotency under retry.

## Review gates

Before public signup: targeted authorization integration tests; migration
reapply; fail-closed role and rate-limit tests; desktop/390px and accessibility
checks; real-service suspension/SSE, takedown/media, export and deletion E2E;
hosted smoke; operations and retention review. Unknown retention or hosted
topology keeps the signup gate closed.
