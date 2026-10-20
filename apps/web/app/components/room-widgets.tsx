import { ROOM_WIDGET_LABELS, type RoomWidgetType } from '@paldora/domain';
import type {
  LifeUpdateView,
  MemorySummaryView,
  PostView,
  RoomPhotoView,
  RoomView,
} from '@paldora/validation';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { countLabel, memoryHref } from '../lib/memories';
import { excerpt, musicLink, roomHref } from '../lib/room-theme';
import { LocalTime } from './local-time';
import { Avatar } from './ui';
import styles from './room-widgets.module.css';

/**
 * What the Room's content widgets show: the live items the viewer can reach
 * today, loaded only for enabled widgets (null when not loaded).
 */
export interface RoomPreviews {
  readonly posts: readonly PostView[] | null;
  readonly lifeUpdates: readonly LifeUpdateView[] | null;
  readonly photos: readonly RoomPhotoView[] | null;
  readonly memories: MemorySummaryView | null;
}

export const ROOM_PHOTO_PREVIEW_COUNT = 6;

interface WidgetProps {
  readonly room: RoomView;
  readonly previews: RoomPreviews;
  readonly isOwner: boolean;
}

function Widget({
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
      className={styles.widget}
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
function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

function MusicCard({ music }: { music: NonNullable<RoomView['music']> }) {
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

function TopFriends({ room, isOwner }: Omit<WidgetProps, 'previews'>) {
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

function photoHref(photo: RoomPhotoView): string {
  return photo.source.kind === 'post'
    ? `/posts/${photo.source.postId}`
    : `/life-updates/${photo.source.lifeUpdateId}?box=${photo.source.boxId}`;
}

function Photos({
  photos,
  isOwner,
}: {
  photos: readonly RoomPhotoView[];
  isOwner: boolean;
}) {
  const shown = photos.slice(0, ROOM_PHOTO_PREVIEW_COUNT);
  if (shown.length === 0) {
    return (
      <Empty>
        {isOwner
          ? 'Photos you share in your Boxes show up here.'
          : 'No photos to show yet.'}
      </Empty>
    );
  }
  return (
    <ul className={styles.photos}>
      {shown.map((photo, index) => (
        <li key={photo.photo.id}>
          <Link className={styles.photo} href={photoHref(photo) as Route}>
            <img
              src={photo.photo.thumbnailUrl}
              width={photo.photo.width}
              height={photo.photo.height}
              alt={`Photo ${index + 1} of ${shown.length}, from a ${
                photo.source.kind === 'post' ? 'post' : 'Life Update'
              }`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Preview({
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

function postTitle(post: PostView): string {
  if (post.content) return excerpt(post.content);
  const count = post.media.length;
  return count === 1 ? 'A photo' : `${count} photos`;
}

function Posts({
  posts,
  isOwner,
}: {
  posts: readonly PostView[];
  isOwner: boolean;
}) {
  const shown = posts.filter((post) => post.kind === 'post');
  if (shown.length === 0) {
    return (
      <Empty>
        {isOwner
          ? 'Your latest posts in your Boxes show up here.'
          : 'No posts to show yet.'}
      </Empty>
    );
  }
  return (
    <ul className={styles.previews}>
      {shown.map((post) => (
        <Preview
          key={post.id}
          href={`/posts/${post.id}`}
          title={postTitle(post)}
          where={post.box.name}
          at={post.createdAt}
        />
      ))}
    </ul>
  );
}

function lifeUpdateTitle(lifeUpdate: LifeUpdateView): string {
  const [first] = lifeUpdate.sections;
  if (first) return `${first.label}: ${excerpt(first.content)}`;
  const count = lifeUpdate.media.length;
  return count === 1 ? 'A photo' : `${count} photos`;
}

function LifeUpdates({
  lifeUpdates,
  isOwner,
}: {
  lifeUpdates: readonly LifeUpdateView[];
  isOwner: boolean;
}) {
  // Only Box deliveries the viewer is in; Only Me never reaches a Room.
  const shown = lifeUpdates.flatMap((lifeUpdate) => {
    const [context] = lifeUpdate.contexts;
    return context ? [{ lifeUpdate, context }] : [];
  });
  if (shown.length === 0) {
    return (
      <Empty>
        {isOwner
          ? 'Life Updates you share with your Boxes show up here.'
          : 'No Life Updates to show yet.'}
      </Empty>
    );
  }
  return (
    <ul className={styles.previews}>
      {shown.map(({ lifeUpdate, context }) => (
        <Preview
          key={lifeUpdate.id}
          href={`/life-updates/${lifeUpdate.id}?box=${context.box.id}`}
          title={lifeUpdateTitle(lifeUpdate)}
          where={lifeUpdate.contexts.map((each) => each.box.name).join(', ')}
          at={lifeUpdate.createdAt}
        />
      ))}
    </ul>
  );
}

function Memories({
  username,
  summary,
  isOwner,
}: {
  username: string;
  summary: MemorySummaryView;
  isOwner: boolean;
}) {
  const scope = { kind: 'room', username } as const;
  if (summary.years.length === 0) {
    return (
      <Empty>
        {isOwner
          ? 'What you share collects here, year by year.'
          : 'No memories to show yet.'}
      </Empty>
    );
  }
  return (
    <ul className={styles.years}>
      {summary.years.map(({ year, count }) => (
        <li key={year}>
          <Link
            className={styles.year}
            href={memoryHref(scope, { year }) as Route}
          >
            <span className={styles.yearLabel}>{year}</span>{' '}
            <span className={styles.yearCount}>{countLabel(count)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Each widget's body, or null when there is nothing a visitor should see
 * (an empty Currently or Music is left out entirely for visitors).
 */
const widgetBodies: Readonly<
  Record<RoomWidgetType, (props: WidgetProps) => ReactNode>
> = {
  currently: ({ room, isOwner }) => {
    if (room.currently) {
      return <p className={styles.currently}>{room.currently}</p>;
    }
    return isOwner ? <Empty>Say what you’re up to in Customize.</Empty> : null;
  },
  music: ({ room, isOwner }) => {
    if (room.music) return <MusicCard music={room.music} />;
    return isOwner ? <Empty>Add a song link in Customize.</Empty> : null;
  },
  top_friends: ({ room, isOwner }) => (
    <TopFriends room={room} isOwner={isOwner} />
  ),
  photos: ({ previews, isOwner }) => (
    <Photos photos={previews.photos ?? []} isOwner={isOwner} />
  ),
  posts: ({ previews, isOwner }) => (
    <Posts posts={previews.posts ?? []} isOwner={isOwner} />
  ),
  life_updates: ({ previews, isOwner }) => (
    <LifeUpdates lifeUpdates={previews.lifeUpdates ?? []} isOwner={isOwner} />
  ),
  memories: ({ room, previews, isOwner }) =>
    previews.memories ? (
      <Memories
        username={room.owner.username}
        summary={previews.memories}
        isOwner={isOwner}
      />
    ) : null,
};

/** A widget in its saved position, or nothing. */
export function RoomWidget({
  type,
  position,
  ...props
}: WidgetProps & { type: RoomWidgetType; position: number }) {
  const body = widgetBodies[type](props);
  if (body === null) return null;
  return (
    <Widget type={type} position={position}>
      {body}
    </Widget>
  );
}
