# ADR 017: Rooms are lazy rows with a closed registry, token-only themes, and database-enforced Top Friends

Status: accepted; Phase 7 in implementation (2026-10-20). Slices 1–2 (tokens,
registry, validation, migration `0007_rooms`, banner media purpose) are
built; slice 8 completes this record with the API and web outcomes. Plan:
[phase-7-rooms.md](../plans/phase-7-rooms.md). Builds on
[ADR 005](005-design-tokens-and-styling.md) (tokens),
[ADR 011](011-media-pipeline.md) (media), [ADR 013](013-directional-blocks.md)
(blocks), and [ADR 016](016-life-updates-and-memories.md) (derived
Memories).

## Context

A Room (`/rooms/[username]`) is a person's customizable profile: MySpace-
style identity on a private network. It is the most expressive surface in
Paldora and the easiest place to leak: a Room shows who someone's friends
are, previews their content, and accepts styling choices. The legacy build
let a Room's `members` tier reach every signed-in user, stored themes as
inline CSS variables (which the strict nonce CSP forbids), made the stale-
save check optional, removed Top Friends in two services, and shipped
accent and border colors that fail WCAG AA on several presets.

## Decision

- **Lazy rows.** A Room row is created on the first save
  (`INSERT … ON CONFLICT DO NOTHING`, then `FOR UPDATE`), never on read. A
  missing row is the default configuration (`DEFAULT_ROOM`, equal to the
  column defaults): visibility `friends`, preset `cream_paper`, two columns,
  default widgets, no overrides. No backfill; migration 0007 is expand-only.
- **Visibility tiers nest.** `hidden` = owner only; `friends` = owner and
  accepted friends; `members` = friends plus people who share an active
  membership in a non-deleted (active or archived) Box with the owner. A
  block in either direction hides a Room at every tier. Every denial is one
  `ROOM_NOT_FOUND` (missing, hidden, inaccessible, blocked, suspended or
  not-yet-onboarded owner, renamed username), byte-identical.
- **A closed registry.** `packages/domain/src/rooms.ts` holds ids, labels,
  schemes, default accent and decoration, the 7 widget types, layouts,
  visibilities, Top Friends sizes (4/8/12), limits, and defaults. The
  database CHECKs and the Zod enums carry the same lists, and tests insert
  every domain value and reject any other. A Room stores per widget only
  `enabled`, `placement`, and `position`, always as all seven rows or none
  (a deferred trigger). There is no widget config, free-text title, or
  unknown type, and no field that can carry CSS, HTML, script, a font or
  background URL, or a color. The legacy independent `background` override
  is dropped (it could pair a canvas with unreadable text).
- **Themes are tokens, emitted as static CSS.** `room.preset.*` (canvas,
  surface, text, textMuted, border; solid colors), `room.accent.*`
  (`onLight`/`onDark`), and `room.font.*` (five system stacks, no font URLs)
  live in `design/tokens/paldora.tokens.json`. The generator writes
  `room-themes.css`, where every rule is scoped to
  `.room-canvas[data-room-theme|scheme|accent|font]`, plus Swift and
  Kotlin constants. The web sets only `data-*` attributes, so no inline style
  is needed and no color is ever computed from input. Room tokens are kept
  out of the shell's `tokens.css`. Accents are two-sided: the preset's scheme
  picks the side, so all 8 accents work on all 14 presets.
- **AA is a generated test.** The 14 × 8 matrix requires text and muted text
  ≥ 4.5:1 and border, accent, and focus (drawn in the text color) ≥ 3:1 on
  canvas and surface. Legacy values were the seed; every value that failed
  was nudged in HSL lightness only (hue and saturation kept), and every
  change is listed below.
- **Top Friends removal lives in the database.** A BEFORE INSERT/UPDATE
  guard on `room_top_friends` admits only an accepted, active friend with no
  block either way at a position below the Room's size, reading the Room and
  friendship rows `FOR SHARE`. AFTER triggers on `friendships` (delete, or
  leaving `accepted`) and `user_blocks` (insert) delete the pair's entries in
  both directions in the same transaction. Unfriend and block therefore
  serialize with an add in either order, for every code path (services,
  admin tools, cascades, SQL), and `FriendshipService`/`BlockService` need no
  Room code. Lowering the size trims entries in the same statement. The read
  path re-checks friendship, status, and blocks anyway. The guard uses
  `paldora.is_blocked_between`, the SQL twin of `hiddenByBlock` (tested to
  agree).
