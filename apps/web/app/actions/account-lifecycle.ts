'use server';

import {
  actionError,
  invalidOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
import { textField } from '@/lib/actions/form-data';

import { firebaseWebData } from '@/lib/server/firebase/data';
import { requireFirebaseActionOrigin } from '@/lib/server/firebase/origin';
import { NativeLifecycleError } from '@paldora/firebase-trusted';
import { ApiClientError } from '@/lib/server/web-data-error';
import { revalidatePath } from 'next/cache';

const deletionCopy = {
  BOX_OWNERSHIP_TRANSFER_REQUIRED:
    'Transfer ownership of every Box you own before requesting deletion.',
  ACCOUNT_REAUTH_FAILED: 'That password did not match your account.',
  ACCOUNT_DELETION_WINDOW_CLOSED:
    'The seven-day cancellation window has ended.',
};

function lifecycleError(error: unknown): unknown {
  if (!(error instanceof NativeLifecycleError)) return error;
  const codes = {
    REAUTH_FAILED: 'ACCOUNT_REAUTH_FAILED',
    BOX_OWNERSHIP_TRANSFER_REQUIRED: 'BOX_OWNERSHIP_TRANSFER_REQUIRED',
    WINDOW_CLOSED: 'ACCOUNT_DELETION_WINDOW_CLOSED',
    UNAVAILABLE: 'ACCOUNT_DELETION_NOT_FOUND',
  } as const;
  return new ApiClientError(
    409,
    codes[error.code],
    'Account request unavailable.',
    null,
  );
}

export async function requestExportAction(
  _previous: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  void _previous;
  void _formData;
  try {
    {
      await requireFirebaseActionOrigin();
      await (await firebaseWebData()).requestAccountExport();
    }
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
    {
      await requireFirebaseActionOrigin();
      await (await firebaseWebData()).requestAccountDeletion(password);
    }
    revalidatePath('/settings/account');
    return {
      status: 'success',
      message: 'Deletion scheduled. You can cancel it within seven days.',
      data: undefined,
    };
  } catch (error) {
    return actionError(lifecycleError(error), deletionCopy);
  }
}

export async function cancelDeletionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const password = textField(formData, 'password');
  if (!password) return invalidOutcome('Enter your password.');
  try {
    {
      await requireFirebaseActionOrigin();
      await (await firebaseWebData()).cancelAccountDeletion(password);
    }
    revalidatePath('/settings/account');
    return {
      status: 'success',
      message: 'Your deletion request was cancelled.',
      data: undefined,
    };
  } catch (error) {
    return actionError(lifecycleError(error), deletionCopy);
  }
}
