import { HttpStatus } from '@nestjs/common';
import { defineError } from '../platform/http/api-error.js';

/**
 * Missing, deleted, in none of your Boxes, and blocked authors look the
 * same, so an ID never reveals that a Life Update exists.
 */
export const lifeUpdateNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'LIFE_UPDATE_NOT_FOUND',
  'That Life Update isn’t available.',
);

/** Only shown to someone who can already see the Life Update. */
export const lifeUpdateAccessDenied = defineError(
  HttpStatus.FORBIDDEN,
  'LIFE_UPDATE_ACCESS_DENIED',
  'Only the author can change this Life Update.',
);
