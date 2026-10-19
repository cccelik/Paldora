'use server';

import { usernameSchema, uuidSchema } from '@paldora/validation';
import { z } from 'zod';
import type { ActionResult } from '../lib/action-result';
import { runForm } from '../lib/action-runner';

const usernameForm = z.object({ username: usernameSchema });
const friendshipForm = z.object({ friendshipId: uuidSchema });
const userForm = z.object({ userId: uuidSchema });
const paths = ['/friends'] as const;

export async function sendFriendRequestAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    usernameForm,
    (api, { username }) => api.sendFriendRequest(username),
    { success: 'Friend request sent.', paths },
  );
}

export async function acceptFriendRequestAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    friendshipForm,
    (api, { friendshipId }) => api.acceptFriendRequest(friendshipId),
    { success: 'You’re now friends.', paths },
  );
}

export async function declineFriendRequestAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    friendshipForm,
    (api, { friendshipId }) => api.declineFriendRequest(friendshipId),
    { success: 'Request declined.', paths },
  );
}

export async function cancelFriendRequestAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    friendshipForm,
    (api, { friendshipId }) => api.cancelFriendRequest(friendshipId),
    { success: 'Request withdrawn.', paths },
  );
}

export async function removeFriendAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    userForm,
    (api, { userId }) => api.removeFriend(userId),
    {
      success: 'Friend removed.',
      paths,
    },
  );
}

export async function blockPersonAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    usernameForm,
    (api, { username }) => api.block(username),
    {
      success: 'Blocked.',
      paths: [...paths, '/boxes'],
    },
  );
}

/** Blocking from a friend row: the form carries the username, not an ID. */
export async function unblockPersonAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(formData, userForm, (api, { userId }) => api.unblock(userId), {
    success: 'Unblocked.',
    paths,
  });
}
