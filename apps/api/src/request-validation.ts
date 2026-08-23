import { HttpStatus } from '@nestjs/common';
import { ZodError } from 'zod';
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
