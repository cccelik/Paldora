'use client';

import type { AppearancePreference } from '@paldora/domain';
import { useState } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import { applyAppearance } from './app-appearance-bridge';

export function AppearanceForm({ initial }: { initial: AppearancePreference }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await createBrowserApiClient().updatePreferences({
        appearance: value,
      });
      applyAppearance(saved.appearance);
      setMessage('Appearance saved.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Appearance could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="appearance-form form-stack"
      onSubmit={(event) => void save(event)}
    >
      <fieldset>
        <legend>Application appearance</legend>
        {(['light', 'dark', 'system'] as const).map((appearance) => (
          <label className="appearance-choice" key={appearance}>
            <input
              checked={value === appearance}
              name="appearance"
              onChange={() => {
                setValue(appearance);
                applyAppearance(appearance);
              }}
              type="radio"
              value={appearance}
            />
            <span>
              <strong>
                {appearance[0]!.toUpperCase() + appearance.slice(1)}
              </strong>
              <small>
                {appearance === 'system'
                  ? 'Follow this device.'
                  : `Always use Paldora’s ${appearance} palette.`}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="muted-copy">
        This changes the trusted application shell. Every Room keeps its owner’s
        chosen theme.
      </p>
      {message && (
        <p className="form-notice success" role="status">
          {message}
        </p>
      )}
      <button className="button-primary" disabled={busy} type="submit">
        {busy ? 'Saving…' : 'Save appearance'}
      </button>
    </form>
  );
}
