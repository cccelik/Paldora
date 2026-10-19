import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@paldora/domain';

/**
 * The only exception feature code should throw for expected failures. The
 * global filter turns it into the public error envelope. Use resource codes
 * that do not distinguish "missing" from "forbidden" where probing matters.
 */
export class ApiError extends HttpException {
  public constructor(
    status: HttpStatus,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message, status);
  }
}

export const authenticationRequired = () =>
  new ApiError(
    HttpStatus.UNAUTHORIZED,
    'AUTHENTICATION_REQUIRED',
    'Sign in to continue.',
  );
