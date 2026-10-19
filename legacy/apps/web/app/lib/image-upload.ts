import type { MediaAsset } from '@paldora/domain';

export type SupportedImageContentType = MediaAsset['contentType'];
export type SupportedImageFile = File & { type: SupportedImageContentType };
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const supportedImageTypes = new Set<SupportedImageContentType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isSupportedImageContentType(
  value: string,
): value is SupportedImageContentType {
  return supportedImageTypes.has(value as SupportedImageContentType);
}

export function isSupportedImageFile(file: File): file is SupportedImageFile {
  return (
    isSupportedImageContentType(file.type) &&
    file.size > 0 &&
    file.size <= MAX_IMAGE_BYTES
  );
}

export async function uploadFileToSignedRequest(
  file: File,
  upload: {
    url: string;
    headers: Readonly<Record<string, string>>;
  },
  fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  const response = await fetchImplementation(upload.url, {
    method: 'PUT',
    headers: upload.headers,
    body: file,
  });
  if (!response.ok) throw new Error('Signed image upload failed.');
}
