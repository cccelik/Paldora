# Architecture

Paldora is a TypeScript modular monolith with separate native clients.

```text
Next.js web ────────────┐
iOS (SwiftUI) ──────────┼─> /api/v1 (contracts/openapi.json) ─> NestJS API ─> PostgreSQL (canonical)
Android (Compose) ──────┘                                          ├─> Redis (queues, limits, pub/sub)
                                                                   └─> private S3-compatible storage
            PostgreSQL outboxes ─> BullMQ ─> worker (media, deletion, maintenance)
```

## Workspaces

| Workspace                | Owns                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | Responsive website. Pages compose data from the typed client; no business rules.                                                                                                                                                                                                            |
| `apps/api`               | All authorization and orchestration. `PlatformModule` plus one module per product area: `identity` (account, profile, onboarding, preferences, avatar, people lookups), `media` (uploads for every purpose), `social` (friendships, blocks), and `boxes` (lifecycle, members, invitations). |
| `apps/worker`            | Outbox dispatcher, media processing and deletion, scheduled reaper.                                                                                                                                                                                                                         |
| `packages/domain`        | Framework-neutral identifiers, error codes, identity types.                                                                                                                                                                                                                                 |
| `packages/validation`    | Zod schemas and the route registry: the contract source.                                                                                                                                                                                                                                    |
| `packages/api-client`    | Typed HTTP client that validates responses against the contract.                                                                                                                                                                                                                            |
| `packages/config`        | Fail-fast environment parsers per runtime.                                                                                                                                                                                                                                                  |
| `packages/database`      | Drizzle schema, migrations, pool factory.                                                                                                                                                                                                                                                   |
| `packages/observability` | Redacting logger and correlation IDs.                                                                                                                                                                                                                                                       |
| `packages/storage`       | `ObjectStorage` interface, S3 adapter, in-memory fake for tests.                                                                                                                                                                                                                            |
| `packages/tokens`        | Generated design tokens (CSS, TS, Swift, Kotlin).                                                                                                                                                                                                                                           |
| `contracts/`             | Generated OpenAPI document and cross-platform conformance fixtures.                                                                                                                                                                                                                         |
| `design/tokens/`         | The design-token source.                                                                                                                                                                                                                                                                    |

## Dependency direction

```text
apps/* ─> api-client ─> validation ─> domain
apps/* ─> config, observability, database, storage, tokens
```

- **Acyclic packages.** `domain` imports nothing, and no package imports
  an app.
- **Web dependencies.** The web app never imports `database`, Redis, or
  server-only config.
- **Feature modules.** In the API they never import each other's internals,
  only exported services.
- **Module dependencies.** `social` and `boxes` import `identity` for people
  summaries and username lookups; `social` imports `boxes` only so blocking can
  withdraw invitations inside its own transaction. `boxes` never imports
  `social`.
- **Identity mapping is platform work.** The global guard verifies the JWT and
  resolves the internal user, so feature modules receive a principal and never
  see the identity provider.

## Media flow (R4, ADR 011)

```text
client ─POST /media/uploads─> API: reserve row (pending) + signed PUT
client ─PUT bytes──────────> private storage (signature binds type + size)
client ─POST …/complete────> API: HEAD check → processing + outbox row (one tx)
worker dispatcher ─claim (SKIP LOCKED)─> BullMQ (jobId = outbox id) ─> media.process
media.process: decode (limits) → master/display/thumbnail WebP, no metadata
             → one tx: ready + attach (purpose rule) + raw-upload deletion row + completed
media.delete: delete snapshotted keys → completed      failures → dead after 5 attempts
reaper (15 min): expire abandoned reservations, requeue stalled rows, count dead rows
```

## Principles

- **PostgreSQL is canonical.** Redis is disposable and never holds the only
  copy of durable intent.
- **Transactional outboxes** carry durable intent to BullMQ. Job IDs are
  outbox IDs, and handlers are idempotent.
- **Feeds** use fan-out-on-read with keyset pagination. Measure before adding
  ranking, caching, or a search engine.
- **Realtime messages** are identifier-only invalidation hints. Clients
  re-fetch through normal authorization. A Redis bus fans events out to
  per-person SSE streams whose Box subscriptions follow memberships
  ([ADR 012](adr/012-realtime.md)).
- **Native apps** share the contract, token values, terminology, and
  fixtures, never UI code.

Decisions and their alternatives are recorded in [adr/](adr/README.md).
