import styles from '@/components/rooms/room-photo-widget.module.css';
import { Empty } from '@/components/rooms/room-widget-parts';
import { ROOM_PHOTO_PREVIEW_COUNT } from '@/lib/rooms/room-preview-types';
import { type RoomPhotoView } from '@paldora/validation';
import { type Route } from 'next';
import Link from 'next/link';
export function photoHref(photo: RoomPhotoView): string {
  return photo.source.kind === 'post'
    ? `/posts/${photo.source.postId}`
    : `/life-updates/${photo.source.lifeUpdateId}?box=${photo.source.boxId}`;
}

export function Photos({
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
