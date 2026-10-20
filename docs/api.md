# API

REST under `/api/v1`. The machine-readable contract is
[`contracts/openapi.json`](../contracts/openapi.json), generated from
`packages/validation/src/routes.ts`. This page explains the conventions; the
generated document lists the operations.

## Conventions

- **Authentication.** `Authorization: Bearer <Supabase access token>` on every
  route except those the contract declares `public`.
- **Errors.** Every non-2xx response has this shape:

  ```json
  { "error": { "code": "NOT_FOUND", "message": "…", "requestId": "…" } }
  ```

  - Branch on `code` and display `message`.
  - Treat unknown codes as generic failures.
  - Resources that must not be probed share one code for "missing" and "not
    yours", such as `BOX_NOT_FOUND`.

- **Global codes:**
  - `AUTHENTICATION_REQUIRED` (401)
  - `VALIDATION_FAILED` (400)
  - `NOT_FOUND` (404)
  - `METHOD_NOT_ALLOWED` (405)
  - `PAYLOAD_TOO_LARGE` (413)
  - `RATE_LIMITED` (429, with `Retry-After`)
  - `RATE_LIMIT_UNAVAILABLE` (503)
  - `SERVICE_UNAVAILABLE` (503)
  - `INTERNAL_ERROR` (500)
- **Correlation.** Every response carries `x-request-id`. Clients may send a
  safe ID (`[A-Za-z0-9._-]{1,128}`); otherwise one is generated.
- **Pagination.** Keyset only, using `?limit=1..50&cursor=<opaque>`. The
  response is `{ items, nextCursor }`. Never construct or parse a cursor.
- **Writes.**
  - PATCH is partial and server-authoritative.
  - Setting a state is idempotent (`PUT`), either full replacement or an
    explicit `null` to clear.
  - Concurrent edits use `expectedUpdatedAt` and fail with a resource-specific
    `*_STALE` code.
- **Compatibility.** Changes are additive only within `/api/v1`. See
  [contracts/README.md](../contracts/README.md).

## Operations

| Operation                 | Route                                         | Access        | Rate limit | Notes                                                                                                                                   |
| ------------------------- | --------------------------------------------- | ------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `getLiveness`             | `GET /health`                                 | public        | none       | No I/O                                                                                                                                  |
| `getReadiness`            | `GET /health/ready`                           | public        | none       | PostgreSQL + Redis; `SERVICE_UNAVAILABLE`                                                                                               |
| `getCurrentUser`          | `GET /me`                                     | authenticated | none       | Account, profile (signed avatar URLs, `avatarProcessing`), preferences                                                                  |
| `updateProfile`           | `PATCH /me/profile`                           | authenticated | 60/h       | `USERNAME_UNAVAILABLE`, `ONBOARDING_INCOMPLETE`, `INVALID_ONBOARDING_TRANSITION`                                                        |
| `getUsernameAvailability` | `GET /me/username-availability?username=`     | authenticated | 120/h      | Advisory; reasons `invalid`, `reserved`, `taken`                                                                                        |
| `updatePreferences`       | `PUT /me/preferences`                         | authenticated | 120/h      | Idempotent replacement of `{ appearance }`; returns all preferences                                                                     |
| `setReactionPresets`      | `PUT /me/reaction-presets`                    | authenticated | 120/h      | `{ presets: [5 distinct single emoji] }`; idempotent; returns all preferences                                                           |
| `deleteAvatar`            | `DELETE /me/avatar`                           | authenticated | 60/h       | Idempotent; stored files deleted by the worker                                                                                          |
| `createMediaUpload`       | `POST /media/uploads`                         | authenticated | 480/h      | Returns a signed PUT (300 s) bound to type and size. `STORAGE_UNAVAILABLE`. Camera captures (`reaction_image`) also count against 120/h |
| `completeMediaUpload`     | `POST /media/uploads/{mediaAssetId}/complete` | authenticated | 480/h      | Single use. `MEDIA_NOT_FOUND`, `…_ALREADY_HANDLED`, `…_EXPIRED`, `…_MISMATCH`                                                           |
| `getMediaAsset`           | `GET /media/{mediaAssetId}`                   | authenticated | none       | Owner-only status; `MEDIA_NOT_FOUND` for anyone else                                                                                    |

Every authenticated route can also return `ACCOUNT_NOT_PROVISIONED` (a valid
identity with no Paldora account) and `ACCOUNT_BLOCKED` (a suspended or
deleted account), both 403.

