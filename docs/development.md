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

## Phase 1 local setup

1. Set the hosted development Supabase URL, anonymous key, and service-role key in `.env`. Never use a production service-role key locally.
2. Enable email/password in Supabase Auth, allow `http://localhost:3000/auth/callback`, and configure password-reset email redirects to that callback.
3. Start PostgreSQL, Redis, and private MinIO with the Docker Compose command above. MinIO creates `paldora-private` and applies local browser-upload CORS.
4. Run `pnpm db:migrate`, set a non-committed demo password, then run `pnpm seed:demo`.
5. Run `pnpm dev` and sign in with the provisioned demo account. No registration screen exists.

With the development web server running, `pnpm design:capture:phase1` refreshes the implementation-accurate auth/settings artboards.
