import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../platform/api-error.js';

/** Missing, not a member, left, removed, and deleted all look the same. */
export const boxNotFound = () =>
  new ApiError(
    HttpStatus.NOT_FOUND,
    'BOX_NOT_FOUND',
    'That Box isn’t available.',
  );

/** Only ever shown to members, who already know the Box exists. */
export const boxAccessDenied = (message: string) =>
  new ApiError(HttpStatus.FORBIDDEN, 'BOX_ACCESS_DENIED', message);

export const boxMemberNotFound = () =>
  new ApiError(
    HttpStatus.NOT_FOUND,
    'BOX_MEMBER_NOT_FOUND',
    'That person isn’t an active member of this Box.',
  );

export const boxArchived = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'BOX_ARCHIVED',
    'This Box is archived. Restore it to add people.',
  );

export const ownerCannotLeave = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'BOX_OWNER_CANNOT_LEAVE',
    'Transfer ownership to another member before leaving.',
  );

export const deleteConfirmationMismatch = () =>
  new ApiError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'BOX_DELETE_CONFIRMATION_MISMATCH',
    'Type the Box name exactly to delete it.',
  );

export const cannotInviteSelf = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'CANNOT_INVITE_SELF',
    'You’re already in this Box.',
  );

export const alreadyBoxMember = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'ALREADY_BOX_MEMBER',
    'That person is already in this Box.',
  );

export const invitationAlreadyPending = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'INVITATION_ALREADY_PENDING',
    'That person already has an invitation waiting.',
  );

/** Missing, someone else’s, already answered, and blocked all look the same. */
export const invitationNotFound = () =>
  new ApiError(
    HttpStatus.NOT_FOUND,
    'INVITATION_NOT_FOUND',
    'That invitation isn’t available.',
  );

export const invitationExpired = () =>
  new ApiError(
    HttpStatus.GONE,
    'INVITATION_EXPIRED',
    'That invitation has expired.',
  );