### Friends, blocks, and Boxes

| Operation              | Route                                    | Rate limit | Notes                                                                                                       |
| ---------------------- | ---------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `listFriends`          | `GET /friends`                           | none       | Paged                                                                                                       |
| `listFriendRequests`   | `GET /friend-requests`                   | none       | Incoming and outgoing, see `direction`                                                                      |
| `createFriendRequest`  | `POST /friend-requests`                  | 20/h       | `USER_NOT_FOUND`, `USER_BLOCKED`, `CANNOT_FRIEND_SELF`, `ALREADY_FRIENDS`, `FRIEND_REQUEST_ALREADY_PENDING` |
| `acceptFriendRequest`  | `POST /friend-requests/{id}/accept`      | exempt     | Recipient only                                                                                              |
| `declineFriendRequest` | `POST /friend-requests/{id}/decline`     | exempt     | 204                                                                                                         |
| `cancelFriendRequest`  | `DELETE /friend-requests/{id}`           | exempt     | Sender only; 204                                                                                            |
| `removeFriend`         | `DELETE /friends/{userId}`               | exempt     | 204; `FRIENDSHIP_NOT_FOUND`                                                                                 |
| `listBlocks`           | `GET /blocks`                            | none       | Your own blocks only                                                                                        |
| `createBlock`          | `POST /blocks`                           | 60/h       | Idempotent                                                                                                  |
| `removeBlock`          | `DELETE /blocks/{userId}`                | exempt     | Idempotent; 204; removes only your own block                                                                |
| `listBoxes`            | `GET /boxes`                             | none       | Paged                                                                                                       |
| `createBox`            | `POST /boxes`                            | 20/h       |                                                                                                             |
| `getBox`               | `GET /boxes/{boxId}`                     | none       | `BOX_NOT_FOUND` for every kind of non-access                                                                |
| `updateBox`            | `PATCH /boxes/{boxId}`                   | 60/h       | Owner: name, `status` `active`/`archived`                                                                   |
| `deleteBox`            | `DELETE /boxes/{boxId}?confirmName=`     | 20/h       | Owner; 204; `BOX_DELETE_CONFIRMATION_MISMATCH`                                                              |
| `listBoxMembers`       | `GET /boxes/{boxId}/members`             | none       | Paged                                                                                                       |
| `updateBoxMember`      | `PATCH /boxes/{boxId}/members/{userId}`  | 120/h      | Role `admin`/`member`                                                                                       |
| `removeBoxMember`      | `DELETE /boxes/{boxId}/members/{userId}` | 120/h      | 204                                                                                                         |
| `leaveBox`             | `DELETE /boxes/{boxId}/members/me`       | exempt     | 204; `BOX_OWNER_CANNOT_LEAVE`                                                                               |
| `transferBoxOwnership` | `PUT /boxes/{boxId}/owner`               | 20/h       | You become an admin; atomic                                                                                 |
| `createBoxInvitation`  | `POST /boxes/{boxId}/invitations`        | 60/h       | By username; no friendship needed; `BOX_ARCHIVED`, `ALREADY_BOX_MEMBER`, `INVITATION_ALREADY_PENDING`       |
| `listBoxInvitations`   | `GET /boxes/{boxId}/invitations`         | none       | Owners and admins                                                                                           |
| `revokeBoxInvitation`  | `DELETE /boxes/{boxId}/invitations/{id}` | exempt     | 204                                                                                                         |
| `listMyBoxInvitations` | `GET /me/box-invitations`                | none       | Pending, unexpired                                                                                          |
| `acceptBoxInvitation`  | `POST /box-invitations/{id}/accept`      | exempt     | Returns the Box; `INVITATION_EXPIRED` (410), `BOX_ARCHIVED`                                                 |
| `declineBoxInvitation` | `POST /box-invitations/{id}/decline`     | exempt     | 204                                                                                                         |

### Posts

