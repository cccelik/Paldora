# Security

Paldora is private by default, and authorization is deny-by-default. The
non-negotiable invariants live in [CLAUDE.md §G](../CLAUDE.md). This page
records the controls that are implemented and how each one is verified.

## Implemented controls (Phases 0–2)

| Control                        | Implementation                                                                                                                                                                                                      | Verified by                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Authentication on every route  | Global `AuthGuard`; `@Public()` only for contract routes declared public                                                                                                                                            | `route-inventory.test.ts`, `platform.test.ts`                        |
| Token verification             | `jose` with JWKS; issuer, audience, `exp`, `sub`; ES256/RS256 only                                                                                                                                                  | `access-token-verifier.test.ts` (forged, HS256, `none`, expired)     |
| Non-leaking errors             | One envelope with `requestId`; unknown errors become `INTERNAL_ERROR`, never stack traces or messages                                                                                                               | `platform.test.ts`                                                   |
| Input bounds                   | 256 kB JSON limit; Zod at the boundary; page size ≤ 50                                                                                                                                                              | `platform.test.ts`, conformance fixtures                             |
| Abuse limits                   | Declarative sliding-window limits; fail closed with 503                                                                                                                                                             | `platform.test.ts`, Redis integration test                           |
| CORS                           | Exact `WEB_ORIGIN`, no credentials, explicit methods and headers                                                                                                                                                    | `platform.test.ts`                                                   |
| API headers                    | helmet; CSP `default-src 'none'; frame-ancestors 'none'`                                                                                                                                                            | `platform.test.ts`                                                   |
| Web CSP                        | One per-request nonce policy in `proxy.ts`; no inline script or style in production                                                                                                                                 | `csp.test.ts`, Playwright                                            |
| Web headers                    | nosniff, `X-Frame-Options: DENY`, COOP, restrictive Permissions-Policy (only `camera=(self)`, for camera reactions), HSTS when deployed                                                                             | Playwright                                                           |
| Configuration                  | Zod parsers; HTTPS and no `*_dev_only` credentials in staging and production; errors name keys, never values                                                                                                        | `runtimes.test.ts`                                                   |
| Log privacy                    | Redaction of auth headers, cookies, tokens, passwords, secrets, signed URLs, bodies, and content (three levels deep); paths logged without query strings                                                            | `logger.test.ts`, `platform.test.ts`                                 |
| Bundle secrets                 | `scripts/scan-client-bundle.mjs` in CI                                                                                                                                                                              | CI `validate` job                                                    |
| Principal mapping              | After JWT verification the guard maps `sub` to an internal user on every request: unknown → `ACCOUNT_NOT_PROVISIONED`, non-active → `ACCOUNT_BLOCKED`                                                               | `platform.test.ts`, `identity.integration.test.ts`                   |
| Admin-only provisioning        | Public signup disabled; the service-role key exists only in the provisioning script's environment                                                                                                                   | `runtimes.test.ts`, `provision-user.integration.test.ts`             |
| Signed uploads                 | PUT signed for exact `content-type` and `content-length`, 300 s; completion re-checks owner, status, size, and MIME; single use                                                                                     | `s3-object-storage.integration.test.ts`, `media.integration.test.ts` |
| Image processing               | Sharp `failOn: 'error'`, 40 MP decode limit, allowed decoded formats only, orientation applied, all metadata stripped; raw upload deleted (D2)                                                                      | `derivatives.test.ts`, `worker.integration.test.ts`, full-stack e2e  |
| Signed reads                   | Only display/thumbnail derivatives are signed (900 s); masters and raw uploads never leave the server                                                                                                               | `media.integration.test.ts`                                          |
| Block semantics                | Directional `user_blocks`; one symmetric helper (`hiddenByBlock`/`isBlockedBetween`); pair advisory lock; blocking ends friendships, withdraws requests and Box invitations, never removes Box members              | `block.integration.test.ts` (matrix and races)                       |
| Non-leaking lookups            | Reaching out to someone who blocked you answers `USER_NOT_FOUND`, identical to a username that does not exist; only the blocker hears `USER_BLOCKED`                                                                | `block.integration.test.ts`, Playwright                              |
| Box access                     | One policy service: non-members, former members, deleted Boxes, and guessed IDs all answer `BOX_NOT_FOUND`; members lacking a role get `BOX_ACCESS_DENIED`                                                          | `boxes.integration.test.ts`, Playwright                              |
| Role changes under concurrency | Membership rows locked in user-ID order; simultaneous transfers, removals, and leaves are decided one after the other; exactly one active owner (unique index)                                                      | `boxes.integration.test.ts`                                          |
| Pagination safety              | Opaque cursors validated strictly; microsecond timestamps from PostgreSQL; page size ≤ 50                                                                                                                           | `pagination.test.ts`, integration paging tests                       |
| Realtime stream                | Bearer-authenticated like every route; per-person cap; ends at token expiry; subscriptions follow active memberships so removal stops delivery; payloads are IDs only; clients refetch through normal authorization | `realtime.integration.test.ts`, Playwright (live removal)            |
| Web session                    | Supabase SSR cookies; proxy redirects protected pages without a session (optimistic only); recovery callback allowlist; failures carry no URL details                                                               | `callback-path.test.ts`, `proxy.test.ts`, e2e                        |

