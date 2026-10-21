'use server';

import {
  actionError,
  invalidOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
import { textField } from '@/lib/actions/form-data';
import { apiClient } from '@/lib/server/session';
import { revalidatePath } from 'next/cache';

const deletionCopy = {
  BOX_OWNERSHIP_TRANSFER_REQUIRED:
    'Transfer ownership of every Box you own before requesting deletion.',
  ACCOUNT_REAUTH_FAILED: 'That password did not match your account.',
};

export async function requestExportAction(
  _previous: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  void _previous;
  void _formData;
  try {
    await (await apiClient()).requestAccountExport();
    revalidatePath('/settings/account');
    return {
      status: 'success',
      message:
        'Your archive is being prepared. Refresh this page in a few minutes.',
      data: undefined,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function requestDeletionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const password = textField(formData, 'password');
  if (!password) return invalidOutcome('Enter your password.');
  try {
    await (await apiClient()).requestAccountDeletion({ password });
    revalidatePath('/settings/account');
    return {
      status: 'success',
      message: 'Deletion scheduled. You can cancel it within seven days.',
      data: undefined,
    };
  } catch (error) {
    return actionError(error, deletionCopy);
  }
}

export async function cancelDeletionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const password = textField(formData, 'password');
  if (!password) return invalidOutcome('Enter your password.');
  try {
    await (await apiClient()).cancelAccountDeletion({ password });
    revalidatePath('/settings/account');
    return {
      status: 'success',
      message: 'Your deletion request was cancelled.',
      data: undefined,
    };
  } catch (error) {
    return actionError(error, deletionCopy);
  }
}
