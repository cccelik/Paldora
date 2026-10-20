# Phase 6 plan: Life Updates and derived Memories

Status: accepted by the owner with all recommended defaults (2026-10-20); in implementation. Drafted by a smaller model, reviewed by the lead. Scope comes from [REBUILD_PLAN.md](../../REBUILD_PLAN.md) Phase 6, CLAUDE.md sections C/F/G/Q, [ADR 011](../adr/011-media-pipeline.md), [ADR 013](../adr/013-directional-blocks.md) and [ADR 015](../adr/015-interactions-and-activity-projector.md). It follows the format of [phase-5-interactions-notifications.md](phase-5-interactions-notifications.md). Legacy behaviour (`legacy/apps/api/src/{life-update,memory}*.ts`, `legacy/design/07-life-updates`, `legacy/design/13-memories`) was read for reference only and nothing is imported from it.

I checked every claim about existing code against the repo at commit `1faf082`.

Facts that drive the design:

- `posts.box_id` is NOT NULL and posts are soft-deleted (the `erasePostInteractions` pattern).
- `PostService.create` locks the Box `FOR SHARE`.
- `loadPostContext` joins the viewer's active membership and the block flag in one query.
- `media_assets` is `box`-scoped or `user`-scoped. `createMediaUploadSchema` already requires `boxId` if and only if the purpose is box-scoped.
- The reaper's `unattachedMedia` has one branch per claimed purpose.
- `BoxLifecycleService.remove` only retires assets whose `media_assets.box_id` is the Box.
- `FeedItem` is a `post | hidden` discriminated union.

---

## A. Summary and scope

**In scope**

- Create a Life Update with optional named sections (nine fixed keys, at most 2,000 characters each, at most 10,000 in total) and up to four photos.
- The audience is `only_me`, or 1–20 distinct active Boxes where the author is an active member. It is chosen once and is immutable.
- Content and photos are stored once. Each Box delivery gets exactly one backing `posts` row, so comments, reactions and notifications are isolated per Box with no Phase 5 code changes.
- Edit (sections and photos, propagated to every delivery) and delete (the whole update).
- Home shows one deduped card per Life Update with alphabetical Box tabs. A Box feed shows the single delivery for that Box.
- A detail page `/life-updates/{id}` with the selected Box's comment thread, and a "mine" list.
- Memories: a derived, UTC year/month, cursor-paginated view, re-authorized on every query. There is a personal scope and a per-Box scope, with year/month summary counts.
- Block hiding consistent with D1 across every content type, with new rows in the ADR 013 matrix test.
- A creation rate limit and a purpose-specific photo upload limit.

**Explicitly out**

- On This Day, recaps, milestones, friendship timelines and collections.
- A friend's Life Update history (`/users/{username}/life-updates`) waits for Rooms (Phase 7).
- Moderator removal of others' Life Updates (Phase 9).
- "New Life Update" notifications, email or push (Phase 10). Comments and reactions on a delivery already notify through the unchanged Phase 5 projector.
- Per-delivery removal and audience changes.
- Backdating or a user-set date.
- Drafts, scheduling and rich text.

**Do Memories include ordinary posts? Recommendation: yes.** Memories cover every post and Life Update the viewer can still access, with an optional `type=all|posts|life_updates` filter, default `all`.

- It matches legacy (`memory.service.ts` merged both) and the Memory definition in CLAUDE.md: "a derived chronological view of content the viewer can still access".
- Life Updates alone would be a thin timeline for many users.
- It costs one candidate query over two sources. No copied content is stored either way.

Only Me Life Updates appear in the author's Memories only.

---

## B. Decisions needing the owner (recommended default in bold)

