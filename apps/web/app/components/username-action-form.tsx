'use client';

import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@paldora/domain';
import { useActionState, useRef } from 'react';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import { type FormAction, type HiddenFieldValues } from './action-types';
import styles from './form-stack.module.css';
import { SubmitButton } from './submit-button';
import { HiddenFields, TextField } from './ui';
import { useActionSuccess } from './use-action-success';
/** "Type a username, press a button": friend requests, blocks, invitations. */
export function UsernameActionForm({
  action,
  fields = {},
  id,
  label,
  help,
  submitLabel,
  pendingLabel,
}: {
  action: FormAction;
  fields?: HiddenFieldValues;
  id: string;
  label: string;
  help?: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleResult);
  const form = useRef<HTMLFormElement>(null);

  useActionSuccess(state, () => form.current?.reset());

  return (
    <form ref={form} action={formAction} className={styles.form}>
      <HiddenFields values={fields} />
      <TextField
        label={label}
        id={id}
        name="username"
        prefix="@"
        minLength={USERNAME_MIN_LENGTH}
        maxLength={USERNAME_MAX_LENGTH}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        {...(help ? { help } : {})}
      />
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
