import type { ReactNode } from 'react';
import styles from './section.module.css';

/** A titled panel: the repeated block of settings, friends, and Box pages. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <h2 id={`${id}-title`} className={styles.title}>
          {title}
        </h2>
        {description ? (
          <p className={styles.description}>{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