| #   | Question                                   | Default                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Editing a published Life Update            | **Author may edit sections and photos at any time, with no edit window.** Edits propagate to every delivery, because the content is stored once. The card shows "edited". The audience and the month bucket never change. An edit needs at least one section or photo left.                                                                  |
| 2   | Edit when some delivery Boxes are archived | **Allowed while at least one delivery Box is active, or the update is Only Me.** If every delivery Box is archived, the edit fails with `BOX_ARCHIVED`. Archived Boxes still show the current content. Archiving freezes interactions, not shared content.                                                                                   |
| 3   | Deleting                                   | **The author deletes the whole Life Update only.** All deliveries go in one transaction: backing posts are tombstoned, and comments, reactions, camera images and notifications are erased through `erasePostInteractions`. Photos are retired once. There is no per-delivery removal (it would be a back-door audience edit).               |
| 4   | Idempotent delete                          | **Soft delete.** The Life Update row stays as a tombstone (`status='deleted'`, sections erased) so a retried DELETE returns 204 for the author, as posts do.                                                                                                                                                                                 |
| 5   | What a Box owner/admin may do              | **Nothing special.** They can read, comment and react like any member. Moderation of others' content waits for Phase 9, as with posts.                                                                                                                                                                                                       |
| 6   | Archived Box at create                     | **An archived Box in the audience fails the whole create with `BOX_ARCHIVED`.** There is no partial publish.                                                                                                                                                                                                                                 |
| 7   | Leaving or removal                         | **The delivery stays in the Box**, like posts. The former member loses access to that Box's delivery everywhere (feeds, detail, Memories). If the author is the one who left, the update remains for the remaining members. Access always means "active membership right now", even for the author. Only Me is always the author's.          |
| 8   | Box deletion                               | **Only that Box's delivery is destroyed** (its backing post cascades). If it was the update's last Box delivery, the update is tombstoned and its photos retired in the same transaction. A reaper sweep is the safety net.                                                                                                                  |
| 9   | Section set                                | **Reuse the legacy nine fixed keys**: `lifeLately`, `workOrUniversity`, `travel`, `currentlyInto`, `listeningTo`, `watching`, `reading`, `excitedAbout`, `whatsNext`. Labels live in `packages/domain`. No user-defined sections. The DB validator checks shape and lengths, not the key list, so adding a section later needs no migration. |
| 10  | How it appears in a Box feed vs Home       | **Home: one card with one tab per delivery Box the viewer belongs to**, alphabetical (case-insensitive, then Box id). **Box feed: a card for that Box's delivery only, with no tabs.** It never reveals other Boxes.                                                                                                                         |
| 11  | Only Me on Home                            | **Not on Home.** Home is a Box feed. Only Me appears in `/life-updates` and in the author's Memories.                                                                                                                                                                                                                                        |
| 12  | Notifications                              | **No new types.** Comments and reactions on a delivery notify its author through the existing projector, because the backing post's author is the Life Update author. Only Me has no backing post, so no interactions exist.                                                                                                                 |
| 13  | Memories month bucket                      | **UTC publish time** (`life_updates.created_at`, equal to the backing posts' `created_at`). Edits never move it. No user-set date.                                                                                                                                                                                                           |
| 14  | Memories scope                             | **Personal: everything you can currently access.** Box: that Box's content only. Life Update items in a Box scope show only that Box's context ("Box results remain tied to one Box delivery").                                                                                                                                              |
| 15  | Blocked people in Memories                 | **Omitted entirely, no placeholder.** A timeline has no position to keep. Feeds keep the neutral placeholder required by ADR 013.                                                                                                                                                                                                            |
| 16  | Rate limits                                | **Create 30/h** (`life-update-create`), **update 30/h** (`life-update-edit`, lowered from 60/h in implementation), **delete 30/h**, **photo reservation 120/h** (`life-update-upload`, the purpose limit inside `MediaUploadService`, like `camera-upload`).                                                                                 |

---

## C. Data model (migration `0006_life_updates`)

Edit `packages/database/src/schema.ts`, then run `pnpm db:generate --name life_updates`. Review the SQL by hand and edit only the new file. Never edit 0000–0005. The migration is expand-only: new tables and one defaulted column on `posts`, plus widened media checks.

**Use `is not null` explicitly inside CHECKs**, because a NULL makes a CHECK pass. Run a spike first to see how drizzle-kit emits generated columns, composite FKs and a function-based CHECK. Hand-add the functions and triggers to the new file only.

### `posts` gains `kind`

- `kind text NOT NULL DEFAULT 'post'`.
- Check `posts_kind_check`: `kind in ('post','life_update')`.
- Check `posts_life_update_content_check`: `kind = 'post' or content is null`. A backing post never carries text.
- Existing `posts_content_lifecycle_check` is unchanged. A null `content` is already allowed while active.
- Unique index `posts_delivery_reference_unique (id, box_id, author_user_id, kind)`. It is the referent for the composite FK below.
- Old code keeps working against the new schema. Only new code ever writes a `life_update` kind.

### Enums

- `life_update_audience` (`only_me|boxes`).
- `life_update_status` (`active|deleted`).

### `life_updates`

- `id` uuid PK.
- `author_user_id` uuid not null → `users` ON DELETE CASCADE.
- `audience` life_update_audience not null.
- `status` life_update_status not null default `active`.
- `sections jsonb NOT NULL DEFAULT '{}'`.
- `created_at`, `updated_at`, `edited_at`, `deleted_at`.
- Unique `(id, author_user_id)` and `(id, audience)`. They are FK referents.
- Index `life_updates_author_index (author_user_id, created_at desc, id desc)`.
- Check `life_updates_sections_check`: `jsonb_typeof(sections) = 'object' and paldora.life_update_sections_valid(sections)`.
- `life_update_sections_valid(jsonb)` is an IMMUTABLE SQL function created in 0006 before the table. It checks:
  - at most 20 keys, each matching `^[A-Za-z]{1,40}$`;
  - every value is a string of 1–2,000 chars;
  - the total length is at most 10,000.
  - If the spike shows drizzle-kit cannot carry the function, fall back to a `life_update_sections (life_update_id, key, content)` table with per-row checks and keep only the total in the service.
- Check `life_updates_lifecycle_check`: `(status='active' and deleted_at is null) or (status='deleted' and sections = '{}'::jsonb and deleted_at is not null)`.
- Whether a Life Update has at least one section or photo is cross-table. The service enforces it, plus an integration test.

### `life_update_deliveries`

This is the audience, stored as rows.

| Column           | Definition                                        |
| ---------------- | ------------------------------------------------- |
| `life_update_id` | uuid not null                                     |
| `audience`       | life_update_audience not null                     |
| `author_user_id` | uuid not null                                     |
| `position`       | smallint not null                                 |
| `box_id`         | uuid null → `boxes` ON DELETE CASCADE             |
| `post_id`        | uuid null                                         |
| `post_kind`      | text GENERATED ALWAYS AS (`'life_update'`) STORED |
| `created_at`     | timestamptz                                       |

**Constraints**

- PK `(life_update_id, position)`.
- `position between 0 and 19`. Together with the PK, this makes **max 20 Boxes DB-enforced**.
- Unique `(life_update_id, box_id)`, so distinct Boxes. NULLs are distinct, and the only-me row is single through the PK plus the check below.
- Unique index on `post_id`: **at most one delivery per backing post**.
- Check `deliveries_shape_check`: `(audience='only_me' and box_id is null and post_id is null and position = 0) or (audience='boxes' and box_id is not null and post_id is not null)`.
- Composite FK `(life_update_id, audience)` → `life_updates (id, audience)` ON DELETE CASCADE. Every delivery matches its parent's audience.
- Composite FK `(life_update_id, author_user_id)` → `life_updates (id, author_user_id)` ON DELETE CASCADE. The delivery author is the Life Update author.
- Composite FK `(post_id, box_id, author_user_id, post_kind)` → `posts (id, box_id, author_user_id, kind)` ON DELETE CASCADE.
  - MATCH SIMPLE lets the NULL only-me row skip it. The shape check forces the Box row to be non-null.
  - The backing post therefore must be a `life_update` post of the same Box and author.
- Indexes: `(box_id, life_update_id) WHERE box_id is not null` (Box cascade and Box memories). `post_id` is covered by its unique index.

### Triggers (hand-written in 0006, tested with raw SQL)

1. `life_update_deliveries_insert_guard` BEFORE INSERT: raise (`23000`, message `life_update_audience_immutable`) unless a `life_updates` row with that id exists whose `created_at = transaction_timestamp()`. A delivery can only be inserted in the transaction that created its Life Update. **This is the DB-enforced audience immutability**, with no extra column or flag needed.
2. `life_update_deliveries_no_update` BEFORE UPDATE: always raise.
3. `life_updates_immutable_columns` BEFORE UPDATE: raise if `audience`, `author_user_id` or `created_at` changes.
4. `life_updates_requires_delivery`: a deferred constraint trigger, AFTER INSERT on `life_updates`, DEFERRABLE INITIALLY DEFERRED. At commit it raises unless at least one delivery exists. This enforces "1–20 Boxes, or one only-me row".
5. `posts_life_update_requires_delivery`: a deferred constraint trigger, AFTER INSERT on `posts` WHEN `new.kind = 'life_update'`. At commit it raises unless a delivery references the post. This is the reverse direction of "**exactly one backing post per delivery**".

Deliveries lost to a Box cascade are not re-checked. Section B decision 8 and the reaper handle that case.

### `life_update_media`

- `life_update_id` → `life_updates` CASCADE.
- `media_asset_id` → `media_assets` CASCADE (the same as `post_media`).
- `position smallint`, with a check `between 0 and 3`.
- PK `(life_update_id, position)`.
- Unique `media_asset_id`, so a photo belongs to one Life Update.
- It serves every Box: the asset is user-scoped and the API signs it for any authorized viewer.

### Media changes in the same migration

- Add purpose `life_update_image`. Its policy row is `scope: 'user'`, with the same values as `post_image`.
- Widen `media_assets_purpose_check`.
- Rewrite `media_assets_box_scope_check`: `purpose in ('avatar','life_update_image')` requires `box_id is null`, and the `post_image`/`reaction_image` branch is unchanged.
- Recreate `media_assets_unattached_index` with the predicate `purpose in ('post_image','reaction_image','life_update_image') and status='ready'`.
- A user-scoped asset has `box_id` NULL, so `BoxLifecycleService.remove` never sees it. See cascade review.

### Lifecycles

- **Life Update:** `active → deleted`, one way. `edited_at` is set on edit.
- **Delivery:** created with its Life Update and never mutated. It disappears only by cascade (Box delete) or with a hard purge (a later phase).
- **Backing post:** active until the Life Update is deleted (tombstoned, with interactions erased) or its Box is deleted (cascade).

### Cascade review

- Box delete → posts → deliveries cascade. Comments, reactions, events and notifications cascade as in Phase 5.
- **New code in `BoxLifecycleService.remove`:** before the Box delete, call `tombstoneLifeUpdatesLosingLastBox(tx, boxId)`:
  - Select active Life Updates that have a delivery in this Box and no delivery in another Box.
  - Lock their photo assets `FOR UPDATE` and `retireAssets` them.
  - Delete their `life_update_media` rows.
  - Set `status='deleted'`, clear `sections`, and set `deleted_at`.
  - It is a plain function in `apps/api/src/life-updates/life-update-erasure.ts`, imported the same way `erasePostInteractions` is. It has no Nest module dependency, so there is no cycle.
- User delete is Phase 9.
- Only Me deliveries have no Box and no post.

---

## D. Authorization matrix and errors

Visibility of a Life Update for a viewer:

1. status is `active`;
2. the author is not in a block relationship with the viewer (either direction);
3. at least one of these holds:
   - the viewer is the author and it is `only_me`;
   - the viewer has an active membership in at least one delivery Box.

The viewer only ever sees contexts (tabs) for Boxes they belong to. The response never lists other Boxes.

| Action                                  | Author (active member of ≥1 delivery Box, or Only Me)                        | Other member of a delivery Box    | Archived Box                      | Former member / stranger / guessed ID                     | Block with author (either direction)     |
| --------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- | --------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| Create (Box audience)                   | yes if active member of every named Box (30/h)                               | n/a                               | whole create fails `BOX_ARCHIVED` | a non-member Box fails `BOX_NOT_FOUND` (never says which) | n/a                                      |
| Create (Only Me)                        | yes                                                                          | n/a                               | n/a                               | n/a                                                       | n/a                                      |
| Read detail                             | yes                                                                          | yes, tabs for own Boxes only      | yes (read-only)                   | `LIFE_UPDATE_NOT_FOUND`                                   | `LIFE_UPDATE_NOT_FOUND`                  |
| Home / Box feed card                    | yes                                                                          | yes                               | yes                               | absent                                                    | one neutral hidden placeholder (deduped) |
| Memories                                | yes                                                                          | yes (personal and Box scope)      | yes                               | absent                                                    | omitted                                  |
| Edit                                    | yes (30/h); `BOX_ARCHIVED` if all delivery Boxes are archived                | `LIFE_UPDATE_ACCESS_DENIED` (403) | per decision 2                    | `LIFE_UPDATE_NOT_FOUND`                                   | `LIFE_UPDATE_NOT_FOUND`                  |
| Delete                                  | yes, idempotent 204 (30/h)                                                   | `LIFE_UPDATE_ACCESS_DENIED`       | allowed                           | `LIFE_UPDATE_NOT_FOUND`                                   | `LIFE_UPDATE_NOT_FOUND`                  |
| Change audience                         | `VALIDATION_FAILED` (strict body rejects `audience`); DB trigger as backstop | same                              | same                              | same                                                      | same                                     |
| Comment / react on a delivery           | n/a (Phase 5 routes by `postId`, unchanged)                                  | yes                               | `BOX_ARCHIVED`                    | `POST_NOT_FOUND`                                          | `POST_NOT_FOUND`                         |
| `PATCH`/`DELETE /posts/{backingPostId}` | `POST_MANAGED_BY_LIFE_UPDATE` (409)                                          | `POST_ACCESS_DENIED`              | same                              | `POST_NOT_FOUND`                                          | `POST_NOT_FOUND`                         |
| Reserve a photo (`life_update_image`)   | any signed-in user, 120/h                                                    |                                   |                                   |                                                           |                                          |
| Only Me                                 | no interaction routes exist (no backing post)                                |                                   |                                   |                                                           |                                          |

**New error codes** (append a Phase 6 section to `packages/domain/src/errors.ts`):

- `LIFE_UPDATE_NOT_FOUND` (404): missing, deleted, not visible, or blocked. All look identical.
- `LIFE_UPDATE_ACCESS_DENIED` (403): only for someone who can already see it.
- `POST_MANAGED_BY_LIFE_UPDATE` (409): editing or deleting a backing post directly.
- Reuse `BOX_NOT_FOUND`, `BOX_ARCHIVED`, `MEDIA_NOT_FOUND`, `MEDIA_NOT_READY`, `VALIDATION_FAILED`, `RATE_LIMITED` and `RATE_LIMIT_UNAVAILABLE`.
- Add `ERROR_STATUS` and copy mappings wherever `errors.ts` consumers need them. Check `errors.test.ts` and the web `copy` maps.

---

## E. Contract

Add `packages/validation/src/life-updates.ts` and `memories.ts`. Append to `routes.ts` (registry and `apiRoutes`), add client methods, then run `pnpm contract:generate`. Every new route needs its controller in the same slice, because `route-inventory.test.ts` requires an exact match and a rate-limit decision on every non-GET route.

### Domain (`packages/domain/src/life-updates.ts`)

- `LIFE_UPDATE_SECTION_KEYS` and `LIFE_UPDATE_SECTION_LABELS` (the order is canonical).
- `LIFE_UPDATE_SECTION_MAX_LENGTH = 2000`, `LIFE_UPDATE_TOTAL_MAX_LENGTH = 10000`, `LIFE_UPDATE_MAX_BOXES = 20`, `LIFE_UPDATE_MEDIA_MAX_ITEMS = 4`.
- `MEDIA_PURPOSES` gains `life_update_image`. The `Record<MediaPurpose, …>` types force the worker `attachments` map to be updated.

### Schemas

- `lifeUpdateSectionsSchema`: strict object of the nine keys. It trims, drops empty values, and has a refine for the 10,000 total.
- `createLifeUpdateSchema` (strict): `audience` (`{type:'only_me'}` | `{type:'boxes', boxIds: uuid[1..20] distinct}`), `sections`, `mediaAssetIds` (≤4, distinct). A refine requires at least one section or photo.
- `updateLifeUpdateSchema` (strict): `sections`, `mediaAssetIds`, with the same refine. No `audience` key.
- `lifeUpdateSchema` (shared by feeds, detail, "mine" and Memories):
  - `id`
  - `author: UserSummary`
  - `audience: 'only_me'|'boxes'`
  - `sections: {key, label, content}[]` in canonical order
  - `media: PostMedia[]`
  - `createdAt`
  - `editedAt|null`
  - `canEdit`
  - `contexts: {postId, box:{id,name}, interactions: PostInteractionSummary}[]`
  - `contexts` is alphabetical, empty for Only Me, and holds only Boxes the viewer belongs to.
- `feedItemSchema` gains `z.object({kind:'life_update', lifeUpdate})`. `hiddenPostSchema` is reused for a hidden Life Update, with the id of the representative backing post.
- `postSchema` gains `kind: 'post'|'life_update'` and `lifeUpdateId: uuid|null`. This is additive. `GET /posts/{id}` for a backing post returns `content:''` and `media:[]`, and the web redirects to the Life Update page.
- `notificationSchema` gains an optional `lifeUpdateId` (additive) so the bell can link to the Life Update page.
- `memoryItemSchema`: `{kind:'post', occurredAt, post} | {kind:'life_update', occurredAt, lifeUpdate}`. `memoryPageSchema` is a cursor page of those.
- `memoryQuerySchema`: `year` int 1970–9999, `month` 1–12 (optional), `type` (`all|posts|life_updates`), plus `cursor` and `limit` (≤50).
- `memorySummarySchema`: `{years:[{year,count}], months:[{month,count}]}`. `months` is for the requested year, and the query's `year` is optional (default is the newest year with content). Both lists are bounded by the calendar, so they are exempt from cursors. Document that.

### Operations

| operationId           | Route                                                   | Rate limit                | Errors beyond globals                                                                              |
| --------------------- | ------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `createLifeUpdate`    | `POST /life-updates` → 201 `LifeUpdate`                 | 30/h `life-update-create` | `BOX_NOT_FOUND, BOX_ARCHIVED, MEDIA_NOT_FOUND, MEDIA_NOT_READY`                                    |
| `getLifeUpdate`       | `GET /life-updates/{lifeUpdateId}`                      | none                      | `LIFE_UPDATE_NOT_FOUND`                                                                            |
| `updateLifeUpdate`    | `PATCH /life-updates/{lifeUpdateId}`                    | 30/h `life-update-edit`   | `LIFE_UPDATE_NOT_FOUND, LIFE_UPDATE_ACCESS_DENIED, BOX_ARCHIVED, MEDIA_NOT_FOUND, MEDIA_NOT_READY` |
| `deleteLifeUpdate`    | `DELETE /life-updates/{lifeUpdateId}` → 204, idempotent | 30/h `life-update-delete` | `LIFE_UPDATE_NOT_FOUND, LIFE_UPDATE_ACCESS_DENIED`                                                 |
| `listMyLifeUpdates`   | `GET /me/life-updates` (newest first, cursor)           | none                      | none                                                                                               |
| `listMyMemories`      | `GET /me/memories?year&month&type&cursor&limit`         | none                      | none                                                                                               |
| `getMyMemorySummary`  | `GET /me/memories/summary?year`                         | none                      | none                                                                                               |
| `listBoxMemories`     | `GET /boxes/{boxId}/memories?…`                         | none                      | `BOX_NOT_FOUND`                                                                                    |
| `getBoxMemorySummary` | `GET /boxes/{boxId}/memories/summary?year`              | none                      | `BOX_NOT_FOUND`                                                                                    |

The photo reservation reuses `POST /media/uploads`. `PURPOSE_UPLOAD_LIMITS` in `media-upload.service.ts` gains `life_update_image: {scope:'life-update-upload', limit:120, windowSeconds:3600}`.

### Realtime

**No new event types.** Publish the existing `post.created`, `post.updated` and `post.deleted` to each delivery Box's channel (`boxChannel(boxId)`), with `boxId` and the backing `postId`. They carry IDs only, after commit, best effort. The web bridge already refreshes the feeds. Only Me publishes nothing (the author's own tab refreshes through navigation).

