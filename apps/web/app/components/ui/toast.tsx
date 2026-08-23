'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'warning' | 'error';

export function ToastViewport({ children }: { children: ReactNode }) {
  return (
    <div className="toast-viewport" aria-label="Notifications">
      {children}
    </div>
  );
}

export function Toast({
  message,
  onDismiss,
  tone = 'success',
  duration = 5_000,
}: {
  message: string;
  onDismiss: () => void;
  tone?: ToastTone;
  duration?: number;
}) {
  const onDismissRef = useRef(onDismiss);
  const style = {
    '--toast-duration': `${duration}ms`,
  } as CSSProperties;

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timeout = window.setTimeout(() => onDismissRef.current(), duration);
    return () => window.clearTimeout(timeout);
  }, [duration, message]);

  return (
    <div
      className={`toast toast-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      style={style}
    >
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss message">
        <svg aria-hidden="true" className="toast-countdown" viewBox="0 0 44 44">
          <circle className="toast-countdown-track" cx="22" cy="22" r="19" />
          <circle
            className="toast-countdown-progress"
            cx="22"
            cy="22"
            r="19"
            pathLength="100"
          />
        </svg>
        <svg
          aria-hidden="true"
          className="toast-dismiss-icon"
          viewBox="0 0 24 24"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

export function PageToasts({
  error,
  warning,
  notice,
}: {
  error?: string | undefined;
  warning?: string | undefined;
  notice?: string | undefined;
}) {
  const [visible, setVisible] = useState({
    error: Boolean(error),
    warning: Boolean(warning),
    notice: Boolean(notice),
  });

  useEffect(() => {
    setVisible({
      error: Boolean(error),
      warning: Boolean(warning),
      notice: Boolean(notice),
    });
  }, [error, warning, notice]);

  if (!visible.error && !visible.warning && !visible.notice) return null;

  return (
    <ToastViewport>
      {notice && visible.notice && (
        <Toast
          message={notice}
          tone="success"
          onDismiss={() =>
            setVisible((current) => ({ ...current, notice: false }))
          }
        />
      )}
      {warning && visible.warning && (
        <Toast
          message={warning}
          tone="warning"
          onDismiss={() =>
            setVisible((current) => ({ ...current, warning: false }))
          }
        />
      )}
      {error && visible.error && (
        <Toast
          message={error}
          tone="error"
          onDismiss={() =>
            setVisible((current) => ({ ...current, error: false }))
          }
        />
      )}
    </ToastViewport>
  );
}