| Operation      | Route                       | Rate limit | Notes                                                                                |
| -------------- | --------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `createPost`   | `POST /boxes/{boxId}/posts` | 120/h      | Active member, active Box; text 1–5,000 chars; `BOX_ARCHIVED`                        |
| `listBoxPosts` | `GET /boxes/{boxId}/posts`  | none       | Paged; items are `{kind:'post'}` or `{kind:'hidden'}` (block placeholder, no author) |
| `getHomeFeed`  | `GET /me/feed`              | none       | All your Boxes, chronological, never ranked                                          |
| `getPost`      | `GET /posts/{postId}`       | none       | `POST_NOT_FOUND` for missing, deleted, non-member, and blocked authors alike         |
| `updatePost`   | `PATCH /posts/{postId}`     | 120/h      | Author only (`POST_ACCESS_DENIED` for other members)                                 |
| `deletePost`   | `DELETE /posts/{postId}`    | 60/h       | Author only; 204; idempotent; text erased                                            |

### Photos on posts

1. `POST /media/uploads` with `{ purpose: "post_image", boxId, contentType,
contentLength }`, then `PUT` the bytes and `POST …/complete` as for avatars.
2. Poll `GET /media/{id}` until `ready` (or `failed`).
3. `POST /boxes/{boxId}/posts` with `{ content?, mediaAssetIds: [≤4 ready IDs] }`.
   Text may be empty if there is at least one photo. Photos cannot change after
   posting; editing changes the text only. Unclaimed photos are removed after
   24 hours.

Posts in responses carry `media: [{ id, width, height, url, thumbnailUrl }]`
with signed URLs that expire in 15 minutes; refetch rather than caching them.

### Life Updates

