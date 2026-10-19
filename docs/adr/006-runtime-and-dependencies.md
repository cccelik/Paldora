# ADR 006: Node 24 LTS and exact dependency pins

Status: accepted (2026-10-18). Decision D6, confirmed by the owner on 2026-10-18.

## Decision

- **Runtime.** Node 24 "Krypton", the Active LTS on 2026-10-18 according to
  nodejs.org. It is declared in `engines` and `.nvmrc`, and CI reads
  `.nvmrc`. Node 26 is current but not LTS.
- **Package manager.** pnpm 11.22.0, pinned in `packageManager`.
- **Pinning.** Every dependency is pinned exactly; there are no `^` ranges
  (legacy mixed them). Versions were chosen at least two weeks old, mostly
  the ones the legacy build ran successfully:

  | Area      | Package versions                                                                                  |
  | --------- | ------------------------------------------------------------------------------------------------- |
  | Web       | next 16.3.2, react 19.2.8                                                                         |
  | API       | @nestjs/* 11.2.1, jose 6.2.10, helmet 8.1.0                                                       |
  | Data      | zod 4.4.3, drizzle-orm 0.45.2, pg 8.16.3                                                          |
  | Jobs      | bullmq 6.2.0, ioredis 6.0.0                                                                       |
  | Logging   | pino 10.3.1                                                                                       |
  | Toolchain | typescript 6.0.2, vitest 4.1.11, playwright 1.62.1, @axe-core/playwright 4.13.0                   |
  | Media     | sharp 0.35.5, @aws-sdk/client-s3 3.1146.0, @aws-sdk/s3-request-presigner 3.1146.0 (added Phase 1) |
  | Auth      | @supabase/supabase-js 2.112.3 in the API, for the provisioning script only (Phase 1)              |

- **Dropped legacy dependencies:** class-validator, class-transformer,
  Tailwind, PostCSS, Expo, and React Native.
- **Build scripts.** `pnpm-workspace.yaml` lists every dependency allowed to
  run install scripts. `sharp` is explicitly denied: it loads prebuilt
  `@img/*` binaries, and its script only builds from source.
- **Adding a dependency** requires that its value exceed its maintenance,
  bundle, security, and lock-in cost. Record notable additions here.

## Consequences

- Upgrades are deliberate pull requests.
- Local machines need Node 24. pnpm warns on other versions.

## Revisit when

Node 26 enters Active LTS (scheduled for late October 2026). Plan the upgrade
within one phase.
