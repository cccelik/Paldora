import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

const safeCorrelationId = /^[a-z0-9._-]{1,128}$/iu;

/**
 * Accepts a caller-supplied correlation ID only when it is short and inert, so
 * it cannot inject content into logs or headers; otherwise generates one.
 */
export function resolveCorrelationId(value: string | undefined): string {
  return value && safeCorrelationId.test(value) ? value : randomUUID();
}
