import {
  roomThemeRegistry,
  type LifeUpdatePage,
  type MemoryPage,
  type PostPage,
  type RoomGalleryPage,
  type RoomView,
  type RoomWidgetType,
} from '@paldora/domain';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { InitialAvatar } from './ui';
import { roomPath } from '../lib/room-paths';

type RoomStyle = CSSProperties & Record<`--${string}`, string>;

export function RoomCanvas({
  room,
  posts,
  lifeUpdates,
  gallery,
  memories,
}: {
  room: RoomView;
  posts: PostPage;
  lifeUpdates: LifeUpdatePage;
  gallery: RoomGalleryPage;
  memories: MemoryPage;
}) {
  const theme = roomThemeRegistry[room.themePreset];
  const style: RoomStyle = {
    ...theme.variables,
    '--room-accent': accentColor(room.accent),
    ...(room.background === 'theme'
      ? {}
      : { '--room-canvas': backgroundColor(room.background) }),
    '--room-font-choice': fontFamily(room.font),
  };
  const widgets = new Map<RoomWidgetType, ReactNode>([
    ['currently', <CurrentlyWidget key="currently" room={room} />],
    ['music', <MusicWidget key="music" room={room} />],
    ['top_friends', <TopFriendsWidget key="friends" room={room} />],
    ['photos', <PhotosWidget gallery={gallery} key="photos" />],
    ['life_updates', <LifeUpdatesWidget key="life" page={lifeUpdates} />],
    ['posts', <PostsWidget key="posts" page={posts} />],
    ['memories', <MemoriesWidget key="memories" page={memories} />],
  ]);
  const enabled = room.widgets.filter(({ enabled }) => enabled);
  const main = enabled.filter(({ placement }) => placement === 'main');
  const sidebar = enabled.filter(({ placement }) => placement === 'sidebar');
  return (
    <section
      className={`room-canvas room-layout-${room.layout} room-decoration-${room.decorationPack}${room.sparkles ? ' has-sparkles' : ''}`}
      data-room-background={room.background}
      data-room-theme={room.themePreset}
      style={style}
    >
      <div
        className="room-banner"
        style={
          room.bannerUrl
            ? { backgroundImage: `url("${room.bannerUrl}")` }
            : undefined
        }
      >
        {room.sparkles && (
          <span aria-hidden="true" className="room-sparkles">
            ✦ · ✧ · ✦
          </span>
        )}
      </div>
      <header className="room-identity">
        <InitialAvatar
          className="room-avatar"
          imageUrl={room.owner.avatarUrl}
          name={
            room.owner.displayName ?? room.owner.username ?? 'Paldora member'
          }
          length={2}
        />
        <div>
          <h1>
            {room.owner.displayName ?? room.owner.username ?? 'Paldora member'}
          </h1>
          <p>@{room.owner.username}</p>
          {(room.location || room.currently) && (
            <p className="room-identity-meta">
              {room.location && <span>⌖ {room.location}</span>}
              {room.currently && <span>◌ {room.currently}</span>}
            </p>
          )}
          {room.owner.bio && <p className="room-bio">{room.owner.bio}</p>}
        </div>
      </header>
      <div className="room-widget-layout">
        <div className="room-widget-column room-widget-sidebar">
          {sidebar.map(({ type }) => widgets.get(type))}
        </div>
        <div className="room-widget-column room-widget-main">
          {main.map(({ type }) => widgets.get(type))}
        </div>
      </div>
    </section>
  );
}

