# Architecture

Paldora is a TypeScript modular monolith with separate native clients.

```text
Next.js web ────────────┐
iOS (SwiftUI) ──────────┼─> /api/v1 (contracts/openapi.json) ─> NestJS API ─> PostgreSQL (canonical)
Android (Compose) ──────┘                                          ├─> Redis (queues, limits, pub/sub)
                                                                   └─> private S3-compatible storage
            PostgreSQL outboxes ─> BullMQ ─> worker (media, deletion, maintenance)
            activity_events ─> worker projector ─> notifications (+ Redis hints)
```

## Workspaces

| Workspace                | Owns                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | Responsive website. Pages compose data from the typed client; no business rules.                                                                                                                                                                                                                                                                                                                         |
| `apps/api`               | All authorization and orchestration. `PlatformModule` plus one module per product area: `identity` (account, profile, onboarding, preferences, avatar, people lookups), `media` (uploads for every purpose), `social` (friendships, blocks), `boxes` (lifecycle, members, invitations), `posts`, `interactions` (comments and reaction summaries), `notifications` (read and mark only), and `realtime`. |
| `apps/worker`            | Outbox dispatcher, media processing and deletion, the activity projector (notifications), scheduled reaper and retention.                                                                                                                                                                                                                                                                                |
| `packages/domain`        | Framework-neutral identifiers, error codes, identity types.                                                                                                                                                                                                                                                                                                                                              |
| `packages/validation`    | Zod schemas and the route registry: the contract source.                                                                                                                                                                                                                                                                                                                                                 |
| `packages/api-client`    | Typed HTTP client that validates responses against the contract.                                                                                                                                                                                                                                                                                                                                         |
| `packages/config`        | Fail-fast environment parsers per runtime.                                                                                                                                                                                                                                                                                                                                                               |
| `packages/database`      | Drizzle schema, migrations, pool factory.                                                                                                                                                                                                                                                                                                                                                                |
| `packages/observability` | Redacting logger and correlation IDs.                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/storage`       | `ObjectStorage` interface, S3 adapter, in-memory fake for tests.                                                                                                                                                                                                                                                                                                                                         |
| `packages/tokens`        | Generated design tokens (CSS, TS, Swift, Kotlin).                                                                                                                                                                                                                                                                                                                                                        |
| `contracts/`             | Generated OpenAPI document and cross-platform conformance fixtures.                                                                                                                                                                                                                                                                                                                                      |
| `design/tokens/`         | The design-token source.                                                                                                                                                                                                                                                                                                                                                                                 |

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
  `social`. `posts` imports `interactions` for feed summaries; `interactions`
  never imports `posts` as a module, only the plain `posts/post-context.ts`
  function every interaction check starts from, and `PostService.remove`
  calls the plain `erasePostInteractions` function inside its transaction.
  `life-updates` imports `identity`, `media`, `realtime`, and `interactions`
  and never `posts`: it writes backing posts directly and reuses the plain
  `erasePostInteractions` and `media/photo-claim.ts` functions (the photo
  claim is shared with `PostService`). It exports its view and policy
  services so feeds (and later Memories) can import it, never the reverse.
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

## Notification flow (Phase 5)

```text
API comment/reaction tx ─> activity_events row (same tx, dedupe_key = notification key)
worker projector (poll, OUTBOX_POLL_INTERVAL_MS) ─ one tx:
    claim ≤ 50 due events (SKIP LOCKED)
    per event, in a savepoint: INSERT … SELECT (recipient, skip rules, hiddenByBlock)
                               ON CONFLICT (dedupe_key) DO NOTHING → completed
    failure: roll back the savepoint → attempts + backoff, dead after 8
  after commit: notification.created → Redis user:{recipient} (best effort)
API /me/notifications: visibility fragment rechecked on every read; display data joined live
reaper: purge completed events after 14 days, notifications after 90 days
```

The projector is a plain poll loop beside the media dispatcher, not a BullMQ
job: projection is pure SQL with no network call between claim and ack, so it
needs no queue hop or lease. It stops before the database pool closes on
shutdown.

## Camera reaction flow (web, Phase 5)

```text
ReactionCamera dialog ─getUserMedia (secure context)─> live preview (mirrored by CSS)
capture: canvas ≤ 1280 px → JPEG 0.88 → tracks stopped
prepareReactionImage (reaction_image, post's Box) → PUT signed URL → complete
poll media status (lib/media-polling.ts) → ready
setCameraReactionAction (PUT /posts/{id}/reaction, kind real) → summary replaces the optimistic one
```

## Life Update flow (Phase 6)

```text
POST /life-updates ─ one tx:
    author's active membership in every Box → Box rows FOR SHARE (ascending id)
    claim photos (FOR UPDATE; life_update_image, owner, unused)
    life_updates row ─ one posts row (kind life_update, no text) per Box
                     ─ one life_update_deliveries row per Box (or one only-me row)
                     ─ life_update_media rows       (all created_at = now())
    commit: deferred triggers check every update and backing post has a delivery
  after commit: post.created → box:{id} per delivery Box (best effort, IDs only)
GET /life-updates/{id}: rows + hiddenByBlock → viewer's contexts (active membership)
    → photos signed once, authors, interaction summaries per context post
PATCH /life-updates/{id} ─ one tx: lock update (policy), mayEdit (archived rule),
    claim the new photo list (FOR UPDATE), unlink + retire dropped photos,
    replace sections, edited_at → post.updated per delivery Box after commit
DELETE /life-updates/{id} ─ one tx: lock update, lock + tombstone backing posts,
    erasePostInteractions(all), tombstoneLifeUpdates (photos retired) → post.deleted per Box
GET /me/feed, /boxes/{id}/posts: one keyset query over posts ⨝ viewer membership
    ⟕ life_update_deliveries; Home adds representativeDelivery(viewer) (one row
    per Life Update); ordinary rows → PostPageService, Life Update rows →
    LifeUpdateViewService.byIds (scopeBoxId on a Box feed); blocked → hidden
DELETE /boxes/{id} ─ in the Box-delete tx, before the cascade:
    tombstoneLifeUpdatesLosingLastBox (lock updates delivered here, then those
    with no other Box are tombstoned and their user-scoped photos retired)
worker reaper: sweepDeliverylessLifeUpdates (safety net, SKIP LOCKED) and a
    canary count of backing posts without a delivery (logged at error)
```

Comments and reactions on a delivery are ordinary Phase 5 interactions on its
backing post, so each Box keeps its own conversation and the projector needs
no change.

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
