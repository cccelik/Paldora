# ADR 013: Directional user_blocks table

Status: accepted (2026-10-19). Decision D1 confirmed by the owner: content from
a blocked person is hidden in shared Boxes. Implements R8.

## Context

The legacy build stored a block as a status on the single `friendships` row
for a pair. That caused two problems:

- **No mutual blocks.** A blocked user could not block back. They received
  `INTERACTION_NOT_AVAILABLE`.
- **Fragile protection.** When the blocker unblocked, nothing was left to
  protect the other side.

Block filtering was also inconsistent. Life Updates hid blocked authors, while
Box and Home post feeds did not.

## Design

- **Schema.** A `user_blocks (blocker_id, blocked_id, created_at)` table,
  unique per direction, with a check constraint that the two IDs differ.
  `friendships` keeps only `pending/accepted/declined`.
- **Shared filter.** A symmetric SQL helper `is_blocked_between(a, b)` (or
  an equivalent Drizzle fragment) is used by **every** visibility query:
  feeds, Memories, Rooms, notifications, invitations, search.
- **Side effects.** Blocking removes the friendship and the Top Friends
  references in the same transaction.
- **Shared Boxes (D1, confirmed).** Content is hidden in both directions
  (a block by either person hides the other's posts, Life Updates, comments,
  and reactions from the blocker's view and vice versa), with a neutral
  placeholder that never reveals who blocked whom. Boxes stay intact: a block
  never removes anyone from a Box, and Box owners and admins still see
  membership. Each content phase (posts in 3, comments in 5, Life Updates in 6) applies the shared filter and adds its rows to the authorization matrix
  test.

## Validation

An authorization-matrix integration test covers every content type in both
block directions, plus unblock and re-block sequences.

## What Phase 2 built

- `user_blocks` (directional, PK per direction); `friendships` hold only
  `pending/accepted/declined`.
- `isBlockedBetween` and `hiddenByBlock` in `packages/database`: the single
  symmetric definition later phases must use.
- `lockPair`: an advisory transaction lock per pair, taken by friend requests,
  accepting them, blocking, inviting, and accepting invitations. Disabling it
  makes 7 of the 24 race tests fail, so it is not decorative.
- Blocking is one transaction: record the block, delete any friendship or
  request, revoke pending Box invitations between the two. Shared Boxes are
  untouched.
- Non-leaking outreach: reaching a person who blocked you returns
  `USER_NOT_FOUND`, byte-for-byte the response for a username that does not
  exist.

Still to do by phase: posts (3), comments and reactions (5), Life Updates (6),
Rooms and Top Friends (7), each adding rows to the matrix test.

## Addendum: Phase 5 rows (2026-10-20)

Comments, reactions, and notifications use the shared `hiddenByBlock` /
`isBlockedBetween` definition. `hiddenByBlock` now also accepts a column or
SQL expression as the viewer, so the projector's set-based statement can use
it with the recipient as the viewer. Rows added to the matrix,
tested in both directions with unblock and re-block:

| Content              | Behaviour across a block (either direction)                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Comments and replies | Neutral placeholder (id and time only, no author or text); a hidden root hides its thread; cannot be fetched or replied to (`COMMENT_NOT_FOUND`)             |
| Reacting             | With the post author: `POST_NOT_FOUND`; with the comment's or its root's author: `COMMENT_NOT_FOUND`                                                         |
| Reactions and counts | Blocked reactors omitted from `listPostReactions`, counts, and the camera preview strip, with no placeholder; counts are viewer-relative                     |
| Notifications        | Not created when a block exists at projection; hidden at read time when a block appears later, restored on unblock; marking answers `NOTIFICATION_NOT_FOUND` |
| Races                | A comment racing a block never becomes visible to the blocker                                                                                                |

Tests: `apps/api/src/social/block.integration.test.ts`,
`apps/api/src/interactions/reactions/reactions.integration.test.ts`,
`apps/api/src/notifications/notifications.integration.test.ts`, and
`apps/worker/src/activity/projector.integration.test.ts`. Still to do: Life
Updates (6), Rooms and Top Friends (7).

## Addendum: Phase 6 rows (2026-10-20)

D1 applies to Life Updates and Memories through the same `hiddenByBlock`
definition ([ADR 016](016-life-updates-and-memories.md)). Rows added to the
matrix, tested in both directions with unblock and re-block:

| Surface                     | Behaviour across a block (either direction)                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Home feed                   | One neutral `hidden` placeholder per Life Update (deduped), naming no author, text, photos, or Boxes                  |
| Box feed                    | The neutral placeholder for that Box's backing post                                                                   |
| Detail and backing posts    | `LIFE_UPDATE_NOT_FOUND`; the backing post is `POST_NOT_FOUND`                                                         |
| Memories (personal and Box) | **Omitted**, with no placeholder and not counted in the summary (Phase 6 decision 15: a timeline has no slot to keep) |
| Counts                      | Viewer-relative, unchanged from Phase 5                                                                               |
| Own Only Me                 | Unaffected                                                                                                            |
| Unblock                     | Content returns everywhere                                                                                            |

Tests: `apps/api/src/social/block.integration.test.ts`,
`apps/api/src/life-updates/life-updates.integration.test.ts`,
`apps/api/src/memories/memories.integration.test.ts`, and the full-stack
`apps/web/e2e/full-stack/{life-updates,memories}.spec.ts`. Still to do: Rooms
and Top Friends (7).

## Addendum: Phase 7 rows (2026-10-20)

D1 applies to Rooms and Top Friends through the same `hiddenByBlock`
definition and its SQL twin `paldora.is_blocked_between`
([ADR 017](017-rooms.md)). Rows added to the matrix, tested in both
directions with unblock and re-block:

| Surface                             | Behaviour across a block (either direction)                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room view (`GET /rooms/{username}`) | `ROOM_NOT_FOUND` for both people at every visibility, byte-identical to a missing Room; the web shows the shared not-found page with a 404                       |
| Room content, summary, photos       | The same `ROOM_NOT_FOUND` (one access query runs first)                                                                                                          |
| Top Friends of the pair             | The entry is deleted in the block's transaction (trigger on `user_blocks`, plus the friendship trigger), both directions; re-adding is `TOP_FRIEND_NOT_ELIGIBLE` |
| A visitor blocked with a Top Friend | That one entry is omitted for that visitor, with no placeholder and no count; everyone else still sees it                                                        |
| Previews of a third author          | Not possible: previews show only the owner's content, already filtered by `hiddenByBlock`                                                                        |
| Unblock                             | The Room follows its normal visibility again; removed Top Friends are not restored (the friendship is gone)                                                      |

Tests: `apps/api/src/social/block.integration.test.ts` ("Rooms and Top
Friends across a block"), `apps/api/src/rooms/services/room-access.integration.test.ts`
(parity), `apps/api/src/rooms/services/room-top-friends.integration.test.ts` (races),
`packages/database/src/schema.integration.test.ts` (triggers), and the
full-stack `apps/web/e2e/full-stack/{rooms,room-customize}.spec.ts`. The
matrix now covers every Phase 1–7 surface.
