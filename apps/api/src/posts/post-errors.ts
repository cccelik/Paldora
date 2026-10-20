import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../platform/api-error.js';

/** Missing, deleted, outside your Boxes, and blocked authors look the same. */
export const postNotFound = () =>
  new ApiError(
    HttpStatus.NOT_FOUND,
    'POST_NOT_FOUND',
    'That post isn’t available.',
  );

/** Only shown to someone who can already see the post. */
export const postAccessDenied = () =>
  new ApiError(
    HttpStatus.FORBIDDEN,
    'POST_ACCESS_DENIED',
    'Only the author can change this post.',
  );

/**
 * A Life Update's backing post is changed only through its Life Update, so
 * one edit or delete reaches every Box. Only its author ever sees this.
 */
export const postManagedByLifeUpdate = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'POST_MANAGED_BY_LIFE_UPDATE',
    'This is part of a Life Update. Edit or delete the Life Update instead.',
  );
