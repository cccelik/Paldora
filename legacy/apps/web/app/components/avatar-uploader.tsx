'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import {
  isSupportedImageContentType,
  MAX_IMAGE_BYTES,
  uploadFileToSignedRequest,
} from '../lib/image-upload';
import { AvatarUploaderView } from './avatar-uploader-view';

export function AvatarUploader({
  currentUrl,
  onboarding = false,
}: {
  currentUrl?: string | null;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const localPreviewUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState(currentUrl ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  usePreviewCleanup(localPreviewUrl);

  async function upload(file: File) {
    if (
      !isSupportedImageContentType(file.type) ||
      file.size <= 0 ||
      file.size > MAX_IMAGE_BYTES
    ) {
      setMessage('Choose a JPEG, PNG, or WebP image up to 10 MB.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const api = createBrowserApiClient();
      const signed = await api.createAvatarUpload({
        contentType: file.type,
        contentLength: file.size,
      });
      await uploadFileToSignedRequest(file, signed.upload);
      const current = await api.completeAvatarUpload(signed.mediaAsset.id);
      if (onboarding) await api.updateProfile({ onboardingState: 'complete' });
      if (localPreviewUrl.current) {
        URL.revokeObjectURL(localPreviewUrl.current);
        localPreviewUrl.current = null;
      }
      if (current.profile.avatarUrl) {
        setPreview(current.profile.avatarUrl);
      } else {
        localPreviewUrl.current = URL.createObjectURL(file);
        setPreview(localPreviewUrl.current);
      }
      setMessage('Profile photo saved.');
      if (onboarding) router.push('/home');
      else router.refresh();
    } catch {
      setMessage('The photo could not be uploaded. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await createBrowserApiClient().updateProfile({
        onboardingState: 'complete',
      });
      router.push('/home');
    } catch {
      setMessage('Something went wrong. Try again.');
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await createBrowserApiClient().deleteAvatar();
      if (localPreviewUrl.current) {
        URL.revokeObjectURL(localPreviewUrl.current);
        localPreviewUrl.current = null;
      }
      setPreview('');
      setMessage('Profile photo removed.');
      router.refresh();
    } catch {
      setMessage('The photo could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AvatarUploaderView
      preview={preview}
      message={message}
      busy={busy}
      onboarding={onboarding}
      inputRef={input}
      onChoose={() => input.current?.click()}
      onFileChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void upload(file);
      }}
      onRemove={() => void remove()}
      onSkip={() => void skip()}
    />
  );
}

function usePreviewCleanup(previewUrl: RefObject<string | null>): void {
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [previewUrl],
  );
}
