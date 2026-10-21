'use server';

import {
  actionError,
  invalidOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
import { textField } from '@/lib/actions/form-data';
import { apiClient } from '@/lib/server/session';
import { createReportSchema } from '@paldora/validation';
import { revalidatePath } from 'next/cache';

export async function createReportAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const detail = textField(formData, 'detail').trim();
  const parsed = createReportSchema.safeParse({
    targetKind: textField(formData, 'targetKind'),
    targetId: textField(formData, 'targetId'),
    category: textField(formData, 'category'),
    detail: detail || null,
  });
  if (!parsed.success) return invalidOutcome('Check the report and try again.');
  try {
    await (await apiClient()).createReport(parsed.data);
    revalidatePath('/settings/reports');
    return {
      status: 'success',
      message: 'Report received. Thank you for letting us know.',
      data: undefined,
    };
  } catch (error) {
    return actionError(error, {
      REPORT_ALREADY_EXISTS: 'You have already reported this item.',
      REPORT_TARGET_UNAVAILABLE: 'This item is no longer available to report.',
    });
  }
}
