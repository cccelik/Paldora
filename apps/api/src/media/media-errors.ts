import { HttpStatus } from '@nestjs/common';
import { defineError } from '../platform/http/api-error.js';

/** Missing and "not yours" are deliberately the same answer. */
export const mediaNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'MEDIA_NOT_FOUND',
  'That upload is not available.',
);

export const uploadAlreadyHandled = defineError(
  HttpStatus.CONFLICT,
  'MEDIA_UPLOAD_ALREADY_HANDLED',
  'That upload was already handled.',
);

export const uploadExpired = defineError(
  HttpStatus.GONE,
  'MEDIA_UPLOAD_EXPIRED',
  'That upload expired. Choose the photo again.',
);

export const uploadMismatch = defineError(
  HttpStatus.UNPROCESSABLE_ENTITY,
  'MEDIA_UPLOAD_MISMATCH',
  'The uploaded file did not match the request. Choose the photo again.',
);

export const storageUnavailable = defineError(
  HttpStatus.SERVICE_UNAVAILABLE,
  'STORAGE_UNAVAILABLE',
  'Photos are temporarily unavailable. Try again shortly.',
);

/** The photo exists and is yours, but processing has not finished. */
export const mediaNotReady = defineError(
  HttpStatus.CONFLICT,
  'MEDIA_NOT_READY',
  'A photo is still being prepared. Try again in a moment.',
);
