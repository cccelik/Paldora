# Paldora

> A box for your people.

Paldora is a privacy-first social platform and living scrapbook for real
friends and private communities. This repository is a greenfield rebuild,
delivered one release-gated phase at a time.

- **Status:** Phases 0–7 are delivered (foundation through Rooms). See [REBUILD_PLAN.md](REBUILD_PLAN.md).
- **Rules for contributors and agents:** [CLAUDE.md](CLAUDE.md).
- **Reference build:** [legacy/](legacy/) holds the frozen Phase 7 build.
  Use it as reference only and never import from it.

## Quick start

```bash
corepack enable && pnpm install && cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d --wait
pnpm db:migrate && pnpm dev
```

The web app runs at `http://localhost:3000` and the API at
`http://localhost:4000/api/v1/health`.

Details: [docs/development.md](docs/development.md) ·
[architecture](docs/architecture.md) · [security](docs/security.md) ·
[API](docs/api.md) · [decisions](docs/adr/README.md).
