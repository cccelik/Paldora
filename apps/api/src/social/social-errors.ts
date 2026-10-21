import { HttpStatus } from '@nestjs/common';
import { defineError } from '../platform/http/api-error.js';

export const cannotFriendSelf = defineError(
  HttpStatus.BAD_REQUEST,
  'CANNOT_FRIEND_SELF',
  'You can’t send a friend request to yourself.',
);

export const cannotBlockSelf = defineError(
  HttpStatus.BAD_REQUEST,
  'CANNOT_BLOCK_SELF',
  'You can’t block yourself.',
);

export const alreadyFriends = defineError(
  HttpStatus.CONFLICT,
  'ALREADY_FRIENDS',
  'You’re already friends.',
);

export const requestAlreadyPending = defineError(
  HttpStatus.CONFLICT,
  'FRIEND_REQUEST_ALREADY_PENDING',
  'A friend request is already waiting.',
);

/** Covers missing, not-yours, already-answered, and blocked requests alike. */
export const friendRequestNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'FRIEND_REQUEST_NOT_FOUND',
  'That friend request isn’t available.',
);

export const friendshipNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'FRIENDSHIP_NOT_FOUND',
  'You’re not friends with that person.',
);
