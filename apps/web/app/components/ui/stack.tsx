import { type HTMLAttributes } from 'react';
import styles from './stack.module.css';
export function Stack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={[styles.stack, className].filter(Boolean).join(' ')}
    />
  );
}
