'use client';

import type { RoomView } from '@paldora/domain';
import { useState } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import {
  isSupportedImageFile,
  uploadFileToSignedRequest,
} from '../lib/image-upload';

export function RoomBannerUploader({
  room,
  onChange,
}: {
  room: RoomView;
  onChange: (room: RoomView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    if (!isSupportedImageFile(file)) {
      setMessage('Choose a JPEG, PNG, or WebP image under 10 MB.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const api = createBrowserApiClient();
    let uploadId:
      | Awaited<
          ReturnType<typeof api.createRoomBannerUpload>
        >['mediaAsset']['id']
      | null = null;
    try {
      const prepared = await api.createRoomBannerUpload({
        contentType: file.type,
        contentLength: file.size,
      });
      uploadId = prepared.mediaAsset.id;
      await uploadFileToSignedRequest(file, prepared.upload);
      onChange(await api.completeRoomBannerUpload(uploadId));
      setMessage('Banner uploaded. Processing may take a moment.');
    } catch (error) {
      if (uploadId)
        await api.cancelRoomBannerUpload(uploadId).catch(() => undefined);
      setMessage(
        error instanceof Error ? error.message : 'Banner upload failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onChange(await createBrowserApiClient().deleteRoomBanner());
      setMessage('Banner removed.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Banner could not be removed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="room-editor-section">
      <h2>Banner</h2>
      <label className="button-secondary room-file-button">
        {busy ? 'Working…' : 'Choose banner'}
        <input
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
          type="file"
        />
      </label>
      {room.bannerMediaId && (
        <button
          className="button-quiet"
          disabled={busy}
          onClick={() => void remove()}
          type="button"
        >
          Remove banner
        </button>
      )}
      {message && (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
