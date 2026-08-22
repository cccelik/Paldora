# API

The initial API is REST under `/api/v1`. The unprotected liveness endpoint is `GET /api/v1/health`; `GET /api/v1/health/ready` is intended for trusted orchestration probes.

Clients use `@paldora/api-client`, which centralizes base URL handling, response parsing, and typed errors. New endpoints require request and response contracts, server-side validation, explicit authorization, stable error codes, pagination where lists can grow, and API tests.

Errors use this public shape:

```json
{
  "error": {
    "code": "POST_NOT_FOUND",
    "message": "The requested post was not found.",
    "requestId": "optional-correlation-id"
  }
}
```

Resource absence and forbidden access may intentionally share a response to prevent identifier probing. Cursor values are opaque to callers; page sizes are bounded to 50 at the shared validation layer.

## Phase 1 identity endpoints

All `/me` endpoints require a Supabase access token in `Authorization: Bearer <token>`. The API validates issuer, audience, signature, and expiry, then resolves the token subject to a provisioned application user. A valid Supabase identity without an application row receives `ACCOUNT_NOT_PROVISIONED`.

| Method   | Path                                     | Purpose                               |
| -------- | ---------------------------------------- | ------------------------------------- |
| `GET`    | `/api/v1/me`                             | Current account and profile           |
| `POST`   | `/api/v1/me/username/availability`       | Advisory normalized username check    |
| `PATCH`  | `/api/v1/me/profile`                     | Partial profile/onboarding update     |
| `POST`   | `/api/v1/me/avatar/uploads`              | Create a five-minute signed upload    |
| `POST`   | `/api/v1/me/avatar/uploads/:id/complete` | Verify and attach the uploaded avatar |
| `DELETE` | `/api/v1/me/avatar`                      | Detach and queue avatar deletion      |

Stable Phase 1 errors include `AUTHENTICATION_REQUIRED`, `ACCOUNT_NOT_PROVISIONED`, `ACCOUNT_BLOCKED`, `VALIDATION_FAILED`, `USERNAME_UNAVAILABLE`, `AVATAR_UPLOAD_NOT_FOUND`, `INVALID_AVATAR_UPLOAD`, and `STORAGE_UNAVAILABLE`.
