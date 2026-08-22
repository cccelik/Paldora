# Development

Use Node.js 22 or newer and the pnpm version pinned in the root `package.json`.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d
pnpm db:migrate
pnpm dev
```

Run a single application with `pnpm --filter @paldora/web dev`, `pnpm --filter @paldora/api dev`, `pnpm --filter @paldora/worker dev`, or `pnpm --filter @paldora/mobile dev`.

Before opening a pull request run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Browser tests use `pnpm test:e2e`. A test database must be isolated from development and production data.

Keep controllers thin, business rules in domain/services, database access behind repositories, and shared packages acyclic. Do not weaken strict TypeScript rules or use `any` to bypass a contract.
