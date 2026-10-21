import styles from '@/components/rooms/room-social-widgets.module.css';
import { Empty } from '@/components/rooms/room-widget-parts';
import { Avatar } from '@/components/ui';
import { type WidgetProps } from '@/lib/rooms/room-preview-types';
import { musicLink, roomHref } from '@/lib/rooms/room-theme';
import { type RoomView } from '@paldora/validation';
import { type Route } from 'next';
import Link from 'next/link';
export function MusicCard({
  music,
}: {
  music: NonNullable<RoomView['music']>;
}) {
  const link = musicLink(music.url);
  const name = music.title ?? 'A song';
  const body = (
    <>
      <span className={styles.musicTitle}>{name}</span>
      {music.artist ? (
        <span className={styles.musicArtist}>{music.artist}</span>
      ) : null}
    </>
  );
  if (!link) return <p className={styles.music}>{body}</p>;
  return (
    <a
      className={`${styles.music} ${styles.musicLink}`}
      href={link.href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
    >
      {body}
      <span className={styles.musicHost}>{link.host} · Opens another site</span>
    </a>
  );
}

export function TopFriends({ room, isOwner }: Omit<WidgetProps, 'previews'>) {
  const { items } = room.topFriends;
  if (items === null) {
    return <Empty>{room.owner.displayName} keeps Top Friends private.</Empty>;
  }
  if (items.length === 0) {
    return (
      <Empty>
        {isOwner
          ? 'Choose the friends to show here in Customize.'
          : 'No Top Friends yet.'}
      </Empty>
    );
  }
  return (
    <ul className={styles.friends}>
      {items.map((friend) => (
        <li key={friend.id}>
          <Link
            className={styles.friend}
            href={roomHref(friend.username) as Route}
          >
            <Avatar url={friend.avatarUrl} name={friend.displayName} />
            <span className={styles.friendName}>{friend.displayName}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
