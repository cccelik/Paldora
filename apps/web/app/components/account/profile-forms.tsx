'use client';

import {
  saveAccountAction,
  saveProfileStepAction,
  saveUsernameAction,
} from '@/actions/profile';
import styles from '@/components/account/profile-forms.module.css';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextAreaField, TextField } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@paldora/domain';
import { useActionState } from 'react';
const usernameHelp = '3–30 letters, numbers, or underscores.';

function UsernameInput({ defaultValue }: { defaultValue: string }) {
  return (
    <TextField
      label="Username"
      id="username"
      name="username"
      prefix="@"
      defaultValue={defaultValue}
      minLength={USERNAME_MIN_LENGTH}
      maxLength={USERNAME_MAX_LENGTH}
      pattern="[\p{L}\p{N}_]+"
      autoComplete="username"
      autoCapitalize="none"
      spellCheck={false}
      help={usernameHelp}
      required
    />
  );
}

function DisplayNameInput({ defaultValue }: { defaultValue: string }) {
  return (
    <TextField
      label="Display name"
      id="displayName"
      name="displayName"
      defaultValue={defaultValue}
      maxLength={DISPLAY_NAME_MAX_LENGTH}
      autoComplete="name"
      required
    />
  );
}

function BioInput({ defaultValue }: { defaultValue: string }) {
  return (
    <TextAreaField
      label="Bio"
      id="bio"
      name="bio"
      optional
      defaultValue={defaultValue}
      maxLength={BIO_MAX_LENGTH}
      rows={4}
      help="A line or two your people will see."
    />
  );
}

export function UsernameStepForm({ username }: { username: string }) {
  const [state, action] = useActionState(saveUsernameAction, idleResult);
  return (
    <form action={action} className={styles.form}>
      <UsernameInput defaultValue={username} />
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Checking…" block>
        Continue
      </SubmitButton>
    </form>
  );
}

export function ProfileStepForm({
  displayName,
  bio,
}: {
  displayName: string;
  bio: string;
}) {
  const [state, action] = useActionState(saveProfileStepAction, idleResult);
  return (
    <form action={action} className={styles.form}>
      <DisplayNameInput defaultValue={displayName} />
      <BioInput defaultValue={bio} />
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Saving…" block>
        Continue
      </SubmitButton>
    </form>
  );
}

export function AccountForm({
  username,
  displayName,
  bio,
}: {
  username: string;
  displayName: string;
  bio: string;
}) {
  const [state, action] = useActionState(saveAccountAction, idleResult);
  return (
    <form action={action} className={styles.form}>
      <DisplayNameInput defaultValue={displayName} />
      <UsernameInput defaultValue={username} />
      <BioInput defaultValue={bio} />
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
