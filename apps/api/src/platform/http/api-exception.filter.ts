import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorCode } from '@paldora/domain';
import type { Logger } from '@paldora/observability';
import type { ErrorEnvelope } from '@paldora/validation';
import type { Response } from 'express';
import { ApiError } from './api-error.js';
import { requestIdOf, type PaldoraRequest } from './request-context.js';
import { LOGGER } from '../config/tokens.js';

interface PublicError {
  status: number;
  code: ApiErrorCode;
  message: string;
  headers: Readonly<Record<string, string>>;
}

const frameworkErrors: Partial<Record<number, [ApiErrorCode, string]>> = {
  [HttpStatus.BAD_REQUEST]: ['VALIDATION_FAILED', 'The request is invalid.'],
  [HttpStatus.UNAUTHORIZED]: [
    'AUTHENTICATION_REQUIRED',
    'Sign in to continue.',
  ],
  [HttpStatus.NOT_FOUND]: [
    'NOT_FOUND',
    'The requested resource was not found.',
  ],
  [HttpStatus.METHOD_NOT_ALLOWED]: [
    'METHOD_NOT_ALLOWED',
    'This method is not supported.',
  ],
  [HttpStatus.PAYLOAD_TOO_LARGE]: [
    'PAYLOAD_TOO_LARGE',
    'The request is too large.',
  ],
};

function toPublicError(exception: unknown): PublicError {
  if (exception instanceof ApiError) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      headers: exception.headers,
    };
  }
  const status =
    exception instanceof HttpException
      ? exception.getStatus()
      : // Body-parser errors (malformed JSON, oversize) carry a status field.
        Number((exception as { status?: unknown })?.status) || 500;
  const mapped = frameworkErrors[status];
  if (mapped && status < 500) {
    return { status, code: mapped[0], message: mapped[1], headers: {} };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Try again.',
    headers: {},
  };
}

/**
 * Every error leaves the API in one envelope with the request ID. Framework
 * messages, stack traces, and internal details never reach clients.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<PaldoraRequest>();
    const response = http.getResponse<Response>();
    const error = toPublicError(exception);
    const requestId = requestIdOf(request);
    if (error.status >= 500 && !(exception instanceof ApiError)) {
      this.logger.error({ err: exception, requestId }, 'unhandled API error');
    }
    if (response.headersSent) return;
    const body: ErrorEnvelope = {
      error: { code: error.code, message: error.message, requestId },
    };
    response.status(error.status).set(error.headers).json(body);
  }
}