### api-client (`packages/api-client/src/index.ts`)

Add `createLifeUpdate`, `lifeUpdate`, `updateLifeUpdate`, `deleteLifeUpdate`, `myLifeUpdates`, `myMemories`, `myMemorySummary`, `boxMemories` and `boxMemorySummary`. Update the `conformance.test.ts` and `openapi.test.ts` fixtures.

---

## F. API module layout

Keep every file small (services at most about 150 lines, complexity ≤ 15). Inject with explicit `@Inject(Token)`.

### Module dependency direction (no cycle)

`PostsModule` imports `LifeUpdatesModule`. `LifeUpdatesModule` imports Identity, Boxes, Media, Realtime and Interactions, and **never** `PostsModule`. `MemoriesModule` imports both `PostsModule` and `LifeUpdatesModule`. Add `LifeUpdatesModule` and `MemoriesModule` to `app.module.ts`.

### Shared SQL (`packages/database/src/life-updates.ts`)

`representativeDelivery(viewerId, postId)` is a `WHERE` fragment. It is true for a non-life-update post, or for the viewer's accessible delivery of a Life Update with the greatest `post_id`:

```sql
posts.kind = 'post'
OR NOT EXISTS (
  SELECT 1 FROM life_update_deliveries d1
  JOIN life_update_deliveries d2 ON d2.life_update_id = d1.life_update_id AND d2.post_id > d1.post_id
  JOIN posts p2 ON p2.id = d2.post_id AND p2.status = 'active'
  JOIN box_memberships m2 ON m2.box_id = d2.box_id AND m2.user_id = :viewer AND m2.status = 'active'
  WHERE d1.post_id = posts.id)
```

