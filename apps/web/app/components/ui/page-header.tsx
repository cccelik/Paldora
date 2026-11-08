import styles from '@/components/ui/page-header.module.css';
import { type ReactNode } from 'react';
/**
 * The h1 of a signed-in page (Figma Display/L): an optional eyebrow above,
 * an italic accent after the title, badges, a description and a trailing
 * `action` (for example "Mark all read").
 */
export function PageHeader({
  title,
  accent,
  eyebrow,
  description,
  meta,
  action,
}: {
  title: string;
  /** The italic brass half of the title, for example "Alice." */
  accent?: string | undefined;
  eyebrow?: string | undefined;
  description?: string | undefined;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.title}>
          {title}
          {accent ? (
            <>
              {' '}
              <em className={styles.accent}>{accent}</em>
            </>
          ) : null}
        </h1>
        {meta ? <div className={styles.meta}>{meta}</div> : null}
        {description ? (
          <p className={styles.description}>{description}</p>
        ) : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </header>
  );
}
