import {
  LifeUpdates,
  Memories,
  Posts,
} from '@/components/rooms/room-content-widgets';
import { Photos } from '@/components/rooms/room-photo-widget';
import { MusicCard, TopFriends } from '@/components/rooms/room-social-widgets';
import { Empty, Widget } from '@/components/rooms/room-widget-parts';
import styles from '@/components/rooms/room-widgets.module.css';
import { type WidgetProps } from '@/lib/rooms/room-preview-types';
import { type RoomWidgetType } from '@paldora/domain';
import { type ReactNode } from 'react';
export {
  ROOM_PHOTO_PREVIEW_COUNT,
  type RoomPreviews,
} from '@/lib/rooms/room-preview-types';

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
    previews.memories || previews.memoryCalendar ? (
      <Memories
        username={room.owner.username}
        summary={previews.memories}
        calendar={previews.memoryCalendar}
        isOwner={isOwner}
      />
    ) : null,
};
