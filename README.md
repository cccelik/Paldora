# Paldora

> A box for your people.

Paldora is a privacy-first social platform and living scrapbook for real friends
and private communities. The active workspace is a locally migrated Firebase
web application. Public signup and hosted release remain disabled.

`legacy/` is the frozen reference build; do not import from or modify it.

## Local start

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm build
pnpm firebase:local:dev
```

In a second terminal, run `pnpm firebase:local:seed` and `pnpm dev`. The web
app starts at `http://127.0.0.1:3000` against the `demo-paldora` emulators.

See [local development](docs/development.md),
[Firebase collection ownership](docs/firebase/collections.md), and
[Firebase migration status](docs/firebase/implementation.md),
[deployment](docs/deployment.md), and the
[staging checklist](docs/operations/staging-checklist.md).
