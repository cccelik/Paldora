'use client';

import styles from './status-page.module.css';
interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Segment error boundary. Shows no error details: the digest correlates with
 * server logs without exposing internals to the viewer.
 */
export default function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <main id="main" className={styles.page}>
      <h1 className={styles.title}>Something went wrong.</h1>
      <p className={styles.detail}>
        Nothing you shared was lost. Try again in a moment.
        {error.digest ? ` Reference: ${error.digest}` : null}
      </p>
      <button className={styles.action} type="button" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
