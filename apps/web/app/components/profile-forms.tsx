'use client';

import { useActionState } from 'react';
import {
  saveProfileAction,
  saveSettingsAction,
  saveUsernameAction,
  type ProfileActionState,
} from '../actions/profile';

const initialProfileState: ProfileActionState = { status: 'idle' };

function ProfileNotice({ state }: { state: typeof initialProfileState }) {
  if (state.status === 'idle') return null;
  return (
    <p className={`form-notice ${state.status}`} role="status">
      {state.message}
    </p>
  );
}

export function UsernameForm({ username = '' }: { username?: string }) {
  const [state, action, pending] = useActionState(
    saveUsernameAction,
    initialProfileState,
  );
  return (
    <form action={action} className="form-stack">
      <label>
        Username
        <div className="username-input">
          <span>@</span>
          <input
            defaultValue={username}
            name="username"
            minLength={3}
            maxLength={30}
            pattern="[\p{L}\p{N}_]+"
            autoComplete="username"
            required
          />
        </div>
      </label>
      <p className="field-help">3–30 letters, numbers, or underscores.</p>
      <ProfileNotice state={state} />
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
      <ProfileNotice state={state} />
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
        <label>
          Username
          <input
            defaultValue={username}
            name="username"
            maxLength={30}
            required
          />
        </label>
      </div>
      <label>
        Bio
        <textarea defaultValue={bio} name="bio" maxLength={500} rows={5} />
      </label>
      <ProfileNotice state={state} />
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
