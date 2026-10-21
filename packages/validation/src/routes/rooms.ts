import { memoryPageSchema, memorySummarySchema } from '../memories.js';
import {
  roomContentQuerySchema,
  roomContentSummaryQuerySchema,
  roomPhotoPageSchema,
  roomPhotoQuerySchema,
  roomSchema,
  updateRoomSchema,
  updateRoomTopFriendsSchema,
  updateRoomWidgetsSchema,
} from '../rooms.js';
import { defineRoute } from '../route.js';

const roomsTag = 'Rooms';

export const getMyRoom = defineRoute({
  operationId: 'getMyRoom',
  method: 'GET',
  path: '/me/room',
  summary:
    'Your own Room with every owner-only field: `visibility`, `updatedAt` (the version every Room write must name as `expectedUpdatedAt`), the banner’s media id, the Top Friends size and audience, and disabled widgets. A Room you never saved is the default configuration with `updatedAt: null`; reading never creates it. ROOM_NOT_FOUND until you have a username.',
  tag: roomsTag,
  access: 'authenticated',
  successStatus: 200,
  response: roomSchema,
  errors: ['ROOM_NOT_FOUND'],
});

export const getRoom = defineRoute({
  operationId: 'getRoom',
  method: 'GET',
  path: '/rooms/{username}',
  summary:
    'The Room of the person with this username (case-insensitive), as you may see it: `hidden` is the owner only, `friends` adds accepted friends, `members` adds people who share a Box with the owner. A block in either direction hides it. Missing, not visible, blocked, an unavailable owner, a former username, and a malformed name all answer the same ROOM_NOT_FOUND. Visitors get no owner-only fields (they are null) and no disabled widgets; Top Friends follow their own audience (`items: null` when not yours to see).',
  tag: roomsTag,
  access: 'authenticated',
  successStatus: 200,
  response: roomSchema,
  errors: ['ROOM_NOT_FOUND'],
});

export const listRoomContent = defineRoute({
  operationId: 'listRoomContent',
  method: 'GET',
  path: '/rooms/{username}/content',
  summary:
    'The Room owner’s posts and Life Updates that you can reach today, newest first, as Memories items: only what is in Boxes you are in right now (a Life Update shows only your Boxes’ contexts), never Only Me (not even in your own Room), and nothing about what you cannot see. Without `year` it spans every year; `month` needs `year`. Any Room you may not see answers ROOM_NOT_FOUND, exactly like `GET /rooms/{username}`.',
  tag: roomsTag,
  access: 'authenticated',
  successStatus: 200,
  response: memoryPageSchema,
  query: roomContentQuerySchema,
  errors: ['ROOM_NOT_FOUND'],
});

export const getRoomContentSummary = defineRoute({
  operationId: 'getRoomContentSummary',
  method: 'GET',
  path: '/rooms/{username}/content/summary',
  summary:
    'How many of the Room owner’s posts and Life Updates you can reach per UTC year, and per month of `year` (default: the newest): counted over exactly what `listRoomContent` lists, so it reveals nothing more. Any Room you may not see answers ROOM_NOT_FOUND.',
  tag: roomsTag,
  access: 'authenticated',
  successStatus: 200,
  response: memorySummarySchema,
  query: roomContentSummaryQuerySchema,
  errors: ['ROOM_NOT_FOUND'],
});

export const listRoomPhotos = defineRoute({
  operationId: 'listRoomPhotos',
  method: 'GET',
  path: '/rooms/{username}/photos',
  summary:
    'Photos from the Room owner’s posts and Life Updates that you can reach today, newest first, with signed URLs and a link target for each. `limit` counts the items that carry photos (up to 12, each with up to 4 photos), and the cursor is the item’s. Same reach rules as `listRoomContent`. Any Room you may not see answers ROOM_NOT_FOUND.',
  tag: roomsTag,
  access: 'authenticated',
  successStatus: 200,
  response: roomPhotoPageSchema,
  query: roomPhotoQuerySchema,
  errors: ['ROOM_NOT_FOUND'],
});

export const updateMyRoom = defineRoute({
  operationId: 'updateMyRoom',
  method: 'PATCH',
  path: '/me/room',
  summary:
    'Change any of your Room’s settings; fields left out stay as they are, a null `accent`/`font`/`decorationPack` follows the theme again, `music: null` removes the music card, and `bannerMediaId` attaches a ready `room_banner` upload of yours (null removes it; the previous banner is deleted). `expectedUpdatedAt` must be the `updatedAt` you loaded (null for a never-saved Room), else ROOM_UPDATE_STALE. A request that changes nothing returns your Room unchanged. Shares a 120-per-hour limit with the other Room writes.',
  tag: roomsTag,
  access: 'authenticated',
  successStatus: 200,
  response: roomSchema,
  body: updateRoomSchema,
  errors: [
    'ROOM_NOT_FOUND',
    'ROOM_UPDATE_STALE',
    'MEDIA_NOT_FOUND',
    'MEDIA_NOT_READY',
  ],
});

export const updateMyRoomWidgets = defineRoute({
  operationId: 'updateMyRoomWidgets',
  method: 'PUT',
  path: '/me/room/widgets',
  summary:
    'Replace your Room’s widget arrangement: all seven widgets, each once, with positions 0–6 each once. Same `expectedUpdatedAt` rule and shared limit as the other Room writes; an identical arrangement returns your Room unchanged.',
  tag: roomsTag,
  access: 'authenticated',
  successStatus: 200,
  response: roomSchema,
  body: updateRoomWidgetsSchema,
  errors: ['ROOM_NOT_FOUND', 'ROOM_UPDATE_STALE'],
});

export const updateMyRoomTopFriends = defineRoute({
  operationId: 'updateMyRoomTopFriends',
  method: 'PUT',
  path: '/me/room/top-friends',
  summary:
    'Replace your Top Friends: the people in display order (no more than `size`), the size (4, 8, or 12), and who sees them (`visible`: everyone who can see your Room, `friends`: your friends, `hidden`: you). Everyone listed must be an accepted friend with no block either way, else TOP_FRIEND_NOT_ELIGIBLE (one answer for every reason). Unfriending or blocking removes a person automatically. Same `expectedUpdatedAt` rule and shared limit as the other Room writes.',
  tag: roomsTag,
  access: 'authenticated',
  successStatus: 200,
  response: roomSchema,
  body: updateRoomTopFriendsSchema,
  errors: ['ROOM_NOT_FOUND', 'ROOM_UPDATE_STALE', 'TOP_FRIEND_NOT_ELIGIBLE'],
});
