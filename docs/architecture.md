# Architecture

Paldora is a TypeScript monorepo organized as a modular monolith. The client applications consume a versioned REST API through `@paldora/api-client`; they never connect to PostgreSQL, Redis, or object storage directly.

```text
Next.js web ─┐
             ├─> typed API client ─> NestJS API ─> repositories/adapters ─> PostgreSQL
Expo mobile ─┘                                 ├─> Redis
                                               └─> private object storage

                                      BullMQ worker ─> asynchronous adapters
```

The API owns authorization and orchestration. PostgreSQL is canonical. Redis is disposable infrastructure for queues, distributed rate limits, and carefully selected caches. Large media belongs in private S3-compatible object storage. The worker owns expensive or retryable operations.

Shared packages are intentionally narrow. `domain` has no framework dependency, `validation` owns transport-neutral schemas, `api-client` owns request behavior, and infrastructure packages expose interfaces or factories. React web and React Native do not share view components; only tokens and portable contracts cross that boundary.

Initial feeds will use keyset pagination and fan-out-on-read. Product modules remain inside the NestJS deployment until measured scale or ownership constraints justify extracting a service.

## Runtime health

`/api/v1/health` is a liveness probe and performs no network I/O. `/api/v1/health/ready` checks PostgreSQL and Redis and fails with HTTP 503 when either dependency is unavailable. Request IDs are accepted or generated and returned in response headers.

## Environments

Local, development, staging, and production use the same applications with environment-specific secrets and infrastructure. Configuration is parsed at startup. Production secrets must come from the deployment platform's secret manager, never repository files.
