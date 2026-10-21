import styles from '@/components/ui/card.module.css';
import { type HTMLAttributes } from 'react';
export function Card({
  as: Element = 'div',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' }) {
  return (
    <Element
      {...props}
      className={[styles.card, className].filter(Boolean).join(' ')}
    />
  );
}
