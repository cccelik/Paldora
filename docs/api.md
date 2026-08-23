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

## Box membership endpoints

| Method   | Path                                   | Purpose                    |
| -------- | -------------------------------------- | -------------------------- |
| `PATCH`  | `/api/v1/boxes/:boxId/members/:userId` | Promote or demote a member |
| `DELETE` | `/api/v1/boxes/:boxId/members/:userId` | Remove a non-owner member  |
| `DELETE` | `/api/v1/boxes/:boxId/members/me`      | Leave a Box                |
| `GET`    | `/api/v1/boxes/:boxId/invitations`     | List pending invitee IDs   |
| `PATCH`  | `/api/v1/boxes/:boxId/owner`           | Transfer Box ownership     |
| `PATCH`  | `/api/v1/boxes/:boxId`                 | Rename/archive/restore Box |
| `DELETE` | `/api/v1/boxes/:boxId`                 | Permanently delete Box     |

Owners can promote or demote non-owner members. Admins can promote members and
remove non-owner members, but cannot demote admins or alter the creator. The
creator must transfer ownership before leaving. Ownership transfer is atomic:
the selected active member becomes owner and the former owner becomes an admin.
Only the current owner may permanently delete a Box. Deleting the Box removes
all memberships and invitations through database cascades; future Box-owned
posts and metadata must use the same cascade contract, while private objects
must be queued for storage deletion before their metadata is removed.

Owners and admins may invite any active, provisioned user by username; an
accepted friendship is not required. Blocking still prevents invitations and
acceptance.

Friend requests are limited to 20 per user per hour and Box invitations to 60
per user per hour. Limits are enforced through Redis and return `RATE_LIMITED`
or `RATE_LIMIT_UNAVAILABLE` without weakening Box authorization.

## Phase 3A post endpoints

| Method   | Path                                | Purpose                         |
| -------- | ----------------------------------- | ------------------------------- |
| `POST`   | `/api/v1/boxes/:boxId/posts`        | Publish a text post             |
| `GET`    | `/api/v1/boxes/:boxId/posts`        | Read a Box's chronological feed |
| `GET`    | `/api/v1/me/feed`                   | Read posts from joined Boxes    |
| `GET`    | `/api/v1/me/feed/events`            | Stream joined-Box post changes  |
| `GET`    | `/api/v1/posts/:postId`             | Read one accessible post        |
| `PATCH`  | `/api/v1/posts/:postId`             | Edit an authored post           |
| `DELETE` | `/api/v1/posts/:postId`             | Soft-delete an authored post    |
| `GET`    | `/api/v1/boxes/:boxId/posts/events` | Stream Box post changes         |

Post content is plain text from 1 to 5,000 characters. Box and home feeds use
opaque keyset cursors ordered by creation time and UUID, newest first. Only an
active member can read a Box's posts. Only an active Box can receive new posts,
and only the post author can edit or delete their post. Inaccessible and
guessed post IDs return `POST_NOT_FOUND` to avoid leaking private resources.
Publishing is limited to 120 attempts per user per hour.

The event endpoints use authenticated Server-Sent Events. They emit
`post.created`, `post.updated`, and `post.deleted` notifications plus periodic
heartbeats. Event data contains identifiers and timestamps only—not post
content. Clients treat notifications as invalidation hints and re-fetch the
normal authorized feed. The Box stream checks access before connecting; both
streams check active membership again before each event is delivered.
