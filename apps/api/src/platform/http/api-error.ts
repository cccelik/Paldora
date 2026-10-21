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

/**
 * A factory for one fixed public error. Each call makes a fresh `ApiError`,
 * so every throw carries its own stack: `export const x = defineError(…)`
 * then `throw x()`.
 */
export const defineError =
  (status: HttpStatus, code: ApiErrorCode, message: string) => (): ApiError =>
    new ApiError(status, code, message);

export const authenticationRequired = defineError(
  HttpStatus.UNAUTHORIZED,
  'AUTHENTICATION_REQUIRED',
  'Sign in to continue.',
);
