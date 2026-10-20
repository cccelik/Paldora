import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../platform/api-error.js';

/**
 * The one answer for every Room a viewer may not see: missing, hidden, not
 * permitted, blocked either way, an unavailable owner, a renamed or
 * malformed username. Same status, code, message, and headers, so a
 * response can never tell these apart (plan §D parity).
 */
export const roomNotFound = () =>
  new ApiError(
    HttpStatus.NOT_FOUND,
    'ROOM_NOT_FOUND',
    'This Room is not available.',
  );

/** Only ever about the caller's own Room. */
export const roomUpdateStale = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'ROOM_UPDATE_STALE',
    'Your Room changed somewhere else. Reload to see the latest.',
  );

/**
 * Not an accepted, active friend without a block either way. Strangers,
 * pending requests, blocks, suspended people, yourself, and unknown IDs
 * all look the same.
 */
export const topFriendNotEligible = () =>
  new ApiError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'TOP_FRIEND_NOT_ELIGIBLE',
    'Top Friends must be your friends.',
  );
