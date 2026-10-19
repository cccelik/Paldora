# Database

PostgreSQL 17 is the source of truth ([ADR 001](adr/001-postgresql-drizzle.md)).

- **Schema.** Every table lives in the `paldora` schema. The migration journal
  is `paldora.__drizzle_migrations`.
- **Migration rules.** Safety rules and commands are in
  [packages/database/README.md](../packages/database/README.md).
- **Tables.** Each product phase adds the tables whose invariants it owns.

## Phase 1 tables (`0001_identity_and_media`)

| Table              | Purpose                                         | Key invariants                                                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`            | A provisioned account                           | Unique `auth_subject` (the identity provider's `sub`, never exposed) and unique `email_normalized`. `status` (`active`/`suspended`/`deleted`) is read on every request.                                                                                                |
| `profiles`         | Username, display name, bio, avatar, onboarding | PK = FK to `users` (cascade). Partial unique index on `username_normalized`; username and normalized form are both null or both set; lengths checked. `profiles_onboarding_requirements_check`: past `username` needs a username, past `profile` needs a display name. |
| `user_preferences` | App appearance                                  | One row per user (cascade); `appearance` enum `light`/`dark`/`system`.                                                                                                                                                                                                 |
| `media_assets`     | One upload and its derivatives                  | Owner FK is **RESTRICT**: deleting a user must schedule storage cleanup first. Purpose, MIME, and size are checked against the policy table. `ready` requires all derivative keys and dimensions. Unique upload key; partial index on pending expiry for the reaper.   |
| `media_job_outbox` | Durable media work                              | `pending → published → completed \| dead`; `completed` iff `completed_at`. Payload shape is checked per job type; deletion payloads snapshot object keys. Partial dispatch index on pending rows.                                                                      |

## Phase 2 tables (`0002_friendships_blocks_boxes`)

| Table             | Purpose                              | Key invariants                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `friendships`     | One row per pair of people           | Canonical order (`user_low_id < user_high_id`) and a unique pair, so a pair can never exist twice. Initiator is one of the two. Status is only `pending`/`accepted`/`declined`: blocks are not here (ADR 013).                               |
| `user_blocks`     | Directional blocks                   | PK `(blocker_id, blocked_id)`; the two IDs differ. A block in either direction hides both people from each other; each person's block is independent, so one unblocking never lifts the other's.                                             |
| `boxes`           | A private circle                     | Name 1–80 characters; `privacy_mode` is checked to `private`. **No owner column:** ownership is the one active `owner` membership.                                                                                                           |
| `box_memberships` | Who belongs, with role and lifecycle | PK `(box_id, user_id)`. A partial unique index allows exactly one active owner per Box. Only active members carry a role beyond `member` (check). `left`/`removed` rows are kept so history is clear; rejoining resets the role to `member`. |
| `box_invitations` | Invitations by username              | Partial unique index: one pending invitation per `(box, invitee)`. Inviter and invitee differ. Pending rows have no `responded_at`; answered rows always do. Expiry is 7 days, retired lazily when re-inviting.                              |

Cascades: friendships, blocks, memberships, and invitations cascade from their
users; memberships and invitations cascade from the Box. **Box deletion today
removes only these rows.** Phases that attach Box content (posts, media, Life
Update deliveries) must write their storage deletions to the media outbox in
the same transaction as the delete, before the cascade removes the metadata.

Pair-level decisions (friend request, block, Box invitation, accepting one)
take a transaction advisory lock on the pair first (`lockPair`), so a block can
never commit between "is anyone blocked?" and "create the relationship".
Tests prove this by disabling the lock and watching the race tests fail.

Reviewed cascade policy (Phase 1):

- `profiles.user_id`, `user_preferences.user_id`: cascade (no storage behind them).
- `media_assets.owner_user_id`: restrict (storage behind it; Phase 9 account
  deletion schedules cleanup, then removes rows).
- `profiles.avatar_media_id`: set null. Assets are tombstoned (`deleted`)
  rather than removed, so this only fires if a row is ever purged.

Every table must have:

- UUID primary keys and `timestamptz` timestamps;
- foreign keys with a reviewed cascade policy;
- checked lifecycle states;
- partial or compound unique indexes where races are possible;
- keyset indexes `(scope, created_at desc, id desc)` for growing lists.

Image bytes never enter PostgreSQL.

The legacy Phase 7 data model, used as a behavioral reference, is summarized
in [CLAUDE.md §F](../CLAUDE.md) and defined in
`legacy/packages/database/src/schema.ts`.
