'use client';

import { useRef } from 'react';
import { AVATAR_ACCEPT } from '../lib/image-upload';
import { Avatar, Button, FormMessage } from './ui';
import { useAvatarUpload } from './use-avatar-upload';
import styles from './avatar-uploader.module.css';

function PhotoPreview({
  preview,
  busy,
  currentUrl,
  name,
}: {
  preview: string | null;
  busy: boolean;
  currentUrl: string | null;
  name: string | null;
}) {
  if (!preview) return <Avatar url={currentUrl} name={name} size="large" />;
  // A local blob preview of the chosen file, shown while it uploads.
  return (
    <img
      className={`${styles.preview} ${busy ? styles.busy : ''}`}
      src={preview}
      alt=""
    />
  );
}

const chooseLabel = (busy: boolean, hasPhoto: boolean) => {
  if (busy) return 'Uploading…';
  return hasPhoto ? 'Change photo' : 'Choose photo';
};

/**
 * Choose, replace, or remove a profile photo. Used in onboarding and in
 * account settings; onboarding hides removal and adds its own continue step.
 */
export function AvatarUploader({
  currentUrl,
  name,
  processing = false,
  allowRemove = true,
}: {
  currentUrl: string | null;
  name: string | null;
  /** The server already reports a newer photo being prepared. */
  processing?: boolean;
  allowRemove?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { preview, phase, message, upload, remove } = useAvatarUpload();
  const busy = phase === 'uploading' || phase === 'processing';
  const hasPhoto = Boolean(preview ?? currentUrl);
  const status =
    message ??
    (processing
      ? {
          text: 'Your new photo is still being prepared.',
          tone: 'success' as const,
        }
      : undefined);

  return (
    <div className={styles.uploader}>
      <div className={styles.row}>
        <PhotoPreview
          preview={preview}
          busy={busy}
          currentUrl={currentUrl}
          name={name}
        />
        <div className={styles.actions}>
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept={AVATAR_ACCEPT}
            aria-label="Choose a profile photo"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {chooseLabel(busy, hasPhoto)}
          </Button>
          {allowRemove && currentUrl && !busy ? (
            <Button variant="danger" onClick={() => void remove()}>
              Remove photo
            </Button>
          ) : null}
        </div>
      </div>
      <FormMessage message={status?.text} tone={status?.tone} />
      <p className={styles.help}>
        JPEG, PNG, or WebP, up to 10 MB. Location and camera details are removed
        before your photo is stored.
      </p>
    </div>
  );
}
