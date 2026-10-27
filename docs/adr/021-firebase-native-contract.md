# ADR 021: Firebase native contract (callable registry and fixtures)

Status: **Proposed** (2026-10-26). Supersedes [ADR 004](004-contract-pipeline.md)
for native clients. Refines [ADR 010](010-native-apps-in-repo.md) (the apps
still live in this repository, but consume a different contract). Requires
owner decisions listed below before it becomes Accepted.

## Context

ADR 004 made a Zod route registry generate `contracts/openapi.json` for the
NestJS HTTP API. That API is retired; `contracts/openapi.json` and its
fixtures are historical behavior references only
([contracts/README.md](../../contracts/README.md)). The active backend is
Firebase ([native architecture](../firebase/native-architecture.md)), so the
real native boundary today is:

- **A. Callable Functions.** `apps/firebase-functions/src/index.ts` exports 35
  `onCall` functions in `europe-west4` (the task brief said 33; the code has
  35). Each derives the actor from `request.auth.uid`, runs inside
  `limited()` (a Firestore-backed per-user hourly bucket that fails closed),
  and delegates to `packages/firebase-trusted`. Inputs are validated by an
  ad-hoc `field()` helper plus per-callable regexes, not a shared schema.
  Outputs are TypeScript types in `packages/firebase-trusted` with
  timestamps as epoch milliseconds. Errors are `HttpsError` with a code and a
  deliberately generic message; there is no stable machine-readable `details`
  reason. Cursors are opaque strings but come in several formats: 36-character
  UUID-shaped, 64-character lowercase hex, and free strings validated only by
  length (36, 64 or 128).
- **B. Experimental direct Firestore.** `firebase/firestore.native.rules`
  (not deployed; the hosted project uses deny-all rules) opens only
  `nativeAccounts/{uid}/boxRefs/{boxId}`, `nativeBoxes/{id}` and
  `nativeBoxes/{id}/members/{uid}`. Everything else, and Storage, is
  deny-all.

Web-only features with no native entry point today: profile and current
user, Rooms, Memories, home feed, notifications, media upload/status/read,
account export and deletion, password and session changes.

## Decision (proposed)

1. **The contract is the callable registry plus fixtures**, kept under
   `contracts/native/`: a registry of callable name, region, input schema,
   output schema and error codes; conformance fixtures (valid and invalid
   payloads, per callable); and generated JSON Schema. Zod schemas in
   `packages/validation/src/native` are the source; generated files are
   checked in and CI fails on drift. See
   [contracts/native/README.md](../../contracts/native/README.md).
2. **Cursors are opaque.** Clients treat a cursor as a string of at most 128
   characters, never parse it, and send back exactly what they received.
   Servers may change the cursor format without a version bump. Existing
   callables converge on this rule; their current per-callable regexes are
   server details.
3. **Timestamps are epoch milliseconds** (integers) on the wire.
4. **Errors are the `HttpsError` code** (`unauthenticated`,
   `invalid-argument`, `permission-denied`, `not-found`, `already-exists`,
   `failed-precondition`, `resource-exhausted`, `internal`, ...) with a generic
   message that clients must not display or parse. Absence and denial stay
   indistinguishable (see CLAUDE.md section G). A stable
   `details.reason` string is a **proposed future field**, not current
   behavior: it would be a wire change to every error path and needs the
   owner decision below.
5. **Clients ignore unknown fields and unknown error codes**; changes within a
   version are additive only.
6. **Direct Firestore stays limited** to the three Box paths in
   `firestore.native.rules` until a privacy-equivalent, bounded query is
   proved for more. No other collection is opened to clients by this ADR.
7. Swift and Kotlin DTOs are generated from, or verified against, the JSON
   Schema and fixtures. Domain and UI layers stay native and hand-written.
   Native callable invocation uses the Firebase SDKs, not generated HTTP
   clients.

## Versioning (open)

Two options, neither chosen:

- **V1 suffix in the function name** (`createBoxPostV1`). Old and new
  coexist as separate deployed functions; retirement is explicit. Cost: more
  deployed functions (note `maxInstances: 1` per function today).
