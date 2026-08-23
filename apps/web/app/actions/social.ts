'use server';

import { ApiClientError } from '@paldora/api-client';
import type {
  BoxId,
  BoxInvitationId,
  FriendshipId,
  UserId,
} from '@paldora/domain';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authenticatedApiClient } from '../lib/api';

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError))
    return 'Something went wrong. Try again.';
  const messages: Record<string, string> = {
    ALREADY_FRIENDS: 'You are already friends.',
    FRIEND_REQUEST_ALREADY_PENDING: 'A friend request is already pending.',
    FRIENDSHIP_REQUIRED: 'Add this person as a friend before inviting them.',
    INTERACTION_NOT_AVAILABLE: 'This interaction is not available.',
    INVITATION_ALREADY_PENDING: 'An invitation is already pending.',
    ALREADY_BOX_MEMBER: 'That person is already in this Box.',
    USER_NOT_FOUND: 'No person with that username was found.',
    VALIDATION_FAILED: error.message,
  };
  return messages[error.code] ?? error.message;
}

function withNotice(path: string, key: 'error' | 'notice', message: string) {
  return `${path}?${key}=${encodeURIComponent(message)}`;
}

export async function createBoxAction(formData: FormData) {
  let destination: string;
  try {
    const box = await (
      await authenticatedApiClient()
    ).createBox({ name: String(formData.get('name') ?? '') });
    destination = `/boxes/${box.id}`;
  } catch (error) {
    destination = withNotice('/boxes/new', 'error', errorMessage(error));
  }
  redirect(destination as Route);
}

export async function sendFriendRequestAction(formData: FormData) {
  let destination = withNotice('/friends', 'notice', 'Friend request sent.');
  try {
    await (
      await authenticatedApiClient()
    ).createFriendRequest({ username: String(formData.get('username') ?? '') });
    revalidatePath('/friends');
  } catch (error) {
    destination = withNotice('/friends', 'error', errorMessage(error));
  }
  redirect(destination as Route);
}

export async function respondToFriendRequestAction(
  friendshipId: string,
  response: 'accept' | 'decline',
) {
  await (
    await authenticatedApiClient()
  ).respondToFriendRequest(friendshipId as FriendshipId, response);
  revalidatePath('/friends');
}

export async function inviteToBoxAction(boxId: string, formData: FormData) {
  const path = `/boxes/${boxId}`;
  let destination = withNotice(path, 'notice', 'Invitation sent.');
  try {
    await (
      await authenticatedApiClient()
    ).inviteToBox(boxId as BoxId, {
      username: String(formData.get('username') ?? ''),
    });
    revalidatePath(path);
  } catch (error) {
    destination = withNotice(path, 'error', errorMessage(error));
  }
  redirect(destination as Route);
}

export async function respondToBoxInvitationAction(
  invitationId: string,
  response: 'accept' | 'decline',
) {
  await (
    await authenticatedApiClient()
  ).respondToBoxInvitation(invitationId as BoxInvitationId, response);
  revalidatePath('/boxes');
}

export async function blockUserAction(formData: FormData) {
  let destination = withNotice('/friends', 'notice', 'User blocked.');
  try {
    await (
      await authenticatedApiClient()
    ).blockUser({ username: String(formData.get('username') ?? '') });
    revalidatePath('/friends');
  } catch (error) {
    destination = withNotice('/friends', 'error', errorMessage(error));
  }
  redirect(destination as Route);
}

export async function unblockUserAction(userId: string) {
  await (await authenticatedApiClient()).unblockUser(userId as UserId);
  revalidatePath('/friends');
}
