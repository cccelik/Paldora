import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { roomHref } from '../lib/room-theme';
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
  room = false,
  children,
}: {
  person: PersonLike;
  /**
   * Link the name to their Room. The Room decides who may see it; a link
   * never widens access (a denied visit is the shared not-found page).
   */
  room?: boolean;
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
          {room ? (
            <Link
              className={`${styles.name} ${styles.roomLink}`}
              href={roomHref(person.username) as Route}
              aria-label={`${person.displayName}’s Room`}
            >
              {person.displayName}
            </Link>
          ) : (
            <span className={styles.name}>{person.displayName}</span>
          )}
          <span className={styles.username}>@{person.username}</span>
        </div>
        {note}
      </div>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </li>
  );
}
