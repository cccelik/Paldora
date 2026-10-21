# ADR 019: Moderation authority and durable audit

Status: Proposed (Phase 9)

## Context

Public registration requires a working abuse response. Existing `users.status`
already blocks suspended accounts on each API request, but there is no staff
role, report receipt, case history, or audit trail. A content takedown must also
close every read path, including signed media, feeds, Memories, Rooms and SSE
invalidation. Deleting an account is constrained by retained media rows and the
Room banner foreign key.

## Decision

- Staff authority is an explicit database grant keyed by internal user ID,
  assigned only by an operator command. It is never derived from an email,
  identity-provider claim, Box role, or client input. Grants and revocations
  append an audit event.
- Separate moderator case work from administrator staff grants and account
  lookup. Every case read and action has a reason, actor, target, time, and
  idempotency key. Audit rows are append-only at the database boundary; routine
  application roles cannot update or delete them. A privileged retention job is
  the only future exception, after a documented retention decision.
- Reports are private allegations. A reporter receives an opaque receipt, not
  a public tally. The subject never receives the reporter's identity. Target
  access is checked at submission, so a guessed or inaccessible ID gives the
  same absence response as its ordinary read path.
- Moderation hiding is a reversible state separate from author deletion. All
  ordinary reads use their existing not-found behavior, while a narrowly
  authorized case view can show the minimal evidence needed to decide a case.
  Restoring never resurrects author-deleted or Box-deleted content.
- Suspension uses `users.status='suspended'`. The existing principal resolver
  blocks the next API request; realtime streams must also stop when the state
  changes, without waiting for token expiry.
- Account deletion is an idempotent workflow. Before user removal it retires
  owned media through the outbox and clears `rooms.banner_media_id`. No claimed
  deletion is complete until object retirement and reference cleanup are
  verified. Export is a separate private, expiring artifact.
- Public signup remains disabled until all moderation and account-lifecycle
  paths, abuse controls, and hosted smoke tests pass and the owner approves
  activation.

## Alternatives rejected

- Email-domain or JWT-claim staff roles can be changed outside the application
  audit trail. Box administrators are community managers, not Paldora staff.
- Automatic takedown on report allows coordinated report abuse.
- Hard-deleting reported content at case opening destroys evidence and makes
  appeals impossible.
- Treating API request rejection alone as suspension leaves existing SSE
  streams active until their normal expiry.

## Revisit triggers

The owner decides evidence retention, appeal operations, deletion window, and
export format before their dependent slices ship. A production hosting decision
(D5) is needed before the hosted public-signup gate. If legal retention duties
require keeping deleted account data, specify the exact fields, access, and
schedule in a superseding ADR; this record makes no legal-retention claim.
