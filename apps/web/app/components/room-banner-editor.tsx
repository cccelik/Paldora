'use client';

import { type RoomView } from '@paldora/validation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { completePostPhoto, postPhotoStatus } from '../actions/post-photos';
import { prepareRoomBanner, saveRoomBanner } from '../actions/rooms';
import { idleResult, type ActionResult } from '../lib/action-result';
import { mediaFileProblem, PHOTO_ACCEPT } from '../lib/image-upload';
import { EditorSection, RoomSectionFeedback } from './room-editor-parts';
import styles from './room-editor.module.css';
import { Button, FormMessage } from './ui';
import { useMediaUpload, type MediaUploadSteps } from './use-media-upload';
import { reportRoomSave, type RoomSaveContext } from './use-room-save';
const bannerSteps: MediaUploadSteps = {
  fileProblem: (file) => mediaFileProblem(file, 'room_banner'),
  prepare: prepareRoomBanner,
  // Completion and status work for any upload the person owns.
  complete: completePostPhoto,
  status: postPhotoStatus,
  copy: {
    uploading: 'Uploading your banner…',
    processing: 'Preparing your banner…',
    ready: 'Banner ready. Saving it to your Room…',
    slow: 'Your banner is taking longer than usual. Try uploading it again in a moment.',
    unreadable: 'That file couldn’t be read as a photo. Try another one.',
    putFailed: 'The banner couldn’t be uploaded. Try again.',
  },
};

function BannerPreview({
  preview,
  banner,
  busy,
}: {
  preview: string | null;
  banner: RoomView['banner'];
  busy: boolean;
}) {
  if (preview) {
    // The chosen file, shown dimmed while it uploads and is prepared.
    return (
      <img
        className={`${styles.bannerImage} ${busy ? styles.busy : ''}`}
        src={preview}
        alt="The banner you chose, being prepared"
      />
    );
  }
  if (banner) {
    return (
      <img
        className={styles.bannerImage}
        src={banner.url}
        alt="Your current banner"
        referrerPolicy="no-referrer"
      />
    );
  }
  return <p className={styles.bannerEmpty}>No banner yet.</p>;
}

/**
 * The banner: reserve → PUT → complete → wait for the worker, then one
 * Room write attaches it. The current banner stays until the new one is
 * saved; removing it is a Room write too. The API retires the old photo.
 */
export function RoomBannerEditor({
  banner,
  context,
}: {
  banner: RoomView['banner'];
  context: RoomSaveContext;
}) {
  const input = useRef<HTMLInputElement>(null);
  const media = useMediaUpload(bannerSteps);
  const [saving, startSaving] = useTransition();
  const [result, setResult] = useState<ActionResult<RoomView>>(idleResult);
  // An upload takes a while; the save after it must use the version as it
  // is then (another section may have saved meanwhile), not as it was.
  const latest = useRef(context);
  useEffect(() => {
    latest.current = context;
  }, [context]);
  const busy =
    media.phase === 'uploading' || media.phase === 'processing' || saving;

  function save(bannerMediaId: string | null) {
    startSaving(async () => {
      const outcome = await saveRoomBanner({
        bannerMediaId,
        expectedUpdatedAt: latest.current.version,
      });
      reportRoomSave(outcome, latest.current);
      setResult(outcome);
      media.settle(outcome.status === 'success' ? 'idle' : 'failed');
    });
  }

  async function upload(file: File) {
    setResult(idleResult);
    const finished = await media.upload(file);
    if (finished?.outcome === 'ready') save(finished.mediaAssetId);
  }

  const lockedId = 'customize-banner-locked';
  return (
    <EditorSection
      id="customize-banner"
      title="Banner"
      description="A wide photo across the top of your Room, cropped to 3:1."
    >
      <div className={styles.banner}>
        <BannerPreview preview={media.preview} banner={banner} busy={busy} />
      </div>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept={PHOTO_ACCEPT}
        aria-label="Choose a banner photo"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      <FormMessage message={media.message?.text} tone={media.message?.tone} />
      <RoomSectionFeedback
        state={result}
        context={context}
        lockedId={lockedId}
      />
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={busy || context.stale}
          aria-describedby={context.stale ? lockedId : undefined}
          onClick={() => input.current?.click()}
        >
          {banner ? 'Change banner' : 'Choose banner photo'}
        </Button>
        {banner && !busy ? (
          <Button
            variant="danger"
            disabled={context.stale}
            onClick={() => save(null)}
          >
            Remove banner
          </Button>
        ) : null}
      </div>
      <p className={styles.hint}>
        JPEG, PNG, or WebP, up to 10 MB, and up to 20 uploads an hour. Location
        and camera details are removed before it is stored, and only people who
        can visit your Room can load it.
      </p>
    </EditorSection>
  );
}
