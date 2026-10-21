# ADR 009: Integration tests fail rather than skip; e2e runs on production builds

Status: accepted (2026-10-18). Implements R10.

## Context

In the legacy build, `describe.runIf(DATABASE_URL)` skipped every API
integration and authorization suite in CI without failing. Playwright covered
only fixture routes, and only on desktop Chromium.

## Decision

- **Unit tests.** `pnpm test` runs fast tests that need no infrastructure.
  `*.integration.test.ts` files are excluded.
- **Integration tests.** `pnpm test:integration` runs `*.integration.test.ts`
  against real PostgreSQL and Redis (later also MinIO). Each suite calls
  `requireEnvironmentVariables(...)` and **throws** when configuration is
  missing. CI provides service containers.
- **Migration validation.** CI applies migrations to an empty database twice;
  the second run must be a no-op.
- **Browser tests.** `pnpm test:e2e` builds and starts the **production**
  web app, then runs both the `desktop` and `mobile-390` (390×844) projects.
  Every page must pass axe (WCAG 2.0/2.1/2.2 A/AA tags) with zero console
  errors, which catches CSP violations. Specs also cover the not-found state
  and horizontal overflow.
- **Full-stack e2e.** From Phase 1, add a suite against a seeded API with a
  local token issuer (Supabase CLI or a test JWKS) so privacy flows run end
  to end.
- **Privacy tests are first-class.** Every feature tests unrelated users,
  blocks in both directions, former members, guessed IDs, deleted or archived
  content, concurrency, and outage recovery.

## Shared fixtures and suite boundaries (2026-10-21)

Row fixtures live in `packages/database/src/testing`, exported only through the
explicit `@paldora/database/testing` subpath. ESLint forbids production code from
importing them. This keeps one standard media-key shape and one implementation
of people, Boxes, and friendship setup across API, worker, and database tests
without adding a production dependency on Vitest. The helpers accept database
executors, including transactions.

API scenes exercise real HTTP policy; only provisioning and completed worker
assets use direct row setup. Application `test-support/` folders own their
harnesses and are excluded from production builds. Suites split at behavior
boundaries below 600 lines, preserving parameterized rows and race rounds.
Integration runs remain serial across packages, and worker files remain serial
because maintenance scans share the dedicated database. Support changes require
two integration runs with unchanged case counts.

## Revisit when

CI time exceeds about 15 minutes; then shard Playwright and parallelize
integration suites per package.