| Operation           | Route                                 | Rate limit                | Notes                                                                                                                                                   |
| ------------------- | ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createLifeUpdate`  | `POST /life-updates`                  | 30/h `life-update-create` | 201 `LifeUpdate`; `BOX_NOT_FOUND`, `BOX_ARCHIVED` (whole request fails), `MEDIA_NOT_FOUND`, `MEDIA_NOT_READY`                                           |
| `getLifeUpdate`     | `GET /life-updates/{lifeUpdateId}`    | none                      | `LIFE_UPDATE_NOT_FOUND` for missing, deleted, outside your Boxes, Only Me of someone else, and blocked authors alike                                    |
| `updateLifeUpdate`  | `PATCH /life-updates/{lifeUpdateId}`  | 30/h `life-update-edit`   | Author only (`LIFE_UPDATE_ACCESS_DENIED` for other members); `BOX_ARCHIVED` once every Box you are in is archived; `MEDIA_NOT_FOUND`, `MEDIA_NOT_READY` |
| `deleteLifeUpdate`  | `DELETE /life-updates/{lifeUpdateId}` | 30/h `life-update-delete` | Author only (`LIFE_UPDATE_ACCESS_DENIED` for other members); 204; idempotent; removes it from every Box and erases everything                           |
| `listMyLifeUpdates` | `GET /me/life-updates`                | none                      | Your own, newest first, Only Me included; one you can no longer reach in any Box is left out, so a page may be short                                    |

The request is `{ audience, sections?, mediaAssetIds? }`:

- `audience` is `{ type: "only_me" }` or `{ type: "boxes", boxIds: [1–20
distinct IDs] }`. Every Box must be one you belong to now; a Box you are
  not in (or that does not exist) fails the whole request with
  `BOX_NOT_FOUND`, without saying which, and an archived one with
  `BOX_ARCHIVED`. Nothing is partly published. **The audience can never be
  changed**: there is no route for it and the database refuses it.
- `sections` has only the nine fixed keys (`lifeLately`, `workOrUniversity`,
  `travel`, `currentlyInto`, `listeningTo`, `watching`, `reading`,
  `excitedAbout`, `whatsNext`), each up to 2,000 characters and 10,000 in
  total. Text is trimmed and empty sections are dropped. At least one section
  or one photo is required.
- `mediaAssetIds`: up to 4 distinct ready `life_update_image` uploads of
  yours that no other Life Update uses (anything else is `MEDIA_NOT_FOUND`;
  one still processing is `MEDIA_NOT_READY`). Reserve them with
  `POST /media/uploads` and `{ purpose: "life_update_image", contentType,
contentLength ≤ 10 MB }` and no `boxId` (120/h `life-update-upload`, on
  top of the route limit, failing closed). Unclaimed photos are removed after
  24 hours.

A `LifeUpdate` is `{ id, author, audience, sections: [{ key, label, content
}] (canonical order), media, createdAt, editedAt|null, canEdit, contexts }`.
Content and photos are stored once. Each delivery Box has its own backing
post, so `contexts` is `[{ postId, box: { id, name }, interactions }]`, one
per delivery Box **you belong to now** (never other Boxes), sorted by Box
name ignoring case, then ID; it is empty for Only Me. Comments and reactions
use the normal post routes with the context's `postId`, so each Box keeps its
own conversation. `canEdit` is true for the author while it is Only Me or one
delivery Box is open. Publishing sends `post.created` (and deleting
`post.deleted`) with `boxId` and the backing `postId` to each delivery Box;
Only Me sends nothing. A backing post read through `GET /posts/{id}` has
empty `content` and `media`, `kind: "life_update"`, `lifeUpdateId`, and
`canEdit: false`; `PATCH`/`DELETE /posts/{id}` on it answer its author
`POST_MANAGED_BY_LIFE_UPDATE` (409), other members `POST_ACCESS_DENIED`, and
everyone else `POST_NOT_FOUND`. Ordinary posts carry `kind: "post"` and
`lifeUpdateId: null`. Notifications carry `lifeUpdateId` (null unless the post
is a backing post) so the link can open the Life Update in `box.id`.

**Editing** (`PATCH`, strict body `{ sections?, mediaAssetIds? }`, at least
one key): a key that is present replaces that part whole (`sections` with the
same rules as publishing; `mediaAssetIds` is the full photo list afterwards,
in display order, kept and new alike); a key left out stays. There is no
`audience` key (`VALIDATION_FAILED`). The result must keep at least one
section or photo (`VALIDATION_FAILED`). Removed photos are deleted; new ones
are claimed like at publish time. It sets `editedAt`, never moves
`createdAt`, and the change shows in every Box. It is allowed while the
update is Only Me or one delivery Box you are in is open. It sends
`post.updated` with each delivery's `boxId` and `postId`.

**Feeds.** `FeedItem` is `{ kind: "post", post } | { kind: "life_update",
lifeUpdate } | { kind: "hidden", hidden }`. In a Box feed a Life Update
carries only that Box's context. On Home it appears **once**, however many of
your Boxes it went to, with one context per Box you are in (alphabetical);
the page position is its newest reachable backing post, so keyset paging
never repeats or skips it. Only Me is never in a feed (no backing post). A
Life Update by someone in a block relationship with you is one `hidden`
placeholder (the ID and Box of one backing post, nothing else).

### Memories

| Operation             | Route                                           | Rate limit  | Notes                                                               |
| --------------------- | ----------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `listMyMemories`      | `GET /me/memories?year&month&type&cursor&limit` | none (read) | `MemoryPage`; everything you can still access                       |
| `getMyMemorySummary`  | `GET /me/memories/summary?year`                 | none (read) | `MemorySummary`                                                     |
| `listBoxMemories`     | `GET /boxes/{boxId}/memories?…`                 | none (read) | `BOX_NOT_FOUND` unless you belong to the Box now (archived is fine) |
| `getBoxMemorySummary` | `GET /boxes/{boxId}/memories/summary?year`      | none (read) | `BOX_NOT_FOUND` as above                                            |

Memories are a **derived** view, never a stored copy: there is no Memories
table, and every request re-authorizes against current membership, blocks,
and status. Editing shows at once; deleting, leaving or being removed from a
Box, and blocking remove content at once.

- Query: `year` (required, 1970–9999), `month` (optional, 1–12; without it
  the whole year), `type` (`all` default, `posts`, `life_updates`), `cursor`,
  `limit` (≤ 50). Months are **UTC**, by publish time (`createdAt`; edits
  never move it): `[first instant of the month, first instant of the next)`.
  Keep `year`, `month`, and `type` unchanged while following `nextCursor`.
- `MemoryItem` is `{ kind: "post", occurredAt, post: Post } | { kind:
"life_update", occurredAt, lifeUpdate: LifeUpdate }`, newest first (keyset
  on publish time, then ID). `occurredAt` is the item's `createdAt`.
- A Life Update appears **once**. In personal Memories it has a context per
  delivery Box you are in now (alphabetical, like Home); in Box Memories only
  that Box's context. Only Me Life Updates appear only in their author's
  personal Memories, never in Box Memories.
- Content by someone in a block relationship with you (either direction) is
  **omitted**: there is no `hidden` item and it is not counted (Phase 6
  decision 15; feeds keep the placeholder). Archived Boxes' content stays,
  read-only (`canInteract: false`).
- `MemorySummary` is `{ years: [{ year, count }], year, months: [{ month,
count }] }`: every year with content (newest first) and the months of
  `year` (the requested one or, by default, the newest; `null` when there is
  nothing), newest first. It counts exactly what the list would show for
  `type=all`. Both lists are bounded by the calendar, so they are not
  paginated.

### Rooms

| Operation                | Route                                   | Rate limit                   | Notes                                                             |
| ------------------------ | --------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `getMyRoom`              | `GET /me/room`                          | none (read)                  | `Room` with owner-only fields; roomless default, `updatedAt` null |
| `getRoom`                | `GET /rooms/{username}`                 | none (read)                  | `ROOM_NOT_FOUND` for every denial                                 |
| `listRoomContent`        | `GET /rooms/{username}/content`         | none (read)                  | `MemoryPage`; `ROOM_NOT_FOUND` for every denial                   |
| `getRoomContentSummary`  | `GET /rooms/{username}/content/summary` | none (read)                  | `MemorySummary`; `ROOM_NOT_FOUND` for every denial                |
| `listRoomPhotos`         | `GET /rooms/{username}/photos`          | none (read)                  | `RoomPhotoPage`; `ROOM_NOT_FOUND` for every denial                |
| `updateMyRoom`           | `PATCH /me/room`                        | 120/h `room-update` (shared) | `ROOM_UPDATE_STALE`, `MEDIA_NOT_FOUND`, `MEDIA_NOT_READY`         |
| `updateMyRoomWidgets`    | `PUT /me/room/widgets`                  | 120/h `room-update` (shared) | `ROOM_UPDATE_STALE`                                               |
| `updateMyRoomTopFriends` | `PUT /me/room/top-friends`              | 120/h `room-update` (shared) | `ROOM_UPDATE_STALE`, `TOP_FRIEND_NOT_ELIGIBLE`                    |

- **Access** (one query in `RoomAccessService`): `hidden` = owner only,
  `friends` = owner + accepted friends, `members` = friends + anyone with an
  active membership in the same existing (active or archived) Box. A block in
  either direction denies at every tier. Missing, not visible, blocked,
  suspended or username-less owner, a former username, and a malformed or
  over-long name all return the same `ROOM_NOT_FOUND` (404, same message and
  headers). The `{username}` parameter is lenient (no pipe), normalized like
  every username lookup, so case variants resolve.
- **Visitor shape**: `visibility`, `updatedAt`, `banner.bannerMediaId`,
  `topFriends.size`, and `topFriends.visibility` are `null`, and disabled
  widgets are absent. `topFriends.items` is `null` when the Top Friends
  audience excludes the viewer (`friends`: only the owner's friends;
  `hidden`: owner only); otherwise it lists only active friends with no block
  with the owner or the viewer. The banner is a signed display derivative,
  only while its asset is `ready`.
- **Writes** are owner-only (no route names another person's Room). Every
  body carries `expectedUpdatedAt` (required, nullable): the exact
  microsecond string from the last `Room` (null for a never-saved Room),
  else `ROOM_UPDATE_STALE` (409). A request equal to the stored state returns
  the current Room with no write and no version change, whatever version it
  names (safe retries). The first real change creates the Room row; reads
  never do. All sections share one version, so a stale tab cannot overwrite a
  newer save of another section.
- `PATCH /me/room` is partial (strict: unknown keys such as `css` or
  `backgroundUrl` are `VALIDATION_FAILED`). `accent`/`font`/`decorationPack`
  null follows the preset; `location`/`currently` empty become null; `music`
  replaces or (null) removes the card, HTTPS only, re-checked server-side;
  `bannerMediaId` attaches your own ready `room_banner` upload (processing:
  `MEDIA_NOT_READY`; anything else: `MEDIA_NOT_FOUND`) or removes it with
  null. The replaced or removed banner is retired in the same transaction.
- `PUT /me/room/top-friends` lists accepted, active friends with a username
  and no block either way, in order, no more than `size`; anyone else is one
  `TOP_FRIEND_NOT_ELIGIBLE` (422). Unfriend and block remove entries
  automatically (database triggers).
- Banner uploads use `POST /media/uploads` with purpose `room_banner`
  (20/h). No Room write emits a realtime event.
- **Content previews** run the same access query first, then list only the
  owner's posts and Life Updates that the viewer can reach today, through
  the Memories candidates (`authorId` = owner, no Only Me): items in Boxes
  the viewer is in right now, a Life Update with only the viewer's
  contexts, nothing by blocked people, nothing deleted. Only Me never
  appears, not even in your own Room. Nothing counts or hints at hidden
  items, and the answers do not depend on widget switches.
  - `content?type&year&month&cursor&limit`: `MemoryPage` items, newest
    first. `year` is optional (every year); `month` needs `year`
    (`VALIDATION_FAILED`). `limit` ≤ 50.
  - `content/summary?year`: `MemorySummary` counted over exactly what
    `content` lists (the Room's Memories year chips).
  - `photos?cursor&limit`: `{ items: [{ photo: PostMedia, source:
{kind:'post', postId} | {kind:'life_update', lifeUpdateId, boxId},
occurredAt }], nextCursor }`. `limit` (1–12, default 6) counts the
    items carrying ready photos, so a page has at most 48 photos; every
    photo of an item is on the same page, and the cursor is the item's.
    `boxId` is one of the viewer's Boxes to open the Life Update in.

### Comments

| Operation       | Route                           | Rate limit | Notes                                                                                                                      |
| --------------- | ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `createComment` | `POST /posts/{postId}/comments` | 300/h      | `{ content (1–2,000), parentCommentId? }`; a reply to a reply joins the root's thread; `BOX_ARCHIVED`, `COMMENT_NOT_FOUND` |
| `listComments`  | `GET /posts/{postId}/comments`  | none       | Threads, newest root first: `{ root, replies (oldest 3), replyCount }`; items are `comment`, `deleted`, or `hidden`        |
| `listReplies`   | `GET /comments/{id}/replies`    | none       | One root's replies, oldest first; `COMMENT_NOT_FOUND` for a reply ID                                                       |
| `getComment`    | `GET /comments/{id}`            | none       | `{ comment, rootId }` for deep links; missing, deleted, outside your Boxes, and blocked all answer `COMMENT_NOT_FOUND`     |
| `updateComment` | `PATCH /comments/{id}`          | 300/h      | Author only (`COMMENT_ACCESS_DENIED`); `BOX_ARCHIVED`                                                                      |
| `deleteComment` | `DELETE /comments/{id}`         | 300/h      | Author only; 204; idempotent; text erased and its reactions removed; replies stay                                          |

A `deleted` item (a root kept because replies remain) carries its ID, post,
and time, never text or author. A `hidden` item (a block either way) carries
only an ID and a time; a hidden root is one placeholder with no replies.
`replyCount` counts exactly the replies `listReplies` returns.

Every post now carries `interactions`: `commentCount`, `reactions` (emoji kinds
by count, top 8), `reactionCount` (emoji and camera), `realCount`,
`realPreview` (up to 4 latest camera thumbnails), `viewerReaction`, and
`canInteract` (false in an archived Box). Comments carry the same reaction
fields. Counts leave out anything by people in a block relationship with you.

### Reactions

| Operation            | Route                                | Rate limit                      | Notes                                                                                                                                                             |
| -------------------- | ------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setPostReaction`    | `PUT /posts/{postId}/reaction`       | 1,000/h (shared `reaction-set`) | `{ kind: emoji }`, `{ kind: "real", mediaAssetId }`, or `{ kind: null }`; returns the post's `interactions`; `BOX_ARCHIVED`, `MEDIA_NOT_FOUND`, `MEDIA_NOT_READY` |
| `setCommentReaction` | `PUT /comments/{commentId}/reaction` | 1,000/h (shared `reaction-set`) | `{ kind: emoji }` or `{ kind: null }`; returns the comment's `interactions`; `COMMENT_NOT_FOUND`, `POST_NOT_FOUND` (block with the post author), `BOX_ARCHIVED`   |
| `listPostReactions`  | `GET /posts/{postId}/reactions`      | none                            | Paged, newest first; `?kind=` narrows to one emoji or `real`; `{ user, kind, image?, createdAt }`; blocked reactors omitted                                       |

