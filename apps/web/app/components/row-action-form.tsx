'use client';

import { useActionState } from 'react';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import type { FormAction, HiddenFields } from './action-types';
import { SubmitButton } from './submit-button';
import type { ButtonVariant } from './ui';
import styles from './row-action-form.module.css';

/**
 * One button that runs one Server Action for one row (accept, decline,
 * cancel…). Failures show beside the button; success refreshes the page data.
 */
export function RowActionForm({
  action,
  fields,
  label,
  pendingLabel,
  variant = 'secondary',
}: {
  action: FormAction;
  fields: HiddenFields;
  label: string;
  pendingLabel: string;
  variant?: ButtonVariant;
}) {
  const [state, formAction] = useActionState(action, idleResult);
  return (
    <div>
      <form action={formAction} className={styles.form}>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <SubmitButton variant={variant} pendingLabel={pendingLabel}>
          {label}
        </SubmitButton>
      </form>
      {state.status === 'error' ? <ActionFeedback state={state} /> : null}
    </div>
  );
}
