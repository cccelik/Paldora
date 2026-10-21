import type { MemoryItemView, RoomPhotoView } from '@paldora/validation';

/**
 * Only Me never reaches a Room, even the owner's own (plan B1). The
 * candidate query already leaves it out; this keeps a later change there
 * from ever putting one on a shareable surface.
 */
export const isShareable = (item: MemoryItemView): boolean =>
  item.kind === 'post' || item.lifeUpdate.audience !== 'only_me';

/**
 * Every photo of already-authorized items, newest item first and in each
 * item's display order. A Life Update photo links through the first of the
 * viewer's own contexts (contexts list only Boxes the viewer is in).
 */
export function toRoomPhotos(
  items: readonly MemoryItemView[],
): RoomPhotoView[] {
  return items.flatMap((item): RoomPhotoView[] => {
    if (item.kind === 'post') {
      return item.post.media.map((photo) => ({
        photo,
        source: { kind: 'post', postId: item.post.id },
        occurredAt: item.occurredAt,
      }));
    }
    const [context] = item.lifeUpdate.contexts;
    if (!context || !isShareable(item)) return [];
    return item.lifeUpdate.media.map((photo) => ({
      photo,
      source: {
        kind: 'life_update',
        lifeUpdateId: item.lifeUpdate.id,
        boxId: context.box.id,
      },
      occurredAt: item.occurredAt,
    }));
  });
}
