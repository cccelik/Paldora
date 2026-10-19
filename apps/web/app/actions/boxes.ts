'use server';

import { boxNameSchema, usernameSchema, uuidSchema } from '@paldora/validation';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionResult } from '../lib/action-result';
import { runForm, runFormWithData } from '../lib/action-runner';

const boxForm = z.object({ boxId: uuidSchema });
const memberForm = z.object({ boxId: uuidSchema, userId: uuidSchema });
const invitationForm = z.object({ invitationId: uuidSchema });

export async function createBoxAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runFormWithData(
    formData,
    z.object({ name: boxNameSchema }),
    (api, { name }) => api.createBox({ name }),
    { success: 'Box created.', paths: ['/boxes'] },
  );
  if (result.status !== 'success') return result;
  redirect(`/boxes/${result.data.id}`);
}

export async function renameBoxAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ boxId: uuidSchema, name: boxNameSchema }),
    (api, { boxId, name }) => api.updateBox(boxId, { name }),
    { success: 'Box renamed.', paths: ['/boxes', '/boxes/[boxId]'] },
  );
}

export async function setBoxStatusAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ boxId: uuidSchema, status: z.enum(['active', 'archived']) }),
    (api, { boxId, status }) => api.updateBox(boxId, { status }),
    { success: 'Saved.', paths: ['/boxes', '/boxes/[boxId]'] },
  );
}

/**
 * The page asks for the exact name and an acknowledgement; the API checks
 * the name again against the stored one, so this is never the only guard.
 */
export async function deleteBoxAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runForm(
    formData,
    z.object({
      boxId: uuidSchema,
      confirmName: z.string(),
      acknowledge: z.literal('yes', { error: 'Tick the box to confirm.' }),
    }),
    (api, { boxId, confirmName }) => api.deleteBox(boxId, confirmName),
    { success: 'Box deleted.', paths: ['/boxes'] },
  );
  if (result.status !== 'success') return result;
  redirect('/boxes');
}

export async function inviteToBoxAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ boxId: uuidSchema, username: usernameSchema }),
    (api, { boxId, username }) => api.inviteToBox(boxId, username),
    { success: 'Invitation sent.', paths: ['/boxes/[boxId]'] },
  );
}

export async function revokeInvitationAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ boxId: uuidSchema, invitationId: uuidSchema }),
    (api, { boxId, invitationId }) =>
      api.revokeBoxInvitation(boxId, invitationId),
    { success: 'Invitation withdrawn.', paths: ['/boxes/[boxId]'] },
  );
}

export async function acceptInvitationAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    invitationForm,
    (api, { invitationId }) => api.acceptBoxInvitation(invitationId),
    { success: 'You joined the Box.', paths: ['/boxes'] },
  );
}

export async function declineInvitationAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    invitationForm,
    (api, { invitationId }) => api.declineBoxInvitation(invitationId),
    { success: 'Invitation declined.', paths: ['/boxes'] },
  );
}

export async function setMemberRoleAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({
      boxId: uuidSchema,
      userId: uuidSchema,
      role: z.enum(['admin', 'member']),
    }),
    (api, { boxId, userId, role }) => api.setBoxMemberRole(boxId, userId, role),
    { success: 'Role updated.', paths: ['/boxes/[boxId]'] },
  );
}

export async function removeMemberAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    memberForm,
    (api, { boxId, userId }) => api.removeBoxMember(boxId, userId),
    { success: 'Member removed.', paths: ['/boxes', '/boxes/[boxId]'] },
  );
}

export async function transferOwnershipAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    memberForm,
    (api, { boxId, userId }) => api.transferBoxOwnership(boxId, userId),
    { success: 'Ownership transferred.', paths: ['/boxes', '/boxes/[boxId]'] },
  );
}

export async function leaveBoxAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runForm(
    formData,
    boxForm,
    (api, { boxId }) => api.leaveBox(boxId),
    { success: 'You left the Box.', paths: ['/boxes'] },
  );
  if (result.status !== 'success') return result;
  redirect('/boxes');
}
