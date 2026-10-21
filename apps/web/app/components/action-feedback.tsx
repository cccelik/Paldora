import { type ActionResult } from '../lib/action-result';
import { FormMessage } from './ui';
/** Renders a Server Action result in the form's live region. */
export function ActionFeedback({ state }: { state: ActionResult<unknown> }) {
  if (state.status === 'idle') return <FormMessage />;
  return (
    <FormMessage
      message={state.message}
      tone={state.status === 'success' ? 'success' : state.tone}
    />
  );
}
