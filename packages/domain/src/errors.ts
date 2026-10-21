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
  'MEDIA_NOT_READY',
  // Comments, reactions, notifications (Phase 5). Absence, deletion, and
  // blocks share COMMENT_NOT_FOUND; other people's IDs NOTIFICATION_NOT_FOUND.
  'COMMENT_NOT_FOUND',
  'COMMENT_ACCESS_DENIED',
  'NOTIFICATION_NOT_FOUND',
  // Life Updates (Phase 6). Absence, deletion, no shared Box, and blocks
  // share LIFE_UPDATE_NOT_FOUND; a backing post is changed only through its
  // Life Update (POST_MANAGED_BY_LIFE_UPDATE).
  'LIFE_UPDATE_NOT_FOUND',
  'LIFE_UPDATE_ACCESS_DENIED',
  'POST_MANAGED_BY_LIFE_UPDATE',
  // Rooms (Phase 7). A missing, hidden, inaccessible, or blocked Room and
  // an unavailable owner all share ROOM_NOT_FOUND; any ineligible Top
  // Friend (stranger, pending, blocked, suspended, self, unknown) shares
  // TOP_FRIEND_NOT_ELIGIBLE.
  'ROOM_NOT_FOUND',
  'ROOM_UPDATE_STALE',
  'TOP_FRIEND_NOT_ELIGIBLE',
  // Private reports and staff-only case access (Phase 9).
  'REPORT_NOT_FOUND',
  'REPORT_ACTION_UNAVAILABLE',
  'MODERATION_FORBIDDEN',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes(value)
  );
}
