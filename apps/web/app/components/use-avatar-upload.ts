'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  avatarUploadStatus,
  completeAvatarUpload,
  prepareAvatarUpload,
  removeAvatarAction,
} from '../actions/avatar';
import {
  asContentType,
  avatarFileProblem,
  putToSignedUrl,
} from '../lib/image-upload';
import type { MessageTone } from './ui';

export type UploadPhase =
  'idle' | 'uploading' | 'processing' | 'ready' | 'failed';

const pollIntervalMs = 1_500;
const maxPolls = 40;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Waits for the worker to finish; ready, failed, or still processing. */
async function waitForProcessing(mediaAssetId: string) {
  for (let poll = 0; poll < maxPolls; poll += 1) {
    // Polls one at a time by design: each waits for the previous answer.
    // eslint-disable-next-line no-await-in-loop
    await wait(pollIntervalMs);
    // eslint-disable-next-line no-await-in-loop
    const result = await avatarUploadStatus(mediaAssetId);
    if (result.status === 'error') return 'failed';
    if (result.data === 'ready' || result.data === 'failed') return result.data;
  }
  return 'processing';
}

/**
 * Reserve → PUT to storage → complete → wait for the worker. The previous
 * photo stays in place until the new one is ready.
 */
export function useAvatarUpload() {
  const router = useRouter();
  const previewUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [message, setMessage] = useState<{ text: string; tone: MessageTone }>();

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const showPreview = (file: File | null) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewUrl.current);
  };

  const fail = (text: string) => {
    setPhase('failed');
    setMessage({ text, tone: 'attention' });
    showPreview(null);
  };

  async function upload(file: File): Promise<void> {
    const problem = avatarFileProblem(file);
    if (problem) return fail(problem);
    setPhase('uploading');
    setMessage({ text: 'Uploading your photo…', tone: 'success' });
    showPreview(file);
    const prepared = await prepareAvatarUpload({
      contentType: asContentType(file.type),
      contentLength: file.size,
    });
    if (prepared.status !== 'success') return fail(prepared.message);
    try {
      await putToSignedUrl(file, prepared.data);
    } catch {
      return fail('The photo couldn’t be uploaded. Try again.');
    }
    const completed = await completeAvatarUpload(prepared.data.mediaAssetId);
    if (completed.status !== 'success') return fail(completed.message);
    setPhase('processing');
    setMessage({ text: 'Preparing your photo…', tone: 'success' });
    const outcome = await waitForProcessing(prepared.data.mediaAssetId);
    if (outcome === 'failed') {
      return fail('That file couldn’t be read as a photo. Try another one.');
    }
    setPhase(outcome === 'ready' ? 'ready' : 'processing');
    setMessage({
      text:
        outcome === 'ready'
          ? 'Photo saved.'
          : 'Still preparing your photo. It will appear shortly.',
      tone: 'success',
    });
    router.refresh();
  }

  async function remove(): Promise<void> {
    const result = await removeAvatarAction();
    showPreview(null);
    setPhase('idle');
    setMessage(
      result.status === 'success'
        ? { text: result.message, tone: 'success' }
        : { text: result.message, tone: result.tone },
    );
    router.refresh();
  }

  return { preview, phase, message, upload, remove };
}
