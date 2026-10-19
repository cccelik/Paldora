# ADR 011: One media module with tracked outbox completion

Status: accepted in minimal form (Phase 1, 2026-10-19); hardening in Phase 4.
Implements R4. D2 confirmed by the owner on 2026-10-18.

## Context

The legacy media pipeline had five weaknesses:

- **Duplicated services.** Five near-duplicate upload services existed.
- **False completion.** Outbox rows were marked `published` when enqueued,
  not when the work finished.
- **Orphaned objects.** BullMQ dropped deletion jobs after 5 failed attempts,
  leaving the stored objects behind.
- **Abandoned uploads.** Nothing reaped uploads that were started but never
  completed.
- **Original metadata kept.** Raw originals were stored forever with their
  EXIF/GPS data intact.

## Design

- **One media module** with a policy table per purpose (avatar, post image,
  reaction image, Life Update image, Room banner). Each policy sets the MIME
  allowlist, maximum size, ownership and scope rules, attachment rules, and
  derivative specs.
- **Upload flow.** Signed PUTs bound to exact MIME and length (300 s).
  Completion re-checks ownership, scope, stored MIME, exact size, and that the
  upload is attached only once.
- **Durable outbox states** (`pending → published → completed | dead`). The
  outbox ID is the BullMQ job ID. The worker marks `completed` in PostgreSQL;
  exhausted retries mark `dead` and alert.
- **Reaper** (the scheduled `maintenance.reap` job):
  - expires unattached `pending` uploads;
  - re-publishes stalled rows;
  - retries `dead` deletions with alerting;
  - enforces outbox retention.
- **Processing.** Sharp with `failOn: 'error'` and decoded-pixel limits,
  orientation applied, metadata stripped, bounded WebP derivatives.
- **Originals (D2, confirmed).** Keep a re-encoded, metadata-free WebP master
  (longest edge 2048 px for avatars) and delete the raw upload in the same
  transaction that marks the asset ready.

## Validation

Fault-injection integration tests must end with zero orphaned objects:

- Redis down;
- worker crash mid-job;
- storage 5xx;
- Box deletion during processing.

## What Phase 1 built

- `packages/domain` `MEDIA_PURPOSE_POLICIES` with one purpose, `avatar`;
  `media_assets` / `media_job_outbox` with the states above.
- API `media` module: reserve, signed PUT, single-use completion, owner-only
  status. Avatar removal lives in `identity`.
- Worker: a polling dispatcher (claims with `SKIP LOCKED` in a short
  transaction, enqueues after commit, marks `published`), `media.process`,
  `media.delete`, failure mirroring (`dead` after 5 attempts), and a reaper
  that expires abandoned reservations and requeues stalled rows.
- Purpose attach rules run in the "ready" transaction. Avatars: the newest
  ready upload wins, and the previous photo is retired only then, so a failed
  upload never costs the old one.

## Still open for Phase 4

- Retry dead deletions with alerting (today: counted and logged).
- Outbox retention and purging tombstoned assets.
- Fault-injection tests for a worker crash mid-job and Box deletion during
  processing (storage outages and exhaustion are covered now).
- Metrics instead of log-based alerting.
