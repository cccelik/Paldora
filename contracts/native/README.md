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

## Avatars

Avatars are opaque media asset ids, never URLs. `getMyProfile` and
`updateMyProfile` return `profile.avatarMediaId`; feed items carry
`authorAvatarMediaId`, `listBoxMembers` items `avatarMediaId`, and notification
actors an optional `avatarMediaId`. Each is `null` unless the web adapter would
show the avatar (the profile points at it and the asset is `ready` and owned by
that member). Render it with `GET mediaRead/{id}/thumbnail`; whether a viewer
may see the bytes is re-checked on that read, and a hidden avatar is the same
`404` as any other absence, so show initials.

## Rooms and Memories

Twelve callables wrap the same trusted services as the web adapter (ADR 021
decision 8). The source is `packages/validation/src/native/rooms.ts` and
`memories.ts`.

- **Rooms:** `getMyRoom`, `getRoom` (`username`), `updateMyRoom`,
  `updateMyRoomWidgets`, `updateMyRoomTopFriends`, `listRoomPhotos`. A missing,
  blocked, hidden or inaccessible Room is one `not-found`. Theme, layout,
  accent, font, decoration pack, visibility and widget type are registry id
  strings; there is no CSS, color or URL. The banner is an opaque
  `bannerMediaId` (render with `mediaRead/{id}/display`; a ready `room_banner`
  asset you own, attached when you save). `music.url` is a public `https://`
  link card, never embedded. Phase 8 personalization is web-only.
- **Saving:** every Room write carries `expectedUpdatedAt`, the `updatedAt` the
  client loaded (epoch ms, `null` for a never-saved Room). A stale value is
  `failed-precondition` with reason `STALE_WRITE`: reload and retry. Repeating
  the exact saved state succeeds. Top Friends that are not accepted, unblocked
  friends, and an unusable banner, are `failed-precondition` without a reason.
- **Memories:** `listMyMemories`, `listBoxMemories` (`boxId`),
  `listRoomMemories` (`username`) take optional `year`, `month` (needs a
  `year`), `type` (`all`, `posts`, `life_updates`), `cursor` and `limit` (at
  most 50). Items are `post` or `life_update`, each with `occurredAt` (UTC
  publish time) and live interaction summaries. A cursor is opaque, at most 128
  characters, and only valid with the same scope, year, month and type
  (otherwise `invalid-argument`). `getMyMemorySummary`, `getBoxMemorySummary`,
  `getRoomMemorySummary` return year and month counts; they are exact scans with
  a tight limit (60 an hour).
- **Limits per hour:** Room reads 600, Room writes 60, `listRoomPhotos` 300,
  Memory lists 600, Memory summaries 60.

## Account safety

Ten callables and one HTTP Function wrap the web's account, session and report
code (ADR 021 decision 8). Source: `packages/validation/src/native/account.ts`,
`moderation.ts` and `http.ts`.

- **Password and sessions:** `changeMyPassword` (`currentPassword`,
  `newPassword` of 10 to 1024 characters) and `signOutEverywhere` return
  `{ ok: true, signInRequired: true }`. Every earlier ID and refresh token is
  then refused (`unauthenticated`, reason `SESSION_ENDED`): drop local
  credentials and sign in again. A wrong current password, or any other
  session failure, is one `permission-denied`. 5 an hour each.
- **Export:** `requestAccountExport` (5 an hour) builds a `paldora-json-v1`
  archive and returns `export` (`id`, `status` `pending`/`ready`/`expired`,
  `createdAt`, `readyAt`, `expiresAt`); `getAccountExport` returns the latest or
  `null`. When `ready`, `GET <accountExportDownload URL>/{exportId}` with the
  bearer ID token streams the JSON (`Content-Disposition: attachment`,
  `Cache-Control: private, no-store`; 20 an hour). Only the caller's latest
  ready, unexpired export downloads; unknown, foreign, older, pending, expired
  and malformed ids are the same `404`. `401` is a missing, invalid or ended
  session. Do not cache the file past the share sheet.
- **Deletion:** `getAccountDeletion` (`deletion` or `null`),
  `requestAccountDeletion` and `cancelAccountDeletion` take `password` and
  return `deletion` (`id` is the generation; `status` `pending`, `blocked` or
  `cancelled`; `requestedAt`, `dueAt` = requested + 7 days). Errors:
  `permission-denied` (password), `failed-precondition` (request: transfer
  every owned Box first; cancel: the window has closed), `not-found` (nothing
  to cancel). Requesting again while pending returns the same generation.
- **Reports:** `reportBoxComment` (`commentId`, `category` `harassment`/
  `spam`/`privacy`/`other`, `detail` string or `null`) returns `reportId`; an
  unknown or inaccessible comment is `not-found`. `listMyReports` pages your own
  receipts (`id`, `targetKind`, `targetId`, `category`, `status`,
  `createdAt`); `listMyModerationNotices` lists your content that moderation
  hid and that is still hidden. Staff callables are unchanged.

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
  `INVALID_INPUT`, `RATE_LIMITED`, `STALE_WRITE`). It never names a resource, membership,
  block or moderation state, so absence and denial stay identical. Treat an
  unknown or missing reason as no reason.

## Regenerate and check

The commands are `pnpm contract:native:generate` and
`pnpm contract:native:check`. They are added by the implementation task, not
yet by this documentation; confirm they exist in the root `package.json`
before relying on them. Check fails when generated files drift from the
Zod sources.
