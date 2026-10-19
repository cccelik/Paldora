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
