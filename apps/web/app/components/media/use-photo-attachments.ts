'use client';

import { completePostPhoto, postPhotoStatus } from '@/actions/post-photos';
import { type ActionOutcome } from '@/lib/actions/action-result';
import {
  asContentType,
  putToSignedUrl,
  uploadFailureMessage,
} from '@/lib/media/image-upload';
import { prepareMediaFile } from '@/lib/media/prepare-image';
import { untilProcessed } from '@/lib/media/media-polling';
import { type PreparedUpload } from '@/lib/media/upload';
import {
  POST_MEDIA_MAX_ITEMS,
  type MediaContentType,
  type MediaPurpose,
} from '@paldora/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
export interface Attachment {
  readonly key: number;
  readonly previewUrl: string;
  readonly phase: 'uploading' | 'processing' | 'ready' | 'failed';
  readonly mediaAssetId?: string;
  readonly message?: string;
}

type Patch = Partial<Omit<Attachment, 'key' | 'previewUrl'>>;

/** Reserves the signed upload for one file (the purpose decides the scope). */
export type PreparePhoto = (file: {
  contentType: MediaContentType;
  contentLength: number;
}) => Promise<ActionOutcome<PreparedUpload>>;

/** A photo that is already attached (an editor's starting point). */
export interface RetainedPhoto {
  readonly mediaAssetId: string;
  readonly previewUrl: string;
}

const retainedItems = (photos: readonly RetainedPhoto[]): Attachment[] =>
  photos.map((photo, index) => ({
    key: index,
    previewUrl: photo.previewUrl,
    phase: 'ready',
    mediaAssetId: photo.mediaAssetId,
  }));

/**
 * Up to four photos for one post or Life Update: reserve → PUT → complete →
 * wait for the worker. `prepare` reserves the upload for the right purpose;
 * `retained` are photos already attached, which start out ready. Photos
 * never attached are cleaned up by the server after a day.
 */
export function usePhotoAttachments(
  prepare: PreparePhoto,
  retained: readonly RetainedPhoto[] = [],
  purpose: MediaPurpose = 'post_image',
) {
  const [items, setItems] = useState<readonly Attachment[]>(() =>
    retainedItems(retained),
  );
  const nextKey = useRef(retained.length);
  const urls = useRef(new Set<string>());

  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const patch = useCallback((key: number, change: Patch) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  }, []);

  const upload = useCallback(
    async (key: number, file: File) => {
      const prepared = await prepare({
        contentType: asContentType(file.type),
        contentLength: file.size,
      });
      if (prepared.status !== 'success') {
        return patch(key, { phase: 'failed', message: prepared.message });
      }
      try {
        await putToSignedUrl(file, prepared.data);
      } catch (error) {
        return patch(key, {
          phase: 'failed',
          message: uploadFailureMessage(error, 'Couldn’t upload this photo.'),
        });
      }
      const completed = await completePostPhoto(prepared.data.mediaAssetId);
      if (completed.status !== 'success') {
        return patch(key, { phase: 'failed', message: completed.message });
      }
      patch(key, {
        phase: 'processing',
        mediaAssetId: prepared.data.mediaAssetId,
      });
      const outcome = await untilProcessed(
        prepared.data.mediaAssetId,
        postPhotoStatus,
      );
      return patch(key, {
        phase: outcome,
        ...(outcome === 'failed'
          ? { message: 'This photo couldn’t be read.' }
          : {}),
      });
    },
    [prepare, patch],
  );

  /** Type, size and pixel checks (resizing when needed) first; a rejected photo stays visible with its reason. */
  const validateThenUpload = useCallback(
    async (key: number, file: File) => {
      const ready = await prepareMediaFile(file, purpose);
      if (!ready.ok) {
        return patch(key, { phase: 'failed', message: ready.problem });
      }
      return upload(key, ready.file);
    },
    [purpose, patch, upload],
  );

  const add = useCallback(
    (files: readonly File[]) => {
      const room = POST_MEDIA_MAX_ITEMS - items.length;
      for (const file of files.slice(0, Math.max(room, 0))) {
        const key = nextKey.current;
        nextKey.current += 1;
        const previewUrl = URL.createObjectURL(file);
        urls.current.add(previewUrl);
        setItems((current) => [
          ...current,
          { key, previewUrl, phase: 'uploading' },
        ]);
        void validateThenUpload(key, file);
      }
    },
    [items.length, validateThenUpload],
  );

  const remove = useCallback((key: number) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);
  /** After posting: drop what was posted, keep failed photos so the person still sees why. */
  const clearPosted = useCallback(
    () =>
      setItems((current) => current.filter((item) => item.phase === 'failed')),
    [],
  );
  const failedCount = items.filter((item) => item.phase === 'failed').length;

  const busy = items.some(
    (item) => item.phase === 'uploading' || item.phase === 'processing',
  );
  const readyIds = items.flatMap((item) =>
    item.phase === 'ready' && item.mediaAssetId ? [item.mediaAssetId] : [],
  );
  return {
    items,
    add,
    remove,
    clear,
    clearPosted,
    failedCount,
    busy,
    readyIds,
    full: items.length >= POST_MEDIA_MAX_ITEMS,
  };
}
