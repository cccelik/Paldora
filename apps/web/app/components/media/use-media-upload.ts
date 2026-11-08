'use client';

import { type PreparePhoto } from '@/components/media/use-photo-attachments';
import { type MessageTone } from '@/components/ui';
import { type ActionOutcome } from '@/lib/actions/action-result';
import {
  asContentType,
  putToSignedUrl,
  uploadFailureMessage,
} from '@/lib/media/image-upload';
import { type PreparedMedia } from '@/lib/media/prepare-image';
import { untilSettled } from '@/lib/media/media-polling';
import { type MediaAssetView } from '@paldora/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
export type UploadPhase =
  'idle' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface UploadMessage {
  readonly text: string;
  readonly tone: MessageTone;
}

type StatusCheck = (
  mediaAssetId: string,
) => Promise<ActionOutcome<MediaAssetView['status']>>;

/** What one purpose's single-photo upload needs: its actions and words. */
export interface MediaUploadSteps {
  /** Checks the file and resizes it when needed; the result is what gets uploaded. */
  readonly prepareFile: (file: File) => Promise<PreparedMedia>;
  readonly prepare: PreparePhoto;
  readonly complete: StatusCheck;
  readonly status: StatusCheck;
  readonly copy: {
    readonly uploading: string;
    readonly processing: string;
    readonly ready: string;
    /** The worker is still busy after the last poll. */
    readonly slow: string;
    readonly unreadable: string;
    readonly putFailed: string;
  };
}

/** Where an upload ended: ready, or still processing after the wait. */
export interface FinishedUpload {
  readonly mediaAssetId: string;
  readonly outcome: 'ready' | 'processing';
}

/**
 * One photo at a time: reserve → PUT to storage → complete → wait for the
 * worker. Shared by the avatar and the Room banner; each passes its own
 * purpose's actions and copy. Whatever is shown now stays in place until
 * the caller swaps it for the new photo.
 */
export function useMediaUpload(steps: MediaUploadSteps) {
  const previewUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [message, setMessage] = useState<UploadMessage>();

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const showPreview = useCallback((file: File | null) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewUrl.current);
  }, []);

  /** Sets the phase and message together (also after the caller's step). */
  const settle = useCallback(
    (next: UploadPhase, text?: UploadMessage) => {
      setPhase(next);
      setMessage(text);
      if (next === 'failed' || next === 'idle') showPreview(null);
    },
    [showPreview],
  );

  const fail = (text: string): null => {
    settle('failed', { text, tone: 'attention' });
    return null;
  };

  async function upload(file: File): Promise<FinishedUpload | null> {
    setPhase('uploading');
    setMessage({ text: steps.copy.uploading, tone: 'success' });
    const ready = await steps.prepareFile(file);
    if (!ready.ok) return fail(ready.problem);
    // Preview the original; upload the (possibly resized) file.
    showPreview(file);
    const toSend = ready.file;
    const prepared = await steps.prepare({
      contentType: asContentType(toSend.type),
      contentLength: toSend.size,
    });
    if (prepared.status !== 'success') return fail(prepared.message);
    try {
      await putToSignedUrl(toSend, prepared.data);
    } catch (error) {
      return fail(uploadFailureMessage(error, steps.copy.putFailed));
    }
    const { mediaAssetId } = prepared.data;
    const completed = await steps.complete(mediaAssetId);
    if (completed.status !== 'success') return fail(completed.message);
    setPhase('processing');
    setMessage({ text: steps.copy.processing, tone: 'success' });
    const outcome = await untilSettled(mediaAssetId, steps.status);
    if (outcome === 'failed') return fail(steps.copy.unreadable);
    settle(outcome, {
      text: outcome === 'ready' ? steps.copy.ready : steps.copy.slow,
      tone: 'success',
    });
    return { mediaAssetId, outcome };
  }

  return { preview, phase, message, upload, settle };
}
