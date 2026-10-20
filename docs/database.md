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

## Phase 3 table (`0003_posts`)

`posts`: Box (cascade), author, `content`, `status` (`active|deleted`), edit and
delete timestamps. A check ties content to lifecycle: active posts have 1–5,000
characters, deleted posts have **no content** and a `deleted_at`. Indexes:
`(box_id, created_at desc, id desc) where status = 'active'` for feeds and
`(author_user_id, created_at desc, id desc)`. Phase 4 media must queue storage
deletion before the Box cascade removes posts.

## Phase 4 changes (`0004_post_media`)

- `media_assets.box_id` (nullable, `SET NULL`) and purpose `post_image`. A check
  ties scope to purpose: avatars have no Box; post photos name one unless the
  asset is tombstoned (`deleted`). Partial indexes serve Box cleanup and the
  unattached-photo reaper.
- `post_media`: `(post_id, position 0–3)` primary key and a unique
  `media_asset_id`, so a photo belongs to at most one post.
- `posts.content` may be null for photo-only posts; the lifecycle check still
  forbids text on deleted posts. The service requires text or a photo.

## Phase 5 changes (`0005_interactions_notifications`)

Expand-only: new tables, one defaulted column, and widened checks, so the
Phase 4 API and worker keep running against it.

- `comments`: post (cascade), author (cascade), `parent_comment_id`,
  `reply_to_user_id` (set null; replies only, for notifications), `content`,
  `status` (`active|deleted`), edit and delete timestamps. **One reply level
  is final in the database:** generated `depth` (0 root, 1 reply) and
  `parent_depth` (null root, 0 reply) columns, a unique `(id, post_id, depth)`,
  and a composite self-reference `(parent_comment_id, post_id, parent_depth) →
(id, post_id, depth)`. A reply must name a root of the same post; a reply to
  a reply or a cross-post parent is a foreign-key violation. The lifecycle
  check requires 1–2,000 characters while active and no text (plus
  `deleted_at`) once deleted. Partial indexes serve the roots page, the
  replies page, active counts, and the author and reply-target cascades.
- `post_reactions`: primary key `(post_id, user_id)`, so one reaction per
  person per post. `kind` is 1–64 characters: an emoji (validated by the API)
  or `real`. A check ties `real` to a `media_asset_id` (RESTRICT; assets are
  tombstoned, never removed), and a partial unique index makes a camera image
  single-use.
- `comment_reactions`: primary key `(comment_id, user_id)`; `kind` 1–64
  characters and never `real`.
- `user_preferences.reaction_presets`: `text[]`, default
  `{👍,❤️,😂,😮,😢}`, check `cardinality = 5`.
- `activity_events` (the interactions outbox, projected by the worker's
  activity projector): real FKs for actor, post, and comment instead of a JSON
  payload, a type check, a check tying `comment_id` to the type, a unique
  `dedupe_key`, `pending|completed|dead` with attempts and backoff, and partial
  indexes for claiming and retention.
- `notifications`: recipient and actor (cascade, never equal), type, post,
  optional comment (required for every type except `post.reaction`), the
  source event (set null, so event retention never deletes notifications), a
  unique `dedupe_key`, `read_at`. Rows hold IDs only, never content.
- `media_assets`: purpose `reaction_image` (Box-scoped like `post_image`);
  `media_assets_box_scope_check` and the unattached-media reaper index now
  cover both Box purposes. The reaper treats a ready capture as unattached
  while no `post_reactions` row names it (post photos: no `post_media` row).

Cascades: Box deletion removes posts and with them comments, reactions,
events, and notifications; it retires camera images first through the
existing Box-scoped asset loop. Posts are soft-deleted, so cascades never fire
on a post delete: `erasePostInteractions` tombstones the comments, deletes
reactions and notifications, and retires camera images in the delete
transaction.

Projection and retention: the worker claims due `activity_events` with
`FOR UPDATE SKIP LOCKED` (batches of 50, oldest `available_at` first) and
projects each inside its own savepoint with one `INSERT … SELECT … ON CONFLICT
(dedupe_key) DO NOTHING`, then marks it `completed` in the same savepoint. A
failure rolls back only that savepoint and records `attempts`, `last_error`,
and a backoff `available_at` (`min(60 s, 500 ms × 2^attempts)` plus up to 20%
jitter); the eighth failure makes it `dead`. The claim and every projection
commit together, so a crash leaves the events pending. The reaper purges
completed events 14 days after completion and notifications 90 days after
creation, oldest first in batches of 1,000, and reports dead events.

