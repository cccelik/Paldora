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

## Media (HTTP Functions)

Private media uses callables for state and two authenticated HTTP Functions for
bytes (ADR 021 decision 8). There are no signed URLs, Storage paths or Firebase
download URLs. The machine-readable form is the `http` key of
`callables.schema.json`; the source is `packages/validation/src/native/http.ts`.

1. `createMediaUpload` (`purpose`, `boxId?`, `contentType`, `contentLength`)
   returns `mediaAsset` and `upload` (`PUT`, function `mediaUpload`, path
   `/{assetId}`, the exact `Content-Type`, `expiresAt`).
2. `PUT <mediaUpload URL>/{assetId}` with `Authorization: Bearer <Firebase ID
token>`, the reserved `Content-Type` and exactly the reserved byte count.
   `204` on success. Statuses: `400` (type, length or image mismatch, or
   expired), `401`, `404`, `405`, `413`, `429`, `503`. A second upload to the
   same asset is `404`.
3. `completeMediaUpload` (`assetId`) starts processing; poll `getMediaAsset`
   (`status`, `available`, `width`, `height`; owner only) until `ready`.
4. Attach by id: `createBoxPost.mediaAssetIds` (at most 4 `post_image`),
   `createLifeUpdate.mediaAssetIds`, `setBoxReaction.mediaAssetId` with `kind:
"real"` (`reaction_image`). An `avatar` asset becomes the avatar when it
   becomes ready; the pending avatar is tied to the reservation.
5. `GET <mediaRead URL>/{assetId}/{display|thumbnail}` with the same bearer
   returns `image/webp`. `Cache-Control: private, no-store`; never cache it to
   disk past the session. Absence, denial (non-member, block, removed or deleted
   content), not-ready and unknown variants are the same `404` with the same
   body (`{"error":{"code":"not-found"}}`). `401` means the token is missing,
   invalid or its session epoch ended.

Both functions apply the callables' session-epoch check and a per-user hourly
limit (`mediaUpload` 480, `mediaRead` 6000). `createMediaUpload` is limited to
480 an hour, plus 120 an hour for `reaction_image`.

## Rules

- **Versioning:** undecided (V1 function suffix versus `contractVersion`
  field; see ADR 021). Until decided, changes are additive only; clients
  ignore unknown fields and unknown error codes.
- **Cursors:** opaque strings, at most 128 characters. Clients never parse
  them and send back exactly what the server returned.
- **Timestamps:** epoch milliseconds (integers).
- **Errors:** the `HttpsError` code plus a generic message. Do not display or
  parse the message. `details.reason` is optional and one of `errorReasons` in
  `callables.schema.json` (`SIGN_IN_REQUIRED`, `SESSION_ENDED`,
  `INVALID_INPUT`, `RATE_LIMITED`). It never names a resource, membership,
  block or moderation state, so absence and denial stay identical. Treat an
  unknown or missing reason as no reason.

## Regenerate and check

The commands are `pnpm contract:native:generate` and
`pnpm contract:native:check`. They are added by the implementation task, not
yet by this documentation; confirm they exist in the root `package.json`
before relying on them. Check fails when generated files drift from the
Zod sources.
