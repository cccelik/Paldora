# ADR 013: Directional user_blocks table

Status: proposed (Phase 2). Depends on product decision D1. Implements R8.

## Context

The legacy build stored a block as a status on the single `friendships` row
for a pair. That caused two problems:

- **No mutual blocks.** A blocked user could not block back. They received
  `INTERACTION_NOT_AVAILABLE`.
- **Fragile protection.** When the blocker unblocked, nothing was left to
  protect the other side.

Block filtering was also inconsistent. Life Updates hid blocked authors, while
Box and Home post feeds did not.

## Proposed design

- **Schema.** A `user_blocks (blocker_id, blocked_id, created_at)` table,
  unique per direction, with a check constraint that the two IDs differ.
  `friendships` keeps only `pending/accepted/declined`.
- **Shared filter.** A symmetric SQL helper `is_blocked_between(a, b)` (or
  an equivalent Drizzle fragment) is used by **every** visibility query:
  feeds, Memories, Rooms, notifications, invitations, search.
- **Side effects.** Blocking removes the friendship and the Top Friends
  references in the same transaction.
- **Shared Boxes (D1).** Recommended: hide each other's content in both
  directions, with a neutral placeholder that never reveals who blocked whom.

## Validation

An authorization-matrix integration test covers every content type in both
block directions, plus unblock and re-block sequences.