- **Strict, monotonic versions.** `expectedUpdatedAt` is required (nullable
  for a never-saved Room) on every write. A trigger sets `updated_at` to
  `greatest(clock_timestamp(), old + 1 µs)` on every update, so no two saves
  share a version, and the API compares the microsecond string, never a
  JavaScript `Date`.
- **Banner as a media purpose.** `room_banner` is user-scoped with avatar
  limits; the master keeps the whole image (2560, inside) and display and
  thumbnail are 3:1 attention-cropped covers (1600×533, 640×213), metadata
  stripped. A composite foreign key `(banner_media_id, user_id,
banner_purpose)` → `media_assets (id, owner_user_id, purpose)` makes a
  banner the owner's own `room_banner` asset in the database, and a partial
  unique index makes it serve one Room. The API claims it in the Room save;
  the reaper expires an unclaimed ready banner after 24 h. Uploads are
  limited to 20 reservations per hour, failing closed.
- **Previews are derived** from the Memories candidate builder with an
  author filter (slices 3–5), so a Room never widens access.

### Changed values (AA nudges)

Preset canvas, surface, and text are the legacy values unchanged; all pass.
`textMuted` and `border` are new (legacy had no muted text and drew borders
as the accent at 40% alpha, which is not a solid color and failed 3:1).

Accents (legacy had one value per key). "min" is the lowest ratio against
every canvas and surface of that scheme (9 light, 5 dark presets).

| Accent   | Legacy  | Legacy min (light) | `onLight` (new) | min  | Legacy min (dark) | `onDark` (new)            | min  |
| -------- | ------- | ------------------ | --------------- | ---- | ----------------- | ------------------------- | ---- |
| gold     | #B47A22 | 2.01               | #8C5F1A         | 3.06 | 2.69              | #C4933F (Obsidian Gold's) | 3.55 |
| lavender | #8C63BD | 2.49               | #7F51B5         | 3.08 | 2.17              | #A281CA                   | 3.05 |
| ocean    | #168CA0 | 2.18               | #127282         | 3.07 | 2.48              | #7FA4D8 (Tumblr 2014's)   | 3.84 |
| daisy    | #DB8D16 | 1.47               | #915D0F         | 3.06 | 3.66              | #DB8D16 (kept)            | 3.66 |
| pink     | #C64FA1 | 2.29               | #AF398A         | 3.06 | 2.35              | #DC49FF (Neon Night's)    | 3.01 |
| emerald  | #2D8D55 | 2.28               | #267647         | 3.07 | 2.36              | #34A362                   | 3.07 |
| cyan     | #00A9C7 | 1.54               | #007287         | 3.07 | 3.51              | #00E5FF (Cyberpunk's)     | 6.38 |
| crimson  | #A23C2D | 3.58               | #A23C2D (kept)  | 3.58 | 1.51              | #D57566                   | 3.07 |

Where a dark preset's own legacy accent already met 3:1 on every dark preset,
it became that key's `onDark` value, so Obsidian Gold, Neon Night, Tumblr
2014, and Cyberpunk keep their exact legacy accent.

Each preset's own accent (legacy stored a per-preset accent; now the preset
names a default accent key). Ratio = minimum against that preset's canvas
and surface.

| Preset             | Legacy accent | Ratio | Default key → value | Ratio |
| ------------------ | ------------- | ----- | ------------------- | ----- |
| Obsidian Gold      | #C4933F       | 6.16  | gold → #C4933F      | 6.16  |
| Cream Paper        | #B47A22       | 3.22  | gold → #8C5F1A      | 4.92  |
| Lavender Dream     | #8C63BD       | 3.74  | lavender → #7F51B5  | 4.63  |
| Ocean Glow         | #168CA0       | 3.50  | ocean → #127282     | 4.93  |
| Daisy Day          | #DB8D16       | 2.43  | daisy → #915D0F     | 5.04  |
| Neon Night         | #DC49FF       | 5.13  | pink → #DC49FF      | 5.13  |
| Y2K Glitter        | #AD65D5       | 3.16  | lavender → #7F51B5  | 4.72  |
| Dark Academia      | #A7763E       | 3.70  | gold → #C4933F      | 5.30  |
| Frutiger Aero      | #2D9D4D       | 3.13  | emerald → #267647   | 5.02  |
| Tumblr 2014        | #7FA4D8       | 3.84  | ocean → #7FA4D8     | 3.84  |
| Retro Windows      | #000080       | 8.80  | cyan → #007287      | 3.07  |
| Cyberpunk          | #00E5FF       | 11.48 | cyan → #00E5FF      | 11.48 |
| Minimal Editorial  | #A23C2D       | 5.98  | crimson → #A23C2D   | 5.98  |
| Polaroid Scrapbook | #B85542       | 3.74  | crimson → #A23C2D   | 5.12  |

