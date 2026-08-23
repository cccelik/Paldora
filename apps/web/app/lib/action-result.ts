import 'server-only';
import { ApiClientError } from '@paldora/api-client';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) {
    return 'Something went wrong. Try again.';
  }
  const messages: Record<string, string> = {
    ALREADY_FRIENDS: 'You are already friends.',
    FRIEND_REQUEST_ALREADY_PENDING: 'A friend request is already pending.',
    FRIENDSHIP_NOT_FOUND: 'That friendship is no longer available.',
    INTERACTION_NOT_AVAILABLE: 'This interaction is not available.',
    INVITATION_ALREADY_PENDING: 'An invitation is already pending.',
    ALREADY_BOX_MEMBER: 'That person is already in this Box.',
    BOX_ARCHIVED: error.message,
    BOX_ACCESS_DENIED: error.message,
    BOX_MEMBER_NOT_FOUND: 'That Box member is no longer available.',
    INVITATION_EXPIRED: 'That invitation has expired.',
    INVITATION_ALREADY_HANDLED: 'That invitation was already handled.',
    POST_NOT_FOUND: 'That post is no longer available.',
    RATE_LIMITED: 'You have sent too many requests. Try again later.',
    RATE_LIMIT_UNAVAILABLE:
      'This action is temporarily unavailable. Try again shortly.',
    USER_NOT_FOUND: 'No person with that username was found.',
    VALIDATION_FAILED: error.message,
  };
  return messages[error.code] ?? error.message;
}

export function withNotice(
  path: string,
  key: 'error' | 'notice',
  message: string,
) {
  return `${path}?${key}=${encodeURIComponent(message)}`;
}

export async function mutateAndRedirect(
  path: string,
  successMessage: string,
  operation: () => Promise<unknown>,
): Promise<never> {
  let destination = withNotice(path, 'notice', successMessage);
  try {
    await operation();
    revalidatePath(path as Route);
  } catch (error) {
    destination = withNotice(path, 'error', apiErrorMessage(error));
  }
  redirect(destination as Route);
}
