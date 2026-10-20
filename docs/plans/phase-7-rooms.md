# Phase 7 plan: Rooms

Status: in implementation (2026-10-20). Section B recommended defaults were adopted by the lead under the owner's standing "continue" delegation; the owner has not reviewed them individually and can overrule any of B1-B16 and K1-K8. Drafted from the repo at commit `715c39d`. Scope comes from [REBUILD_PLAN.md](../../REBUILD_PLAN.md) Phase 7, CLAUDE.md §A/§C/§D/§G/§I/§R3/§R7/§R8, [ADR 005](../adr/005-design-tokens-and-styling.md), [ADR 011](../adr/011-media-pipeline.md), [ADR 013](../adr/013-directional-blocks.md) and [ADR 016](../adr/016-life-updates-and-memories.md). It follows the format of [phase-6-life-updates-memories.md](phase-6-life-updates-memories.md). Legacy behaviour (`legacy/docs/themes.md`, `legacy/apps/api/src/room*.ts`, `legacy/packages/domain` theme registry, `legacy/apps/web` `RoomCanvas` and the room editors, the legacy `rooms`/`room_widgets`/`room_top_friends` tables) was read for behaviour only. Nothing is imported from it.

Facts about the current code that drive the design:

- `user_blocks` is directional. `hiddenByBlock` and `isBlockedBetween` are the only block definitions (`packages/database/src/blocks.ts`). `lockPair` serializes pair decisions.
- `FriendshipService.remove` (unfriend) takes no `lockPair` and deletes the `friendships` row directly. `BlockService.create` takes `lockPair`, inserts the block, deletes the friendship, then revokes Box invitations. Neither knows about Rooms, so removal of Top Friends must live in the database (triggers), not in two services.
- `media_assets` is `box`-scoped or `user`-scoped. `MEDIA_PURPOSE_POLICIES` rows are `scope: 'user'|'box'`. The worker `attachments` map is a `Record<MediaPurpose, …>`, so a new purpose forces an entry. `unattachedMedia` has one branch per claimed purpose and must match `media_assets_unattached_index` exactly. `DerivativeSpec.fit` is only `'inside' | 'square'`.
- `user_preferences.appearance` (light/dark/system), `PUT /me/preferences`, `AppearanceForm` and the `pal-appearance` cookie already exist (Phase 1). The app shell consumes `theme.light.*`/`theme.dark.*` tokens via `data-appearance`.
- Usernames are editable after onboarding (`PATCH /me/profile`). Lookup is by `profiles.username_normalized` (unique, partial). `UserDirectoryService.findByUsername` filters `users.status='active'`.
- `memoryCandidates({viewerId, boxId?, type, window?})` already builds the viewer-membership-driven, block-filtered `(item_kind, item_id, at)` rows for posts and Life Updates, and `window` is optional (the summary uses it that way). `MemoryQueryService` and `PostPageService.itemsForPosts` and `LifeUpdateViewService.byIds` re-authorize on read.
- Production CSP (`apps/web/app/lib/csp.ts`) allows no inline styles (`style-src 'self' 'nonce-…'`) and `font-src 'self'`. So a Room theme cannot use `style=` attributes or `background-image:url(…)` set inline. Themes must be static CSS selected by `data-*` attributes, and the banner must be an `<img>`.
- The signed-in shell has a wrapping top nav and no bottom nav yet (`app-nav.tsx`). There is no `/rooms` code in `apps/web` or `apps/api`. `docs/plans/phase-6…` and `REBUILD_PLAN.md` line 181 reserve "My Room" for this phase.
- Next 16 pitfall recorded in Phase 6: a `loading.tsx` turns `notFound()` into a 200. Room pages must not have one, or ROOM_NOT_FOUND would not be a 404.

---

## A. Summary and scope

**In scope**

- `GET /rooms/{username}` (authenticated visitor view) and `GET /me/room` (owner view). The web routes are `/rooms/[username]` and owner-only `/rooms/[username]/customize`.
- Room visibility `friends | members | hidden`. A missing Room, a missing or unfinished or suspended owner, a block in either direction, and any inaccessible Room all return `ROOM_NOT_FOUND`, byte-identical.
- 14 presets (Obsidian Gold, Cream Paper, Lavender Dream, Ocean Glow, Daisy Day, Neon Night, Y2K Glitter, Dark Academia, Frutiger Aero, Tumblr 2014, Retro Windows, Cyberpunk, Minimal Editorial, Polaroid Scrapbook). Their colors live in `design/tokens/paldora.tokens.json` and become generated CSS. The registry in `packages/domain` holds only ids, labels, defaults and allowlists.
- Single and two-column layouts. Seven typed widgets with enabled/placement/order and keyboard reordering.
- Top 4/8/12 accepted friends with their own visibility (`visible|friends|hidden`). They are removed atomically on unfriend or block by database triggers, and re-filtered on every read.
- An HTTPS-only music link card (no embeds, no autoplay, no server-side fetch or unfurl), plus `location` and `currently` plain-text fields.
- A private processed banner: new media purpose `room_banner`, user-scoped, worker derivative with a 3:1 cover crop, signed reads only after Room access passes.
- `expectedUpdatedAt` stale-save detection on every Room write (`ROOM_UPDATE_STALE`).
- Room content previews (posts, Life Updates, photos, Memories year chips) derived through the existing Memories candidate builder with an author filter, so they re-filter by the viewer's current Box membership and blocks.
- App Light/Dark/System stays separate from the Room theme. The appearance UI already exists. Phase 7 adds the isolation rules and tests.
- Mobile bottom navigation that exposes My Room, a desktop "My Room" link, and Room links from friends and Box member lists.
- Rate-limit decisions for every write, contract/OpenAPI/client updates, and an ADR.

**Explicitly out**

- Custom CSS, sanitized HTML widgets, sandboxed embeds, font or background URLs, and any user-supplied color. This is Phase 8 and is deferred. Arbitrary JavaScript is permanently prohibited. The Room model has no field that could carry any of these.
- Room discovery, search, a "visit random Room" surface, view counters, visitor lists, guestbooks, Room comments.
- Username history or redirects after a rename (see B12).
- Moderator or admin hiding of a Room (Phase 9). The access policy gets one extension point.
- Notifications or email when a Room changes or when someone is added to Top Friends. No new realtime event type.
- Native clients (Phases 10/11). The tokens and the OpenAPI contract are shaped so they can adopt Rooms.
- Embedded music (Spotify, SoundCloud, YouTube) and link previews.
- A widget `config` payload. Widgets bind to fixed data sources only.

---

## B. Decisions needing the owner (recommended default in bold)

