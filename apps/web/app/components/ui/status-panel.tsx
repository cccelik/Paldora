import styles from '@/components/ui/status-panel.module.css';
import { type ReactNode } from 'react';
/**
 * An in-shell state (inaccessible, error, deleted): a Fraunces title, a line
 * of plain language and one action. Absence and denial share one wording.
 */
export function StatusPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={styles.panel} aria-labelledby="status-title">
      <h1 id="status-title" className={styles.title}>
        {title}
      </h1>
      <p className={styles.detail}>{children}</p>
      {action}
    </section>
  );
}
