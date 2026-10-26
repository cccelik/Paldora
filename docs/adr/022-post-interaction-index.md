# ADR 022: Per-actor interaction index on the post document

Status: **Proposed** (2026-10-26). Refines [ADR 015](015-interactions-and-activity-projector.md)
for the Firebase-native build.

## Context

`NativeBoxPosts.interactionSummary` scans every comment and reaction of a post
to build counts, previews and the viewer-relative totals. Measured read cost:
a Box feed page costs 465 reads, 440 of them from `interactionSummary`
(about 22 reads per post). Counts are **viewer-relative**: comments and
reactions by actors the viewer has blocked (either direction) or whose account
is suspended are hidden at read time, so a single global counter would leak
exactly the actors the viewer must not see.

## Decision

Store `posts/{postId}.interactionIndex` and maintain it in the **same
transaction** as every canonical write:

```text
{ v: 1,
  comments:  { [uid]: n >= 1 },                       // active, not moderation-hidden, replies included
  reactions: { [uid]: { kind, mediaAssetId? } } }     // post-level reactions only
or { v: 1, overflow: true }
```

- Keys are addressed with `FieldPath('interactionIndex', map, uid)`; a key is
  removed when its count reaches 0.
- Each map is capped at `INDEX_ACTOR_CAP = 1000` actors. The write that would
  add the 1001st key replaces the field with `{ v: 1, overflow: true }`; writers
  then skip that post and a repair can clear the flag when counts fit.
- An index is trusted only when `v === 1`, both maps exist and `overflow` is
  absent. A writer that sees another `v` replaces the field with
  `FieldValue.delete()` (rollback self-heals). A missing or overflowed index is
  left alone; `repair` owns it.
- Asset readiness is **not** cached; it is checked at read time.
- Readers (a later task) sum per-actor entries after excluding the viewer's
  blocked and suspended actors, with no subcollection scan.
- `repair(boxId, postId)` recomputes the raw index from canonical docs in one
  transaction and writes it whole, so stale or erased actors cannot persist.
  `check()` is read-only; `backfillPage(cursor, limit)` repairs existing posts.
- Writers: post create, Life Update backing-post create, `createComment`
  (+1), `deleteComment` (-1 only if the comment was active and not
  moderation-hidden), post-level `setReaction`. Comment edits do not touch it.

## Rejected alternatives

- **Global counters** leak blocked and suspended actors.
- **Sharded counters** solve write contention we do not have and still are not
  per-actor.
- **`count()` aggregations** cannot exclude a viewer's blocked/suspended set.
- **Cloud Function triggers** are eventually consistent and drift.
- **A separate meta document** adds about 20 reads per page.
- **Per-viewer materialised summaries** multiply writes by audience size.
- **A cache layer** adds a second source of truth and invalidation bugs.

## Consequences

Comment and reaction transactions now write the post document, so they contend
on one document per post (Firestore sustains roughly one write per second per
document; Box discussions are far below this). The post document grows by
about 60 bytes per actor, bounded by the cap. Posts are not client-readable, so
the field is never exposed; `toPost` picks fields explicitly.
Moderation and account-lifecycle writers must maintain the index in a
follow-up change until they do, `repair` is the safety net.

## Revisit when

- more than 0.1% of posts overflow;
- more than 1% of comment/reaction transactions abort, or p95 latency regresses;
- posts become client-readable;
- comment-level summaries are needed;
- Firestore limits or pricing change.