| #   | Question                                          | Default and rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What may a Room preview show?                     | **Identity (avatar, display name, @username, bio), location, "currently", banner, music link card, Top Friends (per its own visibility), and previews of the owner's content that the _viewer_ can reach today: up to 6 photo thumbnails, the latest 3 posts, the latest 3 Life Updates, and Memories year chips with counts.** Every content item is the live item, re-authorized per viewer (§D, §F). Previews show only Boxes the viewer is in now (a Life Update shows only the viewer's contexts). **Never shown:** Only Me Life Updates (even to the owner, because a Room is a shareable surface), Box names or rosters the viewer is not in, the count of items hidden from the viewer, and "you can't see N more" hints. Previews are compact, link-out cards with no reaction or comment controls, so the themed canvas contains no write actions and no trusted controls. "A visible Room never widens access" is a test, not a hope.                                                           |
| 2   | Visibility semantics                              | **`hidden` = owner only. `friends` = owner plus accepted friends. `members` = friends plus people who share an active Box with the owner.** Tiers nest (hidden ⊂ friends ⊂ members). A blocked pair never sees each other's Room at any visibility. **Deviation from legacy:** legacy `members` meant any signed-in user not blocked. That is effectively public to the whole network and contradicts "private by default". If the owner wants a network-wide tier, it would be a fourth value (`signed_in`) added later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | Who counts as "members" for `members` visibility? | **Viewer and owner both hold `status='active'` memberships in the same Box, and that Box is not deleted. An archived Box counts**, because archived Boxes stay readable by their members (Phase 6 decision 2). Evaluated live on every request. Leaving, being removed, or a Box deletion revokes access immediately. Alternative if the owner wants stricter: count only `boxes.status='active'`. It is a one-word change in `room-access-sql.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | Default Room visibility                           | **`friends`.** Private by default. A new account's Room is visible to nobody until the owner has friends, and the owner can widen to `members` deliberately. The customize page states the audience in plain words next to the radio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | Are Rooms created lazily?                         | **Yes.** No backfill, no provisioning hook, no row for users who never customize. A roomless user is served as the default configuration (`friends`, `cream_paper`, `two_column`, default widgets, no overrides). `GET /me/room` returns it with `updatedAt: null`. The first write creates the row (`INSERT … ON CONFLICT DO NOTHING`, then `FOR UPDATE`) and requires `expectedUpdatedAt: null`. Reads never write. Existing and future accounts behave identically, and migration 0007 stays expand-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | How are widgets typed and allowlisted?            | **A closed registry of seven widget types** (`currently`, `music`, `top_friends`, `photos`, `life_updates`, `posts`, `memories`). Each is bound to a fixed data source and a fixed React component. A Room stores per widget only `enabled`, `placement` (`main                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | sidebar`) and a global `position`0–6, always as exactly 7 rows (a deferred trigger enforces 0 or 7). There is no per-widget config blob, no free text title, no unknown type. The DB`CHECK`and the Zod enum come from the same domain list (a test asserts it). A new widget later means a domain entry, a migration widening the check, and a component. In`single`layout, the global`position`is the reading order, and placement is ignored. In`two_column`, placement picks the column and `position` orders within it, and both collapse to the global order at ≤768px, never mutating saved data.                                                                                               |
| 7   | Top Friends rules                                 | **Size 4, 8 or 12, chosen explicitly. Entries are the owner's _accepted_ friends, active, with a username, not self, distinct, no block either way. Order is kept (`position`). Default visibility is `friends`** (legacy defaulted to `visible`; showing someone's close friends to every Room visitor is a privacy widening the owner should choose). Meaning: `visible` = anyone who can view the Room, `friends` = viewers who are accepted friends of the owner, `hidden` = owner only. **Removal is DB-enforced** on unfriend and block (triggers), and the read path re-checks friendship, status and blocks anyway, so even a missed trigger cannot show a stranger. A visitor never sees a friend they are in a block relationship with (silently omitted, no placeholder, no count). No notification when added. Lowering the size trims entries at or beyond the new size inside the same statement. Gaps in `position` after an automatic removal are allowed and renumbered on the next save. |
| 8   | Banner retention (reuse D2)                       | **Same as every purpose under D2: the raw upload is deleted after processing and the metadata-free re-encoded master is kept while the banner is attached.** Replacing or removing a banner retires the old asset (all keys snapshotted into the deletion outbox) in the same transaction as the Room write. There is no banner history. A ready banner that is never saved to a Room is unattached and the reaper expires it after 24 h. Display derivative: 1600×533 cover crop (3:1). Thumbnail 640×213 for the editor preview. Master: 2560 longest edge, uncropped. EXIF/GPS stripped.                                                                                                                                                                                                                                                                                                                                                                                                                |
| 9   | Room theme registry as tokens                     | **Colors live in `design/tokens/paldora.tokens.json` (`room.preset.*`, `room.accent.*`) and are emitted by the existing generator to `room-themes.css` (scoped by `[data-room-theme]`, `[data-room-scheme]`, `[data-room-accent]`), Swift and Kotlin.** `packages/domain` keeps only ids, labels, scheme (`light                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | dark`), default accent key and default decoration pack. **Legacy hex values are the seed, not gospel:** legacy accents and borders fail WCAG on several presets (for example Daisy Day accent on its canvas is about 2.4:1; the legacy border was the accent at 40% alpha). Where a pair fails, nudge the value and record it like D7 in ADR 017. Presets define `canvas, surface, text, textMuted, border`(solid colors, no alpha). Accents are two-sided: each of the 8 accent keys has`onLight`and`onDark` values, chosen by the preset's scheme, so every accent works on every preset. A generated contrast test (14 presets × 8 accents) enforces text 4.5:1, accent and border 3:1, focus 3:1. |
| 10  | Which style knobs does a Room have?               | **`themePreset` (required), `accent`, `font`, `decorationPack` (each nullable: null means "follow the preset"), `sparkles` (boolean), `layout`.** Fonts are five system font stacks from tokens (`editorial`, `modern`, `rounded`, `mono`, `handwritten`), with no font URLs and no new `font-src`. **Dropped vs legacy: the independent `background` override.** In legacy it swapped the canvas color without swapping the text color, which can produce unreadable combinations. Switching the preset already changes the canvas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 11  | Reduced motion and decoration limits              | **Decoration is static CSS and Unicode glyphs inside the canvas, `aria-hidden`, `pointer-events:none`, never behind text blocks (they sit in the banner and canvas margins), with at most one cluster per region (banner, sidebar header).** Sparkles are at most 6 glyphs, and they animate only under `@media (prefers-reduced-motion: no-preference)` with a slow opacity fade (no more than 1 Hz, no flashing). Under `prefers-reduced-motion: reduce` or `prefers-contrast: more`, sparkles are static or hidden, and the decor is dropped. No autoplay audio or video anywhere. No Room element sets `z-index` ≥ `zIndex.sticky` (a CSS test enforces it).                                                                                                                                                                                                                                                                                                                                           |
| 12  | Username change interplay                         | **A Room belongs to `user_id`; the URL uses the _current_ username.** After a rename the old URL is `ROOM_NOT_FOUND` (or another person's Room if the name is later reused) and all in-app links use the new name. No redirect table in Phase 7, because a redirect would leak "this name used to belong to someone". A rename test pins the behavior. The customize page keys off the signed-in user's current username.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 13  | Required `expectedUpdatedAt`                      | **Required (nullable) on every Room write.** Legacy made it optional, which let any client skip the check. `null` means "I loaded a roomless default". Full-replace writes (`PUT widgets`, `PUT top-friends`) and `PATCH` are idempotent: if the requested state already equals the stored state, the response is the current Room (200) even when `expectedUpdatedAt` is behind, so a retry after a lost response is not a false conflict.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 14  | Mobile navigation                                 | **Add a bottom nav below 768px with five items: Home, Boxes, Life Updates, Friends, My Room.** Settings moves to the avatar link in the header, and Memories is reachable from Home/Life Updates and from the Room. The desktop top nav gains My Room and keeps Memories and Settings. Both navs read one list in `lib/navigation.ts`. The bottom nav uses `zIndex.sticky` and safe-area padding. If the owner prefers Memories in the bottom nav, replace Friends with a "More" page (open question K3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 15  | Music link card                                   | **HTTPS URL only, ≤2,048 chars, no userinfo, no whitespace, no IP-literal or `localhost` host (Zod only), title and artist ≤120.** Rendered as one `<a rel="noopener noreferrer nofollow ugc" target="_blank">` showing the _hostname_ and an "Opens another site" cue. No iframe, no `<audio>`, no autoplay, no metadata fetch. The render path re-validates the URL and falls back to plain text if it fails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 16  | Room previews and the owner viewing themself      | **The owner sees exactly the canvas visitors see, plus a trusted strip _outside_ the canvas** (Customize, audience badge). Disabled widgets are visible only on the customize page. Visitors never receive `visibility`, `updatedAt`, disabled widgets or a top-friends size they cannot see.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## C. Data model (migration `0007_rooms`)

Edit `packages/database/src/schema.ts`, then run `pnpm db:generate --name rooms`. Review the SQL by hand and edit only the new file. Never edit 0000–0006. The migration is expand-only: new enums, three new tables, one new index on `media_assets`, widened media checks, functions and triggers. Hand-added items (functions, triggers, the composite FK with a generated column, check lists) follow the Phase 6 procedure: run a spike first to see how drizzle-kit emits them. Use `is not null` explicitly inside CHECKs.

### Enums

- `room_visibility` (`friends|members|hidden`)
- `room_layout` (`single|two_column`)
- `room_widget_placement` (`main|sidebar`)
- `room_top_friends_visibility` (`visible|friends|hidden`)

### `media_assets` changes

- `media_assets_purpose_check` widened to include `room_banner`.
- `media_assets_box_scope_check` rewritten: `purpose in ('avatar','life_update_image','room_banner')` requires `box_id is null`. The box branch is unchanged.
- `media_assets_unattached_index` recreated with predicate `purpose in ('post_image','reaction_image','life_update_image','room_banner') and status='ready'` (must match the worker query exactly).
- New unique index `media_assets_id_owner_purpose_unique (id, owner_user_id, purpose)`. It is the referent for the banner foreign key.

### `rooms` (one row per user, created lazily)

| Column                        | Definition                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `user_id`                     | uuid PK → `users` ON DELETE CASCADE                                             |
| `configuration_version`       | smallint not null default 1, check `= 1`                                        |
| `visibility`                  | room_visibility not null default `'friends'`                                    |
| `theme_preset`                | text not null default `'cream_paper'`, check in the 14 ids                      |
| `layout`                      | room_layout not null default `'two_column'`                                     |
| `accent`                      | text null, check `is null or in (8 keys)` (null = preset default)               |
| `font`                        | text null, check `is null or in (5 keys)`                                       |
| `decoration_pack`             | text null, check `is null or in (none, stars, flowers, stickers, tape, pixels)` |
| `sparkles`                    | boolean not null default false                                                  |
| `location`                    | text null, check `is null or char_length between 1 and 120`                     |
| `currently`                   | text null, check `is null or char_length between 1 and 240`                     |
| `music_url`                   | text null (checks below)                                                        |
| `music_title`, `music_artist` | text null, each `is null or char_length between 1 and 120`                      |
| `banner_media_id`             | uuid null                                                                       |
| `banner_purpose`              | text GENERATED ALWAYS AS (`'room_banner'`) STORED                               |
| `top_friends_size`            | smallint not null default 8, check `in (4,8,12)`                                |
| `top_friends_visibility`      | room_top_friends_visibility not null default `'friends'`                        |
| `created_at`, `updated_at`    | timestamptz not null default `now()`                                            |

Checks and keys:

- `rooms_music_url_check`: `music_url is null or (music_url like 'https://%' and char_length(music_url) <= 2048 and music_url !~ '\s' and music_url !~ '^https://[^/?#]*@')`. This is the HTTPS-only, no-userinfo, no-whitespace rule in the database.
- `rooms_music_text_requires_url_check`: `music_url is not null or (music_title is null and music_artist is null)`.
- Composite FK `(banner_media_id, user_id, banner_purpose)` → `media_assets (id, owner_user_id, purpose)` with the default NO ACTION. A banner is therefore the owner's own `room_banner` asset, in the database. MATCH SIMPLE skips the check when `banner_media_id` is null. Assets are tombstoned, never deleted, so no SET NULL is needed. Any admin retire path (Phase 9) must null `banner_media_id` first, and the read path serves a banner only while the asset is `ready`.
- Unique index `rooms_banner_media_unique (banner_media_id) where banner_media_id is not null` (an asset serves one Room).
- No visibility index: there is no discovery or listing.
- Trigger `rooms_touch` BEFORE UPDATE: raises (`23000`, `rooms_immutable_columns`) if `user_id` or `created_at` changes. It sets `new.updated_at = greatest(clock_timestamp(), old.updated_at + interval '1 microsecond')`, so versions are strictly monotonic and two writes can never share a version, even within one millisecond.
- Trigger `rooms_trim_top_friends` AFTER UPDATE OF `top_friends_size`: deletes `room_top_friends` rows with `position >= new.top_friends_size` for that Room.

### `room_widgets`

| Column         | Definition                                          |
| -------------- | --------------------------------------------------- |
| `room_user_id` | uuid not null → `rooms (user_id)` ON DELETE CASCADE |
| `widget_type`  | text not null, check in the 7 types                 |
| `placement`    | room_widget_placement not null                      |
| `position`     | smallint not null, check `between 0 and 6`          |
| `enabled`      | boolean not null default true                       |

- PK `(room_user_id, widget_type)`. Unique `(room_user_id, position)`.
- The service replaces all rows (delete, then insert) in one transaction under the Room lock, so the unique index never trips mid-statement.
- Deferred constraint trigger `room_widgets_complete_set` (AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW, DEFERRABLE INITIALLY DEFERRED): at commit, each affected Room has exactly 0 or 7 widget rows, else raises `23000 room_widgets_incomplete`. A cascade from `rooms` leaves 0, which passes.
- Rooms with no rows serve `DEFAULT_ROOM_WIDGETS` from the domain: sidebar `currently, music, top_friends, photos` at positions 0–3; main `life_updates, posts, memories` at positions 4–6.

### `room_top_friends`

| Column           | Definition                                          |
| ---------------- | --------------------------------------------------- |
| `room_user_id`   | uuid not null → `rooms (user_id)` ON DELETE CASCADE |
| `friend_user_id` | uuid not null → `users (id)` ON DELETE CASCADE      |
| `position`       | smallint not null, check `between 0 and 11`         |
| `created_at`     | timestamptz not null default `now()`                |

- PK `(room_user_id, friend_user_id)` (distinct). Unique `(room_user_id, position)`.
- Check `room_top_friends_not_self_check`: `room_user_id <> friend_user_id`.
- Index `room_top_friends_friend_index (friend_user_id, room_user_id)`, used by the removal triggers and the cascade.
- Trigger `room_top_friends_insert_guard` BEFORE INSERT (the final authority):
  1. `position < rooms.top_friends_size` for that Room, else `23000 top_friend_position_out_of_range`.
  2. An `accepted` friendship exists for the ordered pair, selected `FOR SHARE`. Taking a share lock on the friendship row is what serializes the add against a concurrent unfriend or block (both must delete or update that row).
  3. No `user_blocks` row in either direction.
  4. `users.status = 'active'` for the friend.
     Otherwise it raises `23000 top_friend_not_eligible`.
- Trigger `friendships_remove_top_friends` AFTER DELETE OR UPDATE OF `status` ON `friendships`: when `old.status = 'accepted'` and the row was deleted or the new status is not accepted, delete `room_top_friends` rows for the pair in both directions (`(room=low, friend=high)` and `(room=high, friend=low)`).
- Trigger `user_blocks_remove_top_friends` AFTER INSERT ON `user_blocks`: delete the pair's rows in both directions. This is redundant today (blocking already deletes the friendship) but keeps the invariant even if a future path inserts a block without touching the friendship.
- These triggers make "removed atomically on unfriend or block" true for every code path, including Phase 9 admin actions and direct SQL, and they run in the same transaction as the unfriend or block.

### `user_preferences`

No change. Appearance already lives there.

### Cascades and lifecycle

- User delete: `rooms` cascades (widgets, top friends follow). The banner asset's owner FK is RESTRICT, so Phase 9 account deletion must retire the banner first through the outbox. Add that to the Phase 9 checklist in the ADR.
- Suspended or onboarding-incomplete owners keep their rows. Access is decided by the policy (§D), not by deleting data.
- Box deletion and membership changes touch no Room tables. They only change what the policy and previews compute live.

---

## D. Authorization matrix and errors

### Access decision (one SQL query in `RoomAccessService.resolve`)

Input: viewer id, raw username string. Steps, all in one statement so every denial path does the same work:

1. Resolve `profiles.username_normalized = normalizeUsername(raw)` joined to `users` with `status='active'` and `username is not null`. No row means deny.
2. Left join `rooms` (missing row means default configuration).
3. Compute `is_owner`, `is_friend` (accepted friendship, pair lookup), `shares_box` (an active membership of each in the same non-deleted Box), and `blocked` via `hiddenByBlock(viewer, owner)`.
4. Allow when `is_owner`, or (`not blocked` and ((`visibility = 'friends'` and `is_friend`) or (`visibility = 'members'` and (`is_friend` or `shares_box`)))).
5. Relationship returned: `owner`, `friend`, or `member`. Hidden never allows a non-owner.

Every deny reason throws the same `roomNotFound()` (status 404, code `ROOM_NOT_FOUND`, fixed message). The username path parameter is a lenient string (≤100 chars): a malformed name is `ROOM_NOT_FOUND`, never `VALIDATION_FAILED`. Phase 9 extension point: the same query adds `and not moderation_hidden`.

| Situation                                                                        | Result                                                                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Owner views own Room (any visibility, even `hidden`)                             | 200, `relationship: owner`                                                                   |
| Accepted friend, visibility `friends` / `members`                                | 200, `friend`                                                                                |
| Accepted friend, visibility `hidden`                                             | `ROOM_NOT_FOUND`                                                                             |
| Non-friend who shares an active Box, visibility `members`                        | 200, `member`                                                                                |
| Same person, visibility `friends`                                                | `ROOM_NOT_FOUND`                                                                             |
| Former member (left, removed, Box deleted) of the only shared Box                | `ROOM_NOT_FOUND` on the next request (`members`)                                             |
| Ex-friend (unfriended)                                                           | `ROOM_NOT_FOUND` for `friends`; for `members`, 200 only if they still share a Box            |
| Pending or declined friend request only                                          | treated as a stranger                                                                        |
| Block in either direction, any visibility                                        | `ROOM_NOT_FOUND` for both people                                                             |
| Unblock                                                                          | the normal rules apply again (no memory of the block)                                        |
| Missing username, never-existing, guessed, wrong case variant of an existing one | case variants resolve (normalization) and then follow the rules; missing is `ROOM_NOT_FOUND` |
| Owner suspended (`users.status != 'active'`) or no username yet                  | `ROOM_NOT_FOUND`                                                                             |
| Viewer suspended or unprovisioned                                                | `ACCOUNT_BLOCKED` / `ACCOUNT_NOT_PROVISIONED` at the guard (before any Room code)            |
| Unauthenticated                                                                  | `AUTHENTICATION_REQUIRED`                                                                    |
| Owner renamed, old URL                                                           | `ROOM_NOT_FOUND`                                                                             |
| Owner never customized (no row) and viewer is a friend                           | 200 default Room (visibility `friends`)                                                      |

**Parity requirement.** For the cases above that deny, the status, headers (except `x-request-id`), and body (except `requestId`) are identical. A test serializes each denial and compares them. The same holds for `/rooms/{username}/content`, `/content/summary` and `/photos`. These all run the same access query first.

### Writes (all owner-only through `/me/room…`, no username in the path)

| Action                     | Owner | Notes                                                                                                                                                                               |
| -------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /me/room`           | yes   | `expectedUpdatedAt` required; stale gives `ROOM_UPDATE_STALE`; banner id must be the owner's own ready, unused `room_banner` asset (`MEDIA_NOT_FOUND`, `MEDIA_NOT_READY`)           |
| `PUT /me/room/widgets`     | yes   | exactly the 7 types once, positions 0–6 distinct                                                                                                                                    |
| `PUT /me/room/top-friends` | yes   | each id an accepted, active friend with no block; anything else gives one code, `TOP_FRIEND_NOT_ELIGIBLE` (nonexistent, pending, blocked, suspended and self are indistinguishable) |
| Another person's Room      | n/a   | there is no route to write it; the web customize page 404s for any other username                                                                                                   |

### Top Friends matrix

| Situation                                                               | Result                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Add an accepted friend                                                  | stored                                                                          |
| Add a non-friend, a pending request, a stranger, self, or an unknown id | `TOP_FRIEND_NOT_ELIGIBLE`                                                       |
| Add someone with a block either way                                     | `TOP_FRIEND_NOT_ELIGIBLE`                                                       |
| Owner unfriends a top friend, or the top friend unfriends the owner     | row removed in the same transaction (trigger)                                   |
| Owner blocks or is blocked by a top friend                              | row removed in the same transaction (trigger)                                   |
| Add races unfriend or block                                             | exactly one order wins; the loser never leaves a stale row (§I)                 |
| Friend is suspended later                                               | omitted on read; the row remains until removed                                  |
| Visitor has a block with a top friend                                   | that entry is omitted for that visitor; no placeholder, no count change visible |
| Visibility `friends`, viewer is a `member`                              | `topFriends.items = null` (the widget shows its private state)                  |
| Visibility `hidden`, any non-owner                                      | `items = null`                                                                  |

### Room previews (content routes)

- Run the access query first (`ROOM_NOT_FOUND` on any denial).
- Then query the owner's posts and Life Updates through `memoryCandidates({ viewerId, authorId: ownerId, includeOnlyMe: false, … })`. It starts from the _viewer's_ active memberships, so a former member, a removed member and a stranger reach nothing.
- Block filtering is the shared `hiddenByBlock(viewer, author)` (a no-op for the owner after the access check, and it still applies to any other author).
- Each item is loaded by `PostPageService.itemsForPosts` / `LifeUpdateViewService.byIds`, which re-authorize again and sign photos only for items that survive.

### Error codes (append a Phase 7 section to `packages/domain/src/errors.ts`; check `errors.test.ts` and the web copy maps)

- `ROOM_NOT_FOUND` (404): missing, hidden, not permitted, blocked, owner unavailable. All look identical.
- `ROOM_UPDATE_STALE` (409): `expectedUpdatedAt` is behind. Reveals nothing beyond the owner's own Room.
- `TOP_FRIEND_NOT_ELIGIBLE` (422).
- Reuse `VALIDATION_FAILED`, `MEDIA_NOT_FOUND`, `MEDIA_NOT_READY`, `RATE_LIMITED`, `RATE_LIMIT_UNAVAILABLE`, `AUTHENTICATION_REQUIRED`, `ACCOUNT_BLOCKED`.

---

## E. Contract

Add `packages/validation/src/rooms.ts`. Append to `routes.ts` (registry and `apiRoutes`), add client methods, then run `pnpm contract:generate`. Each route lands with its controller in the same slice, because `route-inventory.test.ts` requires an exact match and a rate-limit decision on every non-GET route.

### Domain (`packages/domain/src/rooms.ts`)

- `ROOM_THEME_PRESETS` (14, legacy order), `ROOM_THEME_META: Record<Preset, {label, scheme, defaultAccent, defaultDecoration}>`.
- `ROOM_ACCENTS` (`gold, lavender, ocean, daisy, pink, emerald, cyan, crimson`), `ROOM_FONTS`, `ROOM_DECORATION_PACKS`, `ROOM_LAYOUTS`, `ROOM_VISIBILITIES` (+ labels and one-line audience descriptions), `ROOM_WIDGET_TYPES` (+ labels), `ROOM_WIDGET_PLACEMENTS`, `DEFAULT_ROOM_WIDGETS`, `TOP_FRIENDS_SIZES = [4, 8, 12]`, `TOP_FRIENDS_VISIBILITIES`.
- `ROOM_LOCATION_MAX = 120`, `ROOM_CURRENTLY_MAX = 240`, `ROOM_MUSIC_TEXT_MAX = 120`, `ROOM_MUSIC_URL_MAX = 2048`.
- `DEFAULT_ROOM` (the roomless configuration), pure `resolveRoomStyle(room)` (applies preset defaults to null overrides, returns `{theme, scheme, accent, font, decoration, sparkles}`).
- `MEDIA_PURPOSES` gains `room_banner` (`scope: 'user'`, same size and pixel limits as avatar). `DerivativeSpec` gains `fit: 'cover'` with a required `height`: master `{size: 2560, fit: 'inside'}`, display `{size: 1600, height: 533, fit: 'cover'}`, thumbnail `{size: 640, height: 213, fit: 'cover'}`.

### Schemas (`packages/validation/src/rooms.ts`)

- `roomMusicSchema` (strict): `url` (trimmed, https only, ≤2048, no userinfo, no whitespace, host not an IP literal or `localhost`), `title|artist` (trimmed, ≤120, nullable). Export `isSafeMusicUrl`, used by the web render path as well.
- `updateRoomSchema` (strict, at least one of the fields below): `visibility`, `themePreset`, `layout`, `accent` (nullable), `font` (nullable), `decorationPack` (nullable), `sparkles`, `location` (trimmed, nullable, empty becomes null), `currently` (same), `music` (nullable), `bannerMediaId` (uuid, nullable), and **`expectedUpdatedAt`: isoTimestamp, nullable, required**. Unknown keys (`css`, `html`, `script`, `fontUrl`, `backgroundUrl`, `background`, `customStyle`) are rejected by `.strict()` with `VALIDATION_FAILED`, and a test lists them.
- `updateRoomWidgetsSchema` (strict): `widgets` is exactly 7 `{type, placement, position, enabled}` with each type once and positions 0–6 distinct; `expectedUpdatedAt` required nullable.
- `updateRoomTopFriendsSchema` (strict): `userIds` (uuid, distinct, ≤12), `size` (4|8|12), `visibility`, `expectedUpdatedAt`; refine `userIds.length <= size`.
- `roomSchema` (owner and visitor shapes share one schema, with owner-only fields nullable):
  - `owner: {id, username, displayName, bio|null, avatarUrl|null}`
  - `relationship: 'owner'|'friend'|'member'`
  - `style: {themePreset, layout, accent|null, font|null, decorationPack|null, sparkles}`
  - `location`, `currently`, `music|null`
  - `banner: {url, bannerMediaId|null}|null` (the id only for the owner)
  - `widgets: [{type, placement, position, enabled}]` (disabled ones only for the owner)
  - `topFriends: {size|null, visibility|null, items: UserSummary[]|null}` (size and visibility owner-only)
  - `visibility: RoomVisibility|null` (owner only)
  - `updatedAt: iso|null` (owner only; null for a roomless default)
  - `configurationVersion: 1`
- `roomContentQuerySchema` = `memoryQuerySchema` with `year` optional. `roomContentSummarySchema` = `memorySummarySchema`. `roomPhotoPageSchema` = cursor page of `{ photo: PostMedia, source: {kind:'post', postId}|{kind:'life_update', lifeUpdateId, boxId}, occurredAt }`.
- Preferences schemas are unchanged.

### Operations

| operationId              | Route                                                                       | Rate limit                                                                                  | Errors beyond globals                                 |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `getMyRoom`              | `GET /me/room` → `Room`                                                     | none (reads are unlimited, like every other GET; parity makes username enumeration useless) | none                                                  |
| `getRoom`                | `GET /rooms/{username}` → `Room`                                            | none                                                                                        | `ROOM_NOT_FOUND`                                      |
| `listRoomContent`        | `GET /rooms/{username}/content?type&year&month&cursor&limit` → `MemoryPage` | none                                                                                        | `ROOM_NOT_FOUND`                                      |
| `getRoomContentSummary`  | `GET /rooms/{username}/content/summary?year` → `MemorySummary`              | none                                                                                        | `ROOM_NOT_FOUND`                                      |
| `listRoomPhotos`         | `GET /rooms/{username}/photos?cursor&limit` → `RoomPhotoPage`               | none                                                                                        | `ROOM_NOT_FOUND`                                      |
| `updateMyRoom`           | `PATCH /me/room` → `Room`                                                   | 120/h `room-update`                                                                         | `ROOM_UPDATE_STALE, MEDIA_NOT_FOUND, MEDIA_NOT_READY` |
| `updateMyRoomWidgets`    | `PUT /me/room/widgets` → `Room`                                             | 120/h `room-update` (shared counter)                                                        | `ROOM_UPDATE_STALE`                                   |
| `updateMyRoomTopFriends` | `PUT /me/room/top-friends` → `Room`                                         | 120/h `room-update` (shared counter)                                                        | `ROOM_UPDATE_STALE, TOP_FRIEND_NOT_ELIGIBLE`          |

- **Banner upload** reuses `POST /media/uploads` (+ `/complete`, `GET /media/{id}`) with purpose `room_banner`. `PURPOSE_UPLOAD_LIMITS.room_banner = {scope:'room-banner-upload', limit: 20, windowSeconds: 3600}`, fail-closed like the others. Attaching and removing a banner are the `bannerMediaId` field of `PATCH /me/room` (a value attaches, `null` removes), so there are no dedicated banner routes and stale detection covers banner changes too. Compared with legacy's four banner routes, the surface is smaller.
- **App appearance** reuses `PUT /me/preferences`. No change.
- **Idempotency.** `PUT` widgets and top-friends are full replacements. `PATCH` applies a partial change. For all three, inside the row lock and before the stale check, if the requested state equals the stored state, return the current Room (200) and do not bump `updated_at`. Banner replacement of the same asset is likewise a no-op.
- **Stale rule.** After locking the row, if `expectedUpdatedAt` is not equal (microsecond string compare via `cursorTimestamp`) to the stored `updated_at` (or `null` while a row exists), throw `ROOM_UPDATE_STALE`. Every section write (settings, widgets, top friends, banner) bumps the one `updated_at`, so a stale tab cannot overwrite a newer save of a different section.
- **Realtime: no new event types.** Room data is not part of the Box feed channel, and previews re-authorize on load. Existing `memberships.changed` already makes the web bridge refresh the current page, which re-runs the access query for an open Room.

### api-client (`packages/api-client/src/index.ts`)

Add `myRoom`, `room`, `roomContent`, `roomContentSummary`, `roomPhotos`, `updateMyRoom`, `updateMyRoomWidgets`, `updateMyRoomTopFriends`. Update the `conformance.test.ts` and `openapi.test.ts` fixtures and regenerate `contracts/openapi.yaml`.

---

## F. API module design

Keep files small (services about 150 lines or fewer, complexity ≤ 15). Inject with explicit `@Inject(Token)`.

### Module dependency direction (no cycle)

`RoomsModule` imports `IdentityModule` (ProfileSummary), `MediaModule` (URL signing, retirement), `PostsModule` (PostPageService) and `LifeUpdatesModule` (view service), and `MemoriesModule` (query and candidate builder). It does **not** import `SocialModule` or `BoxesModule`: the Top Friends removal is a database concern, so `FriendshipService` and `BlockService` change by tests only, not by code. Nothing imports `RoomsModule`. Add it to `app.module.ts`.

### Shared SQL

- `packages/database/src/rooms.ts` (new): `roomAccessConditions(viewerId, ownerColumn)` returning the `is_friend` and `shares_box` `EXISTS` fragments, plus `ROOM_DEFAULTS` mapped to column names. It reuses `hiddenByBlock` and adds no block logic of its own.
- `memoryCandidates` (`apps/api/src/memories/memory-candidates.ts`) gains two optional scope fields: `authorId` (restrict both branches to one author) and `includeOnlyMe` (default keeps today's behavior; Rooms pass false). `MemoryQueryService.page` is generalized to take `{boxId?, authorId?, includeOnlyMe}`. The summary service gets the same scope. This reuses the "counts always match items" guarantee.

### `apps/api/src/rooms/`

- `room-errors.ts`: `roomNotFound`, `roomUpdateStale`, `topFriendNotEligible`.
- `room-access.service.ts`: `resolve(viewerId, rawUsername)` → `{ ownerId, relationship, room: RoomRow | null }` (one statement, §D) and `ownerRoom(userId)`. This is the only place a Room's audience is decided. Every Room route starts here.
- `room-row.ts`: `ensureRoom(tx, userId)` (`INSERT … ON CONFLICT DO NOTHING`), `lockRoom(tx, userId)` (`SELECT … FOR UPDATE`), `assertFresh(row, expected)` (pure, unit tested), `sameState` helpers for the idempotent short-circuit.
- `room-view.service.ts`: `forOwner(userId)`, `forViewer(access)`. It loads widgets (or defaults), Top Friends, banner URL and owner summary in a fixed number of queries, then maps through `room-views.ts` (pure: applies defaults, strips owner-only fields and disabled widgets for visitors, orders by position).
- `room-top-friends-read.ts`: the visitor re-filter for Top Friends. It joins `room_top_friends` ⨝ accepted friendship ⨝ active users ⨝ profiles with a username, and `not hiddenByBlock(viewer, friend)`; its visibility rule is computed from the relationship. It signs avatars only for survivors via `ProfileSummaryService.summaries`.
- `room-update.service.ts`: `update(userId, input)`. In one transaction: `ensureRoom` → `lockRoom` → idempotence check → stale check → `claimBanner` if `bannerMediaId` is present → `UPDATE rooms`. Returns `forOwner` after commit. **No network I/O in the transaction.** Signing happens after commit.
- `room-banner.ts`: `claimBanner(tx, userId, mediaAssetId|null, current)`. It locks the asset `FOR UPDATE`, requires owner, `purpose='room_banner'`, `status='ready'` (`MEDIA_NOT_READY` if processing, `MEDIA_NOT_FOUND` otherwise) and not attached elsewhere, then `retireMediaAssets` for the previous banner in the same transaction. A unique violation on `rooms_banner_media_unique` maps to `MEDIA_NOT_FOUND`.
- `room-widget.service.ts`: replaces all 7 rows under the Room lock and bumps `updated_at`.
- `room-top-friends.service.ts`: lock the Room, check stale, ensure size/visibility, delete rows not in the new list, upsert the rest with their new positions (positions are rewritten through delete-then-insert to avoid unique-index collisions), then update the Room row. Database trigger errors `23000 top_friend_not_eligible` and `top_friend_position_out_of_range` map to `TOP_FRIEND_NOT_ELIGIBLE` / `VALIDATION_FAILED` using the `database-errors.ts` helpers. The service also pre-checks eligibility with a single set query for good messages and ordering, but the trigger remains the authority.
- `room-content.service.ts`: `content`, `summary`, `photos`. Each does `access.resolve`, then the candidate/summary query with `authorId = ownerId, includeOnlyMe = false`, then batch loads. Photos: page the candidate rows that have at least one ready photo (an `EXISTS` on `post_media` / `life_update_media` joined to ready assets), then expand to photos, signing thumbnails and display URLs after authorization. A page is a page of items (each at most 4 photos), and the cursor is the item keyset.
- `rooms.controller.ts` (`ZodPipe`, `@RateLimit`, `@CurrentPrincipal`; the `username` pipe is a lenient string) and `rooms.module.ts`.

Function-size and DI notes: each service has one public method per route, pure mappers live beside them, and the access SQL is a single exported fragment function so a unit test can render it.

---

## G. Worker and media changes

- `apps/worker/src/media/attachments.ts`: add `room_banner: async () => undefined` with a comment, because the API claims it in the `PATCH /me/room` transaction. A ready banner that nobody claims is removed by the reaper.
- `apps/worker/src/media/derivatives.ts`: `encode` gains the `cover` branch: `source.resize(spec.size, spec.height, { fit: 'cover', position: sharp.strategy.attention })`. Rotation, metadata stripping, 40 MP limit and WebP encoding are unchanged. A tall or small input is covered and upscaled only by `cover` semantics for display. The master keeps `inside` with `withoutEnlargement`. Update `derivatives.test.ts` (exact 1600×533 and 640×213 outputs, GPS EXIF absent) and `job-router.test.ts`.
- `apps/worker/src/maintenance/unattached-media.ts`: add `room_banner` to `CLAIMED_PURPOSES` and a branch `notExists(select 1 from rooms where banner_media_id = media_assets.id)` in `unattachedMedia`. It must match the recreated index predicate exactly. Same 24 h expiry.
- No new sweep: a Room never needs delivery repair. Add the reaper test that a _claimed_ banner is never expired, and one that an old unclaimed `room_banner` is.
- **Notifications projector and realtime: no change.** Rooms produce no events.
- Worker integration files run serially, as in Phase 5/6.
- Phase 9 note: account deletion must null `rooms.banner_media_id` and retire the banner before the user row goes (the owner FK is RESTRICT).

---

## H. Web

All new server actions are `async function` declarations. Typed route hrefs with query strings or fragments need string casts. Global styling uses CSS Modules and `--pal-*` tokens only. There are no `style` attributes anywhere (CSP).

### Theme token pipeline (R7, ADR 005 "revisit when Room themes")

1. `design/tokens/paldora.tokens.json` gains `room.preset.<camelCaseId>.{canvas,surface,text,textMuted,border}` (14 presets, solid colors), `room.accent.<key>.{onLight,onDark}` (8 keys) and `font.room.{modern,rounded,mono,handwritten}` system stacks. `room.focus` is not a token: the canvas uses `--room-text` for its focus ring (guaranteed 4.5:1 against its own canvas).
2. `packages/tokens/src/emit.ts` gains `emitRoomCss(tokens)` writing `generated/css/room-themes.css`:
   - `.room-canvas[data-room-theme='obsidian_gold'] { --room-canvas, --room-surface, --room-text, --room-text-muted, --room-border }` (selector id is the snake_case domain id converted from the token camelCase name; the generator asserts the conversion round trips);
   - `.room-canvas[data-room-scheme='dark'][data-room-accent='gold'] { --room-accent: … }` (16 rules);
   - font rules for `data-room-font` (the `editorial` stack is the existing `font.editorial`).
     The tokens package exports `./room-themes.css`. `generate.ts` writes and `--check`s it. Swift and Kotlin automatically receive the new constants.
3. `tokens.test.ts` adds a generated contrast matrix (14 presets × 8 accents): text and muted text ≥ 4.5 against canvas and surface, border and accent ≥ 3 against canvas and surface, and accent per scheme chosen by the preset's `scheme`. The preset `scheme` comes from the domain registry, so the **consistency test lives in the web app** (`apps/web/app/lib/room-theme.test.ts`), which imports both `@paldora/domain` and the generated tokens: ids match, schemes match the computed canvas luminance, every default accent key exists, and every domain preset has a CSS rule.
4. The web imports `room-themes.css` once in `app/(signed-in)/rooms/[username]/layout.tsx`. `RoomCanvas` sets only `data-room-theme`, `data-room-scheme`, `data-room-accent`, `data-room-font`, `data-room-decoration`, `data-room-sparkles` and `data-room-layout`. Because values are attributes selecting static CSS, the strict CSP is satisfied and no color is ever computed from user input.
5. Isolation: `.room-canvas` sets `isolation: isolate; contain: layout paint; overflow: clip; position: relative`. Its descendants set no `z-index` ≥ `--pal-z-index-sticky`. A CSS-scan test enforces this. App chrome (header, bottom nav, toasts, dialogs) stays outside the canvas and uses `--pal-*` shell tokens only. The canvas sets `color-scheme` per preset scheme, so native controls inside match.

### Components (`apps/web/app/components/`, reuse list)

Reuse: `AppShell` (changed nav only), `Avatar`/`InitialAvatar`, `PageHeader`, `Section`, `EmptyState`, `Button`, `TextField`/`TextAreaField`, `FormMessage`/`ActionFeedback`, `SubmitButton`, `ConfirmAction`, `LocalTime`, `MoreLink`, toasts, `PostPhotos`'s thumbnail look, `image-upload.ts`/`media-polling.ts` and the `useAvatarUpload` reserve → PUT → complete → poll flow (generalized to take a purpose and an on-ready callback; the avatar keeps its behavior), `MemoryPeriod` / `memory-timeline` helpers from `lib/memories.ts` for the Room Memories page.

New:

- `room-canvas.tsx`: pure presentational (no hooks, no server-only import) so both the server page and the customizer can render it with draft appearance. Owns attributes, banner `<img>` (`alt=""`, 3:1, `object-fit: cover`), identity header, and the widget columns. Single layout: one list in global `position` order. Two columns: sidebar and main. A `@media (max-width: 767.98px)` rule collapses to the global order.
- Widgets: `room-currently-widget`, `room-music-card`, `room-top-friends-widget`, `room-photos-widget`, `room-life-updates-widget`, `room-posts-widget`, `room-memories-widget` (year chips linking to `/rooms/{username}/memories?year=`). Compact, link-out content, no reaction or comment controls. Empty states: the owner sees a quiet "Add this in Customize" hint (outside the visitor shape), a visitor sees an honest short empty line for content widgets, and `currently` and `music` are omitted for visitors when empty. Content summaries are plain text excerpts (240 chars, React-escaped), with the viewer-relative Box name and `LocalTime`.
- `room-decoration.tsx`: `aria-hidden` glyph layers only.
- `room-editor.tsx` (client shell) with: `room-theme-picker` (a `radiogroup` of 14 option cards, each with its own `data-room-theme` mini swatch, name, and a "light"/"dark" text label, never color alone), `room-style-form` (layout, accent with "Follow theme", font, decoration, sparkles with the reduced-motion note), `room-visibility-form` (3 radios with the audience sentence from the domain), `room-profile-form` (location, currently, music with live URL validation), `room-banner-uploader` (reuses the upload hook, shows the processed 3:1 preview, "Remove banner"), `room-widget-editor`, `room-top-friends-editor`.
- **Keyboard reordering** (widgets and Top Friends): a list where each row has "Move up" and "Move down" buttons with names like "Move Photos up, position 4 of 7" (44×44 targets, disabled at the ends), a placement select (`main|sidebar`) and an enabled checkbox. A polite live region announces "Photos moved to position 3 of 7". No drag-and-drop dependency. Pointer drag is optional later.
- `room-customize-link` / "Preview as visitor" is out of scope.
- `bottom-nav.tsx` and `lib/navigation.ts` (one list for `AppNav` and `BottomNav`). The bottom nav is `<nav aria-label="Primary mobile">`, fixed, `z-index: var(--pal-z-index-sticky)`, safe-area padding, each target ≥ 44×44, `aria-current` on the section. `AppNav` hides below 768px. `main` gets bottom padding so content never hides behind it. "My Room" links to `/rooms/{currentUsername}`.
- Update `app/components/README.md` with the new entries, and `PersonRow`/Box member rows gain a "Room" link (the target enforces its own access).

### Routes (`apps/web/app/(signed-in)/`)

- `rooms/[username]/layout.tsx`: imports `room-themes.css`. No `loading.tsx` anywhere under `rooms` (a streamed fallback would turn `notFound()` into a 200).
- `rooms/[username]/page.tsx`: fetch `room`, then widget data in parallel for only the enabled content widgets (`roomContent` for posts and life updates, `roomPhotos`, `roomContentSummary`). `ROOM_NOT_FOUND` becomes `notFound()` via an `orNotFound`-style helper, which renders the shared not-found page. Layout: the trusted strip (page heading, "Customize" for the owner, audience badge) _outside_ the canvas, then `<RoomCanvas>`.
- `rooms/[username]/customize/page.tsx`: if the param does not match the signed-in user's current username (case-insensitive normalized), `notFound()` (the same page as a missing Room). Otherwise it loads `myRoom`, the friends list (for Top Friends), and renders `RoomEditor` next to a live canvas preview built from real saved data with draft appearance attributes.
- `rooms/[username]/memories/page.tsx`: year/month/type via search params, using the existing period components with the Room content endpoints. Malformed periods 404 before the API call (the Phase 6 pattern).
- `actions/rooms.ts`: `updateRoomAction`, `updateRoomWidgetsAction`, `updateRoomTopFriendsAction`, `prepareRoomBanner` (reserve, purpose `room_banner`), reusing the media actions. Copy maps cover `ROOM_UPDATE_STALE` (persistent inline "This Room changed somewhere else. Reload to see the latest" with a Reload button that refreshes the data and keeps nothing silently), `TOP_FRIEND_NOT_ELIGIBLE`, `MEDIA_NOT_FOUND`, `MEDIA_NOT_READY`, `RATE_LIMITED`, `ROOM_NOT_FOUND`.
- Every save returns the new `updatedAt`, which the editor keeps in state for the next write.
- `settings/appearance`: add a sentence and a link: "Your Room theme is chosen in Customize. This setting only affects the app around it."

### Accessibility and 390px

- `.room-canvas` contains no `<nav>`, no links outside an allowlist (`/rooms/*`, `/posts/*`, `/life-updates/*`, the external music link), and no forms. A DOM test asserts this on every theme.
- All 14 themes pass axe on the visitor page and on customize, light and dark app appearance, at desktop and 390px. Focus is visible (3px ring, `--room-text`), link text is the text color with an underline, and color is never the only signal.
- Landmarks: the Room is a `<section aria-labelledby>` with an `h1` (the owner's display name), widgets are `h2`, and heading levels never skip.
- Targets ≥ 44×44. No horizontal scroll at 390px, with banner, music card, Top Friends grid (2 columns at 390px) and photo strip all wrapping. Decorative glyph layers never extend beyond the canvas.
- Honest loading, empty, inaccessible and error states. There is no fake sample data in the visitor Room. The customizer preview uses the owner's real saved data.
- Reduced motion and high contrast handled per B11.

---

## I. Tests

**Unit**

- `packages/domain`: registry completeness (14 presets, 8 accents, 7 widget types), `resolveRoomStyle`, `DEFAULT_ROOM_WIDGETS` positions, the `room_banner` policy row.
- `packages/validation`: music URL (https accepted; `http:`, `javascript:`, `data:`, `file:`, userinfo, whitespace, IP literal, `localhost`, 2,049 chars rejected); title/artist 120 and 121; `location` 120/121 and `currently` 240/241; strict rejection of `css`, `html`, `script`, `fontUrl`, `backgroundUrl`, `background`, `customStyle`; widgets with a duplicate type, a missing type, a duplicate or out-of-range position; Top Friends with 13 ids, a duplicate id, `userIds.length > size`, and size 5; `expectedUpdatedAt` missing is rejected, null accepted; empty body rejected; the conformance and OpenAPI fixtures.
- `packages/tokens`: drift check, the 14 × 8 contrast matrix, selector round trip. Web: `room-theme.test.ts` consistency (§H), `room-z-index.test.ts` (no `z-index` ≥ sticky in Room CSS), CSP unchanged.
- API pure helpers: `assertFresh`, `sameState`, `room-views` (visitor stripping of `visibility`, `updatedAt`, disabled widgets, size), `roomAccessConditions` rendered SQL.

**Database integration** (`packages/database/src/schema.integration.test.ts`)

- Every constraint rejects its violation with raw SQL: preset/accent/font/decoration not in list; `configuration_version`; location/currently/music lengths; `http://`, whitespace and userinfo in `music_url`; music title without URL; size 5; widget type, position 7; top-friend position 12 and self; a banner asset of another owner, of another purpose, or reused by a second Room.
- Triggers: `rooms_touch` is strictly monotonic (two updates in one transaction differ) and refuses a `user_id`/`created_at` change; `room_widgets_complete_set` rejects 3 or 8 rows at commit and accepts 0 and 7; `room_top_friends_insert_guard` rejects non-friend, pending, declined, blocked either way, suspended, and position ≥ size; unfriend (delete) and status change from accepted remove both directions' rows; a block insert removes both directions; lowering the size trims; room delete cascades.
- Hermetic against leftover rows.

**API integration** (`apps/api/src/rooms/*.integration.test.ts`)

- Full matrix from §D: every relationship × every visibility, owner suspended, no username, renamed owner (old and new URL), case variants, guessed names, viewer with a pending request only, ex-friend, former member of the shared Box (removed, left, Box deleted, Box archived still counts), and block in each direction plus mutual plus unblock.
- **Parity**: serialize the denial of each of the 8 denial reasons on `getRoom`, `listRoomContent`, `getRoomContentSummary` and `listRoomPhotos`. The bodies and headers (minus request id) are identical.
- Roomless defaults: owner `updatedAt: null`; a friend sees the default Room; the first write requires `expectedUpdatedAt: null`; a second tab doing the same gets the stale error.
- Visitor shaping: `visibility`, `updatedAt` and `bannerMediaId` are absent, and disabled widgets are absent. The owner gets everything.
- Writes: `PATCH` partial fields, null overrides resetting to the preset, idempotent no-op returning 200 without bumping, `PUT widgets` replacing atomically, and Top Friends ordering. A rate-limit test: the 121st write is `RATE_LIMITED`, and the banner upload purpose limit is fail-closed.
- **Stale saves**: two clients with the same version, exactly one succeeds. A widgets save after a settings save from another tab is stale. A retry of a succeeded request is a no-op success.
- **Banner**: a processing asset gives `MEDIA_NOT_READY`; another user's asset, a post photo, or a deleted asset give `MEDIA_NOT_FOUND`; replacing retires the previous asset and queues its objects; removal retires; a banner claim races the reaper (claim wins when it holds the lock, reaper skips locked rows); the visitor URL is signed only after access passes; a banner whose asset is not ready is not served.
- **Top Friends races** (with barriers, like the block race tests): (a) add vs unfriend by either side, both orders: the final state never contains a non-friend, and the loser errors cleanly or is removed; (b) add vs block either direction; (c) two owners' saves vs the same friend's unfriend; (d) size lowering vs unfriend (no deadlock beyond a retried 40P01). A test disables the insert guard trigger and the removal trigger separately and shows the race tests fail, so they are not decorative (as the `lockPair` tests do).
- **Atomicity**: `FriendshipService.remove` and `BlockService.create` followed immediately by a read show no Top Friend entry. A transaction that fails after the unfriend rolls the trigger deletion back with it.
- **Preview re-filtering** (the "never widens access" invariants): owner is in Boxes A and B, viewer only in A: previews show only A's items and a Life Update shows only the A context; a viewer who leaves A sees nothing at once; Only Me never appears, even for the owner; an owner post in a Box the viewer was never in never appears; a deleted post or Life Update disappears; counts in the Memories chips equal the items; a third-party block between viewer and a top friend omits only that friend. Query-count test: a Room with 3 posts, 3 Life Updates and 6 photos loads in a fixed number of queries.
- **Block rows** added to the ADR 013 matrix (`apps/api/src/social/block.integration.test.ts`): Room view, content, photos and Top Friends, both directions, unblock and re-block.
- `route-inventory.test.ts` stays green.

**Worker** (serial)

- `room_banner` processing yields exact 1600×533 and 640×213 WebP derivatives, no EXIF/GPS, and a ready asset. The reaper expires an unclaimed `room_banner` and never an attached one. The projector is unchanged (a regression test that Room writes enqueue no activity events).

**Full-stack Playwright** (`apps/web/e2e/full-stack/rooms.spec.ts`, `room-customize.spec.ts`; desktop and `mobile-chrome`; axe on every page and on each of the 14 themes)

- A friend views a Room; a stranger gets the shared not-found page with HTTP 404; a guessed username gets the same page; a blocked pair gets it; `hidden` shows the owner only.
- Visibility changes take effect on the next load, and unfriending a friend loses the Room immediately.
- Customize: switch every theme and see the canvas change while the app shell does not (`data-appearance` and shell tokens stay), and set app Dark while a light Room theme is selected and the reverse.
- Keyboard-only reorder of widgets and Top Friends, with the live-region announcement; persisted order after reload; single vs two-column; a 390px layout check (no horizontal scroll, order collapses).
- Top Friends: add up to the size; unfriend or block removes the person from the Room without reload races; visitors see per-visibility rules.
- Banner upload with the processing state, a 3:1 render, and removal.
- Music: a valid link renders a hostname card with `rel` attributes and no iframe/audio; a `javascript:` or `http:` link is rejected inline.
- Text containing `<script>` in `currently` renders as text, with no element created.
- Stale: two tabs, the second save shows the reload message and a reload restores state.
- Bottom nav at 390px shows My Room and navigates to the owner's Room; the sticky bottom nav is above Room content (`elementFromPoint` at the nav position returns the nav).
- Reduced motion: with `prefers-reduced-motion: reduce`, no running animations in the canvas.
- No trusted control inside `.room-canvas` (DOM assertion).

---

## J. Ordered work breakdown (strictly sequential; each slice ends green and committable)

**Progress (2026-10-20).** Slices 1–2 committed (`a9d8096`). Slices 3–4 built
(uncommitted): `packages/database/src/rooms.ts`, `apps/api/src/rooms/*`,
routes `getMyRoom`, `getRoom`, `updateMyRoom`, `updateMyRoomWidgets`,
`updateMyRoomTopFriends`, client methods, regenerated contract. Deviations:
`room-row.ts` is `room-records.ts`, and one `RoomWriteService` runs the write
protocol for all three sections; the lazy row is created by locking first
(`SELECT … FOR UPDATE`, then `INSERT … ON CONFLICT DO NOTHING RETURNING`
only on a real change, a lost insert race is `ROOM_UPDATE_STALE`), so an
unchanged request on a roomless account writes nothing; `GET /me/room` and
the writes return `ROOM_NOT_FOUND` until the caller has a username; a Top
Friends save takes sorted `lockPair` locks and the friendships `FOR SHARE`
before touching rows (no deadlock with unfriend/block, so no 40P01 retry);
OpenAPI path parameters not ending in `Id` are plain strings. Next: slice 5.

Run `pnpm typecheck`, `pnpm lint` and the unit tests in every slice. Run integration tests through `scripts/with-test-database.mjs`.

1. **Tokens, domain registry and validation (no DB, no routes).**
   - `design/tokens/paldora.tokens.json` (`room.*`, room fonts), `packages/tokens/src/emit.ts`, `scripts/generate.ts`, `tokens.test.ts` (matrix), generated outputs.
   - `packages/domain/src/{rooms.ts,media.ts,errors.ts,index.ts}` (registry, defaults, `room_banner` policy with `cover`, three error codes), `packages/validation/src/rooms.ts` (schemas only, no `routes.ts` entries yet) and unit tests.
   - Depends on nothing. Records any AA nudges (ADR 017 text drafted here).
2. **Migration 0007, schema, media purpose and worker.**
   - `packages/database/src/{schema.ts,rooms.ts,index.ts,schema.integration.test.ts}`, migration `0007_rooms` (generated, then hand-edited: triggers, deferred constraint trigger, composite FK, media checks).
   - `apps/worker/src/media/{attachments.ts,derivatives.ts,derivatives.test.ts}`, `apps/worker/src/maintenance/unattached-media.ts` (+ tests), `job-router.test.ts`, `PURPOSE_UPLOAD_LIMITS` row.
   - Includes all constraint/trigger raw-SQL tests and the friendship/block removal tests. Depends on 1.
3. **Rooms read API.**
   - `apps/api/src/rooms/{room-errors,room-access.service,room-row,room-view.service,room-views,room-top-friends-read,rooms.controller,rooms.module}.ts`, `app.module.ts`, `routes.ts` entries for `getMyRoom` and `getRoom`, the client methods, contract generation.
   - The access matrix, parity, roomless defaults, visitor shaping tests. Depends on 2.
4. **Rooms write API (settings, banner, widgets, Top Friends).**
   - `room-update.service`, `room-banner`, `room-widget.service`, `room-top-friends.service`, routes (`updateMyRoom`, `updateMyRoomWidgets`, `updateMyRoomTopFriends`), client, rate limits.
   - Stale, idempotency, banner, race tests, atomicity tests with `FriendshipService`/`BlockService`, and the ADR 013 matrix rows for Top Friends. After this slice the owner-facing API is functionally complete. Depends on 3.
5. **Room content previews.**
   - `memory-candidates.ts` (`authorId`, `includeOnlyMe`), `MemoryQueryService`/`memory-summary.service.ts` generalization, `room-content.service.ts`, routes `listRoomContent`, `getRoomContentSummary`, `listRoomPhotos`, client.
   - Preview re-filter tests, the block rows, and query-count tests. The existing Memories tests must stay green unchanged (the defaults preserve behavior). Depends on 3 (and benefits from 4 for Top Friends fixtures).
6. **Web: viewing a Room and navigation.**
   - `lib/room-theme.ts` + test, `room-canvas`, widgets, decoration, `rooms/[username]/{layout,page}.tsx`, `rooms/[username]/memories/page.tsx`, `bottom-nav.tsx`, `lib/navigation.ts`, `AppNav`/`AppShell` changes, person/member Room links, `settings/appearance` copy, README, `rooms.spec.ts` with axe on all 14 themes at 390px and desktop. Depends on 3 and 5.
7. **Web: customize.**
   - `room-editor` and sub-forms, theme picker, banner uploader (generalized upload hook), widget and Top Friends editors with keyboard reordering, `actions/rooms.ts`, `rooms/[username]/customize/page.tsx`, stale handling, `room-customize.spec.ts`. Depends on 4 and 6.
8. **Close-out and docs.**
   - ADR 017 (Rooms: lazy rows, closed widget registry, tokens-only themes, trigger-enforced Top Friends removal, derived previews), an ADR 013 addendum (Room rows), updates to `docs/{database,api,security,architecture}.md`, the components README, and the REBUILD_PLAN Phase 7 delivery notes, status row and parity checklist. A "Phase 8 hooks" note records where scoped CSS would plug in (`data-*` attributes, the canvas boundary) without adding any.
   - Verify the parity checkpoint list in REBUILD_PLAN, leaving `legacy/` retirement until one release has shipped, as the plan says.

---

## K. Risks and open questions

**Risks and pitfalls**

- **ROOM_NOT_FOUND parity is the product.** Any divergence (a different message, a 400 for a malformed name, an early return that skips a subquery, a different header or cache behavior) is an existence oracle. Keep one access query and one thrower, and keep the parity test over all denial reasons. Never cache Room pages (dynamic, `no-store`).
- **No `loading.tsx` under `rooms/`**: a streamed fallback makes `notFound()` return 200 (recorded in Phase 6).
- **Strict CSP**: no `style=`, no inline background. Themes are static CSS keyed by `data-*`. The banner is an `<img>`. If someone reaches for inline CSS variables (legacy did), the page breaks in production only. A Playwright run against the production CSP build catches it.
- **AA contrast of legacy presets**: legacy accents and alpha borders fail on several presets. Expect to nudge values (as D7). Budget time in slice 1 and get owner sign-off on the changed hex values.
- **drizzle-kit limits**: composite FK referencing a generated constant column, deferred constraint triggers, and the trigger functions need a spike first (the Phase 6 procedure). The generated `banner_purpose` column must not be listed in any SET NULL action, which is why the FK is NO ACTION.
- **Trigger-based invariants hide behavior**: the unfriend and block triggers delete rows from a table the services do not mention. Mitigation: the tests in slice 2 and 4 name them, ADR 017 documents them, and the read path still re-checks everything.
- **Deadlocks**: size-lowering trims and an unfriend can both delete the same Top Friend rows from different transactions, and lock order is not guaranteed. The window is tiny, PostgreSQL aborts one (40P01), and the web retry is a user re-save. Consider a one-time retry in the service if tests show it.
- **Version precision**: JS dates are millisecond-precision while PostgreSQL is microsecond. Never round-trip `updated_at` through `Date`. Always compare the string from `cursorTimestamp` in SQL. The monotonic trigger prevents equal versions.
- **GET with no side effects**: `GET /me/room` does not create the row. Do not "helpfully" insert on read, or read replicas and caching become a problem later.
- **Posts widget leakage**: the preview must never use a "list user posts" query that skips the viewer's memberships. All content goes through `memoryCandidates`. A reviewer checklist item: grep for any query of `posts` in `rooms/` that does not join the viewer's membership.
- **Top Friends reveal friends of friends**: `visible` shows someone's friends to everyone who can see the Room. Default `friends` and the editor copy mitigate it, and per-viewer block omission avoids pairing a viewer with a blocked person.
- **Cover derivative on odd inputs**: very wide or very tall images, tiny images (cover upscales the display derivative; accept), and `strategy.attention` cost on 40 MP inputs (the existing decode limit holds).
- **Bottom nav and sticky overlap**: bottom padding on `main`, safe-area insets, and keeping Room content below `zIndex.sticky` are verified in e2e at 390px. Five items must fit at 320px.
- **Username reuse**: after a rename, an old bookmark may land on a different person's Room. This is accepted and documented in B12.
- **Next 16 pitfalls from Phase 6 carry over**: Server Actions as `async function` declarations, typed-route string casts, Prettier-reformatted code (use real edits), hermetic integration tests, `exactOptionalPropertyTypes` spreads, worker integration files run serially.
- **Account deletion (Phase 9)** must retire the banner and null `rooms.banner_media_id` before removing the user, because `media_assets.owner_user_id` is RESTRICT.

**Open questions for the owner**

- K1. Confirm B2/B3: `members` means friends or shared active-or-archived Box, not every signed-in user. Is archived-Box membership enough?
- K2. Confirm B7: Top Friends default visibility `friends` (legacy was `visible`), and that Only Me content is never previewed, even to the owner (B1).
- K3. Confirm B14: bottom nav = Home, Boxes, Life Updates, Friends, My Room, with Settings under the avatar and Memories off Home/Life Updates and the Room. Alternative: a "More" page.
- K4. Confirm B10: dropping the legacy `background` override, and B9: nudging legacy preset and accent hex values to meet AA (list the changed values in ADR 017).
- K5. Is no redirect after a username change acceptable for Phase 7 (B12)?
- K6. Should the Room "Memories" widget stay a year-chips-and-link card (recommended), or should it show items directly like the Posts and Life Updates widgets?
- K7. Rate limits: 120/h for Room writes (shared counter) and 20/h for banner reservations are proposals. Adjust if the editor's save pattern needs more.
- K8. Reads have no rate limit (like every other GET). Should `getRoom` get a generous limit (for example 600/h) as defense against scraping by friends-of-friends via `members` visibility?
