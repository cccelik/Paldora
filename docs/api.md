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

## Uploading media

1. `POST /media/uploads` with `{ purpose, contentType, contentLength }`.
2. `PUT` the bytes to `upload.url`, sending exactly `upload.headers`. The
   storage service rejects a different type or length.
3. `POST /media/uploads/{id}/complete`. The asset becomes `processing`.
4. Poll `GET /media/{id}` until `ready` or `failed`. For avatars, `GET /me`
   shows the new photo once it is ready; the previous one stays until then.

The legacy reference list is in [legacy/docs/api.md](../legacy/docs/api.md).