- **Set-state.** One reaction per person per post and per comment. Repeating a
  request changes nothing; `kind: null` removes it (idempotent). Any single
  emoji grapheme is accepted (ZWJ sequences, flags, keycaps, skin tones); the
  five presets are only shortcuts.
- **Camera reactions** (posts only): reserve `POST /media/uploads` with
  `{ purpose: "reaction_image", boxId: <the post's Box>, contentType,
contentLength ≤ 5 MB }`, upload, complete, poll until `ready`, then set
  `{ kind: "real", mediaAssetId }`. The capture must be yours, from that Box,
  and unused; anything else is `MEDIA_NOT_FOUND`, an unfinished one
  `MEDIA_NOT_READY`. A camera reaction and an emoji replace each other; the
  replaced or removed capture is deleted. Unclaimed captures are removed after
  24 hours. Images are signed only for people who may see the post
  (display and thumbnail, 15 minutes).
- **Notifications.** A new reaction (not a change of emoji, not a re-react
  after removal) and every new comment record an activity event that the
  worker turns into a notification for the person addressed.

### Notifications

| Operation                  | Route                                          | Rate limit                         | Notes                                                                         |
| -------------------------- | ---------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `listNotifications`        | `GET /me/notifications`                        | none                               | Paged, newest first; `{ items, nextCursor, unreadCount }`                     |
| `getUnreadCount`           | `GET /me/notifications/unread-count`           | none                               | `{ count (0–100), capped }`; `capped` is true when there may be more than 100 |
| `markNotificationRead`     | `POST /me/notifications/{notificationId}/read` | 600/h (shared `notification-read`) | 204; idempotent; `NOTIFICATION_NOT_FOUND` for anything you cannot see now     |
| `markAllNotificationsRead` | `POST /me/notifications/read-all`              | 600/h (shared `notification-read`) | 204; marks every notification you can currently see                           |

