# Plans

Implementation plans for the greenfield rebuild. The phase order, status
table, and open decisions live in [docs/rebuild-plan.md](../rebuild-plan.md).

- [repo-cleanup.md](repo-cleanup.md): the behavior-preserving repository
  cleanup (in progress).
- [delivered/](delivered/): plans whose phase has shipped. They are history:
  verify them against the code before relying on them.
  - [Phase 3: posts, feeds, realtime](delivered/phase-3-posts-feeds-realtime.md)
  - [Phase 5: interactions and notifications](delivered/phase-5-interactions-notifications.md)
  - [Phase 6: Life Updates and Memories](delivered/phase-6-life-updates-memories.md)
  - [Phase 7: Rooms](delivered/phase-7-rooms.md)

There is no Phase 4 plan file. Phase 4 (photos on posts and the hardened media
pipeline) was scoped by [ADR 011](../adr/011-media-pipeline.md) and shipped in
commit `fb9a5c5`; its record is the Phase 4 delivery notes in the rebuild plan.
Phases 0 to 2 were planned in the rebuild plan itself.
