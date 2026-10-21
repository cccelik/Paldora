'use client';

import { BOX_NAME_MAX_LENGTH } from '@paldora/domain';
import { useActionState, useState } from 'react';
import {
  createBoxAction,
  deleteBoxAction,
  renameBoxAction,
} from '../actions/boxes';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import styles from './form-stack.module.css';
import { SubmitButton } from './submit-button';
import { HiddenFields, TextField } from './ui';
export function CreateBoxForm() {
  const [state, action] = useActionState(createBoxAction, idleResult);
  return (
    <form action={action} className={styles.form}>
      <TextField
        label="Box name"
        id="new-box-name"
        name="name"
        maxLength={BOX_NAME_MAX_LENGTH}
        autoComplete="off"
        help="You can rename it later. Only people you invite can see it."
        required
      />
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Creating…">Create Box</SubmitButton>
      </div>
    </form>
  );
}

export function RenameBoxForm({
  boxId,
  name,
}: {
  boxId: string;
  name: string;
}) {
  const [state, action] = useActionState(renameBoxAction, idleResult);
  return (
    <form action={action} className={styles.form}>
      <HiddenFields values={{ boxId: boxId }} />
      <TextField
        label="Box name"
        id="rename-box"
        name="name"
        defaultValue={name}
        maxLength={BOX_NAME_MAX_LENGTH}
        autoComplete="off"
        required
      />
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Rename</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Permanent deletion asks for the exact name and a tick. The button only
 * unlocks when both match; the API checks the name again regardless.
 */
export function DeleteBoxForm({
  boxId,
  name,
}: {
  boxId: string;
  name: string;
}) {
  const [state, action] = useActionState(deleteBoxAction, idleResult);
  const [typed, setTyped] = useState('');
  const [understood, setUnderstood] = useState(false);
  const ready = typed === name && understood;
  return (
    <form action={action} className={styles.form}>
      <HiddenFields values={{ boxId: boxId }} />
      <TextField
        label={`Type “${name}” to confirm`}
        id="delete-box-name"
        name="confirmName"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        required
      />
      <label className={styles.check}>
        <input
          type="checkbox"
          name="acknowledge"
          value="yes"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
        />
        <span>
          I understand this can’t be undone and everyone loses access.
        </span>
      </label>
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton
          variant="danger"
          pendingLabel="Deleting…"
          disabled={!ready}
        >
          Delete this Box forever
        </SubmitButton>
      </div>
    </form>
  );
}
