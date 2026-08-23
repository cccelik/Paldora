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
must be queued before deleting media metadata.
