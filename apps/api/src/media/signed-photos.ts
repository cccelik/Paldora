import type { MediaAssetRow } from '@paldora/database';
import type { PostMediaView } from '@paldora/validation';
import type { MediaUrlService } from './media-urls.service.js';

export interface OwnedPhoto {
  /** What the photo is shown on: a post or a Life Update. */
  readonly ownerId: string;
  readonly asset: MediaAssetRow;
}

/**
 * Signs already-authorized photos and groups them by what they belong to,
 * keeping the order of `rows`. Photos that are not ready, have no
 * dimensions, or cannot be signed are left out.
 */
export async function signPhotos(
  mediaUrls: MediaUrlService,
  rows: readonly OwnedPhoto[],
): Promise<Map<string, PostMediaView[]>> {
  const signed = await Promise.all(
    rows.map(async ({ ownerId, asset }) => ({
      ownerId,
      asset,
      urls: await mediaUrls.sign(asset),
    })),
  );
  const grouped = new Map<string, PostMediaView[]>();
  for (const { ownerId, asset, urls } of signed) {
    if (!urls || !asset.width || !asset.height) continue;
    const list = grouped.get(ownerId) ?? [];
    list.push({
      id: asset.id,
      width: asset.width,
      height: asset.height,
      ...urls,
    });
    grouped.set(ownerId, list);
  }
  return grouped;
}
