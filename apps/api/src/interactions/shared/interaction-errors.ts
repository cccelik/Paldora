import { HttpStatus } from '@nestjs/common';
import { defineError } from '../../platform/http/api-error.js';

/**
 * Missing, deleted, outside your Boxes, in a hidden thread, and written by
 * someone in a block relationship with you all look the same.
 */
export const commentNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'COMMENT_NOT_FOUND',
  'That comment isn’t available.',
);

/** Only shown to someone who can already see the comment. */
export const commentAccessDenied = defineError(
  HttpStatus.FORBIDDEN,
  'COMMENT_ACCESS_DENIED',
  'Only the author can change this comment.',
);
