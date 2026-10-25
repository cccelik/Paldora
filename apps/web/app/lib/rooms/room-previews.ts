import { type RoomPreviews } from '@/lib/rooms/room-preview-types';
import { orNotFound } from '@/lib/server/session';
import { type FirebaseWebData } from '@/lib/server/firebase/data';
import { type RoomWidgetType } from '@paldora/domain';
import { type RoomView, type UserSummary } from '@paldora/validation';
import 'server-only';
const absent = ['ROOM_NOT_FOUND'];

/**
 * What a Room's content widgets show, loaded in parallel through the Room
 * content routes (which re-authorize for this viewer). Only enabled widgets
 * are loaded, unless `every` asks for all of them (the customizer, where a
 * widget may be switched on before the preview is saved).
 */
export async function loadRoomPreviews(
  api: Pick<
    FirebaseWebData,
    'roomContent' | 'roomPhotos' | 'roomContentSummary'
  >,
  room: RoomView,
  { every = false }: { every?: boolean } = {},
): Promise<RoomPreviews> {
  const enabled = new Set<RoomWidgetType>(
    room.widgets
      .filter((widget) => every || widget.enabled)
      .map((widget) => widget.type),
  );
  const username = room.owner.username;
  const when = <Value>(type: RoomWidgetType, load: () => Promise<Value>) =>
    enabled.has(type) ? orNotFound(load(), absent) : null;
  const [posts, lifeUpdates, photos] = await Promise.all([
    when('posts', () => api.roomContent(username, { type: 'posts', limit: 3 })),
    when('life_updates', () =>
      api.roomContent(username, { type: 'life_updates', limit: 3 }),
    ),
    when('photos', () => api.roomPhotos(username)),
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
    memories: null,
    memoryCalendar: enabled.has('memories'),
  };
}

/** Pages of accepted friends the Top Friends picker may read at most. */
export const TOP_FRIEND_PICKER_PAGES = 4;

/**
 * The owner's accepted friends for the Top Friends picker, at most four
 * pages (200 people). `more` says the list was cut, so the page can say so.
 */
export async function loadFriendChoices(
  api: Pick<FirebaseWebData, 'friends'>,
): Promise<{ friends: UserSummary[]; more: boolean }> {
  const friends: UserSummary[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < TOP_FRIEND_PICKER_PAGES; page += 1) {
    // Keyset pages are sequential: each needs the previous page's cursor.
    // eslint-disable-next-line no-await-in-loop
    const result = await api.friends({
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    friends.push(
      ...result.items
        .filter((friendship) => friendship.status === 'accepted')
        .map((friendship) => friendship.user),
    );
    if (!result.nextCursor) return { friends, more: false };
    cursor = result.nextCursor;
  }
  return { friends, more: true };
}
