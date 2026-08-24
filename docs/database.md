# Database

PostgreSQL is the source of truth. `@paldora/database` owns connection construction and Drizzle migration configuration; feature services will access it through repositories rather than embedding SQL in controllers or clients.

Migrations in `packages/database/drizzle` are immutable after deployment. Generate a new migration with `pnpm db:generate`, review its SQL, and apply it with `pnpm db:migrate`. Production schemas must never be edited manually. CI applies every migration to a fresh, isolated PostgreSQL database.

The foundation migration creates a dedicated `paldora` schema. Product tables and indexes will be introduced with the feature that owns their invariants. IDs will use UUIDs, visibility queries will use keyset indexes, and relational constraints will enforce uniqueness and lifecycle rules.

Connection pools are bounded per API instance. Pool size must be tuned against the database connection budget before scaling replica counts.

Phase 1 owns `paldora.users`, `paldora.profiles`, and `paldora.media_assets`. Authentication subjects remain separate from internal user IDs. Username comparison uses the unique `username_normalized` column, while database checks preserve username/profile bounds and avatar MIME/size invariants. Image bytes never enter PostgreSQL.

Phase 2 owns `paldora.boxes`, `paldora.box_memberships`,
`paldora.box_invitations`, and `paldora.friendships`. A partial unique index
allows only one active owner membership per Box. Ownership transfer demotes the
former owner, promotes the selected active member, and updates
`boxes.owner_user_id` atomically.

Deleting a Box is owner-only at the API boundary. Membership and invitation
foreign keys use `on delete cascade`, so deletion removes access-control state
in the same database statement. Every future Box-owned relational table must
reference `boxes.id` with a reviewed cascade policy; object-storage cleanup
must be recorded in the transactional media outbox before deleting metadata.

Phase 3A owns `paldora.posts`. Each post belongs to one Box and one internal
author. The Box foreign key cascades so permanent Box deletion also removes its
posts; the author foreign key preserves the same account-deletion contract.
Deletion during normal product use is soft and excludes the post from reads.
The `(box_id, created_at desc, id desc)` index supports deterministic keyset
pagination without offset drift.

Phase 3C extends `media_assets` with Box-scoped `post_image` assets and
processing metadata. `post_media` attaches each asset to exactly one post and
stores its stable gallery position. Originals remain private; display and
thumbnail object keys are populated only after worker processing succeeds.

Phase 3/4 hardening adds a foreign key from `media_assets.box_id` to
`boxes.id` with `on delete cascade` and introduces `media_job_outbox`.
Processing and deletion intent is inserted in the same PostgreSQL transaction
as the owning media, profile, post, or Box mutation. Deletion payloads snapshot
all private object keys, so a Box cascade may remove its media rows without
losing the cleanup instructions. The API dispatcher claims rows with
`for update skip locked`, publishes them to BullMQ with the outbox UUID as the
job ID, and retries unpublished rows with bounded backoff when Redis is
unavailable. Published rows remain as an audit record and worker operations are
idempotent.

Phase 5 owns `comments`, `post_reactions`, `activity_events`, and
`notifications`. `comment_reactions` adds one Unicode emoji state per
`(comment_id, user_id)`; its cascading foreign keys remove state when a comment,
post, or Box is hard-deleted. Comments are soft-deleted so replies keep their conversational
position; a self-referencing foreign key and the interaction service enforce a
single reply level. `post_reactions` uses `(post_id, user_id)` as its primary key,
making reaction state unique and safe under concurrent writes.
Emoji reactions store one validated Unicode grapheme as text, allowing the UI
to offer any current or future emoji without a schema migration. Each profile's
five distinct shortcuts are stored in `reaction_presets` with a stable default.
A `real` reaction must reference exactly one unique `reaction_image` media asset;
emoji reactions cannot reference media. Replacing or removing a camera reaction writes a
durable deletion-outbox entry after detaching the asset.

`activity_events` is the durable boundary between interaction mutations and
notification/realtime projection. Comment and reaction state and its event are
committed atomically. Projectors claim pending rows with `for update skip
locked`, retry failures with bounded backoff, and retain processed rows for
audit. Notification dedupe keys prevent retries or repeated reaction changes
from producing duplicate rows. Notification reads always join through an active
post and active Box membership, so persisted activity never bypasses current
visibility.