## Authorization matrix: Phase 1

| Resource / action                   | Who may                         | Guessed ID / other user             | After suspension  |
| ----------------------------------- | ------------------------------- | ----------------------------------- | ----------------- |
| `GET /me`                           | The signed-in, active user      | n/a (no ID in the route)            | `ACCOUNT_BLOCKED` |
| `PATCH /me/profile`                 | Self; onboarding forward only   | n/a                                 | `ACCOUNT_BLOCKED` |
| `GET /me/username-availability`     | Self; rate-limited (120/h)      | Reveals only taken/free, never who  | `ACCOUNT_BLOCKED` |
| `PUT /me/preferences`               | Self                            | n/a                                 | `ACCOUNT_BLOCKED` |
| `DELETE /me/avatar`                 | Self; idempotent                | n/a                                 | `ACCOUNT_BLOCKED` |
| `POST /media/uploads`               | Self, within the purpose policy | Client cannot choose keys or owners | `ACCOUNT_BLOCKED` |
| `POST /media/uploads/{id}/complete` | Owner, once, while `pending`    | `MEDIA_NOT_FOUND` (same as missing) | `ACCOUNT_BLOCKED` |
| `GET /media/{id}`                   | Owner                           | `MEDIA_NOT_FOUND` (same as missing) | `ACCOUNT_BLOCKED` |

Phase 1 returns no other person's data. Phase 2 does, through the matrix below.

## Authorization matrix: Phase 2

Roles: **O** owner, **A** admin, **M** member, **S** stranger (never a member,
or left/removed, or the Box is gone). Strangers always get `BOX_NOT_FOUND`.
Members without the role get `BOX_ACCESS_DENIED`.

| Action                               | O                    | A                            | M   | S   |
| ------------------------------------ | -------------------- | ---------------------------- | --- | --- |
| Read Box, member list                | ✓                    | ✓                            | ✓   | 404 |
| Rename, archive, restore             | ✓                    | 403                          | 403 | 404 |
| Delete (exact name typed)            | ✓                    | 403                          | 403 | 404 |
| Invite, list or withdraw invitations | ✓                    | ✓                            | 403 | 404 |
| Promote member → admin               | ✓                    | ✓                            | 403 | 404 |
| Demote admin → member                | ✓                    | 403                          | 403 | 404 |
| Change the owner’s role              | 403                  | 403                          | 403 | 404 |
| Transfer ownership                   | ✓                    | 403                          | 403 | 404 |
| Remove a member / admin              | ✓                    | ✓ (members and other admins) | 403 | 404 |
| Remove the owner                     | 403                  | 403                          | 403 | 404 |
| Leave                                | 409 (transfer first) | ✓                            | ✓   | 404 |

Friends and requests:

