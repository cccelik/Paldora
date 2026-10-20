import type { RoomWidgetType } from '@paldora/domain';
import type { RoomView } from '@paldora/validation';
import { notFound } from 'next/navigation';
import { RoomCanvas, type RoomPreviews } from '../../../components/room-canvas';
import { RoomOwnerStrip } from '../../../components/room-owner-strip';
import { ROOM_PHOTO_PREVIEW_COUNT } from '../../../components/room-widgets';
import { roomUsernameParam } from '../../../lib/room-theme';
import { apiClient, completedUser, orNotFound } from '../../../lib/session';
import styles from './page.module.css';

export const metadata = { title: 'Room' };

const absent = ['ROOM_NOT_FOUND'];

type Api = Awaited<ReturnType<typeof apiClient>>;

/** Loads only what the enabled widgets show, in parallel. */
async function loadPreviews(api: Api, room: RoomView): Promise<RoomPreviews> {
  const enabled = new Set<RoomWidgetType>(
    room.widgets
      .filter((widget) => widget.enabled)
      .map((widget) => widget.type),
  );
  const username = room.owner.username;
  const when = <Value,>(type: RoomWidgetType, load: () => Promise<Value>) =>
    enabled.has(type) ? orNotFound(load(), absent) : null;
  const [posts, lifeUpdates, photos, memories] = await Promise.all([
    when('posts', () => api.roomContent(username, { type: 'posts', limit: 3 })),
    when('life_updates', () =>
      api.roomContent(username, { type: 'life_updates', limit: 3 }),
    ),
    when('photos', () =>
      api.roomPhotos(username, { limit: ROOM_PHOTO_PREVIEW_COUNT }),
    ),
    when('memories', () => api.roomContentSummary(username)),
  ]);
  return {
    posts:
      posts?.items.flatMap((item) =>
        item.kind === 'post' ? [item.post] : [],
      ) ?? null,
    lifeUpdates:
      lifeUpdates?.items.flatMap((item) =>
        item.kind === 'life_update' ? [item.lifeUpdate] : [],
      ) ?? null,
    photos: photos?.items ?? null,
    memories,
  };
}

/**
 * Someone's Room, as the API says this viewer may see it. Missing,
 * hidden, blocked, and not-allowed are all the same not-found page with a
 * 404, and so is a URL that could never be a username (checked first).
 */
export default async function RoomPage({
  params,
}: PageProps<'/rooms/[username]'>) {
  await completedUser();
  const username = roomUsernameParam((await params).username);
  if (username === null) notFound();
  const api = await apiClient();
  const room = await orNotFound(api.room(username), absent);
  const previews = await loadPreviews(api, room);
  return (
    <div className={styles.page}>
      <RoomOwnerStrip room={room} />
      <RoomCanvas room={room} previews={previews} />
    </div>
  );
}