A `Notification` is `{ id, type, actor: UserSummary, postId, commentId|null,
box: { id, name }, reaction: { kind, thumbnailUrl? }|null, read, createdAt }`.
Types: `post.comment` (someone commented on your post), `comment.reply`
(someone replied to your comment), `post.reaction` and `comment.reaction`.
`reaction` is set for the reaction types only; `thumbnailUrl` is a signed
camera-reaction thumbnail (15 minutes). Deep link to `/posts/{postId}`, plus
the comment (`getComment` resolves its thread) when `commentId` is set.

- **IDs only, joined live.** The stored row holds IDs. The actor's face, the
  Box name, and the emoji come from current rows, so nothing outlives an edit,
  removal, or block.
- **Visibility is rechecked on every read** (list, count, mark-one): the post
  is active, you are an active member of its Box, the actor is active and no
  block exists either way, and the target is live (the comment is active; the
  actor's reaction still exists). Anything else is simply absent, and its ID
  answers `NOTIFICATION_NOT_FOUND`, the same as someone else's ID. An archived
  Box keeps its notifications.
- **Created by the worker.** One per person and target, never repeated:
  re-reacting after a removal or a changed emoji does not notify again. Your
  own activity never notifies you. Notifications are kept for 90 days.

### Realtime

`GET /me/events` is a `text/event-stream` (operation `openEventStream`). Send
the normal Bearer token, ignore `ping`, treat `resync` as "anything may have
changed", and refetch through normal routes on every other event. The server
ends the stream at token expiry; reconnect with backoff and a fresh token. At
most 5 open streams per person (`RATE_LIMITED` with `Retry-After` beyond that).
Events are `{ type, boxId?, postId?, commentId?, notificationId?, at }`;
see `RealtimeEvent` in the contract. Comment writes send `comment.created`,
`comment.updated`, and `comment.deleted` to the post's Box with `commentId`.
A reaction that changed something sends `reaction.changed` with `postId`
(and `commentId` for a comment reaction); an idempotent repeat sends nothing.
A new notification sends `notification.created` with `notificationId` and
`postId` to its recipient only. Marking read (one or all, when something
changed) sends `notifications.changed` with no IDs to all of that person's
streams, so other tabs refresh their count.

Lists return `{ items, nextCursor }`; pass `limit` (1–50, default 20) and the
opaque `cursor`. People appear as `UserSummary`: `id`, `username`,
`displayName` (falls back to the username), and a signed `avatarUrl`
thumbnail or `null`.

## Uploading media

1. `POST /media/uploads` with `{ purpose, contentType, contentLength }`.
2. `PUT` the bytes to `upload.url`, sending exactly `upload.headers`. The
   storage service rejects a different type or length.
3. `POST /media/uploads/{id}/complete`. The asset becomes `processing`.
4. Poll `GET /media/{id}` until `ready` or `failed`. For avatars, `GET /me`
   shows the new photo once it is ready; the previous one stays until then.

The legacy reference list is in [legacy/docs/api.md](../legacy/docs/api.md).
