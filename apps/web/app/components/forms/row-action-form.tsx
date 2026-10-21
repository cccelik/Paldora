'use client';

import { ActionFeedback } from '@/components/forms/action-feedback';
import {
  type FormAction,
  type HiddenFieldValues,
} from '@/components/forms/action-types';
import styles from '@/components/forms/row-action-form.module.css';
import { SubmitButton } from '@/components/forms/submit-button';
import { type ButtonVariant, HiddenFields } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import { useActionState } from 'react';
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
  fields: HiddenFieldValues;
  label: string;
  pendingLabel: string;
  variant?: ButtonVariant;
}) {
  const [state, formAction] = useActionState(action, idleResult);
  return (
    <div>
      <form action={formAction} className={styles.form}>
        <HiddenFields values={fields} />
        <SubmitButton variant={variant} pendingLabel={pendingLabel}>
          {label}
        </SubmitButton>
      </form>
      {state.status === 'error' ? <ActionFeedback state={state} /> : null}
    </div>
  );
}
