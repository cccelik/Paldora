import styles from '@/components/ui/badge.module.css';
import { type ReactNode } from 'react';
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
