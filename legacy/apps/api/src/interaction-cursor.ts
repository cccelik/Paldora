import { HttpStatus } from '@nestjs/common';
import { uuidSchema } from '@paldora/validation';
import { ApiError } from './api-error.js';

export interface InteractionCursor {
  createdAt: Date;
  id: string;
}

export function encodeInteractionCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeInteractionCursor(cursor: string): InteractionCursor {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    if (separator < 1) invalidCursor();
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (
      Number.isNaN(createdAt.getTime()) ||
      !uuidSchema.safeParse(id).success
    ) {
      invalidCursor();
    }
    return { createdAt, id };
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
