import { LocalTime } from '@/components/common/local-time';
import styles from '@/components/rooms/room-widget-parts.module.css';
import { ROOM_WIDGET_LABELS, type RoomWidgetType } from '@paldora/domain';
import { type Route } from 'next';
import Link from 'next/link';
import { type ReactNode } from 'react';
export function Widget({
  type,
  position,
  children,
}: {
  type: RoomWidgetType;
  position: number;
  children: ReactNode;
}) {
  const id = `room-widget-${type}`;
  return (
    <section
      className={`pal-custom-card ${styles.widget}`}
      data-position={position}
      aria-labelledby={id}
    >
      <h2 id={id} className={styles.title}>
        {ROOM_WIDGET_LABELS[type]}
      </h2>
      {children}
    </section>
  );
}

/** The owner's quiet hint, or a visitor's honest short line. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export function Preview({
  href,
  title,
  where,
  at,
}: {
  href: string;
  title: string;
  where: string;
  at: string;
}) {
  return (
    <li className={styles.preview}>
      <Link className={styles.previewLink} href={href as Route}>
        {title}
      </Link>
      <span className={styles.previewMeta}>
        <LocalTime iso={at} /> · in {where}
      </span>
    </li>
  );
}
