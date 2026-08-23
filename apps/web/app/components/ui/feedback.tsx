import type { ReactNode } from 'react';
import { classNames } from './class-names';

type FeedbackTone = 'error' | 'success';
type ActionFeedbackState =
  | { status: 'idle'; message?: string }
  | { status: FeedbackTone; message?: string };

export function FeedbackMessage({
  children,
  tone,
  variant = 'form',
  className,
}: {
  children?: ReactNode;
  tone: FeedbackTone;
  variant?: 'form' | 'notice';
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      className={classNames(
        variant === 'notice' ? 'form-notice' : 'form-message',
        tone,
        className,
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

export function ActionFeedback({ state }: { state: ActionFeedbackState }) {
  if (state.status === 'idle') return null;
  return (
    <FeedbackMessage variant="notice" tone={state.status}>
      {state.message}
    </FeedbackMessage>
  );
}

export function PageFeedback({
  error,
  notice,
}: {
  error?: string | undefined;
  notice?: string | undefined;
}) {
  return (
    <>
      <FeedbackMessage tone="error" className="page-notice">
        {error}
      </FeedbackMessage>
      <FeedbackMessage tone="success" className="page-notice">
        {notice}
      </FeedbackMessage>
    </>
  );
}
