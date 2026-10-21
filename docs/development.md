# Development

## Prerequisites

- **Node 24 LTS** (`.nvmrc`). With nvm: `nvm use`.
- Corepack, which provides the pinned pnpm 11.22.0.
- Docker, for PostgreSQL, Redis, and MinIO.

## First run

```bash
corepack enable
pnpm install
cp .env.example .env          # fill NEXT_PUBLIC_SUPABASE_*, SUPABASE_URL (and the service-role key for provisioning)
docker compose -f infrastructure/docker-compose.yml up -d --wait
pnpm db:migrate
pnpm dev                      # web :3000, API :4000/api/v1, worker
pnpm --filter @paldora/api provision --demo   # or: --email you@example.com
```

## Accounts

Public signup is disabled. Accounts are provisioned by the trusted script,
which is the only code that uses `SUPABASE_SERVICE_ROLE_KEY`:

```bash
pnpm --filter @paldora/api provision --email ada@example.com
pnpm --filter @paldora/api provision --email ada@example.com \
  --username ada --display-name "Ada" --password-env ADA_PASSWORD
pnpm --filter @paldora/api provision --demo   # DEMO_USER_* and DEMO_FRIEND_*
```

- Without a password, the person chooses one through "Forgot password".
- With `--username` and `--display-name`, onboarding is marked complete.
- Re-running is safe and never overwrites a profile the person edited.
- The Supabase project must sign tokens with asymmetric keys (ADR 003).

- **Endpoints.** Check `http://localhost:4000/api/v1/health` (liveness) and
  `/api/v1/health/ready` (PostgreSQL and Redis).
- **Compose project name.** The compose project is `paldora-v2`, so its
  volumes never mix with the legacy build's `paldora` volumes.
- **Port conflicts.** Do not run both stacks at once; they share ports.
- **Shared `.env`.** The API, worker, and web app all read the root `.env`.
  Values already set in the environment take precedence.

## Everyday commands

| Command                                                | What it does                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm dev`                                             | All apps in watch mode                                              |
| `pnpm --filter @paldora/api dev`                       | One app                                                             |
| `pnpm format` / `pnpm format:check`                    | Prettier                                                            |
| `pnpm lint`                                            | ESLint with complexity limits, zero warnings                        |
| `pnpm typecheck`                                       | TypeScript in every workspace                                       |
| `pnpm test`                                            | Unit tests (no infrastructure)                                      |
| `pnpm test:integration`                                | Real PostgreSQL, Redis, MinIO; **fails** if unconfigured            |
| `pnpm test:e2e`                                        | Production web build, desktop + 390px, axe (signed out)             |
| `pnpm test:e2e:full`                                   | Signed-in flows: web, API, worker, real services, local auth issuer |
| `pnpm build`                                           | Build everything                                                    |
| `pnpm contract:generate` / `contract:check`            | Regenerate or verify `contracts/openapi.json`                       |
| `pnpm tokens:generate` / `tokens:check`                | Regenerate or verify design tokens                                  |
| `pnpm db:generate --name <change>` / `pnpm db:migrate` | Create or apply a migration                                         |
| `pnpm scan:client-bundle`                              | Scan the built browser bundle for secrets                           |

## Tests never touch your development data

`pnpm test:integration` and `pnpm test:e2e:full` run through
`scripts/with-test-database.mjs`. Locally it creates a `<database>_test`
database next to yours (for the default setup, `paldora_test`), applies every
migration, and points the tests at it. Your development database is not
modified. In CI (`CI=true`) the job's own clean database is used as is. Redis
and MinIO are shared, but test keys are unique. To reset the test data, drop
the database: `docker exec paldora-v2-postgres-1 psql -U paldora -d paldora -c 'drop database paldora_test'`.

## Integration test support

`packages/database/src/testing` (`@paldora/database/testing`) is the shared,
test-only fixture home for API, worker, and database suites. It provides
`createPerson`, `createBox`, `befriend`, `readyMediaAsset`, standard media keys,
asset/outbox queries, and time helpers. Production imports are forbidden by
ESLint; test harnesses under `src/test-support` are excluded from application
builds. Database fixtures accept an executor so transaction tests keep writes
inside their transaction.

API setup goes through `scenes(app)` and `test-support/http.ts` for Boxes,
invitations, friendships, blocks, posts, comments, and reactions. Direct row
fixtures stand in for provisioning or worker processing, never for the API
operation under test. `lifeUpdateTools` and `roomTools` add their feature flows
on these shared helpers. Worker support owns queue/storage setup and lifecycle;
database support owns connection teardown and PostgreSQL failure inspection.

Integration suites are split by behavior (including block matrices, comment
lifecycle, camera reactions, Room constraints and races, projector skip rules,
media fault injection, and maintenance). Keep every suite below 600 lines and
retain all cases when splitting. Run integration twice after a support refactor
to catch interference from leftovers in the dedicated test database.

## Focused runs

```bash
pnpm --filter @paldora/api exec vitest run src/platform/platform.test.ts
pnpm --filter @paldora/web exec vitest run app/lib/security/csp.test.ts
DATABASE_URL=postgresql://paldora:paldora_dev_only@localhost:5432/paldora \
REDIS_URL=redis://localhost:6379 S3_ENDPOINT=http://127.0.0.1:9000 \
S3_REGION=us-east-1 S3_BUCKET=paldora-private S3_ACCESS_KEY_ID=paldora_minio \
S3_SECRET_ACCESS_KEY=paldora_minio_dev_only pnpm test:integration
pnpm test:e2e --project=mobile-390 apps/web/e2e/foundation.spec.ts
pnpm exec playwright install chromium   # once per machine
```

## Before a pull request

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && \
pnpm contract:check && pnpm tokens:check && pnpm build
```

