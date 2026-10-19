# ADR 004: Zod route registry generates the OpenAPI contract

Status: accepted (2026-10-18). Implements R2.

## Context

Web, iOS, and Android must interpret errors, cursors, nullability, and DTO
evolution identically. The legacy build had a hand-written 842-line client,
separate domain types, and no language-neutral description.

## Decision

- **Single source.** `packages/validation` holds every request and response
  schema plus a route registry (`defineRoute`): operation ID, method, path,
  access, success status, schemas, and declared error codes.
- **Consumers derive from it:**
  - **Typed client.** `@paldora/api-client` builds requests from route
    definitions and validates every response at runtime. Mismatches surface
    as `UNEXPECTED_RESPONSE`.
  - **OpenAPI document.** `pnpm contract:generate` writes
    `contracts/openapi.json` (OpenAPI 3.1) using Zod 4's native
    `z.toJSONSchema`. No generator dependency is needed. CI runs
    `contract:check` and fails on drift.
  - **API routes.** The route-inventory test keeps Nest routes and the
    registry identical.
- **Conformance fixtures.** `contracts/fixtures/*.json` list valid and invalid
  payloads. The TypeScript suite runs today; Swift and Kotlin suites load the
  same files in Phases 10–11.
- **Native transport.** iOS uses `swift-openapi-generator`. Android uses a
  generator or hand-written kotlinx.serialization models verified by the
  fixtures; decided in Phase 11.
- **Compatibility.** `/api/v1` accepts additive changes only. Clients ignore
  unknown fields and unknown error codes.

## Alternatives rejected

- **zod-openapi or zod-to-openapi libraries.** Extra dependencies for what
  Zod 4 now does natively.
- **Hand-maintained OpenAPI.** It drifts.
- **GraphQL.** See ADR 002.

## Revisit when

Zod's JSON Schema output cannot express a needed construct, or native
generators produce unidiomatic code.