| Action                          | Who                                       | Everyone else                                                         |
| ------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Send a request                  | Any active person, 20/hour                | Blocked either way → `USER_NOT_FOUND` / `USER_BLOCKED` (blocker only) |
| Accept or decline               | Only the recipient                        | `FRIEND_REQUEST_NOT_FOUND` (same as missing or answered)              |
| Withdraw                        | Only the sender                           | `FRIEND_REQUEST_NOT_FOUND`                                            |
| Remove a friend                 | Either friend                             | `FRIENDSHIP_NOT_FOUND`                                                |
| Answer or read a Box invitation | Only the invitee (list: and Box managers) | `INVITATION_NOT_FOUND`                                                |

Block matrix (ADR 013), tested in both directions, plus unblock and re-block
sequences and concurrent races:

| Thing                                 | When A blocks B (or B blocks A)                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing friendship                   | Deleted; not restored on unblock                                                                                                                  |
| Pending friend request, either way    | Deleted                                                                                                                                           |
| New friend request                    | Blocked person: `USER_NOT_FOUND`. Blocker: `USER_BLOCKED`.                                                                                        |
| Pending Box invitation, either way    | Revoked                                                                                                                                           |
| New Box invitation                    | Same as friend requests                                                                                                                           |
| Accepting an invitation               | `INVITATION_NOT_FOUND`                                                                                                                            |
| Shared Box membership and member list | **Unchanged.** Membership is a Box fact; what each person _authors_ is hidden from the other once content exists (Phases 3, 5, 6 add their rows). |
| Block list                            | Only the blocker’s own blocks, with no avatars                                                                                                    |

Posts (Phase 3, D1 applied):

| Action         | Owner / admin / member                   | Former member, stranger      | Blocked pair (either direction)                  |
| -------------- | ---------------------------------------- | ---------------------------- | ------------------------------------------------ |
| Post in a Box  | ✓ (not if archived: `BOX_ARCHIVED`)      | `BOX_NOT_FOUND`              | n/a                                              |
| Read feeds     | ✓                                        | `BOX_NOT_FOUND` / empty Home | Post becomes a `hidden` item: id, Box, time only |
| Read one post  | ✓                                        | `POST_NOT_FOUND`             | `POST_NOT_FOUND`                                 |
| Edit or delete | Author only; others `POST_ACCESS_DENIED` | `POST_NOT_FOUND`             | Author keeps access to their own post            |

Photos follow post visibility exactly: signed display and thumbnail URLs
appear only on posts the viewer may read, never on hidden (blocked) items, and
masters and raw uploads are never signed. Reserving or claiming a photo needs
an active membership in an open Box; every unusable photo answers
`MEDIA_NOT_FOUND`. Deleting a post or a Box queues deletion of the stored files in
the same transaction.

Deleting erases the text (database check) and keeps a tombstone. Moderators
cannot delete others' posts until Phase 9. Tests: `posts.integration.test.ts`
(roles, archived, guesses, concurrency, paging, both block directions,
unblock then re-block) and the Playwright block scenario.

Known limits: suspended members stay in a Box's counts but vanish from its
lists until Phase 9 defines suspension. Re-requesting after a decline is
allowed and bounded only by the rate limit.

## Authorization matrix: Phase 5 (comments, reactions, notifications)

Every comment check starts from the post's context (membership, Box status,
block with the post author) in `InteractionPolicyService`; comment targets add
the same block rule on the comment's author and its thread root's author.

