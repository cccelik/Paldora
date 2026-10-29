import styles from '@/components/legal/legal-page.module.css';
import { LEGAL_LAST_UPDATED } from '@/lib/legal';
import { type ReactNode } from 'react';

/** The frame of one public information page: title, date, optional draft notice. */
export function LegalPage({
  title,
  summary,
  draft = false,
  children,
}: {
  title: string;
  summary: string;
  /** Terms and privacy are drafts until the owner and legal review them. */
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.summary}>{summary}</p>
        <p className={styles.updated}>
          Last updated{' '}
          <time dateTime={LEGAL_LAST_UPDATED}>{LEGAL_LAST_UPDATED}</time>
        </p>
        {draft ? (
          <p className={styles.draft} role="note">
            <strong>Draft pending owner and legal review.</strong> This page
            describes how Paldora works today. It is not yet a reviewed legal
            document.
          </p>
        ) : null}
      </header>
      {children}
    </article>
  );
}

/** A titled block of prose inside a legal page. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.heading}>
        {title}
      </h2>
      {children}
    </section>
  );
}
