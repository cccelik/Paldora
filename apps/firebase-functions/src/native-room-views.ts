import type {
  NativeMemories,
  NativeMemoryItem,
} from '@paldora/firebase-trusted';
import { native, type RoomView } from '@paldora/validation';
import type { Firestore } from 'firebase-admin/firestore';
import type { NativeViews } from './native-views.js';

/**
 * Projects trusted Room and Memory results onto the native wire. Avatars and
 * banners are opaque media ids; the trusted services have already authorized
 * every item for this viewer, and `mediaRead` rechecks each byte read.
 */

/** Same banner rule as the web adapter: ready, and attached to this Room. */
async function bannerMediaId(
  db: Firestore,
  ownerUid: string,
): Promise<string | null> {
  const row = await db.collection('nativeRooms').doc(ownerUid).get();
  const id = row.get('bannerMediaId') as string | null | undefined;
  if (!id) return null;
  const asset = await db.collection('nativeMediaAssets').doc(id).get();
  return asset.get('status') === 'ready' &&
    asset.get('attachedRoomUid') === ownerUid
    ? id
    : null;
}

export async function roomView(
  db: Firestore,
  views: NativeViews,
  room: RoomView,
): Promise<native.NativeRoom> {
  const [owner, banner, topFriends] = await Promise.all([
    views.person(room.owner.id),
    bannerMediaId(db, room.owner.id),
    room.topFriends.items === null
      ? Promise.resolve(null)
      : Promise.all(
          room.topFriends.items.map(async (friend) => ({
            uid: friend.id,
            username: friend.username,
            displayName: friend.displayName,
            avatarMediaId: (await views.person(friend.id)).avatarMediaId,
          })),
        ),
  ]);
  return {
    owner: {
      uid: room.owner.id,
      username: room.owner.username,
      displayName: room.owner.displayName,
      bio: room.owner.bio,
      avatarMediaId: owner.avatarMediaId,
    },
    relationship: room.relationship,
    style: room.style,
    location: room.location,
    currently: room.currently,
    music: room.music,
    bannerMediaId: banner,
    widgets: room.widgets,
    topFriends: {
      size: room.topFriends.size,
      visibility: room.topFriends.visibility,
      items: topFriends,
    },
    visibility: room.visibility,
    updatedAt: room.updatedAt === null ? null : Date.parse(room.updatedAt),
    configurationVersion: room.configurationVersion,
  };
}

/** A save names the `updatedAt` the client loaded; the trusted schema takes ISO. */
export function isoVersion(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Ready photos only, with their size, as the web adapter lists them. */
export async function readyPhotos(
  db: Firestore,
  ids: readonly string[],
): Promise<Map<string, { width: number; height: number }>> {
  const result = new Map<string, { width: number; height: number }>();
  if (ids.length === 0) return result;
  const assets = await db.getAll(
    ...ids.map((id) => db.collection('nativeMediaAssets').doc(id)),
  );
  for (const asset of assets) {
    const width = asset.get('width') as number | undefined;
    const height = asset.get('height') as number | undefined;
    if (asset.exists && asset.get('status') === 'ready' && width && height)
      result.set(asset.id, { width, height });
  }
  return result;
}

const PHOTO_LIMIT = native.NATIVE_ROOM_PHOTO_MAX;

/** Up to six recent photos of a Room, newest first; every page rechecks the Room. */
export async function roomPhotos(
  db: Firestore,
  memories: NativeMemories,
  uid: string,
  username: string,
): Promise<native.NativeRoomPhoto[]> {
  const photos: native.NativeRoomPhoto[] = [];
  let cursor: string | undefined;
  // Keep previews bounded even when recent memories have no photos.
  for (
    let pageNumber = 0;
    pageNumber < 4 && photos.length < PHOTO_LIMIT;
    pageNumber += 1
  ) {
    // Each page rechecks Room visibility and canonical content state.
    // eslint-disable-next-line no-await-in-loop
    const page = await memories.page(
      uid,
      { kind: 'room', username },
      { limit: 50, cursor },
    );
    for (const item of page.items) {
      const source = photoSource(item);
      if (!source) continue;
      const ids =
        item.kind === 'post'
          ? item.post.mediaAssetIds
          : item.update.mediaAssetIds;
      // eslint-disable-next-line no-await-in-loop
      const ready = await readyPhotos(db, ids);
      for (const id of ids) {
        const size = ready.get(id);
        if (!size) continue;
        photos.push({
          mediaAssetId: id,
          ...size,
          source,
          occurredAt: item.occurredAt,
        });
        if (photos.length === PHOTO_LIMIT) break;
      }
      if (photos.length === PHOTO_LIMIT) break;
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return photos;
}

function photoSource(
  item: NativeMemoryItem,
): native.NativeRoomPhoto['source'] | null {
  if (item.kind === 'post') return { kind: 'post', postId: item.post.id };
  const context = item.update.contexts[0];
  return context
    ? {
        kind: 'life_update',
        lifeUpdateId: item.update.id,
        boxId: context.boxId,
      }
    : null;
}
