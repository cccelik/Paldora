import styles from '@/components/ui/page-columns.module.css';
import { type ReactNode } from 'react';
/**
 * The Figma web layout inside the shell: a feed column and, from 1280px, a
 * 388px right rail. Below that the rail drops under the main column. The
 * rail is a complementary landmark and needs a name.
 */
export function PageColumns({
  children,
  rail,
  railLabel,
  narrow = false,
}: {
  children: ReactNode;
  rail?: ReactNode;
  railLabel?: string;
  /** Keeps a single column at the reading width (forms, settings). */
  narrow?: boolean;
}) {
  return (
    <div
      className={`${styles.columns} ${rail ? styles.withRail : ''} ${narrow ? styles.narrow : ''}`}
    >
      <div className={styles.main}>{children}</div>
      {rail ? (
        <aside className={styles.rail} aria-label={railLabel}>
          {rail}
        </aside>
      ) : null}
    </div>
  );
}
