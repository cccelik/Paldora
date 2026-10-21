'use server';

import {
  actionError,
  invalidOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
import { textField } from '@/lib/actions/form-data';
import { apiClient } from '@/lib/server/session';
import { moderationActionSchema } from '@paldora/validation';
import { revalidatePath } from 'next/cache';

export async function moderateCaseAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const caseId = textField(formData, 'caseId');
  const parsed = moderationActionSchema.safeParse({
    action: textField(formData, 'action'),
    reason: textField(formData, 'reason'),
    idempotencyKey: textField(formData, 'idempotencyKey'),
  });
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(caseId))
    return invalidOutcome(
      'Choose an action and give a reason of at least 20 characters.',
    );
  try {
    await (await apiClient()).actOnModerationCase(caseId, parsed.data);
    revalidatePath('/moderation');
    revalidatePath(`/moderation/cases/${caseId}`);
    return {
      status: 'success',
      message: 'Action recorded.',
      data: undefined,
    };
  } catch (error) {
    return actionError(error);
  }
}