All deliveries of one Life Update share `created_at`, because `posts.created_at` and `life_updates.created_at` are both `now()` in the creating transaction (a test asserts equality). Dropping the non-representative rows therefore keeps the keyset `(created_at desc, id desc)` stable and duplicate-free. Hidden (blocked) deliveries dedupe the same way, so one placeholder appears.

### `apps/api/src/life-updates/`

- `life-update-errors.ts`: `lifeUpdateNotFound`, `lifeUpdateAccessDenied`.
- `life-update-policy.service.ts`:
  - `forRead(executor, viewerId, id)` loads the Life Update, its author-block flag and the viewer's accessible contexts in one or two queries.
  - `forAuthorWrite(tx, viewerId, id)` takes the Life Update row `FOR UPDATE`, requires the author, and requires at least one active-Box context or only_me.
  - Not visible → `LIFE_UPDATE_NOT_FOUND`. A visible non-author → `LIFE_UPDATE_ACCESS_DENIED`.
- `life-update-publish.service.ts` (create, about 120 lines), in one transaction:
  1. Validate that the Boxes are distinct and 1–20.
  2. Check the author's active membership in every Box (`policy.membership`, a missing one → `BOX_NOT_FOUND`).
  3. Lock the Box rows `FOR SHARE` in ascending id order (deadlock-free), and an archived one → `BOX_ARCHIVED`.
  4. Claim the photos with `claimLifeUpdatePhotos` (below).
  5. Insert `life_updates` (`sections` as trimmed non-empty strings).
  6. For each Box in input order, insert a `posts` row (`kind='life_update'`, `content` null) and a delivery `(position, box_id, post_id)`. For Only Me, insert one delivery with null box and post.
  7. Insert `life_update_media`.
  - After commit, publish `post.created` per Box, then return `LifeUpdateViewService.byId`.
  - Unique violation `life_update_media_asset_unique` → `MEDIA_NOT_FOUND` (`isUniqueViolation`).
  - Alphabetical tab order is computed at read time by Box name, since names are mutable. `position` is only the input order.
