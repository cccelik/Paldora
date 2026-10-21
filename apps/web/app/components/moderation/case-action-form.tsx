'use client';

import { moderateCaseAction } from '@/actions/moderation';
import styles from '@/components/moderation/case-action-form.module.css';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { HiddenFields, TextAreaField } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import { useActionState } from 'react';

export function CaseActionForm({
  caseId,
  targetKind,
  status,
  idempotencyKey,
}: {
  caseId: string;
  targetKind: 'user' | 'box' | 'post' | 'comment';
  status: 'open' | 'closed';
  idempotencyKey: string;
}) {
  const [state, action] = useActionState(moderateCaseAction, idleResult);
  const content = targetKind === 'post' || targetKind === 'comment';
  return (
    <form action={action} className={styles.form}>
      <HiddenFields values={{ caseId, idempotencyKey }} />
      <label htmlFor="moderation-action">Action</label>
      <select
        className={styles.select}
        id="moderation-action"
        name="action"
        defaultValue=""
        required
      >
        <option value="" disabled>
          Choose an action
        </option>
        {status === 'open' ? (
          <option value="close">Close without action</option>
        ) : null}
        {targetKind === 'user' && status === 'open' ? (
          <option value="suspend">Suspend account</option>
        ) : null}
        {targetKind === 'user' ? (
          <option value="unsuspend">Restore account access</option>
        ) : null}
        {content && status === 'open' ? (
          <option value="hide">Hide content and retire media</option>
        ) : null}
        {content ? <option value="restore">Restore content</option> : null}
      </select>
      <TextAreaField
        id="moderation-reason"
        label="Reason for the audit record"
        name="reason"
        minLength={20}
        maxLength={1000}
        rows={4}
        required
      />
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Recording…">Record action</SubmitButton>
    </form>
  );
}
