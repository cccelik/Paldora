import { type ReactNode } from 'react';
import styles from './empty-state.module.css';
/** The honest "nothing here yet" line. Never filled with sample data. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
