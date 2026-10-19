import {
  MEDIA_CONTENT_TYPES,
  MEDIA_PURPOSE_POLICIES,
  type MediaContentType,
} from '@paldora/domain';

const accepted = new Set<string>(MEDIA_CONTENT_TYPES);

export const AVATAR_ACCEPT = MEDIA_CONTENT_TYPES.join(',');

/** Mirrors the server policy so people hear about a bad file immediately. */
export function avatarFileProblem(
  file: Pick<File, 'type' | 'size'>,
): string | null {
  if (!accepted.has(file.type)) return 'Choose a JPEG, PNG, or WebP photo.';
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > MEDIA_PURPOSE_POLICIES.avatar.maxBytes) {
    return 'Choose a photo up to 10 MB.';
  }
  return null;
}

export const asContentType = (type: string) => type as MediaContentType;

/** PUTs the file to the signed URL with exactly the signed headers. */
export async function putToSignedUrl(
  file: Blob,
  upload: { url: string; headers: Readonly<Record<string, string>> },
  fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<void> {
  const response = await fetchImplementation(upload.url, {
    method: 'PUT',
    headers: upload.headers,
    body: file,
    credentials: 'omit',
  });
  if (!response.ok) throw new Error('Upload rejected by storage.');
}
