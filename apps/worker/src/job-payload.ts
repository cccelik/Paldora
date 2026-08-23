const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseMediaAssetId(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'mediaAssetId' in data &&
    typeof data.mediaAssetId === 'string' &&
    uuidPattern.test(data.mediaAssetId)
  ) {
    return data.mediaAssetId;
  }
  throw new Error('Invalid delete-media-object job payload.');
}
