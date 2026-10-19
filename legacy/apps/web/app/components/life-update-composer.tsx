'use client';

import type { Box, MediaAssetId } from '@paldora/domain';
import { useRouter } from 'next/navigation';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import {
  isSupportedImageFile,
  uploadFileToSignedRequest,
  type SupportedImageFile,
} from '../lib/image-upload';

type BrowserApi = ReturnType<typeof createBrowserApiClient>;

const sections = [
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

async function uploadLifeUpdatePhoto(
  api: BrowserApi,
  file: SupportedImageFile,
): Promise<MediaAssetId> {
  const signed = await api.createLifeUpdateMediaUpload({
    contentType: file.type,
    contentLength: file.size,
  });
  try {
    await uploadFileToSignedRequest(file, signed.upload);
    await api.completeLifeUpdateMediaUpload(signed.mediaAsset.id);
    return signed.mediaAsset.id;
  } catch (error) {
    await api.cancelLifeUpdateMediaUpload(signed.mediaAsset.id).catch(() => {});
    throw error;
  }
}

export async function uploadLifeUpdatePhotos(
  api: BrowserApi,
  files: SupportedImageFile[],
): Promise<MediaAssetId[]> {
  const results = await Promise.allSettled(
    files.map((file) => uploadLifeUpdatePhoto(api, file)),
  );
  const uploaded = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (!failed) return uploaded;
  await Promise.allSettled(
    uploaded.map((id) => api.cancelLifeUpdateMediaUpload(id)),
  );
  throw failed.reason;
}

function LifeUpdateAudienceSelector({
  boxes,
  onlyMe,
  setOnlyMe,
  selectedBoxes,
  setSelectedBoxes,
}: {
  boxes: Box[];
  onlyMe: boolean;
  setOnlyMe: Dispatch<SetStateAction<boolean>>;
  selectedBoxes: string[];
  setSelectedBoxes: Dispatch<SetStateAction<string[]>>;
}) {
  const [query, setQuery] = useState('');
  const visibleBoxes = boxes.filter(({ name }) =>
    name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <fieldset>
      <legend>Who should see this?</legend>
      <label className="audience-choice">
        <input
          checked={onlyMe}
          name="audience"
          onChange={(event) => {
            setOnlyMe(event.target.checked);
            if (event.target.checked) setSelectedBoxes([]);
          }}
          type="radio"
        />{' '}
        Only Me
      </label>
      <label className="audience-choice">
        <input
          checked={!onlyMe}
          name="audience"
          onChange={() => setOnlyMe(false)}
          type="radio"
        />{' '}
        Selected Boxes
      </label>
      {!onlyMe && (
        <>
          <label>
            Search your Boxes
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Boxes"
              value={query}
            />
          </label>
          <div className="life-update-box-picker">
            {visibleBoxes.map((box) => (
              <label key={box.id}>
                <input
                  checked={selectedBoxes.includes(box.id)}
                  disabled={
                    !selectedBoxes.includes(box.id) &&
                    selectedBoxes.length >= 20
                  }
                  onChange={(event) =>
                    setSelectedBoxes((current) =>
                      event.target.checked
                        ? [...current, box.id]
                        : current.filter((id) => id !== box.id),
                    )
                  }
                  type="checkbox"
                />{' '}
                <span>{box.name}</span>
              </label>
            ))}
          </div>
          <small>
            {selectedBoxes.length}/20 Boxes selected. Each Box has its own
            private conversation.
          </small>
        </>
      )}
    </fieldset>
  );
}

export function LifeUpdateComposer({ boxes }: { boxes: Box[] }) {
  const router = useRouter();
  const [onlyMe, setOnlyMe] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
  const [files, setFiles] = useState<SupportedImageFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const sectionValues = Object.fromEntries(
      sections
        .map(([key]) => [key, String(form.get(key) ?? '').trim()])
        .filter(([, value]) => value),
    );
    const api = createBrowserApiClient();
    let uploaded: MediaAssetId[] = [];
    try {
      uploaded = await uploadLifeUpdatePhotos(api, files);
      const update = await api.createLifeUpdate({
        audience: onlyMe
          ? { type: 'only_me' }
          : { type: 'boxes', boxIds: selectedBoxes as Box['id'][] },
        sections: sectionValues,
        mediaAssetIds: uploaded,
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
          : 'The Life Update could not be published.',
      );
      setBusy(false);
    }
  }

  return (
    <form
      className="life-update-composer form-stack"
      onSubmit={(event) => void submit(event)}
    >
      <LifeUpdateAudienceSelector
        boxes={boxes}
        onlyMe={onlyMe}
        selectedBoxes={selectedBoxes}
        setOnlyMe={setOnlyMe}
        setSelectedBoxes={setSelectedBoxes}
      />
      {sections.map(([key, label]) => (
        <label key={key}>
          {label}
          <textarea maxLength={2000} name={key} rows={3} />
        </label>
      ))}
      <label>
        Photos
        <input
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []).slice(0, 4);
            if (selected.every(isSupportedImageFile)) setFiles(selected);
            else
              setError(
                'Choose up to four JPEG, PNG, or WebP photos under 10 MB.',
              );
          }}
          type="file"
        />
      </label>
      {files.length > 0 && (
        <p>
          {files.length} {files.length === 1 ? 'photo' : 'photos'} selected
        </p>
      )}
      {error && (
        <p className="form-notice error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button-primary"
        disabled={busy || (!onlyMe && selectedBoxes.length === 0)}
        type="submit"
      >
        {busy ? 'Publishing…' : 'Publish Life Update'}
      </button>
    </form>
  );
}
