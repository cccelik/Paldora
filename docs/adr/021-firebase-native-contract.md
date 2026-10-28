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
   **First slice implemented (2026-10-27), 11 callables:** `getMyProfile`,
   `updateMyProfile`, `updateMyPreferences`, `listMyBoxes`, `createBox`,
   `getBox`, `listMyNotifications`, `countMyUnreadNotifications`,
   `markNotificationRead`, `markAllNotificationsRead`, `getHomeFeed`. Each wraps
   the same trusted service as the web adapter (`NativeProfiles`, `NativeBoxes`,
   `NativeNotifications`, `NativeHomeFeed`) with the same authorization and
   live visibility rechecks; absence and denial share `not-found`. Home feed
   items are posts and Life Update delivery posts (one item per backing post,
   as on web), blocked authors are dropped by the trusted services. **Storage-design
   dependency:** no avatar, signed URL or object key is returned. Media fields
   are opaque media asset ids only (`mediaAssetIds`, camera-reaction
   `realPreview[].mediaAssetId`), and `getMyProfile` has no avatar until the
   Storage design lands. Media, Rooms and Memories followed (see the decisions below). Account safety followed (see the decisions below). Nothing else of this decision is open.
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
  The same already-read account document carries `status`: a non-`active`
  (suspended) account is refused with the same `SESSION_ENDED`, at no extra
  read. The HTTP Functions (`mediaUpload`, `mediaRead`, `accountExportDownload`)
  verify the ID token with `checkRevoked`, so a disabled or revoked user gets
  the same `401` immediately, then the epoch and status check.
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
- **#8 Media (decided and implemented locally, 2026-10-27):** callables for
  state and authenticated HTTP Functions for bytes. `createMediaUpload`,
  `completeMediaUpload` and `getMediaAsset` wrap `NativeMedia` exactly as the web
  adapter does (purpose policy, exact MIME and length, owner check, expiry,
  single-use attachment). `mediaUpload` (`PUT /{assetId}`) and `mediaRead`
  (`GET /{assetId}/{display|thumbnail}`) in `europe-west4` require
  `Authorization: Bearer <Firebase ID token>`, verify it with Admin Auth, apply
  the callables' session-epoch check and a per-user limit, and run the web
  `/media` routes' authorization on every request (live Box membership, blocks,
  content state, and the second check after the Storage download). Absence and
  denial are the same `404`. `createBoxPost` gained `mediaAssetIds`
  (`createLifeUpdate` and `setBoxReaction` already carried media ids); an avatar
  attaches through its reservation. **Why not signed URLs:** a signed or
  download URL outlives the membership, block or deletion that revoked access,
  and Firestore permission cannot revoke it; HTTP bytes keep authorization on
  every read and keep object keys server-side. **Trade-off:** all image bytes
  pass through Functions (egress, per-request cost, cold starts, a 10 MB request
  limit), and clients cannot hand a URL to a system image cache without a
  custom authenticated loader. Revisit with a CDN or signed-cookie design only
  after measuring cost on a hosted (Blaze) project. Declared in
  `contracts/native` (`http` in `callables.schema.json`, README).
- **#8 Account safety (decided and implemented locally, 2026-10-28), 10
  callables and one HTTP Function:** `changeMyPassword`, `signOutEverywhere`,
  `requestAccountExport`, `getAccountExport`, `getAccountDeletion`,
  `requestAccountDeletion`, `cancelAccountDeletion`, `reportBoxComment`,
  `listMyReports`, `listMyModerationNotices`, plus `accountExportDownload`
  (`GET /{exportId}`). They wrap exactly what the web uses:
  `NativeWebSessions.changePassword` (Firebase REST reauth with
  `FIREBASE_WEB_API_KEY`, then session-epoch rotation and refresh-token
  revocation), a new `NativeWebSessions.signOutEverywhere` (same rotation, no
  password), `NativeAccountLifecycle` and `NativeModeration.createReport` /
  `myReports` / `notices`. Both session callables answer `{ ok, signInRequired }`
  and every older ID token is then `unauthenticated` (the instance that served
  the call forgets its cached epoch; another instance can lag by at most the
  10-second epoch cache). **No new error reason:** a wrong password, an unusable
  account and any other session failure are one `permission-denied`; the owned-Box
  precondition and the closed cancellation window are `failed-precondition`
  (each reachable from only one callable); a cancel with nothing to cancel is
  `not-found`. A new password under 10 characters is `invalid-argument` /
  `INVALID_INPUT` before any factor is checked. Password-bearing callables are
  limited to 5 an hour per user, and the limiter runs before the password is
  checked, so guessing is bounded. Passwords are never logged or echoed.
  `accountExportDownload` follows `mediaRead`: bearer ID token, session-epoch
  check, 20 an hour, and the web download route's rule (the id must be the
  caller's latest export, `ready` and unexpired, session re-verified right before
  the Storage stream starts). Unknown, foreign, superseded, pending, expired and
  malformed ids are one 404; `Cache-Control: private, no-store`, `Content-
Disposition: attachment`. `reportBoxComment` takes only `commentId` (as web);
  hidden or inaccessible comments are `not-found`. Receipts never include
  detail text or the reported author. Staff and admin callables are unchanged
  (`listModerationReports`, `hideReportedPost`).
