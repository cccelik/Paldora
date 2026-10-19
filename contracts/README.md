# Contracts

The language-neutral boundary shared by the web app, the iOS app, and the
Android app.

- `openapi.json` is **generated** from the Zod schemas and the route registry in
  [`packages/validation`](../packages/validation/src/routes.ts). Never edit it by
  hand. Run `pnpm contract:generate` after changing a route or schema and commit
  the result. CI runs `pnpm contract:check` and fails on drift.
- `fixtures/*.json` are conformance cases. Each file names a schema and lists
  `valid` and `invalid` payloads. Every client must accept and reject them
  identically. The TypeScript suite lives in
  `packages/validation/src/conformance.test.ts`. The Swift and Kotlin suites
  will load the same files in Phases 10–11.

Compatibility rules for `/api/v1`:

- Additive changes only: new optional fields, new endpoints, new error codes.
- Clients ignore unknown fields and treat unknown error codes as generic
  failures that show `error.message`.
- Removing or renaming a field, tightening a request rule, or changing a
  code's meaning requires a new API version.
