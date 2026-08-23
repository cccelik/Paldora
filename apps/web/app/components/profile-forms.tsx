'use client';

import { useActionState } from 'react';
import {
  saveProfileAction,
  saveSettingsAction,
  saveUsernameAction,
  type ProfileActionState,
} from '../actions/profile';
import { ActionFeedback, UsernameField } from './ui';

const initialProfileState: ProfileActionState = { status: 'idle' };

export function UsernameForm({ username = '' }: { username?: string }) {
  const [state, action, pending] = useActionState(
    saveUsernameAction,
    initialProfileState,
  );
  return (
    <form action={action} className="form-stack">
      <UsernameField
        defaultValue={username}
        autoComplete="username"
        prefixed
        required
      />
      <p className="field-help">3–30 letters, numbers, or underscores.</p>
      <ActionFeedback state={state} />
      <button className="button-primary" disabled={pending} type="submit">
        {pending ? 'Checking…' : 'Continue'}
      </button>
    </form>
  );
}

export function ProfileSetupForm({
  displayName = '',
  bio = '',
}: {
  displayName?: string;
  bio?: string;
}) {
  const [state, action, pending] = useActionState(
    saveProfileAction,
    initialProfileState,
  );
  return (
    <form action={action} className="form-stack">
      <label>
        Display name
        <input
          defaultValue={displayName}
          name="displayName"
          maxLength={80}
          autoComplete="name"
          required
        />
      </label>
      <label>
        Bio <small>Optional</small>
        <textarea defaultValue={bio} name="bio" maxLength={500} rows={5} />
      </label>
      <ActionFeedback state={state} />
      <button className="button-primary" disabled={pending} type="submit">
        {pending ? 'Saving…' : 'Continue'}
      </button>
    </form>
  );
}

export function SettingsForm({
  username,
  displayName,
  bio,
}: {
  username: string;
  displayName: string;
  bio: string;
}) {
  const [state, action, pending] = useActionState(
    saveSettingsAction,
    initialProfileState,
  );
  return (
    <form action={action} className="settings-form form-stack">
      <div className="form-grid">
        <label>
          Display name
          <input
            defaultValue={displayName}
            name="displayName"
            maxLength={80}
            required
          />
        </label>
        <UsernameField defaultValue={username} required />
      </div>
      <label>
        Bio
        <textarea defaultValue={bio} name="bio" maxLength={500} rows={5} />
      </label>
      <ActionFeedback state={state} />
      <button
        className="button-primary settings-submit"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
