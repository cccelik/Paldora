import { randomUUID } from 'node:crypto';

const safeRequestId = /^[a-z0-9._-]{1,128}$/iu;

export function resolveRequestId(value: string | undefined): string {
  return value && safeRequestId.test(value) ? value : randomUUID();
}
