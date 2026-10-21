'use client';

import { POST_MEDIA_MAX_ITEMS, type MediaContentType } from '@paldora/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { completePostPhoto, postPhotoStatus } from '../actions/post-photos';
import { type ActionOutcome } from '../lib/action-result';
import {
  asContentType,
  photoFileProblem,
  putToSignedUrl,
} from '../lib/image-upload';
import { untilProcessed } from '../lib/media-polling';
import { type PreparedUpload } from '../lib/upload';
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
      } catch {
        return patch(key, {
          phase: 'failed',
          message: 'Couldn’t upload this photo.',
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

  const add = useCallback(
    (files: readonly File[]) => {
      const room = POST_MEDIA_MAX_ITEMS - items.length;
      for (const file of files.slice(0, Math.max(room, 0))) {
        const key = nextKey.current;
        nextKey.current += 1;
        const previewUrl = URL.createObjectURL(file);
        urls.current.add(previewUrl);
        const problem = photoFileProblem(file);
        setItems((current) => [
          ...current,
          {
            key,
            previewUrl,
            phase: problem ? 'failed' : 'uploading',
            ...(problem ? { message: problem } : {}),
          },
        ]);
        if (!problem) void upload(key, file);
      }
    },
    [items.length, upload],
  );

  const remove = useCallback((key: number) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

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
    busy,
    readyIds,
    full: items.length >= POST_MEDIA_MAX_ITEMS,
  };
}
