import { z } from 'zod';
import { realtimeEventSchema } from './events.js';
import { livenessSchema, readinessSchema } from './health.js';
import {
  currentUserSchema,
  preferencesSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  usernameAvailabilityQuerySchema,
  usernameAvailabilitySchema,
} from './identity.js';
import {
  createMediaUploadSchema,
  mediaAssetSchema,
  mediaUploadSchema,
} from './media.js';
import {
  boxInvitationPageSchema,
  boxInvitationSchema,
  boxMemberPageSchema,
  boxMemberRoleSchema,
  boxPageSchema,
  boxSchema,
  createBoxInvitationSchema,
  createBoxSchema,
  deleteBoxQuerySchema,
  transferBoxOwnershipSchema,
  updateBoxMemberSchema,
  updateBoxSchema,
} from './boxes.js';
import {
  blockedUserPageSchema,
  blockedUserSchema,
  createBlockSchema,
  createFriendRequestSchema,
  friendshipPageSchema,
  friendshipSchema,
} from './people.js';
import {
  feedPageSchema,
  postSchema,
  createPostSchema,
  updatePostSchema,
} from './posts.js';
import {
  commentDetailSchema,
  commentPageSchema,
  commentSchema,
  commentThreadPageSchema,
  createCommentSchema,
  updateCommentSchema,
} from './comments.js';
import { cursorPageQuerySchema } from './primitives.js';
import { defineRoute, type RouteDefinition } from './route.js';

/** Success responses that carry no body (HTTP 204). */
const noContent = z.void();

export const getLiveness = defineRoute({
  operationId: 'getLiveness',
  method: 'GET',
  path: '/health',
  summary: 'Liveness probe. Performs no network I/O.',
  tag: 'Platform',
  access: 'public',
  successStatus: 200,
  response: livenessSchema,
  errors: [],
});

export const getReadiness = defineRoute({
  operationId: 'getReadiness',
  method: 'GET',
  path: '/health/ready',
  summary: 'Readiness probe. Checks PostgreSQL and Redis.',
  tag: 'Platform',
  access: 'public',
  successStatus: 200,
  response: readinessSchema,
  errors: ['SERVICE_UNAVAILABLE'],
});

export const getCurrentUser = defineRoute({
  operationId: 'getCurrentUser',
  method: 'GET',
  path: '/me',
  summary: 'The signed-in account, profile, and preferences.',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: currentUserSchema,
  errors: [],
});

export const updateProfile = defineRoute({
  operationId: 'updateProfile',
  method: 'PATCH',
  path: '/me/profile',
  summary:
    'Partially update the profile. Onboarding may only move forward, and only past steps whose data exists.',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: currentUserSchema,
  body: updateProfileSchema,
  errors: [
    'USERNAME_UNAVAILABLE',
    'ONBOARDING_INCOMPLETE',
    'INVALID_ONBOARDING_TRANSITION',
  ],
});

export const getUsernameAvailability = defineRoute({
  operationId: 'getUsernameAvailability',
  method: 'GET',
  path: '/me/username-availability',
  summary:
    'Advisory availability check. The database decides on save; a later save can still fail with USERNAME_UNAVAILABLE.',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: usernameAvailabilitySchema,
  query: usernameAvailabilityQuerySchema,
  errors: [],
});

export const updatePreferences = defineRoute({
  operationId: 'updatePreferences',
  method: 'PUT',
  path: '/me/preferences',
  summary: 'Replace the app preferences (idempotent).',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: preferencesSchema,
  body: updatePreferencesSchema,
  errors: [],
});

export const deleteAvatar = defineRoute({
  operationId: 'deleteAvatar',
  method: 'DELETE',
  path: '/me/avatar',
  summary:
    'Remove the profile photo and schedule its stored files for deletion (idempotent).',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: currentUserSchema,
  errors: [],
});

export const createMediaUpload = defineRoute({
  operationId: 'createMediaUpload',
  method: 'POST',
  path: '/media/uploads',
  summary:
    'Reserve an upload and return a signed PUT bound to the exact type and size. Expires after 300 seconds.',
  tag: 'Media',
  access: 'authenticated',
  successStatus: 201,
  response: mediaUploadSchema,
  body: createMediaUploadSchema,
  errors: ['STORAGE_UNAVAILABLE'],
});

