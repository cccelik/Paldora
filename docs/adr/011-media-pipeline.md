# ADR 011: One media module with tracked outbox completion

Status: accepted; built across Phases 1 and 4 (2026-10-19). Implements R4.
D2 confirmed by the owner on 2026-10-18.

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

## What Phase 4 added

- **Post photos (`post_image`).** Box-scoped: a reservation names a Box the
  person belongs to (stranger → `BOX_NOT_FOUND`, archived → `BOX_ARCHIVED`).
  Derivatives: master 2560 px, display 1600 px, thumbnail 640 px, all
  metadata-free WebP, no enlargement. Up to 4 per post.
- **Claiming.** A post claims photos in its own transaction: each must be
  ready, owned by the author, from that Box, and unused. A unique index on
  `post_media.media_asset_id` makes single use final under races. Every
  unusable photo answers `MEDIA_NOT_FOUND`; an unfinished one answers
  `MEDIA_NOT_READY`.
- **No orphans by construction.** Deleting a post tombstones its photos and
  queues deletion of every object they own in the same transaction. Box
  deletion does the same for the Box's photos before the cascade (the
  `box_id` foreign key is `SET NULL`, allowed only for tombstoned rows).
  A photo that finishes processing after its asset was retired deletes its own
  derivatives.
- **Reaper (every 15 min).** Expires abandoned reservations; removes ready
  photos no post claimed within 24 h; requeues stalled `published` rows;
  retries dead deletions after an hour, up to 25 attempts; purges completed
  outbox rows after 30 days; logs at error level while any row stays dead.
- **Fault-injection tests** end with zero stored objects for the asset:
  storage failure halfway through writing derivatives, retries exhausted,
  Redis down at enqueue (intent kept, delivered once later), Box deleted before
  processing, and Box deleted between the last derivative and "ready".
- **Viewing.** Photos reach clients only as short-lived signed display and
  thumbnail URLs on posts the viewer may see. Hidden (blocked) posts carry no
  media. A native `<dialog>` lightbox provides focus handling and keyboard
  navigation.

## Still open

- Hosting (D5): a managed storage lifecycle policy could replace parts of the
  reaper; decide with production hosting.
- Metrics and alert routing: today alerts are error logs.
- Purging tombstoned asset rows, which Phase 9 account deletion needs anyway.
