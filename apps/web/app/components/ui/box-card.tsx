import { AvatarStack } from '@/components/ui/avatar';
import styles from '@/components/ui/box-card.module.css';
import { Chip, type ChipDot } from '@/components/ui/chip';
import { type Route } from 'next';
import Link from 'next/link';
import { type ReactNode } from 'react';
/** Figma "Box card" (44:93): cover 128, colour dot, member stack, "n new" chip. */
export function BoxCard({
  href,
  name,
  meta,
  cover,
  dot = 'ember',
  members = [],
  unread = 0,
}: {
  href?: string;
  name: string;
  /** For example "11 members · weekly". */
  meta: ReactNode;
  cover?: ReactNode;
  dot?: ChipDot;
  members?: readonly { id: string; name: string | null; url?: string | null }[];
  unread?: number;
}) {
  const body = (
    <>
      <div className={styles.cover}>{cover}</div>
      <div className={styles.footer}>
        <div className={styles.text}>
          <p className={styles.name}>
            <span
              className={`${styles.dot} ${styles[dot]}`}
              aria-hidden="true"
            />
            {name}
          </p>
          <p className={styles.meta}>{meta}</p>
        </div>
        {unread > 0 ? <Chip kind="accent">{unread} new</Chip> : null}
        {members.length > 0 ? <AvatarStack people={members} /> : null}
      </div>
    </>
  );
  return href ? (
    <Link className={`${styles.card} ${styles.link}`} href={href as Route}>
      {body}
    </Link>
  ) : (
    <div className={styles.card}>{body}</div>
  );
}