function Widget({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="room-widget">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function CurrentlyWidget({ room }: { room: RoomView }) {
  return (
    <Widget title="Currently">
      <p>{room.currently || 'Nothing added here yet.'}</p>
    </Widget>
  );
}

function MusicWidget({ room }: { room: RoomView }) {
  return (
    <Widget title="Music">
      {room.music ? (
        <a
          className="room-music-card"
          href={room.music.url}
          rel="noreferrer"
          target="_blank"
        >
          <span aria-hidden="true">♪</span>
          <span>
            <strong>{room.music.title || 'Open music link'}</strong>
            {room.music.artist && <small>{room.music.artist}</small>}
          </span>
          <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <p>No music link yet.</p>
      )}
    </Widget>
  );
}

function TopFriendsWidget({ room }: { room: RoomView }) {
  return (
    <Widget title="My people">
      {room.topFriends.length ? (
        <div className="room-top-friends">
          {room.topFriends.map((friend) => (
            <Link href={roomPath(friend.username)} key={friend.userId}>
              <InitialAvatar
                imageUrl={friend.avatarUrl}
                length={1}
                name={friend.displayName}
              />
              <span>{friend.displayName}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p>This section is private or has not been filled yet.</p>
      )}
    </Widget>
  );
}

function PhotosWidget({ gallery }: { gallery: RoomGalleryPage }) {
  return (
    <Widget title="Photos">
      {gallery.items.length ? (
        <div className="room-photo-strip">
          {gallery.items.slice(0, 6).map((item) => (
            <Link
              href={
                item.lifeUpdateId
                  ? `/life-updates/${item.lifeUpdateId}?post=${item.postId}`
                  : `/posts/${item.postId}`
              }
              key={`${item.postId}:${item.media.id}`}
            >
              {item.media.thumbnailUrl ? (
                <img alt="Shared Room memory" src={item.media.thumbnailUrl} />
              ) : (
                <span>Processing</span>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <p>No photos are visible to you yet.</p>
      )}
    </Widget>
  );
}

function LifeUpdatesWidget({ page }: { page: LifeUpdatePage }) {
  return (
    <Widget title="Life Updates">
      <div className="room-preview-list">
        {page.items.slice(0, 3).map((update) => (
          <Link href={`/life-updates/${update.id}`} key={update.id}>
            <strong>
              {Object.values(update.sections)[0] || 'Photo update'}
            </strong>
            <small>{new Date(update.createdAt).toLocaleDateString()}</small>
          </Link>
        ))}
        {!page.items.length && <p>No visible Life Updates yet.</p>}
      </div>
    </Widget>
  );
}

function PostsWidget({ page }: { page: PostPage }) {
  return (
    <Widget title="Posts">
      <div className="room-preview-list">
        {page.items.slice(0, 4).map((post) => (
          <Link href={`/posts/${post.id}`} key={post.id}>
            <strong>{post.content || 'Photo post'}</strong>
            <small>
              {post.boxName} · {new Date(post.createdAt).toLocaleDateString()}
            </small>
          </Link>
        ))}
        {!page.items.length && <p>No posts are visible to you yet.</p>}
      </div>
    </Widget>
  );
}

function MemoriesWidget({ page }: { page: MemoryPage }) {
  return (
    <Widget title="Memory highlights">
      <div className="room-memory-row">
        {page.items.slice(0, 3).map((item) => {
          const id = item.type === 'post' ? item.post.id : item.lifeUpdate.id;
          return (
            <Link
              href={
                item.type === 'post' ? `/posts/${id}` : `/life-updates/${id}`
              }
              key={`${item.type}:${id}`}
            >
              <strong>
                {new Date(item.occurredAt).toLocaleDateString('en', {
                  month: 'short',
                  day: 'numeric',
                })}
              </strong>
              <span>{item.type === 'post' ? 'Post' : 'Life Update'}</span>
            </Link>
          );
        })}
        {!page.items.length && <p>No shared memories yet.</p>}
      </div>
    </Widget>
  );
}

function fontFamily(value: string): string {
  return (
    {
      editorial: "Georgia, 'Times New Roman', serif",
      modern: 'Inter, ui-sans-serif, system-ui, sans-serif',
      rounded: "'Arial Rounded MT Bold', Inter, sans-serif",
      mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      handwritten: "'Bradley Hand', 'Segoe Print', cursive",
    }[value] ?? 'Inter, ui-sans-serif, system-ui, sans-serif'
  );
}

function accentColor(value: string): string {
  return (
    {
      gold: '#b47a22',
      lavender: '#8c63bd',
      ocean: '#168ca0',
      daisy: '#db8d16',
      pink: '#c64fa1',
      emerald: '#2d8d55',
      cyan: '#00a9c7',
      crimson: '#a23c2d',
    }[value] ?? '#b47a22'
  );
}

function backgroundColor(value: string): string {
  return (
    {
      paper: '#f7efdf',
      midnight: '#15121d',
      gradient: '#e8dcf5',
      scrapbook: '#eee0c5',
      terminal: '#111814',
    }[value] ?? '#f7efdf'
  );
}
