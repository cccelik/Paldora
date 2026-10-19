# ADR 001: PostgreSQL is canonical, managed with Drizzle migrations

Status: accepted (2026-10-18). Carried over from legacy ADR 001.

## Context

Paldora's privacy guarantees rely on invariants that must hold even under
concurrent writes. Examples: one active owner per Box, one reaction per user
per post, and a Life Update delivered once per Box.

## Decision

- PostgreSQL 17 is the only source of truth. Redis is disposable and object
  storage holds bytes only.
- Every table lives in the `paldora` schema. Drizzle (0.45) defines the
  TypeScript schema, and every migration is reviewed SQL in
  `packages/database/drizzle/`.
- The migration journal lives in the `paldora.__drizzle_migrations` table.
- Database constraints (keys, checks, partial unique indexes) are the final
  authority on races.
- Migrations are immutable once deployed and follow expand/contract
  (see `packages/database/README.md`).
- Pools are sized per process from `DATABASE_POOL_MAX`, and statements time
  out after 15 s.

## Alternatives rejected

- **Prisma.** Its client-side engine and generated migrations give less
  control over partial indexes and SQL review.
- **Raw SQL with no schema layer.** It provides no type-safe queries.

## Consequences

- Drizzle's generated SQL sometimes needs hand edits before first deploy.
- Example: `0000_foundation` uses `IF NOT EXISTS`, because drizzle-kit creates
  the schema for its journal first.

## Revisit when

- Drizzle cannot express a required construct.
- Or measured load calls for replicas or partitioning. These extend this
  decision rather than replace it.
