import type { AuthenticatedPrincipal } from '@paldora/domain';
import {
  REQUEST_ID_HEADER,
  resolveCorrelationId,
  urlForLog,
  type Logger,
} from '@paldora/observability';
import type { NextFunction, Request, Response } from 'express';

export interface PaldoraRequest extends Request {
  requestId?: string;
  /** Set by the global auth guard on every non-public route. */
  principal?: AuthenticatedPrincipal;
}

export function requestIdOf(request: PaldoraRequest): string {
  return request.requestId ?? 'unknown';
}

/**
 * Assigns a correlation ID before anything else runs, echoes it to the
 * client, and writes one access-log line without query strings or bodies.
 */
export function requestContextMiddleware(logger: Logger) {
  return (request: PaldoraRequest, response: Response, next: NextFunction) => {
    const requestId = resolveCorrelationId(request.header(REQUEST_ID_HEADER));
    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    const startedAt = performance.now();
    response.on('finish', () => {
      logger.info(
        {
          requestId,
          method: request.method,
          path: urlForLog(request.originalUrl),
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'request completed',
      );
    });
    next();
  };
}
