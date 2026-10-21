import styles from './form-message.module.css';
export type MessageTone = 'success' | 'attention' | 'failure';

/**
 * Inline feedback for a form. The live region always exists, so screen
 * readers announce messages that appear after submission.
 */
export function FormMessage({
  message,
  tone,
}: {
  message?: string | undefined;
  tone?: MessageTone | undefined;
}) {
  return (
    <div role={tone === 'failure' ? 'alert' : 'status'} aria-live="polite">
      {message ? (
        <p className={`${styles.message} ${styles[tone ?? 'success']}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
