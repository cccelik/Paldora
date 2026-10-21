'use client';

import { saveAppearanceAction } from '@/actions/profile';
import formStyles from '@/components/account/appearance-form-layout.module.css';
import styles from '@/components/account/appearance-form.module.css';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { idleResult } from '@/lib/actions/action-result';
import { type Appearance } from '@paldora/domain';
import { useActionState } from 'react';
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
