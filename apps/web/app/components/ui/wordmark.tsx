import styles from '@/components/ui/wordmark.module.css';
interface WordmarkProps {
  /** Renders as a heading-level brand title instead of inline text. */
  size?: 'inline' | 'display';
}

/** The Paldora wordmark: editorial serif with one four-point star. */
export function Wordmark({ size = 'inline' }: WordmarkProps) {
  return (
    <span className={`${styles.wordmark} ${styles[size]}`}>
      <span className={styles.star} aria-hidden="true">
        ✦
      </span>
      Paldora
    </span>
  );
}
