import { HttpStatus } from '@nestjs/common';
import { defineError } from '../platform/http/api-error.js';

/**
 * The one answer for every Room a viewer may not see: missing, hidden, not
 * permitted, blocked either way, an unavailable owner, a renamed or
 * malformed username. Same status, code, message, and headers, so a
 * response can never tell these apart (plan §D parity).
 */
export const roomNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'ROOM_NOT_FOUND',
  'This Room is not available.',
);

/** Only ever about the caller's own Room. */
export const roomUpdateStale = defineError(
  HttpStatus.CONFLICT,
  'ROOM_UPDATE_STALE',
  'Your Room changed somewhere else. Reload to see the latest.',
);

/**
 * Not an accepted, active friend without a block either way. Strangers,
 * pending requests, blocks, suspended people, yourself, and unknown IDs
 * all look the same.
 */
export const topFriendNotEligible = defineError(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'TOP_FRIEND_NOT_ELIGIBLE',
  'Top Friends must be your friends.',
);
