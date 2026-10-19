# Phase 6 Memories — Developer Handoff

## Product model

Memories are derived at query time from currently visible standard posts and Life Updates. No archive copy or independent privacy state exists. Personal results deduplicate a multi-Box Life Update and retain all accessible Box context pills. Box results remain tied to one Box delivery.

## Responsive composition

- Memory home: responsive year-card grid with counts and an honest empty state.
- Year overview: twelve month cards leading to UTC month archives.
- Month/detail timeline: chronological cards with a compact date rail on desktop and the date above each card at 390px.
- Box archive: the same hierarchy under `/boxes/[boxId]/memories`, branded with the Box name and guarded by current membership.

## Privacy and lifecycle

Every request rechecks active membership, blocks, post/update lifecycle, and remaining Life Update deliveries. Removing a delivery removes it from that Box archive. Removing the final delivery removes the master from all archives and queues shared media cleanup once.

## Deferred

On This Day, friendship timelines, generated recaps, milestones, collections, and Rooms are intentionally absent from this release.
