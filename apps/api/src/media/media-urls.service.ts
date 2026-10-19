import { Inject, Injectable } from '@nestjs/common';
import type { MediaAssetRow } from '@paldora/database';
import { SIGNED_READ_TTL_SECONDS } from '@paldora/domain';
import type { Logger } from '@paldora/observability';
import type { ObjectStorage } from '@paldora/storage';
import { LOGGER, OBJECT_STORAGE } from '../platform/tokens.js';

export interface SignedImage {
  readonly url: string;
  readonly thumbnailUrl: string;
}

type ReadyKeys = Pick<
  MediaAssetRow,
  'id' | 'status' | 'displayObjectKey' | 'thumbnailObjectKey'
>;

/**
 * Signs derivative reads. Callers must have authorized the viewer for the
 * asset first; this service only turns an authorized, ready asset into
 * short-lived URLs. Raw uploads and masters are never signed for clients.
 */
@Injectable()
export class MediaUrlService {
  public constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Returns null for assets that are not ready or cannot be signed. */
  public async sign(asset: ReadyKeys | null): Promise<SignedImage | null> {
    if (
      asset?.status !== 'ready' ||
      !asset.displayObjectKey ||
      !asset.thumbnailObjectKey
    ) {
      return null;
    }
    try {
      const [url, thumbnailUrl] = await Promise.all([
        this.storage.createSignedRead(
          asset.displayObjectKey,
          SIGNED_READ_TTL_SECONDS,
        ),
        this.storage.createSignedRead(
          asset.thumbnailObjectKey,
          SIGNED_READ_TTL_SECONDS,
        ),
      ]);
      return { url, thumbnailUrl };
    } catch (error) {
      // A photo that cannot be signed degrades to the initials fallback.
      this.logger.warn(
        { err: error, mediaAssetId: asset.id },
        'signing failed',
      );
      return null;
    }
  }
}
