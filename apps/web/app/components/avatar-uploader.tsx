'use client';

import { PaldoraApiClient } from '@paldora/api-client';
import type { MediaAsset } from '@paldora/domain';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase/client';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxBytes = 10 * 1024 * 1024;
type AvatarContentType = MediaAsset['contentType'];

function isAvatarContentType(value: string): value is AvatarContentType {
  return allowedTypes.has(value);
}

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

  useEffect(
    () => () => {
      if (localPreviewUrl.current) URL.revokeObjectURL(localPreviewUrl.current);
    },
    [],
  );

  function createApiClient(): PaldoraApiClient {
    const supabase = createSupabaseBrowserClient();
    return new PaldoraApiClient({
      baseUrl:
        process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      },
    });
  }

  async function upload(file: File) {
    if (
      !isAvatarContentType(file.type) ||
      file.size <= 0 ||
      file.size > maxBytes
    ) {
      setMessage('Choose a JPEG, PNG, or WebP image up to 10 MB.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const api = createApiClient();
      const signed = await api.createAvatarUpload({
        contentType: file.type,
        contentLength: file.size,
      });
      const uploaded = await fetch(signed.upload.url, {
        method: 'PUT',
        headers: signed.upload.headers,
        body: file,
      });
      if (!uploaded.ok) throw new Error('upload');
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
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(
          'Avatar upload failed:',
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : 'Unknown error',
        );
      }
      setMessage('The photo could not be uploaded. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await createApiClient().updateProfile({ onboardingState: 'complete' });
      router.push('/home');
    } catch {
      setMessage('Something went wrong. Try again.');
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await createApiClient().deleteAvatar();
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
    <div className="avatar-uploader">
      <button
        className={`avatar-preview ${preview ? 'has-image' : ''}`}
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label="Choose a profile photo"
      >
        {preview ? (
          <img src={preview} alt="Current profile" />
        ) : (
          <span>＋</span>
        )}
      </button>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      <div className="avatar-actions">
        <button
          className="button-secondary"
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Uploading…' : preview ? 'Change photo' : 'Choose photo'}
        </button>
        {preview && !onboarding && (
          <button
            className="button-quiet danger"
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
            Remove
          </button>
        )}
        {onboarding && (
          <button
            className="button-quiet"
            type="button"
            disabled={busy}
            onClick={() => void skip()}
          >
            Skip for now
          </button>
        )}
      </div>
      <p className="field-help" role="status">
        {message || 'JPEG, PNG, or WebP · 10 MB maximum'}
      </p>
    </div>
  );
}
