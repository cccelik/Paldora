# API

REST under `/api/v1`. The machine-readable contract is
[`contracts/openapi.json`](../contracts/openapi.json), generated from
`packages/validation/src/routes.ts`. This page explains the conventions; the
generated document lists the operations.

## Conventions

- **Authentication.** `Authorization: Bearer <Supabase access token>` on every
  route except those the contract declares `public`.
- **Errors.** Every non-2xx response has this shape:

  ```json
  { "error": { "code": "NOT_FOUND", "message": "…", "requestId": "…" } }
  ```

  - Branch on `code` and display `message`.
  - Treat unknown codes as generic failures.
  - Resources that must not be probed share one code for "missing" and "not
    yours", such as `BOX_NOT_FOUND`.

- **Global codes:**
  - `AUTHENTICATION_REQUIRED` (401)
  - `VALIDATION_FAILED` (400)
  - `NOT_FOUND` (404)
  - `METHOD_NOT_ALLOWED` (405)
  - `PAYLOAD_TOO_LARGE` (413)
  - `RATE_LIMITED` (429, with `Retry-After`)
  - `RATE_LIMIT_UNAVAILABLE` (503)
  - `SERVICE_UNAVAILABLE` (503)
  - `INTERNAL_ERROR` (500)
- **Correlation.** Every response carries `x-request-id`. Clients may send a
  safe ID (`[A-Za-z0-9._-]{1,128}`); otherwise one is generated.
- **Pagination.** Keyset only, using `?limit=1..50&cursor=<opaque>`. The
  response is `{ items, nextCursor }`. Never construct or parse a cursor.
- **Writes.**
  - PATCH is partial and server-authoritative.
  - Setting a state is idempotent (`PUT`), either full replacement or an
    explicit `null` to clear.
  - Concurrent edits use `expectedUpdatedAt` and fail with a resource-specific
    `*_STALE` code.
- **Compatibility.** Changes are additive only within `/api/v1`. See
  [contracts/README.md](../contracts/README.md).

## Operations

| Operation                 | Route                                         | Access        | Rate limit | Notes                                                                            |
| ------------------------- | --------------------------------------------- | ------------- | ---------- | -------------------------------------------------------------------------------- |
| `getLiveness`             | `GET /health`                                 | public        | none       | No I/O                                                                           |
| `getReadiness`            | `GET /health/ready`                           | public        | none       | PostgreSQL + Redis; `SERVICE_UNAVAILABLE`                                        |
| `getCurrentUser`          | `GET /me`                                     | authenticated | none       | Account, profile (signed avatar URLs, `avatarProcessing`), preferences           |
| `updateProfile`           | `PATCH /me/profile`                           | authenticated | 60/h       | `USERNAME_UNAVAILABLE`, `ONBOARDING_INCOMPLETE`, `INVALID_ONBOARDING_TRANSITION` |
| `getUsernameAvailability` | `GET /me/username-availability?username=`     | authenticated | 120/h      | Advisory; reasons `invalid`, `reserved`, `taken`                                 |
| `updatePreferences`       | `PUT /me/preferences`                         | authenticated | 120/h      | Idempotent replacement of `{ appearance }`                                       |
| `deleteAvatar`            | `DELETE /me/avatar`                           | authenticated | 60/h       | Idempotent; stored files deleted by the worker                                   |
| `createMediaUpload`       | `POST /media/uploads`                         | authenticated | 480/h      | Returns a signed PUT (300 s) bound to type and size. `STORAGE_UNAVAILABLE`       |
| `completeMediaUpload`     | `POST /media/uploads/{mediaAssetId}/complete` | authenticated | 480/h      | Single use. `MEDIA_NOT_FOUND`, `…_ALREADY_HANDLED`, `…_EXPIRED`, `…_MISMATCH`    |
| `getMediaAsset`           | `GET /media/{mediaAssetId}`                   | authenticated | none       | Owner-only status; `MEDIA_NOT_FOUND` for anyone else                             |

Every authenticated route can also return `ACCOUNT_NOT_PROVISIONED` (a valid
identity with no Paldora account) and `ACCOUNT_BLOCKED` (a suspended or
deleted account), both 403.

### Friends, blocks, and Boxes