## Phase 6 changes (`0006_life_updates`)

Expand-only: three new tables, one defaulted column on `posts`, widened media
checks, one function, and triggers. Generated by drizzle-kit and then
hand-edited in the new file only: the sections validator function is created
before the table that calls it, the `posts_delivery_reference_unique` index
is moved ahead of the foreign key that needs it, and the triggers are
appended.

- `posts.kind` (`post` default, or `life_update` for a backing post), with
  `posts_kind_check`, `posts_life_update_content_check` (a backing post never
  has text), and the unique `(id, box_id, author_user_id, kind)` index that
  the delivery foreign key references. Trigger `posts_kind_immutable` forbids
  changing `kind` in either direction.
- `life_updates`: author (cascade), `audience` (`only_me|boxes`), `status`
  (`active|deleted`), `sections` (`jsonb` object), created/updated/edited/
  deleted timestamps. Unique `(id, author_user_id)` and `(id, audience)` are
  foreign-key referents. `life_updates_sections_check` calls the IMMUTABLE
  function `paldora.life_update_sections_valid` (at most 20 keys of 1–40
  letters, each a string of 1–2,000 characters, at most 10,000 in total;
  NULL and non-objects are invalid). The key list itself is the API's, so a
  new section needs no migration. The lifecycle check requires
  `deleted_at` exactly when deleted, and empty sections once deleted.
  Keyset index `(author_user_id, created_at desc, id desc)`.
- `life_update_deliveries` (the audience as rows): `(life_update_id,
position)` primary key with `position` 0–19 (**at most 20 Boxes**), unique
  `(life_update_id, box_id)` (**distinct Boxes**), unique `post_id` (**one
  delivery per backing post**), and a shape check (only-me: no Box, no post,
  position 0; boxes: both set). Composite foreign keys make the delivery's
  audience and author equal its Life Update's, and
  `(post_id, box_id, author_user_id, post_kind)` → `posts` makes the backing
  post a `life_update` post of the same Box and author (`post_kind` is a
  generated constant; MATCH SIMPLE lets the only-me row skip it). Box and
  post deletion cascade the delivery. Partial index `(box_id,
life_update_id)`.
- `life_update_media`: `(life_update_id, position 0–3)` primary key and a
  unique `media_asset_id` (a photo belongs to one Life Update).
- `media_assets`: purpose `life_update_image`, user-scoped (no Box, like
  avatars); the purpose check, the scope check, and the unattached-media
  index predicate include it. The reaper treats a ready one as unattached
  while no `life_update_media` row names it.

Triggers (hand-written in 0006, each tested with raw SQL):

| Trigger                                          | Rule                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `life_update_deliveries_insert_guard`            | A delivery is inserted only in the transaction that created its Life Update (`created_at = transaction_timestamp()`).        |
| `life_update_deliveries_no_update`               | Deliveries are never updated, and never deleted directly; only a cascade (trigger depth > 1, e.g. Box deletion) removes one. |
| `life_updates_immutable_columns`                 | `audience`, `author_user_id`, and `created_at` never change.                                                                 |
| `life_updates_requires_delivery` (deferred)      | At commit, a new Life Update has at least one delivery.                                                                      |
| `posts_life_update_requires_delivery` (deferred) | At commit, a new backing post belongs to a delivery.                                                                         |
| `posts_kind_immutable`                           | A post never changes kind.                                                                                                   |

All of them raise SQLSTATE `23000` with a constraint name
(`life_update_audience_immutable`, `life_update_requires_delivery`,
`posts_life_update_requires_delivery`, `posts_kind_immutable`). Together they
make the audience immutable in the database. A Life Update and all its
backing posts take `created_at` from `now()` in the publishing transaction, so
they share one instant (tested), which the Home feed dedupe relies on.

