import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiError } from './api-error.js';

/**
 * Validates one request part against a shared contract schema:
 * `@Body(new ZodPipe(createThingSchema)) body: CreateThing`.
 * The first issue becomes the public message; values are never echoed.
 */
export class ZodPipe<Schema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<Schema>
> {
  public constructor(private readonly schema: Schema) {}

  public transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    const field = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ApiError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      `${field}${issue?.message ?? 'The request is invalid.'}`,
    );
  }
}
