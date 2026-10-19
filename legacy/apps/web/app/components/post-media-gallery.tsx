'use client';

import type { Post, PostId } from '@paldora/domain';
import { useRef, useState } from 'react';
import { PostMediaLightbox } from './post-media-lightbox';

export function PostMediaGallery({
  media,
  authorName,
  postId,
}: {
  media: Post['media'];
  authorName: string;
  postId: PostId;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  function open(index: number) {
    setSelectedIndex(index);
    dialog.current?.showModal();
  }

  return (
    <>
      <div
        className={`post-media-grid post-media-count-${media.length}`}
        aria-label={`Photos shared by ${authorName}`}
      >
        {media.map((item, index) =>
          item.status === 'ready' && item.url && item.thumbnailUrl ? (
            <button
              className="post-media-item"
              key={item.id}
              type="button"
              aria-label={`Open photo ${index + 1} from ${authorName}`}
              onClick={() => open(index)}
            >
              <img
                src={item.thumbnailUrl}
                alt={`Photo ${index + 1} shared by ${authorName}`}
                width={item.width ?? undefined}
                height={item.height ?? undefined}
              />
            </button>
          ) : (
            <div
              className={`post-media-item post-media-${item.status}`}
              key={item.id}
              role="status"
            >
              {item.status === 'failed'
                ? 'Photo processing failed'
                : 'Preparing photo…'}
            </div>
          ),
        )}
      </div>
      <PostMediaLightbox
        media={media}
        authorName={authorName}
        postId={postId}
        selectedIndex={selectedIndex}
        dialogRef={dialog}
        onSelect={setSelectedIndex}
      />
    </>
  );
}
