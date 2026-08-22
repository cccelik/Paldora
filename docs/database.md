# Database

PostgreSQL is the source of truth. `@paldora/database` owns connection construction and Drizzle migration configuration; feature services will access it through repositories rather than embedding SQL in controllers or clients.

Migrations in `packages/database/drizzle` are immutable after deployment. Generate a new migration with `pnpm db:generate`, review its SQL, and apply it with `pnpm db:migrate`. Production schemas must never be edited manually. CI applies every migration to a fresh, isolated PostgreSQL database.

The foundation migration creates a dedicated `paldora` schema. Product tables and indexes will be introduced with the feature that owns their invariants. IDs will use UUIDs, visibility queries will use keyset indexes, and relational constraints will enforce uniqueness and lifecycle rules.

Connection pools are bounded per API instance. Pool size must be tuned against the database connection budget before scaling replica counts.