Cascades: Box deletion removes that Box's backing post and delivery only.
Before the Box row goes, `tombstoneLifeUpdatesLosingLastBox` (API, same
transaction) locks the active Life Updates delivered there and tombstones
those with no delivery in another Box, retiring their photos (user-scoped,
`box_id` null, so the Box's own media sweep never sees them) with object keys
snapshotted into the deletion outbox. The worker's
`sweepDeliverylessLifeUpdates` tombstones any Box-audience Life Update left
with no delivery after an hour (`FOR UPDATE SKIP LOCKED`), and counts backing
posts with no delivery as a canary. Both use `tombstoneLifeUpdates` and
`retireMediaAssets` from `@paldora/database`.

Feeds use `representativeDelivery(viewerId)` (`packages/database/src/
life-updates.ts`), a `WHERE` fragment that keeps an ordinary post, or the
viewer's reachable backing post with the greatest ID per Life Update, so Home
shows one row per Life Update on the existing `(created_at, id)` keyset.
Deleting a Life Update is a soft delete in one transaction: the backing posts
are tombstoned, `erasePostInteractions` (now taking a list of posts) erases
every delivery's comments, reactions, camera images, and notifications, the
photos are retired once, and the row keeps `status='deleted'` with empty
sections.

Memories add **no table, column, or migration**: they are derived
at query time from `posts`, `life_update_deliveries`, `life_updates`, and
`box_memberships`. The candidate query is driven by the viewer's memberships
(`box_memberships_user_status_index`) into the existing
`posts_box_feed_index (box_id, created_at desc, id desc) where status =
'active'` with the UTC month or year as a range condition, then the unique
`post_id` index of `life_update_deliveries` and the `life_updates` primary
key; Only Me uses `life_updates_author_index`. `EXPLAIN` on the test database
shows exactly that plan, so a partial index on `posts.kind` was not added
(`kind` is a cheap filter on rows the range already narrowed). Revisit when
a single viewer's month or year holds enough rows that the per-page
`DISTINCT` and sort show up in measurements.

## Phase 7 changes (`0007_rooms`)

Expand-only: four enums, three new tables, one new index and widened checks
on `media_assets`, six functions, and triggers. Generated by drizzle-kit and
then hand-edited in the new file only: the `media_assets_id_owner_purpose_unique`
index is moved ahead of the banner foreign key that references it, and the
functions and triggers are appended. Rooms are created **lazily**: no row
exists until a person first saves their Room, and a missing row means the
default configuration (`DEFAULT_ROOM` in `packages/domain`, equal to the
column defaults below). Nothing is backfilled.

- `rooms` (one per user, PK `user_id` → `users`, cascade):
  `configuration_version` (check `= 1`), `visibility`
  (`friends|members|hidden`, default `friends`), `theme_preset` (text, check
  in the 14 preset ids, default `cream_paper`), `layout`
  (`single|two_column`, default `two_column`), the nullable overrides
  `accent` (8 keys), `font` (5 keys), and `decoration_pack` (6 packs), where
  null follows the preset, `sparkles` (default false), `location` (1–120),
  `currently` (1–240), the music link `music_url` / `music_title` /
  `music_artist`, `banner_media_id`, the generated constant `banner_purpose`
  (`'room_banner'`), `top_friends_size` (4, 8, or 12, default 8),
  `top_friends_visibility` (`visible|friends|hidden`, default `friends`), and
  created/updated timestamps. No column can hold CSS, HTML, script, a color,
  a font URL, or a background URL.
  - `rooms_music_url_check`: HTTPS only (`like 'https://%'`), at most 2,048
    characters, no whitespace, no userinfo (`!~ '^https://[^/?#]*@'`). The
    API additionally rejects IP literals, `localhost`, and single-label
    hosts, and stores the normalized `href`.
    `rooms_music_text_requires_url_check`: a title or artist needs a link.
  - **Banner key.** `(banner_media_id, user_id, banner_purpose)` →
    `media_assets (id, owner_user_id, purpose)` (NO ACTION; MATCH SIMPLE, so
    a Room without a banner skips it): a banner is always the owner's own
    `room_banner` asset. Assets are tombstoned, never deleted, so the key
    never blocks cleanup; the read path serves a banner only while its asset
    is `ready`. Partial unique `rooms_banner_media_unique` (an asset serves
    one Room); it answers before the foreign key when another Room tries to
    reuse an asset.
  - No visibility index: there is no Room discovery or listing.
- `room_widgets`: PK `(room_user_id, widget_type)` (→ `rooms`, cascade),
  `widget_type` checked against the 7 domain types, `placement`
  (`main|sidebar`), `position` 0–6 with a unique `(room_user_id, position)`
  index, `enabled`. A Room has all seven rows or none (none serves
  `DEFAULT_ROOM_WIDGETS`). The service replaces the set with a delete and an
  insert in one transaction.
- `room_top_friends`: PK `(room_user_id, friend_user_id)` (distinct
  friends), `room_user_id` → `rooms` and `friend_user_id` → `users` (both
  cascade), `position` 0–11 with a unique `(room_user_id, position)` index,
  `room_top_friends_not_self_check`, and `room_top_friends_friend_index
(friend_user_id, room_user_id)` for the removal triggers and the cascade.
  Gaps in `position` after an automatic removal are allowed; the next save
  renumbers.
- `media_assets`: purpose `room_banner`, user-scoped (no Box, like avatars
  and Life Update photos). The purpose check, the scope check, and the
  `media_assets_unattached_index` predicate include it, and the new unique
  `(id, owner_user_id, purpose)` index is the banner key's referent. The
  reaper treats a ready banner as unattached while no `rooms.banner_media_id`
  names it (same 24 h expiry); the worker's `CLAIMED_PURPOSES` is tested
  against the index predicate.

Functions and triggers (hand-written in 0007, each tested with raw SQL in
`packages/database/src/rooms.integration.test.ts`):

| Trigger / function                                               | Rule                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rooms_touch` (BEFORE UPDATE)                                    | `user_id` and `created_at` never change (`rooms_immutable_columns`). `updated_at` becomes `greatest(clock_timestamp(), old + 1 µs)` on every update, ignoring any value the caller sets, so versions strictly increase and two saves never share one. |
| `rooms_trim_top_friends` (AFTER UPDATE OF size)                  | Lowering `top_friends_size` deletes the entries at `position >= size` in the same statement.                                                                                                                                                          |
| `room_widgets_complete_set` (deferred)                           | At commit, each touched Room has exactly 0 or 7 widget rows (`room_widgets_incomplete`). A cascade from `rooms` leaves 0.                                                                                                                             |
| `room_top_friends_insert_guard` (BEFORE INSERT/UPDATE)           | The final authority: `position < rooms.top_friends_size` (`top_friend_position_out_of_range`), and an `accepted` friendship for the pair, no block either way, and an active friend (`top_friend_not_eligible`). See "Top Friends races" below.       |
| `friendships_remove_top_friends` (AFTER DELETE/UPDATE OF status) | When an accepted friendship is deleted (unfriend, block, user deletion) or leaves `accepted`, the pair's entries are deleted in both directions.                                                                                                      |
| `user_blocks_remove_top_friends` (AFTER INSERT)                  | A block in either direction deletes the pair's entries in both directions (redundant today, because blocking deletes the friendship, but path-independent).                                                                                           |
| `paldora.is_blocked_between(a, b)`                               | SQL twin of `hiddenByBlock`/`isBlockedBetween` (same symmetric predicate, tested to agree), used by the insert guard.                                                                                                                                 |
| `paldora.remove_pair_top_friends(a, b)`                          | The shared removal used by the two removal triggers.                                                                                                                                                                                                  |

All guard errors raise SQLSTATE `23000` with a constraint name, which the
API maps (Phase 7 slice 4) to `TOP_FRIEND_NOT_ELIGIBLE` and
`VALIDATION_FAILED`.

**Top Friends races.** The insert guard reads the Room row and the
friendship row `FOR SHARE`. An unfriend or a block must delete that
friendship row, so the two serialize: if the add commits first, the
unfriend's removal trigger runs afterwards (its `DELETE` sees the new row)
and removes it; if the unfriend commits first, the guard finds no accepted
friendship and refuses. Likewise the share lock on the Room row serializes
an add with a size change. Both orders are tested with real concurrent
transactions, and tests that disable the guard or the removal trigger show
that they, not the services, enforce the rules. Because the removal lives in
the database, `FriendshipService` and `BlockService` need no Room code.

Cascades and lifecycle: deleting a user cascades the Room, its widgets, and
its Top Friends rows (and removes them from other people's Top Friends via
the `friend_user_id` cascade). The banner asset's owner key is RESTRICT, so
Phase 9 account deletion must null `rooms.banner_media_id` and retire the
banner through the outbox before the user row goes. Suspended or
not-yet-onboarded owners keep their rows; Room access is decided by the API
policy, not by deleting data. Box deletion and membership changes touch no
Room table.

Pair-level decisions (friend request, block, Box invitation, accepting one)
take a transaction advisory lock on the pair first (`lockPair`), so a block can
never commit between "is anyone blocked?" and "create the relationship".
Tests prove this by disabling the lock and watching the race tests fail.

Reaction writes take a transaction advisory lock on (target, person)
(`lockReactor`) before reading the current reaction, so replacing it and
retiring the camera image it used cannot interleave with a concurrent set by
the same person. The primary key and the media-asset unique index stay the
final authority. A new row is detected with `RETURNING (xmax = 0)`; only a new
row records an activity event.

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
