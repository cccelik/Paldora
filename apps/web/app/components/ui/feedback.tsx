'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { classNames } from './class-names';
import { PageToasts, Toast, ToastViewport } from './toast';

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
  const [successVisible, setSuccessVisible] = useState(
    state.status === 'success',
  );

  useEffect(() => {
    setSuccessVisible(state.status === 'success');
  }, [state]);

  if (state.status === 'idle' || !state.message) return null;
  if (state.status === 'success') {
    return successVisible ? (
      <ToastViewport>
        <Toast
          key={state.message}
          message={state.message}
          tone="success"
          onDismiss={() => setSuccessVisible(false)}
        />
      </ToastViewport>
    ) : null;
  }
  return (
    <FeedbackMessage variant="notice" tone="error">
      {state.message}
    </FeedbackMessage>
  );
}

export function PageFeedback({
  error,
  warning,
  notice,
}: {
  error?: string | undefined;
  warning?: string | undefined;
  notice?: string | undefined;
}) {
  return (
    <PageToasts
      key={`${error ?? ''}:${warning ?? ''}:${notice ?? ''}`}
      error={error}
      warning={warning}
      notice={notice}
    />
  );
}
