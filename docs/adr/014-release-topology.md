# ADR 014: Migrations run as a release job; API and worker deploy separately

Status: proposed (Phase 4, together with D5 production hosting). Implements
R9.

## Context

The legacy deploy script ran migrations on every service start. With more than
one replica, those migrations race. The API and worker also shared one free
container, with a hard-coded pool of 20 connections each.

## Proposed design

- **Release pipeline:**
  1. Back up and verify the database.
  2. Run a **single migration job**.
  3. Deploy the API and worker as separate services.
  4. Deploy web.
  5. Run smoke tests.
  6. Remove obsolete schema in a later release (expand/contract).
- **Configurable budgets.** `DATABASE_POOL_MAX` and `WORKER_CONCURRENCY` are
  set per service and sized against the database's connection limit.
- **Outbox dispatchers** run as a loop in the worker. `FOR UPDATE SKIP LOCKED`
  keeps multiple instances safe.
- **Production infrastructure requirements:**
  - PostgreSQL with point-in-time recovery and tested restores;
  - Redis with `noeviction` and persistence;
  - durable private object storage;
  - TLS and a secret manager;
  - metrics and alerts on readiness, error rate, latency, queue depth, and
    dead-lettered jobs.

## Open decision

D5: the hosting provider, chosen against current official pricing and limits.
The legacy free-tier demo topology is never production.