- `life-update-photos.ts`: `claimLifeUpdatePhotos(tx, authorId, ids, currentIds)`.
  - Extract the shared check from `PostService.assertPhotosUsable` into `apps/api/src/media/photo-claim.ts` as `assertPhotosUsable(executor, {ownerId, purpose, boxId|null, ids, isUsed})`.
  - Both `PostService` and Life Updates call it, to avoid a second duplicated upload path (CLAUDE.md Q).
  - Every unusable photo is `MEDIA_NOT_FOUND`. A not-yet-ready one is `MEDIA_NOT_READY`.
- `life-update-edit.service.ts`:
  - `forAuthorWrite` locks the row.
  - Archived rule from decision 2.
  - Photo diff: removed assets are deleted from `life_update_media` and retired. New assets are claimed. All positions are rewritten (delete rows first, then insert, because of the PK).
  - Update `sections`, `edited_at` and `updated_at` (the immutable-columns trigger allows these).
  - After commit, publish `post.updated` per context Box the update has (query all deliveries, not just the viewer's).
- `life-update-delete.service.ts`, in one transaction:
  - Lock the Life Update `FOR UPDATE`.
  - If it is already deleted and the viewer is the author, return (idempotent).
  - Select the backing post ids `FOR UPDATE`.
  - Soft-delete the posts (`status='deleted'`, `deleted_at`).
  - Call `erasePostInteractions(tx, postIds)`. **Refactor it to take `readonly string[]`**; `PostService.remove` passes `[postId]`.
  - Lock and retire the Life Update's photos, delete `life_update_media`, then tombstone the Life Update.
  - After commit, publish `post.deleted` per Box.
- `life-update-view.service.ts` (read side, batched). `byIds(viewerId, ids, {scopeBoxId?})` returns `Map<id, LifeUpdateView>` plus a `hidden` set. It runs a **fixed number of queries**, whatever the page size:
  1. Life Updates with the author-block flag (`hiddenByBlock(viewerId, author_user_id)`) and status.
  2. Contexts: deliveries ⨝ active posts ⨝ boxes ⨝ the viewer's active membership, optionally filtered to `scopeBoxId`.
  3. Media: `life_update_media` ⨝ ready `media_assets`, signed by `MediaUrlService.sign` (authorization was decided in query 1–2).
  4. Authors via `ProfileSummaryService.summaries`.
  5. `InteractionSummaryService.forPosts` over all context post ids of the visible Life Updates.
  - Hidden or fully inaccessible Life Updates are never passed to queries 3–5, so no photo is signed and no summary is computed for blocked content.
  - Signing every tab's summary can reach 20 contexts per card. This is bounded and batched. If a p95 check complains, load summaries for the first tab only and let other tabs fetch lazily.
- `life-update-views.ts`: pure mappers (sections in canonical order with labels, contexts sorted `localeCompare` on name, then id).
- `life-update-query.service.ts`: `get(viewerId, id)` (policy plus view) and `listMine(viewerId, page)`.
  - `listMine` is keyset on `(created_at, id)` over `life_updates where author = viewer and status='active'`.
  - It includes Only Me items and Box items whose accessible context count is at least 1.
  - Items with zero accessible contexts are dropped after the page is built, so a page may be short. This is rare (it only happens after losing every Box), and the cursor still advances.
- `life-updates.controller.ts` (`ZodPipe`, `uuidParam`, `@RateLimit`, `@CurrentPrincipal`) and `life-updates.module.ts`. It exports the view and policy services.

### Feeds in `apps/api/src/posts/`

- `post-query.service.ts` `feed()`:
  - Left join `life_update_deliveries` for `lifeUpdateId`.
  - Add the `representativeDelivery(viewerId, posts.id)` condition for the Home scope only (the Box scope has one delivery per Box).
  - After the page is fetched, split rows. Ordinary posts take the existing path. Life Update rows go to `LifeUpdateViewService.byIds(viewerId, ids, {scopeBoxId})`.
  - For the Home scope, pass no `scopeBoxId`. For the Box scope, pass the Box id so the card shows only that Box's context.
  - Hidden Life Updates become `{kind:'hidden'}` with the representative post id. The result order follows the SQL rows.
  - Split the 188-line file if it grows: move row-to-item assembly into `post-feed-items.ts`.
- `post-views.ts`: `toPostView` adds `kind` and `lifeUpdateId`.
- `post.service.ts` `update` and `remove`: if `post.kind === 'life_update'`, throw `POST_MANAGED_BY_LIFE_UPDATE` (after the existing visibility checks, so strangers still get `POST_NOT_FOUND`).
- `post-query.service.ts` `mediaFor`: no change (backing posts have no `post_media`).

### `apps/api/src/memories/`

- `memory-candidates.ts`: one query builder that returns `(item_kind, item_id, at)` rows, in `UNION ALL` form:
  1. Ordinary posts: `posts` where `kind='post'`, active, the viewer has an active membership (or the Box scope), and `NOT hiddenByBlock(viewer, author)`.
  2. Box Life Updates: `life_updates` joined to deliveries, grouped by Life Update id. Require an active `life_updates` row, a non-blocked author and `EXISTS` an accessible delivery (the viewer's active membership; the Box scope restricts to that Box). `at = life_updates.created_at`.
  3. Only Me: `life_updates` where `audience='only_me'`, author = viewer, active. Personal scope only.
  - The `type` filter drops branches.
  - The month window is `at >= make_timestamptz(:y, :m, 1, 0,0,0, 'UTC') and at < … + interval '1 month'` (or the whole year). UTC is explicit.
- `memory-query.service.ts`:
  - Keyset `(at desc, item_id desc)` with `afterCursor`, `cursorTimestamp`, `decodeCursor`, `pageOf`.
  - Fetch `limit + 1` candidates, then batch-load: ordinary posts via a new `PostQueryService.itemsForPosts(viewerId, ids)` (extract from the feed assembler), and Life Updates via `LifeUpdateViewService.byIds`.
  - Anything that is no longer visible between the two queries is dropped.
  - No placeholders (decision 15).
- `memory-summary.service.ts`: `date_trunc('month', at at time zone 'utc')` counts over the same candidate builder, grouped by year and month. Returns `years` plus the requested year's `months`.
- `memories.controller.ts` and `memories.module.ts`.
  - The Box routes call `BoxPolicyService.membership` first (`BOX_NOT_FOUND`), exactly like `boxFeed`.
  - Memories are not stored anywhere. There is no archive table.

### Block hiding summary

| Surface                   | Behaviour                                                      |
| ------------------------- | -------------------------------------------------------------- |
| Feeds                     | Hidden placeholder, deduped. No author, text, photos or Boxes. |
| Detail                    | `LIFE_UPDATE_NOT_FOUND`.                                       |
| Memories                  | Omitted.                                                       |
| Comment thread and counts | Unchanged from Phase 5 (viewer-relative, `hiddenByBlock`).     |
| "Mine"                    | Always the author's own.                                       |

Every query uses the one `hiddenByBlock` definition from `@paldora/database`. Do not write a second copy.

---

## G. Worker changes

- `apps/worker/src/media/attachments.ts`: add `life_update_image: async () => undefined`, because the API claims photos in the publish/edit transaction. Update `derivatives.test.ts` and `job-router.test.ts` if they enumerate purposes.
- `apps/worker/src/maintenance/unattached-media.ts`:
  - Add a `life_update_media` branch to `unattachedMedia` and the purpose to the `inArray` list. It must match the recreated partial index exactly.
  - The reaper expiry for an unclaimed `life_update_image` is the same 24 hours.
- New reaper sweep `deliverylessLifeUpdates` in `apps/worker/src/maintenance/`:
  - Active Life Updates with `audience='boxes'` and no delivery, older than one hour (Box-cascade leftovers).
  - It tombstones them and retires their photos in one transaction with `FOR UPDATE SKIP LOCKED`.
  - It reports a count in `ReapResult`.
  - It also logs at error level if any `kind='life_update'` post has no delivery. That should be impossible given the deferred trigger, so it is a canary.
- **Notifications projector: no change.** Backing posts are normal posts for it. Add a projector integration test that a comment on a backing post notifies the Life Update author.
- Cleanup on delete is done by the API in the same transaction (decision 3). The worker only drains the existing media deletion outbox. Run the worker integration files serially, as in Phase 5.

---

## H. Web

All new server actions are `async function` declarations. Typed route hrefs with query strings or fragments need string casts.

### Shared refactors

- `use-photo-attachments.ts`: take a `prepare(file)` function instead of `boxId`. The post composer passes `preparePostPhoto` with its box; the Life Update composer passes a new `prepareLifeUpdatePhoto` (no `boxId`, purpose `life_update_image`) in `apps/web/app/actions/life-update-photos.ts`. `completePostPhoto` and `postPhotoStatus` are reused.
- Support initial retained photos (existing ones in the editor), as `{mediaAssetId, previewUrl}` items in phase `ready`.
- `apps/web/app/actions/life-updates.ts`: `createLifeUpdateAction`, `updateLifeUpdateAction`, `deleteLifeUpdateAction`. They parse FormData with the same JSON hidden-field pattern as `createPostAction`. Copy maps cover `BOX_ARCHIVED`, `BOX_NOT_FOUND`, `MEDIA_NOT_FOUND` and `RATE_LIMITED`.

### Components (`apps/web/app/components/`)

- `life-update-composer.tsx`:
  - Nine section textareas, each with a counter, plus a total counter (`n / 10,000`). Labels come from domain.
  - The audience fieldset has a radio "Only me" / "Boxes". Boxes is a checkbox group with a filter input and a live "n of 20 selected" count. Selecting Only Me disables the checkboxes.
  - The copy says: "Where this goes can't be changed after you share it. Each Box gets its own conversation."
  - Active Boxes only, loaded by the page in at most four pages of 50, with a "showing first 200" note.
  - Photos reuse the attachments flow and the `AttachmentList` look (extract it from `post-composer.tsx` into `photo-attachment-list.tsx`). Cmd/Ctrl+Enter submits. Text and photos stay on failure. Submit is disabled while photos are busy.
  - 390px: one column, 48px Box rows, native 20px checkboxes, 44px targets, no horizontal scroll.
- `life-update-card.tsx` (server-friendly shell) plus `life-update-contexts.tsx` (client):
  - Shared region: author, time, edited marker, sections as `<h3>` headings with paragraphs, and `PostPhotos`.
  - Below it, Box tabs with `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, and roving tabindex with arrow-key handling.
  - Each panel renders the existing `PostInteractions` keyed by `postId`, so tab switches remount interaction state. The comments link goes to `/life-updates/{id}?box={boxId}`.
  - Only Me renders no interaction controls and a quiet "Only you can see this" badge.
  - A Box feed card shows a single context and no tab bar.
  - Tabs wrap on narrow screens. No style attributes (CSP).
- `life-update-actions.tsx`: Edit link and Delete (reuse `confirm-action`, copy "This removes it from every Box and deletes all comments and reactions.").
- `post-feed.tsx`: the `PostFeed` renderer in `post-card.tsx` gains the `life_update` branch. The hidden branch is unchanged. The list key uses the Life Update id.
- `memory-timeline.tsx`:
  - Chronological `PostCard` and `LifeUpdateCard` items with a date rail on desktop and the date above each card at 390px.
  - Year grid and month grid components, using counts from the summary.
  - An honest empty state.

### Pages (`apps/web/app/(signed-in)/`)

- `life-updates/page.tsx`: "mine" list with MoreLink paging and a "New Life Update" button.
- `life-updates/new/page.tsx`: composer, with `?box=<id>` preselecting a Box.
- `life-updates/[lifeUpdateId]/page.tsx`: detail, the selected `?box=` context (default the first tab), and `CommentThread` for that `postId`. It supports the `?comment=` deep link by reusing the pinned-thread logic from the post page (extract `pinnedThread` into `lib/pinned-thread.ts`).
- `life-updates/[lifeUpdateId]/edit/page.tsx`: the audience shown as locked text (the Boxes the viewer can see), sections, and retained plus new photos.
- `posts/[postId]/page.tsx`: if `post.kind === 'life_update'`, `redirect` to the detail page with `box` and the forwarded `comment`/`comments` params.
- `memories/page.tsx` (years), `memories/[year]/page.tsx` (twelve months), `memories/[year]/[month]/page.tsx` (timeline). Invalid year or month → `notFound()`.
- `boxes/[boxId]/memories/page.tsx`: the Box scope, driven by `?year=&month=`. The Box page gains "Share a Life Update" and "Memories" links.
- `app-nav.tsx`: add Life Updates and Memories. Six links must still fit at 390px (wrap or condense; verify in e2e).
- Notification rows link a Life Update backing post to `/life-updates/{lifeUpdateId}?box={boxId}&comment=…`.

All loading, empty and error states use the shared `EmptyState` and toast conventions. Photos use author-aware alt text.

---

## I. Tests

**Unit**

- `packages/domain`: section keys, constants, and the purpose policy for `life_update_image`.
- `packages/validation`: section trimming and empty-drop, per-section and total limits (exactly 2,000 and 10,000 accepted, +1 rejected), 21 Boxes, duplicate Boxes, no section and no photo, strict rejection of `audience` on update, the memory query bounds, and `conformance.test.ts` / `openapi.test.ts` fixtures.
- API pure helpers: tab sorting (case-insensitive, then id), the memory month window (Dec/Jan boundary, leap day), and cursor round trip.

**Database integration** (`packages/database/src/schema.integration.test.ts`, via `scripts/with-test-database.mjs`)

- Each constraint rejects its violation with raw SQL:
  - position 20 is rejected, a duplicate Box is rejected, and the shape check rejects a null-Box 'boxes' delivery;
  - a delivery/post author or Box mismatch is rejected, and a second delivery per post is rejected;
  - a `life_update` post with content is rejected;
  - sections validator: unknown shape, a 2,001-char value and a total over 10,000 are rejected;
  - the lifecycle check, and the media scope and purpose checks.
- Triggers: inserting a delivery in a later transaction fails. Updating a delivery fails. Changing `audience`, `author` or `created_at` fails. Committing a Life Update with no delivery fails (deferred). Committing a `life_update` post with no delivery fails (deferred).
- Box delete cascades the delivery and post.
- Tests are hermetic against leftover rows.

**API integration** (`apps/api/src/life-updates/*.integration.test.ts`, `memories/*.integration.test.ts`)

- Full authorization matrix from section D, including guessed IDs and each non-leaking code.
- Create across 1, 2 and 20 Boxes; the 21st is rejected. One non-member Box fails the whole create with no partial rows. An archived Box fails. Only Me creates no post.
- One backing post per Box with the same `created_at`.
- Photos: claimed once, a foreign or used photo → `MEDIA_NOT_FOUND`, not ready → `MEDIA_NOT_READY`, and the same asset serves every Box.
- Edit: propagation to all deliveries, photo add/remove/reorder with removed assets retired, the archived rule, and concurrent edit versus delete (the row lock decides).
- Delete: erases comments, reactions, camera images and notifications on every delivery, retires photos once, and is idempotent.
- Comments on one delivery stay invisible on another (isolation).
- Backing-post `PATCH`/`DELETE` → `POST_MANAGED_BY_LIFE_UPDATE`.
- Home dedupe: N Boxes → one item, alphabetical contexts, keyset paging without duplicates across page boundaries, and a viewer who belongs to a subset sees only that subset's tabs.
- A removed member sees no delivery in feeds, detail or Memories.
- Memories: UTC boundary rows (23:59:59.999999 and 00:00:00), year/month filter, `type` filter, Box scope tied to one context, cursor stability, summary counts match the items, re-authorization after removal or archive, and Only Me only for the author.
- **ADR 013 matrix** (`apps/api/src/social/block.integration.test.ts`): add Life Update rows for both directions, with unblock and re-block.

| Surface     | Expected behaviour      |
| ----------- | ----------------------- |
| Home feed   | One hidden placeholder  |
| Box feed    | Hidden placeholder      |
| Detail      | `LIFE_UPDATE_NOT_FOUND` |
| Memories    | Omitted                 |
| Counts      | Viewer-relative         |
| Own Only Me | Unaffected              |
| Unblock     | Content returns         |

- No N+1: assert a fixed query count for a Home page with 20 multi-Box cards, as the Phase 5 summary test does.
- Rate limits: the 31st create is `RATE_LIMITED`, and the purpose upload limit is enforced fail-closed.
- `route-inventory.test.ts` stays green.

**Worker** (serial files)

- `life_update_image` processing yields ready derivatives.
- The reaper expires an unclaimed `life_update_image`, but not one in `life_update_media`.
- The deliveryless sweep tombstones and retires photos.
- The projector notifies the author for a comment or reaction on a backing post, and projects nothing for Only Me.
- Box delete tombstones a Life Update that loses its last Box and keeps one with other Boxes (API integration, `boxes.integration.test.ts`).

**Realtime**

- Create, edit and delete publish `post.*` to each delivery Box channel after commit. A non-member's stream gets nothing. Only Me publishes nothing.

**Full-stack Playwright** (`apps/web/e2e/full-stack/life-updates.spec.ts`, `memories.spec.ts`), desktop and 390px, each page checked with axe

- Compose to three Boxes with photos, then see one Home card with alphabetical tabs.
- Switching tabs shows isolated threads.
- Comment in one tab. A second member sees it only in their own Box's tab.
- Edit text and photos and see the change in every tab. The audience is shown as locked.
- Delete from the detail page and see the card disappear everywhere.
- Only Me shows no interaction controls and is absent from Home.
- A blocked author shows a placeholder.
- Memories year → month → timeline, paging, and an empty state.
- No horizontal scroll at 390px. The tabs, the Box checkbox group and the nav are keyboard-operable.

---

## J. Ordered work breakdown (strictly sequential; each slice ends green and committable)

Run `pnpm typecheck`, `pnpm lint` and the unit tests in every slice. Run the integration tests through `scripts/with-test-database.mjs`.

1. **Data model and media purpose.**
   - Files: `packages/database/src/{schema.ts,life-updates.ts,index.ts,schema.integration.test.ts}`, migration `0006_life_updates` (generated, then hand-edited with the function and triggers), `packages/domain/src/{life-updates.ts,media.ts,index.ts}`, `apps/worker/src/media/attachments.ts`, `apps/worker/src/maintenance/{unattached-media.ts,reaper.ts}` (media branch only), worker tests for the purpose.
   - Includes the DB constraint and trigger tests and the media check changes. No API behaviour yet.
2. **Publish, read and delete core.**
   - Files: `apps/api/src/media/photo-claim.ts` (extracted from `PostService`), `apps/api/src/posts/post.service.ts` (use it), `interactions/interaction-erasure.ts` (array form), `apps/api/src/life-updates/*` (errors, policy, publish, delete, view, query, controller, module), `packages/domain/src/errors.ts`, `packages/validation/src/{life-updates.ts,routes.ts,posts.ts}`, `packages/api-client/src/index.ts`, `media-upload.service.ts` (purpose limit), `app.module.ts`, contract generation, `route-inventory`.
   - Create, get, list mine, delete, with the authorization matrix tests.
     Progress: slices 1–2 committed (`a577d25`); slices 3–4 implemented (edit, feeds with Home dedupe, backing-post guards, Box-deletion tombstone, deliveryless sweep, block matrix, query-count and paging tests). Notes from slices 3–4: `PATCH` is partial (`sections` and `mediaAssetIds` each optional, replacing that part when present); `feedItemSchema` moved to `packages/validation/src/feeds.ts` to avoid a posts ↔ life-updates import cycle; ordinary-post page data moved to `PostPageService` (reusable by Memories as `itemsForPosts`).

3. **Edit.**
   - Files: `life-update-edit.service.ts`, controller route, validation and client, edit tests including the races and the archived rule.
4. **Feeds, backing-post guards, block matrix, Box delete.**
   - Files: `posts/{post-query.service.ts,post-feed-items.ts,post-views.ts,post.service.ts}`, `feedItemSchema`, `postSchema` (`kind`, `lifeUpdateId`), `notificationSchema` (`lifeUpdateId`), `boxes/box-lifecycle.service.ts` and `life-updates/life-update-erasure.ts`, the deliveryless reaper sweep, the `block.integration.test.ts` rows, the query-count test, and the projector test.
   - After this slice the API is functionally complete for Life Updates.
5. **Memories API.**
   - Files: `apps/api/src/memories/*`, `PostQueryService.itemsForPosts`, `validation/memories.ts`, routes, client, and the memories integration tests.
6. **Web: Life Updates.**
   - Files: `use-photo-attachments.ts` refactor, `photo-attachment-list.tsx`, `life-update-{composer,card,contexts,actions}.tsx`, `post-card.tsx` feed branch, actions, `lib/pinned-thread.ts`, `life-updates/**` pages, the `posts/[postId]` redirect, `app-nav.tsx`, the Box page links, notification links, and `life-updates.spec.ts` with axe at 390px.
7. **Web: Memories and close-out.**
   - Files: `memory-timeline.tsx`, `memories/**` and `boxes/[boxId]/memories` pages, nav, `memories.spec.ts`.
   - Docs: new ADR 016 (store once, deliver per Box, DB-enforced immutability, derived Memories), plus updates to `docs/{database,api,security,architecture}.md`, the ADR 013 addendum (Life Update rows), and the REBUILD_PLAN Phase 6 delivery notes and status row.

---

## K. Risks and pitfalls (from Phases 1–5)

- **Next 16 Server Actions** must be `async function` declarations. A const arrow does not work.
- **Typed routes**: hrefs with query strings or fragments need string casts (`` `/life-updates/${id}?box=${boxId}` as Route ``).
- **Prettier** reformats code, so naive string replacement fails. Use real edits.
- **Integration tests** only through `scripts/with-test-database.mjs` (`paldora_test`). They must be hermetic against leftover rows, so use unique usernames and Box names per test.
- **Drizzle migrations**: generate, then review. Make hand edits only in the new file. In CHECKs, a NULL passes, so add `is not null` wherever the intent is "must be present". The spike on the generated columns, composite FKs and function CHECK comes first.
- **Deferred constraint triggers** fire at commit, so tests must commit to see them. The Life Update's own `created_at` must equal `transaction_timestamp()` (do not set `created_at` explicitly from JS).
- **No `style` attributes** (CSP), and **no `react-hooks` eslint-disable** (the rule is not installed). Fix the dependency arrays instead.
- **Advisory pair/target locks:** creation records no pair decision, so no `lockPair` is needed. Lock Box rows in ascending id order to avoid deadlocks. Serialize edit and delete on the `life_updates` row `FOR UPDATE`.
- **Publish realtime only after commit**, best effort, IDs only.
- **Erase interactions, notifications and media in the same transaction** as the delete. Soft-deleted posts never fire FK cascades.
- **Worker integration files run serially.** Two reapers in one database can lock each other's rows.
- **`exactOptionalPropertyTypes`:** conditionally spread optional fields (`...(x ? {x} : {})`), as the existing code does.
- **Zod strips unknown keys** in the realtime bus. Phase 6 adds none, so this only matters if someone adds a Life Update ID to an event later.
- **Dedupe correctness depends on equal `created_at`** across a Life Update's backing posts. A test pins this. Do not reorder inserts across transactions.
- **Hidden-item identity:** a hidden Life Update uses the representative backing post id. Never include the Box list or the author.
- **Cross-Box leakage via tabs:** the context query must always join the viewer's active membership. A unit test with a viewer in a subset of Boxes guards this.
- **Duplicate submit on create** (a text-only retry creates a second update). Mitigate with the disabled submit and the rate limit. Photos are protected by the unique asset.
- **PostService stays under about 250 lines.** Do not put Life Update logic there, only the `kind` guards.
- **Nav crowding at 390px** with six links. Verify in the e2e before finalising.

---
