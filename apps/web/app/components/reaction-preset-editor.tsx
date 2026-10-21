'use client';

import { DEFAULT_REACTION_PRESETS } from '@paldora/domain';
import { useActionState, useState } from 'react';
import { reactionPresetsAction } from '../actions/presets';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import { EmojiChooser } from './emoji-chooser';
import styles from './reaction-preset-editor.module.css';
import { SubmitButton } from './submit-button';
import { Button, HiddenFields } from './ui';
/**
 * Five slots, each changed through the same chooser the reaction bar uses.
 * Saving sends all five; the server checks they are distinct emoji.
 */
export function ReactionPresetEditor({
  current,
}: {
  current: readonly string[];
}) {
  const [state, action] = useActionState(reactionPresetsAction, idleResult);
  const [slots, setSlots] = useState<readonly string[]>(current);
  const [notice, setNotice] = useState('');

  const replace = (index: number, emoji: string) => {
    setSlots((previous) => {
      const next = [...previous];
      // Choosing an emoji that is already in another slot swaps the two.
      const existing = next.indexOf(emoji);
      if (existing !== -1 && existing !== index) {
        next[existing] = next[index] ?? emoji;
      }
      next[index] = emoji;
      return next;
    });
    setNotice('');
  };

  return (
    <form action={action} className={styles.form}>
      <ol className={styles.slots} aria-label="Your five shortcuts">
        {slots.map((emoji, index) => (
          <li key={index} className={styles.slot}>
            <HiddenFields values={{ [`preset${index}`]: emoji }} />
            <EmojiChooser
              title={`Choose shortcut ${index + 1}`}
              trigger={<span aria-hidden="true">{emoji}</span>}
              triggerLabel={`Shortcut ${index + 1}: ${emoji}. Change`}
              triggerClassName={styles.trigger}
              choiceLabel={(choice) => `Use ${choice}`}
              onChoose={(choice) => replace(index, choice)}
            />
          </li>
        ))}
      </ol>
      <p className={styles.notice} role="status">
        {notice}
      </p>
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Save shortcuts</SubmitButton>
        <Button
          variant="secondary"
          onClick={() => {
            setSlots([...DEFAULT_REACTION_PRESETS]);
            setNotice('Defaults restored. Save to keep them.');
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </form>
  );
}