| Action                        | Owner / admin / member                                                                                            | Archived Box   | Former member, stranger, guessed ID | Block with the post author | Block with the comment (or root) author                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------- | -------------------------- | --------------------------------------------------------------- |
| Read a post's comments        | ✓                                                                                                                 | ✓              | `POST_NOT_FOUND`                    | `POST_NOT_FOUND`           | `hidden` placeholder (id, time); a hidden root hides its thread |
| Comment or reply              | ✓ (300/h)                                                                                                         | `BOX_ARCHIVED` | `POST_NOT_FOUND`                    | `POST_NOT_FOUND`           | Reply target hidden → `COMMENT_NOT_FOUND`                       |
| Read one comment, replies     | ✓                                                                                                                 | ✓              | `COMMENT_NOT_FOUND`                 | `COMMENT_NOT_FOUND`        | `COMMENT_NOT_FOUND`                                             |
| Edit or delete own comment    | ✓ (delete idempotent)                                                                                             | `BOX_ARCHIVED` | `COMMENT_NOT_FOUND`                 | `COMMENT_NOT_FOUND`        | n/a                                                             |
| Edit or delete someone else's | `COMMENT_ACCESS_DENIED` (no moderation until Phase 9)                                                             | `BOX_ARCHIVED` | `COMMENT_NOT_FOUND`                 | `COMMENT_NOT_FOUND`        | `COMMENT_NOT_FOUND`                                             |
| Counts on posts and comments  | Viewer-relative: blocked people's comments and reactions are not counted                                          | ✓              | n/a                                 | n/a                        | not counted                                                     |
| React, change, remove (post)  | ✓ (1,000/h, shared with comments)                                                                                 | `BOX_ARCHIVED` | `POST_NOT_FOUND`                    | `POST_NOT_FOUND`           | n/a                                                             |
| React (comment)               | ✓ (1,000/h, shared)                                                                                               | `BOX_ARCHIVED` | `COMMENT_NOT_FOUND`                 | `POST_NOT_FOUND`           | `COMMENT_NOT_FOUND`                                             |
| Camera reaction               | Claim a ready `reaction_image` that is yours, from this post's Box, unused (`MEDIA_NOT_FOUND`, `MEDIA_NOT_READY`) | `BOX_ARCHIVED` | `POST_NOT_FOUND`                    | `POST_NOT_FOUND`           | n/a                                                             |
| List a post's reactions       | ✓; camera images signed only here and in summaries                                                                | ✓              | `POST_NOT_FOUND`                    | `POST_NOT_FOUND`           | Reactor omitted (no placeholder)                                |
| Reserve a camera upload       | Active member of an open Box (120/h, `camera-upload`, fail-closed)                                                | `BOX_ARCHIVED` | `BOX_NOT_FOUND`                     | n/a                        | n/a                                                             |
| Set reaction presets          | Self only (120/h)                                                                                                 | n/a            | n/a                                 | n/a                        | n/a                                                             |
| List notifications, count     | Own rows only, visibility rechecked on every read                                                                 | still visible  | Left or removed: hidden             | Hidden (either direction)  | Hidden when the actor is in a block with you (either direction) |
| Mark one / all read           | Own visible rows only (600/h, `notification-read`); idempotent                                                    | ✓              | `NOTIFICATION_NOT_FOUND`            | `NOTIFICATION_NOT_FOUND`   | `NOTIFICATION_NOT_FOUND`                                        |

Block matrix rows (ADR 013), tested in both directions with unblock and
re-block in `block.integration.test.ts`: comments become neutral placeholders,
replies inside your thread become placeholders, reactions and camera previews
are omitted and not counted, hidden comments cannot be fetched or replied to,
and a comment racing a block never becomes visible to the blocker. Reaction
block rows (`interactions/reactions.integration.test.ts`): reacting across a
block with the post author answers `POST_NOT_FOUND` in both directions; with
the comment's or its root's author `COMMENT_NOT_FOUND`; blocked reactors are
omitted from `listPostReactions` and from counts and previews.

Races decided by the database: an edit racing a delete (`UPDATE … WHERE
status = 'active'`), a comment racing an archive (the Box row is held `FOR
SHARE`), and reply depth (the composite self-reference). Deleting a post
erases its comments, reactions, notifications, and camera images in the same
transaction. Tests: `interactions/comments.integration.test.ts`.

Reactions are set-state under a per-person, per-target advisory lock, with the
primary key as the final word: five simultaneous sets by one person end as one
row and one activity event. Two reactions racing for one camera capture are
decided by the unique index on `post_reactions.media_asset_id` (the loser gets
`MEDIA_NOT_FOUND`). Replacing or removing a camera reaction tombstones its
capture and queues deletion of every object in the same transaction. The
camera-upload limit lives in `MediaUploadService` (the purpose is in the
body, so a second `@RateLimit` on the route cannot express it) and uses the
guard's fail-closed helper `assertWithinLimit`. The web app sends
`Permissions-Policy: camera=(self)` (microphone, geolocation, and
browsing-topics stay off) so `getUserMedia` works on Paldora's own pages and
in no embedded frame.

