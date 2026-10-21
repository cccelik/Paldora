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
} from '../boxes.js';
import { cursorPageQuerySchema } from '../primitives.js';
import { noContent } from './no-content.js';
import { defineRoute } from '../route.js';

const boxesTag = 'Boxes';

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
