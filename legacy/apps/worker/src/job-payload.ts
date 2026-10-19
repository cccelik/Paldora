import type { MediaAssetId } from '@paldora/domain';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface MediaJobPayload {
  mediaAssetId: MediaAssetId;
  objectKeys?: string[];
}

export function parseMediaJobPayload(data: unknown): MediaJobPayload {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('mediaAssetId' in data) ||
    typeof data.mediaAssetId !== 'string' ||
    !uuidPattern.test(data.mediaAssetId)
  ) {
    throw new Error('Invalid media job payload.');
  }
  const objectKeys =
    'objectKeys' in data && data.objectKeys !== undefined
      ? data.objectKeys
      : undefined;
  if (
    objectKeys !== undefined &&
    (!Array.isArray(objectKeys) ||
      objectKeys.some((key) => typeof key !== 'string' || key.length === 0))
  ) {
    throw new Error('Invalid media job object keys.');
  }
  return {
    mediaAssetId: data.mediaAssetId as MediaAssetId,
    ...(objectKeys ? { objectKeys } : {}),
  };
}

export function parseMediaAssetId(data: unknown): MediaAssetId {
  return parseMediaJobPayload(data).mediaAssetId;
}
