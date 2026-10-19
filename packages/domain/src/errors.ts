/**
 * Stable public error codes. Clients (web, iOS, Android) branch on these, so a
 * code is never renamed or reused with a different meaning once released.
 * Feature phases append resource-specific codes such as `BOX_NOT_FOUND`, where
 * absence and denial intentionally share one code.
 */
export const API_ERROR_CODES = [
  'AUTHENTICATION_REQUIRED',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'RATE_LIMIT_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  // Identity (Phase 1)
  'ACCOUNT_NOT_PROVISIONED',
  'ACCOUNT_BLOCKED',
  'USERNAME_UNAVAILABLE',
  'ONBOARDING_INCOMPLETE',
  'INVALID_ONBOARDING_TRANSITION',
  // Media (Phase 1)
  'MEDIA_NOT_FOUND',
  'MEDIA_UPLOAD_ALREADY_HANDLED',
  'MEDIA_UPLOAD_EXPIRED',
  'MEDIA_UPLOAD_MISMATCH',
  'STORAGE_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes(value)
  );
}