**Camera capture (web).** The browser asks for the camera only after the
person opens the camera dialog on a post, and only in a secure context. The
frame is drawn to a canvas and re-encoded as JPEG (longest edge 1280 px,
quality 0.88), which drops any device metadata before upload; the worker
strips again. Media tracks stop on capture, on close, on unmount, and when the
page is hidden; preview object URLs are revoked. There is no file picker, so
only a live capture can become a camera reaction. A closed dialog never sends
late: every step checks that the capture is still current, and an unsent
upload is reaped. The reactions page signs camera thumbnails only through
`listPostReactions`, after its read check.

Activity events (`comment.created`, `post.reaction.set`,
`comment.reaction.set`) hold IDs only, are written in the same transaction as
their cause, and carry the notification's dedupe key, so a retry, a changed
emoji, or a re-react after removal never records a second one.

**Notifications.** The worker's projector turns each event into at most one
notification for the person addressed, in one set-based statement that skips
self-actions, inactive recipients, recipients no longer in the post's Box, a
block in either direction (the shared `hiddenByBlock` fragment, with the
recipient as the viewer), a post or comment no longer active, and a reaction
already removed. Rows store IDs only. Every read (list, unread count,
mark-one) applies `notification-visibility.ts`: own row, post active, active
membership in its Box, actor active with a public face and not in a block
either way, target still live (comment active; the actor's reaction row still
exists). A block after creation therefore hides the notification at once, and
unblocking restores it. Someone else's ID, a hidden one, and a missing one all
answer `NOTIFICATION_NOT_FOUND`; mark-all touches only visible rows. Display
data (face, Box name, emoji, camera thumbnail) is joined live and the
thumbnail is signed only after these checks. Realtime hints carry IDs only:
`notification.created` (`notificationId`, `postId`) goes to the recipient's
user channel after the projection commits, `notifications.changed` (no IDs)
to the reader's own channel after a mark. Suspended recipients are refused by
the guard (`ACCOUNT_BLOCKED`). Tests: `notifications/notifications.integration.test.ts`
(paging, count cap, mark one/all, other people's IDs, the visibility matrix,
double mark-read, realtime), the notification rows in
`block.integration.test.ts` (both directions, unblock, re-block), and
`apps/worker/src/activity/projector.integration.test.ts` (every type, every
skip rule, dedupe, concurrent projectors, poison events, crash before commit,
Redis down at publish, retention).

## Authorization matrix: Phase 6 (Life Updates and Memories; slices 1–5)

A Life Update is visible to a viewer when it is active, no block exists
between the viewer and the author (either direction, the shared
`hiddenByBlock`), and either it is the viewer's own Only Me update or the
viewer is an **active member now** of at least one delivery Box whose backing
post is active. This holds for the author too: an author who left every
delivery Box no longer sees it. `loadContexts` (one query joining the viewer's
active membership) is the only definition of what a viewer reaches; responses
list only those Boxes, never the others.

