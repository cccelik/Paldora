'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import type { FormAction, HiddenFields } from './action-types';
import { SubmitButton } from './submit-button';
import { Button, type ButtonVariant } from './ui';
import styles from './row-action-form.module.css';

/**
 * A two-step control for anything that is hard to undo. The first press opens
 * a plain-language question; focus moves to Cancel, the safe choice, and
 * returns to the trigger when the question closes.
 */
export function ConfirmAction({
  action,
  fields,
  label,
  prompt,
  confirmLabel,
  pendingLabel,
  variant = 'danger',
}: {
  action: FormAction;
  fields: HiddenFields;
  label: string;
  prompt: string;
  confirmLabel: string;
  pendingLabel: string;
  variant?: ButtonVariant;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, idleResult);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) cancel.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (!open) {
    return (
      <div>
        <Button ref={trigger} variant={variant} onClick={() => setOpen(true)}>
          {label}
        </Button>
        {state.status === 'error' ? <ActionFeedback state={state} /> : null}
      </div>
    );
  }
  return (
    <form
      action={formAction}
      className={styles.confirm}
      role="group"
      aria-label={prompt}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p className={styles.prompt}>{prompt}</p>
      <div className={styles.buttons}>
        <SubmitButton variant={variant} pendingLabel={pendingLabel}>
          {confirmLabel}
        </SubmitButton>
        <Button ref={cancel} variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}
