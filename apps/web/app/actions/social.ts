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
    FRIENDSHIP_NOT_FOUND: 'That friendship is no longer available.',
    INTERACTION_NOT_AVAILABLE: 'This interaction is not available.',
    INVITATION_ALREADY_PENDING: 'An invitation is already pending.',
    ALREADY_BOX_MEMBER: 'That person is already in this Box.',
    BOX_ARCHIVED: 'That Box is not accepting new members.',
    BOX_ACCESS_DENIED: error.message,
    BOX_MEMBER_NOT_FOUND: 'That Box member is no longer available.',
    INVITATION_EXPIRED: 'That invitation has expired.',
    INVITATION_ALREADY_HANDLED: 'That invitation was already handled.',
    RATE_LIMITED: 'You have sent too many requests. Try again later.',
    RATE_LIMIT_UNAVAILABLE:
      'This action is temporarily unavailable. Try again shortly.',
    USER_NOT_FOUND: 'No person with that username was found.',
    VALIDATION_FAILED: error.message,
  };
  return messages[error.code] ?? error.message;
}

function withNotice(path: string, key: 'error' | 'notice', message: string) {
  return `${path}?${key}=${encodeURIComponent(message)}`;
}

async function mutateAndRedirect(
  path: string,
  successMessage: string,
  operation: () => Promise<unknown>,
): Promise<never> {
  let destination = withNotice(path, 'notice', successMessage);
  try {
    await operation();
    revalidatePath(path as Route);
  } catch (error) {
    destination = withNotice(path, 'error', errorMessage(error));
  }
  redirect(destination as Route);
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
  return sendFriendRequestTo('/friends', 'Friend request sent.', formData);
}

export async function sendFriendRequestFromBoxAction(
  boxId: string,
  formData: FormData,
) {
  return sendFriendRequestTo(
    `/boxes/${boxId}`,
    'Friend request sent.',
    formData,
  );
}

export async function respondToFriendRequestAction(
  friendshipId: string,
  response: 'accept' | 'decline',
) {
  return mutateAndRedirect(
    '/friends',
    response === 'accept'
      ? 'Friend request accepted.'
      : 'Friend request declined.',
    async () =>
      (await authenticatedApiClient()).respondToFriendRequest(
        friendshipId as FriendshipId,
        response,
      ),
  );
}

export async function inviteToBoxAction(boxId: string, formData: FormData) {
  const path = `/boxes/${boxId}`;
  return mutateAndRedirect(path, 'Invitation sent.', async () =>
    (await authenticatedApiClient()).inviteToBox(boxId as BoxId, {
      username: String(formData.get('username') ?? ''),
    }),
  );
}

export async function respondToBoxInvitationAction(
  invitationId: string,
  response: 'accept' | 'decline',
) {
  return mutateAndRedirect(
    '/boxes',
    response === 'accept'
      ? 'Box invitation accepted.'
      : 'Box invitation declined.',
    async () =>
      (await authenticatedApiClient()).respondToBoxInvitation(
        invitationId as BoxInvitationId,
        response,
      ),
  );
}

export async function blockUserAction(formData: FormData) {
  return mutateAndRedirect('/friends', 'User blocked.', async () =>
    (await authenticatedApiClient()).blockUser({
      username: String(formData.get('username') ?? ''),
    }),
  );
}

export async function unblockUserAction(userId: string) {
  return mutateAndRedirect('/friends', 'User unblocked.', async () =>
    (await authenticatedApiClient()).unblockUser(userId as UserId),
  );
}

export async function removeFriendAction(userId: string) {
  return mutateAndRedirect('/friends', 'Friend removed.', async () =>
    (await authenticatedApiClient()).removeFriend(userId as UserId),
  );
}

export async function updateBoxMemberRoleAction(
  boxId: string,
  userId: string,
  role: 'admin' | 'member',
) {
  return mutateAndRedirect(
    `/boxes/${boxId}`,
    role === 'admin' ? 'Member promoted to admin.' : 'Admin changed to member.',
    async () =>
      (await authenticatedApiClient()).updateBoxMemberRole(
        boxId as BoxId,
        userId as UserId,
        role,
      ),
  );
}

export async function updateBoxAction(boxId: string, formData: FormData) {
  return mutateAndRedirect(`/boxes/${boxId}`, 'Box name updated.', async () =>
    (await authenticatedApiClient()).updateBox(boxId as BoxId, {
      name: String(formData.get('name') ?? ''),
    }),
  );
}

export async function setBoxStatusAction(
  boxId: string,
  status: 'active' | 'archived',
) {
  return mutateAndRedirect(
    `/boxes/${boxId}`,
    status === 'archived' ? 'Box archived.' : 'Box restored.',
    async () =>
      (await authenticatedApiClient()).updateBox(boxId as BoxId, { status }),
  );
}

export async function deleteBoxAction(
  boxId: string,
  boxName: string,
  formData: FormData,
) {
  const boxPath = `/boxes/${boxId}`;
  if (String(formData.get('confirmation') ?? '') !== boxName) {
    redirect(
      withNotice(
        boxPath,
        'error',
        'Enter the exact Box name to confirm.',
      ) as Route,
    );
  }
  let destination = withNotice('/boxes', 'notice', 'Box permanently deleted.');
  try {
    await (await authenticatedApiClient()).deleteBox(boxId as BoxId);
    revalidatePath('/boxes');
    revalidatePath(boxPath as Route);
  } catch (error) {
    destination = withNotice(boxPath, 'error', errorMessage(error));
  }
  redirect(destination as Route);
}

export async function transferBoxOwnershipAction(
  boxId: string,
  userId: string,
) {
  return mutateAndRedirect(
    `/boxes/${boxId}`,
    'Box ownership transferred.',
    async () =>
      (await authenticatedApiClient()).transferBoxOwnership(
        boxId as BoxId,
        userId as UserId,
      ),
  );
}

export async function removeBoxMemberAction(boxId: string, userId: string) {
  return mutateAndRedirect(
    `/boxes/${boxId}`,
    'Member removed from Box.',
    async () =>
      (await authenticatedApiClient()).removeBoxMember(
        boxId as BoxId,
        userId as UserId,
      ),
  );
}

export async function leaveBoxAction(boxId: string) {
  const boxPath = `/boxes/${boxId}`;
  let destination = withNotice('/boxes', 'notice', 'You left the Box.');
  try {
    await (await authenticatedApiClient()).leaveBox(boxId as BoxId);
    revalidatePath('/boxes');
    revalidatePath(boxPath);
  } catch (error) {
    destination = withNotice(boxPath, 'error', errorMessage(error));
  }
  redirect(destination as Route);
}

function sendFriendRequestTo(
  path: string,
  successMessage: string,
  formData: FormData,
): Promise<never> {
  return mutateAndRedirect(path, successMessage, async () =>
    (await authenticatedApiClient()).createFriendRequest({
      username: String(formData.get('username') ?? ''),
    }),
  );
}
