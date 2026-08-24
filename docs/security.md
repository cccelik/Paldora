# Security

Paldora is private by default and authorization is deny-by-default. Authentication will establish identity; it will never imply access to a particular Box or resource. Every feature must define create, read, update, delete, guessed-ID, blocked-user, and former-member behavior before implementation.

Current controls include strict input/config parsing, bounded pagination primitives, exact-origin CORS, baseline HTTP security headers, CSP on web, request IDs, redacted structured logs, private-storage interfaces, and separate liveness/readiness probes. The application does not accept arbitrary HTML, CSS, or JavaScript.

Phase 2 social mutations are rate limited per authenticated internal user in
Redis. Friend requests allow 20 attempts per hour and Box invitations allow 60.
If Redis cannot enforce a limit, these mutations fail closed with a stable 503
error. Ownership transfer updates both membership roles and the canonical Box
owner in one PostgreSQL transaction.

Permanent Box deletion is restricted to the current owner and removes current
membership and invitation records through foreign-key cascades. Destructive UI
requires the exact Box name plus a second confirmation. Future private media
cleanup must be queued before its Box-owned metadata is deleted.

Phase 3A post reads require an active Box membership on every query. Post
absence and access denial intentionally share `POST_NOT_FOUND`; Box feed access
does the same with `BOX_NOT_FOUND`. Authors alone can edit or soft-delete their
posts, archived Boxes reject new posts, and publishing fails closed when the
Redis rate limiter is unavailable. Post bodies are plain text, length-bounded,
and must never appear in application logs.

Realtime post notifications use the same Supabase bearer-token guard as other
private endpoints. Redis events contain only event IDs, Box IDs, post IDs,
actions, and timestamps. They never contain post bodies or profile data. Active
Box membership is checked before opening a stream and before forwarding every
event, so removed or departed members stop receiving invalidations. Browser
connections must originate from the exact configured `WEB_ORIGIN`.

Phase 3C image uploads are signed for an exact MIME type and content length,
limited to JPEG, PNG, and WebP files of at most 10 MB. Completion rechecks
ownership, Box membership, object metadata, and single-use attachment state.
The worker decodes untrusted originals with Sharp, applies orientation, strips
metadata, limits decoded input pixels, bounds output dimensions, and publishes
WebP derivatives. Feeds expose only
short-lived signed derivative URLs, never bucket credentials or object keys.
The viewer shares a protected `/posts/:id` application permalink rather than a
signed object URL, so recipients must authenticate and retain Box membership.

Phase 5 comments, reactions, notification lists, unread counts, and realtime
delivery all inherit current post and Box visibility. Removed members and
deleted posts disappear from reads even when durable activity exists. Blocks
reject new interactions and suppress related notification visibility. Comment
bodies never enter Redis events; streams carry identifiers only. Comment and
reaction mutation limits fail closed when Redis rate limiting is unavailable.
Camera reactions never accept public URLs or client-provided object keys. They
use short-lived signed uploads, exact server-side MIME/size verification,
private processed derivatives, signed downloads, active membership checks, and
owner-bound attachment. The web flow captures through `getUserMedia` and has no
photo-library input, preserving the realtime-capture behavior.

Security assumptions for this foundation:

- TLS is terminated by the deployment edge and HTTPS is enforced there.
- PostgreSQL and Redis are private-network services in deployed environments; local ports bind only to loopback.
- Secrets are injected by a secret manager and never use `.env.example` defaults outside local development.
- S3-compatible buckets are private and accessed with short-lived signed URLs.
- Edge/proxy request limits complement API-level distributed rate limiting.
- Dependency, container, and secret scanning are enabled by the hosting organization.
- Future encrypted Boxes require established protocols, client key management, external review, and a separate threat model. No encryption claim is made now.

Logs must never include bodies of private posts, credentials, access tokens, cookies, or private media URLs. Error responses will use stable codes and omit stacks in production.

Phase 1 uses Supabase only as the identity provider. Nest validates access tokens and maps `sub` to a separately provisioned internal user; arbitrary valid Supabase users are denied. The browser receives only the Supabase anonymous key. Password recovery does not disclose whether an address exists.

Avatar buckets remain private. Clients upload only through short-lived, size-bound, content-type-bound signed URLs; completion verifies metadata and ownership before attaching an asset. Replaced assets are deleted asynchronously. Production CSP origins and bucket CORS must be explicit rather than wildcarded.
