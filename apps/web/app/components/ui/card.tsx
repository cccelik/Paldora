import { type HTMLAttributes } from 'react';
import styles from './card.module.css';
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
