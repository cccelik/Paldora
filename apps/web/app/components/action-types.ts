import { type ActionResult } from '../lib/action-result';
/** The shape `useActionState` needs, and every Server Action here has. */
export type FormAction = (
  previous: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

/** Values a form carries along with what the person types. */
export type HiddenFieldValues = Readonly<Record<string, string>>;
