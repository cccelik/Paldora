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
  // People and friendships (Phase 2)
  'USER_NOT_FOUND',
  'USER_BLOCKED',
  'CANNOT_FRIEND_SELF',
  'CANNOT_BLOCK_SELF',
  'ALREADY_FRIENDS',
  'FRIEND_REQUEST_ALREADY_PENDING',
  'FRIEND_REQUEST_NOT_FOUND',
  'FRIENDSHIP_NOT_FOUND',
  // Boxes (Phase 2). Absence and denial share BOX_NOT_FOUND.
  'BOX_NOT_FOUND',
  'BOX_ACCESS_DENIED',
  'BOX_MEMBER_NOT_FOUND',
  'BOX_ARCHIVED',
  'BOX_OWNER_CANNOT_LEAVE',
  'BOX_DELETE_CONFIRMATION_MISMATCH',
  'CANNOT_INVITE_SELF',
  'ALREADY_BOX_MEMBER',
  'INVITATION_ALREADY_PENDING',
  'INVITATION_NOT_FOUND',
  'INVITATION_EXPIRED',
  // Posts (Phase 3). Absence, non-membership, and blocks share POST_NOT_FOUND.
  'POST_NOT_FOUND',
  'POST_ACCESS_DENIED',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes(value)
  );
}
