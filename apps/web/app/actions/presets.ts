'use server';

import { type ActionResult } from '@/lib/actions/action-result';
import { runForm } from '@/lib/actions/action-runner';
import { REACTION_PRESET_COUNT } from '@paldora/domain';
import { reactionPresetsSchema } from '@paldora/validation';
import { z } from 'zod';
/** The editor sends its five slots as `preset0` … `preset4`. */
const presetsForm = z
  .record(z.string(), z.string())
  .transform((fields) => ({
    presets: Array.from(
      { length: REACTION_PRESET_COUNT },
      (_, index) => fields[`preset${index}`] ?? '',
    ),
  }))
  .pipe(reactionPresetsSchema);

export async function reactionPresetsAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    presetsForm,
    (data, { presets }) => data.setReactionPresets(presets),
    {
      success: 'Saved. Your reaction bar uses these now.',
      paths: [
        '/settings/reactions',
        '/home',
        '/boxes/[boxId]',
        '/posts/[postId]',
        '/life-updates',
        '/life-updates/[lifeUpdateId]',
      ],
    },
  );
}
