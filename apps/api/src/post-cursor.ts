import { HttpStatus } from '@nestjs/common';
import type { PostId } from '@paldora/domain';
import { uuidSchema } from '@paldora/validation';
import { ApiError } from './api-error.js';

export interface PostCursor {
  createdAt: Date;
  id: PostId;
}

export function encodePostCursor(createdAt: Date, id: PostId): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString(
    'base64url',
  );
}

export function decodePostCursor(cursor: string): PostCursor {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    if (separator < 1) invalidCursor();
    const timestamp = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    const createdAt = new Date(timestamp);
    if (
      Number.isNaN(createdAt.getTime()) ||
      !uuidSchema.safeParse(id).success
    ) {
      invalidCursor();
    }
    return { createdAt, id: id as PostId };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    invalidCursor();
  }
}

function invalidCursor(): never {
  throw new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_CURSOR',
    'That pagination cursor is invalid.',
  );
}
