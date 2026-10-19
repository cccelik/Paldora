import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../platform/api-error.js';

/** Missing and "not yours" are deliberately the same answer. */
export const mediaNotFound = () =>
  new ApiError(
    HttpStatus.NOT_FOUND,
    'MEDIA_NOT_FOUND',
    'That upload is not available.',
  );

export const uploadAlreadyHandled = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'MEDIA_UPLOAD_ALREADY_HANDLED',
    'That upload was already handled.',
  );

export const uploadExpired = () =>
  new ApiError(
    HttpStatus.GONE,
    'MEDIA_UPLOAD_EXPIRED',
    'That upload expired. Choose the photo again.',
  );

export const uploadMismatch = () =>
  new ApiError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'MEDIA_UPLOAD_MISMATCH',
    'The uploaded file did not match the request. Choose the photo again.',
  );

export const storageUnavailable = () =>
  new ApiError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'STORAGE_UNAVAILABLE',
    'Photos are temporarily unavailable. Try again shortly.',
  );

/** The photo exists and is yours, but processing has not finished. */
export const mediaNotReady = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'MEDIA_NOT_READY',
    'A photo is still being prepared. Try again in a moment.',
  );
