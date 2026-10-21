'use client';

import { type Appearance } from '@paldora/domain';
import { useActionState } from 'react';
import { saveAppearanceAction } from '../actions/profile';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import styles from './appearance-form.module.css';
import formStyles from './form-stack.module.css';
import { SubmitButton } from './submit-button';
const options: readonly { value: Appearance; label: string; detail: string }[] =
  [
    {
      value: 'system',
      label: 'System',
      detail: 'Follow this device’s setting.',
    },
    { value: 'light', label: 'Light', detail: 'Warm ivory paper.' },
    { value: 'dark', label: 'Dark', detail: 'Obsidian ink.' },
  ];

/** App appearance only. Room themes are separate and arrive with Rooms. */
export function AppearanceForm({ current }: { current: Appearance }) {
  const [state, action] = useActionState(saveAppearanceAction, idleResult);
  return (
    <form action={action} className={formStyles.form}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Appearance</legend>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name="appearance"
              value={option.value}
              defaultChecked={option.value === current}
            />
            <span>
              <span className={styles.label}>{option.label}</span>
              <span className={styles.detail}>{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ActionFeedback state={state} />
      <div className={formStyles.actions}>
        <SubmitButton pendingLabel="Saving…">Save appearance</SubmitButton>
      </div>
    </form>
  );
}
