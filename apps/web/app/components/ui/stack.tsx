import styles from '@/components/ui/stack.module.css';
import { type HTMLAttributes } from 'react';
export function Stack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={[styles.stack, className].filter(Boolean).join(' ')}
    />
  );
}
