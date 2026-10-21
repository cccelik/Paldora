import styles from '@/components/ui/empty-state.module.css';
import { type ReactNode } from 'react';
/** The honest "nothing here yet" line. Never filled with sample data. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
