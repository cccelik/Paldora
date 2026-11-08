import { Icon } from '@/components/ui/icons';
import styles from '@/components/ui/upload-tile.module.css';
import { type ReactNode } from 'react';
/** Composer media states, at most four tiles per post. */
export type UploadState =
  'done' | 'uploading' | 'processing' | 'failed' | 'add';

/** Spoken label per state, also the tile's accessible name. */
export function uploadLabel(state: UploadState, progress = 0): string {
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  switch (state) {
    case 'done':
      return 'Photo';
    case 'uploading':
      return `Uploading, ${percent} percent`;
    case 'processing':
      return 'Processing';
    case 'failed':
      return 'Upload failed. Press to retry';
    case 'add':
      return 'Add photo';
  }
}

/**
 * Figma "Upload tile" (44:166): a square with radius 18. Done shows the
 * thumbnail; Uploading, Processing and Failed cover it with the inverse
 * surface; Add is a dashed sunken tile. Failed and Add are buttons.
 */
export function UploadTile({
  state,
  progress = 0,
  thumbnail,
  onAction,
}: {
  state: UploadState;
  /** 0 to 1, for Uploading. */
  progress?: number;
  thumbnail?: ReactNode;
  /** Retry (Failed) or choose a photo (Add). */
  onAction?: () => void;
}) {
  const label = uploadLabel(state, progress);
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  const content = (
    <>
      {state === 'add' ? (
        <>
          <Icon name="plus" size={24} />
          <span className={styles.caption}>Add</span>
        </>
      ) : (
        <>
          <span className={styles.thumb}>{thumbnail}</span>
          {state === 'done' ? null : (
            <span className={styles.cover}>
              {state === 'uploading' ? (
                <span className={styles.percent}>{percent}%</span>
              ) : null}
              {state === 'processing' ? (
                <span className={styles.caption}>Processing</span>
              ) : null}
              {state === 'failed' ? (
                <>
                  <Icon name="refresh" size={22} />
                  <span className={styles.caption}>Retry</span>
                </>
              ) : null}
            </span>
          )}
        </>
      )}
    </>
  );
  if (state === 'failed' || state === 'add') {
    return (
      <button
        type="button"
        className={`${styles.tile} ${styles[state]}`}
        aria-label={label}
        {...(onAction ? { onClick: onAction } : {})}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      className={`${styles.tile} ${styles[state]}`}
      role={state === 'done' ? 'img' : 'progressbar'}
      aria-label={label}
      {...(state === 'uploading'
        ? { 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent }
        : {})}
    >
      {content}
    </div>
  );
}
