'use client';

import styles from '@/components/media/post-photos.module.css';
import { type PostMediaView } from '@paldora/validation';
import { useEffect, useRef, useState } from 'react';
/**
 * A post's photos as a grid, with a full-screen viewer. The viewer is a native
 * modal dialog, which provides the focus trap, Escape to close, and focus
 * return; arrow keys and buttons step through the photos.
 */
export function PostPhotos({
  photos,
  authorName,
}: {
  photos: readonly PostMediaView[];
  authorName: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const count = photos.length;
  const label = (index: number) =>
    `Photo ${index + 1} of ${count} by ${authorName}`;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open !== null && !element.open) element.showModal();
    if (open === null && element.open) element.close();
  }, [open]);

  if (count === 0) return null;
  const layout =
    count === 1 ? styles.single : count === 2 ? styles.two : styles.many;
  const current = open === null ? undefined : photos[open];

  return (
    <>
      <ul className={`${styles.grid} ${layout}`} aria-label="Photos">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              className={styles.tile}
              onClick={() => setOpen(index)}
              aria-label={`Open ${label(index).toLowerCase()}`}
            >
              <img
                className={styles.image}
                src={photo.thumbnailUrl}
                width={photo.width}
                height={photo.height}
                alt={label(index)}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label={open === null ? 'Photo viewer' : label(open)}
        onClose={() => setOpen(null)}
        onKeyDown={(event) => {
          if (open === null) return;
          if (event.key === 'ArrowRight')
            setOpen(Math.min(open + 1, count - 1));
          if (event.key === 'ArrowLeft') setOpen(Math.max(open - 1, 0));
        }}
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === dialog.current) setOpen(null);
        }}
      >
        {current && open !== null ? (
          <div className={styles.stage}>
            <div className={styles.bar}>
              <span className={styles.count} aria-live="polite">
                {open + 1} of {count}
              </span>
              <button
                type="button"
                className={styles.control}
                onClick={() => setOpen(null)}
              >
                Close
              </button>
            </div>
            <div className={styles.full}>
              <img
                src={current.url}
                width={current.width}
                height={current.height}
                alt={label(open)}
                referrerPolicy="no-referrer"
              />
            </div>
            <div className={styles.controls}>
              <button
                type="button"
                className={styles.control}
                disabled={open === 0}
                onClick={() => setOpen(open - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className={styles.control}
                disabled={open === count - 1}
                onClick={() => setOpen(open + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