| Action                          | Author                                                                            | Member of a delivery Box             | Archived Box                       | Former member, stranger, guessed ID           | Block with the author (either direction) |
| ------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------- | --------------------------------------------- | ---------------------------------------- |
| Publish to Boxes                | Active member of every named Box (30/h)                                           | n/a                                  | Whole publish fails `BOX_ARCHIVED` | Any non-member Box: `BOX_NOT_FOUND` (no hint) | n/a                                      |
| Publish Only Me                 | ✓                                                                                 | n/a                                  | n/a                                | n/a                                           | n/a                                      |
| Read detail                     | ✓ (needs an active delivery Box, or Only Me)                                      | ✓, contexts for their own Boxes only | ✓ read-only (`canInteract` false)  | `LIFE_UPDATE_NOT_FOUND`                       | `LIFE_UPDATE_NOT_FOUND`                  |
| Read someone else's Only Me     | n/a                                                                               | `LIFE_UPDATE_NOT_FOUND`              | n/a                                | `LIFE_UPDATE_NOT_FOUND`                       | `LIFE_UPDATE_NOT_FOUND`                  |
| List mine                       | Own active updates only; unreachable ones dropped                                 | n/a                                  | ✓                                  | n/a                                           | n/a (own content)                        |
| Edit (sections, photos)         | ✓ (30/h); `BOX_ARCHIVED` once every delivery Box they are in is archived          | `LIFE_UPDATE_ACCESS_DENIED`          | allowed while one Box is open      | `LIFE_UPDATE_NOT_FOUND`                       | `LIFE_UPDATE_NOT_FOUND`                  |
| Home feed card                  | ✓ once, a context per own delivery Box; Only Me never in a feed                   | ✓ once, own Boxes' contexts only     | ✓ read-only                        | absent                                        | one neutral `hidden` placeholder         |
| Box feed card                   | ✓ that Box's context only                                                         | ✓ that Box's context only            | ✓ read-only                        | `BOX_NOT_FOUND` for the feed                  | `hidden` placeholder (that Box's post)   |
| `PATCH`/`DELETE` a backing post | `POST_MANAGED_BY_LIFE_UPDATE` (409)                                               | `POST_ACCESS_DENIED`                 | same                               | `POST_NOT_FOUND`                              | `POST_NOT_FOUND`                         |
| Delete                          | ✓, idempotent 204 (30/h), allowed in archived Boxes                               | `LIFE_UPDATE_ACCESS_DENIED`          | allowed                            | `LIFE_UPDATE_NOT_FOUND`                       | `LIFE_UPDATE_NOT_FOUND`                  |
| Change the audience             | Impossible: no route; the database refuses it (triggers)                          | same                                 | same                               | same                                          | same                                     |
| Comment or react on a delivery  | Phase 5 routes on the context's `postId`, unchanged                               | ✓                                    | `BOX_ARCHIVED`                     | `POST_NOT_FOUND`                              | `POST_NOT_FOUND`                         |
| Reserve a `life_update_image`   | Any signed-in user (120/h `life-update-upload`, fail-closed, user-scoped, no Box) |                                      |                                    |                                               |                                          |
| Claim photos                    | Ready, yours, `life_update_image`, unused (`MEDIA_NOT_FOUND` / `MEDIA_NOT_READY`) |                                      |                                    |                                               |                                          |

Block rows (both directions, and unblock restoring access) are tested in
`life-updates/life-updates.integration.test.ts`, and the feed rows (Home
deduped to one placeholder, Box feed placeholder per Box, permalink and
backing posts not found, nothing naming the author, content, photos, or
Boxes, own Only Me unaffected, unblock and re-block) are in the ADR 013
matrix in `social/block.integration.test.ts`. Edit authorization is in
`life-update-edit.integration.test.ts`; feeds, backing-post guards, Box
deletion, paging, and the fixed query count in
`life-update-feeds.integration.test.ts`.

Races decided by the database or by locks:

- **Audience.** The delivery rows are the audience. Triggers allow inserting
  deliveries only in the transaction that created the Life Update, forbid
  updating them or deleting them directly (only a Box-deletion cascade), and
  freeze `audience`, `author_user_id`, and `created_at`; deferred triggers
  require a delivery per Life Update and per backing post at commit. Box
  count (≤ 20), distinct Boxes, one delivery per backing post, and the
  delivery's audience/author/Box/post agreement are keys and checks.
- **Publishing** checks the author's active membership in every Box, then
  holds every Box row `FOR SHARE` in ascending ID order, so a Box cannot be
  archived mid-publish and concurrent publishes cannot deadlock.
- **Photos** are locked `FOR UPDATE` while claimed (`media/photo-claim.ts`,
  shared with posts); two publishes racing for one photo are decided by the
  unique `life_update_media.media_asset_id` (the loser gets
  `MEDIA_NOT_FOUND` and leaves no rows).
- **Edit** takes the same Life Update row lock as delete, so edits and
  deletes serialize (an edit after a delete is `LIFE_UPDATE_NOT_FOUND`; a
  delete after an edit erases the edited content and any photo it claimed).
  Photos in the new list are locked and claimed like at publish time
  (another Life Update's photo is `MEDIA_NOT_FOUND`; the unique index decides
  a race); dropped ones are retired in the same transaction.
- **Box deletion** locks the Life Updates delivered in that Box (ID order)
  after the Box row, then tombstones those with no other Box in a separate
  statement, so deleting two of a Life Update's Boxes at once serializes and
  the second tombstones it (tested); the worker sweep is the safety net.
- **Delete** locks the Life Update row `FOR UPDATE`, then every backing post
  `FOR UPDATE`, tombstones them, and erases all interactions, notifications,
  camera images, and photos in the same transaction. Comment and reaction
  writes now also hold the post row `FOR SHARE` (`InteractionPolicyService`),
  so a write racing a delete either commits first and is erased, or waits and
  finds the post gone; nothing survives on a deleted delivery (raced in tests
  for posts and Life Updates alike).

### Memories (slice 5)

Memories are derived on every request from one candidate query
(`memories/memory-candidates.ts`) shared by the page and the summary; nothing
is copied or stored. The candidates start from the viewer's **active
memberships now**, join active posts, keep a backing post only when its Life
Update is active, and drop anyone in a block relationship with the viewer
through the shared `hiddenByBlock`; Only Me comes from a second branch
restricted to `author_user_id = viewer`. The page's posts and Life Updates
are then loaded through `PostPageService.itemsForPosts` and
`LifeUpdateViewService.byIds`, which authorize again, so anything that
changed in between is dropped rather than shown.

| Viewer / situation                          | Personal Memories                                             | Box Memories                                     | Summary counts      |
| ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ | ------------------- |
| Author                                      | own posts, Life Updates once (a context per own Box), Only Me | that Box's content, its context only, no Only Me | match the list      |
| Member of a delivery Box                    | ✓, contexts for own Boxes only; never others' Only Me         | ✓ that Box's context only                        | match               |
| Archived Box                                | ✓ read-only (`canInteract` false)                             | ✓ read-only                                      | counted             |
| Former member (left) or removed member      | that Box's content gone at once                               | `BOX_NOT_FOUND`                                  | not counted         |
| Stranger, guessed Box ID                    | nothing                                                       | `BOX_NOT_FOUND`                                  | nothing             |
| Block, viewer blocked the author            | **omitted** (no placeholder, decision 15)                     | omitted                                          | not counted         |
| Block, author blocked the viewer            | omitted                                                       | omitted                                          | not counted         |
| Unblock                                     | content returns                                               | returns                                          | counted again       |
| Deleted post or Life Update                 | gone at once                                                  | gone                                             | not counted         |
| Malformed year, month, type, cursor, Box ID | `VALIDATION_FAILED`                                           | `VALIDATION_FAILED`                              | `VALIDATION_FAILED` |

Months are UTC, bounded with `make_timestamptz(..., 'UTC')` on both ends
(never `+ interval`, which PostgreSQL computes in the session time zone).
All of this is tested in `memories/memories.integration.test.ts`, including
both block directions, UTC edges (`23:59:59.999999` on Dec 31 and Feb 29
against midnight), identical timestamps across pages, deletion removing an
item at once, and a fixed query count per page. The routes are reads and
carry no rate limit.

## Assumptions

- TLS terminates at the deployment edge, which enforces HTTPS.
- PostgreSQL and Redis are reachable only on private networks. Locally, they
  bind to loopback.
- Secrets come from the platform's secret manager. `.env` is local only and
  never committed.
- Buckets are private, and clients only ever receive short-lived signed URLs.

## Per-feature requirement

Before implementation, every feature documents and tests its authorization
matrix:

- create, read, update, and delete rights;
- guessed IDs;
- blocks in either direction;
- former members;
- archived and deleted states;
- suspension;
- indistinguishable absence and denial.

Never claim encryption properties that are not implemented. End-to-end
encrypted Boxes require their own threat model and an external review.