New muted text and borders (minimum against canvas and surface):

| Preset             | Text    | `textMuted` | min  | `border` | min  |
| ------------------ | ------- | ----------- | ---- | -------- | ---- |
| Obsidian Gold      | #F7EFD9 | #8D887A     | 4.82 | #726C5F  | 3.27 |
| Cream Paper        | #241D16 | #6F685D     | 4.86 | #8B857C  | 3.22 |
| Lavender Dream     | #2E2140 | #6B607C     | 4.83 | #867D92  | 3.23 |
| Ocean Glow         | #102F39 | #526E75     | 4.81 | #74898F  | 3.24 |
| Daisy Day          | #3A3115 | #746B4A     | 4.83 | #8F8872  | 3.21 |
| Neon Night         | #F8F2FF | #8C8897     | 4.85 | #716982  | 3.22 |
| Y2K Glitter        | #352044 | #71607E     | 4.81 | #8C7C94  | 3.26 |
| Dark Academia      | #F1DFBD | #A0937B     | 4.85 | #817460  | 3.21 |
| Frutiger Aero      | #12374A | #4D6F7E     | 4.85 | #728B96  | 3.23 |
| Tumblr 2014        | #F5F7FB | #B1B6C0     | 4.83 | #8A94A4  | 3.21 |
| Retro Windows      | #101010 | #4A4A4A     | 4.87 | #656565  | 3.20 |
| Cyberpunk          | #F4FF52 | #878A38     | 4.81 | #706B3B  | 3.24 |
| Minimal Editorial  | #151515 | #6D6C6A     | 4.81 | #898989  | 3.21 |
| Polaroid Scrapbook | #292118 | #696053     | 4.85 | #827C75  | 3.24 |

`textMuted` is the text color mixed toward the canvas as far as 4.8:1
allows; `border` is the text mixed toward the surface as far as 3.2:1 allows
(a small margin above the minimums). The owner signs off on these values
(open question K4 in the plan).

## Rejected alternatives

- **Create a Room row at provisioning or on first read.** A backfill and a
  write on GET, for no gain: the defaults are a constant.
- **Legacy `members` = every signed-in user.** Effectively public to the
  network, against "private by default". A network-wide tier would be a
  fourth value added deliberately later.
- **Themes as inline CSS variables (legacy).** Requires `style=` attributes,
  which the production nonce CSP forbids, and computes colors at render time.
- **Theme colors in `packages/domain`.** Native apps need the same values;
  tokens are the single source (ADR 005), and the domain keeps only ids.
- **One accent value per key.** No single value meets 3:1 on both the
  lightest and darkest presets for most hues.
- **Removing Top Friends in `FriendshipService` and `BlockService`.** Two
  places to forget, and nothing covers admin tools, cascades, or SQL; the
  races also need the same lock order in both. Triggers make it one rule.
- **Optional `expectedUpdatedAt` (legacy).** Any client could skip the check.
- **`updated_at` from the application clock.** Millisecond precision and
  clock skew can produce equal or backwards versions.
- **Dedicated banner routes (legacy had four).** `bannerMediaId` on
  `PATCH /me/room` covers attach and remove under the same stale check.
- **A SET NULL banner key.** The generated purpose column cannot be nulled,
  and assets are tombstoned, never deleted.

## Consequences

- Trigger-based invariants hide behavior from the services; the triggers are
  named in tests, `docs/database.md`, and here, and the read path re-checks.
- Lowering the size and an unfriend can delete the same rows concurrently;
  PostgreSQL may abort one (40P01) and the user re-saves.
- **Phase 9 checklist:** account deletion must null `rooms.banner_media_id`
  and retire the banner through the outbox before deleting the user
  (`media_assets.owner_user_id` is RESTRICT); a moderator hide adds one
  condition to the Room access query.
- Swift and Kotlin receive all room constants automatically.

## Revisit when

- Phase 8 adds scoped custom CSS or sandboxed widgets (after a dedicated
  security review): they plug into the `.room-canvas` boundary and `data-*`
  attributes, never the shell.
- A user-chosen color is requested: it would need a contrast-checked palette
  generator, not free input.
- A new widget type is needed: domain entry, a migration widening
  `room_widgets_type_check`, and a component.
- Discovery or a network-wide visibility tier becomes a product goal.
