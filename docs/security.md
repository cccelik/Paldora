# Security

Paldora is private by default and authorization is deny-by-default. Authentication will establish identity; it will never imply access to a particular Box or resource. Every feature must define create, read, update, delete, guessed-ID, blocked-user, and former-member behavior before implementation.

Current controls include strict input/config parsing, bounded pagination primitives, exact-origin CORS, baseline HTTP security headers, CSP on web, request IDs, redacted structured logs, private-storage interfaces, and separate liveness/readiness probes. The application does not accept arbitrary HTML, CSS, or JavaScript.

Security assumptions for this foundation:

- TLS is terminated by the deployment edge and HTTPS is enforced there.
- PostgreSQL and Redis are private-network services in deployed environments; local ports bind only to loopback.
- Secrets are injected by a secret manager and never use `.env.example` defaults outside local development.
- S3-compatible buckets are private and accessed with short-lived signed URLs.
- Edge/proxy request limits complement API-level distributed rate limiting when product endpoints arrive.
- Dependency, container, and secret scanning are enabled by the hosting organization.
- Future encrypted Boxes require established protocols, client key management, external review, and a separate threat model. No encryption claim is made now.

Logs must never include bodies of private posts, credentials, access tokens, cookies, or private media URLs. Error responses will use stable codes and omit stacks in production.

Phase 1 uses Supabase only as the identity provider. Nest validates access tokens and maps `sub` to a separately provisioned internal user; arbitrary valid Supabase users are denied. The browser receives only the Supabase anonymous key. Password recovery does not disclose whether an address exists.

Avatar buckets remain private. Clients upload only through short-lived, size-bound, content-type-bound signed URLs; completion verifies metadata and ownership before attaching an asset. Replaced assets are deleted asynchronously. Production CSP origins and bucket CORS must be explicit rather than wildcarded.
