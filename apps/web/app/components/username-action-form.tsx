'use client';

import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@paldora/domain';
import { useActionState, useEffect, useRef } from 'react';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import type { FormAction, HiddenFields } from './action-types';
import { SubmitButton } from './submit-button';
import { TextField } from './ui';
import styles from './form-stack.module.css';

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
  fields?: HiddenFields;
  id: string;
  label: string;
  help?: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useActionState(action, idleResult);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className={styles.form}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
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