Then run `pnpm test:integration` with Docker up, `pnpm test:e2e`, and
`pnpm test:e2e:full`.

Browser support lives in `apps/web/e2e/support`: `a11y`, `console`,
`sessions`, `accounts`, `flows`, `locators`, and `rooms`. Specs reuse these
helpers; support is outside the spec discovery paths. `sessions` keeps a
facade for the established setup helpers.

## Full-stack browser tests

`pnpm test:e2e:full` (config: `apps/web/e2e/playwright.fullstack.config.ts`,
sharing `apps/web/e2e/playwright.shared.ts` with `pnpm test:e2e`) starts the
real API, worker, and production web build against local PostgreSQL, Redis,
and MinIO. Only Supabase Auth is replaced, by
`apps/web/e2e/full-stack/fake-auth-server.mjs`: a loopback stand-in that
speaks the password, refresh, logout, JWKS, and admin endpoints and signs
ES256 tokens that the production verifier checks. Accounts are created with
the real provisioning script. The worker uses its own queue
(`paldora-e2e`), but it shares the database you point it at.

## Adding an endpoint

1. Add the request/response schemas and a `defineRoute` entry in
   `packages/validation`. Run `pnpm contract:generate`.
2. Implement it in the owning feature module:
   - `@RateLimit` or `@RateLimitExempt` on mutations;
   - `ZodPipe` for inputs;
   - a policy with non-leaking errors.
3. Add a client method if a typed helper helps callers.
4. Add unit, integration, and authorization tests. The route-inventory test
   fails until the route and the registry agree.
5. Update `docs/api.md` if the endpoint introduces a new concept.

### Room personalization (Phase 8)

`@paldora/personalization` contains the server-side bounded CSS and static HTML
compilers. Do not import it into browser components. The API reauthorizes the
Room and recompiles source on every rendered read. The web stylesheet handler
also reauthorizes each fetch and uses a content revision to refresh changed CSS.

`ROOM_CUSTOM_CSS_ENABLED` and `ROOM_CUSTOM_WIDGETS_ENABLED` are independent API
flags, both false by default. The full-stack test fixture enables them only for
its isolated test services. Turning one off hides that surface and preserves its
source/policy without blocking saves to the other surface. Owner source access
remains available for recovery. No public HTML artifact or widget origin is used.

Run `pnpm test:e2e:personalization` after installing Chromium, Firefox and WebKit
with `pnpm exec playwright install chromium firefox webkit`. It uses the same
production services and dedicated database wrapper as the full-stack suite.
The browser fixture deliberately bypasses the compiler to verify sandbox/CSP
independently; CSP-blocked request events are distinguished from actual network
interception. Release requirements and exact grammar are in the
[review record](threat-models/phase-8-security-review.md).
