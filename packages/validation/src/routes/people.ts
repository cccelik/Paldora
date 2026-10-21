import {
  blockedUserPageSchema,
  blockedUserSchema,
  createBlockSchema,
  createFriendRequestSchema,
  friendshipPageSchema,
  friendshipSchema,
} from '../people.js';
import { cursorPageQuerySchema } from '../primitives.js';
import { noContent } from './no-content.js';
import { defineRoute } from '../route.js';

const friends = 'Friends';
const blocks = 'Blocks';

export const listFriends = defineRoute({
  operationId: 'listFriends',
  method: 'GET',
  path: '/friends',
  summary: 'Your accepted friends, newest first.',
  tag: friends,
  access: 'authenticated',
  successStatus: 200,
  response: friendshipPageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

export const listFriendRequests = defineRoute({
  operationId: 'listFriendRequests',
  method: 'GET',
  path: '/friend-requests',
  summary: 'Pending requests, incoming and outgoing (see `direction`).',
  tag: friends,
  access: 'authenticated',
  successStatus: 200,
  response: friendshipPageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

export const createFriendRequest = defineRoute({
  operationId: 'createFriendRequest',
  method: 'POST',
  path: '/friend-requests',
  summary:
    'Ask someone to be friends. If they blocked you the answer is USER_NOT_FOUND, never a hint that a block exists.',
  tag: friends,
  access: 'authenticated',
  successStatus: 201,
  response: friendshipSchema,
  body: createFriendRequestSchema,
  errors: [
    'USER_NOT_FOUND',
    'USER_BLOCKED',
    'CANNOT_FRIEND_SELF',
    'ALREADY_FRIENDS',
    'FRIEND_REQUEST_ALREADY_PENDING',
  ],
});

export const acceptFriendRequest = defineRoute({
  operationId: 'acceptFriendRequest',
  method: 'POST',
  path: '/friend-requests/{friendshipId}/accept',
  summary: 'Accept a request someone sent you.',
  tag: friends,
  access: 'authenticated',
  successStatus: 200,
  response: friendshipSchema,
  errors: ['FRIEND_REQUEST_NOT_FOUND'],
});

export const declineFriendRequest = defineRoute({
  operationId: 'declineFriendRequest',
  method: 'POST',
  path: '/friend-requests/{friendshipId}/decline',
  summary: 'Decline a request someone sent you.',
  tag: friends,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['FRIEND_REQUEST_NOT_FOUND'],
});

export const cancelFriendRequest = defineRoute({
  operationId: 'cancelFriendRequest',
  method: 'DELETE',
  path: '/friend-requests/{friendshipId}',
  summary: 'Withdraw a request you sent.',
  tag: friends,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['FRIEND_REQUEST_NOT_FOUND'],
});

export const removeFriend = defineRoute({
  operationId: 'removeFriend',
  method: 'DELETE',
  path: '/friends/{userId}',
  summary: 'End a friendship. Boxes you share are unaffected.',
  tag: friends,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['FRIENDSHIP_NOT_FOUND'],
});

export const listBlocks = defineRoute({
  operationId: 'listBlocks',
  method: 'GET',
  path: '/blocks',
  summary: 'People you have blocked. Who blocked you is never exposed.',
  tag: blocks,
  access: 'authenticated',
  successStatus: 200,
  response: blockedUserPageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

export const createBlock = defineRoute({
  operationId: 'createBlock',
  method: 'POST',
  path: '/blocks',
  summary:
    'Block someone (idempotent). Ends any friendship, withdraws pending requests and Box invitations between you, and hides each of you from the other. Shared Boxes stay intact.',
  tag: blocks,
  access: 'authenticated',
  successStatus: 201,
  response: blockedUserSchema,
  body: createBlockSchema,
  errors: ['USER_NOT_FOUND', 'CANNOT_BLOCK_SELF'],
});

export const removeBlock = defineRoute({
  operationId: 'removeBlock',
  method: 'DELETE',
  path: '/blocks/{userId}',
  summary:
    'Remove your block (idempotent). A block they placed on you stays in force.',
  tag: blocks,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: [],
});
