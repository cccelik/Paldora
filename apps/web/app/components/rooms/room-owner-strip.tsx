import styles from '@/components/rooms/room-owner-strip.module.css';
import { Badge, buttonClassName } from '@/components/ui';
import { roomHref } from '@/lib/rooms/room-theme';
import {
  ROOM_VISIBILITY_DESCRIPTIONS,
  ROOM_VISIBILITY_LABELS,
} from '@paldora/domain';
import { type RoomView } from '@paldora/validation';
import { type Route } from 'next';
import Link from 'next/link';
/**
 * Trusted app chrome above a Room, outside `.room-canvas` and its theme.
 * Only the owner gets it: who can visit, and the way to Customize.
 * Visitors' Rooms carry no owner-only fields, so this renders nothing.
 */
export function RoomOwnerStrip({ room }: { room: RoomView }) {
  if (room.relationship !== 'owner' || room.visibility === null) return null;
  return (
    <aside className={styles.strip} aria-label="Your Room">
      <p className={styles.audience}>
        <Badge tone="accent">
          Visible to: {ROOM_VISIBILITY_LABELS[room.visibility]}
        </Badge>{' '}
        <span className={styles.detail}>
          {ROOM_VISIBILITY_DESCRIPTIONS[room.visibility]} Visitors see what is
          below, filtered to what each of them can already see.
        </span>
      </p>
      <Link
        className={buttonClassName('secondary')}
        href={`${roomHref(room.owner.username)}/customize` as Route}
      >
        Customize
      </Link>
    </aside>
  );
}
