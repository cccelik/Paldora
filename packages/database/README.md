# @paldora/database

PostgreSQL is Paldora's source of truth. This package owns the Drizzle schema,
the reviewed SQL migrations in `drizzle/`, and the connection-pool factory.

## Migration safety

- **Deployed migrations are immutable.** Never edit, reorder, or delete a file
  in `drizzle/` once it has been applied outside a developer machine. Fix
  forward with a new migration.
- **Generate, then review.** Run `pnpm db:generate --name <change>`, read the
  SQL, and hand-edit only the new file when Drizzle cannot express the intent
  (for example a partial unique index with a backfill).
- **Expand, then contract.** A release may only add what old code tolerates:
  nullable or defaulted columns, new tables, and new indexes (use
  `create index concurrently` in a separate migration for large tables).
  Remove or tighten things in a later release, after every reader and writer
  has moved.
- **Constraints are the final authority.** Uniqueness, lifecycles, and races are
  enforced with keys, checks, and partial unique indexes. Application checks
  are advisory.
- **Cascades are reviewed per foreign key.** Any table that references private
  media must record storage cleanup in the media outbox **before** a cascade
  can remove the metadata.
- **Migrations run as a release step.** One job applies them before the new API
  and worker start. Services never migrate on boot.
- CI applies every migration to an empty database on each change.

## Commands

```bash
pnpm db:generate --name add_profiles   # write a new migration from schema.ts
pnpm db:migrate                         # apply pending migrations (DATABASE_URL)
pnpm --filter @paldora/database test:integration
```
