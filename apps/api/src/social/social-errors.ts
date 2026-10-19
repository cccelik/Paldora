import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../platform/api-error.js';

export const cannotFriendSelf = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'CANNOT_FRIEND_SELF',
    'You can’t send a friend request to yourself.',
  );

export const cannotBlockSelf = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'CANNOT_BLOCK_SELF',
    'You can’t block yourself.',
  );

export const alreadyFriends = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'ALREADY_FRIENDS',
    'You’re already friends.',
  );

export const requestAlreadyPending = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'FRIEND_REQUEST_ALREADY_PENDING',
    'A friend request is already waiting.',
  );

/** Covers missing, not-yours, already-answered, and blocked requests alike. */
export const friendRequestNotFound = () =>
  new ApiError(
    HttpStatus.NOT_FOUND,
    'FRIEND_REQUEST_NOT_FOUND',
    'That friend request isn’t available.',
  );

export const friendshipNotFound = () =>
  new ApiError(
    HttpStatus.NOT_FOUND,
    'FRIENDSHIP_NOT_FOUND',
    'You’re not friends with that person.',
  );