- **`contractVersion` field in the request**, one deployed function per
  operation. Cost: every handler branches on version and old shapes live in
  one codebase.

## Open owner decisions

1. **Reads: callables or direct Firestore.** Recommendation: callables for all
   content (posts, comments, reactions, Life Updates, feeds), because rules
   cannot express block filtering, per-item re-authorization or bounded
   Memories queries; direct Firestore only for the three Box paths already
   proved in emulator tests.
2. **Native realtime.** Options: listeners on a per-user hint document (rules
   needed, ID-only hints, clients re-fetch through callables), polling, or
   push notifications. Not designed yet.
3. **App Check.** Would harden callables against non-app clients. Needs the
   Blaze plan (and provider setup per platform). Spark is the current plan.
4. **Sign in with Apple.** Required by App Store review only if a third-party
   or social login is added. Email/password alone does not require it.
5. **Session and revocation model.** _Decided below._ Before the decision,
   callables took `request.auth.uid` without comparing `paldoraSessionEpoch`,
   so a native ID token stayed valid for up to an hour after a password change
   or sign-out-everywhere.
6. **Versioning scheme:** V1 suffix versus `contractVersion` field.
7. **`details.reason` wire change:** adopt a stable reason enum on
   `HttpsError.details`, or keep code-only errors.
8. **Which web-only features get callables first** (profile/current user,
   notifications, home feed, media, Rooms, Memories, export/deletion,
   password/session). Media needs a Storage design (Storage is deny-all) and
   likely Blaze.
9. **Hosted deployment.** Callables, App Check and new buckets need Blaze;
   `paldora-dev` stays on Spark without an owner instruction.

## Owner decisions recorded (2026-10-27)

- **#1 Reads:** callables for all content. Direct Firestore stays limited to the
  three Box paths already proved in emulator tests.
- **#2 Native realtime:** polling first. Revisit with push notifications when
  Phase 10 starts and a hosted project exists.
- **#5 Revocation:** callables enforce the session epoch (`paldoraSessionEpoch`)
  like the web session layer. Implemented locally: every callable first runs
  `requireSession`, which compares the ID token's `paldoraSessionEpoch` claim
  with `nativeAccounts/{uid}.sessionEpoch` (both absent counts as equal) through
  `NativeCallableSessions`, a per-instance cache with a 10 second TTL that fails
  closed. A rotated epoch answers `unauthenticated`, already in the contract, so
  no new wire error. The revocation window is therefore seconds, not an hour.
  Covered by unit tests and a local flow test; a password change or
  sign-out-everywhere forces native clients to sign in again because refresh
  tokens are revoked too.
- **#6 Versioning:** a `contractVersion` field on requests, not a name suffix.
  Additive changes stay compatible; a breaking change bumps the version and
  the server supports the previous one for a stated window. Design pending:
  the field's position in the registry and the unsupported-version error.
- **#7 `details.reason`:** adopt a stable reason enum, limited to reasons that
  keep absence and denial identical (for example rate limited, session ended,
  stale save, invalid input). Never a reason that distinguishes "not found"
  from "not allowed". This is a wire change, so it needs registry, fixtures
  and flow-test coverage before the ADR is Accepted.
- **#8 Callable order:** profile and current user, notifications, home feed
  first; media, Rooms, Memories and export/deletion follow. Media waits for a
  Storage design.
- **Still open:** #3 App Check, #4 Sign in with Apple, #9 hosted deployment
  (App Check and hosted deployment depend on Blaze; hosted staging is skipped
  for now). The ADR stays Proposed until these are decided.

## Alternatives considered

- **Keep ADR 004 / OpenAPI.** Rejected for native: there is no HTTP API to
  describe; callables use the Firebase wire protocol.
- **Direct Firestore everywhere.** Rejected as default: rules are not filters
  and have access-call limits (see native architecture).
- **Hand-written per-platform models without fixtures.** Rejected: drifts.

## Revisit when

Generator or SDK constraints block idiomatic Swift or Kotlin, rules prove a
bounded privacy-equivalent query for more collections, or the owner decides
on an HTTP gateway.
