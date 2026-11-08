import { Icon } from '@/components/ui/icons';
import styles from '@/components/ui/life-update-card.module.css';
import { type ReactNode } from 'react';
/**
 * Figma "Life Update card" (44:74), the feed variant on `bg/inverse` (dark in
 * both modes). `action` is the call to action, normally an Accent button.
 */
export function LifeUpdateCard({
  title,
  when,
  quote,
  thumbnail,
  action,
  eyebrow = 'Life update',
}: {
  title: ReactNode;
  when: ReactNode;
  quote?: ReactNode;
  thumbnail?: ReactNode;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          <span className={styles.spark}>
            <Icon name="spark" size={16} />
          </span>
          {eyebrow}
        </p>
        <p className={styles.when}>{when}</p>
      </header>
      <h3 className={styles.title}>{title}</h3>
      {thumbnail || quote ? (
        <div className={styles.row}>
          {thumbnail ? (
            <div className={styles.thumbnail}>{thumbnail}</div>
          ) : null}
          {quote ? <p className={styles.quote}>{quote}</p> : null}
        </div>
      ) : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </article>
  );
}
