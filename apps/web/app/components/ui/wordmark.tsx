import styles from '@/components/ui/wordmark.module.css';
interface WordmarkProps {
  /** Renders as a heading-level brand title instead of inline text. */
  size?: 'inline' | 'display';
}

/** The Paldora wordmark: lowercase italic serif ending in an accent dot. */
export function Wordmark({ size = 'inline' }: WordmarkProps) {
  return (
    <span className={`${styles.wordmark} ${styles[size]}`}>
      paldora
      <span className={styles.dot} aria-hidden="true">
        .
      </span>
    </span>
  );
}