export const completeMediaUpload = defineRoute({
  operationId: 'completeMediaUpload',
  method: 'POST',
  path: '/media/uploads/{mediaAssetId}/complete',
  summary:
    'Verify the stored object against the reservation and queue processing. Single use.',
  tag: 'Media',
  access: 'authenticated',
  successStatus: 200,
  response: mediaAssetSchema,
  errors: [
    'MEDIA_NOT_FOUND',
    'MEDIA_UPLOAD_ALREADY_HANDLED',
    'MEDIA_UPLOAD_EXPIRED',
    'MEDIA_UPLOAD_MISMATCH',
    'STORAGE_UNAVAILABLE',
  ],
});

export const getMediaAsset = defineRoute({
  operationId: 'getMediaAsset',
  method: 'GET',
  path: '/media/{mediaAssetId}',
  summary: 'Processing status of one of your own uploads.',
  tag: 'Media',
  access: 'authenticated',
  successStatus: 200,
  response: mediaAssetSchema,
  errors: ['MEDIA_NOT_FOUND'],
});

const friends = 'Friends';
const blocks = 'Blocks';
const boxesTag = 'Boxes';

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

export const listBoxes = defineRoute({
  operationId: 'listBoxes',
  method: 'GET',
  path: '/boxes',
  summary: 'Boxes you belong to, newest membership first.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxPageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

export const createBox = defineRoute({
  operationId: 'createBox',
  method: 'POST',
  path: '/boxes',
  summary: 'Create a private Box. You become its owner.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 201,
  response: boxSchema,
  body: createBoxSchema,
  errors: [],
});

export const getBox = defineRoute({
  operationId: 'getBox',
  method: 'GET',
  path: '/boxes/{boxId}',
  summary:
    'One of your Boxes. Missing, someone else’s, and former memberships all answer BOX_NOT_FOUND.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxSchema,
  errors: ['BOX_NOT_FOUND'],
});

export const updateBox = defineRoute({
  operationId: 'updateBox',
  method: 'PATCH',
  path: '/boxes/{boxId}',
  summary: 'Rename, archive, or restore a Box (owner only).',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxSchema,
  body: updateBoxSchema,
  errors: ['BOX_NOT_FOUND', 'BOX_ACCESS_DENIED'],
});

export const deleteBox = defineRoute({
  operationId: 'deleteBox',
  method: 'DELETE',
  path: '/boxes/{boxId}',
  summary:
    'Permanently delete a Box (owner only). `confirmName` must equal the Box name exactly.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  query: deleteBoxQuerySchema,
  errors: [
    'BOX_NOT_FOUND',
    'BOX_ACCESS_DENIED',
    'BOX_DELETE_CONFIRMATION_MISMATCH',
  ],
});

export const listBoxMembers = defineRoute({
  operationId: 'listBoxMembers',
  method: 'GET',
  path: '/boxes/{boxId}/members',
  summary: 'Active members, oldest first.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxMemberPageSchema,
  query: cursorPageQuerySchema,
  errors: ['BOX_NOT_FOUND'],
});

export const updateBoxMember = defineRoute({
  operationId: 'updateBoxMember',
  method: 'PATCH',
  path: '/boxes/{boxId}/members/{userId}',
  summary:
    'Change a member’s role. Owners promote and demote; admins only promote members; the owner role moves only by transfer.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxMemberRoleSchema,
  body: updateBoxMemberSchema,
  errors: ['BOX_NOT_FOUND', 'BOX_ACCESS_DENIED', 'BOX_MEMBER_NOT_FOUND'],
});

export const leaveBox = defineRoute({
  operationId: 'leaveBox',
  method: 'DELETE',
  path: '/boxes/{boxId}/members/me',
  summary: 'Leave a Box. The owner must transfer ownership first.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['BOX_NOT_FOUND', 'BOX_OWNER_CANNOT_LEAVE'],
});

export const removeBoxMember = defineRoute({
  operationId: 'removeBoxMember',
  method: 'DELETE',
  path: '/boxes/{boxId}/members/{userId}',
  summary: 'Remove a member (owners and admins; never the owner).',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['BOX_NOT_FOUND', 'BOX_ACCESS_DENIED', 'BOX_MEMBER_NOT_FOUND'],
});

export const transferBoxOwnership = defineRoute({
  operationId: 'transferBoxOwnership',
  method: 'PUT',
  path: '/boxes/{boxId}/owner',
  summary: 'Make another active member the owner; you become an admin. Atomic.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxSchema,
  body: transferBoxOwnershipSchema,
  errors: ['BOX_NOT_FOUND', 'BOX_ACCESS_DENIED', 'BOX_MEMBER_NOT_FOUND'],
});

export const createBoxInvitation = defineRoute({
  operationId: 'createBoxInvitation',
  method: 'POST',
  path: '/boxes/{boxId}/invitations',
  summary:
    'Invite anyone by username (friendship is not required). Expires after 7 days.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 201,
  response: boxInvitationSchema,
  body: createBoxInvitationSchema,
  errors: [
    'BOX_NOT_FOUND',
    'BOX_ACCESS_DENIED',
    'BOX_ARCHIVED',
    'USER_NOT_FOUND',
    'USER_BLOCKED',
    'CANNOT_INVITE_SELF',
    'ALREADY_BOX_MEMBER',
    'INVITATION_ALREADY_PENDING',
  ],
});

export const listBoxInvitations = defineRoute({
  operationId: 'listBoxInvitations',
  method: 'GET',
  path: '/boxes/{boxId}/invitations',
  summary: 'Pending invitations for a Box (owners and admins).',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxInvitationPageSchema,
  query: cursorPageQuerySchema,
  errors: ['BOX_NOT_FOUND', 'BOX_ACCESS_DENIED'],
});

export const revokeBoxInvitation = defineRoute({
  operationId: 'revokeBoxInvitation',
  method: 'DELETE',
  path: '/boxes/{boxId}/invitations/{invitationId}',
  summary: 'Withdraw a pending invitation (owners and admins).',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['BOX_NOT_FOUND', 'BOX_ACCESS_DENIED', 'INVITATION_NOT_FOUND'],
});

export const listMyBoxInvitations = defineRoute({
  operationId: 'listMyBoxInvitations',
  method: 'GET',
  path: '/me/box-invitations',
  summary: 'Invitations waiting for your answer.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxInvitationPageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

export const acceptBoxInvitation = defineRoute({
  operationId: 'acceptBoxInvitation',
  method: 'POST',
  path: '/box-invitations/{invitationId}/accept',
  summary: 'Join the Box.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 200,
  response: boxSchema,
  errors: ['INVITATION_NOT_FOUND', 'INVITATION_EXPIRED', 'BOX_ARCHIVED'],
});

export const declineBoxInvitation = defineRoute({
  operationId: 'declineBoxInvitation',
  method: 'POST',
  path: '/box-invitations/{invitationId}/decline',
  summary: 'Decline an invitation.',
  tag: boxesTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['INVITATION_NOT_FOUND'],
});

const postsTag = 'Posts';

export const createPost = defineRoute({
  operationId: 'createPost',
  method: 'POST',
  path: '/boxes/{boxId}/posts',
  summary: 'Post to a Box you belong to. Archived Boxes are read-only.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 201,
  response: postSchema,
  body: createPostSchema,
  errors: ['BOX_NOT_FOUND', 'BOX_ARCHIVED'],
});

export const listBoxPosts = defineRoute({
  operationId: 'listBoxPosts',
  method: 'GET',
  path: '/boxes/{boxId}/posts',
  summary:
    'A Box’s posts, newest first. Posts by people in a block relationship with you appear as hidden items.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 200,
  response: feedPageSchema,
  query: cursorPageQuerySchema,
  errors: ['BOX_NOT_FOUND'],
});

export const getHomeFeed = defineRoute({
  operationId: 'getHomeFeed',
  method: 'GET',
  path: '/me/feed',
  summary:
    'Posts from all your Boxes, newest first (chronological, never ranked).',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 200,
  response: feedPageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

export const getPost = defineRoute({
  operationId: 'getPost',
  method: 'GET',
  path: '/posts/{postId}',
  summary:
    'One post. Missing, deleted, outside your Boxes, and blocked authors all answer POST_NOT_FOUND.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 200,
  response: postSchema,
  errors: ['POST_NOT_FOUND'],
});

export const updatePost = defineRoute({
  operationId: 'updatePost',
  method: 'PATCH',
  path: '/posts/{postId}',
  summary: 'Edit your own post.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 200,
  response: postSchema,
  body: updatePostSchema,
  errors: ['POST_NOT_FOUND', 'POST_ACCESS_DENIED', 'BOX_ARCHIVED'],
});

export const deletePost = defineRoute({
  operationId: 'deletePost',
  method: 'DELETE',
  path: '/posts/{postId}',
  summary: 'Delete your own post (idempotent). The text is erased.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['POST_NOT_FOUND', 'POST_ACCESS_DENIED', 'BOX_ARCHIVED'],
});

const commentsTag = 'Comments';

export const createComment = defineRoute({
  operationId: 'createComment',
  method: 'POST',
  path: '/posts/{postId}/comments',
  summary:
    'Comment on a post, or reply with `parentCommentId`. A reply to a reply joins the root’s thread (one reply level). Archived Boxes are read-only.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 201,
  response: commentSchema,
  body: createCommentSchema,
  errors: ['POST_NOT_FOUND', 'COMMENT_NOT_FOUND', 'BOX_ARCHIVED'],
});

export const listComments = defineRoute({
  operationId: 'listComments',
  method: 'GET',
  path: '/posts/{postId}/comments',
  summary:
    'A post’s threads, newest root first, each with its oldest replies. Comments by people in a block relationship with you appear as hidden items; a deleted root stays only while it has replies.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentThreadPageSchema,
  query: cursorPageQuerySchema,
  errors: ['POST_NOT_FOUND'],
});

export const listReplies = defineRoute({
  operationId: 'listReplies',
  method: 'GET',
  path: '/comments/{commentId}/replies',
  summary: 'The replies in one thread, oldest first.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentPageSchema,
  query: cursorPageQuerySchema,
  errors: ['COMMENT_NOT_FOUND'],
});

export const getComment = defineRoute({
  operationId: 'getComment',
  method: 'GET',
  path: '/comments/{commentId}',
  summary:
    'One comment and the root of its thread, for deep links. Missing, deleted, outside your Boxes, and blocked all answer COMMENT_NOT_FOUND.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentDetailSchema,
  errors: ['COMMENT_NOT_FOUND'],
});

export const updateComment = defineRoute({
  operationId: 'updateComment',
  method: 'PATCH',
  path: '/comments/{commentId}',
  summary: 'Edit your own comment.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentSchema,
  body: updateCommentSchema,
  errors: ['COMMENT_NOT_FOUND', 'COMMENT_ACCESS_DENIED', 'BOX_ARCHIVED'],
});

export const deleteComment = defineRoute({
  operationId: 'deleteComment',
  method: 'DELETE',
  path: '/comments/{commentId}',
  summary:
    'Delete your own comment (idempotent). The text is erased; replies stay.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['COMMENT_NOT_FOUND', 'COMMENT_ACCESS_DENIED', 'BOX_ARCHIVED'],
});

export const openEventStream = defineRoute({
  operationId: 'openEventStream',
  method: 'GET',
  path: '/me/events',
  summary:
    'One server-sent-event stream per client. Events are IDs only; refetch through normal routes. The stream ends when the access token expires and is capped per person, so clients reconnect with a fresh token and backoff.',
  tag: 'Realtime',
  access: 'authenticated',
  successStatus: 200,
  stream: true,
  response: realtimeEventSchema,
  errors: [],
});

/** Every operation in the public contract. Add new routes here. */
export const apiRoutes = {
  getLiveness,
  getReadiness,
  getCurrentUser,
  updateProfile,
  getUsernameAvailability,
  updatePreferences,
  deleteAvatar,
  createMediaUpload,
  completeMediaUpload,
  getMediaAsset,
  listFriends,
  listFriendRequests,
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listBlocks,
  createBlock,
  removeBlock,
  listBoxes,
  createBox,
  getBox,
  updateBox,
  deleteBox,
  listBoxMembers,
  updateBoxMember,
  leaveBox,
  removeBoxMember,
  transferBoxOwnership,
  createBoxInvitation,
  listBoxInvitations,
  revokeBoxInvitation,
  listMyBoxInvitations,
  acceptBoxInvitation,
  declineBoxInvitation,
  createPost,
  listBoxPosts,
  getHomeFeed,
  getPost,
  updatePost,
  deletePost,
  createComment,
  listComments,
  listReplies,
  getComment,
  updateComment,
  deleteComment,
  openEventStream,
} as const satisfies Record<string, RouteDefinition>;
