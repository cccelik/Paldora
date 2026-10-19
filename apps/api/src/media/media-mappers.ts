import type { MediaAssetRow } from '@paldora/database';
import type { MediaContentType, MediaPurpose } from '@paldora/domain';
import type { MediaAssetView } from '@paldora/validation';

/** The only shape of an asset that leaves the API: no object keys. */
export function toMediaAssetView(row: MediaAssetRow): MediaAssetView {
  return {
    id: row.id,
    purpose: row.purpose as MediaPurpose,
    status: row.status,
    contentType: row.contentType as MediaContentType,
    contentLength: row.contentLength,
    createdAt: row.createdAt.toISOString(),
  };
}
