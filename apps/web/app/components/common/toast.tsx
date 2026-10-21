'use client';

import styles from '@/components/common/toast.module.css';
import { type ActionResult } from '@/lib/actions/action-result';
import {
  initialToastState,
  isErrorTone,
  nextExpiryDelay,
  toastReducer,
  type Toast,
  type ToastInput,
} from '@/lib/notifications/toast-queue';
import { type Route } from 'next';
import Link from 'next/link';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
type ShowToast = (toast: ToastInput) => void;

const ToastContext = createContext<ShowToast>(() => undefined);

/** Shows a short message in the shared stack at the bottom of the screen. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/**
 * Toasts a button-style action's result once, when it arrives. Forms keep
 * their inline `ActionFeedback` instead.
 */
export function useActionToast(state: ActionResult<unknown>) {
  const show = useToast();
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.status === 'success') {
      show({ message: state.message, tone: 'success' });
    } else if (state.status === 'error') {
      show({ message: state.message, tone: state.tone });
    }
  }, [state, show]);
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  return (
    <li className={styles.toast} data-tone={toast.tone}>
      <p className={styles.message}>
        {toast.message}
        {toast.link ? (
          <>
            {' '}
            <Link
              className={styles.link}
              href={toast.link.href as Route}
              onClick={() => onDismiss(toast.id)}
            >
              {toast.link.label}
            </Link>
          </>
        ) : null}
      </p>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss message"
        onClick={() => onDismiss(toast.id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

/**
 * The one toast stack for signed-in pages. Two live regions always exist,
 * so a message added later is announced: errors as alerts, everything else
 * politely. Hovering or focusing the stack pauses every timer.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, initialToastState);

  const show = useCallback<ShowToast>((toast) => {
    dispatch({ type: 'show', toast, now: Date.now() });
  }, []);
  const dismiss = useCallback((id: number) => {
    dispatch({ type: 'dismiss', id });
  }, []);

  useEffect(() => {
    const delay = nextExpiryDelay(state, Date.now());
    if (delay === null) return;
    const timer = setTimeout(
      () => dispatch({ type: 'expire', now: Date.now() }),
      delay,
    );
    return () => clearTimeout(timer);
  }, [state]);

  const pause = () => dispatch({ type: 'pause', now: Date.now() });
  const resume = () => dispatch({ type: 'resume', now: Date.now() });
  const errors = state.toasts.filter((toast) => isErrorTone(toast.tone));
  const others = state.toasts.filter((toast) => !isErrorTone(toast.tone));

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className={styles.region}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            resume();
          }
        }}
      >
        <div role="alert" className={styles.group}>
          {errors.length > 0 ? (
            <ul className={styles.list}>
              {errors.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
              ))}
            </ul>
          ) : null}
        </div>
        <div role="status" aria-live="polite" className={styles.group}>
          {others.length > 0 ? (
            <ul className={styles.list}>
              {others.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
