'use client';

import { useRouter } from 'next/navigation';
import {
  avatarUploadStatus,
  completeAvatarUpload,
  prepareAvatarUpload,
  removeAvatarAction,
} from '../actions/avatar';
import { avatarFileProblem } from '../lib/image-upload';
import { useMediaUpload, type MediaUploadSteps } from './use-media-upload';

export type { UploadPhase } from './use-media-upload';

const avatarSteps: MediaUploadSteps = {
  fileProblem: avatarFileProblem,
  prepare: prepareAvatarUpload,
  complete: completeAvatarUpload,
  status: avatarUploadStatus,
  copy: {
    uploading: 'Uploading your photo…',
    processing: 'Preparing your photo…',
    ready: 'Photo saved.',
    slow: 'Still preparing your photo. It will appear shortly.',
    unreadable: 'That file couldn’t be read as a photo. Try another one.',
    putFailed: 'The photo couldn’t be uploaded. Try again.',
  },
};

/**
 * The profile photo: the shared single-photo upload, then a refresh so the
 * new avatar shows everywhere. The previous photo stays until it is ready.
 */
export function useAvatarUpload() {
  const router = useRouter();
  const media = useMediaUpload(avatarSteps);

  async function upload(file: File): Promise<void> {
    if (await media.upload(file)) router.refresh();
  }

  async function remove(): Promise<void> {
    const result = await removeAvatarAction();
    media.settle(
      'idle',
      result.status === 'success'
        ? { text: result.message, tone: 'success' }
        : { text: result.message, tone: result.tone },
    );
    router.refresh();
  }

  return {
    preview: media.preview,
    phase: media.phase,
    message: media.message,
    upload,
    remove,
  };
}
