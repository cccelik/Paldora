# Local Firebase development

Paldora's active web app uses Firebase Auth session cookies, Firestore, private
Storage objects, trusted server-side services, and local Functions. The web app
calls `@paldora/firebase-trusted` through `FirebaseWebData`; the browser has no
Firebase Admin credentials and cannot read application data through client SDK
rules. The old HTTP API, PostgreSQL, Redis, MinIO, Supabase, and worker are no
longer part of the active workspace. `legacy/` is a frozen reference.

Public signup remains disabled. The hosted `paldora-dev` project remains on
Spark with hosted Firestore rules set to deny all. Do not point this local setup
at a hosted project. The external appeal/moderation email, hosted checks,
billing decision, and release approval remain separate prerequisites.

## Prerequisites

- Node 24 (`.nvmrc`), Corepack, and pnpm 11.22.0.
- Java 21 for the Firestore emulator.
- Chromium installed with `pnpm exec playwright install chromium` for browser tests.

## First run

```bash
corepack enable
pnpm install --frozen-lockfile
cp -n .env.example .env
pnpm build
```

Use Node 24 (`nvm use` if you use nvm). If `.env` already exists, check that its
Firebase project and emulator values match `.env.example`; `cp -n` will not
replace it.

In terminal one, start Auth, Firestore, Storage, Functions, and Pub/Sub:

```bash
pnpm firebase:local:dev
```

In terminal two, provision a local fixture account and start Next.js:

```bash
PALDORA_FIXTURE_EMAIL=me@example.test \
  PALDORA_FIXTURE_PASSWORD='a-local-test-password' pnpm firebase:local:seed
pnpm dev
```

The website is at `http://127.0.0.1:3000`. Use only `demo-paldora` for local
emulators. Sign in with the fixture email and password, then finish onboarding.
The seed command requires running emulators and an email/password; see
[collections.md](firebase/collections.md) for canonical collections and
[account-lifecycle.md](firebase/account-lifecycle.md) for export/deletion repair.

## Verification

| Command                                                  | Purpose                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | Static, unit, and build gates                                |
| `pnpm firebase:parity:check`                             | Rejects legacy runtime imports and old workspace services    |
| `pnpm firebase:rules:check`                              | Hosted and native emulator rule checks                       |
| `pnpm firebase:trusted:test`                             | Trusted Auth, Firestore, and Storage integration             |
| `pnpm firebase:local:flow:test`                          | Functions and durable job flow                               |
| `pnpm firebase:web:local:test`                           | Seeded production web build, desktop and 390px browser tests |
| `pnpm scan:client-bundle`                                | Checks built browser assets for credentials                  |

Stop the manually running emulators before `pnpm firebase:web:local:test`, since
the test starts its own emulators on the same ports. It seeds only those test
emulators and stops them afterward. `test:e2e` is an alias for that suite.
Details for media repair are in
[media-local.md](firebase/media-local.md).