| Operation              | Route                                    | Rate limit | Notes                                                                                                       |
| ---------------------- | ---------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `listFriends`          | `GET /friends`                           | none       | Paged                                                                                                       |
| `listFriendRequests`   | `GET /friend-requests`                   | none       | Incoming and outgoing, see `direction`                                                                      |
| `createFriendRequest`  | `POST /friend-requests`                  | 20/h       | `USER_NOT_FOUND`, `USER_BLOCKED`, `CANNOT_FRIEND_SELF`, `ALREADY_FRIENDS`, `FRIEND_REQUEST_ALREADY_PENDING` |
| `acceptFriendRequest`  | `POST /friend-requests/{id}/accept`      | exempt     | Recipient only                                                                                              |
| `declineFriendRequest` | `POST /friend-requests/{id}/decline`     | exempt     | 204                                                                                                         |
| `cancelFriendRequest`  | `DELETE /friend-requests/{id}`           | exempt     | Sender only; 204                                                                                            |
| `removeFriend`         | `DELETE /friends/{userId}`               | exempt     | 204; `FRIENDSHIP_NOT_FOUND`                                                                                 |
| `listBlocks`           | `GET /blocks`                            | none       | Your own blocks only                                                                                        |
| `createBlock`          | `POST /blocks`                           | 60/h       | Idempotent                                                                                                  |
| `removeBlock`          | `DELETE /blocks/{userId}`                | exempt     | Idempotent; 204; removes only your own block                                                                |
| `listBoxes`            | `GET /boxes`                             | none       | Paged                                                                                                       |
| `createBox`            | `POST /boxes`                            | 20/h       |                                                                                                             |
| `getBox`               | `GET /boxes/{boxId}`                     | none       | `BOX_NOT_FOUND` for every kind of non-access                                                                |
| `updateBox`            | `PATCH /boxes/{boxId}`                   | 60/h       | Owner: name, `status` `active`/`archived`                                                                   |
| `deleteBox`            | `DELETE /boxes/{boxId}?confirmName=`     | 20/h       | Owner; 204; `BOX_DELETE_CONFIRMATION_MISMATCH`                                                              |
| `listBoxMembers`       | `GET /boxes/{boxId}/members`             | none       | Paged                                                                                                       |
| `updateBoxMember`      | `PATCH /boxes/{boxId}/members/{userId}`  | 120/h      | Role `admin`/`member`                                                                                       |
| `removeBoxMember`      | `DELETE /boxes/{boxId}/members/{userId}` | 120/h      | 204                                                                                                         |
| `leaveBox`             | `DELETE /boxes/{boxId}/members/me`       | exempt     | 204; `BOX_OWNER_CANNOT_LEAVE`                                                                               |
| `transferBoxOwnership` | `PUT /boxes/{boxId}/owner`               | 20/h       | You become an admin; atomic                                                                                 |
| `createBoxInvitation`  | `POST /boxes/{boxId}/invitations`        | 60/h       | By username; no friendship needed; `BOX_ARCHIVED`, `ALREADY_BOX_MEMBER`, `INVITATION_ALREADY_PENDING`       |
| `listBoxInvitations`   | `GET /boxes/{boxId}/invitations`         | none       | Owners and admins                                                                                           |
| `revokeBoxInvitation`  | `DELETE /boxes/{boxId}/invitations/{id}` | exempt     | 204                                                                                                         |
| `listMyBoxInvitations` | `GET /me/box-invitations`                | none       | Pending, unexpired                                                                                          |
| `acceptBoxInvitation`  | `POST /box-invitations/{id}/accept`      | exempt     | Returns the Box; `INVITATION_EXPIRED` (410), `BOX_ARCHIVED`                                                 |
| `declineBoxInvitation` | `POST /box-invitations/{id}/decline`     | exempt     | 204                                                                                                         |

### Posts

| Operation      | Route                       | Rate limit | Notes                                                                                |
| -------------- | --------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `createPost`   | `POST /boxes/{boxId}/posts` | 120/h      | Active member, active Box; text 1–5,000 chars; `BOX_ARCHIVED`                        |
| `listBoxPosts` | `GET /boxes/{boxId}/posts`  | none       | Paged; items are `{kind:'post'}` or `{kind:'hidden'}` (block placeholder, no author) |
| `getHomeFeed`  | `GET /me/feed`              | none       | All your Boxes, chronological, never ranked                                          |
| `getPost`      | `GET /posts/{postId}`       | none       | `POST_NOT_FOUND` for missing, deleted, non-member, and blocked authors alike         |
| `updatePost`   | `PATCH /posts/{postId}`     | 120/h      | Author only (`POST_ACCESS_DENIED` for other members)                                 |
| `deletePost`   | `DELETE /posts/{postId}`    | 60/h       | Author only; 204; idempotent; text erased                                            |

### Photos on posts

1. `POST /media/uploads` with `{ purpose: "post_image", boxId, contentType,
contentLength }`, then `PUT` the bytes and `POST …/complete` as for avatars.
2. Poll `GET /media/{id}` until `ready` (or `failed`).
3. `POST /boxes/{boxId}/posts` with `{ content?, mediaAssetIds: [≤4 ready IDs] }`.
   Text may be empty if there is at least one photo. Photos cannot change after
   posting; editing changes the text only. Unclaimed photos are removed after
   24 hours.

Posts in responses carry `media: [{ id, width, height, url, thumbnailUrl }]`
with signed URLs that expire in 15 minutes; refetch rather than caching them.

### Realtime

`GET /me/events` is a `text/event-stream` (operation `openEventStream`). Send
the normal Bearer token, ignore `ping`, treat `resync` as "anything may have
changed", and refetch through normal routes on every other event. The server
ends the stream at token expiry; reconnect with backoff and a fresh token. At
most 5 open streams per person (`RATE_LIMITED` with `Retry-After` beyond that).
Events are `{ type, boxId?, postId?, at }`; see `RealtimeEvent` in the
contract.

Lists return `{ items, nextCursor }`; pass `limit` (1–50, default 20) and the
opaque `cursor`. People appear as `UserSummary`: `id`, `username`,
`displayName` (falls back to the username), and a signed `avatarUrl`
thumbnail or `null`.

## Uploading media

1. `POST /media/uploads` with `{ purpose, contentType, contentLength }`.
2. `PUT` the bytes to `upload.url`, sending exactly `upload.headers`. The
   storage service rejects a different type or length.
3. `POST /media/uploads/{id}/complete`. The asset becomes `processing`.
4. Poll `GET /media/{id}` until `ready` or `failed`. For avatars, `GET /me`
   shows the new photo once it is ready; the previous one stays until then.

The legacy reference list is in [legacy/docs/api.md](../legacy/docs/api.md).
