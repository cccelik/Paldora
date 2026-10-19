'use client';

import { POST_MEDIA_MAX_ITEMS } from '@paldora/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completePostPhoto,
  postPhotoStatus,
  preparePostPhoto,
} from '../actions/post-photos';
import {
  asContentType,
  photoFileProblem,
  putToSignedUrl,
} from '../lib/image-upload';

export interface Attachment {
  readonly key: number;
  readonly previewUrl: string;
  readonly phase: 'uploading' | 'processing' | 'ready' | 'failed';
  readonly mediaAssetId?: string;
  readonly message?: string;
}

const POLL_MS = 1_500;
const MAX_POLLS = 40;
const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

type Phase = Attachment['phase'];
type Patch = Partial<Omit<Attachment, 'key' | 'previewUrl'>>;

/** Polls until the worker finishes or the wait runs out. */
async function untilProcessed(mediaAssetId: string): Promise<Phase> {
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    // One poll at a time by design: each waits for the previous answer.
    // eslint-disable-next-line no-await-in-loop
    await wait(POLL_MS);
    // eslint-disable-next-line no-await-in-loop
    const result = await postPhotoStatus(mediaAssetId);
    if (result.status === 'error') return 'failed';
    if (result.data === 'ready') return 'ready';
    if (result.data === 'failed' || result.data === 'deleted') return 'failed';
  }
  return 'failed';
}

/**
 * Up to four photos for one post: reserve → PUT → complete → wait for the
 * worker. Photos not used by a post are cleaned up by the server after a day.
 */
export function usePhotoAttachments(boxId: string) {
  const [items, setItems] = useState<readonly Attachment[]>([]);
  const nextKey = useRef(0);
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
      const prepared = await preparePostPhoto({
        boxId,
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
      const outcome = await untilProcessed(prepared.data.mediaAssetId);
      return patch(key, {
        phase: outcome,
        ...(outcome === 'failed'
          ? { message: 'This photo couldn’t be read.' }
          : {}),
      });
    },
    [boxId, patch],
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
