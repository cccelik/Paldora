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