- **#8 Rooms and Memories (decided and implemented locally, 2026-10-27), 12
  callables:** `getMyRoom`, `getRoom(username)`, `updateMyRoom`,
  `updateMyRoomWidgets`, `updateMyRoomTopFriends`, `listRoomPhotos(username)`,
  `listMyMemories`, `getMyMemorySummary`, `listBoxMemories`,
  `getBoxMemorySummary`, `listRoomMemories(username)` and
  `getRoomMemorySummary(username)`. Each wraps `NativeRooms` or `NativeMemories`
  exactly as the web adapter does, so Room visibility (`friends`, `members`,
  `hidden`), blocks, live Box membership, Top Friends eligibility and per-item
  Memory authorization are unchanged; a missing, blocked, hidden or inaccessible
  Room is the same `not-found`. Wire choices: theme, layout, accent, font,
  decoration, visibility and widget type are the registry id strings (no CSS or
  URL); the music link must be a public `https://` URL and is a link card only;
  the banner is an opaque `bannerMediaId` (a ready, owned `room_banner` asset
  from `createMediaUpload`, retired when replaced) rendered with `mediaRead`,
  which rechecks Room visibility per read; timestamps are epoch ms, so
  `expectedUpdatedAt` is epoch ms (or `null` for a never-saved Room) and the
  callable converts it to the trusted ISO version. **New reason `STALE_WRITE`**
  (`failed-precondition`) answers a stale `expectedUpdatedAt`; only the Room's
  owner can reach it, so absence and denial stay identical. Ineligible Top
  Friends and an unusable banner are `failed-precondition` with no reason.
  **Cursors:** the trusted Memory cursor is a several-hundred-character
  base64url document, over the 128-character contract limit, so the callables
  send a packed cursor (version, scope/filter digest, per-source done flag and
  raw position bytes, about 60 characters). It carries no authority: it expands
  back to the exact trusted cursor, a cursor for another scope, year, month or
  type is `invalid-argument`, and every item is still re-authorized. Memories
  accept an optional `year` for every scope (a superset of the web, which
  requires one for personal and Box pages); a `month` needs a `year`. The three
  summaries are exact scans (the web does not call them live), so they are
  limited to 60 an hour; lists to 600, `listRoomPhotos` to 300, Room writes to 60. `listRoomPhotos` returns at most six ready photos (opaque ids, size and
  source), like the web Room preview. **Not exposed:** Phase 8 personalization
  (custom CSS and sandboxed widgets) is web-only for now.
- **#8 Parity closure: Box management, comment threads, friend cancel, avatar
  removal (decided and implemented locally, 2026-10-28), 10 callables:**
  `updateBox` (60 an hour), `setBoxMemberRole` (120), `removeBoxMember` (120),
  `leaveBox` (30), `transferBoxOwnership` (10), `cancelFriendRequest` (120),
  `listBoxCommentThreads` (600), `listBoxCommentReplies` (600),
  `getBoxCommentThread` (600) and `deleteAvatar` (30). Each calls the same
  trusted method as the web adapter (`NativeBoxes.update/changeRole/
removeMember/transfer`, `NativeFriendships.cancel`,
  `NativeBoxPosts.commentThreadsPage/listCommentReplies/commentDetail/
countCommentReplies`, `NativeMedia.removeAvatar`), so rules and errors are
  the web's: Box rename, archive and restore are owner only; an owner may set
  any member to admin or member, an admin may only promote a plain member; the
  owner's role never changes; any non-owner may leave, an owner must transfer
  first; an owner transfer needs an active member and the previous owner
  becomes an admin in the same transaction. Every refusal (outsider, plain
  member, removed member, guessed id, wrong role, last-owner leave) is the same
  `not-found`; only malformed input (blank name, no field, self target, role
  `owner`, bad cursor) is `invalid-argument` / `INVALID_INPUT`. **No new
  reason:** the web has no client-supplied version on Box writes (`version` is
  bumped server-side), so there is no `STALE_WRITE` for Boxes. `closeFriendship`
  does **not** cover cancelling: on a pending request it marks the pair
  `declined` and either party may call it, whereas the web's cancel deletes the
  request and only the requester may, so `cancelFriendRequest` was added (an
  accepted friendship is `not-found` for it). Threads: `listBoxCommentThreads`
  pages roots newest first (20, cursor = last root id) with up to three replies
  oldest first and the full `replyCount`; items are `comment` or the
  placeholders `deleted` (kept because it still has replies) and `hidden`
  (blocked or unavailable author, no text or author). `listBoxCommentReplies`
  pages one root's replies oldest first (20); `getBoxCommentThread` returns the
  thread of a linked comment (a deleted root becomes a `deleted` placeholder; a
  linked reply outside the preview is appended). Deleted or hidden linked
  comments are `not-found` (the web returns `null` there). Unlike the web
  adapter, native comments carry no per-comment interaction summary (use
  `listBoxReactions` with `commentId`); `listBoxComments` is unchanged.
  `deleteAvatar` clears the avatar and any pending avatar upload and retires
  the assets; it is idempotent. **Box deletion:** `beginBoxDeletion` takes the
  exact `confirmName` and the trusted service compares it to the stored name
  (mismatch is `invalid-argument`); the web's second confirmation is a checkbox
  that exists only in the form, so native clients must show their own
  acknowledgement, and the web's synchronous drain is replaced by polling
  `boxDeletionStatus` (`phase` `complete`). The web's "delete and leave" Life
  Update action is `deleteLifeUpdate` plus a redirect, so `deleteLifeUpdate`
  suffices.
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
