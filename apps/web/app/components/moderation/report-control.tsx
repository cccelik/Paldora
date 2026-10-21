'use client';

import { createReportAction } from '@/actions/reports';
import styles from '@/components/moderation/report-control.module.css';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { HiddenFields, TextAreaField } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import { useActionState } from 'react';

type TargetKind = 'user' | 'box' | 'post' | 'comment';

export function ReportControl({
  targetKind,
  targetId,
}: {
  targetKind: TargetKind;
  targetId: string;
}) {
  const [state, action] = useActionState(createReportAction, idleResult);
  const label = targetKind === 'user' ? 'person' : targetKind;
  return (
    <details className={styles.control}>
      <summary className={styles.summary}>Report this {label}</summary>
      <form action={action} className={styles.form}>
        <HiddenFields values={{ targetKind, targetId }} />
        <label className={styles.label} htmlFor={`report-category-${targetId}`}>
          Reason
        </label>
        <select
          className={styles.select}
          id={`report-category-${targetId}`}
          name="category"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Choose a reason
          </option>
          <option value="harassment">Harassment</option>
          <option value="spam">Spam</option>
          <option value="privacy">Privacy</option>
          <option value="other">Something else</option>
        </select>
        <TextAreaField
          id={`report-detail-${targetId}`}
          label="More information"
          name="detail"
          optional
          maxLength={2000}
          rows={3}
          help="Only moderators can read this. Please avoid sharing private details you do not need to include."
        />
        <ActionFeedback state={state} />
        <SubmitButton pendingLabel="Sending…" variant="secondary">
          Send report
        </SubmitButton>
      </form>
    </details>
  );
}
