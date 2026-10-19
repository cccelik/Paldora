import type { ReactNode } from 'react';
import { Avatar } from './ui';
import styles from './person-row.module.css';

export interface PersonLike {
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null | undefined;
}

/** A list of people. Rows stack their actions under the name on narrow screens. */
export function PersonList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <ul className={styles.list} aria-label={label}>
      {children}
    </ul>
  );
}

export function PersonRow({
  person,
  note,
  children,
}: {
  person: PersonLike;
  /** Extra context shown with the name, such as a role badge. */
  note?: ReactNode;
  /** The row's actions. */
  children?: ReactNode;
}) {
  return (
    <li className={styles.row}>
      <div className={styles.who}>
        <Avatar url={person.avatarUrl} name={person.displayName} />
        <div className={styles.names}>
          <span className={styles.name}>{person.displayName}</span>
          <span className={styles.username}>@{person.username}</span>
        </div>
        {note}
      </div>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </li>
  );
}
