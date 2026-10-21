import styles from '@/components/ui/page-header.module.css';
import { type ReactNode } from 'react';
/** The h1 of a signed-in page, with optional badges and a description. */
export function PageHeader({
  title,
  description,
  meta,
}: {
  title: string;
  description?: string | undefined;
  meta?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {meta ? <div className={styles.meta}>{meta}</div> : null}
      {description ? <p className={styles.description}>{description}</p> : null}
    </header>
  );
}
