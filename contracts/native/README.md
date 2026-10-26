# Native contract

The contract between Firebase callable Functions and the future iOS and
Android apps. Design and open decisions:
[ADR 021](../../docs/adr/021-firebase-native-contract.md) (Proposed). The
sibling `openapi.json` and `fixtures/` in `contracts/` are the retired HTTP
API and are historical.

## Layout

- Registry: one entry per callable (name, region `europe-west4`, input
  schema, output schema, error codes).
- Fixtures: valid and invalid payloads per callable, loaded by the TypeScript
  suite today and by Swift and Kotlin suites later.
- Generated JSON Schema, committed.
- Source schemas live in `packages/validation/src/native`; do not edit
  generated files by hand.

## Rules

- **Versioning:** undecided (V1 function suffix versus `contractVersion`
  field; see ADR 021). Until decided, changes are additive only; clients
  ignore unknown fields and unknown error codes.
- **Cursors:** opaque strings, at most 128 characters. Clients never parse
  them and send back exactly what the server returned.
- **Timestamps:** epoch milliseconds (integers).
- **Errors:** the `HttpsError` code plus a generic message. Do not display or
  parse the message. A stable `details.reason` is a proposed future field,
  not current behavior.

## Regenerate and check

The commands are `pnpm contract:native:generate` and
`pnpm contract:native:check`. They are added by the implementation task, not
yet by this documentation; confirm they exist in the root `package.json`
before relying on them. Check fails when generated files drift from the
Zod sources.
