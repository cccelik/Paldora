'use client';

import type { LifeUpdate, MediaAssetId } from '@paldora/domain';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import {
  isSupportedImageFile,
  type SupportedImageFile,
} from '../lib/image-upload';
import { uploadLifeUpdatePhotos } from './life-update-composer';

const fields = [
  ['lifeLately', 'Life lately'],
  ['workOrUniversity', 'Work / University'],
  ['travel', 'Travel'],
  ['currentlyInto', 'Currently into'],
  ['listeningTo', 'Listening to'],
  ['watching', 'Watching'],
  ['reading', 'Reading'],
  ['excitedAbout', "Something I'm excited about"],
  ['whatsNext', "What's next"],
] as const;

export function LifeUpdateEditor({ update }: { update: LifeUpdate }) {
  const router = useRouter();
  const [retainedMedia, setRetainedMedia] = useState(
    update.media.map(({ id }) => id),
  );
  const [files, setFiles] = useState<SupportedImageFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const sections = Object.fromEntries(
      fields
        .map(([key]) => [key, String(form.get(key) ?? '').trim()])
        .filter(([, value]) => value),
    );
    const api = createBrowserApiClient();
    let uploaded: MediaAssetId[] = [];
    try {
      uploaded = await uploadLifeUpdatePhotos(api, files);
      await api.updateLifeUpdate(update.id, {
        sections,
        mediaAssetIds: [...retainedMedia, ...uploaded],
      });
      router.push(`/life-updates/${update.id}`);
      router.refresh();
    } catch (cause) {
      await Promise.allSettled(
        uploaded.map((id) => api.cancelLifeUpdateMediaUpload(id)),
      );
      setError(
        cause instanceof Error
          ? cause.message
          : 'The Life Update could not be saved.',
      );
      setBusy(false);
    }
  }

  return (
    <form
      className="life-update-composer form-stack"
      onSubmit={(event) => void submit(event)}
    >
      <p className="life-update-audience-note">
        Audience is locked after publishing. This update remains shared with{' '}
        {update.contexts.map(({ boxName }) => boxName ?? 'Only Me').join(', ')}.
      </p>
      {fields.map(([key, label]) => (
        <label key={key}>
          {label}
          <textarea
            defaultValue={update.sections[key] ?? ''}
            maxLength={2_000}
            name={key}
            rows={3}
          />
        </label>
      ))}
      {update.media.length > 0 && (
        <fieldset>
          <legend>Current photos</legend>
          {update.media.map((media, index) => (
            <label className="life-update-media-choice" key={media.id}>
              <input
                checked={retainedMedia.includes(media.id)}
                onChange={(event) =>
                  setRetainedMedia((current) =>
                    event.target.checked
                      ? [...current, media.id]
                      : current.filter((id) => id !== media.id),
                  )
                }
                type="checkbox"
              />
              Keep photo {index + 1}
            </label>
          ))}
        </fieldset>
      )}
      <label>
        Add photos
        <input
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            const remaining = 4 - retainedMedia.length;
            const selected = Array.from(event.target.files ?? []).slice(
              0,
              remaining,
            );
            if (selected.every(isSupportedImageFile)) setFiles(selected);
            else
              setError(
                'Choose JPEG, PNG, or WebP photos under 10 MB, up to four total.',
              );
          }}
          type="file"
        />
      </label>
      {error && (
        <p className="form-notice error" role="alert">
          {error}
        </p>
      )}
      <button className="button-primary" disabled={busy} type="submit">
        {busy ? 'Saving…' : 'Save Life Update'}
      </button>
    </form>
  );
}
