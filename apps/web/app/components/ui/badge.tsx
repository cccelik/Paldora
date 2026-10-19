import type { ReactNode } from 'react';
import styles from './badge.module.css';

/** A small status or role label. Text always carries the meaning. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent';
}) {
  return (
    <span
      className={`${styles.badge} ${tone === 'accent' ? styles.accent : ''}`}
    >
      {children}
    </span>
  );
}
