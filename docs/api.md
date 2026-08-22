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
