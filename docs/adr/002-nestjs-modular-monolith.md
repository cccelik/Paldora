# ADR 002: NestJS modular monolith, global guard, one error envelope

Status: accepted (2026-10-18). Implements R1 in CLAUDE.md.

## Context

The legacy API had several structural weaknesses:

- one flat `AppModule` with about 33 providers;
- a guard applied per controller, so forgetting it left a route open;
- a class-validator pipe running next to Zod;
- no global exception filter, so request IDs never reached error bodies.

## Decision

- **Modules:** NestJS 11 on Express 5, one deployable. `PlatformModule` owns
  config, infrastructure, auth, rate limits, the error filter, and health.
  Each product phase adds one feature module.
- **Authentication:** `AuthGuard` is registered as `APP_GUARD`, so every route
  requires a verified bearer token unless marked `@Public()`.
- **Route inventory:** `route-inventory.test.ts` fails when routes and the
  contract registry diverge, when public flags disagree, or when a mutating
  route has no rate-limit decision.
- **Errors:** `ApiExceptionFilter` maps every error to
  `{ error: { code, message, requestId } }`. Framework errors map to stable
  codes, and unknown errors become `INTERNAL_ERROR` with no details.
- **Validation:** a `ZodPipe` validates request parts against shared schemas.
  There is no class-validator.
- **Dependency injection:** always use explicit `@Inject(Token)`. `tsx` and
  esbuild do not emit decorator metadata, so type-based injection breaks
  in development.
- **HTTP edge:** `configureApp()` holds it (correlation ID, helmet with a
  `default-src 'none'` CSP, a 256 kB JSON limit, exact-origin CORS without
  credentials, `/api/v1`). The server and the tests share it.

## Alternatives rejected

- **Microservices.** No measured need, and much higher operating cost.
- **Fastify adapter.** Marginal gains for this workload.
- **GraphQL.** The REST contract maps directly onto native clients and HTTP
  caching.

## Revisit when

A module needs independent scaling, or a separate team owns it.
