'use server';
import {
  actionError,
  invalidOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
import { textField } from '@/lib/actions/form-data';

import { firebaseWebData } from '@/lib/server/firebase/data';
import { requireFirebaseActionOrigin } from '@/lib/server/firebase/origin';
import {
  updatePersonalizationSchema,
  type RoomView,
} from '@paldora/validation';

export async function savePersonalization(
  _previous: ActionResult<RoomView>,
  form: FormData,
): Promise<ActionResult<RoomView>> {
  const widgets = [0, 1, 2]
    .filter((index) => form.has(`title-${index}`))
    .map((index) => ({
      title: textField(form, `title-${index}`),
      source: textField(form, `source-${index}`),
    }));
  const input = updatePersonalizationSchema.safeParse({
    cssSource: textField(form, 'cssSource'),
    widgets,
    expectedUpdatedAt: textField(form, 'expectedUpdatedAt') || null,
  });
  if (!input.success)
    return invalidOutcome(
      'Use at most three widgets and 8 KiB per source. Each widget needs a title.',
    );
  try {
    const room = await (async () => {
      await requireFirebaseActionOrigin();
      return (await firebaseWebData()).updateMyRoomPersonalization(input.data);
    })();
    return { status: 'success', message: 'Personalization saved.', data: room };
  } catch (error) {
    return actionError(error, {
      VALIDATION_FAILED:
        'Not saved. Use only the supported CSS and HTML shown above.',
      ROOM_UPDATE_STALE: 'Not saved: your Room changed somewhere else.',
    });
  }
}
