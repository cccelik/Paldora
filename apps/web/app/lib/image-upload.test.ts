import { describe, expect, it } from 'vitest';
import {
  isSupportedImageContentType,
  isSupportedImageFile,
  MAX_IMAGE_BYTES,
  uploadFileToSignedRequest,
} from './image-upload';

describe('image upload validation', () => {
  it('shares MIME and byte limits across avatar and post images', () => {
    expect(isSupportedImageContentType('image/webp')).toBe(true);
    expect(isSupportedImageContentType('image/gif')).toBe(false);
    expect(
      isSupportedImageFile({
        type: 'image/png',
        size: MAX_IMAGE_BYTES,
      } as File),
    ).toBe(true);
    expect(
      isSupportedImageFile({
        type: 'image/png',
        size: MAX_IMAGE_BYTES + 1,
      } as File),
    ).toBe(false);
  });

  it('uses one checked transport for signed avatar and post uploads', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const file = { type: 'image/png', size: 12 } as File;
    await uploadFileToSignedRequest(
      file,
      {
        url: 'https://storage.example/upload',
        headers: { 'content-type': 'image/png' },
      },
      ((input, init) => {
        requests.push({ input, ...(init ? { init } : {}) });
        return Promise.resolve(new Response(null, { status: 200 }));
      }) as typeof fetch,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.init).toMatchObject({ method: 'PUT', body: file });

    await expect(
      uploadFileToSignedRequest(
        file,
        { url: 'https://storage.example/upload', headers: {} },
        (() =>
          Promise.resolve(new Response(null, { status: 503 }))) as typeof fetch,
      ),
    ).rejects.toThrow('Signed image upload failed.');
  });
});
