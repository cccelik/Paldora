'use client';

import {
  cancelDeletionAction,
  requestDeletionAction,
  requestExportAction,
} from '@/actions/account-lifecycle';
import styles from '@/components/account/account-lifecycle-controls.module.css';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import { useActionState } from 'react';

export function AccountExportControls({
  status,
}: {
  status: 'pending' | 'ready' | 'expired' | null;
}) {
  const [state, action] = useActionState(requestExportAction, idleResult);
  return (
    <div className={styles.stack}>
      <p>
        Get a private JSON archive of your profile, posts, comments, reactions,
        Room settings, and owned media details.
      </p>
      {status === 'pending' ? <p>Your archive is being prepared.</p> : null}
      {status === 'ready' ? (
        <a className={styles.link} href="/settings/account/download">
          Download your archive
        </a>
      ) : null}
      <form action={action} className={styles.form}>
        <ActionFeedback state={state} />
        <SubmitButton pendingLabel="Requesting…" variant="secondary">
          {status === 'ready' ? 'Prepare a new archive' : 'Request an archive'}
        </SubmitButton>
      </form>
    </div>
  );
}

export function AccountDeletionControls({ dueAt }: { dueAt: string | null }) {
  const [requestState, request] = useActionState(
    requestDeletionAction,
    idleResult,
  );
  const [cancelState, cancel] = useActionState(
    cancelDeletionAction,
    idleResult,
  );
  const pending = dueAt !== null;
  return (
    <div className={styles.stack}>
      {pending ? (
        <p>
          Your account is scheduled for permanent deletion on{' '}
          <time dateTime={dueAt}>{new Date(dueAt).toLocaleDateString()}</time>.
          You can cancel before then.
        </p>
      ) : (
        <p>
          Your account and owned content will be permanently removed after a
          seven-day cancellation window. Transfer ownership of every Box you own
          first. Download your archive before requesting deletion.
        </p>
      )}
      <form action={pending ? cancel : request} className={styles.form}>
        <TextField
          id="deletion-password"
          name="password"
          label="Confirm your password"
          type="password"
          autoComplete="current-password"
          maxLength={256}
          required
        />
        <ActionFeedback
          state={
            pending
              ? cancelState.status === 'idle'
                ? requestState
                : cancelState
              : cancelState.status === 'success'
                ? cancelState
                : requestState
          }
        />
        <SubmitButton pendingLabel="Please wait…" variant="secondary">
          {pending ? 'Cancel deletion' : 'Request account deletion'}
        </SubmitButton>
      </form>
    </div>
  );
}
