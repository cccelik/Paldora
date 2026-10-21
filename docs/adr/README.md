# Architecture decision records

Each ADR records one consequential decision: its context, the decision itself,
the alternatives that were rejected, and what would make us revisit it.
**Accepted** ADRs are settled. Reopen one only with new evidence, by writing a
superseding ADR. **Proposed** ADRs describe designs for later phases and become
accepted when their phase is built.

| ADR                                               | Decision                                                                                             | Status                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [001](001-postgresql-drizzle.md)                  | PostgreSQL is canonical, managed with Drizzle migrations                                             | Accepted                                               |
| [002](002-nestjs-modular-monolith.md)             | NestJS modular monolith, global guard, one error envelope                                            | Accepted                                               |
| [003](003-supabase-identity.md)                   | Supabase Auth for identity only; asymmetric JWTs                                                     | Accepted (D4)                                          |
| [004](004-contract-pipeline.md)                   | Zod route registry → OpenAPI 3.1 + conformance fixtures                                              | Accepted                                               |
| [005](005-design-tokens-and-styling.md)           | DTCG tokens generate CSS/TS/Swift/Kotlin; CSS Modules                                                | Accepted (D3, D7)                                      |
| [006](006-runtime-and-dependencies.md)            | Node 24 LTS, exact dependency pins                                                                   | Accepted (D6)                                          |
| [007](007-web-security-edge.md)                   | One nonce CSP in `proxy.ts`; proxy is optimistic only                                                | Accepted                                               |
| [008](008-rate-limiting.md)                       | Declarative sliding-window limits that fail closed                                                   | Accepted                                               |
| [009](009-test-strategy.md)                       | Integration fails, never skips; e2e on production builds                                             | Accepted                                               |
| [010](010-native-apps-in-repo.md)                 | Native apps in this repository, outside the pnpm graph                                               | Accepted                                               |
| [011](011-media-pipeline.md)                      | One media module; tracked outbox completion and a reaper                                             | Accepted (D2; Phase 4 hardening)                       |
| [012](012-realtime.md)                            | One SSE stream per tab, scoped channels, targeted refresh                                            | Accepted                                               |
| [013](013-directional-blocks.md)                  | Directional `user_blocks` table                                                                      | Accepted (Phase 2, D1)                                 |
| [014](014-release-topology.md)                    | Migrations run as a release job, separate services                                                   | Proposed (waits on D5 production hosting)              |
| [015](015-interactions-and-activity-projector.md) | One reaction per target; activity outbox projected by the worker; ID-only notifications              | Accepted (Phase 5)                                     |
| [016](016-life-updates-and-memories.md)           | Life Updates stored once with a backing post per Box; immutable audience; derived Memories           | Accepted (Phase 6)                                     |
| [017](017-rooms.md)                               | Lazy Room rows, closed widget registry, token-only themes, DB-enforced Top Friends, derived previews | Accepted (Phase 7; K4 hex values pending owner review) |
| [018](018-room-personalization-boundaries.md)     | Constrained typography and static widgets with authorized opaque srcdoc delivery                     | Accepted; production flags default off                 |
