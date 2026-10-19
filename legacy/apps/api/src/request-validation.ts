import { HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';
import { uuidSchema } from '@paldora/validation';
import { ApiError } from './api-error.js';

export function parseRequest<Output>(
  schema: { parse: (value: unknown) => Output },
  value: unknown,
): Output {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        error.issues[0]?.message ?? 'The request is invalid.',
      );
    }
    throw error;
  }
}

export function parseUuid<Identifier extends string>(
  value: string,
): Identifier {
  return parseRequest(uuidSchema, value) as Identifier;
}
