# Deployment

Phase 0 ships no hosted environment. The production topology is decided in
Phase 4 (decision D5, [ADR 014](adr/014-release-topology.md)) against current
official provider pricing and limits.

## Artifacts

| Artifact | Build                                              | Start                                          |
| -------- | -------------------------------------------------- | ---------------------------------------------- |
| Web      | `pnpm turbo run build --filter=@paldora/web...`    | `pnpm --filter @paldora/web start`             |
| API      | `pnpm turbo run build --filter=@paldora/api...`    | `node apps/api/dist/main.js`                   |
| Worker   | `pnpm turbo run build --filter=@paldora/worker...` | `node apps/worker/dist/main.js`                |
| Schema   | (none)                                             | `pnpm db:migrate`, run as a single release job |

## Configuration

- **Variables.** See [.env.example](../.env.example).
- **`PALDORA_ENV`.** Set it to `staging` or `production` in deployed
  environments. The parsers then require HTTPS origins and reject
  `*_dev_only` credentials.
- **Web.** Receives only the `NEXT_PUBLIC_*` values plus `PALDORA_ENV`.
- **API and worker.** Receive the database, Redis, and Supabase verification
  settings. Storage credentials are added in Phase 1.
- **Secrets.** Never put the service-role key or storage secrets in web or
  native builds.

## Release order

1. Back up and verify the database.
2. Apply backward-compatible migrations (one job).
3. Deploy the API and worker.
4. Deploy web.
5. Run the smoke test: `/api/v1/health/ready`, the landing page, and auth
   once Phase 1 exists.
6. Remove obsolete schema in a later expand/contract release.

## Production requirements

- PostgreSQL with point-in-time recovery and tested restores.
- Redis with `maxmemory-policy noeviction` and persistence (a BullMQ
  requirement).
- Durable private object storage.
- TLS and a secret manager.
- Connection-pool budgets (`DATABASE_POOL_MAX` × replicas below the server
  limit).
- Metrics and alerts on readiness, errors, latency, and queue depth.

The legacy free-tier demo (`legacy/render.yaml`) is a demonstration topology,
never production.
