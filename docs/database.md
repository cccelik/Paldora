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

Reviewed cascade policy:

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
