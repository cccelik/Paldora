# ADR 016: Life Updates are stored once and delivered per Box; Memories are derived

Status: accepted; built in Phase 6 (2026-10-20). Plan:
[phase-6-life-updates-memories.md](../plans/phase-6-life-updates-memories.md).
Builds on [ADR 011](011-media-pipeline.md) (photos),
[ADR 012](012-realtime.md) (hints), [ADR 013](013-directional-blocks.md)
(blocks), and [ADR 015](015-interactions-and-activity-projector.md)
(interactions).

## Context

A Life Update is a structured "what's been going on" note that a person
shares with several Boxes at once, or keeps to themselves (Only Me). Memories
are the chronological view of everything a person can still see. Both touch
the core promises: content belongs to its author, each Box is a private
room, and nothing is kept in a place its readers can no longer reach.

The legacy build already stored a Life Update once with a backing post per
Box, but enforced the audience and isolation in services only, and the
Memories query merged post and Life Update lists in memory.

## Decision

- **Store once, deliver per Box.** One `life_updates` row holds the sections;
  `life_update_media` holds its photos once (user-scoped, purpose
  `life_update_image`). The audience is a set of `life_update_deliveries`
  rows: one per Box (at most 20, distinct) or a single only-me row.
- **A backing post per delivery.** Each Box delivery owns a `posts` row of
  `kind = 'life_update'` with no text. Feeds, keyset paging, comments,
  reactions, notifications, realtime hints, and Box deletion cascades all
  work on that post unchanged, so each Box keeps its own isolated
  conversation and the Phase 5 projector needed no change. Backing posts
  cannot be edited or deleted as posts (`POST_MANAGED_BY_LIFE_UPDATE`).
- **The audience is immutable, enforced by the database.** There is no route
  that changes it, and triggers refuse to insert a delivery outside the
  publishing transaction, to update or directly delete one, or to change
  `audience`, `author_user_id`, or `created_at`. Deferred triggers require a
  delivery for every Life Update and every backing post at commit. Editing
  changes sections and photos only, in every Box at once.
- **Access is "active membership now".** A viewer reaches a delivery only
  while they are an active member of its Box, the author included; responses
  list only the viewer's Boxes. Home shows a Life Update once, with a tab per
  reachable Box in alphabetical order; a Box feed shows only that Box's.
- **Delete is one soft-delete transaction**: the Life Update is tombstoned
  (sections erased), the backing posts are tombstoned, every delivery's
  comments, reactions, camera images, and notifications are erased, and the
  photos are retired through the deletion outbox. Box deletion tombstones a
  Life Update that loses its last Box; a worker sweep is the safety net.
- **Memories are derived, never stored.** There is no Memories table. One
  candidate query (ordinary posts and backing posts through the viewer's
  active memberships, collapsed to one row per Life Update, plus the
  viewer's own Only Me) serves both the cursor page and the year/month
  summary, so counts match the list. Items are re-authorized when loaded.
  Months are **UTC** publish months; edits never move an item.
- **Blocks (D1).** Feeds show a neutral placeholder for a blocked author's
  Life Update; Memories **omit** it entirely, with no placeholder and no
  count (a timeline has no position to keep). See the ADR 013 addendum.
- **Web.** `/memories` (years), `/memories/[year]` (months and the year's
  items under UTC month headings), `/memories/[year]/[month]`, and
  `/boxes/[id]/memories?year=&month=`, each with a type filter
  (all/posts/Life Updates) and "Load older" as plain links. Malformed
  periods are a 404 before the API is called, and a Box the viewer is not in
  is the same 404 as one that does not exist.

## Rejected alternatives

- **A copy per Box.** Simple reads, but an edit must fan out, photos are
  duplicated or shared by reference counting, a delete can miss a copy, and
  "stored once" (CLAUDE.md §A) is broken.
- **A Life Update with a Box array and no backing posts.** It would need a
  second set of feed, comment, reaction, notification, and realtime paths,
  and threads per Box would need a Box column on every interaction.
- **A mutable audience.** Adding a Box later exposes old content to people
  the author did not write for; removing one either destroys that Box's
  conversation or leaves it orphaned. Authors who want a new audience can
  share a new Life Update.
- **Service-only immutability.** One forgotten code path or a manual fix
  would silently change who can read something; the triggers make it
  impossible instead.
- **Materialized Memories** (a table or cache of each person's items). Every
  block, removal, leave, deletion, and archive would need an invalidation
  path, and a missed one leaks content the viewer can no longer see. Deriving
  per request is correct by construction, and EXPLAIN shows range scans on
  the existing `posts_box_feed_index`.
- **Local-time months.** The server does not know the viewer's time zone and
  the counts must be stable across devices; the pages say that months are
  UTC.

## Consequences

- A Life Update costs one post row per Box; the Home query collapses them
  with `representativeDelivery`, which depends on all backing posts sharing
  one `created_at` (tested).
- Every content query must keep using the one `hiddenByBlock` definition.
- Memories cost one candidate query plus batched loads per page and per
  summary, with a fixed query count (tested).

## Revisit when

- Authors need to widen an audience after publishing (a product decision; it
  would be a new, explicit "share again" rather than a mutable audience).
- Memories queries exceed their latency budget for real accounts with years
  of content: measure, then consider a covering index or a per-user
  read model rebuilt from source of truth, never a hand-maintained copy.
- Users ask for local-time months, or On This Day and recaps (§D) need a
  time-zone preference.
- A Box limit above 20 is needed.
