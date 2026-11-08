'use client';

import { ActionFeedback } from '@/components/forms/action-feedback';
import {
  type FormAction,
  type HiddenFieldValues,
} from '@/components/forms/action-types';
import { SubmitButton } from '@/components/forms/submit-button';
import styles from '@/components/posts/post-menu.module.css';
import { Button, HiddenFields } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import { useActionState } from 'react';
/**
 * The confirm step of a destructive menu item, drawn inside a `Dialog`. The
 * Cancel button is first in focus order and the dialog traps focus.
 */
export function DeleteDialogForm({
  action,
  fields,
  confirmLabel,
  onCancel,
}: {
  action: FormAction;
  fields: HiddenFieldValues;
  confirmLabel: string;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(action, idleResult);
  return (
    <form action={formAction} className={styles.form}>
      <HiddenFields values={fields} />
      <ActionFeedback state={state} />
      <div className={styles.row}>
        <SubmitButton variant="danger" pendingLabel="Deleting…">
          {confirmLabel}
        </SubmitButton>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
