# Paldora

> A box for your people.

Paldora is a privacy-first social platform and living scrapbook for close friends and private communities. This repository contains the production foundation only: applications, service boundaries, infrastructure adapters, quality gates, and documentation. Product features begin after these foundations stay green.

## Repository map

```text
apps/
  api/       NestJS versioned REST API
  mobile/    Expo / React Native application
  web/       Next.js App Router application
  worker/    BullMQ background worker
packages/
  api-client/      typed client shared by web and mobile
  auth/            authentication and authorization contracts
  config/          fail-fast environment validation
  database/        PostgreSQL connection and Drizzle migrations
  domain/          platform-neutral domain and API types
  observability/   structured, redacted logging
  storage/         provider-neutral object storage contract
  ui/              cross-platform design tokens
  validation/      shared Zod schemas
infrastructure/    local Docker services
docs/              architecture, security, operations, and ADRs
```

## Local development

Prerequisites: Node.js 22+, Corepack/pnpm, and Docker.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d
pnpm db:migrate
pnpm dev
```

Web runs at `http://localhost:3000`; API liveness is at `http://localhost:4000/api/v1/health` and readiness is at `/api/v1/health/ready`.

Run quality gates with:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

See [development instructions](docs/development.md), [architecture](docs/architecture.md), and [security assumptions](docs/security.md) before contributing.

Phase 1 adds hosted Supabase email/password authentication, provisioned demo users, profile onboarding/settings, normalized usernames, and private S3-compatible avatar uploads. Configure `.env`, migrate, and run `pnpm seed:demo` before exercising the signed-in flow.

Phase 2 adds the social graph with private Boxes, owner/admin/member roles,
direct username invitations, bilateral friend requests, blocking, Box
rename/archive/delete controls, and explicit ownership transfer. Add the
optional `DEMO_FRIEND_*` values to `.env` to provision a second verified account
for the two-person test flow described in
[development instructions](docs/development.md#phase-2-social-testing).

Phase 3A adds private text posts inside Boxes and a chronological home feed.
Only active Box members can read posts, only the author can edit or delete one,
and archived Boxes remain readable while publishing is paused.

Phase 3B adds authenticated realtime Box and Home feed updates. Redis carries
metadata-only create/edit/delete notifications, while connected clients
re-fetch the authoritative private feed through the existing API.
